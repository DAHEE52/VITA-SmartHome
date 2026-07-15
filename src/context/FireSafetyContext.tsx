// 화재 예방 시스템의 "AI 이상 패턴 감지 + 자동 대응"을 실시간으로 돌리는 Context.
// EnergyHistoryContext와 같은 이유로 네비게이터보다 위(App.tsx)에서 한 번만 마운트해서, 사용자가
// 화재 예방 시스템 화면을 보고 있지 않을 때도 계속 감시하고("즉시 감지"), 감지되면 그 자리에서
// 바로 대응한다: 전원 자동 차단 + 알림 발송, 고위험 기기면 "긴급"으로 올려 119 신고 안내까지 띄운다.
//
// 실제 센서/모델은 없으므로 RoomsContext의 실제 기기 on/off 지속시간을 근거로 판단하는 규칙 기반
// 시뮬레이션이다. 실제로 전화를 자동으로 걸 수는 없고(운영체제가 사용자 확인 없는 자동 발신을 막음),
// "119 신고" 버튼을 누르면 전화 앱이 119가 입력된 채로 열리는 데까지가 이 앱이 할 수 있는 전부다.
import React, { createContext, useContext, useState, useRef, useEffect, ReactNode } from 'react';
import { useRooms } from './RoomsContext';
import { useNotifications } from './NotificationsContext';
import { isAnomalousDevice, isHighRiskDevice } from '../utils/fireRisk';

const CHECK_INTERVAL_MS = 5000; // 5초마다 모든 기기의 이상 패턴 여부를 검사한다.

export type AutoAction = {
  id: string;
  time: string; // "HH:MM:SS" 표시용
  roomLabel: string;
  deviceName: string;
  message: string;
};

export type EmergencyEvent = {
  roomLabel: string;
  deviceName: string;
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
  const { rooms, forceOffDevice } = useRooms();
  const { pushNotification } = useNotifications();

  const [autoActions, setAutoActions] = useState<AutoAction[]>([]);
  const [emergency, setEmergency] = useState<EmergencyEvent | null>(null);

  // setInterval 콜백이 항상 최신 rooms/함수를 보도록 ref로 들고 있는다(타이머를 매번 새로 만들지 않기 위함).
  const roomsRef = useRef(rooms);
  roomsRef.current = rooms;
  const forceOffRef = useRef(forceOffDevice);
  forceOffRef.current = forceOffDevice;
  const pushNotificationRef = useRef(pushNotification);
  pushNotificationRef.current = pushNotification;

  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();

      for (const room of roomsRef.current) {
        for (const device of room.devices) {
          if (!isAnomalousDevice(device, now)) continue;

          // 이상 패턴 감지 → 자동으로 전원 차단.
          forceOffRef.current(room.id, device.name);

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
            setEmergency({ roomLabel: room.label, deviceName: device.name, detectedAt: now });
          }
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
