// 알림 목록을 앱 전체에서 공유하는 Context.
// GoalContext/RoomsContext와 같은 이유로 네비게이터보다 위(App.tsx)에서 한 번만 마운트해서,
// 알림을 확인한 뒤 다른 화면으로 이동했다가 돌아와도 읽음 상태가 유지되도록 한다.
import React, { createContext, useContext, useState, ReactNode } from 'react';

export type NotificationItem = {
  id: string;
  title: string;
  message: string;
  time: string;
  read: boolean;
};

// 앱에 지속 저장소가 없어 매번 새로 시작하므로, Provider가 처음 마운트되는 시점(=앱을 처음 켠
// 시점)에 항상 웰컴 알림 하나로 시작한다.
const initialNotifications: NotificationItem[] = [
  {
    id: 'welcome',
    title: '환영합니다!',
    message: 'VITA 스마트홈에 오신 것을 환영해요. 메뉴에서 다양한 기능을 둘러보세요.',
    time: '방금 전',
    read: false,
  },
];

type NotificationsContextValue = {
  notifications: NotificationItem[];
  unreadCount: number;
  markAsRead: (id: string) => void;
  deleteNotification: (id: string) => void;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<NotificationItem[]>(initialNotifications);
  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAsRead = (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  // 읽은 알림만 삭제할 수 있다 - 안읽은 알림은 먼저 확인(markAsRead)해야 삭제 버튼이 나타나고,
  // 혹시 안읽은 알림에 대해 호출되더라도 여기서 한 번 더 막아준다.
  const deleteNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => !(n.id === id && n.read)));
  };

  return (
    <NotificationsContext.Provider value={{ notifications, unreadCount, markAsRead, deleteNotification }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications must be used within a NotificationsProvider');
  return ctx;
}
