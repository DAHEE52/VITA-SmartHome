from datetime import datetime, timezone
from statistics import mean

from fastapi import APIRouter

from app.schemas import ControlRequest, DeviceStatus, HomeSummary, RoomStatus
from app.supabase_client import get_supabase

router = APIRouter(tags=["rooms"])


def _latest_reading_per_device(metric: str) -> dict[str, float]:
    """주어진 metric에 대해 device_id별 가장 최근 값만 뽑아낸다."""
    supabase = get_supabase()
    res = (
        supabase.table("sensor_readings")
        .select("device_id, value, recorded_at")
        .eq("metric", metric)
        .order("recorded_at", desc=True)
        .limit(200)
        .execute()
    )
    latest: dict[str, float] = {}
    for row in res.data:
        latest.setdefault(row["device_id"], row["value"])
    return latest


@router.get("/home/summary", response_model=HomeSummary)
def home_summary():
    supabase = get_supabase()
    devices_res = supabase.table("devices").select("state").execute()
    active_device_count = sum(1 for d in devices_res.data if d["state"] == "on")

    humidity_values = list(_latest_reading_per_device("humidity").values())
    temperature_values = list(_latest_reading_per_device("temperature").values())

    return HomeSummary(
        active_device_count=active_device_count,
        humidity=mean(humidity_values) if humidity_values else None,
        temperature=mean(temperature_values) if temperature_values else None,
    )


@router.get("/rooms/status", response_model=list[RoomStatus])
def rooms_status():
    supabase = get_supabase()
    res = supabase.table("devices").select("id, room, type, label, state").execute()

    rooms: dict[str, list[dict]] = {}
    for d in res.data:
        rooms.setdefault(d["room"], []).append(d)

    return [
        RoomStatus(
            room=room,
            active=any(d["state"] == "on" for d in devs),
            devices=[
                DeviceStatus(id=d["id"], label=d["label"], type=d["type"], state=d["state"])
                for d in devs
            ],
        )
        for room, devs in rooms.items()
    ]


@router.post("/devices/{device_id}/control")
def control_device(device_id: str, body: ControlRequest):
    supabase = get_supabase()
    now_iso = datetime.now(timezone.utc).isoformat()

    # 같은 기기에 대기 중인 이전 명령이 있으면 최신 의도로 덮어쓰기 위해 무효화
    supabase.table("device_commands").update({"status": "superseded"}).eq(
        "device_id", device_id
    ).eq("status", "pending").execute()

    supabase.table("device_commands").insert(
        {"device_id": device_id, "command": body.command, "created_at": now_iso}
    ).execute()

    # 기기가 실제로 반영하기 전이지만, 앱 UI에는 낙관적으로 즉시 반영
    supabase.table("devices").update({"state": body.command}).eq("id", device_id).execute()

    return {"ok": True, "state": body.command}
