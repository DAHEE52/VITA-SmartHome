// 앱 설정(주소 등록, 가이드북 글자 크기 등)을 앱 전체에서 공유하는 Context.
// GoalContext 등과 같은 이유로 네비게이터보다 위(App.tsx)에서 한 번만 마운트해서,
// 설정 화면을 나갔다가 돌아와도 값이 유지되도록 한다.
import React, { createContext, useContext, useState, ReactNode } from 'react';

export type FontSizeOption = 'small' | 'medium' | 'large';

// 가이드북 화면에서만 쓰는 글자 크기 배율. 다른 화면 글자 크기에는 영향을 주지 않는다.
export const FONT_SIZE_SCALE: Record<FontSizeOption, number> = {
  small: 0.85,
  medium: 1,
  large: 1.25,
};
export const FONT_SIZE_LABEL: Record<FontSizeOption, string> = {
  small: '작게',
  medium: '보통',
  large: '크게',
};

type SettingsContextValue = {
  address: string;
  setAddress: (v: string) => void;
  guidebookFontSize: FontSizeOption;
  setGuidebookFontSize: (v: FontSizeOption) => void;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState('');
  const [guidebookFontSize, setGuidebookFontSize] = useState<FontSizeOption>('medium');

  return (
    <SettingsContext.Provider value={{ address, setAddress, guidebookFontSize, setGuidebookFontSize }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within a SettingsProvider');
  return ctx;
}
