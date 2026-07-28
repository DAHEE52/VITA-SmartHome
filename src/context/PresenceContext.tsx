// 집에 사람이 있는지(재실) 여부를 앱 전체에서 공유하는 Context.
// firmware/presence_vision_node(카메라 + Edge Impulse 비전 모델)가 백엔드로 보낸 감지 결과를
// /home/summary의 presence 필드로 주기적으로 읽어와 반영한다. 아직 카메라가 한 번도 값을
// 보낸 적이 없으면(presence: null) 서버가 판단 불가 상태이므로 이전 값을 그대로 유지한다.
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getHomeSummary } from '../api/client';

const POLL_INTERVAL_MS = 15000;

type PresenceContextValue = {
  isHome: boolean;
};

const PresenceContext = createContext<PresenceContextValue | null>(null);

export function PresenceProvider({ children }: { children: ReactNode }) {
  // 기본값은 "집에 있음" - 카메라가 아직 값을 보내기 전까지는 이 값에서 시작한다.
  const [isHome, setIsHome] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const poll = () => {
      getHomeSummary()
        .then((summary) => {
          if (!cancelled && summary.presence != null) setIsHome(summary.presence);
        })
        .catch((err) => console.warn('재실 상태 조회 실패:', err));
    };

    poll();
    const timer = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return <PresenceContext.Provider value={{ isHome }}>{children}</PresenceContext.Provider>;
}

export function usePresence() {
  const ctx = useContext(PresenceContext);
  if (!ctx) throw new Error('usePresence must be used within a PresenceProvider');
  return ctx;
}
