// 실시간 전기요금 미리보기(BillReceiptScreen)에서 쓰는 소비전력 추정 + 요금 계산 유틸.
// 실제 기기 스펙/한전 API 연동 전이라, 아래 값들은 전부 "참고용 근사치"임을 화면에도 안내한다.

// 기기 이름에 흔히 포함되는 키워드로 대략적인 소비전력(W)과 "기기 종류"를 추정한다. 사용자가 자유
// 텍스트로 기기 이름을 등록하므로 실제 값을 알 수 없어, 흔한 가전 키워드를 넓게 인식하고 매칭되지
// 않으면 소비전력은 기본값(DEFAULT_WATT), 종류는 기기 이름 그대로로 폴백한다.
const DEVICE_TYPES: { type: string; keywords: string[]; watt: number }[] = [
  { type: '에어컨', keywords: ['에어컨', '냉방'], watt: 1500 },
  { type: '난방기기', keywords: ['난방', '히터', '온풍기', '전기장판'], watt: 1200 },
  { type: '전자레인지', keywords: ['전자레인지'], watt: 1200 },
  { type: '세탁기', keywords: ['세탁기'], watt: 500 },
  { type: '건조기', keywords: ['건조기'], watt: 800 },
  { type: '냉장고', keywords: ['냉장고'], watt: 150 },
  { type: 'TV', keywords: ['tv', '티비', '텔레비전'], watt: 150 },
  { type: '컴퓨터', keywords: ['컴퓨터', 'pc', '모니터'], watt: 250 },
  { type: '공기청정기', keywords: ['공기청정기'], watt: 45 },
  { type: '선풍기', keywords: ['선풍기'], watt: 50 },
  { type: '조명', keywords: ['조명', '전등', '램프', '스탠드'], watt: 40 },
];
const DEFAULT_WATT = 100;

function matchDeviceType(deviceName: string) {
  const lower = deviceName.toLowerCase();
  return DEVICE_TYPES.find((entry) => entry.keywords.some((k) => lower.includes(k.toLowerCase())));
}

export function estimateWattage(deviceName: string): number {
  return matchDeviceType(deviceName)?.watt ?? DEFAULT_WATT;
}

// 기기 이름이 알려진 키워드와 매칭되면 그 종류 이름(예: "에어컨")을, 아니면 이름 그대로를 돌려준다.
// 방이 달라도 이 값이 같으면 "같은 기기 종류"로 취급해 묶을 수 있다.
export function getDeviceType(deviceName: string): string {
  return matchDeviceType(deviceName)?.type ?? deviceName;
}

// 냉장고 등 앱에 등록되지 않은 기기들의 상시 대기전력 추정치. 실시간 소비전력 계산 시
// "켜져 있다고 등록된 기기"의 합계만으로는 실제 가정의 최소 사용량을 반영하지 못하므로 더해준다.
export const BASELINE_STANDBY_WATT = 150;

type RoomLike = { label: string; devices: { name: string; on: boolean }[] };

// 방 목록에서 현재 켜져 있는 기기만 뽑아 방 이름 + 추정 소비전력(W)과 함께 돌려준다.
export function getActiveDevices(rooms: RoomLike[]): { room: string; device: string; watt: number }[] {
  return rooms.flatMap((room) =>
    room.devices.filter((d) => d.on).map((d) => ({ room: room.label, device: d.name, watt: estimateWattage(d.name) }))
  );
}

// 지금 이 순간의 총 소비전력(W) = 켜진 기기들의 추정치 합 + 기본 대기전력.
export function estimateTotalWatts(rooms: RoomLike[]): number {
  const deviceWatts = getActiveDevices(rooms).reduce((sum, d) => sum + d.watt, 0);
  return deviceWatts + BASELINE_STANDBY_WATT;
}

export type DeviceTypeUsage = { type: string; watt: number; count: number };

// 켜진 기기를 방과 무관하게 "기기 종류"(getDeviceType)로 묶어 소비전력 합계를 낸 뒤, 소비전력이
// 큰 순으로 정렬한다. 종류 수가 topN을 넘으면 상위 topN개만 남기고 나머지는 "기타" 한 줄로 합산한다.
export function summarizeDeviceUsage(rooms: RoomLike[], topN = 5): DeviceTypeUsage[] {
  const byType = new Map<string, DeviceTypeUsage>();
  for (const d of getActiveDevices(rooms)) {
    const type = getDeviceType(d.device);
    const prev = byType.get(type);
    if (prev) {
      prev.watt += d.watt;
      prev.count += 1;
    } else {
      byType.set(type, { type, watt: d.watt, count: 1 });
    }
  }

  const sorted = Array.from(byType.values()).sort((a, b) => b.watt - a.watt);
  if (sorted.length <= topN) return sorted;

  const top = sorted.slice(0, topN);
  const rest = sorted.slice(topN);
  const other: DeviceTypeUsage = {
    type: '기타',
    watt: rest.reduce((sum, r) => sum + r.watt, 0),
    count: rest.reduce((sum, r) => sum + r.count, 0),
  };
  return [...top, other];
}

export type BillBreakdown = {
  basicFee: number;
  energyFee: number;
  climateFee: number;
  fundFee: number;
  vat: number;
  total: number;
};

// 2024년 한전 저압 주택용 요금표를 단순화해 반영한 누진 구간(원/kWh) - 계절/시간대 조정 없는 근사치.
const TIERS = [
  { limit: 200, basic: 910, rate: 120 },
  { limit: 400, basic: 1600, rate: 214 },
  { limit: Infinity, basic: 7300, rate: 307 },
];
const CLIMATE_RATE_PER_KWH = 9; // 기후환경요금(원/kWh) 근사치
const FUND_RATE = 0.037; // 전력산업기반기금 비율
const VAT_RATE = 0.1; // 부가가치세

// 예상 월 사용량(kWh)을 넣으면 누진 구간별 전력량요금을 계산해 영수증 항목으로 나눠 돌려준다.
export function calcBill(kwh: number): BillBreakdown {
  const tierIndex = kwh <= 200 ? 0 : kwh <= 400 ? 1 : 2;
  const basicFee = TIERS[tierIndex].basic;

  // 전력량요금은 총 사용량을 누진 구간 경계대로 나눠, 구간별 단가를 그 구간에 해당하는
  // 사용량에만 적용해서 합산한다(예: 250kWh면 0~200은 1단계 단가, 200~250은 2단계 단가).
  let remaining = kwh;
  let prevLimit = 0;
  let energyFee = 0;
  for (const tier of TIERS) {
    const usedInTier = Math.min(remaining, tier.limit - prevLimit);
    if (usedInTier <= 0) break;
    energyFee += usedInTier * tier.rate;
    remaining -= usedInTier;
    prevLimit = tier.limit;
    if (remaining <= 0) break;
  }

  const climateFee = Math.round(kwh * CLIMATE_RATE_PER_KWH);
  const subtotal = basicFee + energyFee + climateFee;
  const vat = Math.round(subtotal * VAT_RATE);
  const fundFee = Math.floor((subtotal * FUND_RATE) / 10) * 10; // 10원 미만 절사 관례
  const total = Math.round(subtotal + vat + fundFee);

  return { basicFee, energyFee: Math.round(energyFee), climateFee, fundFee, vat, total };
}
