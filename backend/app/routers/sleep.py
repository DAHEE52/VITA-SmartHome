from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from app.schemas import (
    Period,
    SleepPresetOut,
    SleepPresetUpdate,
    SleepRecordCreate,
    SleepRecordEnd,
    SleepRecordOut,
)
from app.supabase_client import get_supabase

router = APIRouter(prefix="/sleep", tags=["sleep"])

# app_settings/sleep_preset과 같은 이유(로그인/멀티유저 없는 프로토타입)로 id=1 싱글턴 행 하나만 쓴다.
_PRESET_ROW_ID = 1


@router.get("/preset", response_model=SleepPresetOut)
def get_preset():
    supabase = get_supabase()
    res = supabase.table("sleep_preset").select("*").eq("id", _PRESET_ROW_ID).execute()
    row = dict(res.data[0])
    row.pop("id", None)
    return SleepPresetOut(**row)


@router.patch("/preset", response_model=SleepPresetOut)
def update_preset(body: SleepPresetUpdate):
    supabase = get_supabase()
    update = body.model_dump(exclude_unset=True)
    if update:
        res = supabase.table("sleep_preset").update(update).eq("id", _PRESET_ROW_ID).execute()
        row = dict(res.data[0])
    else:
        row = dict(supabase.table("sleep_preset").select("*").eq("id", _PRESET_ROW_ID).execute().data[0])
    row.pop("id", None)
    return SleepPresetOut(**row)


def _period_start(period: Period) -> datetime:
    now = datetime.now(timezone.utc)
    if period == "day":
        return now.replace(hour=0, minute=0, second=0, microsecond=0)
    if period == "month":
        return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    return now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)


@router.get("/records", response_model=list[SleepRecordOut])
def list_records(period: Period = Query("month")):
    supabase = get_supabase()
    since = _period_start(period).isoformat()
    res = (
        supabase.table("sleep_records")
        .select("id, sleep_started_at, sleep_ended_at")
        .gte("sleep_started_at", since)
        .order("sleep_started_at", desc=True)
        .execute()
    )
    return [SleepRecordOut(**row) for row in res.data]


@router.post("/records", response_model=SleepRecordOut, status_code=201)
def create_record(body: SleepRecordCreate):
    supabase = get_supabase()
    res = supabase.table("sleep_records").insert({"sleep_started_at": body.sleep_started_at}).execute()
    return SleepRecordOut(**res.data[0])


@router.patch("/records/{record_id}", response_model=SleepRecordOut)
def end_record(record_id: int, body: SleepRecordEnd):
    supabase = get_supabase()
    existing = supabase.table("sleep_records").select("id").eq("id", record_id).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="sleep record not found")

    res = (
        supabase.table("sleep_records")
        .update({"sleep_ended_at": body.sleep_ended_at})
        .eq("id", record_id)
        .execute()
    )
    return SleepRecordOut(**res.data[0])
