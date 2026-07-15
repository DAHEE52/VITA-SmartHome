// EnergyUsageScreen에서 쓰는 "일별 누적 kWh 로그"(EnergyHistoryContext) → 연/월/일 그래프 시리즈 +
// 전년/전월/전일 대비 증감률 변환 유틸. 로그는 실제 켜진 기기의 실시간 소비전력을 주기적으로 샘플링해
// 쌓은 값이라, 과거 구간에 데이터가 없으면(앱을 쓰기 시작한 지 얼마 안 됐으면) 그 구간은 0으로 나온다.
export type DailyUsage = Record<string, number>; // "YYYY-MM-DD" -> 그 날 누적 kWh

function pad2(n: number) {
  return String(n).padStart(2, '0');
}
function dateKey(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export type SeriesPoint = { label: string; value: number };

// 오늘을 마지막 포인트로 하는 최근 N일치 시리즈. 라벨은 "M/D".
export function getDailySeries(dailyUsage: DailyUsage, days: number): SeriesPoint[] {
  const today = new Date();
  const points: SeriesPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    points.push({ label: `${d.getMonth() + 1}/${d.getDate()}`, value: dailyUsage[dateKey(d)] ?? 0 });
  }
  return points;
}

function sumForMonth(dailyUsage: DailyUsage, year: number, month0: number): number {
  return Object.entries(dailyUsage).reduce((sum, [key, v]) => {
    const [y, m] = key.split('-').map(Number);
    return y === year && m === month0 + 1 ? sum + v : sum;
  }, 0);
}

// 이번 달을 마지막 포인트로 하는 최근 N개월치 시리즈. 라벨은 "M월".
export function getMonthlySeries(dailyUsage: DailyUsage, months: number): SeriesPoint[] {
  const today = new Date();
  const points: SeriesPoint[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    points.push({ label: `${d.getMonth() + 1}월`, value: sumForMonth(dailyUsage, d.getFullYear(), d.getMonth()) });
  }
  return points;
}

function sumForYear(dailyUsage: DailyUsage, year: number): number {
  return Object.entries(dailyUsage).reduce((sum, [key, v]) => {
    const y = Number(key.split('-')[0]);
    return y === year ? sum + v : sum;
  }, 0);
}

// 올해를 마지막 포인트로 하는 최근 N년치 시리즈. 라벨은 "YYYY".
export function getYearlySeries(dailyUsage: DailyUsage, years: number): SeriesPoint[] {
  const today = new Date();
  const points: SeriesPoint[] = [];
  for (let i = years - 1; i >= 0; i--) {
    const year = today.getFullYear() - i;
    points.push({ label: `${year}`, value: sumForYear(dailyUsage, year) });
  }
  return points;
}

// 시리즈의 마지막 두 포인트(현재/직전)를 비교해 증감률을 계산한다.
// 직전 포인트에 데이터가 없으면(0이면) 비교 기준이 없다는 뜻이므로 0%로 정의한다 -
// "기본값 0%, 데이터가 쌓이면 그때부터 계산"이라는 요구사항의 핵심 규칙.
export function calcChange(series: SeriesPoint[]): { percent: number; direction: '증가' | '감소' } {
  const current = series[series.length - 1]?.value ?? 0;
  const previous = series[series.length - 2]?.value ?? 0;
  if (previous <= 0) return { percent: 0, direction: '감소' };
  const diff = current - previous;
  return { percent: Math.round((Math.abs(diff) / previous) * 100), direction: diff >= 0 ? '증가' : '감소' };
}
