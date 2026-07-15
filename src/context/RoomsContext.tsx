// 방/기기 데이터를 앱 전체에서 공유하는 Context.
// 원래 SmartHomeControlScreen 안의 지역 state였지만, 실시간 전기요금 미리보기(BillReceiptScreen)에서도
// "지금 켜져 있는 기기가 무엇인지"를 그대로 봐야 하고, GoalContext와 같은 이유로 화면을 오갈 때도
// 값이 유지되어야 하므로 네비게이터보다 위(App.tsx)에서 한 번만 마운트되는 이 Provider로 옮겼다.
import React, { createContext, useContext, useState, ReactNode } from 'react';

// mode: 'auto'면 센서가 읽은 전원 상태(on)를 그대로 보여주기만 하고, 'manual'이면 센서 고장 등에
// 대비해 사용자가 직접 on/off를 지정한 값이다. 평소엔 전부 'auto'로 시작한다.
export type DeviceMode = 'auto' | 'manual';
// onSince: 이 기기가 마지막으로 켜진 시각(ms, Date.now()) - 꺼져 있으면 null.
// 화재 예방 시스템(FireSafetyContext)이 "이 기기가 얼마나 오래 계속 켜져 있었는지" 판단하는 데 쓴다.
export type Device = { name: string; on: boolean; mode: DeviceMode; onSince: number | null };
export type Room = { id: string; label: string; devices: Device[] };

export const MAX_ROOMS = 12; // "+" 버튼으로 추가할 수 있는 방의 최대 개수

// 초기 방 목록. 기기는 전부 등록되지 않은 상태(빈 목록)로 초기화하고, 방 설정 창의 "기기 추가"로
// 사용자가 직접 등록해야만 각 방에 기기가 나타난다.
const initialRooms: Room[] = [
  { id: 'room-1', label: 'ROOM 1', devices: [] },
  { id: 'room-2', label: 'ROOM 2', devices: [] },
  { id: 'room-3', label: 'ROOM 3', devices: [] },
];

type RoomsContextValue = {
  rooms: Room[];
  addRoom: () => void;
  renameRoom: (id: string, label: string) => void;
  deleteRoom: (id: string) => void;
  addDevice: (roomId: string, deviceName: string) => void;
  deleteDevice: (roomId: string, deviceName: string) => void;
  toggleDeviceMode: (roomId: string, deviceName: string) => void;
  toggleDevicePower: (roomId: string, deviceName: string) => void;
  forceOffDevice: (roomId: string, deviceName: string) => void;
};

const RoomsContext = createContext<RoomsContextValue | null>(null);

export function RoomsProvider({ children }: { children: ReactNode }) {
  const [rooms, setRooms] = useState<Room[]>(initialRooms);

  const addRoom = () => {
    setRooms((prev) => {
      if (prev.length >= MAX_ROOMS) return prev;
      return [...prev, { id: `room-${Date.now()}`, label: `ROOM ${prev.length + 1}`, devices: [] }];
    });
  };

  const renameRoom = (id: string, label: string) => {
    setRooms((prev) => prev.map((r) => (r.id === id ? { ...r, label } : r)));
  };

  const deleteRoom = (id: string) => {
    setRooms((prev) => prev.filter((r) => r.id !== id));
  };

  // 새 기기를 지정한 방의 기기 목록에 등록한다.
  const addDevice = (roomId: string, deviceName: string) => {
    setRooms((prev) =>
      prev.map((r) =>
        r.id !== roomId
          ? r
          : { ...r, devices: [...r.devices, { name: deviceName, on: false, mode: 'auto', onSince: null }] }
      )
    );
  };

  // 방의 기기 목록에서 기기 하나를 제거한다.
  const deleteDevice = (roomId: string, deviceName: string) => {
    setRooms((prev) =>
      prev.map((r) => (r.id !== roomId ? r : { ...r, devices: r.devices.filter((d) => d.name !== deviceName) }))
    );
  };

  // 기기 하나의 자동/수동 모드를 토글한다. 수동으로 바뀌면 그때부터 on 값은 센서가 아니라
  // 사용자가 아래 toggleDevicePower로 직접 정한다.
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
  const toggleDevicePower = (roomId: string, deviceName: string) => {
    setRooms((prev) =>
      prev.map((r) =>
        r.id !== roomId
          ? r
          : {
              ...r,
              devices: r.devices.map((d) =>
                d.name === deviceName ? { ...d, on: !d.on, onSince: !d.on ? Date.now() : null } : d
              ),
            }
      )
    );
  };

  // 화재 예방 시스템이 이상 패턴을 감지했을 때 자동으로 전원을 차단할 때 쓴다(사용자가 누른
  // toggleDevicePower와 구분되는, 시스템이 직접 개입하는 조치). mode도 'manual'로 바꿔서 자동 조치로
  // 꺼졌다는 걸 방 설정 화면에서도 알 수 있게 한다.
  const forceOffDevice = (roomId: string, deviceName: string) => {
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
        forceOffDevice,
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
