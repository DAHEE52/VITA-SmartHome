# 화재 위험 감지("danger" 등급, action="auto_off_and_alert") 시 비상 연락처로 보내는 SMS 발송 서비스.
#
# app/anomaly/detector.py의 _level_to_action이 "danger" 등급에 이미 "스마트 플러그 자동 OFF +
# 비상 연락처 알림"이라고 정의해뒀지만 알림 발송 자체는 구현이 안 돼 있었다 - 이 모듈이 그 마지막 조각.
#
# SmsProvider를 인터페이스로 두고 SolapiProvider가 지금의 Solapi 연동을 구현한다 - 나중에 다른
# SMS 게이트웨이나 카카오 알림톡/이메일 등으로 바꾸거나 추가하고 싶으면 이 인터페이스만 새로
# 구현하면 되고, send_emergency_alert()를 호출하는 쪽(app/anomaly/store.py)은 손댈 필요가 없다.
from __future__ import annotations

import time
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from app.anomaly.constants import SMS_DEDUP_WINDOW_MINUTES, SMS_MAX_RETRIES
from app.anomaly.detector import AnomalyResult
from app.config import settings

RETRY_BACKOFF_SEC = 1.0


@dataclass
class SmsResult:
    ok: bool
    detail: str


class SmsProvider(ABC):
    @abstractmethod
    def send(self, to: str, message: str) -> SmsResult:
        """문자 한 통을 보낸다. 게이트웨이 쪽에서 무슨 예외가 나든 여기서 잡아서 SmsResult(ok=False,
        ...)로 바꿔 돌려준다 - 호출부(send_emergency_alert)가 예외 처리 없이 재시도/로그를 판단할
        수 있도록."""
        raise NotImplementedError


class SolapiProvider(SmsProvider):
    def __init__(self, api_key: str, api_secret: str, sender: str):
        # 무거운 solapi 패키지를 이 provider를 실제로 쓸 때만 import한다 - 키가 없어 SMS 기능을
        # 안 쓰는 배포(로컬 개발, 데모 등)에서는 이 의존성이 아예 로드되지 않는다.
        from solapi import SolapiMessageService

        self._service = SolapiMessageService(api_key=api_key, api_secret=api_secret)
        self._sender = sender

    def send(self, to: str, message: str) -> SmsResult:
        from solapi.error import MessageNotReceiveError
        from solapi.model import Message

        try:
            res = self._service.send(Message(from_=self._sender, to=to, text=message))
        except MessageNotReceiveError as err:
            return SmsResult(ok=False, detail=str(err))
        except Exception as err:  # noqa: BLE001 - 게이트웨이 쪽 예외 종류와 무관하게 SmsResult로 통일
            return SmsResult(ok=False, detail=str(err))

        if res.failed_message_list:
            return SmsResult(ok=False, detail=f"{len(res.failed_message_list)}건 발송 실패")
        return SmsResult(ok=True, detail="발송 완료")


def _get_provider() -> SmsProvider | None:
    """.env에 Solapi 키 3개(API 키/시크릿/발신번호)가 전부 설정돼 있지 않으면 None을 돌려준다 -
    SMS 발송만 조용히 건너뛰고, 화재 감지·자동 전원 차단 자체는 그대로 동작해야 하기 때문이다."""
    if not (settings.solapi_api_key and settings.solapi_api_secret and settings.solapi_sender):
        return None
    return SolapiProvider(settings.solapi_api_key, settings.solapi_api_secret, settings.solapi_sender)


def _build_message(device_label: str, result: AnomalyResult) -> str:
    reasons = "\n".join(f"- {c.detail}" for c in result.conditions if c.triggered)
    return (
        f'[VITA] 화재 위험이 감지되어 "{device_label}" 전원을 자동 차단했어요.\n'
        f"위험도 {result.score}점\n{reasons}\n앱에서 확인해 주세요."
    )


def send_emergency_alert(supabase, device_id: str, result: AnomalyResult, provider: SmsProvider | None = None) -> None:
    """anomaly 엔진이 'danger'(auto_off_and_alert) 등급을 낸 직후 app/anomaly/store.py가 호출한다.
    provider를 안 주면 .env 설정으로 SolapiProvider를 만든다(테스트에서는 가짜 provider를 주입).

    비상 연락처(app_settings.emergency_phone)가 비어있거나, SMS_DEDUP_WINDOW_MINUTES 안에 이미
    보낸 문자가 있으면 조용히 아무 것도 안 한다. VITA는 원룸/단일 연락처 전용 프로토타입이라
    "같은 사건인지"를 기기/방 단위로 정교하게 구분하는 대신, 그냥 "최근에 아무 문자든 보냈는지"로
    단순화했다 - 어차피 문자를 받는 사람이 한 명뿐이라 이걸로 충분하다.
    """
    if provider is None:
        provider = _get_provider()
    if provider is None:
        return

    settings_res = supabase.table("app_settings").select("emergency_phone").eq("id", 1).execute()
    phone = settings_res.data[0]["emergency_phone"] if settings_res.data else ""
    if not phone:
        return

    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=SMS_DEDUP_WINDOW_MINUTES)).isoformat()
    recent = (
        supabase.table("sms_log")
        .select("id")
        .eq("status", "sent")
        .gte("created_at", cutoff)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    if recent.data:
        return  # 최근에 이미 보낸 문자가 있음 - 중복 발송 방지

    device_res = supabase.table("devices").select("label").eq("id", device_id).execute()
    device_label = (device_res.data[0].get("label") if device_res.data else None) or device_id
    message = _build_message(device_label, result)

    sms_result = SmsResult(ok=False, detail="발송 시도 안 함")
    for attempt in range(1, SMS_MAX_RETRIES + 1):
        sms_result = provider.send(phone, message)
        if sms_result.ok:
            break
        if attempt < SMS_MAX_RETRIES:
            time.sleep(RETRY_BACKOFF_SEC)

    supabase.table("sms_log").insert(
        {
            "phone": phone,
            "message": message,
            "status": "sent" if sms_result.ok else "failed",
            "detail": sms_result.detail,
        }
    ).execute()
