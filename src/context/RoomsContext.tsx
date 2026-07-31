// 방/기기 데이터를 앱 전체에서 공유하는 Context.
// 원래 SmartHomeControlScreen 안의 지역 state였지만, 실시간 전기요금 미리보기(BillReceiptScreen)에서도
// "지금 켜져 있는 기기가 무엇인지"를 그대로 봐야 하고, GoalContext와 같은 이유로 화면을 오갈 때도
// 값이 유지되어야 하므로 네비게이터보다 위(App.tsx)에서 한 번만 마운트되는 이 Provider로 옮겼다.
//
// 방/기기의 존재 여부·이름·소속(room_id)·on/off 상태는 이제 backend/app/routers/rooms.py의
// /rooms, /devices/{id}, /devices/mock-register, /devices/{id}/control API를 통해 Supabase에
// 저장된다(기기는 실제 ESP32가 스스로 등록하는 구조라, 아직 하드웨어가 없는 지금은 "기기 추가"를
// mock-register로 흉내낸다). 반면 자동/수동 모드·마지막으로 켜진 시각·방 목표 온도는 백엔드
// 스키마에 없는 값이라(화재 예방 시뮬레이션 등 프런트엔드 전용 개념) 기존처럼 AsyncStorage에만 남겨둔다.
import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import * as api from '../api/client';
import { useNotifications } from './NotificationsContext';
import { rollbackOnFailure } from '../utils/optimisticUpdate';

// mode: 'auto'면 센서가 읽은 전원 상태(on)를 그대로 보여주기만 하고, 'manual'이면 센서 고장 등에
// 대비해 사용자가 직접 on/off를 지정한 값이다. 평소엔 전부 'auto'로 시작한다.
export type DeviceMode = 'auto' | 'manual';
// onSince: 이 기기가 마지막으로 켜진 시각(ms, Date.now()) - 꺼져 있으면 null.
// 화재 예방 시스템(FireSafetyContext)이 "이 기기가 얼마나 오래 계속 켜져 있었는지" 판단하는 데 쓴다.
// id: 백엔드 devices.id (예: ESP32가 등록한 값 또는 mock-register가 만든 값) - 서버 API 호출에 쓴다.
// type: 'power_monitor'면 실제 전력 측정값이 있다는 뜻 - 방 설정 화면에서 실시간 W를 조회할지 판단하는 데 쓴다.
// brightness: 밝기 조절이 되는 조명(예: living-light-01)의 현재 밝기(0~100, %) - 백엔드
// devices.state는 on/off만 표현하므로, 실제 숫자 값은 mode/onSince처럼 로컬(extras)에만 둔다.
// 밝기 미지원 기기는 그냥 100(켜짐 기준값)으로 두고 화면에서 안 쓰면 된다.
export type Device = {
  id: string;
  name: string;
  on: boolean;
  mode: DeviceMode;
  onSince: number | null;
  type: api.DeviceType;
  brightness: number;
};
export type Room = { id: string; label: string; devices: Device[] };

// VITA는 원룸(하나의 방) 전용 서비스라 방을 여러 개 만들 필요가 없다 - 항상 방이 정확히 하나만
// 존재하도록 고정하고(없으면 자동 생성), UI에서도 방 추가/삭제를 아예 제공하지 않는다.
const DEFAULT_ROOM_LABEL = 'ROOM';
// 초기 로드 이후 기기 on/off 상태를 백엔드와 다시 맞추는 주기 - 앱의 다른 주기적 조회(20초)와 맞춘다.
// 이게 없으면 Tapo 앱에서 직접 끄거나 명령이 조용히 실패했을 때, 화면이 실제 상태와 어긋난 채로
// 다음 앱 재시작 전까지 계속 남아있었다(모든 상태 변경이 로컬 낙관적 갱신에만 의존했기 때문).
const ROOMS_SYNC_MS = 20000;
// 백엔드에 없는 값(모드/onSince)만 담아두는 로컬 캐시. room id -> device id 로 중첩.
const EXTRAS_STORAGE_KEY = 'vita.rooms.extras.v1';

type ExtrasStore = Record<
  string,
  { devices: Record<string, { mode: DeviceMode; onSince: number | null; brightness: number }> }
>;

type RoomsContextValue = {
  rooms: Room[];
  renameRoom: (id: string, label: string) => void;
  connectDevice: (roomId: string, deviceId: string) => void;
  renameDevice: (roomId: string, deviceId: string, name: string) => void;
  deleteDevice: (roomId: string, deviceId: string) => void;
  toggleDeviceMode: (roomId: string, deviceId: string) => void;
  toggleDevicePower: (roomId: string, deviceId: string) => void;
  setDeviceBrightness: (roomId: string, deviceId: string, brightness: number) => void;
  setDevicePower: (roomId: string, deviceName: string, on: boolean) => void;
  setDevicePowerById: (roomId: string, deviceId: string, on: boolean) => void;
  forceOffDevice: (roomId: string, deviceName: string) => void;
  forceOffRoom: (roomId: string) => void;
};

const RoomsContext = createContext<RoomsContextValue | null>(null);

async function loadExtras(): Promise<ExtrasStore> {
  try {
    const raw = await AsyncStorage.getItem(EXTRAS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    console.warn('방 설정(로컬) 불러오기 실패:', err);
    return {};
  }
}

// 백엔드에서 새로 받아온 기기 상태(on/off)를 기존 로컬 state에 합친다 - mode/brightness처럼 백엔드에
// 없는 값과, 연결 시 중복 방지를 위해 붙인 이름(connectDevice 참고, 백엔드 label에는 반영 안 됨)은
// 로컬 값을 그대로 유지한다. onSince는 "꺼져 있다가 막 켜진" 순간에만 새로 찍어서, 이미 켜져 있던
// 기기의 누적 점등 시간(화재 예방 시스템이 참고)이 리셋되지 않게 한다.
function reconcileDeviceState(prevRooms: Room[], apiRooms: api.RoomWithDevices[]): Room[] {
  return apiRooms.map((r) => {
    const roomId = String(r.id);
    const prevRoom = prevRooms.find((pr) => pr.id === roomId);
    return {
      id: roomId,
      label: r.name,
      devices: r.devices.map((d) => {
        const prevDevice = prevRoom?.devices.find((pd) => pd.id === d.id);
        const nextOn = d.state === 'on';
        const wasOn = prevDevice?.on ?? false;
        return {
          id: d.id,
          name: prevDevice?.name ?? d.label ?? d.id,
          on: nextOn,
          mode: prevDevice?.mode ?? 'auto',
          onSince: nextOn ? (wasOn ? prevDevice!.onSince : Date.now()) : null,
          type: d.type,
          brightness: prevDevice?.brightness ?? 100,
        };
      }),
    };
  });
}

function applyExtras(apiRooms: api.RoomWithDevices[], extras: ExtrasStore): Room[] {
  return apiRooms.map((r) => {
    const roomId = String(r.id);
    const roomExtra = extras[roomId];
    return {
      id: roomId,
      label: r.name,
      devices: r.devices.map((d) => {
        const deviceExtra = roomExtra?.devices?.[d.id];
        return {
          id: d.id,
          name: d.label ?? d.id,
          on: d.state === 'on',
          // 조명(living-light-01)은 자동/수동 개념 없이 항상 수동 취급 - toggleDeviceMode도 이 id는 무시한다.
          mode: d.id === 'living-light-01' ? 'manual' : deviceExtra?.mode ?? 'auto',
          onSince: deviceExtra?.onSince ?? null,
          type: d.type,
          brightness: deviceExtra?.brightness ?? 100,
        };
      }),
    };
  });
}

export function RoomsProvider({ children }: { children: ReactNode }) {
  const [rooms, setRooms] = useState<Room[]>([]);
  // 초기 로딩이 끝나기 전까지는 extras 저장 useEffect를 건너뛴다(로딩 중 빈 배열을 저장해버리는 것 방지).
  const [loaded, setLoaded] = useState(false);
  // 항상 최신 rooms를 읽기 위한 ref - 아래 여러 write 함수가 "지금 이 기기의 backend id가 뭔지"
  // 조회할 때 stale closure 없이 쓰기 위함.
  const roomsRef = useRef<Room[]>(rooms);
  roomsRef.current = rooms;
  const { pushNotification } = useNotifications();

  const notifySaveFailed = (what: string) =>
    pushNotification('저장 실패', `${what}이(가) 서버에 반영되지 않았어요. 다시 시도해 주세요.`);

  useEffect(() => {
    (async () => {
      try {
        const [apiRoomsFetched, extras] = await Promise.all([api.getRooms(), loadExtras()]);
        // 원룸 전용이라 방이 하나도 없으면(최초 설치 등) 자동으로 기본 방을 하나 만들어 항상
        // 정확히 하나의 방만 존재하도록 보장한다 - 사용자가 직접 "방 추가"를 할 필요가 없다.
        const apiRooms =
          apiRoomsFetched.length > 0 ? apiRoomsFetched : [{ ...(await api.createRoom(DEFAULT_ROOM_LABEL)), devices: [] }];
        setRooms(applyExtras(apiRooms, extras));
      } catch (err) {
        console.warn('방 목록 불러오기 실패(백엔드 연결을 확인하세요):', err);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  // 초기 로드 이후에도 기기 on/off 상태를 주기적으로 백엔드와 다시 맞춘다(reconcileDeviceState 참고) -
  // 그 전까지는 이 앱이 보낸 명령을 낙관적으로 믿기만 해서, 다른 경로로 상태가 바뀌면 다음 앱 재시작
  // 전까지 화면이 실제와 어긋난 채로 남을 수 있었다.
  useEffect(() => {
    if (!loaded) return;
    const timer = setInterval(() => {
      api
        .getRooms()
        .then((apiRooms) => setRooms((prev) => reconcileDeviceState(prev, apiRooms)))
        .catch((err) => console.warn('방/기기 상태 재동기화 실패:', err));
    }, ROOMS_SYNC_MS);
    return () => clearInterval(timer);
  }, [loaded]);

  // 백엔드에 없는 값(모드/onSince)만 뽑아서 로컬에 저장 - rooms가 바뀔 때마다.
  useEffect(() => {
    if (!loaded) return;
    const extras: ExtrasStore = {};
    for (const r of rooms) {
      extras[r.id] = {
        devices: Object.fromEntries(
          r.devices.map((d) => [d.id, { mode: d.mode, onSince: d.onSince, brightness: d.brightness }])
        ),
      };
    }
    AsyncStorage.setItem(EXTRAS_STORAGE_KEY, JSON.stringify(extras)).catch((err) =>
      console.warn('방 설정(로컬) 저장 실패:', err)
    );
  }, [rooms, loaded]);

  const renameRoom = (id: string, label: string) => {
    const prev = rooms;
    setRooms((p) => p.map((r) => (r.id === id ? { ...r, label } : r)));
    rollbackOnFailure(api.renameRoom(Number(id), label), prev, setRooms, '방 이름 변경', () =>
      notifySaveFailed('방 이름 변경')
    );
  };

  // 근처에서 통신 중이던 스마트 플러그(이미 부팅되어 서버에 자기소개는 마쳤지만 아직 방에 안 묶인
  // 실기기)를 연결한다. 이름은 일단 기기가 등록 시 보낸 기본 라벨을 그대로 쓰고, 화면에 카드로 나타난
  // 뒤 사용자가 그 카드를 눌러 renameDevice로 원하는 이름을 붙인다.
  // 기본 라벨은 relay_node 등이 다 같은 값("거실 기기 제어" 등)을 보내는 경우가 흔해서, 이 방에 이미
  // 같은 이름의 기기가 있으면 뒤에 기기 id 일부를 붙여 방 안에서 이름이 겹치지 않게 한다 - 아래
  // toggleDeviceMode 등 여러 함수가 기기를 이름으로 찾기 때문에, 이름이 겹치면 엉뚱한 기기가 반응한다.
  const connectDevice = (roomId: string, deviceId: string) => {
    (async () => {
      try {
        const updated = await api.updateDevice(deviceId, { room_id: Number(roomId) });
        const baseName = updated.label ?? updated.id;
        const room = roomsRef.current.find((r) => r.id === roomId);
        const nameTaken = room?.devices.some((d) => d.name === baseName) ?? false;
        const name = nameTaken ? `${baseName} (${deviceId.slice(-4)})` : baseName;

        setRooms((prev) =>
          prev.map((r) =>
            r.id !== roomId
              ? r
              : {
                  ...r,
                  devices: [
                    ...r.devices,
                    {
                      id: updated.id,
                      name,
                      on: updated.state === 'on',
                      mode: 'auto',
                      onSince: null,
                      type: updated.type,
                      brightness: 100,
                    },
                  ],
                }
          )
        );
      } catch (err) {
        console.warn('스마트 플러그 연결 실패:', err);
        notifySaveFailed('스마트 플러그 연결');
      }
    })();
  };

  // 연결된 스마트 플러그(기기) 카드를 눌러 사용자가 직접 붙인 이름으로 바꾼다.
  const renameDevice = (roomId: string, deviceId: string, name: string) => {
    const prev = rooms;
    setRooms((p) =>
      p.map((r) =>
        r.id !== roomId ? r : { ...r, devices: r.devices.map((d) => (d.id === deviceId ? { ...d, name } : d)) }
      )
    );
    rollbackOnFailure(api.updateDevice(deviceId, { name }), prev, setRooms, '기기 이름 변경', () =>
      notifySaveFailed('기기 이름 변경')
    );
  };

  // 방의 기기 목록에서 기기 하나를 제거한다. 기기 자체를 지우는 API는 없으므로(하드웨어는 여전히
  // 존재), room_id를 null로 만들어 "이 방에서 제거"만 표현한다.
  // id로 찾는다 - 이름으로 찾으면 사용자가 두 기기에 같은 이름을 붙였을 때 엉뚱한 기기가 지워질 수 있다.
  const deleteDevice = (roomId: string, deviceId: string) => {
    const prev = rooms;
    setRooms((p) =>
      p.map((r) => (r.id !== roomId ? r : { ...r, devices: r.devices.filter((d) => d.id !== deviceId) }))
    );
    rollbackOnFailure(api.updateDevice(deviceId, { room_id: null }), prev, setRooms, '기기 제거', () =>
      notifySaveFailed('기기 제거')
    );
  };

  // 기기 하나의 자동/수동 모드를 토글한다. 수동으로 바뀌면 그때부터 on 값은 센서가 아니라
  // 사용자가 아래 toggleDevicePower로 직접 정한다. (모드는 백엔드에 없는 프런트 전용 값)
  // id로 찾는다 - 이유는 deleteDevice와 동일(이름 중복 시 오작동 방지).
  const toggleDeviceMode = (roomId: string, deviceId: string) => {
    if (deviceId === 'living-light-01') return; // 조명은 항상 수동 - 전환 UI 자체가 없지만 방어적으로 무시
    setRooms((prev) =>
      prev.map((r) =>
        r.id !== roomId
          ? r
          : {
              ...r,
              devices: r.devices.map((d) =>
                d.id === deviceId ? { ...d, mode: d.mode === 'auto' ? 'manual' : 'auto' } : d
              ),
            }
      )
    );
  };

  // 수동 모드 기기의 ON/OFF를 직접 뒤집는다(자동 모드일 때는 배지가 눌리지 않으므로 호출되지 않음).
  // 켜질 때 onSince를 기록하고, 꺼지면 지운다 - 화재 예방 시스템이 "얼마나 오래 켜져 있었는지" 재는 기준.
  // 실제 릴레이 제어 API(/devices/{id}/control)도 함께 호출한다. id로 찾는다 - 이유는 위와 동일.
  const toggleDevicePower = (roomId: string, deviceId: string) => {
    const device = roomsRef.current.find((r) => r.id === roomId)?.devices.find((d) => d.id === deviceId);
    if (!device) return;
    const nextOn = !device.on;
    const prev = rooms;

    setRooms((p) =>
      p.map((r) =>
        r.id !== roomId
          ? r
          : {
              ...r,
              devices: r.devices.map((d) =>
                d.id === deviceId ? { ...d, on: nextOn, onSince: nextOn ? Date.now() : null } : d
              ),
            }
      )
    );
    rollbackOnFailure(api.controlDevice(device.id, nextOn ? 'on' : 'off'), prev, setRooms, '기기 전원 제어', () =>
      notifySaveFailed('기기 전원 제어')
    );
  };

  // 밝기 조절이 되는 조명(예: living-light-01) 전용 - 0~100 값을 그대로 백엔드에 문자열로 보낸다.
  // 0이면 꺼진 것으로, 그 외에는 켜진 것으로 on을 같이 갱신한다(backend/app/routers/rooms.py의
  // control_device가 하는 낙관적 상태 변환과 동일한 규칙).
  const setDeviceBrightness = (roomId: string, deviceId: string, brightness: number) => {
    const device = roomsRef.current.find((r) => r.id === roomId)?.devices.find((d) => d.id === deviceId);
    if (!device) return;
    const clamped = Math.max(0, Math.min(100, Math.round(brightness)));
    const nextOn = clamped > 0;
    const prev = rooms;

    setRooms((p) =>
      p.map((r) =>
        r.id !== roomId
          ? r
          : {
              ...r,
              devices: r.devices.map((d) =>
                d.id === deviceId
                  ? { ...d, brightness: clamped, on: nextOn, onSince: nextOn ? (d.onSince ?? Date.now()) : null }
                  : d
              ),
            }
      )
    );
    rollbackOnFailure(api.controlDevice(device.id, String(clamped)), prev, setRooms, '조명 밝기 조절', () =>
      notifySaveFailed('조명 밝기 조절')
    );
  };

  // SleepContext(취침 모드 프리셋)가 이름 키워드로 찾은 기기를 켜고 끌 때 쓴다.
  // toggleDevicePower와 달리 on 값을 직접 지정하고, mode는 건드리지 않는다(기존 자동/수동 의미 유지).
  const setDevicePower = (roomId: string, deviceName: string, on: boolean) => {
    const device = roomsRef.current.find((r) => r.id === roomId)?.devices.find((d) => d.name === deviceName);
    const prev = rooms;

    setRooms((p) =>
      p.map((r) =>
        r.id !== roomId
          ? r
          : {
              ...r,
              devices: r.devices.map((d) =>
                d.name === deviceName ? { ...d, on, onSince: on ? Date.now() : null } : d
              ),
            }
      )
    );
    if (device) {
      rollbackOnFailure(api.controlDevice(device.id, on ? 'on' : 'off'), prev, setRooms, '기기 전원 제어', () =>
        notifySaveFailed('기기 전원 제어')
      );
    }
  };

  // 자동화 규칙(AutomationContext)이 규칙에서 고른 기기(deviceId)를 명시적으로 켜고 끌 때 쓴다.
  // setDevicePower와 달리 이름이 아니라 id로 정확히 하나만 찾으므로, 같은 이름을 가진 기기가
  // 여럿이어도 엉뚱한 기기가 반응하지 않는다.
  const setDevicePowerById = (roomId: string, deviceId: string, on: boolean) => {
    const device = roomsRef.current.find((r) => r.id === roomId)?.devices.find((d) => d.id === deviceId);
    const prev = rooms;

    setRooms((p) =>
      p.map((r) =>
        r.id !== roomId
          ? r
          : {
              ...r,
              devices: r.devices.map((d) => (d.id === deviceId ? { ...d, on, onSince: on ? Date.now() : null } : d)),
            }
      )
    );
    if (device) {
      rollbackOnFailure(api.controlDevice(device.id, on ? 'on' : 'off'), prev, setRooms, '기기 전원 제어', () =>
        notifySaveFailed('기기 전원 제어')
      );
    }
  };

  // 화재 예방 시스템이 이상 패턴을 감지했을 때 자동으로 전원을 차단할 때 쓴다(사용자가 누른
  // toggleDevicePower와 구분되는, 시스템이 직접 개입하는 조치). mode도 'manual'로 바꿔서 자동 조치로
  // 꺼졌다는 걸 방 설정 화면에서도 알 수 있게 한다.
  const forceOffDevice = (roomId: string, deviceName: string) => {
    const device = roomsRef.current.find((r) => r.id === roomId)?.devices.find((d) => d.name === deviceName);
    const prev = rooms;

    setRooms((p) =>
      p.map((r) =>
        r.id !== roomId
          ? r
          : {
              ...r,
              devices: r.devices.map((d) =>
                d.name === deviceName ? { ...d, on: false, onSince: null, mode: 'manual' } : d
              ),
            }
      )
    );
    if (device) {
      rollbackOnFailure(api.controlDevice(device.id, 'off'), prev, setRooms, '기기 강제 차단', () =>
        notifySaveFailed('기기 강제 차단')
      );
    }
  };

  // 고온 감지 등 방 전체가 위험하다고 판단됐을 때, 특정 기기 하나가 아니라 그 방의 모든 기기를
  // 한 번에 차단한다(어떤 기기가 원인인지 특정할 수 없는 센서 기반 감지에 쓴다).
  const forceOffRoom = (roomId: string) => {
    const targetDevices = roomsRef.current.find((r) => r.id === roomId)?.devices ?? [];
    // 기기별로 서버 호출이 독립적으로 실패할 수 있으므로, 방 전체를 통째로 롤백하는 대신
    // 실패한 기기만 원래 on 값으로 되돌린다(다른 기기는 성공한 대로 off 유지).
    const prevOnByDeviceId = new Map(targetDevices.map((d) => [d.id, d.on]));

    setRooms((prev) =>
      prev.map((r) =>
        r.id !== roomId
          ? r
          : { ...r, devices: r.devices.map((d) => ({ ...d, on: false, onSince: null, mode: 'manual' as const })) }
      )
    );
    targetDevices.forEach((d) => {
      api.controlDevice(d.id, 'off').catch((err) => {
        console.warn('기기 강제 차단 실패:', err);
        setRooms((prev) =>
          prev.map((r) =>
            r.id !== roomId
              ? r
              : {
                  ...r,
                  devices: r.devices.map((dv) =>
                    dv.id === d.id ? { ...dv, on: prevOnByDeviceId.get(d.id) ?? dv.on } : dv
                  ),
                }
          )
        );
        notifySaveFailed(`${d.name} 강제 차단`);
      });
    });
  };

  return (
    <RoomsContext.Provider
      value={{
        rooms,
        renameRoom,
        connectDevice,
        renameDevice,
        deleteDevice,
        toggleDeviceMode,
        toggleDevicePower,
        setDeviceBrightness,
        setDevicePower,
        setDevicePowerById,
        forceOffDevice,
        forceOffRoom,
      }}
    >
      {children}
    </RoomsContext.Provider>
  );
}

export function useRooms() {
  const ctx = useContext(RoomsContext);
  if (!ctx) throw new Error('useRooms must be used within a RoomsProvider');
  return ctx;
}
