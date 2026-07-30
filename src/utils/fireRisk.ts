// 화재 예방 시스템(FirePreventionScreen)에서 쓰는 "AI 이상 패턴 감지" 유틸.
// 실제 학습된 모델은 없으므로, 기기 종류별로 "정상적으로 계속 켜져 있을 만한 시간"을 참고값으로
// 정해두고, 실제 켜져 있던 시간(RoomsContext의 onSince)이 그 값을 넘으면 "이상 패턴"으로 본다.
// 데모에서 바로 확인할 수 있도록, 실제 안전 수칙에서 권장하는 시간(보통 몇 시간)보다 훨씬 짧게 잡았다.
import { getDeviceType } from './energy';

// 안전 가이드북의 "화재가 자주 발생하는 원인"과 맞춘 고위험 기기 키워드 - 이 기기들은 켜져 있는 것
// 자체가 즉시 위험군이고, 이상 패턴(장시간 방치)까지 겹치면 "긴급"(자동 119 신고 대상)으로 올라간다.
export const HIGH_RISK_KEYWORDS = ['히터', '전기장판', '가스레인지', '난로', '온풍기'];

export function isHighRiskDevice(deviceName: string): boolean {
  return HIGH_RISK_KEYWORDS.some((k) => deviceName.includes(k));
}

// 기기 종류별 "정상 지속 사용 시간"(ms) - 데모용으로 축약한 참고값. 이 시간을 넘겨 계속 켜져 있으면
// "이상 패턴"으로 감지한다. 냉장고 등 원래 상시 가동이 정상인 기기는 Infinity(항상 정상)로 둔다.
const NORMAL_DURATION_MS: Record<string, number> = {
  난방기기: 2 * 60 * 1000, // 히터/전기장판/온풍기 - 실제로도 장시간 방치가 가장 위험한 유형이라 가장 짧게
  전자레인지: 3 * 60 * 1000,
  세탁기: 5 * 60 * 1000,
  건조기: 5 * 60 * 1000,
  에어컨: 10 * 60 * 1000,
  냉장고: Infinity,
  공기청정기: Infinity,
  가습기: Infinity, // 취침 모드에서 밤새 켜두는 게 정상이라 상시 가동 허용

  TV: 15 * 60 * 1000,
  컴퓨터: 15 * 60 * 1000,
  선풍기: 15 * 60 * 1000,
  조명: 15 * 60 * 1000,
};
const DEFAULT_NORMAL_DURATION_MS = 5 * 60 * 1000; // 목록에 없는 기기 종류(가스레인지 등 포함)의 기본값

export function getNormalDurationMs(deviceName: string): number {
  const type = getDeviceType(deviceName);
  return NORMAL_DURATION_MS[type] ?? DEFAULT_NORMAL_DURATION_MS;
}

// 기기가 "이상 패턴"인지 - 켜져 있고, 켜진 시점(onSince)이 있고, 그 종류의 정상 지속시간을 넘겼으면.
export function isAnomalousDevice(device: { on: boolean; onSince: number | null; name: string }, now: number): boolean {
  if (!device.on || device.onSince == null) return false;
  return now - device.onSince > getNormalDurationMs(device.name);
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
