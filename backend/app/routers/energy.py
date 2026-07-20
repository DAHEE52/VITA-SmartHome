from collections import defaultdict
from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Query

from app.schemas import EnergySeries, EnergyUsage, Period, SeriesPoint
from app.supabase_client import get_supabase

router = APIRouter(tags=["energy"])

KST = ZoneInfo("Asia/Seoul")


def _bucket_key(dt: datetime, period: Period) -> str:
    local = dt.astimezone(KST)
    if period == "day":
        return local.strftime("%Y-%m-%d %H")
    if period == "month":
        return local.strftime("%Y-%m-%d")
    return local.strftime("%Y")


def _bucket_label(key: str, period: Period) -> str:
    if period == "day":
        return key[-2:] + "시"
    if period == "month":
        return key[5:].replace("-", "/")
    return key + "년"


def _power_monitor_devices() -> list[dict]:
    supabase = get_supabase()
    res = supabase.table("devices").select("id, label").eq("type", "power_monitor").execute()
    return res.data


def _cumulative_readings(device_id: str) -> list[tuple[datetime, float]]:
    supabase = get_supabase()
    res = (
        supabase.table("sensor_readings")
        .select("value, recorded_at")
        .eq("device_id", device_id)
        .eq("metric", "energy_kwh")
        .order("recorded_at", desc=False)
        .execute()
    )
    return [(datetime.fromisoformat(row["recorded_at"]), row["value"]) for row in res.data]


def _bucket_usage(readings: list[tuple[datetime, float]], period: Period) -> dict[str, float]:
    """버킷별 마지막 누적값(PZEM 적산 전력량)을 구한 뒤, 인접 버킷 간 차분해서 사용량을 계산한다."""
    last_in_bucket: dict[str, float] = {}
    for dt, value in readings:  # readings는 시간순 정렬 -> 마지막 대입이 해당 버킷의 최신값
        last_in_bucket[_bucket_key(dt, period)] = value

    usage: dict[str, float] = {}
    prev_value = None
    for key in sorted(last_in_bucket.keys()):
        value = last_in_bucket[key]
        usage[key] = (value - prev_value) if prev_value is not None else 0.0
        prev_value = value
    return usage


@router.get("/energy/usage", response_model=EnergyUsage)
def energy_usage(period: Period = Query("month")):
    devices = _power_monitor_devices()

    series: list[EnergySeries] = []
    yearly_totals: dict[str, float] = defaultdict(float)

    for device in devices:
        readings = _cumulative_readings(device["id"])
        usage = _bucket_usage(readings, period)
        series.append(
            EnergySeries(
                device_id=device["id"],
                label=device["label"] or device["id"],
                points=[
                    SeriesPoint(x_label=_bucket_label(key, period), value=round(val, 3))
                    for key, val in sorted(usage.items())
                ],
            )
        )

        # 전년 대비(%) 계산은 선택된 period와 무관하게 항상 연 단위로 별도 집계
        for year_key, val in _bucket_usage(readings, "year").items():
            yearly_totals[year_key] += val

    year_over_year_pct = None
    years = sorted(yearly_totals.keys())
    if len(years) >= 2:
        prev_total, curr_total = yearly_totals[years[-2]], yearly_totals[years[-1]]
        if prev_total > 0:
            # 양수 = 작년보다 감소, 음수 = 증가 (프론트에서 부호 보고 라벨 결정)
            year_over_year_pct = round((prev_total - curr_total) / prev_total * 100, 1)

    return EnergyUsage(series=series, year_over_year_pct=year_over_year_pct)
