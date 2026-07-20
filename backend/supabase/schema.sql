-- VITA 스마트홈 하드웨어 연동용 스키마.
-- Supabase SQL Editor에서 그대로 실행하면 된다.

create table if not exists devices (
  id text primary key,
  room text not null,
  type text not null check (type in ('env_sensor', 'relay', 'power_monitor')),
  label text,
  state text not null default 'off',
  last_seen_at timestamptz
);

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
