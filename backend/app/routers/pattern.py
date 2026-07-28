from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter

from app.schemas import PatternEventOut, PatternSegment
from app.supabase_client import get_supabase

router = APIRouter(prefix="/pattern", tags=["pattern"])


@router.get("/latest", response_model=Optional[PatternEventOut])
def latest_pattern():
    """가장 최근 생활 패턴 분류 결과 - MainScreen 배지가 사용. 모델이 아직 없으면 null."""
    supabase = get_supabase()
    res = (
        supabase.table("classification_events")
        .select("label, confidence, recorded_at")
        .eq("model", "life_pattern")
        .order("recorded_at", desc=True)
        .limit(1)
        .execute()
    )
    return PatternEventOut(**res.data[0]) if res.data else None


@router.get("/today", response_model=list[PatternSegment])
def today_pattern():
    """오늘 하루의 생활 패턴 타임라인 - LifePatternScreen의 "당신의 하루"가 사용.
    연속된 같은 라벨은 하나의 구간(started_at~ended_at)으로 합친다."""
    supabase = get_supabase()
    since = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    res = (
        supabase.table("classification_events")
        .select("label, recorded_at")
        .eq("model", "life_pattern")
        .gte("recorded_at", since)
        .order("recorded_at", desc=False)
        .execute()
    )

    segments: list[PatternSegment] = []
    for row in res.data:
        if segments and segments[-1].label == row["label"]:
            segments[-1].ended_at = row["recorded_at"]
        else:
            segments.append(PatternSegment(label=row["label"], started_at=row["recorded_at"], ended_at=row["recorded_at"]))
    return segments
