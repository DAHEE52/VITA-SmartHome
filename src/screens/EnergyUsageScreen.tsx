// 시안 5 - 에너지 사용량 화면.
// 구조: 연/월/일 탭 칩 / 전년대비 감소율 카드 / 라인차트(기기별 실시간 사용량) / 항목별 사용량 리스트
//
// power_monitor 노드(PZEM-004T)가 보내는 실측 데이터를 /energy/usage에서 받아 그린다.
// 기기 수/이름이 고정되어 있지 않으므로(팀마다 다른 기기를 붙일 수 있음) 차트는
// series: {label, points}[] 형태의 동적 데이터를 받아 그리도록 일반화했다.
import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Svg, { Line, Polyline, Circle, Text as SvgText } from 'react-native-svg';

import { colors, fonts } from '../theme/colors';
import Card from '../components/Card';
import BottomNav from '../components/BottomNav';
import { EnergySeries, EnergyUsage, getEnergyUsage, Period } from '../api/client';

const SCREEN_PADDING = 20;

// 라인차트/범례에 기기별로 순서대로 배정하는 색상 팔레트 (전부 theme/colors.ts에 이미 있는 값)
const SERIES_COLORS = [colors.chartBlue, colors.chartTeal, colors.chartGreen, colors.orange, colors.stressPin];

// 연/월/일 조회 기간 선택 칩. period가 바뀌면 onChange로 부모에 알려 재조회한다.
function PeriodTabs({ period, onChange }: { period: Period; onChange: (p: Period) => void }) {
  const tabs: { label: string; value: Period; bg: string }[] = [
    { label: '연', value: 'year', bg: colors.chipRed },
    { label: '월', value: 'month', bg: colors.chipYellow },
    { label: '일', value: 'day', bg: colors.chipGreen },
  ];
  return (
    <Card style={styles.tabsCard}>
      <View style={styles.tabsRow}>
        {tabs.map((t) => (
          <TouchableOpacity
            key={t.label}
            style={[
              styles.tabChip,
              { backgroundColor: t.bg },
              period === t.value && styles.tabChipActive,
            ]}
            onPress={() => onChange(t.value)}
          >
            <Text style={styles.tabChipText}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </Card>
  );
}

// 전년 대비 사용량 증감률을 큰 숫자로 강조하는 카드.
// pct는 양수=작년보다 감소, 음수=증가 (백엔드 규약). 과거 데이터가 없으면 null -> 대시로 표시.
function YearOverYearCard({ pct }: { pct: number | null }) {
  const label = pct === null ? '—' : `${Math.abs(pct)}%`;
  const word = pct === null ? '데이터 부족' : pct >= 0 ? '감소' : '증가';
  return (
    <Card style={styles.yoyCard}>
      <Text style={styles.yoyLabel}>전년 대비 사용량</Text>
      <View style={styles.yoyValueRow}>
        <Text style={styles.yoyPercent}>{label}</Text>
        <Text style={styles.yoyWord}>{word}</Text>
      </View>
    </Card>
  );
}

// 기기별 사용량 라인차트. series 안 기기 수/이름은 실제 등록된 power_monitor 기기에 따라 달라진다.
function UsageLineChart({ series }: { series: EnergySeries[] }) {
  const { width: winWidth } = useWindowDimensions();
  const chartWidth = winWidth - SCREEN_PADDING * 2;
  const chartHeight = 260;
  const leftAxisWidth = 34;
  const rightMargin = 20;
  const plotWidth = chartWidth - leftAxisWidth - rightMargin;
  const plotHeight = 210;

  // 기기별 데이터에 등장하는 모든 x축 라벨을 순서대로 합친다 (기기마다 데이터 시점이 다를 수 있음)
  const xLabels = Array.from(new Set(series.flatMap((s) => s.points.map((p) => p.x_label))));
  const allValues = series.flatMap((s) => s.points.map((p) => p.value));
  const rawMax = allValues.length > 0 ? Math.max(...allValues) : 0;
  const maxValue = Math.max(5, Math.ceil((rawMax * 1.2) / 5) * 5); // 여유 20% + 5 단위로 반올림

  const xAt = (i: number) => (xLabels.length > 1 ? (plotWidth / (xLabels.length - 1)) * i : plotWidth / 2);
  const yAt = (v: number) => plotHeight - (v / maxValue) * plotHeight;
  const gridValues = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(maxValue * f));

  if (xLabels.length === 0) {
    return (
      <View style={styles.emptyChart}>
        <Text style={styles.emptyChartText}>아직 전력 사용량 데이터가 없습니다</Text>
      </View>
    );
  }

  return (
    <View style={{ marginTop: 28 }}>
      <Svg width={chartWidth} height={chartHeight}>
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
            <SvgText x={leftAxisWidth - 10} y={yAt(v) + 5} fontSize={14} fill={colors.text} textAnchor="end">
              {v}
            </SvgText>
          </React.Fragment>
        ))}

        {series.map((s, si) => {
          const color = SERIES_COLORS[si % SERIES_COLORS.length];
          const pts = s.points
            .map((p) => ({ x: xLabels.indexOf(p.x_label), value: p.value }))
            .filter((p) => p.x >= 0)
            .sort((a, b) => a.x - b.x);

          return (
            <React.Fragment key={s.device_id}>
              <Polyline
                points={pts.map((p) => `${xAt(p.x) + leftAxisWidth},${yAt(p.value)}`).join(' ')}
                fill="none"
                stroke={color}
                strokeWidth={2.5}
              />
              {pts.map((p) => (
                <Circle
                  key={`${s.device_id}-${p.x}`}
                  cx={xAt(p.x) + leftAxisWidth}
                  cy={yAt(p.value)}
                  r={5}
                  fill={colors.white}
                  stroke={color}
                  strokeWidth={2.5}
                />
              ))}
            </React.Fragment>
          );
        })}

        {xLabels.map((label, i) => (
          <SvgText
            key={label}
            x={xAt(i) + leftAxisWidth}
            y={plotHeight + 34}
            fontSize={14}
            fill={colors.text}
            textAnchor="middle"
          >
            {label}
          </SvgText>
        ))}
      </Svg>

      <View style={styles.legendRow}>
        {series.map((s, si) => (
          <View key={s.device_id} style={styles.legendItem}>
            <View style={[styles.legendDot, { borderColor: SERIES_COLORS[si % SERIES_COLORS.length] }]} />
            <Text style={styles.legendText}>{s.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// 하단 "항목별 사용량" 리스트의 행 하나 (기기명 | 조회 기간 내 합계 kWh)
function UsageRow({ name, totalKwh }: { name: string; totalKwh: number }) {
  return (
    <Card style={styles.usageRow}>
      <Text style={styles.usageName}>{name}</Text>
      <View style={styles.usageDivider} />
      <Text style={styles.usageChange}>{totalKwh.toFixed(2)} kWh</Text>
    </Card>
  );
}

export default function EnergyUsageScreen() {
  const [period, setPeriod] = useState<Period>('month');
  const [usage, setUsage] = useState<EnergyUsage>({ series: [], year_over_year_pct: null });

  // 화면에 들어올 때 + period 탭을 바꿀 때마다 다시 불러온다.
  useFocusEffect(
    useCallback(() => {
      getEnergyUsage(period)
        .then(setUsage)
        .catch((err) => console.warn('에너지 사용량 조회 실패:', err));
    }, [period])
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <PeriodTabs period={period} onChange={setPeriod} />
        <YearOverYearCard pct={usage.year_over_year_pct} />
        <UsageLineChart series={usage.series} />

        <Text style={styles.sectionTitle}>항목별 사용량</Text>
        {usage.series.map((s) => (
          <UsageRow
            key={s.device_id}
            name={s.label}
            totalKwh={s.points.reduce((sum, p) => sum + p.value, 0)}
          />
        ))}
      </ScrollView>
      <View style={styles.bottomNavWrap}>
        <BottomNav variant="sub" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  scrollContent: {
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: 20,
    paddingBottom: 110,
  },

  tabsCard: {
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  tabsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  tabChip: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabChipActive: {
    borderWidth: 2,
    borderColor: colors.text,
  },
  tabChipText: {
    fontFamily: fonts.jalnan,
    fontSize: 15,
    color: colors.text,
  },

  yoyCard: {
    marginTop: 16,
  },
  yoyLabel: {
    fontFamily: fonts.jalnan,
    fontSize: 20,
    color: colors.text,
  },
  yoyValueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: 10,
    gap: 12,
  },
  yoyPercent: {
    fontFamily: fonts.jalnan,
    fontSize: 56,
    color: colors.text,
  },
  yoyWord: {
    fontFamily: fonts.jalnan,
    fontSize: 22,
    color: colors.text,
    marginBottom: 8,
  },

  emptyChart: {
    marginTop: 28,
    paddingVertical: 60,
    alignItems: 'center',
  },
  emptyChartText: {
    fontFamily: fonts.jalnan,
    fontSize: 15,
    color: colors.textGray,
  },

  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 24,
    marginTop: 4,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    backgroundColor: colors.white,
  },
  legendText: {
    fontFamily: fonts.jalnan,
    fontSize: 14,
    color: colors.text,
  },

  sectionTitle: {
    fontFamily: fonts.jalnan,
    fontSize: 19,
    color: colors.text,
    marginTop: 30,
    marginBottom: 12,
  },
  usageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 20,
    marginBottom: 14,
  },
  usageName: {
    fontFamily: fonts.jalnan,
    fontSize: 19,
    color: colors.text,
  },
  usageDivider: {
    width: 2,
    height: 20,
    backgroundColor: colors.text,
    marginHorizontal: 16,
  },
  usageChange: {
    fontFamily: fonts.jalnan,
    fontSize: 19,
    color: colors.text,
  },

  bottomNavWrap: {
    paddingHorizontal: 20,
    paddingBottom: 10,
    paddingTop: 6,
  },
});
