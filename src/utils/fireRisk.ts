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
