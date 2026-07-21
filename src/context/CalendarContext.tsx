// 캘린더(DAILY/SPECIAL) 일정을 앱 전체에서 공유하는 Context.
//
// using/ 프로토타입과 달리 이건 실제 백엔드(schedule_items 테이블, src/api/client.ts)에 저장된다 —
// 자동화 규칙 화면(AutomationContext/AutomationScreen)이 "어떤 외출/외박/루틴 일정이 등록돼 있는지"를
// 참조해야 해서 앱을 재시작해도 남아있어야 하고, 네비게이터보다 위(App.tsx)에서 한 번만 마운트된다.
//
// 편집 모달의 "저장"은 개별 필드 수정 API 없이, 대상 항목들을 지우고 수정된 내용으로 다시 만드는
// 방식으로 구현했다 - 캘린더 데이터가 몇 개 안 되는 규모라 이 쪽이 PATCH 엔드포인트를 추가하는 것보다
// 단순하다.
import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
  createDailyItem as apiCreateDailyItem,
  createSpecialItem as apiCreateSpecialItem,
  deleteScheduleItem as apiDeleteScheduleItem,
  getDailyItems as apiGetDailyItems,
  getSpecialItems as apiGetSpecialItems,
  ScheduleItemOut,
} from '../api/client';

export type ScheduleDate = { year: number; month: number; day: number };
export type SpecialKind = 'general' | 'outing' | 'overnight';

export type ScheduleItem = {
  id: string;
  time: string;
  label: string;
  date?: ScheduleDate;
  kind?: SpecialKind;
  weekdays?: number[];
};

function fromApi(row: ScheduleItemOut): ScheduleItem {
  return {
    id: String(row.id),
    time: row.time,
    label: row.label,
    date: row.date ?? undefined,
    kind: row.kind ?? undefined,
    weekdays: row.weekdays ?? undefined,
  };
}

type NewItemInput = Omit<ScheduleItem, 'id'>;

type CalendarContextValue = {
  dailyItems: ScheduleItem[];
  specialItems: ScheduleItem[];
  addDailyItem: (item: NewItemInput) => void;
  addSpecialItem: (item: NewItemInput) => void;
  replaceDailyItems: (oldItems: ScheduleItem[], newItems: NewItemInput[]) => void;
  replaceSpecialItems: (oldItems: ScheduleItem[], newItems: NewItemInput[]) => void;
};

const CalendarContext = createContext<CalendarContextValue | null>(null);

export function CalendarProvider({ children }: { children: ReactNode }) {
  const [dailyItems, setDailyItems] = useState<ScheduleItem[]>([]);
  const [specialItems, setSpecialItems] = useState<ScheduleItem[]>([]);

  const reloadDaily = () => {
    apiGetDailyItems()
      .then((rows) => setDailyItems(rows.map(fromApi)))
      .catch((err) => console.warn('일정(DAILY) 조회 실패:', err));
  };
  const reloadSpecial = () => {
    apiGetSpecialItems()
      .then((rows) => setSpecialItems(rows.map(fromApi)))
      .catch((err) => console.warn('일정(SPECIAL) 조회 실패:', err));
  };

  useEffect(() => {
    reloadDaily();
    reloadSpecial();
  }, []);

  const addDailyItem = (item: NewItemInput) => {
    apiCreateDailyItem({ time: item.time, label: item.label, weekdays: item.weekdays })
      .then(reloadDaily)
      .catch((err) => console.warn('일정(DAILY) 추가 실패:', err));
  };

  const addSpecialItem = (item: NewItemInput) => {
    if (!item.date) return;
    apiCreateSpecialItem({ time: item.time, label: item.label, kind: item.kind, date: item.date })
      .then(reloadSpecial)
      .catch((err) => console.warn('일정(SPECIAL) 추가 실패:', err));
  };

  const replaceDailyItems = (oldItems: ScheduleItem[], newItems: NewItemInput[]) => {
    Promise.all(oldItems.map((it) => apiDeleteScheduleItem(Number(it.id))))
      .then(() =>
        Promise.all(newItems.map((it) => apiCreateDailyItem({ time: it.time, label: it.label, weekdays: it.weekdays })))
      )
      .then(reloadDaily)
      .catch((err) => console.warn('일정(DAILY) 저장 실패:', err));
  };

  const replaceSpecialItems = (oldItems: ScheduleItem[], newItems: NewItemInput[]) => {
    Promise.all(oldItems.map((it) => apiDeleteScheduleItem(Number(it.id))))
      .then(() =>
        Promise.all(
          newItems
            .filter((it) => it.date)
            .map((it) => apiCreateSpecialItem({ time: it.time, label: it.label, kind: it.kind, date: it.date! }))
        )
      )
      .then(reloadSpecial)
      .catch((err) => console.warn('일정(SPECIAL) 저장 실패:', err));
  };

  return (
    <CalendarContext.Provider
      value={{ dailyItems, specialItems, addDailyItem, addSpecialItem, replaceDailyItems, replaceSpecialItems }}
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
