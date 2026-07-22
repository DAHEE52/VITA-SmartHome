from app.schemas import NotificationCreate, NotificationOut
from app.supabase_client import get_supabase
from fastapi import APIRouter

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=list[NotificationOut])
def get_notifications():
    supabase = get_supabase()
    res = supabase.table("notifications").select("*").order("created_at", desc=True).execute()
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
