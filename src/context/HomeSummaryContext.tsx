// /home/summary(재실 여부, 최근 움직임 시각, 실내 온습도, 켜진 기기 수) 하나를 앱 전체가 공유해서 쓰는
// Context. PresenceContext(재실)/SleepContext(최근 움직임)/FireSafetyContext(최근 움직임)/
// AutomationContext(실내 온도) 네 곳이 예전에는 각자 따로 이 엔드포인트를 폴링해서, 실제로는 같은
// 데이터를 4배 더 자주 요청하고 있었다 - 여기서 한 번만 폴링하고 나머지는 이 Context를 구독한다.
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getHomeSummary, HomeSummary } from '../api/client';

// 기존 4곳 중 가장 촘촘했던 주기(Sleep/FireSafety의 10초)에 맞춘다 - 이보다 늘리면 그 두 기능의
// 반응성이 떨어진다.
const POLL_INTERVAL_MS = 10000;

type HomeSummaryContextValue = {
  summary: HomeSummary | null;
};

const HomeSummaryContext = createContext<HomeSummaryContextValue | null>(null);

export function HomeSummaryProvider({ children }: { children: ReactNode }) {
  const [summary, setSummary] = useState<HomeSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      getHomeSummary()
        .then((s) => {
          if (!cancelled) setSummary(s);
        })
        .catch((err) => console.warn('홈 요약 조회 실패:', err));
    };
    poll();
    const timer = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return <HomeSummaryContext.Provider value={{ summary }}>{children}</HomeSummaryContext.Provider>;
}

export function useHomeSummary() {
  const ctx = useContext(HomeSummaryContext);
  if (!ctx) throw new Error('useHomeSummary must be used within a HomeSummaryProvider');
  return ctx;
}
