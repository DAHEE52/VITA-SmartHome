// 신규 화면 - "에너지 나무". 헬스케어 시안(8번) 자리를 대체한다(전달된 UIUX 목업은 없음).
// 절전 실적이 쌓일수록 나무가 자란다는 컨셉의 게이미피케이션 화면으로, HealthcareScreen과
// 같은 톤(회색 알약 라벨 + 카드)을 그대로 따라서 다른 화면들과 시각적으로 어긋나지 않게 했다.
import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts } from '../theme/colors';
import Card from '../components/Card';
import BottomNav from '../components/BottomNav';
import { TreeIcon } from '../components/icons';

const REFERENCE_HEIGHT = 820;
const MIN_SCALE = 0.7;

// 이번 달 절약 실적 - 실제 앱에서는 서버 데이터(메인화면의 절전 목표 달성분)로 교체될 목업 값.
const SAVED_KWH = 42;
// 한국전력 전력량당 온실가스 배출계수(약 0.4781 kg-CO2/kWh)를 적용한 근사 환산값.
const CO2_SAVED_KG = Math.round(SAVED_KWH * 0.4781);

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

// 이번 달 절약량 / CO2 절감량 2열 통계 카드
function StatRow({ scale }: { scale: number }) {
  return (
    <Card style={[styles.statCard, { padding: 20 * scale }]}>
      <View style={styles.statRow}>
        <View style={styles.statCol}>
          <Text style={[styles.statValue, { fontSize: 26 * scale }]}>{SAVED_KWH}kWh</Text>
          <Text style={[styles.statLabel, { fontSize: 14 * scale, marginTop: 6 * scale }]}>
            이번 달 절약량
          </Text>
        </View>
        <View style={[styles.statDivider, { height: 36 * scale }]} />
        <View style={styles.statCol}>
          <Text style={[styles.statValue, { fontSize: 26 * scale }]}>{CO2_SAVED_KG}kg</Text>
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

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={[styles.content, { paddingTop: 16 * scale }]}>
        <SectionPill label="에너지 나무" scale={scale} />

        <View style={[styles.treeWrap, { marginVertical: 24 * scale }]}>
          <TreeIcon size={160 * scale} />
        </View>

        <Text style={[styles.caption, { fontSize: 14 * scale, marginBottom: 20 * scale }]}>
          절전 목표를 달성할수록 나무가 자라나요.
        </Text>

        <StatRow scale={scale} />
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

  treeWrap: {
    alignItems: 'center',
  },
  caption: {
    textAlign: 'center',
    color: colors.textGray2,
    fontWeight: '500',
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
});
