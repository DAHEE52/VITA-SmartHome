// 캘린더의 외출 예정/외박 일정/요일별 루틴을 근거로 조명(기기 on/off)이나 실내 온도(목표 온도)를
// 자동으로 조절하는 "자동화 규칙" 엔진. FireSafetyContext와 같은 이유로 네비게이터보다 위(App.tsx)에서
// 한 번만 마운트해서, 자동화 화면을 보고 있지 않을 때도 계속 감시하고 트리거 시각이 되면 그 자리에서
// 바로 실행한다.
//
// 규칙 자체(자동화 실행 로직)는 서버 스케줄러 없이 클라이언트에서만 도는 시뮬레이션이다 — CalendarContext는
// 실제 백엔드(schedule_items 테이블)에서 값을 가져오지만, 그 값을 근거로 "언제 무엇을 실행할지" 판단하는
// 이 엔진 자체는 DemoRoomsContext의 방/기기 상태를 그대로 참조하는 규칙 기반 시뮬레이션으로 남겨뒀다.
import React, { createContext, useContext, useState, useRef, useEffect, ReactNode } from 'react';
import { useCalendar, ScheduleItem } from './CalendarContext';
import { useDemoRooms } from './DemoRoomsContext';
import { useNotifications } from './NotificationsContext';
import { usePresence } from './PresenceContext';

const CHECK_INTERVAL_MS = 20000; // 20초마다 모든 규칙의 발동 여부를 검사한다.

export type AutomationTrigger =
  | { kind: 'outing' } // 캘린더 SPECIAL 중 kind='outing'(외출 예정) 전체
  | { kind: 'overnight' } // 캘린더 SPECIAL 중 kind='overnight'(외박 일정) 전체
  | { kind: 'routine'; routineId: string } // 특정 DAILY(요일별 루틴) 항목 하나를 참조
  | { kind: 'presence' }; // 재실/외출 여부(카메라로 판단, 지금은 PresenceContext 시뮬레이션)가 바뀔 때

export type AutomationAction =
  | { kind: 'device_on'; deviceName: string }
  | { kind: 'device_off'; deviceName: string }
  | { kind: 'set_temp'; targetTemp: number }
  | { kind: 'presence_temp'; homeTemp: number; awayTemp: number }; // 재실이면 homeTemp, 외출 중이면 awayTemp

export type AutomationRule = {
  id: string;
  trigger: AutomationTrigger;
  offsetMinutes: number; // 일정 시각보다 몇 분 "전"에 실행할지 (0 = 정시)
  roomId: string;
  action: AutomationAction;
  enabled: boolean;
};

type NewRuleInput = {
  trigger: AutomationTrigger;
  offsetMinutes: number;
  roomId: string;
  action: AutomationAction;
};

type AutomationContextValue = {
  rules: AutomationRule[];
  addRule: (input: NewRuleInput) => void;
  updateRule: (id: string, patch: Partial<NewRuleInput>) => void;
  deleteRule: (id: string) => void;
  toggleRuleEnabled: (id: string) => void;
};

const AutomationContext = createContext<AutomationContextValue | null>(null);

// "HH:MM" 형식만 유효한 시각으로 인정한다(캘린더 화면의 parseTime과 달리, 형식이 안 맞으면
// 기본값으로 눙치지 않고 그냥 발동 대상에서 제외한다).
function parseHHMM(time: string): { hour: number; minute: number } | null {
  const match = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function currentHHMM(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

// 일정 시각에서 offsetMinutes를 뺀 "실행 목표 시각"을 구한다. 자정을 넘어가면 그냥 modulo로만
// 감싸고(전날로 날짜/요일을 재계산하지는 않음) - 이 앱 범위에서는 과설계라 판단해 생략.
function subtractOffset(time: string, offsetMinutes: number): string | null {
  const parsed = parseHHMM(time);
  if (!parsed) return null;
  const total = (((parsed.hour * 60 + parsed.minute - offsetMinutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

type Occurrence = { time: string; occurrenceId: string };

// 규칙의 트리거가 "오늘" 발동할 대상(들)이 있는지 캘린더 데이터에서 찾는다.
function findOccurrences(
  trigger: AutomationTrigger,
  dailyItems: ScheduleItem[],
  specialItems: ScheduleItem[],
  now: Date
): Occurrence[] {
  if (trigger.kind === 'routine') {
    const routine = dailyItems.find((it) => it.id === trigger.routineId);
    if (!routine || !routine.time) return [];
    const weekdays = routine.weekdays;
    const matchesToday = !weekdays || weekdays.length === 0 || weekdays.includes(now.getDay());
    return matchesToday ? [{ time: routine.time, occurrenceId: routine.id }] : [];
  }

  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  return specialItems
    .filter(
      (it) =>
        it.kind === trigger.kind &&
        !!it.time &&
        it.date?.year === y &&
        it.date?.month === m &&
        it.date?.day === d
    )
    .map((it) => ({ time: it.time, occurrenceId: it.id }));
}

// 규칙 카드/알림 문구에 쓰는 트리거 설명. 루틴은 삭제될 수 있으므로 그 경우도 처리한다.
export function describeTrigger(trigger: AutomationTrigger, dailyItems: ScheduleItem[]): string {
  if (trigger.kind === 'outing') return '외출 예정';
  if (trigger.kind === 'overnight') return '외박 일정';
  if (trigger.kind === 'presence') return '재실/외출';
  const routine = dailyItems.find((it) => it.id === trigger.routineId);
  if (!routine) return '삭제된 루틴';
  return routine.label ? `루틴 "${routine.label}"` : '요일별 루틴';
}

export function AutomationProvider({ children }: { children: ReactNode }) {
  const { dailyItems, specialItems } = useCalendar();
  const { rooms, setDevicePower, setRoomTargetTemp } = useDemoRooms();
  const { pushNotification } = useNotifications();
  const { isHome } = usePresence();

  const [rules, setRules] = useState<AutomationRule[]>([]);

  // setInterval 콜백이 항상 최신 값을 보도록 ref로 들고 있는다(FireSafetyContext와 동일한 패턴).
  const dailyItemsRef = useRef(dailyItems);
  dailyItemsRef.current = dailyItems;
  const specialItemsRef = useRef(specialItems);
  specialItemsRef.current = specialItems;
  const roomsRef = useRef(rooms);
  roomsRef.current = rooms;
  const rulesRef = useRef(rules);
  rulesRef.current = rules;
  const setDevicePowerRef = useRef(setDevicePower);
  setDevicePowerRef.current = setDevicePower;
  const setRoomTargetTempRef = useRef(setRoomTargetTemp);
  setRoomTargetTempRef.current = setRoomTargetTemp;
  const pushNotificationRef = useRef(pushNotification);
  pushNotificationRef.current = pushNotification;
  const isHomeRef = useRef(isHome);
  isHomeRef.current = isHome;

  // 이미 실행한 (규칙, 날짜, occurrence, 목표시각) 조합을 기록해 같은 발동이 하루 안에서 여러 번
  // (매 tick마다) 반복 실행되는 걸 막는다. 렌더와 무관한 값이라 state가 아니라 ref로 둔다.
  const firedKeysRef = useRef<Set<string>>(new Set());
  // 재실/외출 규칙은 "시각"이 아니라 "상태 전환"에 반응해야 하므로, 규칙별로 마지막에 반영한
  // isHome 값을 따로 기록해 실제로 상태가 바뀌었을 때만(그리고 처음 만들었을 때 한 번) 실행한다.
  const presenceAppliedRef = useRef<Map<string, boolean>>(new Map());

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      const nowHHMM = currentHHMM(now);
      const today = dateKey(now);

      for (const rule of rulesRef.current) {
        if (!rule.enabled) continue;

        if (rule.trigger.kind === 'presence' && rule.action.kind === 'presence_temp') {
          if (presenceAppliedRef.current.get(rule.id) === isHomeRef.current) continue; // 상태 그대로, 다시 실행할 필요 없음

          const room = roomsRef.current.find((r) => r.id === rule.roomId);
          if (!room) continue;

          presenceAppliedRef.current.set(rule.id, isHomeRef.current);
          const targetTemp = isHomeRef.current ? rule.action.homeTemp : rule.action.awayTemp;
          setRoomTargetTempRef.current(room.id, targetTemp);
          pushNotificationRef.current(
            '🔁 자동화 실행',
            `${isHomeRef.current ? '재실' : '외출'} 감지로 ${room.label}의 목표 온도를 ${targetTemp}°C로 설정했어요.`
          );
          continue;
        }

        const occurrences = findOccurrences(rule.trigger, dailyItemsRef.current, specialItemsRef.current, now);
        for (const occ of occurrences) {
          const targetTime = subtractOffset(occ.time, rule.offsetMinutes);
          if (!targetTime || targetTime !== nowHHMM) continue;

          const fireKey = `${rule.id}:${today}:${occ.occurrenceId}:${targetTime}`;
          if (firedKeysRef.current.has(fireKey)) continue;
          firedKeysRef.current.add(fireKey);

          const room = roomsRef.current.find((r) => r.id === rule.roomId);
          if (!room) continue;

          const triggerText = describeTrigger(rule.trigger, dailyItemsRef.current);

          if (rule.action.kind === 'device_on') {
            setDevicePowerRef.current(room.id, rule.action.deviceName, true);
            pushNotificationRef.current(
              '🔁 자동화 실행',
              `${triggerText}에 따라 ${room.label}의 "${rule.action.deviceName}"을(를) 켰어요.`
            );
          } else if (rule.action.kind === 'device_off') {
            setDevicePowerRef.current(room.id, rule.action.deviceName, false);
            pushNotificationRef.current(
              '🔁 자동화 실행',
              `${triggerText}에 따라 ${room.label}의 "${rule.action.deviceName}"을(를) 껐어요.`
            );
          } else if (rule.action.kind === 'set_temp') {
            setRoomTargetTempRef.current(room.id, rule.action.targetTemp);
            pushNotificationRef.current(
              '🔁 자동화 실행',
              `${triggerText}에 따라 ${room.label}의 목표 온도를 ${rule.action.targetTemp}°C로 설정했어요.`
            );
          }
          // action.kind === 'presence_temp'는 trigger.kind === 'presence' 규칙에서만 쓰이고,
          // 그 경우는 위에서 이미 처리하고 continue하므로 여기까지 오지 않는다.
        }
      }
    }, CHECK_INTERVAL_MS);

    return () => clearInterval(timer);
  }, []);

  const addRule = (input: NewRuleInput) => {
    setRules((prev) => [
      ...prev,
      {
        id: `rule-${Date.now()}`,
        enabled: true,
        trigger: input.trigger,
        offsetMinutes: input.offsetMinutes,
        roomId: input.roomId,
        action: input.action,
      },
    ]);
  };

  const updateRule = (id: string, patch: Partial<NewRuleInput>) => {
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const deleteRule = (id: string) => {
    setRules((prev) => prev.filter((r) => r.id !== id));
  };

  const toggleRuleEnabled = (id: string) => {
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)));
  };

  return (
    <AutomationContext.Provider value={{ rules, addRule, updateRule, deleteRule, toggleRuleEnabled }}>
      {children}
    </AutomationContext.Provider>
  );
}

export function useAutomation() {
  const ctx = useContext(AutomationContext);
  if (!ctx) throw new Error('useAutomation must be used within an AutomationProvider');
  return ctx;
}
