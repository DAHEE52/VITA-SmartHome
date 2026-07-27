// 캘린더(DAILY/SPECIAL) 일정을 앱 전체에서 공유하는 Context.
// 원래 CalendarScreen 안의 지역 state였지만, 자동화 규칙 화면(AutomationContext/AutomationScreen)이
// "어떤 외출/외박/루틴 일정이 등록돼 있는지"를 그대로 참조해야 해서 RoomsContext/GoalContext와 같은
// 이유로 네비게이터보다 위(App.tsx)에서 한 번만 마운트되는 Provider로 옮겼다.
//
// 일정은 backend/app/routers/schedule.py의 /schedule/daily, /schedule/special, /schedule/{id}
// API를 통해 Supabase(schedule_items 테이블)에 저장된다. RoomsContext와 같은 패턴으로 마운트 시
// 한 번 불러오고, 이후 변경은 로컬 state를 낙관적으로 갱신한 뒤 백엔드에도 반영한다.
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import * as api from '../api/client';

// date는 SPECIAL 항목에서만 쓰는 연/월/일 값 - DAILY는 매일(또는 특정 요일) 반복이라 날짜가 필요 없다.
export type ScheduleDate = { year: number; month: number; day: number };

// kind: SPECIAL 항목의 유형. 'general'(기본, 그냥 일정) / 'outing'(외출 예정) / 'overnight'(외박 일정).
// 자동화 규칙이 "외출 예정"/"외박 일정"을 트리거로 참조할 때 이 값으로 골라낸다.
export type SpecialKind = 'general' | 'outing' | 'overnight';

// weekdays: DAILY(루틴) 항목이 반복되는 요일(0=일 ~ 6=토). undefined이거나 비어있으면 기존과 동일하게
// "매일" 반복. 특정 요일만 담으면 "요일별 루틴"이 된다.
export type ScheduleItem = {
  id: string;
  time: string;
  label: string;
  date?: ScheduleDate;
  kind?: SpecialKind;
  weekdays?: number[];
};

// 새로 추가할 항목의 입력값 - id는 백엔드가 생성해 주므로 여기엔 없다.
export type NewScheduleItemInput = Omit<ScheduleItem, 'id'>;

type CalendarContextValue = {
  dailyItems: ScheduleItem[];
  specialItems: ScheduleItem[];
  addDailyItem: (item: NewScheduleItemInput) => void;
  addSpecialItem: (item: NewScheduleItemInput) => void;
  updateDailyItem: (id: string, patch: Partial<NewScheduleItemInput>) => void;
  updateSpecialItem: (id: string, patch: Partial<NewScheduleItemInput>) => void;
  removeDailyItem: (id: string) => void;
  removeSpecialItem: (id: string) => void;
};

const CalendarContext = createContext<CalendarContextValue | null>(null);

function fromApi(item: api.ScheduleItemOut): ScheduleItem {
  return {
    id: String(item.id),
    time: item.time,
    label: item.label,
    date: item.date ?? undefined,
    kind: item.kind ?? undefined,
    weekdays: item.weekdays ?? undefined,
  };
}

// patch 객체에 실제로 들어있는 키만 백엔드에 보낸다(전달 안 된 필드는 그대로 유지되도록).
// weekdays/date는 "매일로 되돌리기"/"날짜 없음"처럼 undefined가 곧 "지운다"는 뜻으로도 쓰이는데,
// JSON.stringify는 undefined 값의 키를 통째로 빼버리므로 null로 바꿔서 명시적으로 보낸다.
function toApiPatch(patch: Partial<NewScheduleItemInput>) {
  const body: { time?: string; label?: string; kind?: SpecialKind; date?: ScheduleDate | null; weekdays?: number[] | null } = {};
  if ('time' in patch) body.time = patch.time;
  if ('label' in patch) body.label = patch.label;
  if ('kind' in patch) body.kind = patch.kind;
  if ('date' in patch) body.date = patch.date ?? null;
  if ('weekdays' in patch) body.weekdays = patch.weekdays ?? null;
  return body;
}

export function CalendarProvider({ children }: { children: ReactNode }) {
  // 사전 등록된 예시 데이터 없이 빈 상태로 시작한다 - 항목은 전부 캘린더 화면의 + 버튼으로 추가한 것만 남는다.
  const [dailyItems, setDailyItems] = useState<ScheduleItem[]>([]);
  const [specialItems, setSpecialItems] = useState<ScheduleItem[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [daily, special] = await Promise.all([api.getDailyItems(), api.getSpecialItems()]);
        setDailyItems(daily.map(fromApi));
        setSpecialItems(special.map(fromApi));
      } catch (err) {
        console.warn('캘린더 일정 불러오기 실패(백엔드 연결을 확인하세요):', err);
      }
    })();
  }, []);

  const addDailyItem = (item: NewScheduleItemInput) => {
    api
      .createDailyItem({ time: item.time, label: item.label, weekdays: item.weekdays })
      .then((created) => setDailyItems((prev) => [...prev, fromApi(created)]))
      .catch((err) => console.warn('DAILY 일정 추가 실패:', err));
  };

  const addSpecialItem = (item: NewScheduleItemInput) => {
    if (!item.date) return; // SPECIAL 항목은 날짜가 필수(백엔드 스키마 기준)
    api
      .createSpecialItem({ time: item.time, label: item.label, kind: item.kind, date: item.date })
      .then((created) => setSpecialItems((prev) => [...prev, fromApi(created)]))
      .catch((err) => console.warn('SPECIAL 일정 추가 실패:', err));
  };

  const updateDailyItem = (id: string, patch: Partial<NewScheduleItemInput>) => {
    setDailyItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
    api.updateScheduleItem(Number(id), toApiPatch(patch)).catch((err) => console.warn('DAILY 일정 수정 실패:', err));
  };

  const updateSpecialItem = (id: string, patch: Partial<NewScheduleItemInput>) => {
    setSpecialItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
    api.updateScheduleItem(Number(id), toApiPatch(patch)).catch((err) => console.warn('SPECIAL 일정 수정 실패:', err));
  };

  const removeDailyItem = (id: string) => {
    setDailyItems((prev) => prev.filter((it) => it.id !== id));
    api.deleteScheduleItem(Number(id)).catch((err) => console.warn('DAILY 일정 삭제 실패:', err));
  };

  const removeSpecialItem = (id: string) => {
    setSpecialItems((prev) => prev.filter((it) => it.id !== id));
    api.deleteScheduleItem(Number(id)).catch((err) => console.warn('SPECIAL 일정 삭제 실패:', err));
  };

  return (
    <CalendarContext.Provider
      value={{
        dailyItems,
        specialItems,
        addDailyItem,
        addSpecialItem,
        updateDailyItem,
        updateSpecialItem,
        removeDailyItem,
        removeSpecialItem,
      }}
    >
      {children}
    </CalendarContext.Provider>
  );
}

export function useCalendar() {
  const ctx = useContext(CalendarContext);
  if (!ctx) throw new Error('useCalendar must be used within a CalendarProvider');
  return ctx;
}
