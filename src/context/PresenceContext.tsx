// 집에 사람이 있는지(재실) 여부를 앱 전체에서 공유하는 Context.
// 실제로는 카메라(영상 인식)로 재실 여부를 판단할 계획이지만, 아직 카메라 연동이 없으므로 지금은
// AutomationContext가 참조하는 시뮬레이션 값으로 두고, 자동화 규칙 화면에서 사용자가 직접 상태를
// 뒤집어 볼 수 있게 한다("카메라가 이렇게 판단했다고 치면" 스위치). 나중에 카메라 연동이 붙으면
// setIsHome을 그쪽 감지 결과로 호출하도록 바꾸기만 하면 되고, 이 값을 쓰는 자동화 로직은 그대로 둘 수 있다.
import React, { createContext, useContext, useState, ReactNode } from 'react';

type PresenceContextValue = {
  isHome: boolean;
  setIsHome: (isHome: boolean) => void;
};

const PresenceContext = createContext<PresenceContextValue | null>(null);

export function PresenceProvider({ children }: { children: ReactNode }) {
  // 기본값은 "집에 있음" - 카메라 연동 전까지는 항상 이 값에서 시작한다.
  const [isHome, setIsHome] = useState(true);

  return <PresenceContext.Provider value={{ isHome, setIsHome }}>{children}</PresenceContext.Provider>;
}

export function usePresence() {
  const ctx = useContext(PresenceContext);
  if (!ctx) throw new Error('usePresence must be used within a PresenceProvider');
  return ctx;
}
