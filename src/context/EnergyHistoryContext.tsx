// 실제 기기 사용량을 실시간으로 누적 기록하는 Context.
// RoomsContext의 방/기기 on-off 상태를 주기적으로 샘플링해 "오늘 하루 누적 kWh" 로그를 쌓는다.
// EnergyUsageScreen은 이 로그를 연/월/일 단위로 묶어 그래프와 전년/전월/전일 대비 증감률을 계산하는데,
// 앱을 막 쓰기 시작한 시점에는 과거 로그가 전혀 없으므로 그래프는 0에서 시작하고, 실제로 기기를
// 켜고 끄며 데이터가 쌓여야만 증감률 계산이 의미를 갖게 된다.
import React, { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { useRooms } from './RoomsContext';
import { estimateTotalWatts } from '../utils/energy';
import { DailyUsage } from '../utils/energySeries';

// 10초마다 현재 소비전력(W)을 측정해 오늘 누적치(kWh)에 더한다 - MainScreen의 시계 갱신과 같은 주기.
const SAMPLE_INTERVAL_MS = 10000;

function pad2(n: number) {
  return String(n).padStart(2, '0');
}
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// EnergyTreeScreen("에너지 나무")의 7월 숲/성장 트래커가 빈 화면(전부 새싹)으로 보이지 않도록 채우는
// 더미 데이터. 이 Context는 백엔드에 저장되지 않는 순수 프런트 시뮬레이션이라(위 설명 참고) 실제
// 로그를 쌓으려면 기기를 켜둔 채 오래 기다려야 한다 - 데모용으로 7/1~7/30을 하드코딩해서 채워두고,
// 오늘(7/31)은 그대로 두어 기존처럼 실시간 샘플링이 이어지게 한다.
// 절전 목표(150kWh/월 기준 하루 약 4.84kWh)보다 사용량이 많던 월초(새싹) → 점점 줄여나가는 월중
// (어린 나무) → 목표를 크게 밑도는 월말(나무)로, 한 달 동안 성장하는 흐름을 보여주도록 값을 잡았다.
const JULY_DUMMY_USAGE: Record<number, number> = {
  1: 6.3, 2: 5.8, 3: 6.6, 4: 5.4, 5: 5.9, 6: 4.7, 7: 6.1, 8: 5.2, 9: 4.4, 10: 5.6,
  11: 3.1, 12: 2.8, 13: 3.0, 14: 2.4, 15: 2.9, 16: 2.1, 17: 2.6, 18: 1.9, 19: 2.3, 20: 1.8,
  21: 1.5, 22: 1.2, 23: 1.6, 24: 0.9, 25: 1.3, 26: 0.7, 27: 0.5, 28: 1.0, 29: 0.8, 30: 0.6,
};
function buildJulySeed(): DailyUsage {
  const seed: DailyUsage = {};
  for (const [day, kwh] of Object.entries(JULY_DUMMY_USAGE)) {
    seed[`2026-07-${pad2(Number(day))}`] = kwh;
  }
  return seed;
}

type EnergyHistoryContextValue = {
  dailyUsage: DailyUsage;
};

const EnergyHistoryContext = createContext<EnergyHistoryContextValue | null>(null);

export function EnergyHistoryProvider({ children }: { children: ReactNode }) {
  const { rooms } = useRooms();
  const [dailyUsage, setDailyUsage] = useState<DailyUsage>(buildJulySeed);

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
