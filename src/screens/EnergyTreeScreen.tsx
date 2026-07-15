// 신규 화면 - "에너지 나무". 헬스케어 시안(8번) 자리를 대체한다(전달된 UIUX 목업은 없음).
// 구조: 날짜 헤더(탭하면 날짜/월 변경) / 그 날의 나무(또는 월말이면 그 달의 숲) / 한 달 성장 트래커
//      / 이번 달 절약량·CO2 통계 / 하단 네비(홈)
//
// "나무 성장률"은 EnergyHistoryContext가 실시간으로 쌓는 실제 하루 사용량(dailyUsage)을 하루 목표
// 사용량(절전 목표가 있으면 그걸 일할로 나눈 값, 없으면 참고용 평균치)과 비교해 계산한다 -
// 목표보다 적게 썼을수록 성장률이 높고(진하게), 데이터가 없는 날(아직 쓰지 않은 날)은 0으로 표시된다.
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Pressable, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts } from '../theme/colors';
import Card from '../components/Card';
import BottomNav from '../components/BottomNav';
import { TreeIcon } from '../components/icons';
import { useEnergyHistory } from '../context/EnergyHistoryContext';
import { useGoal } from '../context/GoalContext';

const REFERENCE_HEIGHT = 820;
const MIN_SCALE = 0.7;

// 절전 목표(GoalContext)가 아직 없을 때 쓰는 하루 참고 사용량(kWh) - 성장률 계산의 기준값.
const DEFAULT_DAILY_TARGET_KWH = 10;
// 한국전력 전력량당 온실가스 배출계수(약 0.4781 kg-CO2/kWh)를 적용한 근사 환산값.
const CO2_FACTOR = 0.4781;

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function pad2(n: number) {
  return String(n).padStart(2, '0');
}
function dateKey(year: number, month0: number, day: number) {
  return `${year}-${pad2(month0 + 1)}-${pad2(day)}`;
}

// 하루 성장률(0~1) - 그날 실제 사용량이 없으면(아직 데이터가 안 쌓였으면) 0, 있으면 목표 대비
// 적게 쓴 비율만큼 성장한다. 목표보다 많이 썼으면 0으로 바닥을 둔다.
function growthRate(
  dailyUsage: Record<string, number>,
  dailyTarget: number,
  year: number,
  month0: number,
  day: number
): number {
  const usage = dailyUsage[dateKey(year, month0, day)];
  if (usage == null) return 0;
  return Math.max(0, Math.min(1, 1 - usage / dailyTarget));
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
  dailyTarget: number;
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
        const isSelected = day === selectedDay;
        return (
          <TouchableOpacity
            key={day}
            style={[styles.dayCell, isSelected && styles.dayCellSelected]}
            onPress={() => onSelectDay(day)}
            activeOpacity={0.7}
          >
            <View style={[styles.dayGrowthDot, { opacity: Math.max(0.12, g) }]} />
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
  dailyTarget: number;
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

// 그 날 하루의 나무 - 실제 TreeIcon을 성장률만큼 옅게(opacity)·작게 보여준다.
// 성장률이 낮을수록 색이 옅고 나무가 작아서, 아직 다 자라지 않은 느낌을 준다.
function DailyTree({ growth, scale }: { growth: number; scale: number }) {
  const size = (100 + 80 * growth) * scale;
  return (
    <View style={[styles.treeWrap, { marginVertical: 24 * scale }]}>
      <View style={{ opacity: Math.max(0.15, growth) }}>
        <TreeIcon size={size} />
      </View>
      <Text style={[styles.growthText, { fontSize: 13 * scale, marginTop: 8 * scale }]}>
        오늘 성장률 {Math.round(growth * 100)}%
      </Text>
    </View>
  );
}

// 월말(그 달의 마지막 날)에만 보여주는 "숲" - 그 달의 하루하루가 자란 나무들을 한 화면에 모은다.
function Forest({
  year,
  month0,
  dailyUsage,
  dailyTarget,
  scale,
}: {
  year: number;
  month0: number;
  dailyUsage: Record<string, number>;
  dailyTarget: number;
  scale: number;
}) {
  const daysInMonth = daysInMonthOf(year, month0);
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  return (
    <View style={[styles.forestWrap, { marginVertical: 20 * scale }]}>
      <Text style={[styles.forestTitle, { fontSize: 15 * scale, marginBottom: 10 * scale }]}>
        🌲 {month0 + 1}월의 숲
      </Text>
      <View style={styles.forestGrid}>
        {days.map((day) => {
          const g = growthRate(dailyUsage, dailyTarget, year, month0, day);
          return (
            <View key={day} style={{ opacity: Math.max(0.12, g) }}>
              <TreeIcon size={26 * scale} />
            </View>
          );
        })}
      </View>
    </View>
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

  const year = selectedDate.getFullYear();
  const month0 = selectedDate.getMonth();
  const day = selectedDate.getDate();
  const daysInMonth = daysInMonthOf(year, month0);
  const isMonthEnd = day === daysInMonth;

  const dailyTarget = goalKwh != null ? goalKwh / daysInMonth : DEFAULT_DAILY_TARGET_KWH;

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

  const selectedGrowth = growthRate(dailyUsage, dailyTarget, year, month0, day);

  // 이번 달(선택된 날짜가 속한 달) 절약량 = 데이터가 있는 날들의 (목표 - 실사용) 합.
  const monthSavedKwh = Array.from({ length: daysInMonth }, (_, i) => i + 1).reduce((sum, d) => {
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

        {isMonthEnd ? (
          <Forest year={year} month0={month0} dailyUsage={dailyUsage} dailyTarget={dailyTarget} scale={scale} />
        ) : (
          <DailyTree growth={selectedGrowth} scale={scale} />
        )}

        <Card style={[styles.trackerCard, { padding: 16 * scale, marginBottom: 14 * scale }]}>
          <Text style={[styles.trackerTitle, { fontSize: 14 * scale, marginBottom: 10 * scale }]}>
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
            selectedDay={day}
            dailyUsage={dailyUsage}
            dailyTarget={dailyTarget}
            onSelectDay={(d) => setSelectedDate(new Date(year, month0, d))}
          />
        </Card>

        <StatRow savedKwh={monthSavedKwh} scale={scale} />
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    justifyContent: 'center',
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

  forestWrap: {
    alignItems: 'center',
  },
  forestTitle: {
    fontFamily: fonts.jalnan,
    color: colors.text,
  },
  forestGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 4,
    maxWidth: 320,
  },

  trackerCard: {},
  trackerTitle: {
    fontFamily: fonts.jalnan,
    color: colors.text,
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
