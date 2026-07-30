import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Header

from app.anomaly.detector import RuleBasedAnomalyEngine
from app.anomaly.store import evaluate_and_respond, ingest_power_reading
from app.deps import verify_device_key
from app.schemas import ClassifyIn, CommandAck, DeviceRegister, PendingCommand, ReadingsIn
from app.supabase_client import get_supabase

router = APIRouter(prefix="/devices", tags=["devices"])

# anomaly.py 라우터와 별개 인스턴스지만 상태를 안 갖는 엔진이라 문제없다(판정에 필요한 값은
# 전부 매 호출마다 evaluate_and_respond에 넘기는 컨텍스트에서 온다).
_anomaly_engine = RuleBasedAnomalyEngine()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@router.post("/register")
def register_device(body: DeviceRegister, x_device_key: str = Header(...)):
    verify_device_key(body.device_id, x_device_key)
    supabase = get_supabase()
    now_iso = _now_iso()
    existing = supabase.table("devices").select("id").eq("id", body.device_id).execute()

    if existing.data:
        # 재부팅 등으로 이미 등록된 기기가 다시 register를 호출한 경우 —
        # 방 배정/이름은 앱에서 관리하는 값이므로 덮어쓰지 않고 생존 신호만 갱신한다.
        # state는 예외 - body.state가 왔다는 건 릴레이가 방금 부팅하며 실제로 그 상태로
        # 초기화됐다는 뜻이라, 정전/재부팅 전의 낡은 DB 값을 실제 물리 상태로 맞춰준다.
        update: dict = {"type": body.type, "last_seen_at": now_iso}
        if body.state is not None:
            update["state"] = body.state
        supabase.table("devices").update(update).eq("id", body.device_id).execute()
    else:
        label = body.label or f"unregistered-{uuid.uuid4().hex[:6]}"
        # "기기 추가"는 Tapo 스마트 콘센트(tapo_mqtt_bridge.py가 등록하는, id가 "tapo-"로 시작하는
        # 기기)만 대상으로 한다 - ESP32 센서/릴레이 노드는 방에 자동 배정하지 않는다(원룸이라
        # 배정 자체는 의미 없는 개념이지만, 그거와 별개로 스마트 콘센트가 아닌 기기가 기기 목록에
        # 섞여 나오는 걸 원치 않음). room_id=None이면 앱 어디에도 안 보이는 상태로 남는다.
        if body.device_id.startswith("tapo-"):
            room_res = supabase.table("rooms").select("id").limit(1).execute()
            room_id = room_res.data[0]["id"] if room_res.data else supabase.table("rooms").insert({"name": "ROOM"}).execute().data[0]["id"]
        else:
            room_id = None
        supabase.table("devices").insert(
            {
                "id": body.device_id,
                "room_id": room_id,
                "type": body.type,
                "label": label,
                "state": body.state or "off",
                "last_seen_at": now_iso,
                # 새 기기는 이 요청의 키로 확정 - verify_device_key가 신규 기기를 그냥 통과시켜준
                # 대신, 여기서 실제로 저장해야 다음 요청부터 이 키로만 인증된다.
                "device_key": x_device_key,
            }
        ).execute()

    return {"ok": True}


@router.post("/{device_id}/readings")
def post_readings(device_id: str, body: ReadingsIn, x_device_key: str = Header(...)):
    verify_device_key(device_id, x_device_key)
    supabase = get_supabase()
    rows = [
        {"device_id": device_id, "metric": r.metric, "value": r.value}
        for r in body.readings
    ]
    if rows:
        supabase.table("sensor_readings").insert(rows).execute()
    supabase.table("devices").update({"last_seen_at": _now_iso()}).eq("id", device_id).execute()

    # 전력 표본이 새로 들어올 때마다 학습(1~3단계)을 먼저 갱신한 뒤, 그 최신 상태로 판정(4~7단계)한다.
    # 앱이 열려 있지 않아도 "위험" 등급이면 즉시 전원을 차단하기 위해 조회(GET /anomaly)가 아니라
    # 여기(수신 시점)에서 실행한다.
    power_readings = [r for r in body.readings if r.metric == "power_w"]
    if power_readings:
        now = datetime.now(timezone.utc)
        for reading in power_readings:
            ingest_power_reading(supabase, device_id, reading.value, now)
        evaluate_and_respond(supabase, _anomaly_engine, device_id, now, power_readings[-1].value)

    return {"ok": True}


@router.post("/{device_id}/classify")
def post_classification(device_id: str, body: ClassifyIn, x_device_key: str = Header(...)):
    """생활 패턴 비전 모델(life_pattern_vision_node)이 분류 결과를 push하는 엔드포인트.
    아직 모델이 배포되기 전에는 아무 기기도 이 경로를 호출하지 않는다."""
    verify_device_key(device_id, x_device_key)
    supabase = get_supabase()
    supabase.table("classification_events").insert(
        {"device_id": device_id, "model": body.model, "label": body.label, "confidence": body.confidence}
    ).execute()
    supabase.table("devices").update({"last_seen_at": _now_iso()}).eq("id", device_id).execute()
    return {"ok": True}


@router.get("/{device_id}/commands/pending", response_model=list[PendingCommand])
def get_pending_commands(device_id: str, x_device_key: str = Header(...)):
    verify_device_key(device_id, x_device_key)
    supabase = get_supabase()
    res = (
        supabase.table("device_commands")
        .select("id, command")
        .eq("device_id", device_id)
        .eq("status", "pending")
        .order("created_at", desc=False)
        .execute()
    )
    # relay_node는 센서값을 보내지 않고 2.5초마다 이 엔드포인트만 폴링하므로, 여기서도
    # last_seen_at을 갱신해야 릴레이의 온라인 여부를 판단할 수 있다 (안 하면 register() 이후
    # 계속 폴링 중이어도 부팅 시각에 멈춰있어 오프라인처럼 보임).
    supabase.table("devices").update({"last_seen_at": _now_iso()}).eq("id", device_id).execute()
    return res.data


@router.post("/{device_id}/commands/{command_id}/ack")
def ack_command(device_id: str, command_id: int, body: CommandAck, x_device_key: str = Header(...)):
    verify_device_key(device_id, x_device_key)
    supabase = get_supabase()
    cmd_res = (
        supabase.table("device_commands").select("command").eq("id", command_id).single().execute()
    )
    supabase.table("device_commands").update(
        {"status": body.status, "executed_at": _now_iso()}
    ).eq("id", command_id).execute()

    if body.status == "done":
        # command는 "on"/"off" 외에 밝기 조명이면 "0"~"100" 숫자 문자열도 올 수 있다(rooms.py의
        # control_device와 동일한 규칙) - "off"/"0"만 꺼짐이고, 그 외(밝기 값 포함)는 켜짐이다.
        new_state = "off" if cmd_res.data["command"] in ("off", "0") else "on"
        supabase.table("devices").update({"state": new_state}).eq("id", device_id).execute()

    return {"ok": True}
