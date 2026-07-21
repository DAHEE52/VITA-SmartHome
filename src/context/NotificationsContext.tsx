// 알림 목록을 앱 전체에서 공유하는 Context.
//
// using/ 프로토타입과 달리 실제 백엔드(notifications 테이블, src/api/client.ts)에 저장된다.
// 다만 pushNotification만은 예외다 — AutomationContext/FireSafetyContext가 setInterval tick 안에서
// 동기적으로 호출하므로, 네트워크 왕복을 기다리면 알림 배지가 지연되어 화재감지처럼 즉시성이
// 중요한 기능에서 체감 지연이 생긴다. 그래서 로컬에 즉시 반영(낙관적 갱신)하고, 서버 저장은
// 백그라운드로 fire-and-forget 호출한다 — 이 앱의 다른 모든 곳이 따르는 "API 호출 → 재조회"
// 패턴의 유일한 의도적 예외.
import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
  createNotification as apiCreateNotification,
  deleteNotification as apiDeleteNotification,
  getNotifications as apiGetNotifications,
  markNotificationRead as apiMarkNotificationRead,
  NotificationOut,
} from '../api/client';

export type NotificationItem = {
  id: string;
  title: string;
  message: string;
  time: string;
  read: boolean;
};

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function fromApi(row: NotificationOut): NotificationItem {
  const d = new Date(row.created_at);
  return {
    id: String(row.id),
    title: row.title,
    message: row.message,
    time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}`,
    read: row.read,
  };
}

type NotificationsContextValue = {
  notifications: NotificationItem[];
  unreadCount: number;
  markAsRead: (id: string) => void;
  deleteNotification: (id: string) => void;
  pushNotification: (title: string, message: string) => void;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  useEffect(() => {
    apiGetNotifications()
      .then((rows) => setNotifications(rows.map(fromApi)))
      .catch((err) => console.warn('알림 조회 실패:', err));
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAsRead = (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    apiMarkNotificationRead(Number(id)).catch((err) => console.warn('알림 읽음 처리 실패:', err));
  };

  // 읽은 알림만 삭제할 수 있다 - 안읽은 알림은 먼저 확인(markAsRead)해야 삭제 버튼이 나타나고,
  // 혹시 안읽은 알림에 대해 호출되더라도 여기서 한 번 더 막아준다.
  const deleteNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => !(n.id === id && n.read)));
    apiDeleteNotification(Number(id)).catch((err) => console.warn('알림 삭제 실패:', err));
  };

  // 화재 예방 시스템의 자동 차단 등, 앱이 스스로 만들어내는 알림을 목록 맨 앞에 안읽음 상태로 추가한다.
  // (파일 상단 설명대로 이 함수만 서버 응답을 기다리지 않는 예외.)
  const pushNotification = (title: string, message: string) => {
    setNotifications((prev) => [
      {
        id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        title,
        message,
        time: '방금 전',
        read: false,
      },
      ...prev,
    ]);
    apiCreateNotification(title, message).catch(() => {});
  };

  return (
    <NotificationsContext.Provider
      value={{ notifications, unreadCount, markAsRead, deleteNotification, pushNotification }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications must be used within a NotificationsProvider');
  return ctx;
}
