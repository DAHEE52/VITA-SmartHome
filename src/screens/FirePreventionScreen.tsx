// 신규 화면 - 화재 예방 시스템 (방별 화재 감지 센서 대시보드).
// 구조: 전체 요약 카드 / 방별 상태 카드(정상·주의·위험) / 하단 네비(홈)
//
// 실제 화재/연기 센서는 없으므로, RoomsContext의 실제 방·기기 on/off 상태를 기준으로 위험도를
// 시뮬레이션한다: 안전 가이드북(GuidebookScreen)의 "화재가 자주 발생하는 원인"에 나온 기기
// (전기장판/히터/가스레인지 등)가 켜져 있으면 "위험", 여러 고전력 기기가 동시에 켜져 있으면
// (멀티탭 과부하 위험) "주의", 그 외에는 "안전"으로 표시한다.
import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts } from '../theme/colors';
import Card from '../components/Card';
import BottomNav from '../components/BottomNav';
import { useRooms, Room } from '../context/RoomsContext';
import { estimateWattage } from '../utils/energy';

const SCREEN_PADDING = 20;

// 안전 가이드북의 "화재가 자주 발생하는 원인"과 맞춘 고위험 기기 키워드
const HIGH_RISK_KEYWORDS = ['히터', '전기장판', '가스레인지', '난로', '온풍기'];
// 여러 고전력 기기가 한 방에서 동시에 켜져 있을 때(멀티탭 과부하 위험) 기준 전력(W)
const CAUTION_WATT_THRESHOLD = 1500;

type RiskLevel = 'safe' | 'caution' | 'danger';

const RISK_META: Record<RiskLevel, { label: string; color: string }> = {
  safe: { label: '안전', color: colors.green },
  caution: { label: '주의', color: colors.yellow },
  danger: { label: '위험', color: colors.red },
};

function getRoomRisk(room: Room): { level: RiskLevel; reason: string | null } {
  const onDevices = room.devices.filter((d) => d.on);
  const dangerDevice = onDevices.find((d) => HIGH_RISK_KEYWORDS.some((k) => d.name.includes(k)));
  if (dangerDevice) {
    return { level: 'danger', reason: `"${dangerDevice.name}" 장시간 사용 시 화재 위험이 있어요.` };
  }

  const totalWatt = onDevices.reduce((sum, d) => sum + estimateWattage(d.name), 0);
  if (totalWatt >= CAUTION_WATT_THRESHOLD) {
    return { level: 'caution', reason: '여러 고전력 기기가 동시에 켜져 있어요. 멀티탭 과부하를 확인하세요.' };
  }

  return { level: 'safe', reason: null };
}

function RoomRiskCard({ room }: { room: Room }) {
  const { level, reason } = getRoomRisk(room);
  const meta = RISK_META[level];
  const onDevices = room.devices.filter((d) => d.on);

  return (
    <Card style={styles.roomCard}>
      <View style={styles.roomHeaderRow}>
        <Text style={styles.roomLabel}>{room.label}</Text>
        <View style={[styles.statusBadge, { backgroundColor: meta.color }]}>
          <Text style={styles.statusBadgeText}>{meta.label}</Text>
        </View>
      </View>

      {reason && <Text style={styles.reasonText}>{reason}</Text>}

      <Text style={styles.deviceSummary}>
        {onDevices.length > 0 ? `켜진 기기: ${onDevices.map((d) => d.name).join(', ')}` : '켜진 기기가 없어요.'}
      </Text>
    </Card>
  );
}

export default function FirePreventionScreen() {
  const { rooms } = useRooms();
  const risks = rooms.map((room) => ({ room, risk: getRoomRisk(room) }));

  const dangerCount = risks.filter((r) => r.risk.level === 'danger').length;
  const cautionCount = risks.filter((r) => r.risk.level === 'caution').length;

  const summary =
    dangerCount > 0
      ? { text: `${dangerCount}개 방 위험 감지`, color: colors.red }
      : cautionCount > 0
      ? { text: `${cautionCount}개 방 주의 필요`, color: colors.yellow }
      : { text: '모든 방 안전', color: colors.green };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.headerIcon}>🔥</Text>
        <Text style={styles.headerTitle}>화재 예방 시스템</Text>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner} showsVerticalScrollIndicator={false}>
        <Card style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>전체 상태</Text>
          <View style={[styles.summaryBadge, { backgroundColor: summary.color }]}>
            <Text style={styles.summaryBadgeText}>{summary.text}</Text>
          </View>
        </Card>

        <Text style={styles.sectionTitle}>방별 화재 감지 센서</Text>
        {rooms.length > 0 ? (
          rooms.map((room) => <RoomRiskCard key={room.id} room={room} />)
        ) : (
          <Text style={styles.emptyHint}>등록된 방이 없어요.</Text>
        )}

        <Text style={styles.disclaimer}>
          실제 화재/연기 센서와 연동된 값이 아니라, 등록된 기기의 사용 현황을 기준으로 위험도를
          추정한 시뮬레이션이에요.
        </Text>
      </ScrollView>

      <View style={styles.bottomNavWrap}>
        <BottomNav variant="sub" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.white,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: 10,
    paddingBottom: 8,
  },
  headerIcon: {
    fontSize: 26,
  },
  headerTitle: {
    fontFamily: fonts.jalnan,
    fontSize: 18,
    color: colors.text,
  },

  content: {
    flex: 1,
  },
  contentInner: {
    paddingHorizontal: SCREEN_PADDING,
    paddingBottom: 20,
    gap: 12,
  },

  summaryCard: {
    alignItems: 'center',
  },
  summaryLabel: {
    fontFamily: fonts.jalnan,
    fontSize: 14,
    color: colors.textGray2,
  },
  summaryBadge: {
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 14,
  },
  summaryBadgeText: {
    fontFamily: fonts.jalnan,
    fontSize: 18,
    color: colors.white,
  },

  sectionTitle: {
    fontFamily: fonts.jalnan,
    fontSize: 16,
    color: colors.text,
    marginTop: 4,
  },

  roomCard: {},
  roomHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  roomLabel: {
    fontFamily: fonts.jalnan,
    fontSize: 16,
    color: colors.text,
  },
  statusBadge: {
    paddingVertical: 5,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  statusBadgeText: {
    fontFamily: fonts.jalnan,
    fontSize: 13,
    color: colors.white,
  },
  reasonText: {
    marginTop: 8,
    fontSize: 13,
    color: colors.textGray2,
    lineHeight: 18,
  },
  deviceSummary: {
    marginTop: 8,
    fontSize: 12,
    color: colors.textGray,
  },
  emptyHint: {
    fontSize: 13,
    color: colors.textGray,
  },

  disclaimer: {
    fontSize: 11,
    color: colors.textGray,
    textAlign: 'center',
    lineHeight: 16,
    marginTop: 4,
  },

  bottomNavWrap: {
    paddingHorizontal: 20,
    paddingBottom: 10,
    paddingTop: 6,
  },
});
