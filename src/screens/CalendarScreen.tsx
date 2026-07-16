// 시안 6 - 캘린더 화면.
// 구조: 연/월 타이틀(눌러서 날짜 변경) / 요일+날짜 그리드 / DAILY 일정 리스트 / SPECIAL 일정 리스트 / 하단 네비
//
// 참고: "2026"·"7월" 큰 타이틀만 다른 화면과 같은 Jalnan 폰트를 쓰고,
// 요일/날짜/DAILY·SPECIAL/일정 텍스트는 원본 시안에서 각지지 않은 깔끔한 굵은 고딕이라
// 시스템 기본 폰트에 fontWeight만 bold로 줘서 구분했다.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
  TextInput,
  ScrollView,
  PanResponder,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts } from '../theme/colors';
import Card from '../components/Card';
import BottomNav from '../components/BottomNav';
import { PlusIcon, EllipsisIcon } from '../components/icons';
import { useCalendar, ScheduleItem, SpecialKind } from '../context/CalendarContext';

// 스크롤 없이 화면 높이 안에 다 들어와야 하므로, MainScreen과 같은 방식으로
// 화면이 작은 기기에서는 날짜 그리드/일정 리스트 크기를 함께 줄이는 scale 값을 쓴다.
const REFERENCE_HEIGHT = 820;
const MIN_SCALE = 0.68;

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THR', 'FRI', 'SAT'] as const;
const MONTH_NAMES = Array.from({ length: 12 }, (_, i) => `${i + 1}월`);

// DAILY/SPECIAL 일정 한 줄의 시간 컬럼 폭을 고정해서, 항목마다 시간 자릿수가 달라도
// "|" 구분선이 항상 같은 x 위치에 오도록 한다 (시간은 이 폭 안에서 오른쪽 정렬).
const TIME_COL_WIDTH = 52;

const now = new Date();

// SPECIAL 일정의 유형 칩 3개. 자동화 규칙 화면이 "외출 예정"/"외박 일정"을 트리거로 참조할 때 이 값을 쓴다.
const KIND_OPTIONS: { value: SpecialKind; label: string }[] = [
  { value: 'general', label: '일반' },
  { value: 'outing', label: '외출' },
  { value: 'overnight', label: '외박' },
];
const KIND_LABEL: Record<SpecialKind, string> = { general: '일반', outing: '외출', overnight: '외박' };

const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAY_SHORT = ['일', '월', '화', '수', '목', '금', '토'];

function isEveryDay(weekdays?: number[]) {
  return !weekdays || weekdays.length === 0 || weekdays.length >= 7;
}

// 요일 배열을 "월·수·금" 같은 요약 문자열로 만든다. 매일이면 null(표시 안 함).
function summarizeWeekdays(weekdays?: number[]): string | null {
  if (isEveryDay(weekdays)) return null;
  return [...weekdays!].sort((a, b) => a - b).map((d) => WEEKDAY_SHORT[d]).join('·');
}

// SPECIAL 일정의 유형(일반/외출/외박)을 고르는 칩 3개.
function KindChipRow({ value, onChange }: { value: SpecialKind; onChange: (k: SpecialKind) => void }) {
  return (
    <View style={styles.kindChipRow}>
      {KIND_OPTIONS.map((opt) => (
        <TouchableOpacity
          key={opt.value}
          style={[styles.kindChip, value === opt.value && styles.kindChipSelected]}
          onPress={() => onChange(opt.value)}
          activeOpacity={0.7}
        >
          <Text style={[styles.kindChipText, value === opt.value && styles.kindChipTextSelected]}>
            {opt.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// DAILY(루틴) 일정이 반복될 요일을 고르는 칩 7개(다중 선택, 최소 1개는 항상 선택돼 있어야 함).
function WeekdayChipRow({ value, onChange }: { value: number[]; onChange: (weekdays: number[]) => void }) {
  const toggle = (day: number) => {
    const has = value.includes(day);
    if (has) {
      if (value.length <= 1) return;
      onChange(value.filter((d) => d !== day));
    } else {
      onChange([...value, day].sort((a, b) => a - b));
    }
  };
  return (
    <View style={styles.weekdayChipRow}>
      {WEEKDAY_SHORT.map((label, day) => {
        const selected = value.includes(day);
        return (
          <TouchableOpacity
            key={day}
            style={[styles.weekdayChip, selected && styles.weekdayChipSelected]}
            onPress={() => toggle(day)}
            activeOpacity={0.7}
          >
            <Text style={[styles.weekdayChipText, selected && styles.weekdayChipTextSelected]}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// "9:05" 같은 문자열을 0~23시/0~59분으로 파싱한다. 형식이 안 맞으면 0:00으로 취급.
function parseTime(time: string): { hour: number; minute: number } {
  const match = time.match(/^(\d{1,2}):(\d{2})$/);
  // 아직 시간을 정하지 않은 새 일정은 12시(자정)가 아니라 1시부터 시작하도록 기본값을 둔다.
  if (!match) return { hour: 1, minute: 0 };
  return {
    hour: Math.min(23, Math.max(0, Number(match[1]))),
    minute: Math.min(59, Math.max(0, Number(match[2]))),
  };
}
function formatTime(hour: number, minute: number) {
  return `${hour}:${String(minute).padStart(2, '0')}`;
}

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

// 날짜 숫자 그리드. 앞부분 빈 칸(firstDayOffset)을 null로 채워 요일 위치를 맞춘다.
// year/month는 실제 선택된 연/월을 받아 매번 다시 계산하므로 다른 달로 이동해도 정확하다.
// specialDates: SPECIAL 일정이 등록된 "며칠" 값 집합 - 해당 날짜에 연한 배경(원래 "오늘" 표시였던
// 스타일)을 채운다. "오늘"은 반대로 점으로만 표시한다(요청에 따라 두 표시 방식을 서로 바꿨다).
// selectedDay: 사용자가 탭해서 고른 날짜 - 주황 테두리로 표시하고, 아래 SPECIAL 목록이 이
// 날짜 기준으로 필터링된다(다시 탭하면 선택 해제).
function DateGrid({
  scale,
  year,
  month,
  specialDates,
  selectedDay,
  onSelectDay,
}: {
  scale: number;
  year: number;
  month: number;
  specialDates: Set<number>;
  selectedDay: number | null;
  onSelectDay: (day: number) => void;
}) {
  const firstDayOffset = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;
  const todayDate = now.getDate();

  const cells: (number | null)[] = [
    ...Array(firstDayOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const circleSize = 34 * scale;
  const dotSize = 7 * scale;

  return (
    <View style={[styles.dateGrid, { marginTop: 6 * scale }]}>
      {cells.map((day, i) => {
        const weekdayIndex = i % 7;
        const isToday = isCurrentMonth && day === todayDate;
        const hasSpecial = day !== null && specialDates.has(day);
        const isSelected = day !== null && day === selectedDay;
        return (
          <View key={i} style={[styles.dateCell, { height: 46 * scale }]}>
            {day !== null && (
              <TouchableOpacity
                style={styles.dateCellTouchable}
                activeOpacity={0.7}
                onPress={() => onSelectDay(day)}
              >
                <View
                  style={[
                    styles.dateCircle,
                    { width: circleSize, height: circleSize, borderRadius: circleSize / 2 },
                    hasSpecial && styles.dateCircleSpecial,
                    isSelected && styles.dateCircleSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.dateText,
                      {
                        fontSize: 15 * scale,
                        // 일정이 있는 날은 항상 회색(연한 배경 위에서 가장 잘 읽힘), 오늘은
                        // 검은색+굵게로 눈에 띄게 하고, 둘 다 아니면 기존처럼 요일색을 쓴다.
                        color: hasSpecial ? colors.textGray : isToday ? colors.text : colorForWeekday(weekdayIndex),
                        fontWeight: isToday ? '700' : '500',
                      },
                    ]}
                  >
                    {day}
                  </Text>
                </View>
                {isToday && (
                  <View
                    style={[
                      styles.todayDot,
                      { width: dotSize, height: dotSize, borderRadius: dotSize / 2, bottom: 3 * scale },
                    ]}
                  />
                )}
              </TouchableOpacity>
            )}
          </View>
        );
      })}
    </View>
  );
}

// DAILY / SPECIAL 공용 일정 한 줄 ("시간 | 내용" 형태의 회색 카드)
// 시간은 고정 폭 컬럼 안에서 오른쪽 정렬, 내용은 그 뒤에서 왼쪽 정렬돼서
// 항목마다 "|" 위치가 흔들리지 않고 시간/내용이 "|" 기준으로 나란히 맞춰진다.
function ScheduleRow({
  time,
  label,
  subtitle,
  scale,
}: {
  time: string;
  label: string;
  subtitle?: string | null;
  scale: number;
}) {
  return (
    <Card style={[styles.scheduleRow, { paddingVertical: 12 * scale, marginBottom: 8 * scale }]}>
      <Text
        style={[styles.scheduleTime, { fontSize: 17 * scale, width: TIME_COL_WIDTH * scale }]}
        numberOfLines={1}
      >
        {time}
      </Text>
      <View style={[styles.scheduleDivider, { height: 16 * scale, marginHorizontal: 14 * scale }]} />
      <View style={styles.scheduleLabelCol}>
        <Text style={[styles.scheduleLabel, { fontSize: 16 * scale }]} numberOfLines={1}>
          {label}
        </Text>
        {subtitle ? (
          <Text style={[styles.scheduleSubtitle, { fontSize: 12 * scale }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

// 각 섹션(DAILY/SPECIAL) 리스트 하단의 "일정 추가" 원형 버튼.
// 평소 화면에는 이 버튼만 노출되고, 실제 항목 변경/삭제는 "..." 설정 버튼 쪽 모달에서 한다.
function AddButton({ scale, onPress }: { scale: number; onPress: () => void }) {
  const size = 38 * scale;
  return (
    <TouchableOpacity
      style={[styles.addCircle, { width: size, height: size, borderRadius: size / 2 }]}
      activeOpacity={0.7}
      onPress={onPress}
    >
      <PlusIcon size={18 * scale} />
    </TouchableOpacity>
  );
}

// 섹션 제목("DAILY"/"SPECIAL") 오른쪽 끝의 "..." 설정 버튼 - 누르면 해당 섹션 수정 모달이 열린다.
// 항목이 하나도 없을 땐 수정/삭제할 게 없으므로 "..."을 숨기고 + 버튼만 보이게 한다
// (showSettings=false). 항목이 생기면 다시 나타난다.
function SectionTitle({
  label,
  scale,
  showSettings,
  onOpenSettings,
}: {
  label: string;
  scale: number;
  showSettings: boolean;
  onOpenSettings: () => void;
}) {
  return (
    <View style={[styles.sectionTitleRow, { marginTop: 12 * scale, marginBottom: 6 * scale }]}>
      <Text style={[styles.sectionTitle, { fontSize: 17 * scale }]}>{label}</Text>
      {showSettings && (
        <TouchableOpacity
          onPress={onOpenSettings}
          hitSlop={10}
          accessibilityLabel={`${label} 일정 수정`}
        >
          <EllipsisIcon size={20 * scale} />
        </TouchableOpacity>
      )}
    </View>
  );
}

// 연/월 타이틀을 누르면 뜨는 날짜 선택 모달 - 연도는 좌우 화살표로, 월은 그리드에서 바로 선택.
function DatePickerModal({
  visible,
  year,
  month,
  onClose,
  onSelect,
}: {
  visible: boolean;
  year: number;
  month: number;
  onClose: () => void;
  onSelect: (year: number, month: number) => void;
}) {
  const [draftYear, setDraftYear] = useState(year);

  useEffect(() => {
    if (visible) setDraftYear(year);
  }, [visible, year]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={() => {}}>
          <Text style={styles.modalTitle}>날짜 선택</Text>

          <View style={styles.yearStepperRow}>
            <TouchableOpacity
              style={styles.yearStepButton}
              onPress={() => setDraftYear((y) => y - 1)}
              hitSlop={10}
            >
              <Text style={styles.yearStepText}>‹</Text>
            </TouchableOpacity>
            <Text style={styles.yearStepperLabel}>{draftYear}</Text>
            <TouchableOpacity
              style={styles.yearStepButton}
              onPress={() => setDraftYear((y) => y + 1)}
              hitSlop={10}
            >
              <Text style={styles.yearStepText}>›</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.monthGrid}>
            {MONTH_NAMES.map((label, i) => {
              const m = i + 1;
              const isSelected = draftYear === year && m === month;
              return (
                <TouchableOpacity
                  key={label}
                  style={[styles.monthGridCell, isSelected && styles.monthGridCellSelected]}
                  onPress={() => {
                    onSelect(draftYear, m);
                    onClose();
                  }}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[styles.monthGridText, isSelected && styles.monthGridTextSelected]}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            style={[styles.modalCloseButton, styles.modalCloseButtonSolo]}
            onPress={onClose}
            activeOpacity={0.7}
          >
            <Text style={styles.modalCloseText}>닫기</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// 숫자 휠 한 칸의 높이(px) - 가운데 줄(선택된 값)이 이 높이만큼의 슬롯에 오도록 맞춘다.
const WHEEL_ITEM_HEIGHT = 40;
// 위아래로 보이는 줄 수(선택 줄 포함 홀수). 3이면 위/가운데/아래 3줄이 보인다.
const WHEEL_VISIBLE_COUNT = 3;
const WHEEL_HEIGHT = WHEEL_ITEM_HEIGHT * WHEEL_VISIBLE_COUNT;

// 세로로 드래그해서 숫자 하나를 고르는 휠 - 가운데 칸에 걸린 값이 선택값이 된다.
// 위/아래에 패딩을 한 칸씩 둬서 첫 값과 마지막 값도 가운데까지 올 수 있게 한다.
//
// 처음엔 ScrollView의 네이티브 스크롤(스와이프/휠)에 맡겼는데, 웹에서 무엇 때문인지 터치·마우스
// 드래그가 실제 스크롤로 이어지지 않는 문제가 있었다(scrollTo()로 좌표를 직접 옮기는 건 정상 동작 -
// 즉 네이티브 "드래그로 스크롤" 제스처 인식 쪽만 막혀 있었다). 그래서 ScrollView의 자체 스크롤
// 제스처는 꺼두고(scrollEnabled=false), PanResponder로 드래그를 직접 추적해 scrollTo()를 우리가
// 호출하는 방식으로 바꿨다 - 플랫폼에 상관없이 항상 동작한다.
function DigitWheel({ value, options, onChange }: { value: number; options: number[]; onChange: (v: number) => void }) {
  const scrollRef = useRef<ScrollView>(null);
  const isMounted = useRef(false);
  const currentOffsetRef = useRef(0); // scrollTo()로 마지막에 옮겨둔 y값(픽셀)
  const dragStartOffsetRef = useRef(0); // 드래그 시작 시점의 y값

  // PanResponder는 useRef로 딱 한 번만 만들어지므로, 그 안의 콜백이 value/options/onChange를
  // 직접 참조하면 "처음 마운트됐을 때의" 값에 영원히 갇혀버린다(분의 일의 자리를 바꾼 뒤 십의
  // 자리를 바꾸면 일의 자리가 마운트 시점 값으로 되돌아가던 오류의 원인). 그래서 항상 최신 값을
  // 담아두는 ref를 따로 두고, 콜백은 렌더와 무관하게 이 ref들만 통해서 최신 값을 읽는다.
  const valueRef = useRef(value);
  valueRef.current = value;
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const index = Math.max(0, options.indexOf(value));
    const target = index * WHEEL_ITEM_HEIGHT;
    scrollRef.current?.scrollTo({ y: target, animated: isMounted.current });
    currentOffsetRef.current = target;
    isMounted.current = true;
  }, [value, options]);

  const snapTo = useCallback((rawY: number) => {
    const opts = optionsRef.current;
    const clampedRaw = Math.max(0, Math.min((opts.length - 1) * WHEEL_ITEM_HEIGHT, rawY));
    const index = Math.max(0, Math.min(opts.length - 1, Math.round(clampedRaw / WHEEL_ITEM_HEIGHT)));
    const snapped = index * WHEEL_ITEM_HEIGHT;
    scrollRef.current?.scrollTo({ y: snapped, animated: true });
    currentOffsetRef.current = snapped;
    if (opts[index] !== valueRef.current) onChangeRef.current(opts[index]);
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_evt, gesture) => Math.abs(gesture.dy) > 2,
      onPanResponderGrant: () => {
        dragStartOffsetRef.current = currentOffsetRef.current;
      },
      onPanResponderMove: (_evt, gesture) => {
        const rawY = dragStartOffsetRef.current - gesture.dy;
        const opts = optionsRef.current;
        const clamped = Math.max(0, Math.min((opts.length - 1) * WHEEL_ITEM_HEIGHT, rawY));
        scrollRef.current?.scrollTo({ y: clamped, animated: false });
        currentOffsetRef.current = clamped;
      },
      onPanResponderRelease: (_evt, gesture) => {
        snapTo(dragStartOffsetRef.current - gesture.dy);
      },
      onPanResponderTerminate: (_evt, gesture) => {
        snapTo(dragStartOffsetRef.current - gesture.dy);
      },
    })
  ).current;

  return (
    <View style={styles.wheelContainer} {...panResponder.panHandlers}>
      <View style={styles.wheelSelectionBar} pointerEvents="none" />
      <ScrollView
        ref={scrollRef}
        style={styles.wheelScrollView}
        scrollEnabled={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingVertical: WHEEL_ITEM_HEIGHT }}
      >
        {options.map((opt) => (
          <View key={opt} style={styles.wheelItem}>
            <Text style={styles.wheelDigitText} selectable={false}>
              {opt}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const HOUR12_OPTIONS = Array.from({ length: 12 }, (_, i) => i + 1); // 1~12
const MINUTE_TENS_OPTIONS = [0, 1, 2, 3, 4, 5];
const MINUTE_ONES_OPTIONS = Array.from({ length: 10 }, (_, i) => i);

// 24시간제 hour(0~23)를 12시간제 표시값(1~12)과 오전/오후로 변환한다.
function to12Hour(hour24: number): { hour12: number; isPM: boolean } {
  const isPM = hour24 >= 12;
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return { hour12, isPM };
}
// 12시간제 표시값(1~12) + 오전/오후를 다시 24시간제 hour(0~23)로 합친다.
function to24Hour(hour12: number, isPM: boolean): number {
  const base = hour12 % 12; // 12시는 0으로
  return isPM ? base + 12 : base;
}

// 시간 입력칸을 누르면 뜨는 시간 선택 모달 - 시는 1~12 중에서 스크롤 휠로, 오전/오후는 별도 선택창으로,
// 분은 십의 자리·일의 자리를 따로 스크롤 휠로 고른다. 자유 텍스트 입력이 없어 항상 유효한 시각만 나온다.
// 내부적으로는 계속 24시간제(hour: 0~23)로 값을 주고받아, 일정 저장/표시 로직은 그대로 둔다.
function TimePickerModal({
  visible,
  hour,
  minute,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  hour: number;
  minute: number;
  onClose: () => void;
  onConfirm: (hour: number, minute: number) => void;
}) {
  const [draftHour, setDraftHour] = useState(hour);
  const [draftMinute, setDraftMinute] = useState(minute);

  useEffect(() => {
    if (visible) {
      setDraftHour(hour);
      setDraftMinute(minute);
    }
  }, [visible, hour, minute]);

  const { hour12, isPM } = to12Hour(draftHour);
  const mTens = Math.floor(draftMinute / 10);
  const mOnes = draftMinute % 10;

  const setHour12 = (h: number) => setDraftHour(to24Hour(h, isPM));
  const setIsPM = (pm: boolean) => setDraftHour(to24Hour(hour12, pm));
  const setMTens = (t: number) => setDraftMinute(t * 10 + mOnes);
  const setMOnes = (o: number) => setDraftMinute(mTens * 10 + o);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={() => {}}>
          <Text style={styles.modalTitle}>시간 선택</Text>

          <View style={styles.ampmRow}>
            <TouchableOpacity
              style={[styles.ampmChip, !isPM && styles.ampmChipSelected]}
              onPress={() => setIsPM(false)}
              activeOpacity={0.7}
            >
              <Text style={[styles.ampmChipText, !isPM && styles.ampmChipTextSelected]}>오전</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.ampmChip, isPM && styles.ampmChipSelected]}
              onPress={() => setIsPM(true)}
              activeOpacity={0.7}
            >
              <Text style={[styles.ampmChipText, isPM && styles.ampmChipTextSelected]}>오후</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.wheelRow}>
            <DigitWheel value={hour12} options={HOUR12_OPTIONS} onChange={setHour12} />
            <Text style={styles.timeStepperColon}>:</Text>
            <DigitWheel value={mTens} options={MINUTE_TENS_OPTIONS} onChange={setMTens} />
            <DigitWheel value={mOnes} options={MINUTE_ONES_OPTIONS} onChange={setMOnes} />
          </View>

          <TouchableOpacity
            style={[styles.modalCloseButton, styles.modalCloseButtonSolo]}
            onPress={() => {
              onConfirm(draftHour, draftMinute);
              onClose();
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.modalCloseText}>확인</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// "..." 버튼을 누르면 뜨는 일정 수정 모달. 기존 항목의 시간/내용(+ SPECIAL은 날짜)을 고치거나
// ×로 삭제하는 용도로만 쓴다 - 새 항목 추가는 이 모달이 아니라 화면의 + 버튼(AddScheduleModal) 몫이다.
function ScheduleEditModal({
  visible,
  title,
  items,
  isSpecial,
  viewYear,
  viewMonth,
  onClose,
  onSave,
}: {
  visible: boolean;
  title: string;
  items: ScheduleItem[];
  isSpecial: boolean;
  viewYear: number;
  viewMonth: number;
  onClose: () => void;
  onSave: (items: ScheduleItem[]) => void;
}) {
  const [draftItems, setDraftItems] = useState<ScheduleItem[]>(items);
  // 지금 시간 선택 모달을 열어둔 항목의 id - 한 번에 한 항목만 시간을 고를 수 있다.
  const [editingTimeId, setEditingTimeId] = useState<string | null>(null);

  useEffect(() => {
    if (visible) setDraftItems(items);
  }, [visible, items]);

  const updateItem = (id: string, patch: Partial<ScheduleItem>) => {
    setDraftItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  };

  const removeItem = (id: string) => {
    setDraftItems((prev) => prev.filter((it) => it.id !== id));
  };

  const handleSave = () => {
    onSave(draftItems.filter((it) => it.time.trim() || it.label.trim()));
    onClose();
  };

  const editingTimeItem = draftItems.find((it) => it.id === editingTimeId);
  const editingTimeParsed = parseTime(editingTimeItem?.time ?? '');

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={() => {}}>
          <Text style={styles.modalTitle}>{title} 일정 수정</Text>

          <ScrollView style={styles.editListScroll} showsVerticalScrollIndicator={false}>
            {draftItems.map((item) => (
              <View key={item.id} style={styles.editItemBlock}>
                <View style={styles.editRow}>
                  {isSpecial && (
                    <TextInput
                      style={styles.editDateInput}
                      value={item.date != null ? String(item.date.day) : ''}
                      onChangeText={(v) => {
                        const digits = v.replace(/[^0-9]/g, '');
                        const day = digits ? Number(digits) : 1;
                        updateItem(item.id, { date: { year: viewYear, month: viewMonth, day } });
                      }}
                      placeholder="날짜"
                      placeholderTextColor={colors.textGray}
                      keyboardType="number-pad"
                    />
                  )}
                  <TouchableOpacity
                    style={styles.editTimeButton}
                    onPress={() => setEditingTimeId(item.id)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[styles.editTimeButtonText, !item.time && styles.editTimeButtonPlaceholder]}
                      numberOfLines={1}
                    >
                      {item.time || '시간'}
                    </Text>
                  </TouchableOpacity>
                  <TextInput
                    style={styles.editLabelInput}
                    value={item.label}
                    onChangeText={(v) => updateItem(item.id, { label: v })}
                    placeholder="내용"
                    placeholderTextColor={colors.textGray}
                  />
                  <TouchableOpacity onPress={() => removeItem(item.id)} hitSlop={10}>
                    <Text style={styles.editRemoveText}>×</Text>
                  </TouchableOpacity>
                </View>
                {isSpecial ? (
                  <KindChipRow value={item.kind ?? 'general'} onChange={(k) => updateItem(item.id, { kind: k })} />
                ) : (
                  <WeekdayChipRow
                    value={item.weekdays && item.weekdays.length > 0 ? item.weekdays : ALL_WEEKDAYS}
                    onChange={(w) => updateItem(item.id, { weekdays: w.length >= 7 ? undefined : w })}
                  />
                )}
              </View>
            ))}
          </ScrollView>

          <View style={styles.modalBottomRow}>
            <TouchableOpacity style={styles.modalCloseButton} onPress={onClose} activeOpacity={0.7}>
              <Text style={styles.modalCloseText}>취소</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.renameSaveButtonWide} onPress={handleSave} activeOpacity={0.7}>
              <Text style={styles.renameSaveText}>저장</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>

      <TimePickerModal
        visible={editingTimeId != null}
        hour={editingTimeParsed.hour}
        minute={editingTimeParsed.minute}
        onClose={() => setEditingTimeId(null)}
        onConfirm={(h, m) => {
          if (editingTimeId != null) updateItem(editingTimeId, { time: formatTime(h, m) });
        }}
      />
    </Modal>
  );
}

// + 버튼을 누르면 뜨는 "일정 추가" 모달 - 새 항목 하나를 입력받아 추가만 한다.
// SPECIAL 섹션일 때만 날짜 입력칸이 붙는다(DAILY는 매일 반복이라 날짜 불필요).
function AddScheduleModal({
  visible,
  title,
  isSpecial,
  viewYear,
  viewMonth,
  defaultDay,
  onClose,
  onAdd,
}: {
  visible: boolean;
  title: string;
  isSpecial: boolean;
  viewYear: number;
  viewMonth: number;
  defaultDay: number | null;
  onClose: () => void;
  onAdd: (item: ScheduleItem) => void;
}) {
  const [time, setTime] = useState('');
  const [label, setLabel] = useState('');
  const [date, setDate] = useState('');
  const [kind, setKind] = useState<SpecialKind>('general');
  const [weekdays, setWeekdays] = useState<number[]>(ALL_WEEKDAYS);
  const [timePickerVisible, setTimePickerVisible] = useState(false);

  // 달력에서 날짜를 선택해 둔 상태로 +를 누르면, 그 날짜가 미리 채워진 채로 열린다
  // (그대로 두거나 고쳐서 추가할 수 있음).
  useEffect(() => {
    if (visible) {
      setTime('');
      setLabel('');
      setDate(defaultDay != null ? String(defaultDay) : '');
      setKind('general');
      setWeekdays(ALL_WEEKDAYS);
    }
  }, [visible, defaultDay]);

  const timeParsed = parseTime(time);

  const handleAdd = () => {
    if (time.trim() || label.trim()) {
      onAdd({
        id: `${title}-${Date.now()}`,
        time: time.trim(),
        label: label.trim(),
        // 지금 보고 있는 연/월에 붙여서 추가한다. 날짜(며칠)를 안 적으면 1일로 기본 지정.
        date: isSpecial ? { year: viewYear, month: viewMonth, day: date ? Number(date) : 1 } : undefined,
        kind: isSpecial ? kind : undefined,
        weekdays: !isSpecial && weekdays.length < 7 ? weekdays : undefined,
      });
    }
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={() => {}}>
          <Text style={styles.modalTitle}>{title} 일정 추가</Text>

          <View style={styles.addFieldRow}>
            {isSpecial && (
              <TextInput
                style={styles.editDateInput}
                value={date}
                onChangeText={(v) => setDate(v.replace(/[^0-9]/g, ''))}
                placeholder="날짜"
                placeholderTextColor={colors.textGray}
                keyboardType="number-pad"
              />
            )}
            <TouchableOpacity
              style={styles.editTimeButton}
              onPress={() => setTimePickerVisible(true)}
              activeOpacity={0.7}
            >
              <Text
                style={[styles.editTimeButtonText, !time && styles.editTimeButtonPlaceholder]}
                numberOfLines={1}
              >
                {time || '시간'}
              </Text>
            </TouchableOpacity>
            <TextInput
              style={styles.editLabelInput}
              value={label}
              onChangeText={setLabel}
              placeholder="내용"
              placeholderTextColor={colors.textGray}
            />
          </View>

          {isSpecial ? (
            <KindChipRow value={kind} onChange={setKind} />
          ) : (
            <WeekdayChipRow value={weekdays} onChange={setWeekdays} />
          )}

          <View style={styles.modalBottomRow}>
            <TouchableOpacity style={styles.modalCloseButton} onPress={onClose} activeOpacity={0.7}>
              <Text style={styles.modalCloseText}>취소</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.renameSaveButtonWide} onPress={handleAdd} activeOpacity={0.7}>
              <Text style={styles.renameSaveText}>추가</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>

      <TimePickerModal
        visible={timePickerVisible}
        hour={timeParsed.hour}
        minute={timeParsed.minute}
        onClose={() => setTimePickerVisible(false)}
        onConfirm={(h, m) => setTime(formatTime(h, m))}
      />
    </Modal>
  );
}

export default function CalendarScreen() {
  const { height } = useWindowDimensions();
  const scale = Math.min(1, Math.max(MIN_SCALE, height / REFERENCE_HEIGHT));

  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth() + 1);
  const [pickerVisible, setPickerVisible] = useState(false);

  const { dailyItems, specialItems, setDailyItems, setSpecialItems } = useCalendar();
  const [editingSection, setEditingSection] = useState<'daily' | 'special' | null>(null);
  const [addingSection, setAddingSection] = useState<'daily' | 'special' | null>(null);
  // 달력에서 탭한 날짜(며칠) - 지정돼 있으면 SPECIAL 목록이 이 날짜 것만 보여준다.
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const monthLabel = useMemo(() => `${viewMonth}월`, [viewMonth]);

  // 지금 보고 있는 연/월에 속하는 SPECIAL 항목만 골라낸다 - 달력 점 표시는 이 기준을 그대로 따라서
  // 다른 달 일정이 섞여 보이지 않는다.
  const visibleSpecialItems = useMemo(
    () => specialItems.filter((it) => it.date?.year === viewYear && it.date?.month === viewMonth),
    [specialItems, viewYear, viewMonth]
  );
  const specialDates = useMemo(
    () => new Set(visibleSpecialItems.map((it) => it.date!.day)),
    [visibleSpecialItems]
  );
  // 리스트/수정 모달에 실제로 보여줄 항목 - 날짜를 선택했으면 그 날짜만, 아니면 이번 달 전체.
  const displayedSpecialItems = useMemo(
    () =>
      selectedDay == null
        ? visibleSpecialItems
        : visibleSpecialItems.filter((it) => it.date?.day === selectedDay),
    [visibleSpecialItems, selectedDay]
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={[styles.content, { paddingTop: 16 * scale }]}>
        <View style={styles.titleRow}>
          <View style={styles.titleSide}>
            <TouchableOpacity onPress={() => setPickerVisible(true)} activeOpacity={0.7}>
              <Text style={[styles.yearText, { fontSize: 26 * scale }]}>{viewYear}</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={() => setPickerVisible(true)} activeOpacity={0.7}>
            <Text style={[styles.monthText, { fontSize: 36 * scale }]}>{monthLabel}</Text>
          </TouchableOpacity>
          <View style={styles.titleSide} />
        </View>

        <WeekdayHeader scale={scale} />
        <DateGrid
          scale={scale}
          year={viewYear}
          month={viewMonth}
          specialDates={specialDates}
          selectedDay={selectedDay}
          onSelectDay={(day) => setSelectedDay((prev) => (prev === day ? null : day))}
        />

        <SectionTitle
          label="DAILY"
          scale={scale}
          showSettings={dailyItems.length > 0}
          onOpenSettings={() => setEditingSection('daily')}
        />
        {dailyItems.map((item) => (
          <ScheduleRow
            key={item.id}
            time={item.time}
            label={item.label}
            subtitle={summarizeWeekdays(item.weekdays)}
            scale={scale}
          />
        ))}
        <View style={[styles.addButtonWrap, { marginTop: 2 * scale, marginBottom: 2 * scale }]}>
          <AddButton scale={scale} onPress={() => setAddingSection('daily')} />
        </View>

        <SectionTitle
          label="SPECIAL"
          scale={scale}
          showSettings={displayedSpecialItems.length > 0}
          onOpenSettings={() => setEditingSection('special')}
        />
        {displayedSpecialItems.map((item) => (
          <ScheduleRow
            key={item.id}
            time={item.time}
            label={item.label}
            subtitle={item.kind && item.kind !== 'general' ? KIND_LABEL[item.kind] : null}
            scale={scale}
          />
        ))}
        <View style={[styles.addButtonWrap, { marginTop: 2 * scale, marginBottom: 2 * scale }]}>
          <AddButton scale={scale} onPress={() => setAddingSection('special')} />
        </View>
      </View>
      <View style={styles.bottomNavWrap}>
        <BottomNav variant="sub" />
      </View>

      <DatePickerModal
        visible={pickerVisible}
        year={viewYear}
        month={viewMonth}
        onClose={() => setPickerVisible(false)}
        onSelect={(y, m) => {
          setViewYear(y);
          setViewMonth(m);
          setSelectedDay(null);
        }}
      />

      <ScheduleEditModal
        visible={editingSection === 'daily'}
        title="DAILY"
        items={dailyItems}
        isSpecial={false}
        viewYear={viewYear}
        viewMonth={viewMonth}
        onClose={() => setEditingSection(null)}
        onSave={setDailyItems}
      />
      <ScheduleEditModal
        visible={editingSection === 'special'}
        title="SPECIAL"
        items={displayedSpecialItems}
        isSpecial
        viewYear={viewYear}
        viewMonth={viewMonth}
        onClose={() => setEditingSection(null)}
        onSave={(updatedItems) => {
          // 지금 화면에 보이는 범위(선택한 날짜만, 또는 선택이 없으면 이번 달 전체)만
          // 교체하고 그 외 항목(다른 날짜/다른 달)은 그대로 둔다.
          setSpecialItems((prev) => [
            ...prev.filter(
              (it) =>
                !(
                  it.date?.year === viewYear &&
                  it.date?.month === viewMonth &&
                  (selectedDay == null || it.date?.day === selectedDay)
                )
            ),
            ...updatedItems,
          ]);
        }}
      />

      <AddScheduleModal
        visible={addingSection === 'daily'}
        title="DAILY"
        isSpecial={false}
        viewYear={viewYear}
        viewMonth={viewMonth}
        defaultDay={null}
        onClose={() => setAddingSection(null)}
        onAdd={(item) => setDailyItems((prev) => [...prev, item])}
      />
      <AddScheduleModal
        visible={addingSection === 'special'}
        title="SPECIAL"
        isSpecial
        viewYear={viewYear}
        viewMonth={viewMonth}
        defaultDay={selectedDay}
        onClose={() => setAddingSection(null)}
        onAdd={(item) => setSpecialItems((prev) => [...prev, item])}
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

  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 좌/우 양쪽에 같은 flex:1을 줘서, 왼쪽엔 연도가 있고 오른쪽은 빈 칸이어도
  // 가운데 월 텍스트가 화면 정중앙에 오도록 만드는 3분할 헤더 구조.
  titleSide: {
    flex: 1,
    alignItems: 'flex-start',
  },
  yearText: {
    fontFamily: fonts.jalnan,
    color: colors.text,
  },
  monthText: {
    fontFamily: fonts.jalnan,
    color: colors.text,
    textAlign: 'center',
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
  // 날짜 탭 영역을 dateCell 전체(46*scale 높이)로 채워서, todayDot의 절대 위치가
  // 원 크기가 아니라 이 영역 기준으로 잡히게 한다(탭 대상이 커져 누르기도 더 쉬워짐).
  dateCellTouchable: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateCircle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 일정(SPECIAL)이 있는 날짜의 배경. 원래 "오늘" 표시로 쓰던 연한 배경을 여기로 옮겼다.
  dateCircleSpecial: {
    backgroundColor: colors.calendarPeach,
  },
  // 탭해서 선택한 날짜 표시.
  dateCircleSelected: {
    borderWidth: 1.5,
    borderColor: colors.orange,
  },
  dateText: {
    fontWeight: '500',
  },
  // "오늘" 날짜 숫자 밑에 찍는 작은 점. 원래 일정(SPECIAL) 표시로 쓰던 점을 여기로 옮겼다.
  // dateCell 기준으로 절대 위치를 잡고 alignSelf:'center'로 가로 중앙에 오도록 해서,
  // 점이 있고 없고에 따라 날짜 숫자 위치가 흔들리지 않는다(레이아웃 흐름에 영향을 주지 않음).
  todayDot: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: colors.coral,
  },

  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    textAlign: 'right',
  },
  scheduleDivider: {
    width: 2,
    backgroundColor: colors.text,
  },
  scheduleLabelCol: {
    flex: 1,
  },
  scheduleLabel: {
    fontWeight: '500',
    color: colors.text,
  },
  scheduleSubtitle: {
    color: colors.textGray,
    marginTop: 2,
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
    padding: 24,
  },
  modalTitle: {
    fontFamily: fonts.jalnan,
    fontSize: 19,
    color: colors.text,
    marginBottom: 18,
    textAlign: 'center',
  },

  yearStepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    marginBottom: 16,
  },
  yearStepButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  yearStepText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  yearStepperLabel: {
    fontFamily: fonts.jalnan,
    fontSize: 20,
    color: colors.text,
    minWidth: 70,
    textAlign: 'center',
  },

  timeStepperColon: {
    fontFamily: fonts.jalnan,
    fontSize: 24,
    color: colors.text,
  },

  // 시간 선택 모달의 오전/오후 선택 칩 2개.
  ampmRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 14,
  },
  ampmChip: {
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: colors.card,
  },
  ampmChipSelected: {
    backgroundColor: colors.orange,
  },
  ampmChipText: {
    fontFamily: fonts.jalnan,
    fontSize: 14,
    color: colors.textGray2,
  },
  ampmChipTextSelected: {
    color: colors.white,
  },

  // 시간 선택 모달의 시(1~12) 휠 + 분 숫자 휠 2칸(십의자리/일의자리) + 콜론.
  wheelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginBottom: 16,
  },
  wheelContainer: {
    width: 44,
    height: WHEEL_HEIGHT,
    overflow: 'hidden',
  },
  // ScrollView 자체의 뷰포트 높이를 콘텐츠보다 작게 고정해야 실제로 스크롤할 내용이 생긴다 -
  // contentContainerStyle만으로는 ScrollView 자신의 크기가 내용물 높이에 맞춰져 스크롤이 안 됐다.
  wheelScrollView: {
    height: WHEEL_HEIGHT,
  },
  // 휠 가운데 줄(선택 슬롯)을 표시하는 배경 바 - 스크롤 내용 뒤에 고정으로 깔린다.
  wheelSelectionBar: {
    position: 'absolute',
    top: WHEEL_ITEM_HEIGHT,
    left: 0,
    right: 0,
    height: WHEEL_ITEM_HEIGHT,
    borderRadius: 8,
    backgroundColor: colors.card,
  },
  wheelItem: {
    height: WHEEL_ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelDigitText: {
    fontFamily: fonts.jalnan,
    fontSize: 20,
    color: colors.text,
  },

  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  monthGridCell: {
    width: '30%',
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.card,
    alignItems: 'center',
  },
  monthGridCellSelected: {
    backgroundColor: colors.orange,
  },
  monthGridText: {
    fontFamily: fonts.jalnan,
    fontSize: 14,
    color: colors.text,
  },
  monthGridTextSelected: {
    color: colors.white,
  },

  editListScroll: {
    maxHeight: 260,
  },
  editItemBlock: {
    marginBottom: 12,
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  kindChipRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
  },
  kindChip: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: colors.card,
  },
  kindChipSelected: {
    backgroundColor: colors.orange,
  },
  kindChipText: {
    fontFamily: fonts.jalnan,
    fontSize: 12,
    color: colors.textGray2,
  },
  kindChipTextSelected: {
    color: colors.white,
  },
  weekdayChipRow: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 6,
  },
  weekdayChip: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekdayChipSelected: {
    backgroundColor: colors.orange,
  },
  weekdayChipText: {
    fontFamily: fonts.jalnan,
    fontSize: 12,
    color: colors.textGray2,
  },
  weekdayChipTextSelected: {
    color: colors.white,
  },
  // 시간 입력칸 자리에 들어가는 버튼 - 누르면 TimePickerModal이 뜬다(자유 텍스트 입력 대신
  // 0:00~23:59 범위 안에서만 고를 수 있게 함).
  editTimeButton: {
    width: 64,
    backgroundColor: colors.card,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  editTimeButtonText: {
    fontFamily: fonts.jalnan,
    fontSize: 14,
    color: colors.text,
  },
  editTimeButtonPlaceholder: {
    color: colors.textGray,
  },
  editLabelInput: {
    flex: 1,
    // minWidth:0 없이는 flex:1이어도 텍스트 입력창의 기본 폭 때문에 줄어들지 않아서
    // (특히 웹에서) 행이 모달 카드 밖으로 넘쳐 오른쪽 삭제(×) 버튼이 잘려 나갔다.
    minWidth: 0,
    fontFamily: fonts.jalnan,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.card,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  editRemoveText: {
    fontSize: 20,
    color: colors.textGray,
    paddingHorizontal: 4,
  },
  // SPECIAL 항목의 "며칠" 입력칸. editTimeButton보다 좁게 잡는다(최대 2자리 숫자면 충분).
  editDateInput: {
    width: 46,
    fontFamily: fonts.jalnan,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.card,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 6,
    textAlign: 'center',
  },
  addFieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 18,
  },

  modalBottomRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  modalCloseButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: colors.card,
  },
  // 버튼 행(취소/저장) 없이 단독으로 쓰일 때는 flex:1이 세로로 늘어나 보이므로 상쇄한다.
  modalCloseButtonSolo: {
    flex: 0,
    marginTop: 16,
  },
  modalCloseText: {
    fontFamily: fonts.jalnan,
    fontSize: 15,
    color: colors.text,
  },
  renameSaveButtonWide: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: colors.orange,
  },
  renameSaveText: {
    fontFamily: fonts.jalnan,
    fontSize: 15,
    color: colors.white,
  },
});
