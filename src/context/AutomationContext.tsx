// 캘린더의 외출·외박 일정/요일별 루틴, 또는 취침 모드 진입을 근거로 지정한 콘센트를 켜고
// 끄는 "자동화 규칙" 엔진. FireSafetyContext와 같은 이유로 네비게이터보다 위(App.tsx)에서
// 한 번만 마운트해서, 자동화 화면을 보고 있지 않을 때도 계속 감시하고 트리거 시각이 되면 그 자리에서
// 바로 실행한다.
//
// 실제 캘린더 API/센서는 없으므로 CalendarContext의 일정 데이터와 RoomsContext의 방/기기 상태를
// 그대로 참조하는 규칙 기반 시뮬레이션이다.
//
// 규칙 자체(트리거/액션/방/활성화 여부)는 backend/app/routers/automation.py의 /automation-rules
// API를 통해 Supabase(automation_rules 테이블)에 저장된다 - trigger/action이 종류가 다양해서
// 백엔드에는 jsonb로 그대로 저장하고, 프런트에서 이 파일의 타입으로 캐스팅해서 쓴다.
import React, { createContext, useContext, useState, useRef, useEffect, ReactNode } from 'react';
import * as api from '../api/client';
import { useCalendar, ScheduleItem } from './CalendarContext';
import { useRooms, Room } from './RoomsContext';
import { useNotifications } from './NotificationsContext';
import { useSleep } from './SleepContext';
import { usePresence } from './PresenceContext';
import { rollbackOnFailure } from '../utils/optimisticUpdate';

const CHECK_INTERVAL_MS = 20000; // 20초마다 모든 규칙의 발동 여부를 검사한다.

// 조명(living-light-01)은 이제 실제 기기로 room.devices에 들어있어서 다른 콘센트와 똑같이
// deviceIds에 그 실제 id를 넣어 고른다 - 예전엔 아직 연동 전이라 이 고정 id로 임시 처리했었다.
// 밝기(brightness) 표시용으로만 이 id를 특별 취급한다(아래 runAction 참고).
const LIGHT_DEVICE_ID = 'living-light-01';

export type AutomationTrigger =
  | { kind: 'away' } // 캘린더 SPECIAL 중 kind='outing'(외출 예정) 또는 'overnight'(외박 일정) 전체 -
  // 자동화 규칙 실행 로직상 "오늘 날짜에 집을 비우는 일정이 있는가"만 볼 뿐 둘을 구분할 필요가
  // 없어서 트리거는 하나로 합쳤다. 캘린더 쪽 kind 태그(outing/overnight) 자체는 그대로 유지된다.
  | { kind: 'routine'; routineId: string } // 특정 DAILY(요일별 루틴) 항목 하나를 참조
  | { kind: 'sleep' } // 취침 모드가 실제로 시작될 때(SleepContext state가 'active'로 바뀌는 순간)
  | { kind: 'presence'; when: 'home' | 'away' }; // 카메라(PresenceContext.isHome)가 재실/외출로
  // "막 바뀐 순간"(edge) - away 트리거(캘린더에 미리 등록한 날짜)와 달리 실시간 감지라 그 자리에서
  // 바로 실행된다. when='home'이면 귀가 감지 시, 'away'면 외출(부재) 감지 시.

// 규칙마다 대상 콘센트/조명(deviceId)을 직접 골라서 켜거나 끈다 - 방 전체 일괄 차단이나 이름 키워드
// 추정("조명"/"에어컨" 등) 대신, 사용자가 체크한 기기에만 정확히 적용된다.
// brightness(0~100)는 deviceIds에 조명(living-light-01)이 포함되고 on===true일 때만 의미가 있는
// 조명 전용 값이다 - 스마트 콘센트는 on/off만 지원하므로 이 값을 쓰지 않는다.
export type AutomationAction = { kind: 'set_power'; deviceIds: string[]; on: boolean; brightness?: number };

export type AutomationRule = {
  id: string;
  trigger: AutomationTrigger;
  executeTime: string; // "HH:MM" - 이 시각에 정확히 실행(트리거 조건도 그날 충족해야 함). sleep 트리거는 사용하지 않음.
  roomId: string;
  action: AutomationAction;
  enabled: boolean;
};

type NewRuleInput = {
  trigger: AutomationTrigger;
  executeTime: string;
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

// executeTime("HH:MM")을 자정 기준 분으로 바꿔서 backend의 offset_minutes 컬럼에 그대로 저장한다
// (스키마를 새로 만들지 않고 기존 정수 컬럼을 재사용 - 값의 의미만 "오프셋"에서 "자정 이후 분"으로 바뀜).
function timeToMinutes(time: string): number {
  const parsed = parseHHMM(time);
  return parsed ? parsed.hour * 60 + parsed.minute : 0;
}
function minutesToTime(totalMinutes: number): string {
  const clamped = ((totalMinutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
}

// 규칙의 트리거 조건이 "오늘" 충족되는지(캘린더에 해당 종류의 일정이 있는지)만 본다 - 정확히 언제
// 실행할지는 이제 규칙 자체의 executeTime이 결정하므로, 그 일정 항목의 시각은 더 이상 보지 않는다.
function hasOccurrenceToday(
  trigger: AutomationTrigger,
  dailyItems: ScheduleItem[],
  specialItems: ScheduleItem[],
  now: Date
): boolean {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  const isAwayToday = specialItems.some(
    (it) => (it.kind === 'outing' || it.kind === 'overnight') && it.date?.year === y && it.date?.month === m && it.date?.day === d
  );

  if (trigger.kind === 'routine') {
    // 외출·외박이 우선한다 - 그날 집을 비운다면 평소 요일별 루틴(예: 저녁 조명 켜기)은 의미가
    // 없으므로 건너뛴다.
    if (isAwayToday) return false;
    const routine = dailyItems.find((it) => it.id === trigger.routineId);
    if (!routine) return false;
    const weekdays = routine.weekdays;
    return !weekdays || weekdays.length === 0 || weekdays.includes(now.getDay());
  }

  return isAwayToday; // trigger.kind === 'away'
}

// 규칙 카드/알림 문구에 쓰는 트리거 설명. 루틴은 삭제될 수 있으므로 그 경우도 처리한다.
export function describeTrigger(trigger: AutomationTrigger, dailyItems: ScheduleItem[]): string {
  if (trigger.kind === 'away') return '외출·외박 일정';
  if (trigger.kind === 'sleep') return '취침 모드';
  if (trigger.kind === 'presence') return trigger.when === 'home' ? '재실 감지' : '외출 감지';
  const routine = dailyItems.find((it) => it.id === trigger.routineId);
  if (!routine) return '삭제된 루틴';
  return routine.label ? `루틴 "${routine.label}"` : '요일별 루틴';
}

// 백엔드는 trigger/action을 느슨한 jsonb(dict)로 저장하므로, 프런트 타입으로 그대로 캐스팅한다.
function fromApiRule(r: api.AutomationRuleOut): AutomationRule {
  return {
    id: String(r.id),
    trigger: r.trigger as unknown as AutomationTrigger,
    executeTime: minutesToTime(r.offset_minutes),
    roomId: String(r.room_id),
    action: r.action as unknown as AutomationAction,
    enabled: r.enabled,
  };
}

// patch에 실제로 들어있는 키만 백엔드 필드명으로 바꿔서 보낸다.
function toApiRulePatch(patch: Partial<NewRuleInput>) {
  const body: { trigger?: AutomationTrigger; offset_minutes?: number; room_id?: number; action?: AutomationAction } = {};
  if ('trigger' in patch) body.trigger = patch.trigger;
  if ('executeTime' in patch && patch.executeTime != null) body.offset_minutes = timeToMinutes(patch.executeTime);
  if ('roomId' in patch && patch.roomId != null) body.room_id = Number(patch.roomId);
  if ('action' in patch) body.action = patch.action;
  return body;
}

export function AutomationProvider({ children }: { children: ReactNode }) {
  const { dailyItems, specialItems } = useCalendar();
  const { rooms, setDevicePowerById } = useRooms();
  const { pushNotification } = useNotifications();
  const { state: sleepState } = useSleep();
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
  const setDevicePowerByIdRef = useRef(setDevicePowerById);
  setDevicePowerByIdRef.current = setDevicePowerById;
  const pushNotificationRef = useRef(pushNotification);
  pushNotificationRef.current = pushNotification;
  const sleepStateRef = useRef(sleepState);
  sleepStateRef.current = sleepState;
  const isHomeRef = useRef(isHome);
  isHomeRef.current = isHome;

  // 이미 실행한 (규칙, 날짜) 조합을 기록해 같은 발동이 하루 안에서 여러 번(매 tick마다) 반복
  // 실행되는 걸 막는다. 렌더와 무관한 값이라 state가 아니라 ref로 둔다.
  const firedKeysRef = useRef<Set<string>>(new Set());
  // 취침 모드 트리거는 "시각"이 아니라 "state가 active로 바뀌는 순간"에 반응한다 - 매 tick(20초)마다
  // 계속 재실행되지 않도록, 직전 tick의 취침 상태를 기억해 "막 active가 된 순간"만 골라낸다.
  const wasSleepActiveRef = useRef(false);
  // presence 트리거도 같은 방식(edge 감지) - 직전 tick의 재실 여부를 기억해 "막 바뀐 순간"만 골라낸다.
  // null = 아직 기준값이 없는 최초 상태 - 앱을 막 켰을 때 PresenceContext의 기본값(isHome=true)을
  // "방금 귀가함"으로 오해해 엉뚱하게 트리거하지 않도록, 첫 tick은 기준값만 잡고 트리거는 건너뛴다.
  const wasHomeRef = useRef<boolean | null>(null);

  // set_power 액션 실행 - 규칙에서 고른 기기(deviceIds)만 정확히 켜거나 끈다.
  const runAction = (room: Room, action: AutomationAction, triggerText: string) => {
    const targets = room.devices.filter((d) => action.deviceIds.includes(d.id));
    targets.forEach((d) => setDevicePowerByIdRef.current(room.id, d.id, action.on));

    // 조명(living-light-01)이 대상이고 켜는 액션이면 밝기까지 알림 문구에 표시한다.
    const names = targets.map((d) =>
      d.id === LIGHT_DEVICE_ID && action.on && action.brightness != null
        ? `${d.name}(밝기 ${action.brightness}%)`
        : d.name
    );

    if (names.length === 0) {
      pushNotificationRef.current('🔁 자동화 실행', `${triggerText}이(가) 실행됐지만, 설정된 기기가 없어요.`);
      return;
    }
    pushNotificationRef.current(
      '🔁 자동화 실행',
      `${triggerText}에 따라 ${names.join(', ')}을(를) ${action.on ? '켰어요' : '껐어요'}.`
    );
  };

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      const nowHHMM = currentHHMM(now);
      const today = dateKey(now);

      // 취침 모드는 "막 active가 된 순간"에만 반응한다 - 규칙 루프 시작 전에 한 번만 계산해서 재사용.
      const isSleepActive = sleepStateRef.current === 'active';
      const justFellAsleep = isSleepActive && !wasSleepActiveRef.current;
      wasSleepActiveRef.current = isSleepActive;

      // presence도 마찬가지로 "막 바뀐 순간"만 - 기준값(wasHomeRef)이 아직 없는 최초 tick에서는
      // 지금 값을 기준으로 잡기만 하고 트리거하지 않는다(위 주석 참고).
      const prevHome = wasHomeRef.current;
      const justArrivedHome = prevHome === false && isHomeRef.current === true;
      const justLeftHome = prevHome === true && isHomeRef.current === false;
      wasHomeRef.current = isHomeRef.current;

      for (const rule of rulesRef.current) {
        if (!rule.enabled) continue;

        if (rule.trigger.kind === 'sleep') {
          if (!justFellAsleep) continue;
          const room = roomsRef.current.find((r) => r.id === rule.roomId);
          if (!room) continue;
          runAction(room, rule.action, '취침 모드');
          continue;
        }

        if (rule.trigger.kind === 'presence') {
          const fired = rule.trigger.when === 'home' ? justArrivedHome : justLeftHome;
          if (!fired) continue;
          const room = roomsRef.current.find((r) => r.id === rule.roomId);
          if (!room) continue;
          runAction(room, rule.action, rule.trigger.when === 'home' ? '재실 감지' : '외출 감지');
          continue;
        }

        if (rule.executeTime !== nowHHMM) continue;
        if (!hasOccurrenceToday(rule.trigger, dailyItemsRef.current, specialItemsRef.current, now)) continue;

        const fireKey = `${rule.id}:${today}`;
        if (firedKeysRef.current.has(fireKey)) continue;
        firedKeysRef.current.add(fireKey);

        const room = roomsRef.current.find((r) => r.id === rule.roomId);
        if (!room) continue;

        const triggerText = describeTrigger(rule.trigger, dailyItemsRef.current);
        runAction(room, rule.action, triggerText);
      }
    }, CHECK_INTERVAL_MS);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const apiRules = await api.getAutomationRules();
        setRules(apiRules.map(fromApiRule));
      } catch (err) {
        console.warn('자동화 규칙 불러오기 실패(백엔드 연결을 확인하세요):', err);
      }
    })();
  }, []);

  const notifySaveFailed = (what: string) =>
    pushNotification('저장 실패', `${what}이(가) 서버에 반영되지 않았어요. 다시 시도해 주세요.`);

  const addRule = (input: NewRuleInput) => {
    api
      .createAutomationRule({
        trigger: input.trigger,
        offset_minutes: timeToMinutes(input.executeTime),
        room_id: Number(input.roomId),
        action: input.action,
        enabled: true,
      })
      .then((created) => setRules((prev) => [...prev, fromApiRule(created)]))
      .catch((err) => {
        console.warn('자동화 규칙 추가 실패:', err);
        notifySaveFailed('자동화 규칙 추가');
      });
  };

  const updateRule = (id: string, patch: Partial<NewRuleInput>) => {
    const prev = rules;
    setRules((p) => p.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    rollbackOnFailure(
      api.updateAutomationRule(Number(id), toApiRulePatch(patch)),
      prev,
      setRules,
      '자동화 규칙 수정',
      () => notifySaveFailed('자동화 규칙 수정')
    );
  };

  const deleteRule = (id: string) => {
    const prev = rules;
    setRules((p) => p.filter((r) => r.id !== id));
    rollbackOnFailure(api.deleteAutomationRule(Number(id)), prev, setRules, '자동화 규칙 삭제', () =>
      notifySaveFailed('자동화 규칙 삭제')
    );
  };

  const toggleRuleEnabled = (id: string) => {
    const prev = rules;
    setRules((p) => p.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)));
    const nextEnabled = !rulesRef.current.find((r) => r.id === id)?.enabled;
    rollbackOnFailure(
      api.updateAutomationRule(Number(id), { enabled: nextEnabled }),
      prev,
      setRules,
      '자동화 규칙 활성화 상태 변경',
      () => notifySaveFailed('자동화 규칙 상태 변경')
    );
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
