// 절전 목표(가구 인원 + kWh 목표값)를 앱 전체에서 공유하는 Context.
// MainScreen 안의 지역 state로만 들고 있으면, 다른 화면으로 이동했다가 돌아왔을 때 React
// Navigation이 MainScreen을 다시 마운트하면서 값이 초기화돼 버렸다. 이 Provider는 네비게이터보다
// 위(App.tsx)에서 한 번만 마운트되므로, 화면을 오가도 값이 사라지지 않는다.
import React, { createContext, useContext, useState, ReactNode } from 'react';

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
  const [householdSize, setHouseholdSize] = useState<HouseholdSize | null>(null);
  const [goalKwh, setGoalKwh] = useState<number | null>(null);

  // 절전 목표를 완전히 삭제 - 가구 인원 선택 전 상태로 되돌려서, 카드를 다시 탭하면
  // 가구 인원 선택부터 새로 시작한다.
  const resetGoal = () => {
    setHouseholdSize(null);
    setGoalKwh(null);
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
