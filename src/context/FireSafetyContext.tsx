// 화재 예방 시스템의 "AI 이상 패턴 감지 + 센서 기반 감지 + 자동 대응 + 비상 알림"을 실시간으로
// 돌리는 Context. EnergyHistoryContext와 같은 이유로 네비게이터보다 위(App.tsx)에서 한 번만
// 마운트해서, 사용자가 화재 예방 시스템 화면을 보고 있지 않을 때도 계속 감시하고("즉시 감지"),
// 감지되면 그 자리에서 바로 대응한다.
//
// 감지는 두 갈래다.
// 1) 기기 이상 패턴: RoomsContext의 실제 기기 on/off 지속시간을 근거로 판단하는 규칙 기반 시뮬레이션.
// 2) 온도/습도 센서 + PIR 무움직임: SensorContext의 온도/습도(지금은 더미, 나중에 실제 센서로
//    교체될 값)와 /home/summary의 PIR 최근 움직임 시각을 함께 본다 - 온도가 위험 범위여도 최근에
//    움직임이 있었으면(사람이 요리 중 등 정상 상황일 가능성) 화재 의심으로 올리지 않는다
//    (utils/fireRisk.ts의 isFireSuspected, 오탐 방지 로직).
//
// 두 갈래 모두 감지되면: 1) 즉시 긴급 푸시 알림 + 전원 자동 차단, 2) confirmWaitSeconds(기본 45초)
// 동안 사용자의 "안전해요" 확인을 기다리는 'confirming' 상태로 들어간다. 그 안에 사용자가 확인하면
// 오탐으로 해제되고, 시간 안에 응답이 없으면 'escalated' 상태로 넘어가 등록된 비상 연락처
// (EmergencyContactsContext)에 알림을 보낸 것으로 기록한다 - 실제 SMS 발송 API 연동 전이라, 문자를
// 실제로 대신 보내주지는 못하고(운영체제가 앱의 임의 자동 발신을 막음), 119 신고와 같은 방식으로
// 알림 기록 + 원터치 전화 연결까지만 이 앱이 할 수 있는 전부다. 119 자동 신고는 절대 하지 않는다 -
// "119 신고" 버튼을 누르면 전화 앱이 119가 입력된 채로 열리는 데까지만 앱이 관여한다.
import React, { createContext, useContext, useState, useRef, useEffect, ReactNode } from 'react';
import { useRooms } from './RoomsContext';
import { useNotifications } from './NotificationsContext';
import { useSensors } from './SensorContext';
import { useEmergencyContacts } from './EmergencyContactsContext';
import * as api from '../api/client';
import {
  isAnomalousDevice,
  isHighRiskDevice,
  isFireSuspected,
  FIRE_NO_MOTION_MINUTES,
} from '../utils/fireRisk';

const CHECK_INTERVAL_MS = 5000; // 5초마다 모든 기기/센서의 이상 여부를 검사한다.
const MOTION_POLL_MS = 10000; // SleepContext와 같은 주기로 /home/summary의 최근 움직임 시각을 갱신한다.
// 스펙의 "사용자는 30~60초 내에 '안전' 버튼을 눌러 오탐 여부를 확인" 범위의 중간값.
export const FIRE_CONFIRM_WAIT_SECONDS = 45;

export type AutoAction = {
  id: string;
  time: string; // "HH:MM:SS" 표시용
  roomLabel: string;
  deviceName: string | null; // 기기 이상 감지면 기기명, 센서(고온) 감지로 방 전체를 차단했으면 null
  message: string;
};

export type EmergencyPhase =
  | 'confirming' // 감지 직후 - 사용자의 "안전해요" 확인을 기다리는 중(카운트다운 진행 중)
  | 'escalated'; // 시간 안에 응답이 없어 비상 연락망에 알림을 보낸 뒤 - 여전히 119 신고는 가능

export type EmergencyEvent = {
  roomLabel: string;
  deviceName: string | null;
  reason: string; // 긴급 배너에 그대로 보여줄 사유 문구
  temperatureC: number | null; // 센서 기반 감지일 때만 값이 있음(비상 연락망 알림 문구에 씀)
  detectedAt: number;
  confirmDeadlineAt: number; // 이 시각까지 응답이 없으면 자동으로 'escalated'로 넘어간다
  phase: EmergencyPhase;
};

type FireSafetyContextValue = {
  autoActions: AutoAction[];
  emergency: EmergencyEvent | null;
  // "안전해요" - 오탐 확인, 경보를 완전히 해제한다(confirming 단계에서만 의미가 있음).
  confirmSafe: () => void;
  // "확인했어요" - escalated 상태의 배너/모달을 닫는다(이미 비상 연락망에 알림을 보낸 뒤).
  dismissEmergency: () => void;
};

const FireSafetyContext = createContext<FireSafetyContextValue | null>(null);

function formatClock(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function FireSafetyProvider({ children }: { children: ReactNode }) {
  const { rooms, forceOffDevice, forceOffRoom } = useRooms();
  const { pushNotification } = useNotifications();
  const { readings, getTemperatureRiseC } = useSensors();
  const { contacts: emergencyContacts } = useEmergencyContacts();

  const [autoActions, setAutoActions] = useState<AutoAction[]>([]);
  const [emergency, setEmergency] = useState<EmergencyEvent | null>(null);
  const [lastMotionAtMs, setLastMotionAtMs] = useState<number>(0);

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
  const emergencyRef = useRef(emergency);
  emergencyRef.current = emergency;
  const emergencyContactsRef = useRef(emergencyContacts);
  emergencyContactsRef.current = emergencyContacts;
  const lastMotionAtMsRef = useRef(lastMotionAtMs);
  lastMotionAtMsRef.current = lastMotionAtMs;

  // 센서 기반 "위험" 상태는 값이 계속 위험 범위에 머무는 동안 매 tick(5초)마다 반복 감지되므로,
  // 이미 경보를 울린 방은 위험 상태가 유지되는 동안 다시 차단/알림하지 않고, 위험에서 벗어나야
  // (안전/주의로 돌아와야) 다음 위험 전환에서 다시 울리도록 방별로 기록해 둔다.
  const alertedRoomsRef = useRef<Set<string>>(new Set());

  // PIR 최근 움직임 시각(/home/summary.last_motion_at) - SleepContext와 동일한 방식으로 갱신한다.
  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      api
        .getHomeSummary()
        .then((summary) => {
          if (cancelled) return;
          if (summary.last_motion_at) setLastMotionAtMs(new Date(summary.last_motion_at).getTime());
        })
        .catch((err) => console.warn('최근 움직임 조회 실패(화재 감지):', err));
    };
    poll();
    const timer = setInterval(poll, MOTION_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  // 새 긴급 상황을 confirming 단계로 등록한다 - 기존에 이미 확인 대기 중인 경보가 있으면 덮어쓰지 않는다
  // (동시에 여러 방에서 감지돼도 사용자는 배너 하나로 먼저 응답하면 됨 - 나머지는 auto action 기록에만 남음).
  const raiseEmergency = (event: Omit<EmergencyEvent, 'confirmDeadlineAt' | 'phase'>) => {
    if (emergencyRef.current) return;
    setEmergency({
      ...event,
      confirmDeadlineAt: event.detectedAt + FIRE_CONFIRM_WAIT_SECONDS * 1000,
      phase: 'confirming',
    });
  };

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
            raiseEmergency({
              roomLabel: room.label,
              deviceName: device.name,
              reason: `${room.label}의 "${device.name}"에서 장시간 방치로 인한 화재 위험이 감지되어 전원을 자동 차단했어요.`,
              temperatureC: null,
              detectedAt: now,
            });
          }
        }

        // 온도/습도 센서 + PIR 무움직임 기반 판정. 원인 기기를 특정할 수 없으므로 방 전체를 차단한다.
        const reading = readingsRef.current[room.id];
        const riseC = getTemperatureRiseCRef.current(room.id);
        const minutesSinceMotion = lastMotionAtMsRef.current
          ? (now - lastMotionAtMsRef.current) / 60000
          : Infinity; // 움직임 기록이 아직 한 번도 없으면 "계속 무움직임"으로 취급한다.

        if (isFireSuspected(reading, riseC, minutesSinceMotion)) {
          if (alertedRoomsRef.current.has(room.id)) continue; // 이미 경보를 울린 뒤 계속 위험 상태 - 반복 실행하지 않음
          alertedRoomsRef.current.add(room.id);

          forceOffRoomRef.current(room.id);

          const reason = `${room.label}에서 화재가 의심돼요 - 현재 온도 ${reading?.temperatureC}°C, ${FIRE_NO_MOTION_MINUTES}분 이상 움직임이 감지되지 않았어요. 전원을 자동 차단했어요.`;

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

          raiseEmergency({
            roomLabel: room.label,
            deviceName: null,
            reason,
            temperatureC: reading?.temperatureC ?? null,
            detectedAt: now,
          });
        } else {
          alertedRoomsRef.current.delete(room.id);
        }
      }

      // confirming 상태로 대기 중인 경보가 시간 안에 응답을 못 받으면 비상 연락망에 알림을 보낸다.
      const current = emergencyRef.current;
      if (current && current.phase === 'confirming' && now >= current.confirmDeadlineAt) {
        const contacts = emergencyContactsRef.current;
        const names = contacts.map((c) => c.name);
        const motionLine =
          current.temperatureC != null
            ? `\n- 위치: ${current.roomLabel}\n- 현재 온도: ${current.temperatureC}°C\n- 사람 움직임: 감지되지 않음`
            : `\n- 위치: ${current.roomLabel}`;
        const contactLine =
          names.length > 0
            ? `비상 연락망(${names.join(', ')})에 알림을 보냈어요.`
            : '등록된 비상 연락처가 없어서 알림을 보내지 못했어요. 안전 가이드북에서 먼저 등록해 주세요.';
        const escalationMessage = `🚨 화재가 의심됩니다.${motionLine}\n\n${FIRE_CONFIRM_WAIT_SECONDS}초간 응답이 없어 ${contactLine}`;

        pushNotificationRef.current('🚨 비상 연락망에 알림 전송', escalationMessage);
        setAutoActions((prev) => [
          {
            id: `action-${now}-escalate`,
            time: formatClock(new Date(now)),
            roomLabel: current.roomLabel,
            deviceName: current.deviceName,
            message: escalationMessage,
          },
          ...prev,
        ].slice(0, 20));
        setEmergency({ ...current, phase: 'escalated' });
      }
    }, CHECK_INTERVAL_MS);

    return () => clearInterval(timer);
  }, []);

  // "안전해요" - confirming 단계에서만 의미가 있다. escalated로 넘어간 뒤에는 이미 비상 연락망에
  // 알림이 나갔으므로, 이 함수 대신 dismissEmergency로 배너만 닫는다.
  const confirmSafe = () => {
    if (emergencyRef.current?.phase !== 'confirming') return;
    setEmergency(null);
    pushNotificationRef.current('✅ 안전 확인됨', '오탐으로 확인되어 화재 경보를 해제했어요.');
  };

  const dismissEmergency = () => setEmergency(null);

  return (
    <FireSafetyContext.Provider value={{ autoActions, emergency, confirmSafe, dismissEmergency }}>
      {children}
    </FireSafetyContext.Provider>
  );
}

export function useFireSafety() {
  const ctx = useContext(FireSafetyContext);
  if (!ctx) throw new Error('useFireSafety must be used within a FireSafetyProvider');
  return ctx;
}
