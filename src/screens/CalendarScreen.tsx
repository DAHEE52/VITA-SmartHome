// 시안 6 - 캘린더 화면.
// 구조: 연/월 타이틀 / 요일+날짜 그리드 / DAILY 일정 리스트 / SPECIAL 일정 리스트 / 하단 네비
//
// 참고: "2026"·"7월" 큰 타이틀만 다른 화면과 같은 Jalnan 폰트를 쓰고,
// 요일/날짜/DAILY·SPECIAL/일정 텍스트는 원본 시안에서 각지지 않은 깔끔한 굵은 고딕이라
// 시스템 기본 폰트에 fontWeight만 bold로 줘서 구분했다.
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts } from '../theme/colors';
import Card from '../components/Card';
import BottomNav from '../components/BottomNav';
import { PlusIcon } from '../components/icons';

// 스크롤 없이 화면 높이 안에 다 들어와야 하므로, MainScreen과 같은 방식으로
// 화면이 작은 기기에서는 날짜 그리드/일정 리스트 크기를 함께 줄이는 scale 값을 쓴다.
const REFERENCE_HEIGHT = 820;
const MIN_SCALE = 0.68;

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THR', 'FRI', 'SAT'] as const;

// 2026년 7월 기준 하드코딩된 달력 데이터.
// 1일이 목요일(THR, 인덱스 4)에서 시작하는 원본 시안을 그대로 재현.
const YEAR = 2026;
const MONTH_LABEL = '7월';
const FIRST_DAY_OFFSET = 4; // SUN=0 ... SAT=6 기준, 1일이 이 인덱스 요일에서 시작
const DAYS_IN_MONTH = 31;
const TODAY = 6;

// 요일 인덱스(0~6)에 따라 SUN=빨강, SAT=파랑, 그 외 검정을 돌려주는 헬퍼.
// 요일 헤더 글자색과 날짜 숫자색에 동일하게 사용해서 항상 같은 규칙을 유지한다.
function colorForWeekday(index: number) {
  if (index === 0) return colors.calendarRed;
  if (index === 6) return colors.calendarBlue;
  return colors.text;
}

// 요일 머리글 행 (SUN ~ SAT)
function WeekdayHeader({ scale }: { scale: number }) {
  return (
    <View style={[styles.weekRow, { marginTop: 16 * scale }]}>
      {WEEKDAYS.map((d, i) => (
        <Text
          key={d}
          style={[styles.weekdayText, { fontSize: 13 * scale, color: colorForWeekday(i) }]}
        >
          {d}
        </Text>
      ))}
    </View>
  );
}

// 날짜 숫자 그리드. 앞부분 빈 칸(FIRST_DAY_OFFSET)을 null로 채워 요일 위치를 맞춘다.
function DateGrid({ scale }: { scale: number }) {
  const cells: (number | null)[] = [
    ...Array(FIRST_DAY_OFFSET).fill(null),
    ...Array.from({ length: DAYS_IN_MONTH }, (_, i) => i + 1),
  ];
  const circleSize = 34 * scale;

  return (
    <View style={[styles.dateGrid, { marginTop: 6 * scale }]}>
      {cells.map((day, i) => {
        const weekdayIndex = i % 7;
        const isToday = day === TODAY;
        return (
          <View key={i} style={[styles.dateCell, { height: 46 * scale }]}>
            {day !== null && (
              <View
                style={[
                  styles.dateCircle,
                  { width: circleSize, height: circleSize, borderRadius: circleSize / 2 },
                  isToday && styles.dateCircleToday,
                ]}
              >
                <Text
                  style={[
                    styles.dateText,
                    {
                      fontSize: 15 * scale,
                      color: isToday ? colors.textGray : colorForWeekday(weekdayIndex),
                    },
                  ]}
                >
                  {day}
                </Text>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

// DAILY / SPECIAL 공용 일정 한 줄 ("시간 | 내용" 형태의 회색 카드)
function ScheduleRow({ time, label, scale }: { time: string; label: string; scale: number }) {
  return (
    <Card style={[styles.scheduleRow, { paddingVertical: 12 * scale, marginBottom: 8 * scale }]}>
      <Text style={[styles.scheduleTime, { fontSize: 17 * scale }]}>{time}</Text>
      <View style={[styles.scheduleDivider, { height: 16 * scale, marginHorizontal: 14 * scale }]} />
      <Text style={[styles.scheduleLabel, { fontSize: 16 * scale }]}>{label}</Text>
    </Card>
  );
}

// 각 섹션(DAILY/SPECIAL) 리스트 하단의 "일정 추가" 원형 버튼
function AddButton({ scale }: { scale: number }) {
  const size = 38 * scale;
  return (
    <TouchableOpacity style={[styles.addCircle, { width: size, height: size, borderRadius: size / 2 }]} activeOpacity={0.7}>
      <PlusIcon size={18 * scale} />
    </TouchableOpacity>
  );
}

export default function CalendarScreen() {
  const { height } = useWindowDimensions();
  const scale = Math.min(1, Math.max(MIN_SCALE, height / REFERENCE_HEIGHT));

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={[styles.content, { paddingTop: 16 * scale }]}>
        <View style={styles.titleRow}>
          <Text style={[styles.yearText, { fontSize: 26 * scale }]}>{YEAR}</Text>
          <View style={styles.monthWrap}>
            <Text style={[styles.monthText, { fontSize: 36 * scale }]}>{MONTH_LABEL}</Text>
          </View>
        </View>

        <WeekdayHeader scale={scale} />
        <DateGrid scale={scale} />

        <Text style={[styles.sectionTitle, { fontSize: 17 * scale, marginTop: 12 * scale, marginBottom: 6 * scale }]}>
          DAILY
        </Text>
        <ScheduleRow time="9:00" label="출근" scale={scale} />
        <ScheduleRow time="18:00" label="퇴근" scale={scale} />
        <View style={[styles.addButtonWrap, { marginTop: 2 * scale, marginBottom: 2 * scale }]}>
          <AddButton scale={scale} />
        </View>

        <Text style={[styles.sectionTitle, { fontSize: 17 * scale, marginTop: 12 * scale, marginBottom: 6 * scale }]}>
          SPECIAL
        </Text>
        <ScheduleRow time="19:00" label="저녁 약속" scale={scale} />
        <View style={[styles.addButtonWrap, { marginTop: 2 * scale, marginBottom: 2 * scale }]}>
          <AddButton scale={scale} />
        </View>
      </View>
      <View style={styles.bottomNavWrap}>
        <BottomNav variant="sub" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },

  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  yearText: {
    fontFamily: fonts.jalnan,
    color: colors.text,
  },
  monthWrap: {
    flex: 1,
    alignItems: 'center',
  },
  monthText: {
    fontFamily: fonts.jalnan,
    color: colors.text,
  },

  weekRow: {
    flexDirection: 'row',
  },
  weekdayText: {
    flex: 1,
    textAlign: 'center',
    fontWeight: '700',
  },

  dateGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dateCell: {
    width: `${100 / 7}%`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateCircle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateCircleToday: {
    backgroundColor: colors.calendarPeach,
  },
  dateText: {
    fontWeight: '500',
  },

  sectionTitle: {
    fontWeight: '800',
    color: colors.text,
  },
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  scheduleTime: {
    fontWeight: '700',
    color: colors.text,
  },
  scheduleDivider: {
    width: 2,
    backgroundColor: colors.text,
  },
  scheduleLabel: {
    fontWeight: '500',
    color: colors.text,
  },
  addButtonWrap: {
    alignItems: 'center',
  },
  addCircle: {
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },

  bottomNavWrap: {
    paddingHorizontal: 20,
    paddingBottom: 10,
    paddingTop: 6,
  },
});
