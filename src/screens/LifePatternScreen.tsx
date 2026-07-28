// 신규 화면 - 생활 패턴 분석 (명세서 6번 항목 "화면 2: 생활 패턴 분석").
// 구조: 오늘 현재 패턴 배지 / "당신의 하루" 타임라인 / 규칙 기반 인사이트 / 하단 네비(홈)
//
// firmware/life_pattern_vision_node(4-class 비전 모델)가 아직 배포되지 않았으므로
// LifePatternContext.today/latest는 지금은 항상 비어있다 - 실제 값을 지어내는 대신
// FirePreventionScreen과 같은 관례로 "아직 모델이 연결되지 않았다"를 정직하게 안내한다.
import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts } from '../theme/colors';
import Card from '../components/Card';
import BottomNav from '../components/BottomNav';
import { useLifePattern, LIFE_PATTERN_LABELS } from '../context/LifePatternContext';
import { PatternSegment } from '../api/client';

const SCREEN_PADDING = 20;

function labelText(label: string): string {
  return LIFE_PATTERN_LABELS[label] ?? label;
}

function formatClock(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function segmentMinutes(seg: PatternSegment): number {
  if (!seg.ended_at) return 0;
  return Math.max(1, Math.round((new Date(seg.ended_at).getTime() - new Date(seg.started_at).getTime()) / 60000));
}

function TimelineRow({ segment }: { segment: PatternSegment }) {
  const mins = segmentMinutes(segment);
  return (
    <View style={styles.timelineRow}>
      <Text style={styles.timelineTime}>{formatClock(segment.started_at)}</Text>
      <View style={styles.timelineDot} />
      <View style={styles.timelineBody}>
        <Text style={styles.timelineLabel}>{labelText(segment.label)}</Text>
        <Text style={styles.timelineDuration}>{mins}분</Text>
      </View>
    </View>
  );
}

// 오늘 하루 라벨별 누적 시간을 근거로 한 줄짜리 규칙 기반 인사이트 - ML이 아니라 단순 최댓값 비교.
function buildInsight(segments: PatternSegment[]): string | null {
  if (segments.length === 0) return null;
  const totals = new Map<string, number>();
  for (const seg of segments) {
    totals.set(seg.label, (totals.get(seg.label) ?? 0) + segmentMinutes(seg));
  }
  const top = Array.from(totals.entries()).sort((a, b) => b[1] - a[1])[0];
  if (!top) return null;
  const hours = Math.round((top[1] / 60) * 10) / 10;
  return `오늘은 "${labelText(top[0])}" 활동이 가장 길었어요 (약 ${hours}시간).`;
}

export default function LifePatternScreen() {
  const { latest, today } = useLifePattern();
  const insight = buildInsight(today);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.headerIcon}>🧭</Text>
        <Text style={styles.headerTitle}>생활 패턴 분석</Text>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner} showsVerticalScrollIndicator={false}>
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>지금 상태</Text>
          <Text style={styles.currentValue}>{latest ? labelText(latest.label) : '- (모델 연결 전)'}</Text>
        </Card>

        <Text style={styles.sectionTitle}>당신의 하루</Text>
        {today.length > 0 ? (
          <Card style={styles.card}>
            {today.map((seg, i) => (
              <TimelineRow key={`${seg.started_at}-${i}`} segment={seg} />
            ))}
          </Card>
        ) : (
          <Card style={styles.card}>
            <Text style={styles.emptyHint}>
              아직 생활 패턴 AI 모델이 연결되지 않았어요. 카메라 기반 4분류(침대/책상/이동/외출) 모델이
              학습·배포되면 이 자리에 실시간 타임라인이 표시돼요.
            </Text>
          </Card>
        )}

        {insight && (
          <Card style={styles.card}>
            <Text style={styles.cardTitle}>💡 AI 인사이트</Text>
            <Text style={styles.insightText}>{insight}</Text>
          </Card>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: 10,
    paddingBottom: 8,
  },
  headerIcon: { fontSize: 26 },
  headerTitle: { fontFamily: fonts.jalnan, fontSize: 18, color: colors.text },

  content: { flex: 1 },
  contentInner: { paddingHorizontal: SCREEN_PADDING, paddingBottom: 20, gap: 12 },

  card: {},
  cardTitle: { fontFamily: fonts.jalnan, fontSize: 15, color: colors.text, marginBottom: 6 },
  currentValue: { fontFamily: fonts.jalnan, fontSize: 22, color: colors.orange },

  sectionTitle: { fontFamily: fonts.jalnan, fontSize: 16, color: colors.text, marginTop: 4 },
  emptyHint: { fontSize: 13, color: colors.textGray, lineHeight: 19 },

  timelineRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  timelineTime: { fontFamily: fonts.jalnan, fontSize: 12, color: colors.textGray, width: 44 },
  timelineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.orange, marginHorizontal: 10 },
  timelineBody: { flex: 1, flexDirection: 'row', justifyContent: 'space-between' },
  timelineLabel: { fontFamily: fonts.jalnan, fontSize: 14, color: colors.text },
  timelineDuration: { fontSize: 12, color: colors.textGray },

  insightText: { fontSize: 13, color: colors.textGray2, lineHeight: 19 },

  bottomNavWrap: { paddingHorizontal: 20, paddingBottom: 10, paddingTop: 6 },
});
