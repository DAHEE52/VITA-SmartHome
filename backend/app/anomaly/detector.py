# 기기 이상 패턴 감지의 핵심 판정 로직(4~7단계).
#
# BaseAnomalyEngine을 인터페이스로 두고 RuleBasedAnomalyEngine이 지금의 규칙 기반 채점을 구현한다 -
# 나중에 실제 학습된 AI 모델로 교체하고 싶으면, 같은 evaluate(context) 인터페이스를 구현하는
# 새 엔진(예: MLAnomalyEngine)만 만들면 되고 라우터/저장소 코드는 손댈 필요가 없다.
#
# 조건 6개는 각각 별도 메서드로 분리했다(요구사항: "각 판단 로직을 함수로 분리") - 조건을
# 추가/제거/수정할 때 다른 조건에 영향을 주지 않는다.
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime

from app.anomaly.constants import (
    DURATION_FALLBACK_MEAN_SEC,
    DURATION_RATIO_THRESHOLD,
    NO_MOTION_MINUTES,
    POWER_FLUCTUATION_MIN_SWINGS,
    POWER_FLUCTUATION_RANGE_W,
    POWER_ZSCORE_THRESHOLD,
    SCORE_CAUTION_MIN,
    SCORE_DANGER_MIN,
    SCORE_WARNING_MIN,
    TEMPERATURE_RISE_DELTA_C,
    UNUSUAL_HOUR_FREQUENCY_RATIO,
    UNUSUAL_HOUR_MIN_SAMPLES,
    WEIGHT_LONG_DURATION,
    WEIGHT_NO_PRESENCE,
    WEIGHT_POWER_ANOMALY,
    WEIGHT_POWER_FLUCTUATION,
    WEIGHT_TEMPERATURE_RISE,
    WEIGHT_UNUSUAL_HOUR,
)
from app.anomaly.models import DeviceLearningProfile, UsageMode

AnomalyLevel = str  # 'normal' | 'caution' | 'warning' | 'danger'
AnomalyAction = str  # 'none' | 'notify' | 'confirm_request' | 'auto_off_and_alert'


@dataclass
class AnomalyContext:
    """이상 여부를 판단하는 데 필요한 입력을 한데 모은 스냅샷.

    Supabase 등 특정 저장소에 의존하지 않는 순수 값 객체라서, DB 없이도 detector 단위 테스트가
    가능하다(store.py가 이 값을 채워서 detector에 넘겨주는 역할만 한다).
    """

    device_id: str
    now: datetime
    current_power_w: float | None
    profile: DeviceLearningProfile | None
    minutes_since_motion: float | None  # PIR 최근 움직임 이후 경과 시간(분). 기록이 없으면 None.
    temperature_rise_c: float | None  # 최근 온도 상승폭(°C). 센서가 없으면 None.


@dataclass
class ConditionResult:
    name: str
    triggered: bool
    weight: int
    detail: str  # 알림/로그에 그대로 쓸 수 있는 사람이 읽는 설명


@dataclass
class AnomalyResult:
    device_id: str
    score: int
    level: AnomalyLevel
    action: AnomalyAction
    conditions: list[ConditionResult] = field(default_factory=list)
    is_learning: bool = False


class BaseAnomalyEngine(ABC):
    """이상 감지 엔진 인터페이스. 지금은 규칙 기반이지만, 나중에 학습된 AI 모델로 바꿀 때도
    evaluate() 하나만 이 시그니처대로 구현하면 라우터/프런트는 전혀 손대지 않아도 된다."""

    @abstractmethod
    def evaluate(self, context: AnomalyContext) -> AnomalyResult:
        raise NotImplementedError


def _score_to_level(score: int) -> AnomalyLevel:
    """6단계: 점수 구간 → 등급.
    스펙 "30점 이하 정상 / 30~60 주의 / 60~80 경고 / 80 이상 위험"을 경계값 포함 기준으로 해석한다 -
    30은 정상(이하), 60은 주의(30~60 구간의 끝), 80은 위험(이상)에 포함되도록 부등호를 정했다."""
    if score >= SCORE_DANGER_MIN:
        return "danger"
    if score > SCORE_WARNING_MIN:
        return "warning"
    if score > SCORE_CAUTION_MIN:
        return "caution"
    return "normal"


def _level_to_action(level: AnomalyLevel) -> AnomalyAction:
    """7단계: 등급별 행동.
    normal  -> 아무 것도 안 함
    caution -> 앱 알림만
    warning -> 사용자 확인 요청(30초 내 무응답 시 프런트가 재알림 - WARNING_REPROMPT_WAIT_SEC)
    danger  -> 스마트 플러그 자동 OFF + 비상 연락처 알림
    """
    return {
        "normal": "none",
        "caution": "notify",
        "warning": "confirm_request",
        "danger": "auto_off_and_alert",
    }[level]


class RuleBasedAnomalyEngine(BaseAnomalyEngine):
    """스펙 4~7단계를 그대로 구현한 규칙 기반 엔진.

    프로필 자체가 없으면(기기가 아예 등록만 되고 표본이 하나도 없음) 무조건 정상으로 본다 -
    비교할 게 전혀 없어서다. 하지만 프로필이 있다면, 14일 학습 기간이 아직 안 끝났어도 조건은
    전부 평가한다 - 조건마다 이미 자체적으로 "표본이 부족하면 비활성" 가드가 있어서
    (_check_power_anomaly의 mode.power.count<2, _check_unusual_hour의 total<
    UNUSUAL_HOUR_MIN_SAMPLES 등), 개인화된 학습 데이터가 필요한 조건은 자연스럽게 꺼져 있고
    장시간 사용·무재실·온도 급상승처럼 학습과 무관하게 판단 가능한 조건은 학습 기간에도 계속
    감시할 수 있다. 예전엔 이 전체를 "학습 완료 전엔 무조건 정상" 게이트로 한 번에 막았는데,
    그러면 헤어드라이기처럼 어쩌다 한두 번 꽂아 써서 14일 안에 표본이 거의 안 쌓이는 기기는
    학습 기간 내내(그리고 사실상 그 이후로도) 장시간 방치돼도 전혀 감지되지 않는 사각지대가
    생겼다. 참고로 표본 의존 조건(전력 이상 25점 + 비정상 시간대 10점)이 꺼져 있으면 나머지를
    다 더해도 75점(장시간20+무재실25+온도20+급변10)이라 "위험"(80점 이상)에는 못 닿으므로,
    학습이 전혀 안 된 기기가 곧장 자동 전원 차단까지 가는 일은 없다.
    """

    def evaluate(self, context: AnomalyContext) -> AnomalyResult:
        profile = context.profile
        if profile is None:
            return AnomalyResult(
                device_id=context.device_id, score=0, level="normal", action="none", is_learning=True
            )

        mode = profile.nearest_mode(context.current_power_w) if context.current_power_w is not None else None

        conditions = [
            self._check_power_anomaly(context, mode),
            self._check_long_duration(context, profile, mode),
            self._check_no_presence(context),
            self._check_temperature_rise(context),
            self._check_power_fluctuation(profile),
            self._check_unusual_hour(context, profile),
        ]

        score = min(100, sum(c.weight for c in conditions if c.triggered))
        level = _score_to_level(score)
        action = _level_to_action(level)

        return AnomalyResult(
            device_id=context.device_id,
            score=score,
            level=level,
            action=action,
            conditions=conditions,
            is_learning=not profile.is_learning_complete(context.now),
        )

    # 조건1: 현재 전력이 해당 모드 평균보다 표준편차 기준을 크게 벗어나는가?
    def _check_power_anomaly(self, context: AnomalyContext, mode: UsageMode | None) -> ConditionResult:
        if context.current_power_w is None or mode is None or mode.power.count < 2:
            return ConditionResult("power_anomaly", False, WEIGHT_POWER_ANOMALY, "비교할 전력 표본 부족")
        z = mode.power.zscore(context.current_power_w)
        triggered = z >= POWER_ZSCORE_THRESHOLD
        return ConditionResult(
            "power_anomaly",
            triggered,
            WEIGHT_POWER_ANOMALY,
            f"현재 {context.current_power_w:.0f}W, Mode{mode.mode_index} 평균({mode.power.mean:.0f}W) 대비 {z:.1f}표준편차",
        )

    # 조건2: 현재 사용시간이 평균보다 매우 긴가? (진행 중인 세션 기준 - 끝나기 전에 판단해야 의미가 있다)
    def _check_long_duration(
        self, context: AnomalyContext, profile: DeviceLearningProfile, mode: UsageMode | None
    ) -> ConditionResult:
        if profile.session_started_at is None:
            return ConditionResult("long_duration", False, WEIGHT_LONG_DURATION, "지금 꺼져 있음")

        elapsed_sec = (context.now - profile.session_started_at).total_seconds()
        mean_duration = (
            mode.duration.mean if mode is not None and mode.duration.count > 0 else DURATION_FALLBACK_MEAN_SEC
        )
        ratio = elapsed_sec / mean_duration if mean_duration > 0 else 0
        triggered = ratio >= DURATION_RATIO_THRESHOLD
        return ConditionResult(
            "long_duration",
            triggered,
            WEIGHT_LONG_DURATION,
            f"{elapsed_sec / 60:.0f}분째 사용 중 (평소 평균의 {ratio:.1f}배)",
        )

    # 조건3: 사람이 30분 이상 감지되지 않았는가?
    def _check_no_presence(self, context: AnomalyContext) -> ConditionResult:
        if context.minutes_since_motion is None:
            # 움직임 기록이 아예 없으면(PIR 미연동 등) 판단 근거가 없으므로 안전하게 "정상" 취급.
            return ConditionResult("no_presence", False, WEIGHT_NO_PRESENCE, "PIR 데이터 없음")
        triggered = context.minutes_since_motion >= NO_MOTION_MINUTES
        return ConditionResult(
            "no_presence",
            triggered,
            WEIGHT_NO_PRESENCE,
            f"{context.minutes_since_motion:.0f}분간 움직임 없음",
        )

    # 조건4: 온도가 평소보다 상승하는가?
    def _check_temperature_rise(self, context: AnomalyContext) -> ConditionResult:
        if context.temperature_rise_c is None:
            return ConditionResult("temperature_rise", False, WEIGHT_TEMPERATURE_RISE, "온도 센서 데이터 없음")
        triggered = context.temperature_rise_c >= TEMPERATURE_RISE_DELTA_C
        return ConditionResult(
            "temperature_rise",
            triggered,
            WEIGHT_TEMPERATURE_RISE,
            f"최근 온도 {context.temperature_rise_c:+.1f}°C 변화",
        )

    # 조건5: 짧은 시간 안에 전력이 급격하게 반복 변하는가? (예: 500,1500,400,1500,300)
    def _check_power_fluctuation(self, profile: DeviceLearningProfile) -> ConditionResult:
        history = profile.power_history
        if len(history) < 3:
            return ConditionResult("power_fluctuation", False, WEIGHT_POWER_FLUCTUATION, "표본 부족")

        value_range = max(history) - min(history)
        swings = 0
        prev_delta = None
        for i in range(1, len(history)):
            delta = history[i] - history[i - 1]
            if delta == 0:
                continue
            if prev_delta is not None and (delta > 0) != (prev_delta > 0):
                swings += 1
            prev_delta = delta

        triggered = value_range >= POWER_FLUCTUATION_RANGE_W and swings >= POWER_FLUCTUATION_MIN_SWINGS
        return ConditionResult(
            "power_fluctuation",
            triggered,
            WEIGHT_POWER_FLUCTUATION,
            f"최근 {len(history)}개 표본 변동폭 {value_range:.0f}W, 방향 전환 {swings}회",
        )

    # 조건6: 평소 사용하지 않는 시간대인가?
    def _check_unusual_hour(self, context: AnomalyContext, profile: DeviceLearningProfile) -> ConditionResult:
        total = profile.total_samples()
        if total < UNUSUAL_HOUR_MIN_SAMPLES:
            return ConditionResult("unusual_hour", False, WEIGHT_UNUSUAL_HOUR, "학습 표본 부족")

        hour_count = profile.hourly_frequency[context.now.hour]
        ratio = hour_count / total
        triggered = ratio < UNUSUAL_HOUR_FREQUENCY_RATIO
        return ConditionResult(
            "unusual_hour",
            triggered,
            WEIGHT_UNUSUAL_HOUR,
            f"{context.now.hour}시 사용 비율 {ratio * 100:.1f}%(평소 거의 안 씀)",
        )
