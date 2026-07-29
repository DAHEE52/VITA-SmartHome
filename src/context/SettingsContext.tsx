// 앱 설정(주소 등록, 가이드북 글자 크기 등)을 앱 전체에서 공유하는 Context.
// GoalContext 등과 같은 이유로 네비게이터보다 위(App.tsx)에서 한 번만 마운트해서,
// 설정 화면을 나갔다가 돌아와도 값이 유지되도록 한다.
//
// backend/app/routers/settings.py의 /settings API를 통해 Supabase(app_settings 테이블,
// GoalContext와 같은 싱글턴 행)에 저장된다 - 앱을 완전히 재시작해도 유지된다.
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import * as api from '../api/client';
import { useNotifications } from './NotificationsContext';
import { rollbackOnFailure } from '../utils/optimisticUpdate';

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
  const [address, setAddressState] = useState('');
  const [guidebookFontSize, setGuidebookFontSizeState] = useState<FontSizeOption>('medium');
  const { pushNotification } = useNotifications();
  const notifySaveFailed = (what: string) =>
    pushNotification('저장 실패', `${what}이(가) 서버에 반영되지 않았어요. 다시 시도해 주세요.`);

  useEffect(() => {
    (async () => {
      try {
        const settings = await api.getSettings();
        setAddressState(settings.address);
        setGuidebookFontSizeState(settings.guidebook_font_size);
      } catch (err) {
        console.warn('설정 불러오기 실패(백엔드 연결을 확인하세요):', err);
      }
    })();
  }, []);

  const setAddress = (v: string) => {
    const prev = address;
    setAddressState(v);
    rollbackOnFailure(api.updateSettings({ address: v }), prev, setAddressState, '주소 저장', () =>
      notifySaveFailed('주소 저장')
    );
  };

  const setGuidebookFontSize = (v: FontSizeOption) => {
    const prev = guidebookFontSize;
    setGuidebookFontSizeState(v);
    rollbackOnFailure(
      api.updateSettings({ guidebook_font_size: v }),
      prev,
      setGuidebookFontSizeState,
      '글자 크기 저장',
      () => notifySaveFailed('글자 크기 저장')
    );
  };

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
