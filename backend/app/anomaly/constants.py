# 기기 이상 패턴 감지 시스템의 모든 임계값/가중치를 한곳에 모아둔다.
# 값을 바꾸고 싶으면 여기만 고치면 되고, detector.py/store.py는 이 상수들만 참조한다
# (하드코딩된 매직넘버를 로직 코드 안에 흩어놓지 않기 위함 - 유지보수 요구사항).

# ── 1단계: 학습 기간 ─────────────────────────────────────────────────────────
# 이 기간 동안은 이상 감지를 하지 않고 데이터만 쌓는다(스펙 1단계).
LEARNING_PERIOD_DAYS = 14

# 전력(W)이 이 값 이상이면 "켜짐(사용 중)"으로 본다 - 대기전력과 실사용을 구분하는 기준.
# Tapo P110M 등 스마트 플러그의 대기전력은 보통 1W 미만이라 3W면 충분히 안전한 경계선이다.
POWER_ON_THRESHOLD_W = 3.0

# ── 2단계: 모드(전력 클러스터) 자동 분류 ─────────────────────────────────────
# 새로 들어온 전력값이 기존 모드 중심(평균)과 이 거리(W) 이내면 같은 모드로 합치고,
# 아니면 새 모드를 만든다("leader clustering" - 모드 개수를 미리 고정하지 않기 위한 온라인 클러스터링).
MODE_MERGE_DISTANCE_W = 80.0

# ── 조건5(전력 급변) 판정용 슬라이딩 윈도우 ──────────────────────────────────
# 최근 이만큼의 전력 표본을 들고 있다가, 그 안에서 급격한 오르내림이 있는지 본다.
POWER_HISTORY_WINDOW = 8
# 윈도우 안 최댓값-최솟값 차이가 이 값(W) 이상이면 "변동폭이 크다"의 1차 조건.
POWER_FLUCTUATION_RANGE_W = 400.0
# 그리고 방향이 바뀌는 변화(오름→내림 또는 내림→오름)가 이 횟수 이상이어야 "반복적 급변"으로 본다
# (예: 500→1500→400→1500→300 처럼 단순히 오르기만/내리기만 하는 게 아니라 오르내림을 반복하는지).
POWER_FLUCTUATION_MIN_SWINGS = 2

# ── 4단계: 이상 판정 조건별 임계값 ───────────────────────────────────────────
# 조건1 - 전력 이상: 현재 모드 평균에서 이 표준편차 배수만큼 벗어나면 이상.
POWER_ZSCORE_THRESHOLD = 2.5

# 조건2 - 장시간 사용: (지금 진행 중인 사용 시간) / (그 모드의 평균 사용시간)이 이 배수를 넘기면 이상.
DURATION_RATIO_THRESHOLD = 2.0
# 아직 그 모드에서 사용시간 표본이 없을 때(막 새 모드가 생겼을 때) 비교 기준으로 쓸 기본값(초).
DURATION_FALLBACK_MEAN_SEC = 30 * 60

# 조건3 - 재실(PIR): 이 시간(분) 이상 움직임이 감지되지 않으면 "사람 없음".
NO_MOTION_MINUTES = 30

# 조건4 - 온도 상승: 최근 이 시간(분) 동안 온도가 TEMPERATURE_RISE_DELTA_C(°C) 이상 오르면 이상.
# (화재 예방 시스템의 급상승 감지와 별개로, 기기 이상 패턴 전용 조건으로 독립 운용한다.)
TEMPERATURE_RISE_WINDOW_MINUTES = 5
TEMPERATURE_RISE_DELTA_C = 3.0

# 조건6 - 평소 사용하지 않는 시간대: 그 시각(0~23시)의 학습된 사용 빈도 비율이 이 값 미만이면
# "평소 안 쓰는 시간대"로 본다. 학습 표본이 이 값보다 적으면(막 학습을 끝낸 직후 등) 판단을 건너뛴다.
UNUSUAL_HOUR_FREQUENCY_RATIO = 0.05
UNUSUAL_HOUR_MIN_SAMPLES = 20

# ── 5단계: 조건별 가중치(합계 100점) ─────────────────────────────────────────
WEIGHT_POWER_ANOMALY = 25
WEIGHT_LONG_DURATION = 20
WEIGHT_NO_PRESENCE = 25
WEIGHT_TEMPERATURE_RISE = 20
WEIGHT_POWER_FLUCTUATION = 10
WEIGHT_UNUSUAL_HOUR = 10

# ── 6단계: 점수 구간 → 등급 ──────────────────────────────────────────────────
# score <= SCORE_CAUTION_MIN            → normal(정상)
# SCORE_CAUTION_MIN < score <= SCORE_WARNING_MIN → caution(주의)
# SCORE_WARNING_MIN < score <= SCORE_DANGER_MIN  → warning(경고)
# score > SCORE_DANGER_MIN                        → danger(위험)
SCORE_CAUTION_MIN = 30
SCORE_WARNING_MIN = 60
SCORE_DANGER_MIN = 80

# ── 7단계: 등급별 행동 ────────────────────────────────────────────────────────
# 경고 등급에서 사용자 확인 없이 재알림까지 기다리는 시간(초) - 실제 발동/재알림 타이머는
# 프런트(FireSafetyContext)가 이 값을 참고해 관리한다(백엔드는 상태 없는 점수 계산만 담당).
WARNING_REPROMPT_WAIT_SEC = 30

# "위험"(auto_off_and_alert) 등급에서 비상 연락처로 SMS를 보낼 때(app/services/sms_service.py) -
# 이 시간(분) 안에 이미 문자를 보냈으면 같은 사건으로 보고 재발송하지 않는다(문자 폭탄 방지).
SMS_DEDUP_WINDOW_MINUTES = 5
# SMS 발송 실패 시 재시도 횟수(첫 시도 포함 총 횟수).
SMS_MAX_RETRIES = 3
