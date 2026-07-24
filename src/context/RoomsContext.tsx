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

// mode: 'auto'면 센서가 읽은 전원 상태(on)를 그대로 보여주기만 하고, 'manual'이면 센서 고장 등에
// 대비해 사용자가 직접 on/off를 지정한 값이다. 평소엔 전부 'auto'로 시작한다.
export type DeviceMode = 'auto' | 'manual';
// onSince: 이 기기가 마지막으로 켜진 시각(ms, Date.now()) - 꺼져 있으면 null.
// 화재 예방 시스템(FireSafetyContext)이 "이 기기가 얼마나 오래 계속 켜져 있었는지" 판단하는 데 쓴다.
// id: 백엔드 devices.id (예: ESP32가 등록한 값 또는 mock-register가 만든 값) - 서버 API 호출에 쓴다.
export type Device = { id: string; name: string; on: boolean; mode: DeviceMode; onSince: number | null };
// targetTemp: 이 방의 목표 온도(°C) - 사용자가 방 설정에서 직접 조정하거나, 자동화 규칙
// (AutomationContext)이 외출/외박/루틴 일정에 맞춰 자동으로 바꿀 수 있다.
export type Room = { id: string; label: string; devices: Device[]; targetTemp: number };

export const MAX_ROOMS = 12; // "+" 버튼으로 추가할 수 있는 방의 최대 개수
const DEFAULT_TARGET_TEMP = 24;
// 백엔드에 없는 값(모드/onSince/목표온도)만 담아두는 로컬 캐시. room id -> device id 로 중첩.
const EXTRAS_STORAGE_KEY = 'vita.rooms.extras.v1';

type ExtrasStore = Record<
  string,
  { targetTemp: number; devices: Record<string, { mode: DeviceMode; onSince: number | null }> }
>;

type RoomsContextValue = {
  rooms: Room[];
  addRoom: () => void;
  renameRoom: (id: string, label: string) => void;
  deleteRoom: (id: string) => void;
  addDevice: (roomId: string, deviceName: string) => void;
  deleteDevice: (roomId: string, deviceName: string) => void;
  toggleDeviceMode: (roomId: string, deviceName: string) => void;
  toggleDevicePower: (roomId: string, deviceName: string) => void;
  setDevicePower: (roomId: string, deviceName: string, on: boolean) => void;
  forceOffDevice: (roomId: string, deviceName: string) => void;
  forceOffRoom: (roomId: string) => void;
  setRoomTargetTemp: (roomId: string, temp: number) => void;
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

function applyExtras(apiRooms: api.RoomWithDevices[], extras: ExtrasStore): Room[] {
  return apiRooms.map((r) => {
    const roomId = String(r.id);
    const roomExtra = extras[roomId];
    return {
      id: roomId,
      label: r.name,
      targetTemp: roomExtra?.targetTemp ?? DEFAULT_TARGET_TEMP,
      devices: r.devices.map((d) => {
        const deviceExtra = roomExtra?.devices?.[d.id];
        return {
          id: d.id,
          name: d.label ?? d.id,
          on: d.state === 'on',
          mode: deviceExtra?.mode ?? 'auto',
          onSince: deviceExtra?.onSince ?? null,
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

  useEffect(() => {
    (async () => {
      try {
        const [apiRooms, extras] = await Promise.all([api.getRooms(), loadExtras()]);
        setRooms(applyExtras(apiRooms, extras));
      } catch (err) {
        console.warn('방 목록 불러오기 실패(백엔드 연결을 확인하세요):', err);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  // 백엔드에 없는 값(모드/onSince/목표온도)만 뽑아서 로컬에 저장 - rooms가 바뀔 때마다.
  useEffect(() => {
    if (!loaded) return;
    const extras: ExtrasStore = {};
    for (const r of rooms) {
      extras[r.id] = {
        targetTemp: r.targetTemp,
        devices: Object.fromEntries(r.devices.map((d) => [d.id, { mode: d.mode, onSince: d.onSince }])),
      };
    }
    AsyncStorage.setItem(EXTRAS_STORAGE_KEY, JSON.stringify(extras)).catch((err) =>
      console.warn('방 설정(로컬) 저장 실패:', err)
    );
  }, [rooms, loaded]);

  const addRoom = () => {
    if (roomsRef.current.length >= MAX_ROOMS) return;
    const label = `ROOM ${roomsRef.current.length + 1}`;
    api
      .createRoom(label)
      .then((created) => {
        setRooms((prev) => [
          ...prev,
          { id: String(created.id), label: created.name, devices: [], targetTemp: DEFAULT_TARGET_TEMP },
        ]);
      })
      .catch((err) => console.warn('방 추가 실패:', err));
  };

  const renameRoom = (id: string, label: string) => {
    setRooms((prev) => prev.map((r) => (r.id === id ? { ...r, label } : r)));
    api.renameRoom(Number(id), label).catch((err) => console.warn('방 이름 변경 실패:', err));
  };

  const deleteRoom = (id: string) => {
    setRooms((prev) => prev.filter((r) => r.id !== id));
    api.deleteRoom(Number(id)).catch((err) => console.warn('방 삭제 실패:', err));
  };

  // 새 기기를 지정한 방의 기기 목록에 등록한다. 실제 ESP32가 없으니 mock-register로 하드웨어의
  // register 호출을 흉내낸 뒤, 곧바로 이 방(room_id)에 배정한다.
  const addDevice = (roomId: string, deviceName: string) => {
    (async () => {
      try {
        const created = await api.mockRegisterDevice(deviceName);
        await api.updateDevice(created.id, { room_id: Number(roomId) });
        setRooms((prev) =>
          prev.map((r) =>
            r.id !== roomId
              ? r
              : { ...r, devices: [...r.devices, { id: created.id, name: deviceName, on: false, mode: 'auto', onSince: null }] }
          )
        );
      } catch (err) {
        console.warn('기기 추가 실패:', err);
      }
    })();
  };

  // 방의 기기 목록에서 기기 하나를 제거한다. 기기 자체를 지우는 API는 없으므로(하드웨어는 여전히
  // 존재), room_id를 null로 만들어 "이 방에서 제거"만 표현한다.
  const deleteDevice = (roomId: string, deviceName: string) => {
    const device = roomsRef.current.find((r) => r.id === roomId)?.devices.find((d) => d.name === deviceName);
    setRooms((prev) =>
      prev.map((r) => (r.id !== roomId ? r : { ...r, devices: r.devices.filter((d) => d.name !== deviceName) }))
    );
    if (device) {
      api.updateDevice(device.id, { room_id: null }).catch((err) => console.warn('기기 제거 실패:', err));
    }
  };

  // 기기 하나의 자동/수동 모드를 토글한다. 수동으로 바뀌면 그때부터 on 값은 센서가 아니라
  // 사용자가 아래 toggleDevicePower로 직접 정한다. (모드는 백엔드에 없는 프런트 전용 값)
  const toggleDeviceMode = (roomId: string, deviceName: string) => {
    setRooms((prev) =>
      prev.map((r) =>
        r.id !== roomId
          ? r
          : {
              ...r,
              devices: r.devices.map((d) =>
                d.name === deviceName ? { ...d, mode: d.mode === 'auto' ? 'manual' : 'auto' } : d
              ),
            }
      )
    );
  };

  // 수동 모드 기기의 ON/OFF를 직접 뒤집는다(자동 모드일 때는 배지가 눌리지 않으므로 호출되지 않음).
  // 켜질 때 onSince를 기록하고, 꺼지면 지운다 - 화재 예방 시스템이 "얼마나 오래 켜져 있었는지" 재는 기준.
  // 실제 릴레이 제어 API(/devices/{id}/control)도 함께 호출한다.
  const toggleDevicePower = (roomId: string, deviceName: string) => {
    const device = roomsRef.current.find((r) => r.id === roomId)?.devices.find((d) => d.name === deviceName);
    if (!device) return;
    const nextOn = !device.on;

    setRooms((prev) =>
      prev.map((r) =>
        r.id !== roomId
          ? r
          : {
              ...r,
              devices: r.devices.map((d) =>
                d.name === deviceName ? { ...d, on: nextOn, onSince: nextOn ? Date.now() : null } : d
              ),
            }
      )
    );
    api.controlDevice(device.id, nextOn ? 'on' : 'off').catch((err) => console.warn('기기 전원 제어 실패:', err));
  };

  // 자동화 규칙(AutomationContext)이 외출/외박/루틴 일정에 맞춰 기기를 명시적으로 켜고 끌 때 쓴다.
  // toggleDevicePower와 달리 on 값을 직접 지정하고, mode는 건드리지 않는다(기존 자동/수동 의미 유지).
  const setDevicePower = (roomId: string, deviceName: string, on: boolean) => {
    const device = roomsRef.current.find((r) => r.id === roomId)?.devices.find((d) => d.name === deviceName);

    setRooms((prev) =>
      prev.map((r) =>
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
      api.controlDevice(device.id, on ? 'on' : 'off').catch((err) => console.warn('기기 전원 제어 실패:', err));
    }
  };

  // 화재 예방 시스템이 이상 패턴을 감지했을 때 자동으로 전원을 차단할 때 쓴다(사용자가 누른
  // toggleDevicePower와 구분되는, 시스템이 직접 개입하는 조치). mode도 'manual'로 바꿔서 자동 조치로
  // 꺼졌다는 걸 방 설정 화면에서도 알 수 있게 한다.
  const forceOffDevice = (roomId: string, deviceName: string) => {
    const device = roomsRef.current.find((r) => r.id === roomId)?.devices.find((d) => d.name === deviceName);

    setRooms((prev) =>
      prev.map((r) =>
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
      api.controlDevice(device.id, 'off').catch((err) => console.warn('기기 강제 차단 실패:', err));
    }
  };

  // 고온 감지 등 방 전체가 위험하다고 판단됐을 때, 특정 기기 하나가 아니라 그 방의 모든 기기를
  // 한 번에 차단한다(어떤 기기가 원인인지 특정할 수 없는 센서 기반 감지에 쓴다).
  const forceOffRoom = (roomId: string) => {
    const targetDevices = roomsRef.current.find((r) => r.id === roomId)?.devices ?? [];

    setRooms((prev) =>
      prev.map((r) =>
        r.id !== roomId
          ? r
          : { ...r, devices: r.devices.map((d) => ({ ...d, on: false, onSince: null, mode: 'manual' as const })) }
      )
    );
    targetDevices.forEach((d) => {
      api.controlDevice(d.id, 'off').catch((err) => console.warn('기기 강제 차단 실패:', err));
    });
  };

  // 방의 목표 온도를 지정한다(사용자가 방 설정에서 직접, 또는 자동화 규칙이 자동으로).
  // 백엔드에 없는 값이라 로컬(extras)에만 저장된다.
  const setRoomTargetTemp = (roomId: string, temp: number) => {
    setRooms((prev) => prev.map((r) => (r.id !== roomId ? r : { ...r, targetTemp: temp })));
  };

  return (
    <RoomsContext.Provider
      value={{
        rooms,
        addRoom,
        renameRoom,
        deleteRoom,
        addDevice,
        deleteDevice,
        toggleDeviceMode,
        toggleDevicePower,
        setDevicePower,
        forceOffDevice,
        forceOffRoom,
        setRoomTargetTemp,
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
