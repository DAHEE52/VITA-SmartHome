// 화재 예방 시스템의 "AI 이상 패턴 감지 + 센서 기반 감지 + 자동 대응"을 실시간으로 돌리는 Context.
// EnergyHistoryContext와 같은 이유로 네비게이터보다 위(App.tsx)에서 한 번만 마운트해서, 사용자가
// 화재 예방 시스템 화면을 보고 있지 않을 때도 계속 감시하고("즉시 감지"), 감지되면 그 자리에서
// 바로 대응한다: 전원 자동 차단 + 알림 발송, 고위험이면 "긴급"으로 올려 119 신고 안내까지 띄운다.
//
// 감지는 두 갈래다.
// 1) 기기 이상 패턴: DemoRoomsContext의 실제 기기 on/off 지속시간을 근거로 판단하는 규칙 기반 시뮬레이션.
// 2) 온도/습도 센서: SensorContext가 내놓는 값(지금은 더미, 나중에 실제 센서로 교체될 값)을 기준으로
//    판단 - 고온이면 그 방 전체를 즉시 차단한다(원인 기기를 특정할 수 없으므로).
//
// 실제로 전화를 자동으로 걸 수는 없고(운영체제가 사용자 확인 없는 자동 발신을 막음), "119 신고" 버튼을
// 누르면 전화 앱이 119가 입력된 채로 열리는 데까지가 이 앱이 할 수 있는 전부다.
import React, { createContext, useContext, useState, useRef, useEffect, ReactNode } from 'react';
import { useDemoRooms } from './DemoRoomsContext';
import { useNotifications } from './NotificationsContext';
import { useSensors } from './SensorContext';
import { isAnomalousDevice, isHighRiskDevice, sensorRiskLevel } from '../utils/fireRisk';

const CHECK_INTERVAL_MS = 5000; // 5초마다 모든 기기/센서의 이상 여부를 검사한다.

export type AutoAction = {
  id: string;
  time: string; // "HH:MM:SS" 표시용
  roomLabel: string;
  deviceName: string | null; // 기기 이상 감지면 기기명, 센서(고온) 감지로 방 전체를 차단했으면 null
  message: string;
};

export type EmergencyEvent = {
  roomLabel: string;
  deviceName: string | null;
  reason: string; // 긴급 배너에 그대로 보여줄 사유 문구
  detectedAt: number;
};

type FireSafetyContextValue = {
  autoActions: AutoAction[];
  emergency: EmergencyEvent | null;
  dismissEmergency: () => void;
};

const FireSafetyContext = createContext<FireSafetyContextValue | null>(null);

function formatClock(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function FireSafetyProvider({ children }: { children: ReactNode }) {
  const { rooms, forceOffDevice, forceOffRoom } = useDemoRooms();
  const { pushNotification } = useNotifications();
  const { readings } = useSensors();

  const [autoActions, setAutoActions] = useState<AutoAction[]>([]);
  const [emergency, setEmergency] = useState<EmergencyEvent | null>(null);

  // setInterval 콜백이 항상 최신 값을 보도록 ref로 들고 있는다(타이머를 매번 새로 만들지 않기 위함).
  const roomsRef = useRef(rooms);
  roomsRef.current = rooms;
  const readingsRef = useRef(readings);
  readingsRef.current = readings;
  const forceOffDeviceRef = useRef(forceOffDevice);
  forceOffDeviceRef.current = forceOffDevice;
  const forceOffRoomRef = useRef(forceOffRoom);
  forceOffRoomRef.current = forceOffRoom;
  const pushNotificationRef = useRef(pushNotification);
  pushNotificationRef.current = pushNotification;

  // 센서 기반 "위험" 상태는 값이 계속 위험 범위에 머무는 동안 매 tick(5초)마다 반복 감지되므로,
  // 이미 경보를 울린 방은 위험 상태가 유지되는 동안 다시 차단/알림하지 않고, 위험에서 벗어나야
  // (안전/주의로 돌아와야) 다음 위험 전환에서 다시 울리도록 방별로 기록해 둔다.
  const alertedRoomsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();

      for (const room of roomsRef.current) {
        for (const device of room.devices) {
          if (!isAnomalousDevice(device, now)) continue;

          // 이상 패턴 감지 → 자동으로 전원 차단.
          forceOffDeviceRef.current(room.id, device.name);

          const highRisk = isHighRiskDevice(device.name);
          const message = highRisk
            ? `🚨 "${device.name}"(${room.label}) 장시간 사용이 감지되어 화재 위험으로 판단, 전원을 자동 차단했어요.`
            : `⚡ "${device.name}"(${room.label}) 장시간 사용 패턴이 감지되어 전원을 자동 차단했어요.`;

          pushNotificationRef.current(highRisk ? '🚨 화재 위험 자동 차단' : '⚡ 기기 자동 차단', message);

          setAutoActions((prev) => [
            {
              id: `action-${now}-${room.id}-${device.name}`,
              time: formatClock(new Date(now)),
              roomLabel: room.label,
              deviceName: device.name,
              message,
            },
            ...prev,
          ].slice(0, 20)); // 최근 20건만 보관

          if (highRisk) {
            setEmergency({
              roomLabel: room.label,
              deviceName: device.name,
              reason: `${room.label}의 "${device.name}"에서 장시간 방치로 인한 화재 위험이 감지되어 전원을 자동 차단했어요.`,
              detectedAt: now,
            });
          }
        }

        // 온도/습도 센서 기반 판정. 원인 기기를 특정할 수 없으므로 방 전체를 차단한다.
        const reading = readingsRef.current[room.id];
        const level = sensorRiskLevel(reading);
        if (level === 'danger') {
          if (alertedRoomsRef.current.has(room.id)) continue; // 이미 경보를 울린 뒤 계속 위험 상태 - 반복 실행하지 않음
          alertedRoomsRef.current.add(room.id);

          forceOffRoomRef.current(room.id);

          const reason = `${room.label}의 온도가 비정상적으로 높아(${reading?.temperatureC}°C) 화재 위험으로 판단, 전원을 자동 차단했어요.`;

          pushNotificationRef.current('🚨 화재 위험 자동 차단', reason);

          setAutoActions((prev) => [
            {
              id: `action-${now}-${room.id}-sensor`,
              time: formatClock(new Date(now)),
              roomLabel: room.label,
              deviceName: null,
              message: reason,
            },
            ...prev,
          ].slice(0, 20));

          setEmergency({ roomLabel: room.label, deviceName: null, reason, detectedAt: now });
        } else {
          alertedRoomsRef.current.delete(room.id);
        }
      }
    }, CHECK_INTERVAL_MS);

    return () => clearInterval(timer);
  }, []);

  const dismissEmergency = () => setEmergency(null);

  return (
    <FireSafetyContext.Provider value={{ autoActions, emergency, dismissEmergency }}>
      {children}
    </FireSafetyContext.Provider>
  );
}

export function useFireSafety() {
  const ctx = useContext(FireSafetyContext);
  if (!ctx) throw new Error('useFireSafety must be used within a FireSafetyProvider');
  return ctx;
}
