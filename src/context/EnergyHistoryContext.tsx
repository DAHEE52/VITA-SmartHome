// 실제 기기 사용량을 실시간으로 누적 기록하는 Context (DemoRoomsContext 시뮬레이션 기준).
// DemoRoomsContext의 방/기기 on-off 상태를 주기적으로 샘플링해 "오늘 하루 누적 kWh" 로그를 쌓는다.
// EnergyTreeScreen은 이 로그를 목표(GoalContext) 대비 달성률로 환산해 나무 성장 단계를 계산한다.
// 앱을 막 쓰기 시작한 시점에는 과거 로그가 전혀 없으므로 그래프/성장률은 0에서 시작한다.
//
// 주의: 실제 PZEM 하드웨어 기반 에너지 사용량은 EnergyUsageScreen이 `/energy/usage`(src/api/client.ts)로
// 이미 따로 받아온다 — 이 Context는 그것과 별개인 시뮬레이션(에너지 나무 전용) 데이터다.
import React, { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { useDemoRooms } from './DemoRoomsContext';
import { estimateTotalWatts } from '../utils/energy';

// 날짜별 누적 kWh 맵 (예: "2026-7-21" -> 3.4)
type DailyUsage = Record<string, number>;

// 10초마다 현재 소비전력(W)을 측정해 오늘 누적치(kWh)에 더한다 - MainScreen의 시계 갱신과 같은 주기.
const SAMPLE_INTERVAL_MS = 10000;

function pad2(n: number) {
  return String(n).padStart(2, '0');
}
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

type EnergyHistoryContextValue = {
  dailyUsage: DailyUsage;
};

const EnergyHistoryContext = createContext<EnergyHistoryContextValue | null>(null);

export function EnergyHistoryProvider({ children }: { children: ReactNode }) {
  const { rooms } = useDemoRooms();
  const [dailyUsage, setDailyUsage] = useState<DailyUsage>({});

  // setInterval 콜백이 항상 최신 rooms를 보도록 ref로 들고 있는다(타이머를 매번 새로 만들지 않기 위함).
  const roomsRef = useRef(rooms);
  roomsRef.current = rooms;

  useEffect(() => {
    const timer = setInterval(() => {
      const watts = estimateTotalWatts(roomsRef.current);
      const kwhIncrement = (watts / 1000) * (SAMPLE_INTERVAL_MS / 3600000);
      const key = todayKey();
      setDailyUsage((prev) => ({ ...prev, [key]: (prev[key] ?? 0) + kwhIncrement }));
    }, SAMPLE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  return <EnergyHistoryContext.Provider value={{ dailyUsage }}>{children}</EnergyHistoryContext.Provider>;
}

export function useEnergyHistory() {
  const ctx = useContext(EnergyHistoryContext);
  if (!ctx) throw new Error('useEnergyHistory must be used within an EnergyHistoryProvider');
  return ctx;
}
