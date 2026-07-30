import uuid
from datetime import datetime, timedelta, timezone
from statistics import mean

from fastapi import APIRouter, HTTPException

from app.schemas import (
    ControlRequest,
    DeviceOut,
    DeviceStatus,
    DeviceUpdate,
    HomeSummary,
    MockDeviceRegister,
    RoomCreate,
    RoomCreated,
    RoomStatus,
    RoomUpdate,
    RoomWithDevices,
)
from app.supabase_client import get_supabase

router = APIRouter(tags=["rooms"])

# PIR이 이 시간 안에 움직임을 감지했으면 카메라(occupied/empty) 판정과 무관하게 "재실"로 본다.
# 카메라 모델은 8초마다 한 프레임만 보고 판단하는 이미지 분류라, 사람이 짧게 지나가거나 카메라
# 사각지대에서 움직이는 경우를 놓칠 수 있는데 PIR이 이런 순간 이동을 더 잘 잡아낸다.
PRESENCE_MOTION_WINDOW_MINUTES = 10


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _latest_reading_per_device(metric: str) -> dict[str, float]:
    """주어진 metric에 대해 device_id별 가장 최근 값만 뽑아낸다.
    latest_sensor_readings 뷰(DB에서 기기/지표별 DISTINCT ON으로 미리 계산됨)를 조회하므로,
    연결된 센서 수나 누적된 데이터량이 늘어나도 항상 정확하다 - 예전에는 "최근 200행"만 보고
    기기별 첫 값을 취하는 방식이라, 기기 수가 많아지면 어떤 기기는 그 200행 안에 아예 안 걸려
    최신값이 통째로 빠질 수 있었다(자주 push하는 기기가 드물게 push하는 기기의 값을 밀어냄)."""
    supabase = get_supabase()
    res = supabase.table("latest_sensor_readings").select("device_id, value").eq("metric", metric).execute()
    return {row["device_id"]: row["value"] for row in res.data}


def _latest_motion_at() -> str | None:
    """PIR이 움직임을 감지(value==1)한 가장 최근 시각 - 취침 감지(SleepContext)의 '무움직임 경과' 판정 기준."""
    supabase = get_supabase()
    res = (
        supabase.table("sensor_readings")
        .select("recorded_at")
        .eq("metric", "motion")
        .eq("value", 1)
        .order("recorded_at", desc=True)
        .limit(1)
        .execute()
    )
    return res.data[0]["recorded_at"] if res.data else None


def _fuse_presence(camera_presence: bool | None, last_motion_iso: str | None) -> bool | None:
    """카메라(occupied/empty AI 모델) 판정과 PIR 움직임 감지를 합쳐 최종 재실 여부를 낸다.
    PIR이 최근(PRESENCE_MOTION_WINDOW_MINUTES) 안에 움직임을 감지했으면, 카메라가 뭐라고 판단했든
    (심지어 아직 카메라 값이 한 번도 안 왔든) 무조건 재실로 본다 - 카메라 사각지대/순간 이동 보완용.
    둘 다 신호가 없으면(카메라도 없고 최근 움직임도 없으면) 판단 불가(None)를 그대로 유지한다."""
    recent_motion = False
    if last_motion_iso:
        last_motion_dt = datetime.fromisoformat(last_motion_iso)
        recent_motion = (datetime.now(timezone.utc) - last_motion_dt) <= timedelta(minutes=PRESENCE_MOTION_WINDOW_MINUTES)

    if recent_motion:
        return True
    return camera_presence


@router.get("/home/summary", response_model=HomeSummary)
def home_summary():
    supabase = get_supabase()
    devices_res = supabase.table("devices").select("state").execute()
    active_device_count = sum(1 for d in devices_res.data if d["state"] == "on")

    humidity_values = list(_latest_reading_per_device("humidity").values())
    temperature_values = list(_latest_reading_per_device("temperature").values())
    # 카메라(presence_cam)가 여러 대여도 "하나라도 재실로 감지"하면 재실로 본다.
    presence_values = list(_latest_reading_per_device("presence").values())
    camera_presence = any(v == 1 for v in presence_values) if presence_values else None
    last_motion_iso = _latest_motion_at()

    return HomeSummary(
        active_device_count=active_device_count,
        humidity=mean(humidity_values) if humidity_values else None,
        temperature=mean(temperature_values) if temperature_values else None,
        presence=_fuse_presence(camera_presence, last_motion_iso),
        last_motion_at=last_motion_iso,
    )


@router.get("/rooms/status", response_model=list[RoomStatus])
def rooms_status():
    """
    응답 형태(RoomStatus 목록)는 기존 그대로 유지 — 방을 room_id/rooms 테이블
    기반으로 관리하게 되면서 내부적으로만 room_id -> 방 이름 조인을 거친다.
    room_id가 없는(미배정) 기기는 이전처럼 어느 방에도 속하지 않아 응답에서 빠진다.
    """
    supabase = get_supabase()
    devices_res = supabase.table("devices").select("id, room_id, type, label, state").execute()

    room_ids = {d["room_id"] for d in devices_res.data if d["room_id"] is not None}
    room_names: dict[int, str] = {}
    if room_ids:
        rooms_res = supabase.table("rooms").select("id, name").in_("id", list(room_ids)).execute()
        room_names = {r["id"]: r["name"] for r in rooms_res.data}

    rooms: dict[str, list[dict]] = {}
    for d in devices_res.data:
        if d["room_id"] is None or d["room_id"] not in room_names:
            continue
        rooms.setdefault(room_names[d["room_id"]], []).append(d)

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


@router.get("/rooms", response_model=list[RoomWithDevices])
def list_rooms():
    supabase = get_supabase()
    rooms_res = supabase.table("rooms").select("id, name").order("id").execute()
    devices_res = supabase.table("devices").select("id, room_id, type, label, state").execute()

    devices_by_room: dict[int, list[dict]] = {}
    for d in devices_res.data:
        if d["room_id"] is not None:
            devices_by_room.setdefault(d["room_id"], []).append(d)

    return [
        RoomWithDevices(
            id=r["id"],
            name=r["name"],
            devices=[
                DeviceStatus(id=d["id"], label=d["label"], type=d["type"], state=d["state"])
                for d in devices_by_room.get(r["id"], [])
            ],
        )
        for r in rooms_res.data
    ]


@router.post("/rooms", response_model=RoomCreated, status_code=201)
def create_room(body: RoomCreate):
    supabase = get_supabase()
    res = supabase.table("rooms").insert({"name": body.name}).execute()
    created = res.data[0]
    return RoomCreated(id=created["id"], name=created["name"])


@router.patch("/rooms/{room_id}", response_model=RoomCreated)
def update_room(room_id: int, body: RoomUpdate):
    supabase = get_supabase()
    existing = supabase.table("rooms").select("id").eq("id", room_id).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="room not found")

    res = supabase.table("rooms").update({"name": body.name}).eq("id", room_id).execute()
    updated = res.data[0]
    return RoomCreated(id=updated["id"], name=updated["name"])


@router.delete("/rooms/{room_id}")
def delete_room(room_id: int):
    supabase = get_supabase()
    existing = supabase.table("rooms").select("id").eq("id", room_id).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="room not found")

    # 방에 배정된 기기는 삭제하지 않고 미배정(room_id=null) 상태로 되돌린 뒤 방만 지운다
    supabase.table("devices").update({"room_id": None}).eq("room_id", room_id).execute()
    supabase.table("rooms").delete().eq("id", room_id).execute()

    return {"ok": True}


@router.get("/devices/unassigned", response_model=list[DeviceOut])
def get_unassigned_devices():
    """room_id가 없는 기기 목록 - 실제 ESP32가 부팅 시 /devices/register로 자기소개는 마쳤지만
    아직 앱에서 방에 배정되지 않은 상태. 앱의 "기기 추가"가 여기서 골라 PATCH로 배정한다."""
    supabase = get_supabase()
    res = supabase.table("devices").select("id, label, type, state, room_id").is_("room_id", "null").execute()
    return [
        DeviceOut(id=d["id"], label=d["label"], type=d["type"], state=d["state"], room_id=d["room_id"])
        for d in res.data
    ]


@router.get("/devices/{device_id}/latest")
def get_latest_power(device_id: str):
    """이 기기의 가장 최근 순간 소비전력(W) - power_monitor_node가 push한 값이 없으면 null."""
    supabase = get_supabase()
    res = (
        supabase.table("sensor_readings")
        .select("value, recorded_at")
        .eq("device_id", device_id)
        .eq("metric", "power_w")
        .order("recorded_at", desc=True)
        .limit(1)
        .execute()
    )
    if not res.data:
        return {"power_w": None, "recorded_at": None}
    return {"power_w": res.data[0]["value"], "recorded_at": res.data[0]["recorded_at"]}


@router.patch("/devices/{device_id}", response_model=DeviceOut)
def update_device(device_id: str, body: DeviceUpdate):
    supabase = get_supabase()
    existing = supabase.table("devices").select("id, type, label, state, room_id").eq("id", device_id).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="device not found")

    fields = body.model_dump(exclude_unset=True)
    update: dict = {}
    if "name" in fields:
        update["label"] = fields["name"]
    if "room_id" in fields:
        room_id = fields["room_id"]
        if room_id is not None:
            room_exists = supabase.table("rooms").select("id").eq("id", room_id).execute()
            if not room_exists.data:
                raise HTTPException(status_code=404, detail="room not found")
        update["room_id"] = room_id

    row = existing.data[0]
    if update:
        res = supabase.table("devices").update(update).eq("id", device_id).execute()
        row = res.data[0]

    return DeviceOut(id=row["id"], label=row["label"], type=row["type"], state=row["state"], room_id=row["room_id"])


@router.delete("/devices/{device_id}")
def delete_device(device_id: str):
    """기기를 완전히 삭제한다("연결 해제"와 다름 - 그건 room_id만 null로 되돌려 기기 row는 남긴다).
    시연용 예시/mock 기기를 정리하는 용도 - 실제 기기는 다시 켜지면 /devices/register로 스스로
    재등록되므로, 삭제해도 하드웨어 쪽에는 영향이 없다."""
    supabase = get_supabase()
    existing = supabase.table("devices").select("id").eq("id", device_id).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="device not found")

    # FK 제약 때문에 이 기기를 참조하는 하위 기록부터 지워야 devices 행을 지울 수 있다.
    supabase.table("sensor_readings").delete().eq("device_id", device_id).execute()
    supabase.table("device_commands").delete().eq("device_id", device_id).execute()
    supabase.table("classification_events").delete().eq("device_id", device_id).execute()
    supabase.table("devices").delete().eq("id", device_id).execute()

    return {"ok": True}


@router.post("/devices/mock-register", response_model=DeviceOut, status_code=201)
def mock_register_device(body: MockDeviceRegister):
    """
    프로토타입 전용 임시 엔드포인트 — 실제 ESP32 없이도 /devices/register가 만드는
    device row를 그대로 흉내낸다. 실기기가 붙으면 삭제하거나 개발 환경 전용으로 막을 것.
    """
    supabase = get_supabase()
    short_id = uuid.uuid4().hex[:6]
    device_id = f"mock-{short_id}"
    label = body.name or f"unregistered-{short_id}"

    res = supabase.table("devices").insert(
        {
            "id": device_id,
            "room_id": None,
            "type": "relay",
            "label": label,
            "state": "off",
            "last_seen_at": _now_iso(),
        }
    ).execute()
    created = res.data[0]

    return DeviceOut(
        id=created["id"],
        label=created["label"],
        type=created["type"],
        state=created["state"],
        room_id=created["room_id"],
    )


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
