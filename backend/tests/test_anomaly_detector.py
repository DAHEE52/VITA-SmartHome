# app/anomaly/detector.py의 순수 판정 로직 단위 테스트 - Supabase/FastAPI 없이 값만 조립해서
# 6개 조건, 점수 합산, 등급 경계값, 행동 매핑을 각각 검증한다.
from datetime import datetime, timedelta, timezone

import pytest

from app.anomaly.detector import AnomalyContext, RuleBasedAnomalyEngine
from app.anomaly.models import DeviceLearningProfile, RunningStats, UsageMode

NOW = datetime(2026, 1, 15, 14, 0, tzinfo=timezone.utc)  # 화요일 오후 2시


def _profile(learning_days_ago: int = 20, **overrides) -> DeviceLearningProfile:
    """학습이 끝난(기본 20일 전 시작) 프로필을 만든다. overrides로 개별 필드를 덮어쓸 수 있다."""
    base = dict(
        device_id="tapo-1",
        learning_started_at=NOW - timedelta(days=learning_days_ago),
    )
    base.update(overrides)
    return DeviceLearningProfile(**base)


def _mode_with_power(mean: float, stdev: float, count: int = 50) -> UsageMode:
    """평균/표준편차가 정확히 mean/stdev가 되도록 표본 두 개짜리 RunningStats를 만든다
    (Welford는 표본 순서와 무관하게 같은 평균/분산에 수렴하므로, 대칭인 두 값만 넣어도 충분하다)."""
    stats = RunningStats()
    # count번 반복해서 평균 mean, 표준편차 stdev에 가깝게 수렴시킨다.
    for i in range(count):
        value = mean + (stdev if i % 2 == 0 else -stdev)
        stats.update(value)
    mode = UsageMode(mode_index=1, power=stats)
    return mode


class TestRunningStats:
    def test_mean_and_stdev(self):
        stats = RunningStats()
        for v in [10, 12, 14, 12, 10]:
            stats.update(v)
        assert stats.count == 5
        assert stats.mean == pytest.approx(11.6)
        assert stats.stdev == pytest.approx(1.497, abs=0.01)

    def test_zscore_zero_when_no_stdev(self):
        stats = RunningStats()
        stats.update(100)
        assert stats.zscore(500) == 0  # 표본이 하나뿐이면 분산이 없어 비교 불가 -> 0

    def test_roundtrip_dict(self):
        stats = RunningStats()
        for v in [1, 2, 3]:
            stats.update(v)
        restored = RunningStats.from_dict(stats.to_dict())
        assert restored.mean == stats.mean
        assert restored.count == stats.count


class TestLearningGate:
    def test_still_learning_returns_normal_regardless_of_conditions(self):
        engine = RuleBasedAnomalyEngine()
        profile = _profile(learning_days_ago=3)  # 아직 14일 안 지남
        context = AnomalyContext(
            device_id="tapo-1",
            now=NOW,
            current_power_w=99999,  # 말도 안 되게 이상한 값이어도
            profile=profile,
            minutes_since_motion=999,  # 무움직임도 극단적이어도
            temperature_rise_c=50,
        )
        result = engine.evaluate(context)
        assert result.is_learning is True
        assert result.score == 0
        assert result.level == "normal"
        assert result.action == "none"

    def test_no_profile_is_learning(self):
        engine = RuleBasedAnomalyEngine()
        context = AnomalyContext(
            device_id="tapo-1", now=NOW, current_power_w=100, profile=None,
            minutes_since_motion=None, temperature_rise_c=None,
        )
        result = engine.evaluate(context)
        assert result.is_learning is True


class TestConditions:
    def test_power_anomaly_triggers_on_large_zscore(self):
        engine = RuleBasedAnomalyEngine()
        mode = _mode_with_power(mean=500, stdev=20)
        profile = _profile(modes=[mode])
        context = AnomalyContext(
            device_id="tapo-1", now=NOW, current_power_w=1500, profile=profile,
            minutes_since_motion=None, temperature_rise_c=None,
        )
        result = engine.evaluate(context)
        cond = next(c for c in result.conditions if c.name == "power_anomaly")
        assert cond.triggered is True

    def test_power_anomaly_not_triggered_near_mean(self):
        engine = RuleBasedAnomalyEngine()
        mode = _mode_with_power(mean=500, stdev=20)
        profile = _profile(modes=[mode])
        context = AnomalyContext(
            device_id="tapo-1", now=NOW, current_power_w=505, profile=profile,
            minutes_since_motion=None, temperature_rise_c=None,
        )
        result = engine.evaluate(context)
        cond = next(c for c in result.conditions if c.name == "power_anomaly")
        assert cond.triggered is False

    def test_long_duration_triggers_when_session_far_exceeds_average(self):
        engine = RuleBasedAnomalyEngine()
        mode = _mode_with_power(mean=500, stdev=20)
        for _ in range(10):
            mode.duration.update(600)  # 평균 사용시간 10분
        profile = _profile(modes=[mode], session_started_at=NOW - timedelta(minutes=40))
        context = AnomalyContext(
            device_id="tapo-1", now=NOW, current_power_w=500, profile=profile,
            minutes_since_motion=None, temperature_rise_c=None,
        )
        result = engine.evaluate(context)
        cond = next(c for c in result.conditions if c.name == "long_duration")
        assert cond.triggered is True

    def test_long_duration_not_triggered_when_off(self):
        engine = RuleBasedAnomalyEngine()
        profile = _profile(session_started_at=None)
        context = AnomalyContext(
            device_id="tapo-1", now=NOW, current_power_w=0, profile=profile,
            minutes_since_motion=None, temperature_rise_c=None,
        )
        result = engine.evaluate(context)
        cond = next(c for c in result.conditions if c.name == "long_duration")
        assert cond.triggered is False

    def test_no_presence_triggers_after_threshold(self):
        engine = RuleBasedAnomalyEngine()
        profile = _profile()
        context = AnomalyContext(
            device_id="tapo-1", now=NOW, current_power_w=100, profile=profile,
            minutes_since_motion=45, temperature_rise_c=None,
        )
        result = engine.evaluate(context)
        cond = next(c for c in result.conditions if c.name == "no_presence")
        assert cond.triggered is True

    def test_no_presence_not_triggered_when_recent_motion(self):
        engine = RuleBasedAnomalyEngine()
        profile = _profile()
        context = AnomalyContext(
            device_id="tapo-1", now=NOW, current_power_w=100, profile=profile,
            minutes_since_motion=5, temperature_rise_c=None,
        )
        result = engine.evaluate(context)
        cond = next(c for c in result.conditions if c.name == "no_presence")
        assert cond.triggered is False

    def test_temperature_rise_triggers_above_delta(self):
        engine = RuleBasedAnomalyEngine()
        profile = _profile()
        context = AnomalyContext(
            device_id="tapo-1", now=NOW, current_power_w=100, profile=profile,
            minutes_since_motion=None, temperature_rise_c=4.5,
        )
        result = engine.evaluate(context)
        cond = next(c for c in result.conditions if c.name == "temperature_rise")
        assert cond.triggered is True

    def test_power_fluctuation_triggers_on_repeated_swings(self):
        engine = RuleBasedAnomalyEngine()
        # 스펙 예시: 500, 1500, 400, 1500, 300
        profile = _profile(power_history=[500, 1500, 400, 1500, 300])
        context = AnomalyContext(
            device_id="tapo-1", now=NOW, current_power_w=300, profile=profile,
            minutes_since_motion=None, temperature_rise_c=None,
        )
        result = engine.evaluate(context)
        cond = next(c for c in result.conditions if c.name == "power_fluctuation")
        assert cond.triggered is True

    def test_power_fluctuation_not_triggered_for_stable_power(self):
        engine = RuleBasedAnomalyEngine()
        profile = _profile(power_history=[500, 510, 495, 505, 502])
        context = AnomalyContext(
            device_id="tapo-1", now=NOW, current_power_w=502, profile=profile,
            minutes_since_motion=None, temperature_rise_c=None,
        )
        result = engine.evaluate(context)
        cond = next(c for c in result.conditions if c.name == "power_fluctuation")
        assert cond.triggered is False

    def test_unusual_hour_triggers_for_rarely_used_hour(self):
        engine = RuleBasedAnomalyEngine()
        hourly = [0] * 24
        hourly[9] = 100  # 평소엔 오전 9시에만 몰아서 쓴다
        # 새벽 3시(now.hour=3)는 한 번도 안 씀
        now_at_3am = NOW.replace(hour=3)
        profile = _profile(hourly_frequency=hourly)
        context = AnomalyContext(
            device_id="tapo-1", now=now_at_3am, current_power_w=100, profile=profile,
            minutes_since_motion=None, temperature_rise_c=None,
        )
        result = engine.evaluate(context)
        cond = next(c for c in result.conditions if c.name == "unusual_hour")
        assert cond.triggered is True

    def test_unusual_hour_not_triggered_with_insufficient_samples(self):
        engine = RuleBasedAnomalyEngine()
        hourly = [0] * 24
        hourly[9] = 5  # 학습 표본이 아직 너무 적음(UNUSUAL_HOUR_MIN_SAMPLES 미만)
        profile = _profile(hourly_frequency=hourly)
        context = AnomalyContext(
            device_id="tapo-1", now=NOW.replace(hour=3), current_power_w=100, profile=profile,
            minutes_since_motion=None, temperature_rise_c=None,
        )
        result = engine.evaluate(context)
        cond = next(c for c in result.conditions if c.name == "unusual_hour")
        assert cond.triggered is False


class TestScoreLevelAction:
    def test_all_conditions_trigger_reaches_danger_and_auto_off(self):
        engine = RuleBasedAnomalyEngine()
        mode = _mode_with_power(mean=500, stdev=10)
        for _ in range(10):
            mode.duration.update(300)
        hourly = [0] * 24
        hourly[9] = 100
        test_now = NOW.replace(hour=3)  # 평소 안 쓰는 시간대
        profile = _profile(
            modes=[mode],
            session_started_at=test_now - timedelta(minutes=30),
            power_history=[500, 1500, 400, 1500, 300],
            hourly_frequency=hourly,
        )
        context = AnomalyContext(
            device_id="tapo-1",
            now=test_now,
            current_power_w=1500,  # 모드 평균에서 크게 벗어남
            profile=profile,
            minutes_since_motion=45,  # 30분 이상 무움직임
            temperature_rise_c=5,  # 온도 급상승
        )
        result = engine.evaluate(context)
        assert result.score == 100  # 25+20+25+20+10+10 = 110 -> 100으로 clamp
        assert result.level == "danger"
        assert result.action == "auto_off_and_alert"

    def test_no_conditions_trigger_stays_normal(self):
        engine = RuleBasedAnomalyEngine()
        mode = _mode_with_power(mean=500, stdev=20)
        profile = _profile(modes=[mode], power_history=[500, 502, 498])
        context = AnomalyContext(
            device_id="tapo-1", now=NOW, current_power_w=500, profile=profile,
            minutes_since_motion=2, temperature_rise_c=0.1,
        )
        result = engine.evaluate(context)
        assert result.score == 0
        assert result.level == "normal"
        assert result.action == "none"

    @pytest.mark.parametrize(
        "score,expected_level,expected_action",
        [
            (0, "normal", "none"),
            (30, "normal", "none"),
            (31, "caution", "notify"),
            (60, "caution", "notify"),
            (61, "warning", "confirm_request"),
            (79, "warning", "confirm_request"),
            (80, "danger", "auto_off_and_alert"),
            (100, "danger", "auto_off_and_alert"),
        ],
    )
    def test_score_boundaries(self, score, expected_level, expected_action):
        from app.anomaly.detector import _level_to_action, _score_to_level

        level = _score_to_level(score)
        assert level == expected_level
        assert _level_to_action(level) == expected_action
