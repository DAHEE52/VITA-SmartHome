// 시안 8 - 헬스케어 화면.
// 구조: 일일 걸음수 막대그래프 / 현재 심박수 / 스트레스 지수(이모지+그라데이션 슬라이더)
//      / 고위험 스트레스 감지 시 자동화 안내 카드 / 하단 네비
import React from 'react';
import { View, Text, Image, StyleSheet, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Rect, Text as SvgText, Path, Circle, Line } from 'react-native-svg';

import { colors, fonts } from '../theme/colors';
import Card from '../components/Card';
import BottomNav from '../components/BottomNav';
import { EllipsisIcon } from '../components/icons';

const SCREEN_PADDING = 20;
// 스크롤 없이 화면 높이 안에 다 들어와야 하므로, MainScreen과 같은 방식으로
// 화면이 작은 기기에서는 차트/카드 크기를 함께 줄이는 scale 값을 쓴다.
const REFERENCE_HEIGHT = 820;
const MIN_SCALE = 0.6;

// "일일 걸음 수" / "현재 심박수" / "스트레스 지수" 위에 붙는 회색 알약 모양 라벨
function SectionPill({ label, scale }: { label: string; scale: number }) {
  return (
    <View style={[styles.pillWrap, { marginBottom: 10 * scale }]}>
      <View style={[styles.pill, { borderRadius: 20 * scale, paddingVertical: 8 * scale, paddingHorizontal: 20 * scale }]}>
        <Text style={[styles.pillText, { fontSize: 15 * scale }]}>{label}</Text>
      </View>
    </View>
  );
}

// 최근 4개 기록의 걸음 수를 보여주는 막대그래프 (값 라벨을 막대 위에 직접 표시)
function StepsBarChart({ scale }: { scale: number }) {
  const { width: winWidth } = useWindowDimensions();
  const chartWidth = winWidth - SCREEN_PADDING * 2;
  const chartHeight = 140 * scale;
  const steps = [1875, 7546, 2185, 5698];
  const maxValue = Math.max(...steps);
  const barWidth = 40 * scale;
  const gap = (chartWidth - barWidth * steps.length) / (steps.length + 1);

  return (
    <Svg width={chartWidth} height={chartHeight}>
      {steps.map((v, i) => {
        const barHeight = (v / maxValue) * (chartHeight - 28 * scale);
        const x = gap + i * (barWidth + gap);
        const y = chartHeight - barHeight;
        return (
          <React.Fragment key={i}>
            <SvgText
              x={x + barWidth / 2}
              y={y - 8 * scale}
              fontSize={13 * scale}
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
const HEART_RATE_ASPECT_RATIO = 500 / 110;

function HeartRateRow({ scale }: { scale: number }) {
  const h = 44 * scale;
  const w = h * HEART_RATE_ASPECT_RATIO;
  return (
    <View style={[styles.heartRow, { gap: 16 * scale, marginTop: 4 * scale }]}>
      <Image
        source={require('../../UIUX/icon/6-심박.png')}
        style={{ width: w, height: h }}
        resizeMode="contain"
      />
      <Text style={[styles.bpmText, { fontSize: 18 * scale }]}>60 BPM</Text>
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

// 3개 이모지 + 파랑→초록→노랑→빨강 그라데이션 점 슬라이더 + 현재 위치를 가리키는 핀
const PIN_ASPECT_RATIO = 345 / 446;

function StressGauge({ scale }: { scale: number }) {
  const { width: winWidth } = useWindowDimensions();
  const trackWidth = winWidth - SCREEN_PADDING * 2;
  const trackHeight = 30 * scale;
  const trackY = trackHeight / 2;
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
  const pinX = (trackWidth / (dotColors.length - 1)) * pinIndex;
  const pinHeight = 30 * scale;
  const pinWidth = pinHeight * PIN_ASPECT_RATIO;
  // 핀 끝(뾰족한 부분)이 트랙 선 위에 정확히 닿도록, 핀 높이만큼 트랙을 아래로 밀어서 배치
  const svgTop = pinHeight - trackY;

  return (
    <View style={styles.gaugeWrap}>
      <View style={styles.moodRow}>
        <MoodFace mood="stressed" color={colors.stressBlue} size={48 * scale} />
        <MoodFace mood="worried" color={colors.stressYellow} size={48 * scale} />
        <MoodFace mood="happy" color={colors.stressOrange} size={48 * scale} />
      </View>

      <View style={{ width: trackWidth, height: svgTop + trackHeight, marginTop: 10 * scale }}>
        <Image
          source={require('../../UIUX/icon/5-위치.png')}
          style={{
            position: 'absolute',
            top: 0,
            left: pinX - pinWidth / 2,
            width: pinWidth,
            height: pinHeight,
          }}
          resizeMode="contain"
        />
        <Svg width={trackWidth} height={trackHeight} style={{ position: 'absolute', top: svgTop, left: 0 }}>
          {dotColors.slice(0, -1).map((c, i) => (
            <Line
              key={`seg-${i}`}
              x1={(trackWidth / (dotColors.length - 1)) * i}
              x2={(trackWidth / (dotColors.length - 1)) * (i + 1)}
              y1={trackY}
              y2={trackY}
              stroke={c}
              strokeWidth={2}
            />
          ))}
          {dotColors.map((c, i) => (
            <Circle
              key={`dot-${i}`}
              cx={(trackWidth / (dotColors.length - 1)) * i}
              cy={trackY}
              r={4 * scale}
              fill={c}
            />
          ))}
        </Svg>
      </View>
    </View>
  );
}

// 고위험 스트레스가 감지됐을 때 자동으로 실행되는 액션을 안내하는 카드
function AutomationCard({ scale }: { scale: number }) {
  return (
    <Card style={[styles.autoCard, { marginTop: 20 * scale, padding: 20 * scale }]}>
      <View style={styles.autoHeaderRow}>
        <Text style={[styles.autoTitle, { fontSize: 16 * scale }]}>고위험 스트레스 감지 시</Text>
        <EllipsisIcon size={18 * scale} />
      </View>
      <View style={[styles.autoActionRow, { marginTop: 14 * scale }]}>
        <Text style={[styles.autoAction, { fontSize: 16 * scale }]}>조명 밝기 60%</Text>
        <View style={[styles.autoDivider, { height: 16 * scale, marginHorizontal: 12 * scale }]} />
        <Text style={[styles.autoAction, { fontSize: 16 * scale }]}>차분한 음악 재생</Text>
      </View>
    </Card>
  );
}

export default function HealthcareScreen() {
  const { height } = useWindowDimensions();
  const scale = Math.min(1, Math.max(MIN_SCALE, height / REFERENCE_HEIGHT));

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={[styles.content, { paddingTop: 16 * scale }]}>
        <SectionPill label="일일 걸음 수" scale={scale} />
        <StepsBarChart scale={scale} />

        <SectionPill label="현재 심박수" scale={scale} />
        <HeartRateRow scale={scale} />

        <SectionPill label="스트레스 지수" scale={scale} />
        <StressGauge scale={scale} />

        <AutomationCard scale={scale} />
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

  heartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bpmText: {
    fontFamily: fonts.jalnan,
    color: colors.text,
  },

  gaugeWrap: {
    alignItems: 'center',
  },
  moodRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },

  autoCard: {},
  autoHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  autoTitle: {
    fontFamily: fonts.jalnan,
    color: colors.text,
  },
  autoActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  autoAction: {
    fontFamily: fonts.jalnan,
    color: colors.text,
  },
  autoDivider: {
    width: 2,
    backgroundColor: colors.text,
  },

  bottomNavWrap: {
    paddingHorizontal: 20,
    paddingBottom: 10,
    paddingTop: 6,
  },
});
