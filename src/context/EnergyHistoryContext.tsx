// 실제 기기 사용량을 실시간으로 누적 기록하는 Context.
// RoomsContext의 방/기기 on-off 상태를 주기적으로 샘플링해 "오늘 하루 누적 kWh" 로그를 쌓는다.
// EnergyUsageScreen은 이 로그를 연/월/일 단위로 묶어 그래프와 전년/전월/전일 대비 증감률을 계산하는데,
// 앱을 막 쓰기 시작한 시점에는 과거 로그가 전혀 없으므로 그래프는 0에서 시작하고, 실제로 기기를
// 켜고 끄며 데이터가 쌓여야만 증감률 계산이 의미를 갖게 된다.
import React, { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRooms } from './RoomsContext';
import { estimateTotalWatts } from '../utils/energy';
import { DailyUsage } from '../utils/energySeries';

// 10초마다 현재 소비전력(W)을 측정해 오늘 누적치(kWh)에 더한다 - MainScreen의 시계 갱신과 같은 주기.
const SAMPLE_INTERVAL_MS = 10000;
// 날짜별 누적치라 하루에 커봐야 한 줄이라(RoomsContext의 extras와 같은 이유로) AsyncStorage에
// 저장한다 - 이게 없으면 앱을 껐다 켤 때마다 이번 달 절전 목표 달성률(goalProgress.ts)이 그동안
// 쌓인 날짜별 기록을 다 잃어버려서 매번 초기화되는 문제가 있었다.
const STORAGE_KEY = 'vita.energyHistory.dailyUsage.v1';

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
  const { rooms } = useRooms();
  const [dailyUsage, setDailyUsage] = useState<DailyUsage>({});
  // 초기 로딩이 끝나기 전까지는 저장 useEffect를 건너뛴다(로딩 중 빈 값을 저장해 기존 기록을 지우는 것 방지).
  const [loaded, setLoaded] = useState(false);

  // setInterval 콜백이 항상 최신 rooms를 보도록 ref로 들고 있는다(타이머를 매번 새로 만들지 않기 위함).
  const roomsRef = useRef(rooms);
  roomsRef.current = rooms;

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) setDailyUsage(JSON.parse(raw));
      } catch (err) {
        console.warn('에너지 사용 기록 불러오기 실패:', err);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(dailyUsage)).catch((err) =>
      console.warn('에너지 사용 기록 저장 실패:', err)
    );
  }, [dailyUsage, loaded]);

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
