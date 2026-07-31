from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Query

from app.schemas import EnergySeries, EnergyUsage, Period, SeriesPoint
from app.supabase_client import get_supabase

router = APIRouter(tags=["energy"])

KST = ZoneInfo("Asia/Seoul")

# 기기가 몇 초~몇 분 간격으로 계속 전력값을 push하므로, 조회 기간을 안 잘라내면 기기 하나당
# sensor_readings 행이 시간이 지날수록(기기/사용자 수와 무관하게 그냥 "서비스 운영 기간"에 비례해)
# 계속 쌓여 이 쿼리가 점점 느려진다 - 실제로 화면에 보여주는 건 period별로 최근 몇 개 구간뿐이므로
# (EnergyUsageScreen의 POINT_COUNT), 그보다 넉넉하게만 거슬러 올라가면 충분하다.
# month는 "이번 달 대비 전월"(aggregateByMonth) 계산 때문에 최소 두 달치가 필요해서 더 넉넉히 잡는다.
_LOOKBACK_DAYS: dict[Period, int] = {"day": 3, "month": 70, "year": 365 * 4}


def _bucket_key(dt: datetime, period: Period) -> str:
    local = dt.astimezone(KST)
    if period == "day":
        return local.strftime("%Y-%m-%d")
    if period == "month":
        return local.strftime("%Y-%m")
    return local.strftime("%Y")


def _bucket_label(key: str, period: Period) -> str:
    if period == "day":
        return key[5:].replace("-", "/")
    if period == "month":
        return str(int(key[5:7])) + "월"
    return key + "년"


def _power_monitor_devices() -> list[dict]:
    supabase = get_supabase()
    res = supabase.table("devices").select("id, label").eq("type", "power_monitor").execute()
    return res.data


def _cumulative_readings(device_id: str, period: Period) -> list[tuple[datetime, float]]:
    supabase = get_supabase()
    since = (datetime.now(timezone.utc) - timedelta(days=_LOOKBACK_DAYS[period])).isoformat()
    res = (
        supabase.table("sensor_readings")
        .select("value, recorded_at")
        .eq("device_id", device_id)
        .eq("metric", "energy_kwh")
        .gte("recorded_at", since)
        .order("recorded_at", desc=False)
        .execute()
    )
    return [(datetime.fromisoformat(row["recorded_at"]), row["value"]) for row in res.data]


def _bucket_usage(readings: list[tuple[datetime, float]], period: Period) -> dict[str, float]:
    """버킷별 마지막 누적값(적산 전력량)을 구한 뒤, 인접 버킷 간 차분해서 사용량을 계산한다.

    누적값이 항상 증가한다고 가정하지 않는다 - 기기 재부팅(PZEM 카운터 리셋)이나 Tapo 자체
    누적치처럼 주기적으로 0 근처로 리셋되는 값도 들어올 수 있다. 새 값이 이전 값보다 작으면
    "리셋 이후 다시 쌓인 양"으로 보고 그 값 자체를 이번 구간 사용량으로 취급한다 - 그냥
    (value - prev_value)를 쓰면 리셋 시점에 음수가 나와 사용량이 깎여 보이는 버그가 생긴다."""
    last_in_bucket: dict[str, float] = {}
    for dt, value in readings:  # readings는 시간순 정렬 -> 마지막 대입이 해당 버킷의 최신값
        last_in_bucket[_bucket_key(dt, period)] = value

    usage: dict[str, float] = {}
    prev_value = None
    for key in sorted(last_in_bucket.keys()):
        value = last_in_bucket[key]
        if prev_value is None:
            usage[key] = 0.0
        elif value < prev_value:
            usage[key] = value
        else:
            usage[key] = value - prev_value
        prev_value = value
    return usage


@router.get("/energy/usage", response_model=EnergyUsage)
def energy_usage(period: Period = Query("month")):
    devices = _power_monitor_devices()

    series: list[EnergySeries] = []
    for device in devices:
        readings = _cumulative_readings(device["id"], period)
        usage = _bucket_usage(readings, period)
        series.append(
            EnergySeries(
                device_id=device["id"],
                label=device["label"] or device["id"],
                points=[
                    SeriesPoint(x_label=_bucket_label(key, period), value=round(val, 3), sort_key=key)
                    for key, val in sorted(usage.items())
                ],
            )
        )

    return EnergyUsage(series=series)
