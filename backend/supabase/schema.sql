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
  type text not null check (type in ('env_sensor', 'relay', 'power_monitor', 'presence_cam')),
  label text,
  state text not null default 'off',
  last_seen_at timestamptz,
  device_key text
);

-- 마이그레이션: 이미 devices 테이블이 만들어진(예전 room text 컬럼을 쓰던) 기존 프로젝트용.
-- 새 프로젝트에서는 위 create table로 처음부터 room_id로 생성되므로 아래는 그냥 no-op.
alter table devices add column if not exists room_id bigint references rooms(id) on delete set null;
alter table devices drop column if exists room;

-- 마이그레이션: 기기별 개별 인증 키(trust-on-first-use) 도입 전 기존 프로젝트용.
-- 새 프로젝트에서는 위 create table에 이미 포함되므로 그냥 no-op. app/deps.py의
-- verify_device_key 참고 - 이 컬럼이 비어있는(NULL) 기기는 다음 요청의 X-Device-Key를
-- 그대로 자기 키로 저장한다(기존에 공유 키를 쓰던 기기들이 자연스럽게 개별 키로 전환됨).
alter table devices add column if not exists device_key text;

-- 마이그레이션: presence_cam(카메라 재실 감지 노드) 타입 추가 전에 만들어진 기존 프로젝트용.
-- 새 프로젝트에서는 위 create table의 check에 이미 포함되므로 그냥 no-op.
alter table devices drop constraint if exists devices_type_check;
alter table devices add constraint devices_type_check
  check (type in ('env_sensor', 'relay', 'power_monitor', 'presence_cam'));

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

-- 확장(연결되는 센서/기기 수, 쌓이는 데이터량이 늘어나는 것) 대비 인덱스 2개.
-- (1) device_id+metric으로 필터링하고 recorded_at으로 정렬하는 조회(기기별 최신값 뷰, 전력량 누적
--     이력 조회)를 위한 복합 인덱스 - 기기 수·누적 기간이 늘어날수록 효과가 커진다.
create index if not exists idx_readings_device_metric_time on sensor_readings(device_id, metric, recorded_at desc);
-- (2) metric+value로 필터링하고 recorded_at으로 정렬하는 조회(예: PIR "마지막 움직임 감지 시각")를 위한 인덱스.
create index if not exists idx_readings_metric_value_time on sensor_readings(metric, value, recorded_at desc);

-- 기기별/지표별 "가장 최근 값" 하나씩만 뽑아주는 뷰.
-- 기존 백엔드 코드는 "최근 200행을 가져와서 기기별로 처음 나오는 값만 취한다"는 방식이었는데,
-- 센서(기기) 수가 늘어나면 어떤 기기는 그 200행 안에 아예 안 걸려서 값이 통째로 빠지는 문제가
-- 생길 수 있었다(예: 자주 push하는 기기가 많아지면 드물게 push하는 기기의 최신값이 밀려남).
-- DISTINCT ON으로 DB가 직접 기기·지표별 최신 값을 보장하도록 바꿔서, 기기 수·데이터량과 무관하게
-- 항상 정확하다. idx_readings_device_metric_time 인덱스 덕분에 데이터가 아무리 쌓여도 빠르다.
create or replace view latest_sensor_readings as
select distinct on (device_id, metric) device_id, metric, value, recorded_at
from sensor_readings
order by device_id, metric, recorded_at desc;

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

-- 앱 설정 - 절전 목표(가구 인원/kWh 목표)와 환경설정(주소, 가이드북 글자크기).
-- 로그인/멀티유저가 없는 프로토타입 단계라 딱 한 행(id=1)만 쓰는 싱글턴 테이블로 둔다.
create table if not exists app_settings (
  id int primary key default 1,
  household_size int check (household_size between 1 and 5),
  goal_kwh double precision,
  address text not null default '',
  guidebook_font_size text not null default 'medium' check (guidebook_font_size in ('small', 'medium', 'large')),
  emergency_phone text not null default '',
  constraint app_settings_singleton check (id = 1)
);
insert into app_settings (id) values (1) on conflict (id) do nothing;

-- 마이그레이션: 화재 위험 감지 SMS 알림(emergency_phone) 도입 전 기존 프로젝트용.
-- 새 프로젝트에서는 위 create table에 이미 포함되므로 그냥 no-op.
alter table app_settings add column if not exists emergency_phone text not null default '';

-- 화재 위험 감지 SMS 발송 이력 - app/routers/alerts.py가 사용. 실패 건도 남겨서 나중에
-- "왜 문자가 안 왔지"를 디버깅할 수 있게 한다. status='sent'인 가장 최근 행의 created_at을
-- 기준으로 5분 내 중복 발송을 막는다(alerts.py의 DEDUP_WINDOW_MINUTES).
create table if not exists sms_log (
  id bigserial primary key,
  phone text not null,
  message text not null,
  status text not null check (status in ('sent', 'failed')),
  detail text,
  created_at timestamptz not null default now()
);
create index if not exists idx_sms_log_created on sms_log(created_at desc);

-- 자동화 규칙 - AutomationScreen/AutomationContext가 사용.
-- trigger/action은 종류가 다양해서(외출/외박/루틴/재실 트리거 x 기기on/off/온도설정/재실온도 액션)
-- 프런트엔드 타입을 그대로 jsonb로 저장한다.
create table if not exists automation_rules (
  id bigserial primary key,
  trigger jsonb not null,
  offset_minutes int not null default 0,
  room_id bigint not null references rooms(id) on delete cascade,
  action jsonb not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_automation_rules_room on automation_rules(room_id);

-- 취침 모드 프리셋 + 취침 감지 설정 - SleepModeScreen이 사용.
-- app_settings와 같은 이유로(로그인/멀티유저 없는 프로토타입) 딱 한 행(id=1)만 쓰는 싱글턴.
-- devices: 취침 모드에 포함시킬 기기를 사용자가 직접 고른 목록 - [{"device_id": "...", "on": true}, ...].
-- 원룸마다 실제로 어떤 기기를 쓰는지 다르므로(조명/에어컨 같은 고정 종류를 미리 가정하지 않고),
-- SmartHomeControl에 이미 등록된 기기 중에서 직접 선택하고 켜질지/꺼질지도 함께 정한다.
create table if not exists sleep_preset (
  id int primary key default 1,
  devices jsonb not null default '[]',
  bedtime_hour int not null default 20 check (bedtime_hour between 0 and 23),
  no_motion_minutes int not null default 30 check (no_motion_minutes > 0),
  confirm_wait_minutes int not null default 5 check (confirm_wait_minutes > 0),
  constraint sleep_preset_singleton check (id = 1)
);
insert into sleep_preset (id) values (1) on conflict (id) do nothing;

-- 마이그레이션: 기기 종류를 고정 가정하던 이전 버전(light_on/aircon_on/aircon_temp/dehumidify/
-- humidifier_on/tv_off/pc_off)에서 devices(jsonb) 기반으로 바뀌기 전에 만들어진 기존 프로젝트용.
-- 새 프로젝트에서는 위 create table로 처음부터 devices 컬럼으로 생성되므로 아래는 그냥 no-op.
alter table sleep_preset add column if not exists devices jsonb not null default '[]';
alter table sleep_preset drop column if exists light_on;
alter table sleep_preset drop column if exists aircon_on;
alter table sleep_preset drop column if exists aircon_temp;
alter table sleep_preset drop column if exists dehumidify;
alter table sleep_preset drop column if exists humidifier_on;
alter table sleep_preset drop column if exists tv_off;
alter table sleep_preset drop column if exists pc_off;

-- 완료된 취침 세션 기록 - SleepStatsScreen(수면 통계)이 사용.
-- 취침 모드가 활성화될 때 sleep_started_at만 채워 한 행이 생기고, 기상이 감지되면 같은 행에
-- sleep_ended_at을 채운다(진행 중인 세션은 sleep_ended_at이 null).
create table if not exists sleep_records (
  id bigserial primary key,
  sleep_started_at timestamptz not null,
  sleep_ended_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_sleep_records_started on sleep_records(sleep_started_at desc);

-- 생활 패턴 분류 결과(침대/책상/이동/외출) - 비전 모델(life_pattern_vision_node)이 push하는 값을 저장.
-- 아직 모델이 배포되기 전에는 이 테이블이 비어 있고, LifePatternScreen은 그 상태를 그대로 안내한다.
create table if not exists classification_events (
  id bigserial primary key,
  device_id text not null references devices(id),
  model text not null check (model in ('life_pattern')),
  label text not null,
  confidence double precision,
  recorded_at timestamptz not null default now()
);
create index if not exists idx_classification_device_time on classification_events(device_id, recorded_at desc);

-- 기기 이상 패턴 감지(app/anomaly/) - 기기별 학습된 사용 습관(평균/분산/모드)과 최근 이상 감지
-- 이벤트를 저장한다. 통계는 Welford 온라인 알고리즘으로 표본 하나씩 갱신되므로(app/anomaly/models.py
-- RunningStats), 원시 값 자체가 아니라 {count, mean, m2, minimum, maximum} 요약만 jsonb로 저장한다.

-- 기기 하나의 전체 학습 상태 - 1단계(14일 학습)에서 쌓이는 원시 통계 + 진행 중인 사용 세션.
create table if not exists device_learning_profile (
  device_id text primary key references devices(id) on delete cascade,
  learning_started_at timestamptz not null default now(),
  power_stats jsonb not null default '{"count":0,"mean":0,"m2":0,"minimum":null,"maximum":null}',
  duration_stats jsonb not null default '{"count":0,"mean":0,"m2":0,"minimum":null,"maximum":null}',
  hourly_frequency jsonb not null default '[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]',
  power_history jsonb not null default '[]',
  session_started_at timestamptz,
  session_power_sum double precision not null default 0,
  session_power_count int not null default 0,
  updated_at timestamptz not null default now()
);

-- 2/3단계에서 전력값을 기준으로 자동 분류된 사용 모드(예: "500W대"/"1500W대") - 기기당 여러 행.
create table if not exists device_usage_mode (
  id bigserial primary key,
  device_id text not null references devices(id) on delete cascade,
  mode_index int not null,
  power_stats jsonb not null default '{"count":0,"mean":0,"m2":0,"minimum":null,"maximum":null}',
  duration_stats jsonb not null default '{"count":0,"mean":0,"m2":0,"minimum":null,"maximum":null}',
  updated_at timestamptz not null default now(),
  unique (device_id, mode_index)
);
create index if not exists idx_device_usage_mode_device on device_usage_mode(device_id);

-- 4~7단계에서 계산된 이상 감지 결과 로그(점수/등급/조치/사유) - FirePreventionScreen의
-- "자동 대응 기록"과 같은 역할의 감사 기록이다. normal 등급은 기록하지 않는다(store.py 참고).
create table if not exists device_anomaly_event (
  id bigserial primary key,
  device_id text not null references devices(id) on delete cascade,
  room_id bigint references rooms(id) on delete set null,
  score int not null,
  level text not null check (level in ('normal', 'caution', 'warning', 'danger')),
  action text not null,
  reasons jsonb not null default '[]',
  created_at timestamptz not null default now()
);
create index if not exists idx_device_anomaly_event_device on device_anomaly_event(device_id, created_at desc);
