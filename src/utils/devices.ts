// 사용자가 스마트홈 제어 화면에서 직접 켜고 끄는 "스마트 기기"로 노출할 대상만 걸러내는 기준.
// 백엔드에는 릴레이 제어보드(actuator_hub_node의 기기 제어 1~4)·환경/재실 센서(env_power_hub_node의
// 온습도 센서, actuator_hub_node의 PIR 센서) 같은 하드웨어 테스트용 기기도 함께 등록돼 있지만,
// 이들은 사용자가 직접 조작하는 콘센트/조명이 아니라서 이 화면에는 보이면 안 된다.
// Tapo 스마트 콘센트(id가 "tapo-"로 시작)와 조명 허브의 조명 채널(id가 "living-light-"로 시작,
// firmware/env_power_hub_node/config.h.example의 LIGHT_DEVICE_ID)만 대상으로 삼는다 - 특정
// 기기 하나의 id를 통째로 하드코딩하지 않고 접두어로 걸러서, 조명 채널이 늘어나거나 스마트 콘센트가
// 더 등록돼도 코드 변경 없이 그대로 인식된다.
export function isControllableSmartDevice(deviceId: string): boolean {
  return deviceId.startsWith('tapo-') || deviceId.startsWith('living-light-');
}
