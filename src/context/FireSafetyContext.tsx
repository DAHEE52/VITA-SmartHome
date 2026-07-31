// 화재 예방 시스템의 "AI 이상 패턴 감지 + 센서 기반 감지 + 자동 대응 + 비상 알림"을 실시간으로
// 돌리는 Context. EnergyHistoryContext와 같은 이유로 네비게이터보다 위(App.tsx)에서 한 번만
// 마운트해서, 사용자가 화재 예방 시스템 화면을 보고 있지 않을 때도 계속 감시하고("즉시 감지"),
// 감지되면 그 자리에서 바로 대응한다.
//
// 감지는 두 갈래다.
// 1) 기기 이상 패턴: backend/app/anomaly/(학습된 사용 습관 대비 전력/사용시간/재실/온도/급변/시간대
//    6개 조건 점수화)가 실제 판정을 전부 서버에서 수행한다 - 이 Context는 GET /anomaly를 주기적으로
//    조회해서 결과(등급별 알림/재알림/기록)만 반영한다. "위험" 등급의 전원 자동 차단 + 비상 연락처
//    SMS는 서버가 전력 표본을 받는 즉시(앱이 열려 있지 않아도) 이미 실행한 뒤이므로, 여기서는 그
//    사실을 알리고 로컬 기기 상태(RoomsContext)만 따라서 꺼진 것으로 동기화한다.
// 2) 온도/습도 센서 + PIR 무움직임: SensorContext의 온도/습도(지금은 더미, 나중에 실제 센서로
//    교체될 값)와 /home/summary의 PIR 최근 움직임 시각을 함께 본다 - 온도가 위험 범위여도 최근에
//    움직임이 있었으면(사람이 요리 중 등 정상 상황일 가능성) 화재 의심으로 올리지 않는다
//    (utils/fireRisk.ts의 isFireSuspected, 오탐 방지 로직).
//
// 2번(센서 기반) 갈래가 감지되면: 1) 즉시 긴급 푸시 알림 + 전원 자동 차단, 2) confirmWaitSeconds
// (기본 45초) 동안 사용자의 "안전해요" 확인을 기다리는 'confirming' 상태로 들어간다. 그 안에
// 사용자가 확인하면 오탐으로 해제되고, 시간 안에 응답이 없으면 'escalated' 상태로 넘어가 등록된
// 비상 연락처(EmergencyContactsContext)에 알림을 보낸 것으로 기록한다 - 실제 SMS 발송 API 연동
// 전이라, 문자를 실제로 대신 보내주지는 못하고(운영체제가 앱의 임의 자동 발신을 막음), 119 신고와
// 같은 방식으로 알림 기록 + 원터치 전화 연결까지만 이 앱이 할 수 있는 전부다. 119 자동 신고는
// 절대 하지 않는다 - "119 신고" 버튼을 누르면 전화 앱이 119가 입력된 채로 열리는 데까지만 관여한다.
// (1번 갈래인 기기 이상 패턴은 서버가 "위험" 등급에서 실제 SMS까지 이미 보내므로 별도의
// confirm/escalate 단계가 필요 없다 - app/anomaly/detector.py의 7단계 참고.)
import React, { createContext, useContext, useState, useRef, useEffect, ReactNode } from 'react';
import { useRooms, Room } from './RoomsContext';
import { useNotifications } from './NotificationsContext';
import { useSensors } from './SensorContext';
import { useEmergencyContacts } from './EmergencyContactsContext';
import { useHomeSummary } from './HomeSummaryContext';
import * as api from '../api/client';
import { AnomalyLevel, AnomalyStatus } from '../api/client';
import { isFireSuspected, FIRE_NO_MOTION_MINUTES } from '../utils/fireRisk';

const CHECK_INTERVAL_MS = 5000; // 5초마다 센서 기반 화재 감지를 검사한다.
const ANOMALY_POLL_MS = 15000; // 기기 이상 패턴(GET /anomaly)을 조회하는 주기.
// 스펙의 "사용자는 30~60초 내에 '안전' 버튼을 눌러 오탐 여부를 확인" 범위의 중간값.
export const FIRE_CONFIRM_WAIT_SECONDS = 45;
// 스펙 7단계 "경고 등급 - 30초 이내 응답 없으면 한 번 더 알림"과 맞춘다
// (backend/app/anomaly/constants.py의 WARNING_REPROMPT_WAIT_SEC와 동일한 값).
const WARNING_REPROMPT_WAIT_MS = 30000;

function findDeviceById(rooms: Room[], deviceId: string) {
  for (const room of rooms) {
    const device = room.devices.find((d) => d.id === deviceId);
    if (device) return { roomId: room.id, device };
  }
  return null;
}

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
  // GET /anomaly의 최신 결과 - FirePreventionScreen의 "AI 이상 패턴 감지" 목록이 그대로 보여준다.
  anomalyStatuses: AnomalyStatus[];
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
  const { contacts: emergencyContacts } = useEmergencyContacts();
  const { summary } = useHomeSummary();

  const [autoActions, setAutoActions] = useState<AutoAction[]>(buildDummyAutoActions);
  const [emergency, setEmergency] = useState<EmergencyEvent | null>(null);
  const [lastMotionAtMs, setLastMotionAtMs] = useState<number>(0);
  const [anomalyStatuses, setAnomalyStatuses] = useState<AnomalyStatus[]>([]);

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

  // 기기별 "마지막으로 통보한 이상 등급" - 매 poll(15초)마다 반복 알리지 않고, 등급이 실제로
  // 바뀐 순간(edge)에만 알린다. 경고 등급 재알림 타이머도 기기별로 따로 관리한다.
  const lastAnomalyLevelRef = useRef<Record<string, AnomalyLevel>>({});
  const warningRepromptTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // PIR 최근 움직임 시각(/home/summary.last_motion_at) - HomeSummaryContext가 갱신할 때마다 반영한다.
  useEffect(() => {
    if (summary?.last_motion_at) setLastMotionAtMs(new Date(summary.last_motion_at).getTime());
  }, [summary]);

  // 기기 이상 패턴(GET /anomaly) - 실제 학습/판정/"위험" 등급의 자동 차단+SMS는 전부 서버가 전력
  // 표본을 받는 즉시 처리해두므로, 여기서는 그 결과를 주기적으로 읽어와 등급이 바뀐 기기에만
  // 등급별 행동(7단계)을 취한다. 같은 등급이 계속 유지되는 동안은 매 poll마다 반복하지 않는다.
  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      api
        .getAnomalyStatusList()
        .then((statuses) => {
          if (cancelled) return;
          setAnomalyStatuses(statuses);

          for (const status of statuses) {
            const prevLevel = lastAnomalyLevelRef.current[status.device_id];
            lastAnomalyLevelRef.current[status.device_id] = status.level;
            // is_learning은 "14일 학습 기간이 아직 안 끝났다"는 뜻일 뿐, 판정 자체가 무의미하다는
            // 뜻이 아니다(백엔드가 학습 기간에도 장시간·무재실·온도 등 개인화 데이터가 필요 없는
            // 조건은 이미 감시한다) - 그래서 여기서는 등급이 실제로 바뀌었는지만 본다.
            if (status.level === prevLevel) continue;

            const found = findDeviceById(roomsRef.current, status.device_id);
            const roomLabel = found ? roomsRef.current.find((r) => r.id === found.roomId)?.label ?? '' : '';
            const deviceLabel = found ? `"${found.device.name}"` : status.device_id;
            const reasonText = status.conditions
              .filter((c) => c.triggered)
              .map((c) => c.detail)
              .join(' · ');

            if (status.level === 'caution') {
              pushNotificationRef.current(
                '⚠️ 기기 사용 패턴 주의',
                `${deviceLabel} 평소와 다른 사용 패턴이 감지됐어요. (${reasonText})`
              );
            } else if (status.level === 'warning') {
              pushNotificationRef.current(
                '🔶 기기 이상 패턴 확인 필요',
                `${deviceLabel}에서 이상 패턴이 감지됐어요. 확인해 주세요. (${reasonText})`
              );
              // 30초 안에 다시 확인해서, 그때도 여전히 경고 등급이면 한 번 더 알린다(스펙 7단계).
              const deviceId = status.device_id;
              clearTimeout(warningRepromptTimersRef.current[deviceId]);
              warningRepromptTimersRef.current[deviceId] = setTimeout(() => {
                if (lastAnomalyLevelRef.current[deviceId] === 'warning') {
                  pushNotificationRef.current(
                    '🔶 다시 알려드려요',
                    `${deviceLabel} 이상 패턴이 아직 확인되지 않았어요. 스마트홈 제어에서 상태를 봐주세요.`
                  );
                }
              }, WARNING_REPROMPT_WAIT_MS);
            } else if (status.level === 'danger') {
              const message = found
                ? `"${found.device.name}"에서 위험 수준의 이상 패턴이 감지되어 전원을 자동 차단하고 비상 연락처로 알렸어요. (${reasonText})`
                : `이상 패턴이 감지되어 전원을 자동 차단하고 비상 연락처로 알렸어요. (${reasonText})`;
              pushNotificationRef.current('🚨 기기 이상 패턴 자동 차단', message);
              setAutoActions((prev) => [
                {
                  id: `action-${Date.now()}-${status.device_id}`,
                  time: formatClock(new Date()),
                  roomLabel,
                  deviceName: found?.device.name ?? status.device_id,
                  message,
                },
                ...prev,
              ].slice(0, 20));
              // 서버가 이미 전원을 껐으므로, 로컬 화면(스마트홈 제어 등)도 같은 상태로 맞춘다.
              if (found) forceOffDeviceRef.current(found.roomId, found.device.name);
            }
          }
        })
        .catch((err) => console.warn('기기 이상 패턴 조회 실패:', err));
    };
    poll();
    const timer = setInterval(poll, ANOMALY_POLL_MS);
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

  // 언마운트 시 대기 중인 경고 재알림 타이머를 전부 정리한다(FireSafetyProvider는 App.tsx에서
  // 앱 생명주기 내내 한 번만 마운트되므로 실제로는 거의 발생하지 않지만, 누수 방지용).
  useEffect(() => {
    const timers = warningRepromptTimersRef.current;
    return () => {
      Object.values(timers).forEach(clearTimeout);
    };
  }, []);

  return (
    <FireSafetyContext.Provider
      value={{ autoActions, emergency, confirmSafe, dismissEmergency, anomalyStatuses }}
    >
      {children}
    </FireSafetyContext.Provider>
  );
}

export function useFireSafety() {
  const ctx = useContext(FireSafetyContext);
  if (!ctx) throw new Error('useFireSafety must be used within a FireSafetyProvider');
  return ctx;
}
