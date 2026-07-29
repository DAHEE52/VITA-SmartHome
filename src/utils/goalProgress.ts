// 절전 목표(GoalContext.goalKwh) 대비 실사용량(EnergyHistoryContext.dailyUsage)으로 "이번 달 목표
// 달성률"을 계산하는 공용 유틸. MainScreen(오늘의 절전 목표 카드)과 EnergyTreeScreen(에너지 나무
// 성장률)이 이 계산을 각자 따로 들고 있으면 두 화면의 퍼센트가 서로 어긋날 수 있어서 한 곳으로
// 합쳤다 - 두 화면 모두 이 함수의 결과를 그대로 쓴다.

// 오늘 날짜는 아직 하루가 다 지나지 않았으므로, 하루 목표 전체가 아니라 "지금까지 지난 시간만큼의"
// 목표와 비교해야 한다. 이 보정이 없으면 하루가 막 시작됐을 때도 실사용량이 하루 전체 목표보다
// 항상 훨씬 작아서 달성률이 곧바로 100%에 가깝게 튀어버린다. 자정 직후엔 지난 시간이 0에 가까워
// 분모가 너무 작아지지 않도록 최소 비율(MIN_DAY_FRACTION)을 바닥으로 둔다.
export const MIN_DAY_FRACTION = 0.02; // 하루의 최소 2%(약 29분)는 지난 것으로 취급

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function dateKey(year: number, month0: number, day: number): string {
  return `${year}-${pad2(month0 + 1)}-${pad2(day)}`;
}

export function daysInMonthOf(year: number, month0: number): number {
  return new Date(year, month0 + 1, 0).getDate();
}

export function isToday(year: number, month0: number, day: number, now: Date): boolean {
  return year === now.getFullYear() && month0 === now.getMonth() && day === now.getDate();
}

export function dayFractionElapsed(now: Date): number {
  const seconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  return seconds / 86400;
}

// 하루 달성률(0~1) - 목표 자체가 없으면(dailyTarget=null) 비교할 기준이 없으므로 0이다. 목표가
// 있고 그날 실제 사용량이 없으면(아직 안 쌓였으면)도 0, 있으면 목표 대비 적게 쓴 비율만큼이다.
// 목표보다 많이 썼으면 0으로 바닥을 둔다.
export function growthRate(
  dailyUsage: Record<string, number>,
  dailyTarget: number | null,
  year: number,
  month0: number,
  day: number
): number {
  if (dailyTarget == null) return 0;
  const usage = dailyUsage[dateKey(year, month0, day)];
  if (usage == null) return 0;

  const now = new Date();
  const effectiveTarget = isToday(year, month0, day, now)
    ? dailyTarget * Math.max(MIN_DAY_FRACTION, dayFractionElapsed(now))
    : dailyTarget;

  return Math.max(0, Math.min(1, 1 - usage / effectiveTarget));
}

// growthRate와 달리 "그날 데이터가 실제로 있는지"만 알려준다 - 달성률이 0이어도(목표보다 많이 써서)
// 데이터 자체는 있는 날과, 아예 기록이 없는 날을 구분하기 위함.
export function hasUsageData(dailyUsage: Record<string, number>, year: number, month0: number, day: number): boolean {
  return dailyUsage[dateKey(year, month0, day)] != null;
}

// "이번 달 절전 목표 달성률"(0~1) - MainScreen의 절전 목표 카드, EnergyTreeScreen의 나무 성장률이
// 공통으로 쓰는 값. 데이터가 전혀 없으면(막 시작한 시점) 0에서 시작하고, 완료된 날 중 목표 이내로
// 쓴 날이 쌓일수록 올라간다. 오늘은 아직 하루가 안 끝났으므로 지난 시간 비율만큼만 기여한다.
export function monthAchievementRate(
  dailyUsage: Record<string, number>,
  dailyTarget: number | null,
  year: number,
  month0: number
): number {
  if (dailyTarget == null) return 0;
  const now = new Date();
  const daysInMonth = daysInMonthOf(year, month0);

  let total = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const usage = dailyUsage[dateKey(year, month0, d)];
    if (usage == null) continue;

    if (isToday(year, month0, d, now)) {
      const fraction = Math.max(MIN_DAY_FRACTION, dayFractionElapsed(now));
      if (usage <= dailyTarget * fraction) total += fraction;
    } else if (usage <= dailyTarget) {
      total += 1;
    }
  }

  return Math.max(0, Math.min(1, total / daysInMonth));
}
