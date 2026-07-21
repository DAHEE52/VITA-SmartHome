// FastAPI 백엔드(backend/) 호출용 클라이언트.
// 실기기(Expo Go)에서 테스트할 때는 EXPO_PUBLIC_API_URL을 localhost가 아니라
// FastAPI가 떠 있는 PC의 LAN IP로 설정해야 한다 (localhost는 휴대폰 자기 자신을 가리킴).
const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';

export type DeviceType = 'env_sensor' | 'relay' | 'power_monitor';
export type Period = 'year' | 'month' | 'day';

export type HomeSummary = {
  active_device_count: number;
  humidity: number | null;
  temperature: number | null;
};

export type DeviceStatus = {
  id: string;
  label: string | null;
  type: DeviceType;
  state: string;
};

export type RoomStatus = {
  room: string;
  active: boolean;
  devices: DeviceStatus[];
};

export type SeriesPoint = {
  x_label: string;
  value: number;
};

export type EnergySeries = {
  device_id: string;
  label: string;
  points: SeriesPoint[];
};

export type EnergyUsage = {
  series: EnergySeries[];
  year_over_year_pct: number | null;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    throw new Error(`${init?.method ?? 'GET'} ${path} 실패: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function getHomeSummary(): Promise<HomeSummary> {
  return request<HomeSummary>('/home/summary');
}

export function getRoomsStatus(): Promise<RoomStatus[]> {
  return request<RoomStatus[]>('/rooms/status');
}

export function controlDevice(deviceId: string, command: 'on' | 'off'): Promise<{ ok: boolean; state: string }> {
  return request(`/devices/${deviceId}/control`, {
    method: 'POST',
    body: JSON.stringify({ command }),
  });
}

export function getEnergyUsage(period: Period): Promise<EnergyUsage> {
  return request<EnergyUsage>(`/energy/usage?period=${period}`);
}

// --- 캘린더(schedule_items) ---

export type SpecialKind = 'general' | 'outing' | 'overnight';

export type ScheduleDate = {
  year: number;
  month: number;
  day: number;
};

export type ScheduleItemOut = {
  id: number;
  time: string;
  label: string;
  kind: SpecialKind | null;
  date: ScheduleDate | null;
  weekdays: number[] | null;
};

export function getDailyItems(): Promise<ScheduleItemOut[]> {
  return request<ScheduleItemOut[]>('/schedule/daily');
}

export function createDailyItem(body: { time: string; label: string; weekdays?: number[] }): Promise<ScheduleItemOut> {
  return request('/schedule/daily', { method: 'POST', body: JSON.stringify(body) });
}

export function getSpecialItems(): Promise<ScheduleItemOut[]> {
  return request<ScheduleItemOut[]>('/schedule/special');
}

export function createSpecialItem(body: {
  time: string;
  label: string;
  kind?: SpecialKind;
  date: ScheduleDate;
}): Promise<ScheduleItemOut> {
  return request('/schedule/special', { method: 'POST', body: JSON.stringify(body) });
}

export function deleteScheduleItem(id: number): Promise<{ ok: boolean }> {
  return request(`/schedule/${id}`, { method: 'DELETE' });
}

// --- 알림함(notifications) ---

export type NotificationOut = {
  id: number;
  title: string;
  message: string;
  read: boolean;
  created_at: string;
};

export function getNotifications(): Promise<NotificationOut[]> {
  return request<NotificationOut[]>('/notifications');
}

export function createNotification(title: string, message: string): Promise<NotificationOut> {
  return request('/notifications', { method: 'POST', body: JSON.stringify({ title, message }) });
}

export function markNotificationRead(id: number): Promise<{ ok: boolean }> {
  return request(`/notifications/${id}/read`, { method: 'POST' });
}

export function deleteNotification(id: number): Promise<{ ok: boolean }> {
  return request(`/notifications/${id}`, { method: 'DELETE' });
}
