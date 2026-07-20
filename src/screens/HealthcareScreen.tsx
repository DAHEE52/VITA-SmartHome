// 시안 8 - 헬스케어 화면.
// 구조: 일일 걸음수 막대그래프 / 현재 심박수 / 스트레스 지수(이모지+그라데이션 슬라이더)
//      / 고위험 스트레스 감지 시 자동화 안내 카드 / 하단 네비
import React from 'react';
import { View, Text, StyleSheet, ScrollView, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Rect, Text as SvgText, Path, Circle, Line } from 'react-native-svg';

import { colors, fonts } from '../theme/colors';
import Card from '../components/Card';
import BottomNav from '../components/BottomNav';
import { EllipsisIcon } from '../components/icons';

const SCREEN_PADDING = 20;

// "일일 걸음 수" / "현재 심박수" / "스트레스 지수" 위에 붙는 회색 알약 모양 라벨
function SectionPill({ label }: { label: string }) {
  return (
    <View style={styles.pillWrap}>
      <View style={styles.pill}>
        <Text style={styles.pillText}>{label}</Text>
      </View>
    </View>
  );
}

// 최근 4개 기록의 걸음 수를 보여주는 막대그래프 (값 라벨을 막대 위에 직접 표시)
function StepsBarChart() {
  const { width: winWidth } = useWindowDimensions();
  const chartWidth = winWidth - SCREEN_PADDING * 2;
  const chartHeight = 220;
  const steps = [1875, 7546, 2185, 5698];
  const maxValue = Math.max(...steps);
  const barWidth = 46;
  const gap = (chartWidth - barWidth * steps.length) / (steps.length + 1);

  return (
    <Svg width={chartWidth} height={chartHeight}>
      {steps.map((v, i) => {
        const barHeight = (v / maxValue) * (chartHeight - 40);
        const x = gap + i * (barWidth + gap);
        const y = chartHeight - barHeight;
        return (
          <React.Fragment key={i}>
            <SvgText
              x={x + barWidth / 2}
              y={y - 10}
              fontSize={16}
              fontWeight="bold"
              fill={colors.text}
              textAnchor="middle"
            >
              {v.toLocaleString()}
            </SvgText>
            <Rect x={x} y={y} width={barWidth} height={barHeight} rx={6} fill={colors.stressGreen} />
          </React.Fragment>
        );
      })}
    </Svg>
  );
}

// 현재 심박수 - 심전도(ECG) 지그재그 라인 중앙에 하트가 겹쳐진 아이콘 + BPM 텍스트
function HeartRateRow() {
  return (
    <View style={styles.heartRow}>
      <Svg width={180} height={70} viewBox="0 0 220 90">
        <Path
          d="M4 45 L44 45 L58 15 L80 75 L96 45 L216 45"
          fill="none"
          stroke={colors.red}
          strokeWidth={5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Path
          d="M110 30 C110 20 100 14 92 18 C86 21 84 28 84 28 C84 28 82 21 76 18 C68 14 58 20 58 30 C58 44 84 58 84 58 C84 58 110 44 110 30 Z"
          fill={colors.white}
          stroke={colors.red}
          strokeWidth={5}
          strokeLinejoin="round"
          transform="translate(38, 14) scale(0.8)"
        />
      </Svg>
      <Text style={styles.bpmText}>60 BPM</Text>
    </View>
  );
}

// 스트레스 지수용 이모지 원 아이콘 (표정별로 눈/입 모양만 다르게 그림)
function MoodFace({
  mood,
  color,
  size = 64,
}: {
  mood: 'stressed' | 'worried' | 'happy';
  color: string;
  size?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Circle cx={50} cy={50} r={42} fill="none" stroke={color} strokeWidth={5} />
      {mood === 'stressed' && (
        <>
          <Path d="M26 38 L40 44 M26 44 L40 38" stroke={color} strokeWidth={5} strokeLinecap="round" />
          <Path d="M60 44 L74 38 M60 38 L74 44" stroke={color} strokeWidth={5} strokeLinecap="round" />
          <Path d="M32 68 C42 58 58 58 68 68" fill="none" stroke={color} strokeWidth={5} strokeLinecap="round" />
        </>
      )}
      {mood === 'worried' && (
        <>
          <Line x1={28} y1={40} x2={42} y2={40} stroke={color} strokeWidth={5} strokeLinecap="round" />
          <Line x1={58} y1={40} x2={72} y2={40} stroke={color} strokeWidth={5} strokeLinecap="round" />
          <Path d="M34 68 C42 60 58 60 66 68" fill="none" stroke={color} strokeWidth={5} strokeLinecap="round" />
        </>
      )}
      {mood === 'happy' && (
        <>
          <Path d="M28 40 C32 34 40 34 44 40" fill="none" stroke={color} strokeWidth={5} strokeLinecap="round" />
          <Path d="M56 40 C60 34 68 34 72 40" fill="none" stroke={color} strokeWidth={5} strokeLinecap="round" />
          <Path d="M32 60 C40 74 60 74 68 60" fill="none" stroke={color} strokeWidth={5} strokeLinecap="round" />
        </>
      )}
    </Svg>
  );
}

// 3개 이모지 + 파랑→초록→노랑→빨강 그라데이션 점 슬라이더 + 현재 위치를 가리키는 보라 핀
function StressGauge() {
  const { width: winWidth } = useWindowDimensions();
  const trackWidth = winWidth - SCREEN_PADDING * 2;
  // 점 10개를 색상 구간(파랑2 - 초록2 - 노랑2 - 주황2 - 빨강2)으로 나눠 그린다
  const dotColors = [
    colors.stressBlue,
    colors.stressBlue,
    colors.stressGreen,
    colors.stressGreen,
    colors.stressYellow,
    colors.stressYellow,
    colors.stressOrange,
    colors.stressOrange,
    colors.red,
    colors.red,
  ];
  const pinIndex = 6.5; // 노랑과 주황 사이 - 원본 시안에서 핀이 위치한 지점

  return (
    <View style={styles.gaugeWrap}>
      <View style={styles.moodRow}>
        <MoodFace mood="stressed" color={colors.stressBlue} />
        <MoodFace mood="worried" color={colors.stressYellow} />
        <MoodFace mood="happy" color={colors.stressOrange} />
      </View>

      <Svg width={trackWidth} height={40} style={{ marginTop: 18 }}>
        {dotColors.slice(0, -1).map((c, i) => (
          <Line
            key={`seg-${i}`}
            x1={(trackWidth / (dotColors.length - 1)) * i}
            x2={(trackWidth / (dotColors.length - 1)) * (i + 1)}
            y1={20}
            y2={20}
            stroke={c}
            strokeWidth={2}
          />
        ))}
        {dotColors.map((c, i) => (
          <Circle
            key={`dot-${i}`}
            cx={(trackWidth / (dotColors.length - 1)) * i}
            cy={20}
            r={5}
            fill={c}
          />
        ))}
        {/* 현재 스트레스 위치를 가리키는 핀 (물방울 모양) */}
        <Path
          d={`M ${(trackWidth / (dotColors.length - 1)) * pinIndex - 9} 2
              a 9 9 0 1 1 18 0
              c 0 7 -9 14 -9 18
              c 0 -4 -9 -11 -9 -18 Z`}
          fill={colors.stressPin}
        />
      </Svg>
    </View>
  );
}

// 고위험 스트레스가 감지됐을 때 자동으로 실행되는 액션을 안내하는 카드
function AutomationCard() {
  return (
    <Card style={styles.autoCard}>
      <View style={styles.autoHeaderRow}>
        <Text style={styles.autoTitle}>고위험 스트레스 감지 시</Text>
        <EllipsisIcon size={20} />
      </View>
      <View style={styles.autoActionRow}>
        <Text style={styles.autoAction}>조명 밝기 60%</Text>
        <View style={styles.autoDivider} />
        <Text style={styles.autoAction}>차분한 음악 재생</Text>
      </View>
    </Card>
  );
}

export default function HealthcareScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <SectionPill label="일일 걸음 수" />
        <StepsBarChart />

        <SectionPill label="현재 심박수" />
        <HeartRateRow />

        <SectionPill label="스트레스 지수" />
        <StressGauge />

        <AutomationCard />
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
    paddingTop: 24,
    paddingBottom: 110,
  },

  pillWrap: {
    alignItems: 'center',
    marginBottom: 18,
  },
  pill: {
    backgroundColor: colors.card,
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  pillText: {
    fontFamily: fonts.jalnan,
    fontSize: 17,
    color: colors.text,
  },

  heartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    marginTop: 6,
  },
  bpmText: {
    fontFamily: fonts.jalnan,
    fontSize: 22,
    color: colors.text,
  },

  gaugeWrap: {
    marginTop: 8,
    alignItems: 'center',
  },
  moodRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },

  autoCard: {
    marginTop: 40,
  },
  autoHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  autoTitle: {
    fontFamily: fonts.jalnan,
    fontSize: 19,
    color: colors.text,
  },
  autoActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
    flexWrap: 'wrap',
  },
  autoAction: {
    fontFamily: fonts.jalnan,
    fontSize: 20,
    color: colors.text,
  },
  autoDivider: {
    width: 2,
    height: 20,
    backgroundColor: colors.text,
    marginHorizontal: 16,
  },

  bottomNavWrap: {
    paddingHorizontal: 20,
    paddingBottom: 10,
    paddingTop: 6,
  },
});
