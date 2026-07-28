// FastAPI 백엔드(backend/) 호출용 클라이언트.
// 실기기(Expo Go)에서 테스트할 때는 EXPO_PUBLIC_API_URL을 localhost가 아니라
// FastAPI가 떠 있는 PC의 LAN IP로 설정해야 한다 (localhost는 휴대폰 자기 자신을 가리킴).
const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';

export type DeviceType = 'env_sensor' | 'relay' | 'power_monitor' | 'presence_cam';
export type Period = 'year' | 'month' | 'day';

export type HomeSummary = {
  active_device_count: number;
  humidity: number | null;
  temperature: number | null;
  presence: boolean | null;
  last_motion_at: string | null;
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

// --- 방(rooms)/기기(devices) 관리 — RoomsContext가 사용 ---

export type RoomWithDevices = {
  id: number;
  name: string;
  devices: DeviceStatus[];
};

export type DeviceOut = {
  id: string;
  label: string | null;
  type: DeviceType;
  state: string;
  room_id: number | null;
};

export function getRooms(): Promise<RoomWithDevices[]> {
  return request<RoomWithDevices[]>('/rooms');
}

export function createRoom(name: string): Promise<{ id: number; name: string }> {
  return request('/rooms', { method: 'POST', body: JSON.stringify({ name }) });
}

export function renameRoom(roomId: number, name: string): Promise<{ id: number; name: string }> {
  return request(`/rooms/${roomId}`, { method: 'PATCH', body: JSON.stringify({ name }) });
}

export function deleteRoom(roomId: number): Promise<{ ok: boolean }> {
  return request(`/rooms/${roomId}`, { method: 'DELETE' });
}

// 실제 ESP32 없이 /devices/register가 하는 일을 흉내내는 프로토타입 전용 엔드포인트.
export function mockRegisterDevice(name?: string): Promise<DeviceOut> {
  return request('/devices/mock-register', { method: 'POST', body: JSON.stringify(name ? { name } : {}) });
}

export function updateDevice(
  deviceId: string,
  body: { name?: string; room_id?: number | null }
): Promise<DeviceOut> {
  return request(`/devices/${deviceId}`, { method: 'PATCH', body: JSON.stringify(body) });
}

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

export function updateScheduleItem(
  id: number,
  body: { time?: string; label?: string; kind?: SpecialKind; date?: ScheduleDate | null; weekdays?: number[] | null }
): Promise<ScheduleItemOut> {
  return request(`/schedule/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
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

// --- 앱 설정(절전 목표 + 환경설정) ---

export type FontSizeOption = 'small' | 'medium' | 'large';

export type AppSettings = {
  household_size: 1 | 2 | 3 | 4 | 5 | null;
  goal_kwh: number | null;
  address: string;
  guidebook_font_size: FontSizeOption;
};

export function getSettings(): Promise<AppSettings> {
  return request<AppSettings>('/settings');
}

export function updateSettings(body: Partial<AppSettings>): Promise<AppSettings> {
  return request('/settings', { method: 'PATCH', body: JSON.stringify(body) });
}

// --- 자동화 규칙(automation_rules) ---

export type AutomationRuleOut = {
  id: number;
  trigger: Record<string, unknown>;
  offset_minutes: number;
  room_id: number;
  action: Record<string, unknown>;
  enabled: boolean;
};

export function getAutomationRules(): Promise<AutomationRuleOut[]> {
  return request<AutomationRuleOut[]>('/automation-rules');
}

export function createAutomationRule(body: {
  trigger: Record<string, unknown>;
  offset_minutes: number;
  room_id: number;
  action: Record<string, unknown>;
  enabled?: boolean;
}): Promise<AutomationRuleOut> {
  return request('/automation-rules', { method: 'POST', body: JSON.stringify(body) });
}

export function updateAutomationRule(
  id: number,
  body: Partial<{
    trigger: Record<string, unknown>;
    offset_minutes: number;
    room_id: number;
    action: Record<string, unknown>;
    enabled: boolean;
  }>
): Promise<AutomationRuleOut> {
  return request(`/automation-rules/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
}

export function deleteAutomationRule(id: number): Promise<{ ok: boolean }> {
  return request(`/automation-rules/${id}`, { method: 'DELETE' });
}

// --- 취침 모드(sleep_preset/sleep_records) ---

export type SleepPreset = {
  light_on: boolean;
  aircon_on: boolean;
  aircon_temp: number;
  dehumidify: boolean;
  humidifier_on: boolean;
  tv_off: boolean;
  pc_off: boolean;
  bedtime_hour: number;
  no_motion_minutes: number;
  confirm_wait_minutes: number;
};

export function getSleepPreset(): Promise<SleepPreset> {
  return request<SleepPreset>('/sleep/preset');
}

export function updateSleepPreset(body: Partial<SleepPreset>): Promise<SleepPreset> {
  return request('/sleep/preset', { method: 'PATCH', body: JSON.stringify(body) });
}

export type SleepRecord = {
  id: number;
  sleep_started_at: string;
  sleep_ended_at: string | null;
};

export function getSleepRecords(period: Period): Promise<SleepRecord[]> {
  return request<SleepRecord[]>(`/sleep/records?period=${period}`);
}

export function startSleepRecord(sleepStartedAt: string): Promise<SleepRecord> {
  return request('/sleep/records', { method: 'POST', body: JSON.stringify({ sleep_started_at: sleepStartedAt }) });
}

export function endSleepRecord(id: number, sleepEndedAt: string): Promise<SleepRecord> {
  return request(`/sleep/records/${id}`, { method: 'PATCH', body: JSON.stringify({ sleep_ended_at: sleepEndedAt }) });
}

// --- 생활 패턴 분류(classification_events) ---

export type PatternEvent = {
  label: string;
  confidence: number | null;
  recorded_at: string;
};

export type PatternSegment = {
  label: string;
  started_at: string;
  ended_at: string | null;
};

export function getPatternLatest(): Promise<PatternEvent | null> {
  return request<PatternEvent | null>('/pattern/latest');
}

export function getPatternToday(): Promise<PatternSegment[]> {
  return request<PatternSegment[]>('/pattern/today');
}
