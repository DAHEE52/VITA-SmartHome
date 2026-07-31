// 화재 예방 시스템(FirePreventionScreen)에서 쓰는 화재 위험 판정 유틸.
// "AI 이상 패턴 감지"(기기별 사용 패턴 학습/점수화)는 이제 백엔드(backend/app/anomaly/)가 전담하고,
// 프런트는 GET /anomaly 결과만 그대로 보여준다(src/context/FireSafetyContext.tsx 참고). 이 파일에는
// 그와 별개로 (1) 고위험 기기 종류 판정, (2) 온도/습도 센서 기반 위험도 판정만 남아있다.
// 안전 가이드북의 "화재가 자주 발생하는 원인"과 맞춘 고위험 기기 키워드 - 방 카드 위험도 배지에서
// 이 기기들이 켜져 있으면 그 자체로 "위험"으로 표시한다(FirePreventionScreen의 getDeviceRisk).
export const HIGH_RISK_KEYWORDS = ['히터', '전기장판', '가스레인지', '난로', '온풍기'];

export function isHighRiskDevice(deviceName: string): boolean {
  return HIGH_RISK_KEYWORDS.some((k) => deviceName.includes(k));
}

// 방 하나의 온도/습도 센서 값 한 세트. 지금은 SensorContext가 더미 값으로 채우지만, 나중에 실제
// 센서(하드웨어/API)를 연동할 때도 이 모양 그대로 값만 채워 넣으면 되도록 RN/Context에 의존하지 않는
// 순수 타입으로 여기(유틸)에 둔다.
export type RoomSensorReading = {
  temperatureC: number;
  humidityPct: number;
  updatedAt: number; // 마지막으로 값이 갱신된 시각(Date.now())
};

// 이 온도(°C) 이상이면 그 자체로 "위험" - 실제 화재 상황의 급격한 온도 상승을 가정한 참고값(데모용).
export const SENSOR_DANGER_TEMP_C = 60;
// 이 온도(°C) 이상이면 "주의" - 화재까지는 아니어도 평소보다 확실히 뜨거운 상태.
export const SENSOR_CAUTION_TEMP_C = 38;
// 습도가 이 값(%) 이하로 급격히 낮으면 "주의" - 화재 초기에 흔히 나타나는 건조화 신호로 참고.
export const SENSOR_CAUTION_HUMIDITY_PCT = 20;

export type SensorRiskLevel = 'safe' | 'caution' | 'danger';

// 센서 값만으로 판단한 위험도. 고온이면 즉시 "위험", 그보다 약한 이상 징후(고온 초입/저습도)는 "주의".
export function sensorRiskLevel(reading: RoomSensorReading | undefined): SensorRiskLevel {
  if (!reading) return 'safe';
  if (reading.temperatureC >= SENSOR_DANGER_TEMP_C) return 'danger';
  if (reading.temperatureC >= SENSOR_CAUTION_TEMP_C || reading.humidityPct <= SENSOR_CAUTION_HUMIDITY_PCT) {
    return 'caution';
  }
  return 'safe';
}

// 명세서 3번 항목 "AI 화재 예방 감지" - 절대 온도가 아직 위험 임계치에 못 미쳐도, 짧은 시간에 급격히
// 오르는 것 자체가 화재 초기 징후라 별도로 감지한다(SensorContext.getTemperatureRiseC와 짝).
export const RISE_WINDOW_MS = 5 * 60 * 1000; // 5분
export const RISE_DANGER_DELTA_C = 5; // 5분 내 5℃ 이상 상승하면 위험

export function temperatureRiseRisk(riseC: number): SensorRiskLevel {
  return riseC >= RISE_DANGER_DELTA_C ? 'danger' : 'safe';
}

// "화재 위험 감지 및 비상 알림" 기능의 PIR 무움직임 조건. 온도 이상만으로 화재를 의심하면
// 재실 중 요리처럼 정상적으로 뜨거워지는 상황까지 오탐으로 잡을 수 있으므로, 일정 시간 동안
// 움직임이 없었을 때(=아무도 대응하고 있지 않을 가능성이 클 때)만 화재 의심으로 올린다.
// 데모에서 바로 확인할 수 있도록 실제 권장치보다 훨씬 짧게 잡았다.
export const FIRE_NO_MOTION_MINUTES = 2;

// 온도 기반 위험(절대 임계치 또는 급상승)과 PIR 무움직임을 함께 봐서 "화재 의심" 여부를 최종
// 판단한다. 오탐 방지 로직: 절대 온도만으로 판단하지 않고 상승 속도까지 함께 보며, 최근에 사람이
// 움직였으면(minutesSinceMotion이 작으면) 온도가 위험 범위여도 화재 의심으로 올리지 않는다.
export function isFireSuspected(
  reading: RoomSensorReading | undefined,
  riseC: number,
  minutesSinceMotion: number
): boolean {
  const tempDanger = sensorRiskLevel(reading) === 'danger' || temperatureRiseRisk(riseC) === 'danger';
  return tempDanger && minutesSinceMotion >= FIRE_NO_MOTION_MINUTES;
}
