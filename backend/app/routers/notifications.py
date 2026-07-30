from app.schemas import NotificationCreate, NotificationOut
from app.supabase_client import get_supabase
from fastapi import APIRouter

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=list[NotificationOut])
def get_notifications(limit: int = 50):
    """자동화 규칙 실행/이상 감지/저장 실패 등 앱이 스스로 계속 알림을 만들어내므로 이 테이블은
    시간이 지날수록 계속 늘어난다 - 최근 것만 가져와야 오래 쓸수록 이 조회가 점점 느려지는 걸
    막을 수 있다(화면(NotificationsModal)도 최근 목록만 보여주면 충분)."""
    supabase = get_supabase()
    res = supabase.table("notifications").select("*").order("created_at", desc=True).limit(limit).execute()
    return res.data


@router.post("", response_model=NotificationOut)
def create_notification(body: NotificationCreate):
    supabase = get_supabase()
    res = supabase.table("notifications").insert({"title": body.title, "message": body.message}).execute()
    return res.data[0]


@router.post("/{notification_id}/read")
def mark_read(notification_id: int):
    supabase = get_supabase()
    supabase.table("notifications").update({"read": True}).eq("id", notification_id).execute()
    return {"ok": True}


@router.delete("/{notification_id}")
def delete_notification(notification_id: int):
    supabase = get_supabase()
    supabase.table("notifications").delete().eq("id", notification_id).execute()
    return {"ok": True}
