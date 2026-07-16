// 캘린더(DAILY/SPECIAL) 일정을 앱 전체에서 공유하는 Context.
// 원래 CalendarScreen 안의 지역 state였지만, 자동화 규칙 화면(AutomationContext/AutomationScreen)이
// "어떤 외출/외박/루틴 일정이 등록돼 있는지"를 그대로 참조해야 해서 RoomsContext/GoalContext와 같은
// 이유로 네비게이터보다 위(App.tsx)에서 한 번만 마운트되는 Provider로 옮겼다.
import React, { createContext, useContext, useState, ReactNode } from 'react';

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

type CalendarContextValue = {
  dailyItems: ScheduleItem[];
  specialItems: ScheduleItem[];
  setDailyItems: React.Dispatch<React.SetStateAction<ScheduleItem[]>>;
  setSpecialItems: React.Dispatch<React.SetStateAction<ScheduleItem[]>>;
};

const CalendarContext = createContext<CalendarContextValue | null>(null);

export function CalendarProvider({ children }: { children: ReactNode }) {
  // 사전 등록된 예시 데이터 없이 빈 상태로 시작한다 - 항목은 전부 캘린더 화면의 + 버튼으로 추가한 것만 남는다.
  const [dailyItems, setDailyItems] = useState<ScheduleItem[]>([]);
  const [specialItems, setSpecialItems] = useState<ScheduleItem[]>([]);

  return (
    <CalendarContext.Provider value={{ dailyItems, specialItems, setDailyItems, setSpecialItems }}>
      {children}
    </CalendarContext.Provider>
  );
}

export function useCalendar() {
  const ctx = useContext(CalendarContext);
  if (!ctx) throw new Error('useCalendar must be used within a CalendarProvider');
  return ctx;
}
