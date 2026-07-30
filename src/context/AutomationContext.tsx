// 캘린더의 외출 예정/외박 일정/요일별 루틴을 근거로 조명(기기 on/off)이나 실내 온도(목표 온도)를
// 자동으로 조절하는 "자동화 규칙" 엔진. FireSafetyContext와 같은 이유로 네비게이터보다 위(App.tsx)에서
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
import { useRooms } from './RoomsContext';
import { useNotifications } from './NotificationsContext';
import { usePresence } from './PresenceContext';
import { rollbackOnFailure } from '../utils/optimisticUpdate';
import { getDeviceType } from '../utils/energy';

const CHECK_INTERVAL_MS = 20000; // 20초마다 모든 규칙의 발동 여부 + 온도 유지 상태를 검사한다.
// 목표 온도 주위로 이 범위 안이면 에어컨/난방을 더 조작하지 않는다(경계값에서 계속 켜졌다 꺼졌다
// 반복하는 걸 막기 위한 완충 구간).
const THERMOSTAT_HYSTERESIS_C = 0.5;

export type AutomationTrigger =
  | { kind: 'outing' } // 캘린더 SPECIAL 중 kind='outing'(외출 예정) 전체
  | { kind: 'overnight' } // 캘린더 SPECIAL 중 kind='overnight'(외박 일정) 전체
  | { kind: 'routine'; routineId: string } // 특정 DAILY(요일별 루틴) 항목 하나를 참조
  | { kind: 'presence' }; // 재실/외출 여부(PresenceContext, 카메라+PIR 융합 결과)가 바뀔 때

export type AutomationAction =
  | { kind: 'light_on' } // 방의 조명류(getDeviceType==='조명') 기기를 전부 켠다
  | { kind: 'light_off' } // 방의 조명류 기기를 전부 끈다
  | { kind: 'power_cut' } // 방에 등록된 기기를 전부 끈다(전원 차단)
  | { kind: 'set_temp'; targetTemp: number }
  | { kind: 'presence_temp'; homeTemp: number; awayTemp: number }; // 재실이면 homeTemp, 외출 중이면 awayTemp

export type AutomationRule = {
  id: string;
  trigger: AutomationTrigger;
  executeTime: string; // "HH:MM" - 이 시각에 정확히 실행(트리거 조건도 그날 충족해야 함). presence 트리거는 사용하지 않음.
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
  if (trigger.kind === 'routine') {
    const routine = dailyItems.find((it) => it.id === trigger.routineId);
    if (!routine) return false;
    const weekdays = routine.weekdays;
    return !weekdays || weekdays.length === 0 || weekdays.includes(now.getDay());
  }

  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  return specialItems.some(
    (it) => it.kind === trigger.kind && it.date?.year === y && it.date?.month === m && it.date?.day === d
  );
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
  const { rooms, setDevicePower, setRoomTargetTemp } = useRooms();
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

  // 이미 실행한 (규칙, 날짜) 조합을 기록해 같은 발동이 하루 안에서 여러 번(매 tick마다) 반복
  // 실행되는 걸 막는다. 렌더와 무관한 값이라 state가 아니라 ref로 둔다.
  const firedKeysRef = useRef<Set<string>>(new Set());
  // 재실/외출 규칙은 "시각"이 아니라 "상태 전환"에 반응해야 하므로, 규칙별로 마지막에 반영한
  // isHome 값을 따로 기록해 실제로 상태가 바뀌었을 때만(그리고 처음 만들었을 때 한 번) 실행한다.
  const presenceAppliedRef = useRef<Map<string, boolean>>(new Map());

  // 실시간 실내 온도(env_sensor 평균) - 아래 온도 유지 루프가 목표 온도와 비교하는 데 쓴다.
  const [currentTemp, setCurrentTemp] = useState<number | null>(null);
  const currentTempRef = useRef(currentTemp);
  currentTempRef.current = currentTemp;

  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      api
        .getHomeSummary()
        .then((s) => {
          if (!cancelled) setCurrentTemp(s.temperature);
        })
        .catch((err) => console.warn('실내 온도 조회 실패:', err));
    };
    poll();
    const timer = setInterval(poll, CHECK_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

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

        if (rule.trigger.kind === 'presence') continue; // presence 트리거는 항상 presence_temp 액션과만 짝지어진다.
        if (rule.executeTime !== nowHHMM) continue;
        if (!hasOccurrenceToday(rule.trigger, dailyItemsRef.current, specialItemsRef.current, now)) continue;

        const fireKey = `${rule.id}:${today}`;
        if (firedKeysRef.current.has(fireKey)) continue;
        firedKeysRef.current.add(fireKey);

        const room = roomsRef.current.find((r) => r.id === rule.roomId);
        if (!room) continue;

        const triggerText = describeTrigger(rule.trigger, dailyItemsRef.current);

        if (rule.action.kind === 'light_on' || rule.action.kind === 'light_off') {
          const on = rule.action.kind === 'light_on';
          const lights = room.devices.filter((d) => getDeviceType(d.name) === '조명');
          lights.forEach((d) => setDevicePowerRef.current(room.id, d.name, on));
          pushNotificationRef.current(
            '🔁 자동화 실행',
            `${triggerText}에 따라 ${room.label}의 조명을 ${on ? '켰어요' : '껐어요'}.`
          );
        } else if (rule.action.kind === 'power_cut') {
          room.devices.forEach((d) => setDevicePowerRef.current(room.id, d.name, false));
          pushNotificationRef.current('🔁 자동화 실행', `${triggerText}에 따라 ${room.label}의 전원을 모두 차단했어요.`);
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

      // 온도 유지 루프 - 목표 온도(room.targetTemp, 수동 스테퍼 또는 위 액션이 설정)와 실내 온도를
      // 비교해서, 자동 모드인 에어컨/난방기기 스마트 플러그를 실제로 켜고 꺼서 목표에 맞춘다.
      // "온도 설정" 액션은 목표 숫자만 바꾸고, 그 목표를 실제로 맞추는 건 이 루프의 역할이다.
      const temp = currentTempRef.current;
      if (temp != null) {
        for (const room of roomsRef.current) {
          const diff = temp - room.targetTemp;
          const aircon = room.devices.find((d) => d.mode === 'auto' && getDeviceType(d.name) === '에어컨');
          const heater = room.devices.find((d) => d.mode === 'auto' && getDeviceType(d.name) === '난방기기');

          if (diff > THERMOSTAT_HYSTERESIS_C) {
            // 목표보다 더움 - 에어컨 가동, 난방 정지
            if (aircon && !aircon.on) setDevicePowerRef.current(room.id, aircon.name, true);
            if (heater && heater.on) setDevicePowerRef.current(room.id, heater.name, false);
          } else if (diff < -THERMOSTAT_HYSTERESIS_C) {
            // 목표보다 추움 - 난방 가동, 에어컨 정지
            if (heater && !heater.on) setDevicePowerRef.current(room.id, heater.name, true);
            if (aircon && aircon.on) setDevicePowerRef.current(room.id, aircon.name, false);
          } else {
            // 완충 구간 안 - 목표 달성으로 보고 둘 다 정지
            if (aircon && aircon.on) setDevicePowerRef.current(room.id, aircon.name, false);
            if (heater && heater.on) setDevicePowerRef.current(room.id, heater.name, false);
          }
        }
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
