// 신규 화면 - "에너지 나무". 헬스케어 시안(8번) 자리를 대체한다(전달된 UIUX 목업은 없음).
// 구조: 날짜 헤더(탭하면 날짜/월 변경) / 그 날의 나무(화분) / "숲 보기"·"성장 트래커" 버튼(화면 정중앙보다
//      살짝 아래에 위치, 위아래로 나무·통계와 약간의 공백을 둠) / 이번 달 절약량·CO2 통계 / 하단 네비(홈)
//
// 화분(DailyTree)의 "나무 성장률"은 절전 목표(GoalContext.goalKwh)와 동기화된 "이번 달 목표 달성률"
// 이다(monthAchievementRate) - 목표 자체가 없으면 비교 기준이 없으므로 0(가장 어린 새싹)에서 시작하고,
// 완료된 날 중 목표 이내로 쓴 날이 쌓일수록 자란다. 오늘은 아직 하루가 안 끝났으니 지난 시간
// 비율만큼만 기여해서 하루 시작 직후 갑자기 튀지 않는다. 나무는 성장률에 따라 새싹(12) → 어린 나무
// (13) → 나무(14) 순으로 아이콘이 바뀌고, 각 단계 안에서도 크기가 점점 커진다(DailyTree 참고).
// (성장 트래커/숲의 날짜별 점·아이콘은 이와 별개로 그날 하루만의 성장률(growthRate)을 쓴다.)
//
// "그 달의 숲"과 "성장 트래커"는 둘 다 화면에 항상 박혀 있지 않고 버튼을 눌러야 뜨는 팝업(Modal)이다.
// 숲은 이 탭에 들어왔을 때 마침 오늘이 그 달의 마지막 날이면 버튼 없이도 자동으로 한 번 뜬다.
import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Pressable, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';

import { colors, fonts } from '../theme/colors';
import Card from '../components/Card';
import BottomNav from '../components/BottomNav';
import { SproutIcon, SaplingIcon, GrownTreeIcon } from '../components/icons';
import { useEnergyHistory } from '../context/EnergyHistoryContext';
import { useGoal } from '../context/GoalContext';

const REFERENCE_HEIGHT = 820;
const MIN_SCALE = 0.7;

// 한국전력 전력량당 온실가스 배출계수(약 0.4781 kg-CO2/kWh)를 적용한 근사 환산값.
const CO2_FACTOR = 0.4781;

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function pad2(n: number) {
  return String(n).padStart(2, '0');
}
function dateKey(year: number, month0: number, day: number) {
  return `${year}-${pad2(month0 + 1)}-${pad2(day)}`;
}

// 오늘 날짜는 아직 하루가 다 지나지 않았으므로, 하루 목표 전체가 아니라 "지금까지 지난 시간만큼의"
// 목표와 비교해야 한다. 이 보정이 없으면 하루가 막 시작됐을 때도 실사용량이 하루 전체 목표보다
// 항상 훨씬 작아서 성장률이 곧바로 100%에 가깝게 튀어버린다(절전 목표 달성률은 0%인데 오늘 성장률만
// 100%로 나오던 오류의 원인). 자정 직후엔 지난 시간이 0에 가까워 분모가 너무 작아지지 않도록
// 최소 비율(MIN_DAY_FRACTION)을 바닥으로 둔다.
const MIN_DAY_FRACTION = 0.02; // 하루의 최소 2%(약 29분)는 지난 것으로 취급

function isToday(year: number, month0: number, day: number, now: Date): boolean {
  return year === now.getFullYear() && month0 === now.getMonth() && day === now.getDate();
}

function dayFractionElapsed(now: Date): number {
  const seconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  return seconds / 86400;
}

// 하루 성장률(0~1) - 절전 목표(GoalContext)와 동기화된 값이라, 목표 자체가 없으면(dailyTarget=null)
// 비교할 기준이 없으므로 0(새싹 이전)이다. 목표가 있고 그날 실제 사용량이 없으면(아직 안 쌓였으면)도
// 0, 있으면 목표 대비 적게 쓴 비율만큼 성장한다. 목표보다 많이 썼으면 0으로 바닥을 둔다.
function growthRate(
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

// growthRate와 달리 "그날 데이터가 실제로 있는지"만 알려준다 - 성장률이 0이어도(목표보다 많이 써서)
// 데이터 자체는 있는 날과, 아예 기록이 없는 날(아무것도 없는 날)을 구분하기 위함.
function hasUsageData(dailyUsage: Record<string, number>, year: number, month0: number, day: number): boolean {
  return dailyUsage[dateKey(year, month0, day)] != null;
}

// 화분(DailyTree)의 성장률 - "오늘 하루만" 보는 growthRate와 달리, 이번 달 전체를 통틀어 절전 목표를
// 얼마나 잘 지켰는지를 나타내는 "이번 달 절전 목표 달성률"이다. 데이터가 전혀 없으면(막 시작한
// 시점) 0에서 시작하고, 완료된 날 중 목표 이내로 쓴 날이 쌓일수록 자란다. 오늘은 아직 하루가 안
// 끝났으므로 지난 시간 비율만큼만 기여해서(0%→100% 서서히), 하루 시작 직후 갑자기 튀지 않는다.
function monthAchievementRate(
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

function daysInMonthOf(year: number, month0: number) {
  return new Date(year, month0 + 1, 0).getDate();
}

// "에너지 나무" 위에 붙는 회색 알약 모양 라벨 - HealthcareScreen의 SectionPill과 동일한 스타일.
function SectionPill({ label, scale }: { label: string; scale: number }) {
  return (
    <View style={[styles.pillWrap, { marginBottom: 10 * scale }]}>
      <View
        style={[
          styles.pill,
          { borderRadius: 20 * scale, paddingVertical: 8 * scale, paddingHorizontal: 20 * scale },
        ]}
      >
        <Text style={[styles.pillText, { fontSize: 15 * scale }]}>{label}</Text>
      </View>
    </View>
  );
}

// 날짜 그리드(주차 정렬) 한 칸 - 요일 헤더 아래 배치되는 실제 "날짜 셀"들.
// 트래커(항상 보임)와 날짜 선택 모달 양쪽에서 재사용한다.
function DayGrid({
  year,
  month0,
  selectedDay,
  dailyUsage,
  dailyTarget,
  onSelectDay,
}: {
  year: number;
  month0: number;
  selectedDay: number | null;
  dailyUsage: Record<string, number>;
  dailyTarget: number | null;
  onSelectDay: (day: number) => void;
}) {
  const daysInMonth = daysInMonthOf(year, month0);
  const firstWeekday = new Date(year, month0, 1).getDay();
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <View style={styles.dayGrid}>
      {cells.map((day, i) => {
        if (day == null) return <View key={`empty-${i}`} style={styles.dayCell} />;
        const g = growthRate(dailyUsage, dailyTarget, year, month0, day);
        const hasData = hasUsageData(dailyUsage, year, month0, day);
        const isSelected = day === selectedDay;
        return (
          <TouchableOpacity
            key={day}
            style={[styles.dayCell, isSelected && styles.dayCellSelected]}
            onPress={() => onSelectDay(day)}
            activeOpacity={0.7}
          >
            {hasData && <View style={[styles.dayGrowthDot, { opacity: Math.max(0.12, g) }]} />}
            <Text style={styles.dayNumberText}>{day}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// 상단 날짜를 탭하면 뜨는 창 - 월을 이동하고, 날짜를 골라 그 날의 나무를 볼 수 있다.
function DatePickerModal({
  visible,
  year,
  month0,
  selectedYear,
  selectedMonth0,
  selectedDay,
  dailyUsage,
  dailyTarget,
  onClose,
  onSelectDay,
  onChangeMonth,
}: {
  visible: boolean;
  year: number;
  month0: number;
  selectedYear: number;
  selectedMonth0: number;
  selectedDay: number;
  dailyUsage: Record<string, number>;
  dailyTarget: number | null;
  onClose: () => void;
  onSelectDay: (day: number) => void;
  onChangeMonth: (delta: number) => void;
}) {
  const isSameMonth = year === selectedYear && month0 === selectedMonth0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={() => {}}>
          <View style={styles.monthNavRow}>
            <TouchableOpacity onPress={() => onChangeMonth(-1)} hitSlop={10}>
              <Text style={styles.navArrow}>‹</Text>
            </TouchableOpacity>
            <Text style={styles.monthTitle}>
              {year}년 {month0 + 1}월
            </Text>
            <TouchableOpacity onPress={() => onChangeMonth(1)} hitSlop={10}>
              <Text style={styles.navArrow}>›</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.weekdayRow}>
            {WEEKDAYS.map((w) => (
              <Text key={w} style={styles.weekdayText}>
                {w}
              </Text>
            ))}
          </View>

          <DayGrid
            year={year}
            month0={month0}
            selectedDay={isSameMonth ? selectedDay : null}
            dailyUsage={dailyUsage}
            dailyTarget={dailyTarget}
            onSelectDay={onSelectDay}
          />

          <TouchableOpacity style={styles.modalCloseButton} onPress={onClose} activeOpacity={0.7}>
            <Text style={styles.modalCloseText}>닫기</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// 성장률(0~1)에 따른 성장 단계 - 새싹 → 어린 나무 → 나무(다 자람), 3단계 모두 전용 PNG 아이콘을 쓴다.
type GrowthStage = 'sprout' | 'sapling' | 'tree';
// 각 단계 구간 안에서도 성장률에 비례해 크기가 커지도록, 단계별 최소~최대 크기(px, scale 적용 전)를 둔다.
const STAGE_RANGES: Record<GrowthStage, { min: number; max: number; from: number; to: number; Icon: typeof SproutIcon }> = {
  sprout: { min: 60, max: 100, from: 0, to: 0.34, Icon: SproutIcon },
  sapling: { min: 100, max: 140, from: 0.34, to: 0.67, Icon: SaplingIcon },
  tree: { min: 140, max: 180, from: 0.67, to: 1, Icon: GrownTreeIcon },
};
function getGrowthStage(growth: number): GrowthStage {
  if (growth < 0.34) return 'sprout';
  if (growth < 0.67) return 'sapling';
  return 'tree';
}
// 단계 구간 안에서의 진행 비율(0~1)만큼 min~max 사이로 크기를 보간한다.
function stageIconSize(growth: number, scale: number): number {
  const stage = getGrowthStage(growth);
  const { min, max, from, to } = STAGE_RANGES[stage];
  const localProgress = to > from ? Math.min(1, Math.max(0, (growth - from) / (to - from))) : 1;
  return (min + (max - min) * localProgress) * scale;
}

// 화분 - 이번 달 절전 목표 달성률에 따라 새싹→어린 나무→나무 순으로, 단계 안에서도 크기가
// 점점 커지며 자란다. 목표(GoalContext)가 아직 없으면 항상 새싹(최소 크기)이고, 목표를 설정해야
// 자라기 시작한다는 안내를 보여준다.
function DailyTree({ growth, hasGoal, scale }: { growth: number; hasGoal: boolean; scale: number }) {
  const stage = getGrowthStage(growth);
  const StageIcon = STAGE_RANGES[stage].Icon;
  const size = stageIconSize(growth, scale);

  return (
    <View style={styles.treeWrap}>
      <StageIcon size={size} />
      <Text style={[styles.growthText, { fontSize: 13 * scale, marginTop: 8 * scale }]}>
        {hasGoal ? `이번 달 목표 달성률 ${Math.round(growth * 100)}%` : '절전 목표를 설정하면 나무가 자라기 시작해요'}
      </Text>
    </View>
  );
}

// "그 달의 숲" 팝업 - 그 달의 하루하루가 자란 나무들을 한 화면에 모아 보여준다.
// 평소엔 "숲 보기" 버튼으로, 월말에 이 탭에 들어오면 자동으로 뜬다(EnergyTreeScreen 참고).
function ForestModal({
  visible,
  year,
  month0,
  dailyUsage,
  dailyTarget,
  scale,
  onClose,
}: {
  visible: boolean;
  year: number;
  month0: number;
  dailyUsage: Record<string, number>;
  dailyTarget: number | null;
  scale: number;
  onClose: () => void;
}) {
  const daysInMonth = daysInMonthOf(year, month0);
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={() => {}}>
          <Text style={[styles.forestTitle, { fontSize: 16 * scale, marginBottom: 14 * scale }]}>
            🌲 {year}년 {month0 + 1}월의 숲
          </Text>
          <View style={styles.forestGrid}>
            {days.map((day) => {
              const g = growthRate(dailyUsage, dailyTarget, year, month0, day);
              const StageIcon = STAGE_RANGES[getGrowthStage(g)].Icon;
              return <StageIcon key={day} size={20 * scale + 10 * scale * g} />;
            })}
          </View>

          <TouchableOpacity style={styles.modalCloseButton} onPress={onClose} activeOpacity={0.7}>
            <Text style={styles.modalCloseText}>닫기</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// "성장 트래커" 팝업 - 한 달 치 날짜별 성장률을 달력 형태로 보여주고, 날짜를 고르면 그 날의
// 나무(화분)로 화면이 바뀌면서 팝업이 닫힌다.
function TrackerModal({
  visible,
  year,
  month0,
  selectedDay,
  dailyUsage,
  dailyTarget,
  scale,
  onClose,
  onSelectDay,
}: {
  visible: boolean;
  year: number;
  month0: number;
  selectedDay: number;
  dailyUsage: Record<string, number>;
  dailyTarget: number | null;
  scale: number;
  onClose: () => void;
  onSelectDay: (day: number) => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={() => {}}>
          <Text style={[styles.trackerTitle, { fontSize: 16 * scale, marginBottom: 12 * scale }]}>
            {month0 + 1}월 성장 트래커
          </Text>
          <View style={styles.weekdayRow}>
            {WEEKDAYS.map((w) => (
              <Text key={w} style={styles.weekdayText}>
                {w}
              </Text>
            ))}
          </View>
          <DayGrid
            year={year}
            month0={month0}
            selectedDay={selectedDay}
            dailyUsage={dailyUsage}
            dailyTarget={dailyTarget}
            onSelectDay={(d) => {
              onSelectDay(d);
              onClose();
            }}
          />
          <TouchableOpacity style={styles.modalCloseButton} onPress={onClose} activeOpacity={0.7}>
            <Text style={styles.modalCloseText}>닫기</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// 이번 달 절약량 / CO2 절감량 2열 통계 카드
function StatRow({ savedKwh, scale }: { savedKwh: number; scale: number }) {
  const co2SavedKg = Math.round(savedKwh * CO2_FACTOR);
  return (
    <Card style={[styles.statCard, { padding: 20 * scale }]}>
      <View style={styles.statRow}>
        <View style={styles.statCol}>
          <Text style={[styles.statValue, { fontSize: 26 * scale }]}>{Math.round(savedKwh)}kWh</Text>
          <Text style={[styles.statLabel, { fontSize: 14 * scale, marginTop: 6 * scale }]}>
            이번 달 절약량
          </Text>
        </View>
        <View style={[styles.statDivider, { height: 36 * scale }]} />
        <View style={styles.statCol}>
          <Text style={[styles.statValue, { fontSize: 26 * scale }]}>{co2SavedKg}kg</Text>
          <Text style={[styles.statLabel, { fontSize: 14 * scale, marginTop: 6 * scale }]}>
            CO2 절감량
          </Text>
        </View>
      </View>
    </Card>
  );
}

export default function EnergyTreeScreen() {
  const { height } = useWindowDimensions();
  const scale = Math.min(1, Math.max(MIN_SCALE, height / REFERENCE_HEIGHT));

  const { dailyUsage } = useEnergyHistory();
  const { goalKwh } = useGoal();

  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [pickerVisible, setPickerVisible] = useState(false);
  // 날짜 선택 창은 월 이동이 가능해서, "지금 보고 있는 달"을 선택된 날짜와 별도로 들고 있는다.
  const [viewYear, setViewYear] = useState(selectedDate.getFullYear());
  const [viewMonth0, setViewMonth0] = useState(selectedDate.getMonth());
  // 숲 팝업에 보여줄 연/월 - null이면 닫혀 있는 상태. "숲 보기" 버튼은 지금 보고 있는 달을,
  // 월말 자동 팝업은 실제 오늘 날짜 기준 달을 넣는다.
  const [forestMonth, setForestMonth] = useState<{ year: number; month0: number } | null>(null);
  const [trackerVisible, setTrackerVisible] = useState(false);

  const year = selectedDate.getFullYear();
  const month0 = selectedDate.getMonth();
  const day = selectedDate.getDate();
  const daysInMonth = daysInMonthOf(year, month0);

  // 절전 목표가 없으면 성장률을 계산할 기준이 없으므로 null(비교 대상 없음)을 돌려준다 -
  // 참고용 임의 기본값으로 대체하지 않아, 성장률이 실제 목표와만 동기화되게 한다.
  const dailyTargetFor = (y: number, m0: number) => {
    if (goalKwh == null) return null;
    const dim = daysInMonthOf(y, m0);
    return goalKwh / dim;
  };
  const dailyTarget = dailyTargetFor(year, month0);
  const hasGoal = goalKwh != null;

  // 이 탭에 들어올 때(포커스될 때)마다 확인해서, 실제 오늘이 그 달의 마지막 날이면 숲 팝업을 자동으로 띄운다.
  useFocusEffect(
    useCallback(() => {
      const today = new Date();
      const todayYear = today.getFullYear();
      const todayMonth0 = today.getMonth();
      if (today.getDate() === daysInMonthOf(todayYear, todayMonth0)) {
        setForestMonth({ year: todayYear, month0: todayMonth0 });
      }
    }, [])
  );

  const openPicker = () => {
    setViewYear(year);
    setViewMonth0(month0);
    setPickerVisible(true);
  };

  const changeViewMonth = (delta: number) => {
    const d = new Date(viewYear, viewMonth0 + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth0(d.getMonth());
  };

  const selectDay = (d: number) => {
    setSelectedDate(new Date(viewYear, viewMonth0, d));
    setPickerVisible(false);
  };

  // 화분(DailyTree)은 "오늘 하루"가 아니라 지금 보고 있는 달 전체의 절전 목표 달성률로 자란다.
  const monthGrowth = monthAchievementRate(dailyUsage, dailyTarget, year, month0);

  // 이번 달(선택된 날짜가 속한 달) 절약량 = 데이터가 있는 날들의 (목표 - 실사용) 합.
  // 목표 자체가 없으면(dailyTarget=null) 계산할 기준이 없으므로 0.
  const monthSavedKwh =
    dailyTarget == null
      ? 0
      : Array.from({ length: daysInMonth }, (_, i) => i + 1).reduce((sum, d) => {
          const usage = dailyUsage[dateKey(year, month0, d)];
          if (usage == null) return sum;
          return sum + Math.max(0, dailyTarget - usage);
        }, 0);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={[styles.content, { paddingTop: 16 * scale }]}>
        <SectionPill label="에너지 나무" scale={scale} />

        <TouchableOpacity onPress={openPicker} activeOpacity={0.7} style={styles.dateHeaderWrap}>
          <Text style={[styles.dateHeaderText, { fontSize: 16 * scale }]}>
            {year}년 {month0 + 1}월 {day}일
          </Text>
          <Text style={[styles.dateHeaderHint, { fontSize: 12 * scale }]}>탭해서 날짜 변경</Text>
        </TouchableOpacity>

        {/* 버튼 행 위치(topSpacer+middleSpacer 합)는 고정한 채, topSpacer를 늘리고 middleSpacer를
            그만큼 줄여서 화분(오늘 성장률)만 아래로 내리고 그 아래 공백을 조금 줄였다. */}
        <View style={{ flex: 1.94 }} />

        <DailyTree growth={monthGrowth} hasGoal={hasGoal} scale={scale} />

        {/* "오늘 성장률" 문구와 버튼 사이의 남은 공백. */}
        <View style={{ flex: 0.7 }} />

        <View style={[styles.actionButtonRow, { marginBottom: 14 * scale, gap: 10 * scale }]}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => setForestMonth({ year, month0 })}
            activeOpacity={0.7}
          >
            <Text style={[styles.actionButtonText, { fontSize: 14 * scale }]}>🌲 {month0 + 1}월 숲 보기</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={() => setTrackerVisible(true)} activeOpacity={0.7}>
            <Text style={[styles.actionButtonText, { fontSize: 14 * scale }]}>🌱 성장 트래커</Text>
          </TouchableOpacity>
        </View>

        <StatRow savedKwh={monthSavedKwh} scale={scale} />

        <View style={{ flex: 1 }} />
      </View>
      <View style={styles.bottomNavWrap}>
        <BottomNav variant="sub" />
      </View>

      <DatePickerModal
        visible={pickerVisible}
        year={viewYear}
        month0={viewMonth0}
        selectedYear={year}
        selectedMonth0={month0}
        selectedDay={day}
        dailyUsage={dailyUsage}
        dailyTarget={dailyTarget}
        onClose={() => setPickerVisible(false)}
        onSelectDay={selectDay}
        onChangeMonth={changeViewMonth}
      />

      {forestMonth && (
        <ForestModal
          visible
          year={forestMonth.year}
          month0={forestMonth.month0}
          dailyUsage={dailyUsage}
          dailyTarget={dailyTargetFor(forestMonth.year, forestMonth.month0)}
          scale={scale}
          onClose={() => setForestMonth(null)}
        />
      )}

      <TrackerModal
        visible={trackerVisible}
        year={year}
        month0={month0}
        selectedDay={day}
        dailyUsage={dailyUsage}
        dailyTarget={dailyTarget}
        scale={scale}
        onClose={() => setTrackerVisible(false)}
        onSelectDay={(d) => setSelectedDate(new Date(year, month0, d))}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },

  pillWrap: {
    alignItems: 'center',
  },
  pill: {
    backgroundColor: colors.card,
  },
  pillText: {
    fontFamily: fonts.jalnan,
    color: colors.text,
  },

  dateHeaderWrap: {
    alignItems: 'center',
  },
  dateHeaderText: {
    fontFamily: fonts.jalnan,
    color: colors.text,
  },
  dateHeaderHint: {
    color: colors.textGray,
    marginTop: 2,
  },

  treeWrap: {
    alignItems: 'center',
  },
  growthText: {
    fontFamily: fonts.jalnan,
    color: colors.textGray2,
  },

  forestTitle: {
    fontFamily: fonts.jalnan,
    color: colors.text,
    textAlign: 'center',
  },
  forestGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 4,
  },
  // "숲 보기"/"성장 트래커" 버튼 한 쌍 - 각각 ForestModal/TrackerModal을 연다.
  actionButtonRow: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  actionButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: colors.card,
  },
  actionButtonText: {
    fontFamily: fonts.jalnan,
    color: colors.textGray2,
  },

  trackerTitle: {
    fontFamily: fonts.jalnan,
    color: colors.text,
    textAlign: 'center',
  },

  weekdayRow: {
    flexDirection: 'row',
  },
  weekdayText: {
    width: `${100 / 7}%`,
    textAlign: 'center',
    fontSize: 11,
    color: colors.textGray,
    fontFamily: fonts.jalnan,
  },
  dayGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCellSelected: {
    borderWidth: 1.5,
    borderColor: colors.orange,
    borderRadius: 8,
  },
  dayGrowthDot: {
    position: 'absolute',
    width: '70%',
    height: '70%',
    borderRadius: 8,
    backgroundColor: colors.green,
  },
  dayNumberText: {
    fontSize: 12,
    color: colors.text,
  },

  statCard: {},
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statCol: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 2,
    backgroundColor: colors.text,
  },
  statValue: {
    fontFamily: fonts.jalnan,
    color: colors.text,
  },
  statLabel: {
    fontFamily: fonts.jalnan,
    color: colors.textGray2,
  },

  bottomNavWrap: {
    paddingHorizontal: 20,
    paddingBottom: 10,
    paddingTop: 6,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  modalCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 20,
  },
  monthNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  navArrow: {
    fontSize: 22,
    color: colors.text,
    paddingHorizontal: 10,
  },
  monthTitle: {
    fontFamily: fonts.jalnan,
    fontSize: 16,
    color: colors.text,
  },
  modalCloseButton: {
    marginTop: 16,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: colors.card,
  },
  modalCloseText: {
    fontFamily: fonts.jalnan,
    fontSize: 15,
    color: colors.text,
  },
});
