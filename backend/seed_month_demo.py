"""기능 검증용 한 달치 더미 데이터 시드 스크립트 (2026-07-29 작성).

`seed_demo.py`는 원룸 전용으로 스키마가 바뀌기 전(다중 방, devices.room 텍스트 컬럼) 버전이라
지금 스키마(devices.room_id FK, 방 1개 고정)에 그대로 돌리면 실패한다. 이 스크립트는 현재
스키마 기준으로 최근 30일치 온습도/재실/전력/취침/알림/캘린더/생활패턴 데이터를 채워서
MainScreen/SmartHomeControl/EnergyUsage/Calendar/SleepStats/LifePattern/BillReceipt/EnergyTree
등 "실제 데이터가 있어야 의미 있는" 화면들을 눈으로 확인할 수 있게 한다.

여러 번 실행해도 안전하다 - devices/schedule_items/notifications 등은 실행할 때마다 새로
추가되므로(중복 방지 로직 없음), 반복 실행하면 데이터가 계속 쌓인다. 정리하고 싶으면
Supabase 대시보드에서 해당 테이블을 비우고 다시 실행할 것.

실행: backend 폴더에서 `venv/Scripts/python seed_month_demo.py`
"""

import random
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from app.supabase_client import get_supabase

supabase = get_supabase()
random.seed(20260729)

KST = ZoneInfo("Asia/Seoul")
now_utc = datetime.now(timezone.utc)
now_kst = now_utc.astimezone(KST)
DAYS = 30
window_start_kst = (now_kst - timedelta(days=DAYS)).replace(hour=0, minute=0, second=0, microsecond=0)


def chunked_insert(table: str, rows: list[dict], size: int = 200) -> int:
    for i in range(0, len(rows), size):
        supabase.table(table).insert(rows[i : i + size]).execute()
    return len(rows)


# ── 0. 방 확인 (원룸 전용이라 항상 1개만 존재해야 함) ──────────────────────
rooms_res = supabase.table("rooms").select("id, name").order("id").execute()
if not rooms_res.data:
    raise SystemExit("방이 하나도 없습니다. 앱을 한 번 실행해 기본 방을 자동 생성한 뒤 다시 실행하세요.")
ROOM_ID = rooms_res.data[0]["id"]
print(f"room: id={ROOM_ID}, name={rooms_res.data[0]['name']}")

# ── 1. 기기 등록 (upsert) ──────────────────────────────────────────────
DEVICES = [
    {"id": "seed-env-01", "type": "env_sensor", "label": "온습도 센서", "state": "on"},
    {"id": "seed-power-01", "type": "power_monitor", "label": "전력 측정기", "state": "on"},
    {"id": "seed-cam-01", "type": "presence_cam", "label": "재실 감지 카메라", "state": "on"},
    {"id": "seed-relay-light", "type": "relay", "label": "조명", "state": "off"},
    {"id": "seed-relay-aircon", "type": "relay", "label": "에어컨", "state": "off"},
    {"id": "seed-relay-tv", "type": "relay", "label": "TV", "state": "off"},
]
for d in DEVICES:
    supabase.table("devices").upsert(
        {
            "id": d["id"],
            "room_id": ROOM_ID,
            "type": d["type"],
            "label": d["label"],
            "state": d["state"],
            "last_seen_at": now_utc.isoformat(),
        }
    ).execute()
print(f"devices upserted: {len(DEVICES)}")

# ── 2. 외출/외박 구간 정의 (재실 시뮬레이션 + 캘린더 특별 일정에 공용으로 사용) ──
def kst(y, m, d, h=0, mi=0):
    return datetime(y, m, d, h, mi, tzinfo=KST)


OUTING_WINDOWS = [
    (kst(2026, 7, 15, 14, 0), kst(2026, 7, 15, 18, 0)),  # 외출 반나절
    (kst(2026, 7, 20, 10, 0), kst(2026, 7, 21, 20, 0)),  # 외박 1박
]


def is_outing(t: datetime) -> bool:
    return any(start <= t <= end for start, end in OUTING_WINDOWS)


# ── 3. 온습도 (2시간 간격, 30일) ────────────────────────────────────────
temp_rows: list[dict] = []
humidity_rows: list[dict] = []
temp = 24.5
humidity = 52.0
t = window_start_kst
while t <= now_kst:
    temp += random.uniform(-0.5, 0.5)
    temp = min(max(temp, 20.0), 29.0)
    humidity += random.uniform(-2.0, 2.0)
    humidity = min(max(humidity, 38.0), 68.0)
    recorded_at = t.astimezone(timezone.utc).isoformat()
    temp_rows.append({"device_id": "seed-env-01", "metric": "temperature", "value": round(temp, 1), "recorded_at": recorded_at})
    humidity_rows.append({"device_id": "seed-env-01", "metric": "humidity", "value": round(humidity, 1), "recorded_at": recorded_at})
    t += timedelta(hours=2)
n = chunked_insert("sensor_readings", temp_rows + humidity_rows)
print(f"temperature/humidity readings inserted: {n}")

# ── 4. 움직임(motion) - 재실 중 기상 시간대(07~24시)에 간헐적으로 감지 ──────
motion_rows: list[dict] = []
t = window_start_kst
while t <= now_kst:
    day_start = t.replace(hour=7, minute=0, second=0, microsecond=0)
    day_end = t.replace(hour=23, minute=59, second=0, microsecond=0)
    cursor = day_start
    while cursor <= day_end:
        if cursor <= now_kst and not is_outing(cursor):
            motion_rows.append(
                {"device_id": "seed-env-01", "metric": "motion", "value": 1, "recorded_at": cursor.astimezone(timezone.utc).isoformat()}
            )
        cursor += timedelta(minutes=random.randint(25, 55))
    t += timedelta(days=1)
n = chunked_insert("sensor_readings", motion_rows)
print(f"motion readings inserted: {n}")

# ── 5. 재실(presence) - 외출/외박 구간만 0, 나머지는 1 (4시간 간격 체크포인트) ──
presence_rows: list[dict] = []
t = window_start_kst
while t <= now_kst:
    value = 0 if is_outing(t) else 1
    presence_rows.append({"device_id": "seed-cam-01", "metric": "presence", "value": value, "recorded_at": t.astimezone(timezone.utc).isoformat()})
    t += timedelta(hours=4)
n = chunked_insert("sensor_readings", presence_rows)
print(f"presence readings inserted: {n}")

# ── 6. 전력 사용량(energy_kwh, PZEM 누적값) - 하루 6포인트(4시간 간격), 30일 ──
energy_rows: list[dict] = []
cumulative = 1200.0  # 기존 누적 총량(임의의 시작값 - 실제 미터는 계속 누적되는 값이라 0이 아닌 게 자연스러움)
t = window_start_kst
while t <= now_kst:
    cumulative += random.uniform(0.5, 1.3)  # 4시간당 사용량
    energy_rows.append({"device_id": "seed-power-01", "metric": "energy_kwh", "value": round(cumulative, 2), "recorded_at": t.astimezone(timezone.utc).isoformat()})
    t += timedelta(hours=4)
n = chunked_insert("sensor_readings", energy_rows)
print(f"energy_kwh readings inserted: {n} (누적 {round(cumulative - 1200.0, 1)}kWh / {DAYS}일)")

# ── 7. 취침 기록 (30일치, 23~01시 취침 -> 6.5~8.5시간 후 기상) ────────────
sleep_rows: list[dict] = []
d = window_start_kst.date()
end_date = now_kst.date()
while d <= end_date:
    bedtime = datetime(d.year, d.month, d.day, 23, random.randint(0, 59), tzinfo=KST) + timedelta(minutes=random.choice([0, 0, 30, 60]))
    duration_h = random.uniform(6.5, 8.5)
    wake = bedtime + timedelta(hours=duration_h)
    if wake <= now_kst:
        sleep_rows.append(
            {
                "sleep_started_at": bedtime.astimezone(timezone.utc).isoformat(),
                "sleep_ended_at": wake.astimezone(timezone.utc).isoformat(),
            }
        )
    d += timedelta(days=1)
n = chunked_insert("sleep_records", sleep_rows)
print(f"sleep_records inserted: {n}")

# ── 8. 알림함 (30일에 걸쳐 다양한 유형) ───────────────────────────────────
NOTI_TEMPLATES = [
    ("취침 중이신가요?", "30분간 움직임이 없었어요"),
    ("✅ 취침 모드 활성화됨", "조명 OFF, 에어컨 22°C로 전환했어요"),
    ("⚡ 절전 목표 달성!", "이번 주 목표 대비 12% 절감했어요"),
    ("🔥 이상 패턴 감지", "히터가 3시간 이상 켜져 있어요"),
    ("🤖 자동화 규칙 실행", "외출 감지에 따라 조명을 껐어요"),
    ("🌙 기상 감지", "좋은 아침이에요! 오늘도 절전 목표 화이팅"),
]
noti_rows: list[dict] = []
t = window_start_kst
while t <= now_kst:
    if random.random() < 0.6:  # 하루에 60% 확률로 알림 1건
        title, message = random.choice(NOTI_TEMPLATES)
        created_at = (t + timedelta(hours=random.randint(6, 22))).astimezone(timezone.utc)
        if created_at <= now_utc:
            noti_rows.append(
                {
                    "title": title,
                    "message": message,
                    "read": created_at < now_utc - timedelta(days=2),  # 이틀 이상 지난 알림은 읽음 처리
                    "created_at": created_at.isoformat(),
                }
            )
    t += timedelta(days=1)
n = chunked_insert("notifications", noti_rows)
print(f"notifications inserted: {n}")

# ── 9. 캘린더 - DAILY 루틴 + SPECIAL(외출/외박/일반) ──────────────────────
daily_items = [
    {"list_kind": "daily", "time": "07:00", "label": "기상 알림", "weekdays": [0, 1, 2, 3, 4, 5, 6]},
    {"list_kind": "daily", "time": "08:30", "label": "조명 자동 ON", "weekdays": [1, 2, 3, 4, 5]},
    {"list_kind": "daily", "time": "23:30", "label": "조명 자동 OFF", "weekdays": [0, 1, 2, 3, 4, 5, 6]},
]
special_items = [
    {"list_kind": "special", "time": "14:00", "label": "외출 - 병원", "special_kind": "outing", "item_year": 2026, "item_month": 7, "item_day": 15},
    {"list_kind": "special", "time": "10:00", "label": "친구 집 외박", "special_kind": "overnight", "item_year": 2026, "item_month": 7, "item_day": 20},
    {"list_kind": "special", "time": "18:00", "label": "생일 파티", "special_kind": "general", "item_year": 2026, "item_month": 7, "item_day": 25},
]
chunked_insert("schedule_items", daily_items)
chunked_insert("schedule_items", special_items)
print(f"schedule_items inserted: {len(daily_items)} daily + {len(special_items)} special")

# ── 10. 자동화 규칙 ────────────────────────────────────────────────────
automation_rows = [
    {
        "trigger": {"kind": "outing"},
        "offset_minutes": 10,
        "room_id": ROOM_ID,
        "action": {"kind": "device_off", "deviceName": "조명"},
        "enabled": True,
    },
    {
        "trigger": {"kind": "presence"},
        "offset_minutes": 0,
        "room_id": ROOM_ID,
        "action": {"kind": "presence_temp", "homeTemp": 24, "awayTemp": 18},
        "enabled": True,
    },
]
chunked_insert("automation_rules", automation_rows)
print(f"automation_rules inserted: {len(automation_rows)}")

# ── 11. 생활 패턴 분류 이벤트 (오늘 하루치만 - /pattern/today가 자정 이후만 봄) ──
today_start = now_kst.replace(hour=0, minute=0, second=0, microsecond=0)
TIMELINE = [
    (0, "Bed_Activity"),
    (7, "Moving"),
    (7.2, "Desk_Activity"),
    (12, "Out_of_Room"),
    (13, "Desk_Activity"),
    (18.5, "Moving"),
    (18.8, "Bed_Activity"),
    (20, "Desk_Activity"),
]
pattern_rows: list[dict] = []
for hour_offset, label in TIMELINE:
    ts = today_start + timedelta(hours=hour_offset)
    if ts <= now_kst:
        pattern_rows.append(
            {
                "device_id": "seed-cam-01",
                "model": "life_pattern",
                "label": label,
                "confidence": round(random.uniform(0.82, 0.98), 2),
                "recorded_at": ts.astimezone(timezone.utc).isoformat(),
            }
        )
n = chunked_insert("classification_events", pattern_rows)
print(f"classification_events inserted: {n}")

# ── 12. 앱 설정 - 1인 가구 절전 목표 ───────────────────────────────────
supabase.table("app_settings").update({"household_size": 1, "goal_kwh": 150, "address": "서울시 어딘가 원룸"}).eq("id", 1).execute()
print("app_settings updated: household_size=1, goal_kwh=150")

print("\n완료. 앱을 새로고침해서 Main/SmartHomeControl/EnergyUsage/Calendar/SleepStats/LifePattern/BillReceipt/EnergyTree 화면을 확인하세요.")
