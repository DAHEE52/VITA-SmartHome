// 신규 화면 - 수면 통계 (명세서 6번 항목 "화면 5: 수면 통계").
// 구조: 어젯밤 요약 카드(취침/기상 시각 + 수면 시간 + 질 평가) / 최근 7건 수면 시간 막대그래프 /
//      최근 기록 리스트 / 하단 네비(홈)
// SleepContext가 취침 모드를 켜고 끌 때마다 backend sleep_records에 쌓이는 값을 그대로 보여준다.
// 아직 기록이 없으면(취침 모드가 한 번도 활성화된 적 없으면) 빈 상태 안내만 보여준다.
import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';

import { colors, fonts } from '../theme/colors';
import Card from '../components/Card';
import BottomNav from '../components/BottomNav';
import { getSleepRecords, SleepRecord } from '../api/client';

const SCREEN_PADDING = 20;
const RECOMMENDED_MIN_HOURS = 7;
const RECOMMENDED_MAX_HOURS = 9;

function durationMinutes(record: SleepRecord): number | null {
  if (!record.sleep_ended_at) return null;
  return Math.round((new Date(record.sleep_ended_at).getTime() - new Date(record.sleep_started_at).getTime()) / 60000);
}

function formatDuration(mins: number): string {
  return `${Math.floor(mins / 60)}시간 ${mins % 60}분`;
}

function formatClock(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function sleepQualityLabel(mins: number): { text: string; color: string } {
  const hours = mins / 60;
  if (hours < RECOMMENDED_MIN_HOURS) return { text: '수면 부족', color: colors.red };
  if (hours > RECOMMENDED_MAX_HOURS) return { text: '과다 수면', color: colors.yellow };
  return { text: '적정 수면', color: colors.green };
}

function WeeklyBarChart({ records }: { records: SleepRecord[] }) {
  const recent = records.slice(0, 7).reverse();
  const durations = recent.map((r) => durationMinutes(r) ?? 0);
  const maxMin = Math.max(60, ...durations);

  return (
    <View style={styles.barChartRow}>
      {recent.map((r, i) => (
        <View key={r.id} style={styles.barCol}>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { height: `${(durations[i] / maxMin) * 100}%` }]} />
          </View>
          <Text style={styles.barLabel}>{new Date(r.sleep_started_at).getDate()}일</Text>
        </View>
      ))}
    </View>
  );
}

export default function SleepStatsScreen() {
  const [records, setRecords] = useState<SleepRecord[]>([]);

  useFocusEffect(
    useCallback(() => {
      getSleepRecords('month')
        .then(setRecords)
        .catch((err) => console.warn('수면 기록 조회 실패:', err));
    }, [])
  );

  const latest = records[0];
  const latestMins = latest ? durationMinutes(latest) : null;
  const completed = records.filter((r) => r.sleep_ended_at);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.headerIcon}>💤</Text>
        <Text style={styles.headerTitle}>수면 통계</Text>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner} showsVerticalScrollIndicator={false}>
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>어젯밤 수면</Text>
          {!latest ? (
            <Text style={styles.emptyHint}>아직 취침 모드가 활성화된 기록이 없어요.</Text>
          ) : (
            <>
              <View style={styles.summaryRow}>
                <View style={styles.summaryCol}>
                  <Text style={styles.summaryLabel}>취침</Text>
                  <Text style={styles.summaryValue}>{formatClock(latest.sleep_started_at)}</Text>
                </View>
                <View style={styles.summaryCol}>
                  <Text style={styles.summaryLabel}>기상</Text>
                  <Text style={styles.summaryValue}>
                    {latest.sleep_ended_at ? formatClock(latest.sleep_ended_at) : '수면 중'}
                  </Text>
                </View>
                <View style={styles.summaryCol}>
                  <Text style={styles.summaryLabel}>수면 시간</Text>
                  <Text style={styles.summaryValue}>{latestMins != null ? formatDuration(latestMins) : '-'}</Text>
                </View>
              </View>
              {latestMins != null && (
                <View style={[styles.qualityBadge, { backgroundColor: sleepQualityLabel(latestMins).color }]}>
                  <Text style={styles.qualityBadgeText}>{sleepQualityLabel(latestMins).text}</Text>
                </View>
              )}
            </>
          )}
        </Card>

        {completed.length > 0 && (
          <Card style={styles.card}>
            <Text style={styles.cardTitle}>최근 수면 시간</Text>
            <WeeklyBarChart records={completed} />
          </Card>
        )}

        {completed.length > 0 && (
          <Card style={styles.card}>
            <Text style={styles.cardTitle}>기록</Text>
            {completed.slice(0, 10).map((r) => {
              const mins = durationMinutes(r)!;
              return (
                <View key={r.id} style={styles.logRow}>
                  <Text style={styles.logDate}>
                    {formatClock(r.sleep_started_at)} → {formatClock(r.sleep_ended_at!)}
                  </Text>
                  <Text style={styles.logDuration}>{formatDuration(mins)}</Text>
                </View>
              );
            })}
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
  cardTitle: { fontFamily: fonts.jalnan, fontSize: 15, color: colors.text, marginBottom: 10 },
  emptyHint: { fontSize: 13, color: colors.textGray },

  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryCol: { alignItems: 'center', flex: 1 },
  summaryLabel: { fontSize: 12, color: colors.textGray },
  summaryValue: { fontFamily: fonts.jalnan, fontSize: 16, color: colors.text, marginTop: 4 },

  qualityBadge: { alignSelf: 'center', marginTop: 14, paddingVertical: 6, paddingHorizontal: 16, borderRadius: 12 },
  qualityBadgeText: { fontFamily: fonts.jalnan, fontSize: 13, color: colors.white },

  barChartRow: { flexDirection: 'row', justifyContent: 'space-between', height: 120, alignItems: 'flex-end' },
  barCol: { alignItems: 'center', flex: 1, height: '100%', justifyContent: 'flex-end' },
  barTrack: { width: 16, height: '85%', justifyContent: 'flex-end' },
  barFill: { width: '100%', backgroundColor: colors.chartBlue, borderRadius: 6, minHeight: 4 },
  barLabel: { fontSize: 10, color: colors.textGray, marginTop: 6 },

  logRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  logDate: { fontSize: 13, color: colors.text },
  logDuration: { fontFamily: fonts.jalnan, fontSize: 13, color: colors.orange },

  bottomNavWrap: { paddingHorizontal: 20, paddingBottom: 10, paddingTop: 6 },
});
