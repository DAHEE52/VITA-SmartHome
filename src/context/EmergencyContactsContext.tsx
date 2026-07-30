// 가족 비상 연락처를 앱 전체에서 공유하는 Context.
// 원래는 GuidebookScreen 안의 지역 state였는데, 화면을 나갔다 돌아오거나 앱을 재시작하면
// 등록한 연락처가 그대로 사라지는 문제가 있었고, 화재 감지 시 자동으로 비상 연락망에 알림을
// 보내려면(FireSafetyContext) 화면과 무관하게 어디서든 이 목록을 읽을 수 있어야 한다.
// 로그인/멀티유저가 없는 프로토타입 단계라 백엔드 테이블 대신 RoomsContext의 "extras" 패턴과
// 동일하게 AsyncStorage에만 저장한다(기기 로컬 저장 - 앱 재설치 전까지는 유지된다).
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type EmergencyContact = { id: string; name: string; phone: string };

const STORAGE_KEY = 'vita.emergencyContacts.v1';

type EmergencyContactsContextValue = {
  contacts: EmergencyContact[];
  addContact: (name: string, phone: string) => void;
  removeContact: (id: string) => void;
};

const EmergencyContactsContext = createContext<EmergencyContactsContextValue | null>(null);

export function EmergencyContactsProvider({ children }: { children: ReactNode }) {
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) setContacts(JSON.parse(raw));
      } catch (err) {
        console.warn('비상 연락처 불러오기 실패:', err);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return; // 로딩 중 빈 배열을 저장해 기존 값을 지워버리는 것 방지.
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(contacts)).catch((err) =>
      console.warn('비상 연락처 저장 실패:', err)
    );
  }, [contacts, loaded]);

  const addContact = (name: string, phone: string) => {
    setContacts((prev) => [...prev, { id: `contact-${Date.now()}`, name, phone }]);
  };

  const removeContact = (id: string) => {
    setContacts((prev) => prev.filter((c) => c.id !== id));
  };

  return (
    <EmergencyContactsContext.Provider value={{ contacts, addContact, removeContact }}>
      {children}
    </EmergencyContactsContext.Provider>
  );
}

export function useEmergencyContacts() {
  const ctx = useContext(EmergencyContactsContext);
  if (!ctx) throw new Error('useEmergencyContacts must be used within an EmergencyContactsProvider');
  return ctx;
}
