// 생활 패턴 AI 분류(침대/책상/이동/외출) 결과를 앱 전체에서 공유하는 Context.
// firmware/life_pattern_vision_node(아직 학습·배포 전)가 /devices/{id}/classify로 push한 값을
// backend/app/routers/pattern.py가 저장했다가 /pattern/latest, /pattern/today로 내려준다.
// 모델이 아직 없으면 두 값 모두 비어있는 상태(latest: null, today: [])이고, 화면은 그 상태를
// "아직 연결된 생활 패턴 모델이 없어요"로 정직하게 안내한다(FirePreventionScreen의 disclaimer와 같은 관례).
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import * as api from '../api/client';

const POLL_INTERVAL_MS = 20000;

export const LIFE_PATTERN_LABELS: Record<string, string> = {
  Bed_Activity: '침대 활동',
  Desk_Activity: '책상 활동',
  Moving: '이동 중',
  Out_of_Room: '외출 중',
};

type LifePatternContextValue = {
  latest: api.PatternEvent | null;
  today: api.PatternSegment[];
};

const LifePatternContext = createContext<LifePatternContextValue | null>(null);

export function LifePatternProvider({ children }: { children: ReactNode }) {
  const [latest, setLatest] = useState<api.PatternEvent | null>(null);
  const [today, setToday] = useState<api.PatternSegment[]>([]);

  useEffect(() => {
    let cancelled = false;

    const poll = () => {
      Promise.all([api.getPatternLatest(), api.getPatternToday()])
        .then(([latestEvent, segments]) => {
          if (cancelled) return;
          setLatest(latestEvent);
          setToday(segments);
        })
        .catch((err) => console.warn('생활 패턴 조회 실패:', err));
    };

    poll();
    const timer = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return <LifePatternContext.Provider value={{ latest, today }}>{children}</LifePatternContext.Provider>;
}

export function useLifePattern() {
  const ctx = useContext(LifePatternContext);
  if (!ctx) throw new Error('useLifePattern must be used within a LifePatternProvider');
  return ctx;
}
