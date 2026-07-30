// 시안 5 - 에너지 사용량 화면.
// 구조: 전년/전월/전일 대비 사용량 카드(연/월/일 탭 포함) / 총 사용량 라인차트 / 실시간 기기별 사용 현황
//
// 라인차트는 /energy/usage(power_monitor 기기의 실측 누적 전력량)를 받아, 기기별 시리즈를
// x_label(연도/월/일 구간)이 같은 지점끼리 합산한 "총 사용량" 한 줄로 그린다. 아직 등록된
// power_monitor가 없거나 데이터가 안 쌓였으면 빈 시리즈가 오고, 증감률도 0%로 표시된다.
// "실시간 기기별 사용 현황"은 방이 달라도 기기 종류가 같으면 하나로 묶고(예: 거실 조명 + 방2 조명 =
// 조명), 소비전력 상위 5개 종류만 보여준 뒤 나머지는 "기타"로 합산한다(summarizeDeviceUsage,
// RoomsContext의 로컬 방/기기 목록 기준 - 방/기기 관리는 아직 백엔드에 연동되지 않았다).
import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import AnimatedPressable from '../components/AnimatedPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Svg, { Line, Polyline, Circle, Text as SvgText } from 'react-native-svg';

import { colors, fonts } from '../theme/colors';
import Card from '../components/Card';
import BottomNav from '../components/BottomNav';
import { useRooms } from '../context/RoomsContext';
import { useAppWindowDimensions } from '../hooks/useAppWindowDimensions';
import { summarizeDeviceUsage } from '../utils/energy';
import { calcChange, SeriesPoint } from '../utils/energySeries';
import { getEnergyUsage, EnergyUsage } from '../api/client';

// 기기별로 나뉘어 오는 백엔드 시리즈를 x_label이 같은 지점끼리 합쳐 "총 사용량" 한 줄로 만든다.
// (등록된 power_monitor 기기가 여러 개여도 화면에는 지금처럼 단일 라인차트만 유지하기 위함)
function aggregateTotalSeries(usage: EnergyUsage): SeriesPoint[] {
  const order: string[] = [];
  const totals = new Map<string, number>();
  for (const s of usage.series) {
    for (const p of s.points) {
      if (!totals.has(p.x_label)) {
        order.push(p.x_label);
        totals.set(p.x_label, 0);
      }
      totals.set(p.x_label, totals.get(p.x_label)! + p.value);
    }
  }
  return order.map((label) => ({ label, value: totals.get(label)! }));
}

// "월" 탭 비교 전용 - period='month' 응답은 일별(x_label "MM/DD")로 쪼개져 있어서, 그대로 마지막
// 두 점을 비교하면 "어제 대비 오늘"이 되어버린다("전월 대비"라는 라벨과 안 맞음). 그래서 여기서
// x_label의 "MM" 부분만 뽑아 월 단위로 다시 합산한 뒤, 실제로 지난달 합계와 비교되도록 만든다.
function aggregateByMonth(dailySeries: SeriesPoint[]): SeriesPoint[] {
  const order: string[] = [];
  const totals = new Map<string, number>();
  for (const p of dailySeries) {
    const month = p.label.split('/')[0];
    if (!month) continue;
    if (!totals.has(month)) {
      order.push(month);
      totals.set(month, 0);
    }
    totals.set(month, totals.get(month)! + p.value);
  }
  return order.map((month) => ({ label: `${month}월`, value: totals.get(month)! }));
}

const SCREEN_PADDING = 20;
// 스크롤 없이 화면 높이 안에 다 들어와야 하므로, MainScreen과 같은 방식으로
// 화면이 작은 기기에서는 차트/카드 크기를 함께 줄이는 scale 값을 쓴다.
const REFERENCE_HEIGHT = 820;
const MIN_SCALE = 0.62;

type Period = 'year' | 'month' | 'day';

// 요청된 x축 포인트 개수: 연/월별은 5개, 일별은 7개(일주일치)
const POINT_COUNT: Record<Period, number> = { year: 5, month: 5, day: 7 };
const CARD_LABEL: Record<Period, string> = {
  year: '전년 대비 사용량',
  month: '전월 대비 사용량',
  // "일" 탭은 x_label이 "HH시"뿐이라 날짜 구분이 없어 진짜 전일(어제) 합계를 구할 수 없다.
  // 실제로 비교하는 건 그래프의 마지막 두 시간대 값이므로 라벨도 그에 맞춘다.
  day: '직전 시간 대비 사용량',
};

const PERIOD_TABS: { key: Period; label: string; bg: string }[] = [
  { key: 'day', label: '일', bg: colors.chipGreen },
  { key: 'month', label: '월', bg: colors.chipYellow },
  { key: 'year', label: '연', bg: colors.chipRed },
];

// kWh 값을 크기에 맞게 적당한 소수 자릿수로 표시한다 - 실제 누적치가 아직 작을 때(0.0x 단위)도
// 전부 "0"으로 뭉개지지 않도록.
function formatKwh(v: number): string {
  if (v === 0) return '0';
  if (v < 1) return v.toFixed(2);
  if (v < 10) return v.toFixed(1);
  return String(Math.round(v));
}

// 연/월/일 탭 + 전년(월/일) 대비 증감률을 한 카드에 같이 보여준다.
// 탭을 누르면 라벨("전년/전월/전일 대비 사용량")과 증감률, 그리고 아래 라인차트·기기 목록이 함께
// 바뀐다. 증감률(퍼센트+증가/감소)은 카드 안에서 가운데 정렬로 강조한다.
function TopStatCard({
  scale,
  period,
  onSelectPeriod,
  percent,
  direction,
}: {
  scale: number;
  period: Period;
  onSelectPeriod: (p: Period) => void;
  percent: number;
  direction: '증가' | '감소';
}) {
  const chipSize = 36 * scale;
  return (
    <Card style={[styles.yoyCard, { marginTop: 10 * scale, padding: 20 * scale }]}>
      <View style={[styles.tabsRow, { gap: 10 * scale }]}>
        {PERIOD_TABS.map((t) => {
          const selected = t.key === period;
          return (
            <AnimatedPressable
              key={t.key}
              onPress={() => onSelectPeriod(t.key)}
              activeOpacity={0.7}
              style={[
                styles.tabChip,
                { width: chipSize, height: chipSize, borderRadius: chipSize / 2, backgroundColor: t.bg },
                selected ? styles.tabChipSelected : styles.tabChipUnselected,
              ]}
            >
              <Text style={[styles.tabChipText, { fontSize: 14 * scale }]}>{t.label}</Text>
            </AnimatedPressable>
          );
        })}
      </View>

      <Text style={[styles.yoyLabel, { fontSize: 17 * scale, marginTop: 14 * scale }]}>
        {CARD_LABEL[period]}
      </Text>
      <View style={[styles.yoyValueRow, { marginTop: 6 * scale, gap: 10 * scale }]}>
        <Text style={[styles.yoyPercent, { fontSize: 42 * scale }]}>{percent}%</Text>
        <Text style={[styles.yoyWord, { fontSize: 18 * scale, marginBottom: 6 * scale }]}>{direction}</Text>
      </View>
      {percent === 0 && (
        <Text style={[styles.yoyHint, { fontSize: 12 * scale, marginTop: 4 * scale }]}>
          비교할 이전 데이터가 쌓이면 증감률이 표시돼요.
        </Text>
      )}
    </Card>
  );
}

// 실제 누적 사용량(kWh)을 보여주는 단일 라인 차트.
// 데이터가 최대 7개 지점뿐이라 별도 차트 라이브러리 없이 react-native-svg로 직접 그린다.
function UsageLineChart({ scale, series }: { scale: number; series: SeriesPoint[] }) {
  const { width: winWidth } = useAppWindowDimensions();
  const chartWidth = winWidth - SCREEN_PADDING * 2;
  const leftAxisWidth = 40; // y축 kWh 라벨이 들어갈 좌측 여백
  const rightMargin = 20; // 마지막 지점의 원/숫자 라벨이 SVG 오른쪽 끝에서 잘리지 않도록 남겨두는 여백
  const plotWidth = chartWidth - leftAxisWidth - rightMargin;
  // 최고값 지점의 숫자 라벨이 SVG 위쪽 끝에서 잘리지 않도록 그래프 위에 여백(topMargin)을 두고,
  // 아래쪽엔 x축(연/월/일) 라벨이 들어갈 여백(bottomAxisSpace)을 둔다. chartHeight는 이 셋을 합한 값.
  const topMargin = 26 * scale;
  const bottomAxisSpace = 34 * scale;
  const plotHeight = 140 * scale; // 실제 데이터 라인이 그려지는 높이
  const chartHeight = topMargin + plotHeight + bottomAxisSpace;

  const values = series.map((p) => p.value);
  // 실사용량이 하나라도 있으면(0.0x kWh처럼 작아도) 눈에 보이는 비율로 그려지도록 아주 작은
  // 최솟값(0.01)만 바닥으로 둔다. 반면 전부 0이면(아직 기기 사용 이력이 전혀 없는 첫 화면) 그
  // 0.01을 기준으로 5등분한 y축 눈금이 전부 "0.00"/"0.01"로 뭉쳐 보이므로, 이 경우엔 보기 좋은
  // 정수 스케일(1kWh)로 대체해 0/0.25/0.5/0.75/1.0처럼 구분되는 눈금을 보여준다.
  const hasAnyUsage = values.some((v) => v > 0);
  const maxValue = hasAnyUsage ? Math.max(0.01, ...values) : 1;

  const xAt = (i: number) => (series.length <= 1 ? 0 : (plotWidth / (series.length - 1)) * i);
  const yAt = (v: number) => topMargin + plotHeight - (v / maxValue) * plotHeight;

  // y축 눈금 5개(0~maxValue)를 매번 새로 계산 - 기간마다 maxValue가 달라지므로 고정 배열 대신 생성한다.
  const gridValues = Array.from({ length: 5 }, (_, i) => (maxValue / 4) * i);

  return (
    <View style={{ marginTop: 16 * scale }}>
      <Svg width={chartWidth} height={chartHeight}>
        {/* y축 눈금선 + 라벨 */}
        {gridValues.map((v, i) => (
          <React.Fragment key={i}>
            <Line
              x1={leftAxisWidth}
              x2={chartWidth}
              y1={yAt(v)}
              y2={yAt(v)}
              stroke={colors.border}
              strokeWidth={1}
            />
            <SvgText
              x={leftAxisWidth - 10}
              y={yAt(v) + 5}
              fontSize={11 * scale}
              fill={colors.text}
              textAnchor="end"
            >
              {formatKwh(v)}
            </SvgText>
          </React.Fragment>
        ))}

        {/* 실제 데이터 좌표는 y축 라벨 폭(leftAxisWidth)만큼 오른쪽으로 밀어서 그린다 */}
        <Polyline
          points={values.map((v, i) => `${xAt(i) + leftAxisWidth},${yAt(v)}`).join(' ')}
          fill="none"
          stroke={colors.chartBlue}
          strokeWidth={2.5}
        />

        {values.map((v, i) => (
          <Circle
            key={`pt-${i}`}
            cx={xAt(i) + leftAxisWidth}
            cy={yAt(v)}
            r={5}
            fill={colors.white}
            stroke={colors.chartBlue}
            strokeWidth={2.5}
          />
        ))}
        {values.map((v, i) => (
          <SvgText
            key={`label-${i}`}
            x={xAt(i) + leftAxisWidth}
            y={yAt(v) - 12 * scale}
            fontSize={12 * scale}
            fontWeight="bold"
            fill={colors.chartBlue}
            textAnchor="middle"
          >
            {formatKwh(v)}
          </SvgText>
        ))}

        {/* x축 기간 라벨(연도/월/일) */}
        {series.map((p, i) => (
          <SvgText
            key={p.label}
            x={xAt(i) + leftAxisWidth}
            y={topMargin + plotHeight + 22 * scale}
            fontSize={12 * scale}
            fill={colors.text}
            textAnchor="middle"
          >
            {p.label}
          </SvgText>
        ))}
      </Svg>

      <Text style={[styles.chartCaption, { fontSize: 13 * scale, marginTop: 2 * scale }]}>총 사용량 (kWh)</Text>
    </View>
  );
}

// "실시간 기기별 사용 현황" 리스트의 행 하나. 방과 무관하게 기기 종류로 묶은 값이라 몇 대가
// 켜져 있는지(count)와 그 종류의 소비전력 합계(watt)를 보여준다.
function DeviceUsageRow({ type, watt, count, scale }: { type: string; watt: number; count: number; scale: number }) {
  return (
    <Card style={[styles.usageRow, { paddingVertical: 12 * scale, marginBottom: 8 * scale }]}>
      <Text style={[styles.usageName, { fontSize: 16 * scale }]}>{type}</Text>
      <Text style={[styles.usageCount, { fontSize: 12 * scale }]}>{count}대</Text>
      <Text style={[styles.usageWatt, { fontSize: 15 * scale }]}>{watt}W</Text>
    </Card>
  );
}

export default function EnergyUsageScreen() {
  const { height } = useAppWindowDimensions();
  const scale = Math.min(1, Math.max(MIN_SCALE, height / REFERENCE_HEIGHT));
  const [period, setPeriod] = useState<Period>('year');
  const [usage, setUsage] = useState<EnergyUsage>({ series: [], year_over_year_pct: null });

  const { rooms } = useRooms();

  // 화면에 들어올 때 + 연/월/일 탭을 바꿀 때마다 실제 전력량계(power_monitor) 데이터를 다시 불러온다.
  useFocusEffect(
    useCallback(() => {
      getEnergyUsage(period)
        .then(setUsage)
        .catch((err) => console.warn('에너지 사용량 조회 실패:', err));
    }, [period])
  );

  const fullSeries = aggregateTotalSeries(usage);
  const series = fullSeries.slice(-POINT_COUNT[period]);
  // 차트는 항상 "최근 N개 구간"을 보여주지만, 증감률 카드는 "월" 탭에서만 월 단위로 다시 합산한
  // 시리즈를 써서 실제 전월 대비가 되도록 한다(그 외 탭은 기존처럼 마지막 두 점을 비교).
  const { percent, direction } = calcChange(period === 'month' ? aggregateByMonth(fullSeries) : series);

  // 방이 달라도 기기 종류가 같으면 하나로 묶고, 소비전력이 큰 상위 5개만 남긴 뒤 나머지는 "기타"로 합산한다.
  const deviceUsage = summarizeDeviceUsage(rooms);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView
        style={styles.content}
        contentContainerStyle={[styles.contentInner, { paddingTop: 14 * scale }]}
        showsVerticalScrollIndicator={false}
      >
        <TopStatCard
          scale={scale}
          period={period}
          onSelectPeriod={setPeriod}
          percent={percent}
          direction={direction}
        />
        <UsageLineChart scale={scale} series={series} />

        <Text style={[styles.sectionTitle, { fontSize: 16 * scale, marginTop: 14 * scale, marginBottom: 6 * scale }]}>
          실시간 기기별 사용 현황
        </Text>
        {deviceUsage.length > 0 ? (
          deviceUsage.map((d) => (
            <DeviceUsageRow key={d.type} type={d.type} watt={d.watt} count={d.count} scale={scale} />
          ))
        ) : (
          <Text style={[styles.emptyHint, { fontSize: 13 * scale }]}>지금 켜져 있는 기기가 없어요.</Text>
        )}
      </ScrollView>
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
  },
  contentInner: {
    paddingHorizontal: SCREEN_PADDING,
    paddingBottom: 20,
  },

  tabsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  tabChip: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 선택된 탭은 테두리로 강조하고, 선택되지 않은 탭은 반투명하게 낮춰서 현재 조회 기간이
  // 한눈에 구분되도록 한다.
  tabChipSelected: {
    borderWidth: 2,
    borderColor: colors.text,
  },
  tabChipUnselected: {
    opacity: 0.45,
  },
  tabChipText: {
    fontFamily: fonts.jalnan,
    color: colors.text,
  },

  yoyCard: {},
  yoyLabel: {
    fontFamily: fonts.jalnan,
    color: colors.text,
    textAlign: 'center',
  },
  // 증감된 사용량 퍼센트(+증가/감소 단어)를 카드 가운데에 오도록 정렬한다.
  yoyValueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  yoyPercent: {
    fontFamily: fonts.jalnan,
    color: colors.text,
  },
  yoyWord: {
    fontFamily: fonts.jalnan,
    color: colors.text,
  },
  yoyHint: {
    color: colors.textGray,
    textAlign: 'center',
  },

  chartCaption: {
    fontFamily: fonts.jalnan,
    color: colors.textGray2,
    textAlign: 'center',
  },

  sectionTitle: {
    fontFamily: fonts.jalnan,
    color: colors.text,
  },
  usageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  usageName: {
    flex: 1,
    fontFamily: fonts.jalnan,
    color: colors.text,
  },
  usageCount: {
    fontFamily: fonts.jalnan,
    color: colors.textGray,
  },
  usageWatt: {
    fontFamily: fonts.jalnan,
    color: colors.orange,
  },
  emptyHint: {
    color: colors.textGray,
  },

  bottomNavWrap: {
    paddingHorizontal: 20,
    paddingBottom: 10,
    paddingTop: 6,
  },
});
