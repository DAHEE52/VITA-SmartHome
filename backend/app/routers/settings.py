from app.schemas import AppSettingsOut, AppSettingsUpdate
from app.supabase_client import get_supabase
from fastapi import APIRouter

router = APIRouter(prefix="/settings", tags=["settings"])

# 로그인/멀티유저가 없는 프로토타입 단계라, app_settings 테이블은 id=1인 행 하나만 쓴다
# (절전 목표 + 환경설정을 사용자별이 아니라 앱 전체 기준으로 하나만 저장).
_SETTINGS_ROW_ID = 1


@router.get("", response_model=AppSettingsOut)
def get_settings():
    supabase = get_supabase()
    res = supabase.table("app_settings").select("*").eq("id", _SETTINGS_ROW_ID).execute()
    return AppSettingsOut(**res.data[0])


@router.patch("", response_model=AppSettingsOut)
def update_settings(body: AppSettingsUpdate):
    supabase = get_supabase()
    update = body.model_dump(exclude_unset=True)
    if update:
        res = supabase.table("app_settings").update(update).eq("id", _SETTINGS_ROW_ID).execute()
        row = res.data[0]
    else:
        row = supabase.table("app_settings").select("*").eq("id", _SETTINGS_ROW_ID).execute().data[0]
    return AppSettingsOut(**row)
