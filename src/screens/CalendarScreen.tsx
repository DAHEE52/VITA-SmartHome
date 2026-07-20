// 시안 6 - 캘린더 화면.
// 구조: 연/월 타이틀 / 요일+날짜 그리드 / DAILY 일정 리스트 / SPECIAL 일정 리스트 / 하단 네비
//
// 참고: "2026"·"7월" 큰 타이틀만 다른 화면과 같은 Jalnan 폰트를 쓰고,
// 요일/날짜/DAILY·SPECIAL/일정 텍스트는 원본 시안에서 각지지 않은 깔끔한 굵은 고딕이라
// 시스템 기본 폰트에 fontWeight만 bold로 줘서 구분했다.
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts } from '../theme/colors';
import Card from '../components/Card';
import BottomNav from '../components/BottomNav';
import { PlusIcon } from '../components/icons';

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
function WeekdayHeader() {
  return (
    <View style={styles.weekRow}>
      {WEEKDAYS.map((d, i) => (
        <Text key={d} style={[styles.weekdayText, { color: colorForWeekday(i) }]}>
          {d}
        </Text>
      ))}
    </View>
  );
}

// 날짜 숫자 그리드. 앞부분 빈 칸(FIRST_DAY_OFFSET)을 null로 채워 요일 위치를 맞춘다.
function DateGrid() {
  const cells: (number | null)[] = [
    ...Array(FIRST_DAY_OFFSET).fill(null),
    ...Array.from({ length: DAYS_IN_MONTH }, (_, i) => i + 1),
  ];

  return (
    <View style={styles.dateGrid}>
      {cells.map((day, i) => {
        const weekdayIndex = i % 7;
        const isToday = day === TODAY;
        return (
          <View key={i} style={styles.dateCell}>
            {day !== null && (
              <View style={[styles.dateCircle, isToday && styles.dateCircleToday]}>
                <Text
                  style={[
                    styles.dateText,
                    { color: isToday ? colors.textGray : colorForWeekday(weekdayIndex) },
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
function ScheduleRow({ time, label }: { time: string; label: string }) {
  return (
    <Card style={styles.scheduleRow}>
      <Text style={styles.scheduleTime}>{time}</Text>
      <View style={styles.scheduleDivider} />
      <Text style={styles.scheduleLabel}>{label}</Text>
    </Card>
  );
}

// 각 섹션(DAILY/SPECIAL) 리스트 하단의 "일정 추가" 원형 버튼
function AddButton() {
  return (
    <TouchableOpacity style={styles.addCircle} activeOpacity={0.7}>
      <PlusIcon size={20} />
    </TouchableOpacity>
  );
}

export default function CalendarScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <View style={styles.titleRow}>
          <Text style={styles.yearText}>{YEAR}</Text>
          <View style={styles.monthWrap}>
            <Text style={styles.monthText}>{MONTH_LABEL}</Text>
          </View>
        </View>

        <WeekdayHeader />
        <DateGrid />

        <Text style={styles.sectionTitle}>DAILY</Text>
        <ScheduleRow time="9:00" label="출근" />
        <ScheduleRow time="18:00" label="퇴근" />
        <View style={styles.addButtonWrap}>
          <AddButton />
        </View>

        <Text style={styles.sectionTitle}>SPECIAL</Text>
        <ScheduleRow time="19:00" label="저녁 약속" />
        <View style={styles.addButtonWrap}>
          <AddButton />
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
    paddingTop: 20,
  },

  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  yearText: {
    fontFamily: fonts.jalnan,
    fontSize: 30,
    color: colors.text,
  },
  monthWrap: {
    flex: 1,
    alignItems: 'center',
  },
  monthText: {
    fontFamily: fonts.jalnan,
    fontSize: 44,
    color: colors.text,
  },

  weekRow: {
    flexDirection: 'row',
    marginTop: 26,
  },
  weekdayText: {
    flex: 1,
    textAlign: 'center',
    fontWeight: '700',
    fontSize: 14,
  },

  dateGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  dateCell: {
    width: `${100 / 7}%`,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateCircleToday: {
    backgroundColor: colors.calendarPeach,
  },
  dateText: {
    fontWeight: '500',
    fontSize: 16,
  },

  sectionTitle: {
    fontWeight: '800',
    fontSize: 20,
    color: colors.text,
    marginTop: 22,
    marginBottom: 12,
  },
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 18,
    marginBottom: 12,
  },
  scheduleTime: {
    fontWeight: '700',
    fontSize: 20,
    color: colors.text,
  },
  scheduleDivider: {
    width: 2,
    height: 18,
    backgroundColor: colors.text,
    marginHorizontal: 16,
  },
  scheduleLabel: {
    fontWeight: '500',
    fontSize: 18,
    color: colors.text,
  },
  addButtonWrap: {
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 4,
  },
  addCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
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
