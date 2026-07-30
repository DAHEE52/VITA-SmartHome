# app/routers/anomaly.py + devices.py의 전력 수신 훅을 FakeSupabase로 통합 테스트한다.
# 순수 판정 로직 자체는 test_anomaly_detector.py에서 이미 촘촘히 검증했으므로, 여기서는
# "학습 기간에는 감지 안 함" / "학습이 끝나면 GET으로 조회된다" / "위험 등급이면 전원이 실제로
# 꺼지고 이벤트가 남는다" 같은 저장소·API 연동 자체가 맞는지에 집중한다.
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from app.services.sms_service import SmsResult


def _register_power_device(fake_supabase, device_id="tapo-x", device_key="test-device-key"):
    fake_supabase.table("devices").insert(
        {
            "id": device_id,
            "room_id": 1,
            "type": "power_monitor",
            "label": "테스트 콘센트",
            "state": "on",
            "device_key": device_key,
        }
    ).execute()


def test_list_anomaly_status_empty_when_no_devices(client):
    res = client.get("/anomaly")
    assert res.status_code == 200
    assert res.json() == []


def test_device_in_learning_phase_reports_is_learning(client, fake_supabase):
    _register_power_device(fake_supabase)
    headers = {"X-Device-Key": "test-device-key"}

    res = client.post("/devices/tapo-x/readings", json={"readings": [{"metric": "power_w", "value": 500}]}, headers=headers)
    assert res.status_code == 200

    status = client.get("/anomaly/devices/tapo-x").json()
    assert status["is_learning"] is True
    assert status["level"] == "normal"
    assert status["action"] == "none"

    # 이 기기는 방금 등록돼서 PIR/온도 등 판단 근거가 될 데이터가 전혀 없으므로(표본 1개짜리
    # 세션이 막 시작됐을 뿐) 아직 정상이다 - 전원을 건드리거나 이벤트를 남기지 않는다.
    # (학습 기간 중이라고 무조건 정상인 건 아니다 - test_anomaly_detector.py의
    # test_still_learning_keeps_flag_but_evaluates_sample_independent_conditions 참고.)
    device_row = next(r for r in fake_supabase._data["devices"] if r["id"] == "tapo-x")
    assert device_row["state"] == "on"
    assert fake_supabase._data.get("device_anomaly_event", []) == []


def test_learned_device_appears_in_batch_status(client, fake_supabase):
    _register_power_device(fake_supabase, device_id="tapo-y")
    now = datetime.now(timezone.utc)
    fake_supabase.table("device_learning_profile").insert(
        {
            "device_id": "tapo-y",
            "learning_started_at": (now - timedelta(days=20)).isoformat(),
            "power_stats": {"count": 50, "mean": 500, "m2": 5000, "minimum": 480, "maximum": 520},
            "duration_stats": {"count": 0, "mean": 0, "m2": 0, "minimum": None, "maximum": None},
            "hourly_frequency": [0] * 24,
            "power_history": [],
            "session_started_at": None,
            "session_power_sum": 0,
            "session_power_count": 0,
        }
    ).execute()

    res = client.get("/anomaly")
    assert res.status_code == 200
    body = res.json()
    assert len(body) == 1
    assert body[0]["device_id"] == "tapo-y"
    assert body[0]["is_learning"] is False


def test_danger_level_triggers_auto_off_and_logs_event(client, fake_supabase):
    """학습이 끝난 기기에 평소 모드와 동떨어진 전력값 + 오래된 PIR 무움직임 + 온도 급상승까지
    한꺼번에 갖춰서 보내면, 점수가 위험 등급까지 올라가 실제로 전원이 꺼지고 이벤트가 남는지 확인한다."""
    _register_power_device(fake_supabase, device_id="tapo-z")
    now = datetime.now(timezone.utc)

    fake_supabase.table("device_learning_profile").insert(
        {
            "device_id": "tapo-z",
            "learning_started_at": (now - timedelta(days=20)).isoformat(),
            "power_stats": {"count": 50, "mean": 500, "m2": 5000, "minimum": 480, "maximum": 520},
            "duration_stats": {"count": 0, "mean": 0, "m2": 0, "minimum": None, "maximum": None},
            "hourly_frequency": [0] * 24,
            "power_history": [500, 502, 498],
            "session_started_at": None,
            "session_power_sum": 0,
            "session_power_count": 0,
        }
    ).execute()
    fake_supabase.table("device_usage_mode").insert(
        {
            "device_id": "tapo-z",
            "mode_index": 1,
            # count 50, mean 500, m2 -> stdev가 작아 zscore가 크게 나오도록(즉 이상 전력으로 잡히도록)
            "power_stats": {"count": 50, "mean": 500, "m2": 500, "minimum": 480, "maximum": 520},
            "duration_stats": {"count": 0, "mean": 0, "m2": 0, "minimum": None, "maximum": None},
        }
    ).execute()

    # PIR 마지막 움직임을 40분 전으로, 온도는 최근 5분 안에 5도 오른 것으로 심어둔다.
    fake_supabase.table("sensor_readings").insert(
        [
            {"device_id": "living-presence-01", "metric": "motion", "value": 1, "recorded_at": (now - timedelta(minutes=40)).isoformat()},
            {"device_id": "living-env-01", "metric": "temperature", "value": 20.0, "recorded_at": (now - timedelta(minutes=4)).isoformat()},
            {"device_id": "living-env-01", "metric": "temperature", "value": 26.0, "recorded_at": now.isoformat()},
        ]
    ).execute()

    headers = {"X-Device-Key": "test-device-key"}
    res = client.post("/devices/tapo-z/readings", json={"readings": [{"metric": "power_w", "value": 1500}]}, headers=headers)
    assert res.status_code == 200

    device_row = next(r for r in fake_supabase._data["devices"] if r["id"] == "tapo-z")
    assert device_row["state"] == "off"

    commands = [c for c in fake_supabase._data.get("device_commands", []) if c["device_id"] == "tapo-z"]
    assert any(c["command"] == "off" and c["status"] == "pending" for c in commands)

    events = fake_supabase._data.get("device_anomaly_event", [])
    assert len(events) == 1
    assert events[0]["level"] == "danger"
    assert events[0]["action"] == "auto_off_and_alert"
    assert len(events[0]["reasons"]) > 0

    status = client.get("/anomaly/devices/tapo-z").json()
    assert status["level"] == "danger"

    events_res = client.get("/anomaly/events").json()
    assert len(events_res) == 1
    assert events_res[0]["device_id"] == "tapo-z"


def test_caution_level_does_not_auto_off(client, fake_supabase):
    """전력이 모드에서 살짝만 벗어나는 정도로는 낮은 등급(주의 이하)에 머물러야 하고, 이 경우
    전원은 그대로 켜져 있어야 한다(위험 등급에서만 자동 차단)."""
    _register_power_device(fake_supabase, device_id="tapo-w")
    now = datetime.now(timezone.utc)

    fake_supabase.table("device_learning_profile").insert(
        {
            "device_id": "tapo-w",
            "learning_started_at": (now - timedelta(days=20)).isoformat(),
            "power_stats": {"count": 50, "mean": 500, "m2": 5000, "minimum": 480, "maximum": 520},
            "duration_stats": {"count": 0, "mean": 0, "m2": 0, "minimum": None, "maximum": None},
            "hourly_frequency": [0] * 24,
            "power_history": [500, 502, 498],
            "session_started_at": None,
            "session_power_sum": 0,
            "session_power_count": 0,
        }
    ).execute()
    fake_supabase.table("device_usage_mode").insert(
        {
            "device_id": "tapo-w",
            "mode_index": 1,
            "power_stats": {"count": 50, "mean": 500, "m2": 5000, "minimum": 480, "maximum": 520},
            "duration_stats": {"count": 0, "mean": 0, "m2": 0, "minimum": None, "maximum": None},
        }
    ).execute()

    headers = {"X-Device-Key": "test-device-key"}
    res = client.post("/devices/tapo-w/readings", json={"readings": [{"metric": "power_w", "value": 505}]}, headers=headers)
    assert res.status_code == 200

    device_row = next(r for r in fake_supabase._data["devices"] if r["id"] == "tapo-w")
    assert device_row["state"] == "on"
    assert fake_supabase._data.get("device_anomaly_event", []) == []


class _FakeSmsProvider:
    """POST /devices/{id}/readings → 위험 등급 → SMS까지 이어지는 전체 배선을 확인하는 통합
    테스트 전용 - 실제 Solapi 네트워크 호출 없이 send()가 실제로 호출되는지만 본다."""

    def __init__(self):
        self.calls: list[tuple[str, str]] = []

    def send(self, to, message):
        self.calls.append((to, message))
        return SmsResult(ok=True, detail="발송 완료(테스트)")


def test_danger_level_sends_emergency_sms_when_configured(client, fake_supabase):
    """_test_danger_level_triggers_auto_off_and_logs_event와 같은 위험 시나리오에서, 비상
    연락처가 설정돼 있고 SMS provider가 있으면 실제로 문자 발송이 시도되고 sms_log에 남는지 확인."""
    fake_supabase.table("app_settings").insert(
        {"id": 1, "address": "", "guidebook_font_size": "medium", "emergency_phone": "01099998888"}
    ).execute()

    _register_power_device(fake_supabase, device_id="tapo-sms")
    now = datetime.now(timezone.utc)

    fake_supabase.table("device_learning_profile").insert(
        {
            "device_id": "tapo-sms",
            "learning_started_at": (now - timedelta(days=20)).isoformat(),
            "power_stats": {"count": 50, "mean": 500, "m2": 5000, "minimum": 480, "maximum": 520},
            "duration_stats": {"count": 0, "mean": 0, "m2": 0, "minimum": None, "maximum": None},
            "hourly_frequency": [0] * 24,
            "power_history": [500, 502, 498],
            "session_started_at": None,
            "session_power_sum": 0,
            "session_power_count": 0,
        }
    ).execute()
    fake_supabase.table("device_usage_mode").insert(
        {
            "device_id": "tapo-sms",
            "mode_index": 1,
            "power_stats": {"count": 50, "mean": 500, "m2": 500, "minimum": 480, "maximum": 520},
            "duration_stats": {"count": 0, "mean": 0, "m2": 0, "minimum": None, "maximum": None},
        }
    ).execute()
    fake_supabase.table("sensor_readings").insert(
        [
            {
                "device_id": "living-presence-01",
                "metric": "motion",
                "value": 1,
                "recorded_at": (now - timedelta(minutes=40)).isoformat(),
            },
            {
                "device_id": "living-env-01",
                "metric": "temperature",
                "value": 20.0,
                "recorded_at": (now - timedelta(minutes=4)).isoformat(),
            },
            {"device_id": "living-env-01", "metric": "temperature", "value": 26.0, "recorded_at": now.isoformat()},
        ]
    ).execute()

    fake_provider = _FakeSmsProvider()
    headers = {"X-Device-Key": "test-device-key"}
    with patch("app.services.sms_service._get_provider", return_value=fake_provider):
        res = client.post(
            "/devices/tapo-sms/readings", json={"readings": [{"metric": "power_w", "value": 1500}]}, headers=headers
        )
    assert res.status_code == 200

    assert len(fake_provider.calls) == 1
    assert fake_provider.calls[0][0] == "01099998888"

    log = fake_supabase._data["sms_log"]
    assert len(log) == 1
    assert log[0]["status"] == "sent"
