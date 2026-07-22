from datetime import datetime, timezone

from fastapi import APIRouter, Depends

from app.deps import require_device_key
from app.schemas import CommandAck, DeviceRegister, PendingCommand, ReadingsIn
from app.supabase_client import get_supabase

router = APIRouter(prefix="/devices", tags=["devices"], dependencies=[Depends(require_device_key)])


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@router.post("/register")
def register_device(body: DeviceRegister):
    supabase = get_supabase()
    supabase.table("devices").upsert(
        {
            "id": body.device_id,
            "room": body.room,
            "type": body.type,
            "label": body.label,
            "last_seen_at": _now_iso(),
        }
    ).execute()
    return {"ok": True}


@router.post("/{device_id}/readings")
def post_readings(device_id: str, body: ReadingsIn):
    supabase = get_supabase()
    rows = [
        {"device_id": device_id, "metric": r.metric, "value": r.value}
        for r in body.readings
    ]
    if rows:
        supabase.table("sensor_readings").insert(rows).execute()
    supabase.table("devices").update({"last_seen_at": _now_iso()}).eq("id", device_id).execute()
    return {"ok": True}


@router.get("/{device_id}/commands/pending", response_model=list[PendingCommand])
def get_pending_commands(device_id: str):
    supabase = get_supabase()
    res = (
        supabase.table("device_commands")
        .select("id, command")
        .eq("device_id", device_id)
        .eq("status", "pending")
        .order("created_at", desc=False)
        .execute()
    )
    return res.data


@router.post("/{device_id}/commands/{command_id}/ack")
def ack_command(device_id: str, command_id: int, body: CommandAck):
    supabase = get_supabase()
    cmd_res = (
        supabase.table("device_commands").select("command").eq("id", command_id).single().execute()
    )
    supabase.table("device_commands").update(
        {"status": body.status, "executed_at": _now_iso()}
    ).eq("id", command_id).execute()

    if body.status == "done":
        new_state = "on" if cmd_res.data["command"] == "on" else "off"
        supabase.table("devices").update({"state": new_state}).eq("id", device_id).execute()

    return {"ok": True}
