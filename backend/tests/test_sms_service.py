# app/services/sms_service.py 단위 테스트. 실제 Solapi 네트워크 호출은 절대 하지 않고,
# SmsProvider 인터페이스를 흉내내는 FakeProvider를 주입해서 재시도/중복방지/로깅 로직만 검증한다.
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from app.anomaly.detector import AnomalyResult, ConditionResult
from app.services.sms_service import SmsResult, send_emergency_alert


class FakeProvider:
    """SmsProvider를 흉내내는 테스트 더블. outcomes를 순서대로 돌려주다가 다 떨어지면 마지막
    값을 계속 반복한다(재시도 테스트에서 "항상 실패"를 표현하기 위함)."""

    def __init__(self, outcomes: list[SmsResult]):
        self._outcomes = list(outcomes)
        self.calls: list[tuple[str, str]] = []

    def send(self, to: str, message: str) -> SmsResult:
        self.calls.append((to, message))
        if len(self._outcomes) > 1:
            return self._outcomes.pop(0)
        return self._outcomes[0]


def _fake_result(score: int = 90) -> AnomalyResult:
    return AnomalyResult(
        device_id="dev-1",
        score=score,
        level="danger",
        action="auto_off_and_alert",
        conditions=[ConditionResult("power_anomaly", True, 25, "테스트 사유")],
    )


def _set_emergency_phone(fake_supabase, phone: str):
    fake_supabase.table("app_settings").insert(
        {"id": 1, "address": "", "guidebook_font_size": "medium", "emergency_phone": phone}
    ).execute()


def test_no_send_when_emergency_phone_empty(fake_supabase):
    _set_emergency_phone(fake_supabase, "")
    provider = FakeProvider([SmsResult(ok=True, detail="ok")])

    send_emergency_alert(fake_supabase, "dev-1", _fake_result(), provider=provider)

    assert provider.calls == []
    assert fake_supabase._data.get("sms_log", []) == []


def test_no_send_when_no_provider_configured(fake_supabase):
    """provider를 안 주면 .env의 Solapi 키로 만들려 하는데, 테스트 환경에는 키가 없으므로
    _get_provider()가 None을 돌려주고 조용히 아무 것도 안 해야 한다."""
    _set_emergency_phone(fake_supabase, "01012345678")

    send_emergency_alert(fake_supabase, "dev-1", _fake_result())

    assert fake_supabase._data.get("sms_log", []) == []


def test_sends_and_logs_on_success(fake_supabase):
    _set_emergency_phone(fake_supabase, "01012345678")
    provider = FakeProvider([SmsResult(ok=True, detail="발송 완료")])

    send_emergency_alert(fake_supabase, "dev-1", _fake_result(), provider=provider)

    assert len(provider.calls) == 1
    assert provider.calls[0][0] == "01012345678"
    log = fake_supabase._data["sms_log"]
    assert len(log) == 1
    assert log[0]["status"] == "sent"
    assert "테스트 사유" in log[0]["message"]


def test_retries_up_to_max_then_logs_failed(fake_supabase):
    _set_emergency_phone(fake_supabase, "01012345678")
    provider = FakeProvider([SmsResult(ok=False, detail="일시적 오류")])

    with patch("app.services.sms_service.time.sleep"):  # 재시도 사이 대기를 테스트에서는 생략
        send_emergency_alert(fake_supabase, "dev-1", _fake_result(), provider=provider)

    assert len(provider.calls) == 3  # SMS_MAX_RETRIES
    log = fake_supabase._data["sms_log"]
    assert len(log) == 1
    assert log[0]["status"] == "failed"


def test_stops_retrying_once_a_later_attempt_succeeds(fake_supabase):
    _set_emergency_phone(fake_supabase, "01012345678")
    provider = FakeProvider([SmsResult(ok=False, detail="1차 실패"), SmsResult(ok=True, detail="2차 성공")])

    with patch("app.services.sms_service.time.sleep"):
        send_emergency_alert(fake_supabase, "dev-1", _fake_result(), provider=provider)

    assert len(provider.calls) == 2
    assert fake_supabase._data["sms_log"][0]["status"] == "sent"


def test_dedup_skips_send_within_window(fake_supabase):
    _set_emergency_phone(fake_supabase, "01012345678")
    fake_supabase.table("sms_log").insert(
        {"phone": "01012345678", "message": "이전 문자", "status": "sent", "detail": "발송 완료"}
    ).execute()
    provider = FakeProvider([SmsResult(ok=True, detail="ok")])

    send_emergency_alert(fake_supabase, "dev-1", _fake_result(), provider=provider)

    assert provider.calls == []
    assert len(fake_supabase._data["sms_log"]) == 1


def test_no_dedup_when_previous_sms_outside_window(fake_supabase):
    _set_emergency_phone(fake_supabase, "01012345678")
    old_time = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    fake_supabase.table("sms_log").insert(
        {
            "phone": "01012345678",
            "message": "오래된 문자",
            "status": "sent",
            "detail": "발송 완료",
            "created_at": old_time,
        }
    ).execute()
    provider = FakeProvider([SmsResult(ok=True, detail="ok")])

    send_emergency_alert(fake_supabase, "dev-1", _fake_result(), provider=provider)

    assert len(provider.calls) == 1
    assert len(fake_supabase._data["sms_log"]) == 2
