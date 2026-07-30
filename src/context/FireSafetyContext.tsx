// 화재 예방 시스템의 "AI 이상 패턴 감지 + 센서 기반 감지 + 자동 대응"을 실시간으로 돌리는 Context.
// EnergyHistoryContext와 같은 이유로 네비게이터보다 위(App.tsx)에서 한 번만 마운트해서, 사용자가
// 화재 예방 시스템 화면을 보고 있지 않을 때도 계속 감시하고("즉시 감지"), 감지되면 그 자리에서
// 바로 대응한다: 전원 자동 차단 + 알림 발송, 고위험이면 "긴급"으로 올려 119 신고 안내까지 띄운다.
//
// 감지는 두 갈래다.
// 1) 기기 이상 패턴: RoomsContext의 실제 기기 on/off 지속시간을 근거로 판단하는 규칙 기반 시뮬레이션.
// 2) 온도/습도 센서: SensorContext가 내놓는 값(지금은 더미, 나중에 실제 센서로 교체될 값)을 기준으로
//    판단 - 고온이면 그 방 전체를 즉시 차단한다(원인 기기를 특정할 수 없으므로).
//
// 실제로 전화를 자동으로 걸 수는 없고(운영체제가 사용자 확인 없는 자동 발신을 막음), "119 신고" 버튼을
// 누르면 전화 앱이 119가 입력된 채로 열리는 데까지가 이 앱이 할 수 있는 전부다.
import React, { createContext, useContext, useState, useRef, useEffect, ReactNode } from 'react';
import { useRooms } from './RoomsContext';
import { useNotifications } from './NotificationsContext';
import { useSensors } from './SensorContext';
import { isAnomalousDevice, isHighRiskDevice, sensorRiskLevel, temperatureRiseRisk } from '../utils/fireRisk';

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

// FirePreventionScreen의 "자동 대응 기록"이 빈 화면으로 보이지 않도록 채우는 더미 데이터. 이
// Context도 EnergyHistoryContext처럼 백엔드에 저장되지 않는 순수 프런트 시뮬레이션이라, 실제
// 이력을 쌓으려면 화면 안의 "화재 상황 시뮬레이션" 버튼으로 직접 위험 상태를 만들어야 한다 -
// 데모에서 바로 보이도록 오늘 있었던 것처럼 보이는 기록 몇 건을 오늘 이른 시간대로 미리 채워둔다.
// 실제 감지가 새로 발생하면 이 더미 위에 최신순으로 쌓인다(setAutoActions가 항상 배열 맨 앞에 추가).
function buildDummyAutoActions(): AutoAction[] {
  const today = new Date();
  const at = (h: number, m: number, s: number) => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate(), h, m, s);
    return formatClock(d);
  };
  return [
    {
      id: 'dummy-action-4',
      time: at(7, 42, 18),
      roomLabel: 'ROOM',
      deviceName: null,
      message: 'ROOM의 온도가 5분 사이 6.2℃ 급상승해 화재 위험으로 판단, 전원을 자동 차단했어요.',
    },
    {
      id: 'dummy-action-3',
      time: at(6, 10, 5),
      roomLabel: 'ROOM',
      deviceName: '히터',
      message: '🚨 "히터"(ROOM) 장시간 사용이 감지되어 화재 위험으로 판단, 전원을 자동 차단했어요.',
    },
    {
      id: 'dummy-action-2',
      time: at(1, 27, 40),
      roomLabel: 'ROOM',
      deviceName: '선풍기',
      message: '⚡ "선풍기"(ROOM) 장시간 사용 패턴이 감지되어 전원을 자동 차단했어요.',
    },
    {
      id: 'dummy-action-1',
      time: at(0, 15, 52),
      roomLabel: 'ROOM',
      deviceName: '기기 제어 1',
      message: '⚡ "기기 제어 1"(ROOM) 장시간 사용 패턴이 감지되어 전원을 자동 차단했어요.',
    },
    // 시간 역순(최신이 배열 맨 앞)으로 정렬해서, 실제 감지 로직이 새 항목을 앞에 붙이는 규칙과 맞춘다.
  ].sort((a, b) => (a.time < b.time ? 1 : -1));
}

export function FireSafetyProvider({ children }: { children: ReactNode }) {
  const { rooms, forceOffDevice, forceOffRoom } = useRooms();
  const { pushNotification } = useNotifications();
  const { readings, getTemperatureRiseC } = useSensors();

  const [autoActions, setAutoActions] = useState<AutoAction[]>(buildDummyAutoActions);
  const [emergency, setEmergency] = useState<EmergencyEvent | null>(null);

  // setInterval 콜백이 항상 최신 값을 보도록 ref로 들고 있는다(타이머를 매번 새로 만들지 않기 위함).
  const roomsRef = useRef(rooms);
  roomsRef.current = rooms;
  const readingsRef = useRef(readings);
  readingsRef.current = readings;
  const getTemperatureRiseCRef = useRef(getTemperatureRiseC);
  getTemperatureRiseCRef.current = getTemperatureRiseC;
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
        // 절대 온도 임계치 외에, 5분 내 급격한 온도 상승(temperatureRiseRisk)도 같은 비중으로 취급한다.
        const reading = readingsRef.current[room.id];
        const riseC = getTemperatureRiseCRef.current(room.id);
        const level = sensorRiskLevel(reading);
        const riseLevel = temperatureRiseRisk(riseC);
        if (level === 'danger' || riseLevel === 'danger') {
          if (alertedRoomsRef.current.has(room.id)) continue; // 이미 경보를 울린 뒤 계속 위험 상태 - 반복 실행하지 않음
          alertedRoomsRef.current.add(room.id);

          forceOffRoomRef.current(room.id);

          const reason =
            riseLevel === 'danger'
              ? `${room.label}의 온도가 5분 사이 ${riseC.toFixed(1)}℃ 급상승해 화재 위험으로 판단, 전원을 자동 차단했어요.`
              : `${room.label}의 온도가 비정상적으로 높아(${reading?.temperatureC}°C) 화재 위험으로 판단, 전원을 자동 차단했어요.`;

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
