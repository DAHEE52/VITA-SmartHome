"""에너지 사용량 화면(연/월/일 탭)이 빈 그래프로 보이지 않게 채우는 전용 시드 스크립트.

실제 전력계(Tapo 등)는 최근 며칠치 실측값만 있어서 "연" 탭(5개년 비교)이나 "월" 탭의
전월 대비 비교가 사실상 항상 0%/1점짜리로 나온다. 여기서는 room_id를 비워둔(=어느 방에도
배정되지 않은) 가짜 전력계 기기 하나를 만들어 2022~2025년 연말 누적치 + 2026년 1월~어제
일별 누적치 + 최근 3일 2시간 간격 누적치를 채운다. room_id가 없으므로 RoomsContext가 보여주는
스마트홈 제어 화면의 기기 카드 목록에는 나타나지 않고(= 실제 기기 카드 목록을 오염시키지
않음), backend/app/routers/energy.py의 /energy/usage는 room_id와 무관하게 type=power_monitor
전체를 합산하므로 그래프에는 정상적으로 반영된다.

여러 번 실행해도 안전하다 - 이 기기 id로 이미 있는 sensor_readings를 먼저 지우고 다시 채운다.

실행: backend 폴더에서 `venv/Scripts/python seed_energy_history.py`
"""

import random
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from app.supabase_client import get_supabase

supabase = get_supabase()
random.seed(20260731)

KST = ZoneInfo("Asia/Seoul")
DEVICE_ID = "demo-power-history"

now_utc = datetime.now(timezone.utc)
now_kst = now_utc.astimezone(KST)


def chunked_insert(table: str, rows: list[dict], size: int = 200) -> int:
    for i in range(0, len(rows), size):
        supabase.table(table).insert(rows[i : i + size]).execute()
    return len(rows)


# ── 0. 기기 등록 (room_id 없음 - 스마트홈 제어 화면 카드 목록에는 안 나타남) ──────────
supabase.table("devices").upsert(
    {
        "id": DEVICE_ID,
        "room_id": None,
        "type": "power_monitor",
        "label": "데모 누적 전력량",
        "state": "on",
        "last_seen_at": now_utc.isoformat(),
    }
).execute()
print(f"device upserted: {DEVICE_ID} (room_id=None)")

# 재실행 대비 - 이 기기의 기존 energy_kwh 기록을 지우고 새로 채운다.
supabase.table("sensor_readings").delete().eq("device_id", DEVICE_ID).eq("metric", "energy_kwh").execute()

rows: list[dict] = []
cumulative = 0.0


def add_reading(dt_kst: datetime, value: float):
    rows.append(
        {
            "device_id": DEVICE_ID,
            "metric": "energy_kwh",
            "value": round(value, 3),
            "recorded_at": dt_kst.astimezone(timezone.utc).isoformat(),
        }
    )


# ── 1. 과거 연도 연말 누적치 (2022~2025) - "연" 탭 5개년 비교용 ───────────────────
# 해마다 조금씩 사용량이 줄어드는 추세로 잡아 "절전형 스마트홈" 스토리에 맞춘다.
YEARLY_TOTALS = {2022: 1900.0, 2023: 1800.0, 2024: 1700.0, 2025: 1600.0}
for year, yearly_kwh in YEARLY_TOTALS.items():
    cumulative += yearly_kwh
    add_reading(datetime(year, 12, 31, 23, 0, tzinfo=KST), cumulative)
print(f"yearly anchor readings: {len(YEARLY_TOTALS)} (2025년 말 누적 {cumulative:.0f}kWh)")

# ── 2. 2026년 1/1 ~ (오늘-4일) 일별 누적치 - "월" 탭 일별 그래프/전월 대비용 ────────
daily_start = datetime(2026, 1, 1, 20, 0, tzinfo=KST)
daily_end = (now_kst - timedelta(days=4)).replace(hour=20, minute=0, second=0, microsecond=0)
t = daily_start
n_daily = 0
while t <= daily_end:
    cumulative += random.uniform(3.5, 5.5)  # 하루 사용량
    add_reading(t, cumulative)
    t += timedelta(days=1)
    n_daily += 1
print(f"daily readings (2026-01-01 ~ D-4): {n_daily} (누적 {cumulative:.0f}kWh)")

# ── 3. 최근 3일, 2시간 간격 누적치 - "일" 탭 시간대별 그래프용(아침/저녁 사용량이 더 크게) ──
hourly_start = (now_kst - timedelta(days=3)).replace(minute=0, second=0, microsecond=0)
t = hourly_start
n_hourly = 0
while t <= now_kst:
    hour = t.hour
    # 출근/기상(7-9시), 저녁(18-23시)에 사용량이 더 크고 새벽엔 적게
    if 7 <= hour < 9 or 18 <= hour < 23:
        usage = random.uniform(0.6, 1.1)
    elif 0 <= hour < 6:
        usage = random.uniform(0.05, 0.2)
    else:
        usage = random.uniform(0.2, 0.5)
    cumulative += usage
    add_reading(t, cumulative)
    t += timedelta(hours=2)
    n_hourly += 1
print(f"hourly readings (최근 3일, 2시간 간격): {n_hourly} (최종 누적 {cumulative:.1f}kWh)")

n = chunked_insert("sensor_readings", rows)
print(f"\n총 {n}건 삽입 완료. 앱에서 에너지 사용량 화면의 연/월/일 탭을 새로고침해서 확인하세요.")
