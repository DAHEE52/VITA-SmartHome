// 알림 목록을 앱 전체에서 공유하는 Context.
// GoalContext/RoomsContext와 같은 이유로 네비게이터보다 위(App.tsx)에서 한 번만 마운트해서,
// 알림을 확인한 뒤 다른 화면으로 이동했다가 돌아와도 읽음 상태가 유지되도록 한다.
//
// backend/app/routers/notifications.py의 /notifications API를 통해 Supabase(notifications
// 테이블)에 저장된다. RoomsContext와 같은 패턴으로 마운트 시 한 번 불러오고, 이후 변경은 로컬
// state를 낙관적으로 갱신한 뒤 백엔드에도 반영한다.
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import * as api from '../api/client';
import { rollbackOnFailure } from '../utils/optimisticUpdate';

export type NotificationItem = {
  id: string;
  title: string;
  message: string;
  time: string;
  read: boolean;
};

type NotificationsContextValue = {
  notifications: NotificationItem[];
  unreadCount: number;
  markAsRead: (id: string) => void;
  deleteNotification: (id: string) => void;
  pushNotification: (title: string, message: string) => void;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

// created_at(ISO 문자열)을 "방금 전"/"n분 전"/"n시간 전"/"n일 전" 형태로 보여준다.
function formatRelativeTime(createdAt: string): string {
  const diffMs = Date.now() - new Date(createdAt).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return '방금 전';
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;
  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay}일 전`;
}

function fromApi(item: api.NotificationOut): NotificationItem {
  return {
    id: String(item.id),
    title: item.title,
    message: item.message,
    time: formatRelativeTime(item.created_at),
    read: item.read,
  };
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    (async () => {
      try {
        const items = await api.getNotifications();
        setNotifications(items.map(fromApi));
      } catch (err) {
        console.warn('알림 목록 불러오기 실패(백엔드 연결을 확인하세요):', err);
      }
    })();
  }, []);

  // markAsRead/deleteNotification은 알림함 자기 자신에 관한 동작이라, 실패했을 때 "저장 실패"
  // 알림을 새로 만들면(재귀적으로 알림함에 알림이 쌓임) 오히려 헷갈린다. 대신 실패하면 화면을 조용히
  // 원래 상태로 되돌려서(예: 지웠던 알림이 다시 보임) 그 자체가 "반영 안 됐다"는 신호가 되게 한다.
  const markAsRead = (id: string) => {
    const prev = notifications;
    setNotifications((p) => p.map((n) => (n.id === id ? { ...n, read: true } : n)));
    rollbackOnFailure(api.markNotificationRead(Number(id)), prev, setNotifications, '알림 읽음 처리');
  };

  // 읽은 알림만 삭제할 수 있다 - 안읽은 알림은 먼저 확인(markAsRead)해야 삭제 버튼이 나타나고,
  // 혹시 안읽은 알림에 대해 호출되더라도 여기서 한 번 더 막아준다.
  const deleteNotification = (id: string) => {
    const prev = notifications;
    setNotifications((p) => p.filter((n) => !(n.id === id && n.read)));
    rollbackOnFailure(api.deleteNotification(Number(id)), prev, setNotifications, '알림 삭제');
  };

  // 화재 예방 시스템의 자동 차단 등, 앱이 스스로 만들어내는 알림을 목록 맨 앞에 안읽음 상태로 추가한다.
  const pushNotification = (title: string, message: string) => {
    api
      .createNotification(title, message)
      .then((created) => setNotifications((prev) => [fromApi(created), ...prev]))
      .catch((err) => console.warn('알림 생성 실패:', err));
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
