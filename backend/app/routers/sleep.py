from fastapi import APIRouter

from app.schemas import SleepPresetOut, SleepPresetUpdate
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
