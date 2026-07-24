-- VITA 스마트홈 하드웨어 연동용 스키마.
-- Supabase SQL Editor에서 그대로 실행하면 된다.

-- 방(Room) — 순수 소프트웨어 개념. 하드웨어와 무관하게 앱에서 자유롭게 생성/삭제.
create table if not exists rooms (
  id bigserial primary key,
  name text not null
);

create table if not exists devices (
  id text primary key,
  room_id bigint references rooms(id) on delete set null,
  type text not null check (type in ('env_sensor', 'relay', 'power_monitor')),
  label text,
  state text not null default 'off',
  last_seen_at timestamptz
);

-- 마이그레이션: 이미 devices 테이블이 만들어진(예전 room text 컬럼을 쓰던) 기존 프로젝트용.
-- 새 프로젝트에서는 위 create table로 처음부터 room_id로 생성되므로 아래는 그냥 no-op.
alter table devices add column if not exists room_id bigint references rooms(id) on delete set null;
alter table devices drop column if exists room;

create index if not exists idx_devices_room on devices(room_id);

create table if not exists sensor_readings (
  id bigserial primary key,
  device_id text not null references devices(id),
  metric text not null,
  value double precision not null,
  recorded_at timestamptz not null default now()
);

create table if not exists device_commands (
  id bigserial primary key,
  device_id text not null references devices(id),
  command text not null,
  -- pending: 아직 기기가 안 가져감 / done: 기기가 실행 완료 / failed: 기기가 실행 실패 보고
  -- superseded: 같은 기기에 더 최신 명령이 들어와서 무시됨
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  executed_at timestamptz
);

create index if not exists idx_readings_device_time on sensor_readings(device_id, recorded_at desc);
create index if not exists idx_commands_device_status on device_commands(device_id, status);

-- 캘린더(DAILY/SPECIAL 일정) - CalendarScreen/AutomationContext가 사용.
create table if not exists schedule_items (
  id bigserial primary key,
  list_kind text not null check (list_kind in ('daily', 'special')),
  time text not null,
  label text not null,
  special_kind text check (special_kind in ('general', 'outing', 'overnight')),
  item_year int,
  item_month int,
  item_day int,
  weekdays int[],
  created_at timestamptz not null default now()
);
create index if not exists idx_schedule_list_kind on schedule_items(list_kind);

-- 알림함 - MainScreen 벨 아이콘/NotificationsModal이 사용.
create table if not exists notifications (
  id bigserial primary key,
  title text not null,
  message text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_notifications_created on notifications(created_at desc);
