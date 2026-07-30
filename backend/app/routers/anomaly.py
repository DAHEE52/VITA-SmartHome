# 기기 이상 패턴 감지 API. 실제 판정 로직은 app/anomaly/(detector.py 순수 로직 + store.py
# Supabase 연동)에 있고, 이 라우터는 HTTP 계층(요청 파싱/응답 직렬화)만 담당한다.
#
# 조회(GET)는 부수효과가 없는 순수 계산이고, 전원 자동 차단 + 이벤트 기록은 오직
# devices.py의 POST /devices/{id}/readings(전력 표본이 실제로 새로 들어온 시점)에서만
# 일어난다 - "위험" 판정이 앱이 켜져 있는지와 무관하게 즉시 반영되도록 하기 위함이다.
from datetime import datetime, timezone

from fastapi import APIRouter

from app.anomaly.detector import RuleBasedAnomalyEngine
from app.anomaly.store import evaluate_device
from app.schemas import AnomalyConditionOut, AnomalyEventOut, AnomalyStatusOut
from app.supabase_client import get_supabase

router = APIRouter(prefix="/anomaly", tags=["anomaly"])

# 지금은 규칙 기반 엔진 하나뿐이지만, 나중에 학습된 AI 모델로 바꿀 때 이 한 줄만 새 엔진으로
# 교체하면 된다(BaseAnomalyEngine 인터페이스, app/anomaly/detector.py 참고).
_engine = RuleBasedAnomalyEngine()


def _to_status_out(result) -> AnomalyStatusOut:
    return AnomalyStatusOut(
        device_id=result.device_id,
        score=result.score,
        level=result.level,
        action=result.action,
        is_learning=result.is_learning,
        conditions=[
            AnomalyConditionOut(name=c.name, triggered=c.triggered, weight=c.weight, detail=c.detail)
            for c in result.conditions
        ],
    )


@router.get("", response_model=list[AnomalyStatusOut])
def list_anomaly_status():
    """전력 측정이 되는(power_monitor) 기기 전체의 현재 이상 등급을 한 번에 반환한다 - 프런트가
    기기마다 따로 요청하지 않고 이 화면 하나로 전체 목록을 그릴 수 있도록(배치 조회 패턴)."""
    supabase = get_supabase()
    devices_res = supabase.table("devices").select("id").eq("type", "power_monitor").execute()
    now = datetime.now(timezone.utc)
    return [_to_status_out(evaluate_device(supabase, _engine, row["id"], now)) for row in devices_res.data]


@router.get("/devices/{device_id}", response_model=AnomalyStatusOut)
def get_anomaly_status(device_id: str):
    supabase = get_supabase()
    now = datetime.now(timezone.utc)
    return _to_status_out(evaluate_device(supabase, _engine, device_id, now))


@router.get("/events", response_model=list[AnomalyEventOut])
def list_anomaly_events(limit: int = 20):
    supabase = get_supabase()
    res = (
        supabase.table("device_anomaly_event")
        .select("*")
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return [AnomalyEventOut(**row) for row in res.data]
