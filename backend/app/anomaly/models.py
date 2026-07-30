# 기기 이상 패턴 감지에 쓰는 데이터 모델.
# Supabase(DB)나 FastAPI에 의존하지 않는 순수 파이썬 객체로만 구성한다 - 그래야 store.py(저장소
# 연동)와 detector.py(판정 로직)를 분리할 수 있고, DB 없이도 단위 테스트가 가능하다.
from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from app.anomaly.constants import LEARNING_PERIOD_DAYS, MODE_MERGE_DISTANCE_W, POWER_HISTORY_WINDOW


@dataclass
class RunningStats:
    """Welford 온라인 알고리즘으로 평균/분산을 관리한다.

    표본을 전부 저장해두고 매번 다시 계산하는 대신, 새 값이 들어올 때마다 O(1)로 평균/분산을
    갱신한다 - 14일치 원시 데이터를 계속 다시 훑지 않아도 되므로 서버리스(Lambda) 환경에서도
    가볍게 유지된다.
    """

    count: int = 0
    mean: float = 0.0
    m2: float = 0.0  # 분산 계산용 누적 제곱합
    minimum: float | None = None
    maximum: float | None = None

    def update(self, value: float) -> None:
        self.count += 1
        delta = value - self.mean
        self.mean += delta / self.count
        delta2 = value - self.mean
        self.m2 += delta * delta2
        self.minimum = value if self.minimum is None else min(self.minimum, value)
        self.maximum = value if self.maximum is None else max(self.maximum, value)

    @property
    def variance(self) -> float:
        return self.m2 / self.count if self.count > 1 else 0.0

    @property
    def stdev(self) -> float:
        return math.sqrt(self.variance)

    def zscore(self, value: float) -> float:
        """value가 평균에서 표준편차 몇 배만큼 떨어져 있는지. 표본이 부족해 표준편차가 0이면
        비교 자체가 무의미하므로 0(정상)을 돌려준다."""
        sd = self.stdev
        if sd == 0:
            return 0.0
        return abs(value - self.mean) / sd

    def to_dict(self) -> dict:
        return {"count": self.count, "mean": self.mean, "m2": self.m2, "minimum": self.minimum, "maximum": self.maximum}

    @classmethod
    def from_dict(cls, data: dict | None) -> "RunningStats":
        if not data:
            return cls()
        return cls(
            count=data.get("count", 0),
            mean=data.get("mean", 0.0),
            m2=data.get("m2", 0.0),
            minimum=data.get("minimum"),
            maximum=data.get("maximum"),
        )


@dataclass
class UsageMode:
    """2단계에서 자동 생성되는 사용 모드(전력 클러스터) 하나 - 예: "500W대", "1500W대".
    mode_index는 1부터 시작하는 일련번호(생성 순서, 라벨 "Mode1"/"Mode2" 등으로 그대로 쓸 수 있음)."""

    mode_index: int
    power: RunningStats = field(default_factory=RunningStats)
    duration: RunningStats = field(default_factory=RunningStats)

    @property
    def center_power(self) -> float:
        return self.power.mean

    def to_dict(self) -> dict:
        return {
            "mode_index": self.mode_index,
            "power": self.power.to_dict(),
            "duration": self.duration.to_dict(),
        }

    @classmethod
    def from_dict(cls, data: dict) -> "UsageMode":
        return cls(
            mode_index=data["mode_index"],
            power=RunningStats.from_dict(data.get("power")),
            duration=RunningStats.from_dict(data.get("duration")),
        )


@dataclass
class DeviceLearningProfile:
    """기기 하나의 전체 학습 상태 - 1단계에서 쌓는 원시 통계 + 2/3단계에서 자동 분류된 모드들.

    session_started_at: 지금 이 기기가 계속 켜져 있는 세션이 언제 시작됐는지(꺼져 있으면 None).
    조건2(장시간 사용)를 세션이 끝나기 전에(=지금 당장) 판단하려면 이 시작 시각이 꼭 필요하다.
    session_power_sum/count: 진행 중인 세션의 평균 전력을 구하기 위한 누적값 - 세션이 끝나면
    이 평균 전력으로 "이 사용시간을 어느 모드에 속한 사용으로 볼지" 정한다.
    """

    device_id: str
    learning_started_at: datetime
    power: RunningStats = field(default_factory=RunningStats)
    duration: RunningStats = field(default_factory=RunningStats)
    hourly_frequency: list[int] = field(default_factory=lambda: [0] * 24)
    power_history: list[float] = field(default_factory=list)
    session_started_at: datetime | None = None
    session_power_sum: float = 0.0
    session_power_count: int = 0
    modes: list[UsageMode] = field(default_factory=list)

    def is_learning_complete(self, now: datetime) -> bool:
        return (now - self.learning_started_at) >= timedelta(days=LEARNING_PERIOD_DAYS)

    def total_samples(self) -> int:
        return sum(self.hourly_frequency)

    def find_or_create_mode(self, power_w: float) -> UsageMode:
        """전력값과 가장 가까운 기존 모드를 찾아 반환하고, 병합 거리 밖이면 새 모드를 만든다
        (leader clustering - 상수 MODE_MERGE_DISTANCE_W 참고)."""
        best: UsageMode | None = None
        best_distance = float("inf")
        for mode in self.modes:
            distance = abs(mode.center_power - power_w) if mode.power.count > 0 else float("inf")
            if distance < best_distance:
                best = mode
                best_distance = distance

        if best is not None and best_distance <= MODE_MERGE_DISTANCE_W:
            return best

        new_mode = UsageMode(mode_index=len(self.modes) + 1)
        self.modes.append(new_mode)
        return new_mode

    def nearest_mode(self, power_w: float) -> UsageMode | None:
        """현재 전력값에 가장 가까운(=지금 이 기기가 속해 있다고 볼 수 있는) 모드를 찾는다.
        find_or_create_mode와 달리 새 모드를 만들지 않는다(판정 시점에는 학습된 모드끼리만 비교)."""
        if not self.modes:
            return None
        return min(self.modes, key=lambda m: abs(m.center_power - power_w))

    def push_power_history(self, power_w: float) -> None:
        self.power_history.append(power_w)
        if len(self.power_history) > POWER_HISTORY_WINDOW:
            self.power_history = self.power_history[-POWER_HISTORY_WINDOW:]
