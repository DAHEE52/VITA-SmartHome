// 시안 5 - 에너지 사용량 화면.
// 구조: 연/월/일 탭 칩 / 전년대비 감소율 카드 / 라인차트(에어컨·선풍기) / 항목별 사용량 리스트
import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Line, Polyline, Circle, Text as SvgText } from 'react-native-svg';

import { colors, fonts } from '../theme/colors';
import Card from '../components/Card';
import BottomNav from '../components/BottomNav';

const SCREEN_PADDING = 20;
// 스크롤 없이 화면 높이 안에 다 들어와야 하므로, MainScreen과 같은 방식으로
// 화면이 작은 기기에서는 차트/카드 크기를 함께 줄이는 scale 값을 쓴다.
const REFERENCE_HEIGHT = 820;
const MIN_SCALE = 0.62;

// 상단의 연/월/일 조회 기간 선택 칩. 지금은 정적 표시만 하고 실제 필터링 로직은 없음.
function PeriodTabs({ scale }: { scale: number }) {
  const tabs = [
    { label: '연', bg: colors.chipRed },
    { label: '월', bg: colors.chipYellow },
    { label: '일', bg: colors.chipGreen },
  ];
  const chipSize = 36 * scale;
  return (
    <Card style={[styles.tabsCard, { paddingVertical: 10 * scale, paddingHorizontal: 14 * scale }]}>
      <View style={[styles.tabsRow, { gap: 10 * scale }]}>
        {tabs.map((t) => (
          <View
            key={t.label}
            style={[
              styles.tabChip,
              { width: chipSize, height: chipSize, borderRadius: chipSize / 2, backgroundColor: t.bg },
            ]}
          >
            <Text style={[styles.tabChipText, { fontSize: 14 * scale }]}>{t.label}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

// 전년 대비 사용량 감소율을 큰 숫자로 강조하는 카드
function YearOverYearCard({ scale }: { scale: number }) {
  return (
    <Card style={[styles.yoyCard, { marginTop: 10 * scale, padding: 20 * scale }]}>
      <Text style={[styles.yoyLabel, { fontSize: 17 * scale }]}>전년 대비 사용량</Text>
      <View style={[styles.yoyValueRow, { marginTop: 6 * scale, gap: 10 * scale }]}>
        <Text style={[styles.yoyPercent, { fontSize: 42 * scale }]}>34%</Text>
        <Text style={[styles.yoyWord, { fontSize: 18 * scale, marginBottom: 6 * scale }]}>감소</Text>
      </View>
    </Card>
  );
}

// 에어컨(파랑)/선풍기(청록) 두 계열의 연도별 사용량을 보여주는 라인 차트.
// 데이터가 3개 지점뿐이라 별도 차트 라이브러리 없이 react-native-svg로 직접 그린다.
function UsageLineChart({ scale }: { scale: number }) {
  const { width: winWidth } = useWindowDimensions();
  const chartWidth = winWidth - SCREEN_PADDING * 2;
  const chartHeight = 200 * scale;
  const leftAxisWidth = 34; // "0,10,20,30,40" y축 라벨이 들어갈 좌측 여백
  const rightMargin = 20; // 마지막 지점의 원/숫자 라벨이 SVG 오른쪽 끝에서 잘리지 않도록 남겨두는 여백
  const plotWidth = chartWidth - leftAxisWidth - rightMargin;
  const plotHeight = 150 * scale; // x축 라벨을 위한 하단 여백을 제외한 실제 그래프 높이
  const maxValue = 40;

  const years = ['2024. 7', '2025. 7', '2026. 7'];
  const aircon = [21, 36, 18]; // 에어컨 사용량
  const fan = [27, 20, 26]; // 선풍기 사용량

  const xAt = (i: number) => (plotWidth / (years.length - 1)) * i;
  const yAt = (v: number) => plotHeight - (v / maxValue) * plotHeight;

  const gridValues = [0, 10, 20, 30, 40];

  return (
    <View style={{ marginTop: 16 * scale }}>
      <Svg width={chartWidth} height={chartHeight}>
        {/* y축 눈금선 + 라벨 */}
        {gridValues.map((v) => (
          <React.Fragment key={v}>
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
              fontSize={12 * scale}
              fill={colors.text}
              textAnchor="end"
            >
              {v}
            </SvgText>
          </React.Fragment>
        ))}

        {/* 실제 데이터 좌표는 y축 라벨 폭(leftAxisWidth)만큼 오른쪽으로 밀어서 그린다 */}
        <Polyline
          points={aircon.map((v, i) => `${xAt(i) + leftAxisWidth},${yAt(v)}`).join(' ')}
          fill="none"
          stroke={colors.chartBlue}
          strokeWidth={2.5}
        />
        <Polyline
          points={fan.map((v, i) => `${xAt(i) + leftAxisWidth},${yAt(v)}`).join(' ')}
          fill="none"
          stroke={colors.chartTeal}
          strokeWidth={2.5}
        />

        {aircon.map((v, i) => (
          <Circle
            key={`ac-${i}`}
            cx={xAt(i) + leftAxisWidth}
            cy={yAt(v)}
            r={5}
            fill={colors.white}
            stroke={colors.chartBlue}
            strokeWidth={2.5}
          />
        ))}
        {aircon.map((v, i) => (
          <SvgText
            key={`ac-label-${i}`}
            x={xAt(i) + leftAxisWidth}
            y={yAt(v) + (v >= fan[i] ? -14 : 24)}
            fontSize={13 * scale}
            fontWeight="bold"
            fill={colors.chartBlue}
            textAnchor="middle"
          >
            {v}
          </SvgText>
        ))}

        {fan.map((v, i) => (
          <Circle
            key={`fan-${i}`}
            cx={xAt(i) + leftAxisWidth}
            cy={yAt(v)}
            r={5}
            fill={colors.white}
            stroke={colors.chartTeal}
            strokeWidth={2.5}
          />
        ))}
        {fan.map((v, i) => (
          <SvgText
            key={`fan-label-${i}`}
            x={xAt(i) + leftAxisWidth}
            y={yAt(v) + (v > aircon[i] ? -14 : 24)}
            fontSize={13 * scale}
            fontWeight="bold"
            fill={colors.chartTeal}
            textAnchor="middle"
          >
            {v}
          </SvgText>
        ))}

        {/* x축 연도 라벨 */}
        {years.map((y, i) => (
          <SvgText
            key={y}
            x={xAt(i) + leftAxisWidth}
            y={plotHeight + 26 * scale}
            fontSize={12 * scale}
            fill={colors.text}
            textAnchor="middle"
          >
            {y}
          </SvgText>
        ))}
      </Svg>

      {/* 범례 */}
      <View style={[styles.legendRow, { gap: 20 * scale, marginTop: 2 * scale }]}>
        <View style={[styles.legendItem, { gap: 6 * scale }]}>
          <View style={[styles.legendDot, { width: 12 * scale, height: 12 * scale, borderRadius: 6 * scale, borderColor: colors.chartBlue }]} />
          <Text style={[styles.legendText, { fontSize: 13 * scale }]}>에어컨</Text>
        </View>
        <View style={[styles.legendItem, { gap: 6 * scale }]}>
          <View style={[styles.legendDot, { width: 12 * scale, height: 12 * scale, borderRadius: 6 * scale, borderColor: colors.chartTeal }]} />
          <Text style={[styles.legendText, { fontSize: 13 * scale }]}>선풍기</Text>
        </View>
      </View>
    </View>
  );
}

// 하단 "항목별 사용량" 리스트의 행 하나 (기기명 | 증감률)
function UsageRow({ name, changeText, scale }: { name: string; changeText: string; scale: number }) {
  return (
    <Card style={[styles.usageRow, { paddingVertical: 12 * scale, marginBottom: 8 * scale }]}>
      <Text style={[styles.usageName, { fontSize: 16 * scale }]}>{name}</Text>
      <View style={[styles.usageDivider, { height: 16 * scale, marginHorizontal: 14 * scale }]} />
      <Text style={[styles.usageChange, { fontSize: 16 * scale }]}>{changeText}</Text>
    </Card>
  );
}

export default function EnergyUsageScreen() {
  const { height } = useWindowDimensions();
  const scale = Math.min(1, Math.max(MIN_SCALE, height / REFERENCE_HEIGHT));

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={[styles.content, { paddingTop: 14 * scale }]}>
        <PeriodTabs scale={scale} />
        <YearOverYearCard scale={scale} />
        <UsageLineChart scale={scale} />

        <Text style={[styles.sectionTitle, { fontSize: 16 * scale, marginTop: 14 * scale, marginBottom: 6 * scale }]}>
          항목별 사용량
        </Text>
        <UsageRow name="에어컨" changeText="18% 감소" scale={scale} />
        <UsageRow name="선풍기" changeText="6% 증가" scale={scale} />
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
    paddingHorizontal: SCREEN_PADDING,
    justifyContent: 'center',
  },

  tabsCard: {},
  tabsRow: {
    flexDirection: 'row',
  },
  tabChip: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabChipText: {
    fontFamily: fonts.jalnan,
    color: colors.text,
  },

  yoyCard: {},
  yoyLabel: {
    fontFamily: fonts.jalnan,
    color: colors.text,
  },
  yoyValueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  yoyPercent: {
    fontFamily: fonts.jalnan,
    color: colors.text,
  },
  yoyWord: {
    fontFamily: fonts.jalnan,
    color: colors.text,
  },

  legendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendDot: {
    borderWidth: 2,
    backgroundColor: colors.white,
  },
  legendText: {
    fontFamily: fonts.jalnan,
    color: colors.text,
  },

  sectionTitle: {
    fontFamily: fonts.jalnan,
    color: colors.text,
  },
  usageRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  usageName: {
    fontFamily: fonts.jalnan,
    color: colors.text,
  },
  usageDivider: {
    width: 2,
    backgroundColor: colors.text,
  },
  usageChange: {
    fontFamily: fonts.jalnan,
    color: colors.text,
  },

  bottomNavWrap: {
    paddingHorizontal: 20,
    paddingBottom: 10,
    paddingTop: 6,
  },
});
