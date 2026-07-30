# 이상 감지 도메인 객체(models.py)와 Supabase 테이블을 연결하는 저장소 계층.
# detector.py(순수 판정 로직)와 분리해둬서, 저장 방식을 바꾸더라도(예: 나중에 다른 DB로 이전)
# 판정 로직은 전혀 손댈 필요가 없게 한다.
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.anomaly.constants import POWER_ON_THRESHOLD_W, TEMPERATURE_RISE_WINDOW_MINUTES
from app.anomaly.detector import AnomalyContext, AnomalyResult, BaseAnomalyEngine
from app.anomaly.models import DeviceLearningProfile, RunningStats, UsageMode
from app.services.sms_service import send_emergency_alert


def _parse_dt(value: str) -> datetime:
    return datetime.fromisoformat(value)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── 프로필 읽기/쓰기 ──────────────────────────────────────────────────────────
def load_profile(supabase, device_id: str, now: datetime) -> DeviceLearningProfile:
    """저장된 학습 프로필 + 모드 목록을 읽어온다. 아직 한 번도 학습을 시작하지 않은 기기면
    지금 이 순간을 학습 시작 시각으로 삼아 새 프로필을 만든다."""
    res = supabase.table("device_learning_profile").select("*").eq("device_id", device_id).execute()
    if res.data:
        row = res.data[0]
        profile = DeviceLearningProfile(
            device_id=device_id,
            learning_started_at=_parse_dt(row["learning_started_at"]),
            power=RunningStats.from_dict(row.get("power_stats")),
            duration=RunningStats.from_dict(row.get("duration_stats")),
            hourly_frequency=list(row.get("hourly_frequency") or [0] * 24),
            power_history=list(row.get("power_history") or []),
            session_started_at=_parse_dt(row["session_started_at"]) if row.get("session_started_at") else None,
            session_power_sum=row.get("session_power_sum", 0.0),
            session_power_count=row.get("session_power_count", 0),
        )
    else:
        profile = DeviceLearningProfile(device_id=device_id, learning_started_at=now)

    modes_res = (
        supabase.table("device_usage_mode").select("*").eq("device_id", device_id).order("mode_index").execute()
    )
    profile.modes = [
        UsageMode(
            mode_index=row["mode_index"],
            power=RunningStats.from_dict(row.get("power_stats")),
            duration=RunningStats.from_dict(row.get("duration_stats")),
        )
        for row in modes_res.data
    ]
    return profile


def save_profile(supabase, profile: DeviceLearningProfile) -> None:
    """프로필 + 모드 전체를 저장한다(있으면 갱신, 없으면 새로 만듦 - upsert가 없는 테스트용
    더블에서도 동작하도록 select 후 update/insert로 직접 분기한다)."""
    row = {
        "learning_started_at": profile.learning_started_at.isoformat(),
        "power_stats": profile.power.to_dict(),
        "duration_stats": profile.duration.to_dict(),
        "hourly_frequency": profile.hourly_frequency,
        "power_history": profile.power_history,
        "session_started_at": profile.session_started_at.isoformat() if profile.session_started_at else None,
        "session_power_sum": profile.session_power_sum,
        "session_power_count": profile.session_power_count,
        "updated_at": _now_iso(),
    }
    existing = (
        supabase.table("device_learning_profile").select("device_id").eq("device_id", profile.device_id).execute()
    )
    if existing.data:
        supabase.table("device_learning_profile").update(row).eq("device_id", profile.device_id).execute()
    else:
        supabase.table("device_learning_profile").insert({**row, "device_id": profile.device_id}).execute()

    for mode in profile.modes:
        mode_row = {
            "power_stats": mode.power.to_dict(),
            "duration_stats": mode.duration.to_dict(),
            "updated_at": _now_iso(),
        }
        existing_mode = (
            supabase.table("device_usage_mode")
            .select("id")
            .eq("device_id", profile.device_id)
            .eq("mode_index", mode.mode_index)
            .execute()
        )
        if existing_mode.data:
            supabase.table("device_usage_mode").update(mode_row).eq("id", existing_mode.data[0]["id"]).execute()
        else:
            supabase.table("device_usage_mode").insert(
                {**mode_row, "device_id": profile.device_id, "mode_index": mode.mode_index}
            ).execute()


# ── 1~3단계: 새 전력 표본을 온라인으로 학습에 반영 ───────────────────────────
def ingest_power_reading(supabase, device_id: str, power_w: float, recorded_at: datetime) -> DeviceLearningProfile:
    """전력 표본 하나를 학습 프로필에 반영한다. devices.py가 /devices/{id}/readings로 power_w
    지표를 받을 때마다 호출한다 - 14일치 원시 데이터를 다시 훑지 않고(Welford 온라인 갱신) 매번
    O(1)로 평균/분산/모드를 최신 상태로 유지한다.

    학습 기간(1단계, 14일)이 끝나면 모드 목록(2/3단계)은 더 이상 새로 만들거나 갱신하지 않는다 -
    계속 살아있는 채로 두면, 평소와 동떨어진 전력값이 들어올 때마다 그 값 자체가 새 모드(또는
    가장 가까운 모드)로 흡수돼버려서 "자기 자신과 비교"하는 꼴이 되어 영원히 이상으로 잡히지
    않는다. 학습이 끝난 뒤에는 모드를 "이미 정해진 기준선"으로 고정하고, 조건1(전력 이상)은 그
    고정된 기준선과만 비교한다. (전체 평균/사용시간/시간대 빈도/급변 이력은 계속 갱신한다 -
    조건2/5/6은 기준선이 아니라 그때그때의 실측 비교라 계속 최신 상태를 유지해야 의미가 있다.)
    """
    profile = load_profile(supabase, device_id, recorded_at)
    learning_complete = profile.is_learning_complete(recorded_at)

    was_on = profile.session_started_at is not None
    is_on = power_w >= POWER_ON_THRESHOLD_W

    if is_on and not was_on:
        profile.session_started_at = recorded_at
        profile.session_power_sum = 0.0
        profile.session_power_count = 0

    if is_on:
        profile.power.update(power_w)
        if not learning_complete:
            mode = profile.find_or_create_mode(power_w)
            mode.power.update(power_w)
        profile.session_power_sum += power_w
        profile.session_power_count += 1

    if not is_on and was_on:
        duration_sec = (recorded_at - profile.session_started_at).total_seconds()
        avg_session_power = (
            profile.session_power_sum / profile.session_power_count
            if profile.session_power_count > 0
            else power_w
        )
        profile.duration.update(duration_sec)
        if not learning_complete:
            session_mode = profile.find_or_create_mode(avg_session_power)
            session_mode.duration.update(duration_sec)
        profile.session_started_at = None
        profile.session_power_sum = 0.0
        profile.session_power_count = 0

    profile.hourly_frequency[recorded_at.hour] += 1
    profile.push_power_history(power_w)

    save_profile(supabase, profile)
    return profile


# ── 판정에 필요한 부가 정보 조회 (PIR/온도) ──────────────────────────────────
# VITA는 원룸 전용이라 방이 항상 하나뿐이므로, 다른 화면(/home/summary)과 동일하게 방 구분 없이
# 집 전체 기준으로 조회한다.
def get_minutes_since_motion(supabase, now: datetime) -> float | None:
    res = (
        supabase.table("sensor_readings")
        .select("recorded_at")
        .eq("metric", "motion")
        .eq("value", 1)
        .order("recorded_at", desc=True)
        .limit(1)
        .execute()
    )
    if not res.data:
        return None
    last_motion = _parse_dt(res.data[0]["recorded_at"])
    return (now - last_motion).total_seconds() / 60


def get_temperature_rise_c(supabase, now: datetime, window_minutes: int = TEMPERATURE_RISE_WINDOW_MINUTES) -> float | None:
    cutoff = (now - timedelta(minutes=window_minutes)).isoformat()
    res = (
        supabase.table("sensor_readings")
        .select("value, recorded_at")
        .eq("metric", "temperature")
        .gte("recorded_at", cutoff)
        .order("recorded_at", desc=False)
        .execute()
    )
    if len(res.data) < 2:
        return None
    return res.data[-1]["value"] - res.data[0]["value"]


def get_latest_power_w(supabase, device_id: str) -> float | None:
    res = (
        supabase.table("sensor_readings")
        .select("value")
        .eq("device_id", device_id)
        .eq("metric", "power_w")
        .order("recorded_at", desc=True)
        .limit(1)
        .execute()
    )
    return res.data[0]["value"] if res.data else None


def get_device_room_id(supabase, device_id: str) -> int | None:
    res = supabase.table("devices").select("room_id").eq("id", device_id).execute()
    return res.data[0]["room_id"] if res.data else None


# ── 이상 이벤트 기록 + 위험 등급 자동 조치 ───────────────────────────────────
def log_anomaly_event(supabase, device_id: str, room_id: int | None, result: AnomalyResult) -> None:
    supabase.table("device_anomaly_event").insert(
        {
            "device_id": device_id,
            "room_id": room_id,
            "score": result.score,
            "level": result.level,
            "action": result.action,
            "reasons": [c.detail for c in result.conditions if c.triggered],
        }
    ).execute()


def auto_power_off(supabase, device_id: str) -> None:
    """7단계 "위험" 등급의 자동 조치 - rooms.py의 POST /devices/{id}/control(command="off")와
    동일한 부수효과를 낸다(대기 명령 등록 + 낙관적 상태 갱신). 라우터 간 임포트로 결합도를 늘리는
    대신, 이 모듈이 필요한 최소 동작만 직접 수행한다."""
    now_iso = _now_iso()
    supabase.table("device_commands").update({"status": "superseded"}).eq("device_id", device_id).eq(
        "status", "pending"
    ).execute()
    supabase.table("device_commands").insert(
        {"device_id": device_id, "command": "off", "status": "pending", "created_at": now_iso}
    ).execute()
    supabase.table("devices").update({"state": "off"}).eq("id", device_id).execute()


# ── 상위 오케스트레이션 ───────────────────────────────────────────────────────
def evaluate_device(
    supabase,
    engine: BaseAnomalyEngine,
    device_id: str,
    now: datetime,
    current_power_w: float | None = None,
) -> AnomalyResult:
    """기기 하나의 현재 이상 등급을 계산한다. current_power_w를 안 주면(예: 프런트가 그냥 상태만
    조회할 때) 최근 저장된 전력값을 DB에서 읽어온다."""
    profile = load_profile(supabase, device_id, now)
    power = current_power_w if current_power_w is not None else get_latest_power_w(supabase, device_id)

    context = AnomalyContext(
        device_id=device_id,
        now=now,
        current_power_w=power,
        profile=profile,
        minutes_since_motion=get_minutes_since_motion(supabase, now),
        temperature_rise_c=get_temperature_rise_c(supabase, now),
    )
    return engine.evaluate(context)


def evaluate_and_respond(
    supabase,
    engine: BaseAnomalyEngine,
    device_id: str,
    now: datetime,
    current_power_w: float | None = None,
) -> AnomalyResult:
    """evaluate_device로 등급을 계산하고, 등급이 normal보다 높으면 이벤트를 기록하며,
    "위험"이면 즉시 전원을 차단한다(7단계). 전력 표본을 새로 받은 시점(devices.py의 readings
    핸들러)에서 호출해서, 앱이 열려 있지 않아도 위험 상황에서는 즉시 차단되도록 한다."""
    result = evaluate_device(supabase, engine, device_id, now, current_power_w)
    if result.level != "normal":
        room_id = get_device_room_id(supabase, device_id)
        log_anomaly_event(supabase, device_id, room_id, result)
        if result.action == "auto_off_and_alert":
            auto_power_off(supabase, device_id)
            # 비상 연락처(SMS)까지가 "위험" 등급의 자동 조치다 - _level_to_action의 설명대로
            # "스마트 플러그 자동 OFF + 비상 연락처 알림"을 완성한다. Solapi 키가 없거나 비상
            # 연락처가 비어있으면 send_emergency_alert 내부에서 조용히 건너뛴다.
            send_emergency_alert(supabase, device_id, result)
    return result
