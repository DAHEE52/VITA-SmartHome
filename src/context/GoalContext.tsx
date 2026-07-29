// 절전 목표(가구 인원 + kWh 목표값)를 앱 전체에서 공유하는 Context.
// MainScreen 안의 지역 state로만 들고 있으면, 다른 화면으로 이동했다가 돌아왔을 때 React
// Navigation이 MainScreen을 다시 마운트하면서 값이 초기화돼 버렸다. 이 Provider는 네비게이터보다
// 위(App.tsx)에서 한 번만 마운트되므로, 화면을 오가도 값이 사라지지 않는다.
//
// backend/app/routers/settings.py의 /settings API를 통해 Supabase(app_settings 테이블,
// 싱글턴 행 하나)에 저장된다 - 앱을 완전히 재시작해도 유지된다.
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import * as api from '../api/client';
import { useNotifications } from './NotificationsContext';

export type HouseholdSize = 1 | 2 | 3 | 4 | 5;

type GoalContextValue = {
  householdSize: HouseholdSize | null;
  goalKwh: number | null;
  setHouseholdSize: (size: HouseholdSize) => void;
  setGoalKwh: (kwh: number) => void;
  resetGoal: () => void;
};

const GoalContext = createContext<GoalContextValue | null>(null);

export function GoalProvider({ children }: { children: ReactNode }) {
  const [householdSize, setHouseholdSizeState] = useState<HouseholdSize | null>(null);
  const [goalKwh, setGoalKwhState] = useState<number | null>(null);
  const { pushNotification } = useNotifications();
  const notifySaveFailed = (what: string) =>
    pushNotification('저장 실패', `${what}이(가) 서버에 반영되지 않았어요. 다시 시도해 주세요.`);

  useEffect(() => {
    (async () => {
      try {
        const settings = await api.getSettings();
        setHouseholdSizeState((settings.household_size as HouseholdSize | null) ?? null);
        setGoalKwhState(settings.goal_kwh);
      } catch (err) {
        console.warn('절전 목표 불러오기 실패(백엔드 연결을 확인하세요):', err);
      }
    })();
  }, []);

  const setHouseholdSize = (size: HouseholdSize) => {
    const prev = householdSize;
    setHouseholdSizeState(size);
    api.updateSettings({ household_size: size }).catch((err) => {
      console.warn('가구 인원 저장 실패:', err);
      setHouseholdSizeState(prev);
      notifySaveFailed('가구 인원 저장');
    });
  };

  const setGoalKwh = (kwh: number) => {
    const prev = goalKwh;
    setGoalKwhState(kwh);
    api.updateSettings({ goal_kwh: kwh }).catch((err) => {
      console.warn('절전 목표(kWh) 저장 실패:', err);
      setGoalKwhState(prev);
      notifySaveFailed('절전 목표 저장');
    });
  };

  // 절전 목표를 완전히 삭제 - 가구 인원 선택 전 상태로 되돌려서, 카드를 다시 탭하면
  // 가구 인원 선택부터 새로 시작한다.
  const resetGoal = () => {
    const prevHousehold = householdSize;
    const prevGoal = goalKwh;
    setHouseholdSizeState(null);
    setGoalKwhState(null);
    api.updateSettings({ household_size: null, goal_kwh: null }).catch((err) => {
      console.warn('절전 목표 초기화 실패:', err);
      setHouseholdSizeState(prevHousehold);
      setGoalKwhState(prevGoal);
      notifySaveFailed('절전 목표 초기화');
    });
  };

  return (
    <GoalContext.Provider value={{ householdSize, goalKwh, setHouseholdSize, setGoalKwh, resetGoal }}>
      {children}
    </GoalContext.Provider>
  );
}

export function useGoal() {
  const ctx = useContext(GoalContext);
  if (!ctx) throw new Error('useGoal must be used within a GoalProvider');
  return ctx;
}
