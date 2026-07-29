// 신규 화면 - 전기요금 영수증 미리보기.
// 구조: 실시간 사용 현황(켜진 기기 목록 + 추정 소비전력) / 이번 달 예상 사용량(진행률) /
//      영수증 미리보기(누진 요금 항목별 내역) / 하단 네비(홈)
//
// SmartHomeControlScreen과 같은 RoomsContext를 그대로 구독하므로, 다른 화면에서 기기를 켜고 끄면
// 이 화면의 "실시간 소비전력"도 즉시 따라 바뀐다. 기기별 소비전력(W)과 요금표는 실제 스펙/한전 API
// 연동 전이라 src/utils/energy.ts의 근사치를 쓰고, 화면에도 "예상치"임을 안내한다.
import React from 'react';
import { View, Text, StyleSheet, ScrollView, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts } from '../theme/colors';
import Card from '../components/Card';
import BottomNav from '../components/BottomNav';
import { useRooms } from '../context/RoomsContext';
import { useGoal } from '../context/GoalContext';
import { useEnergyHistory } from '../context/EnergyHistoryContext';
import { getActiveDevices, estimateTotalWatts, calcBill, BASELINE_STANDBY_WATT } from '../utils/energy';

const SCREEN_PADDING = 20;

function formatWon(n: number) {
  return `${Math.round(n).toLocaleString('ko-KR')}원`;
}

// "한국 평균 전력 소비량"의 1인 가구 월간 근사치(kWh) - 절감액 계산의 "절약 안 했을 때" 기준선.
// VITA는 원룸 전용 서비스라 가구 인원은 항상 1인이다(MainScreen의 절전 목표 카드와 동일한 상수).
const HOUSEHOLD_AVG_KWH_1P = 200;

function pad2(n: number) {
  return String(n).padStart(2, '0');
}
function todayKey(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function dayFractionElapsed(now: Date): number {
  const seconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  return Math.max(0.02, seconds / 86400);
}

// 실시간 절감액 카드 - 원래 메인화면에 있었지만, "얼마나 아꼈는지"는 전기요금 예상치와 함께
// 보는 게 더 자연스러워서 이 화면으로 옮겼다. EnergyHistoryContext(실측 누적 kWh)와
// GoalContext(절전 목표)를 조합해서 계산한다: 가구 평균(HOUSEHOLD_AVG_KWH_1P)을 "절약 안
// 했을 때의 기준선"으로 삼고, 지금까지 지난 시간 비율만큼의 기준 사용량보다 실제로 적게
// 썼으면 그 차이를 절감액으로 환산한다.
function SavingsCard() {
  const { goalKwh } = useGoal();
  const { dailyUsage } = useEnergyHistory();

  if (goalKwh == null) {
    return (
      <Card style={styles.card}>
        <Text style={styles.cardTitle}>💰 실시간 절감액</Text>
        <Text style={styles.emptyHint}>절전 목표를 설정하면 절감액을 계산해드려요.</Text>
      </Card>
    );
  }

  const baselineMonthlyKwh = HOUSEHOLD_AVG_KWH_1P;
  const baselineDailyKwh = baselineMonthlyKwh / 30;
  const unitPrice = calcBill(baselineMonthlyKwh).total / baselineMonthlyKwh;

  const now = new Date();
  const dayFraction = dayFractionElapsed(now);
  const todayUsageKwh = dailyUsage[todayKey(now)] ?? 0;
  const todaySavedKwh = Math.max(0, baselineDailyKwh * dayFraction - todayUsageKwh);
  const todaySavedWon = todaySavedKwh * unitPrice;

  const monthPrefix = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-`;
  const monthUsageKwh = Object.entries(dailyUsage)
    .filter(([key]) => key.startsWith(monthPrefix))
    .reduce((sum, [, v]) => sum + v, 0);
  const daysSoFar = now.getDate() - 1 + dayFraction;
  const monthSavedKwh = Math.max(0, baselineDailyKwh * daysSoFar - monthUsageKwh);
  const monthSavedWon = monthSavedKwh * unitPrice;

  const annualGoalSavingKwh = Math.max(0, baselineMonthlyKwh - goalKwh);
  const annualSavedWon = annualGoalSavingKwh * unitPrice * 12;

  return (
    <Card style={styles.card}>
      <Text style={styles.cardTitle}>💰 실시간 절감액</Text>
      <View style={styles.savingsRow}>
        <View style={styles.savingsCol}>
          <Text style={styles.savingsLabel}>오늘</Text>
          <Text style={styles.savingsValue}>{formatWon(todaySavedWon)}</Text>
        </View>
        <View style={styles.savingsCol}>
          <Text style={styles.savingsLabel}>이번 달</Text>
          <Text style={styles.savingsValue}>{formatWon(monthSavedWon)}</Text>
        </View>
        <View style={styles.savingsCol}>
          <Text style={styles.savingsLabel}>목표 달성 시 연간</Text>
          <Text style={styles.savingsValue}>{formatWon(annualSavedWon)}</Text>
        </View>
      </View>
    </Card>
  );
}

function ActiveDeviceRow({ room, device, watt }: { room: string; device: string; watt: number }) {
  return (
    <View style={styles.deviceRow}>
      <Text style={styles.deviceRoomText}>{room}</Text>
      <Text style={styles.deviceNameText}>{device}</Text>
      <Text style={styles.deviceWattText}>{watt}W</Text>
    </View>
  );
}

function ReceiptLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.receiptLine}>
      <Text style={styles.receiptLabel}>{label}</Text>
      <Text style={styles.receiptValue}>{value}</Text>
    </View>
  );
}

export default function BillReceiptScreen() {
  const { rooms } = useRooms();

  const onDevices = getActiveDevices(rooms);
  const totalWatts = estimateTotalWatts(rooms);

  const now = new Date();
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const monthProgress = dayOfMonth / daysInMonth;

  // 지금의 전력 사용 패턴이 하루 종일, 그리고 이번 달 내내 이어진다고 가정한 단순 추정치.
  const estimatedDailyKwh = (totalWatts / 1000) * 24;
  const accumulatedKwh = estimatedDailyKwh * dayOfMonth;
  const estimatedMonthKwh = estimatedDailyKwh * daysInMonth;

  const bill = calcBill(estimatedMonthKwh);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Image source={require('../../assets/icons/7-receipt.png')} style={styles.headerIcon} resizeMode="contain" />
        <Text style={styles.headerTitle}>전기요금 영수증 미리보기</Text>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner} showsVerticalScrollIndicator={false}>
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>⚡ 실시간 사용 현황</Text>
          <View style={styles.wattRow}>
            <Text style={styles.wattValue}>{totalWatts.toLocaleString('ko-KR')}</Text>
            <Text style={styles.wattUnit}>W 사용 중</Text>
          </View>
          <Text style={styles.wattHint}>
            켜진 기기 {onDevices.length}대 + 기본 대기전력 {BASELINE_STANDBY_WATT}W(추정)
          </Text>

          {onDevices.length > 0 ? (
            <View style={styles.deviceList}>
              {onDevices.map((d, i) => (
                <ActiveDeviceRow key={`${d.room}-${d.device}-${i}`} room={d.room} device={d.device} watt={d.watt} />
              ))}
            </View>
          ) : (
            <Text style={styles.emptyHint}>지금 켜져 있는 기기가 없어요.</Text>
          )}
        </Card>

        <Card style={styles.card}>
          <Text style={styles.cardTitle}>📅 이번 달 예상 사용량</Text>
          <Text style={styles.progressText}>
            {dayOfMonth}일째 / 이번 달 {daysInMonth}일
          </Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.min(100, monthProgress * 100)}%` }]} />
          </View>

          <View style={styles.kwhRow}>
            <View style={styles.kwhCol}>
              <Text style={styles.kwhLabel}>오늘까지 누적(추정)</Text>
              <Text style={styles.kwhValue}>{accumulatedKwh.toFixed(1)} kWh</Text>
            </View>
            <View style={styles.kwhCol}>
              <Text style={styles.kwhLabel}>이번 달 예상 총합</Text>
              <Text style={styles.kwhValue}>{estimatedMonthKwh.toFixed(1)} kWh</Text>
            </View>
          </View>
        </Card>

        <SavingsCard />

        <Card style={styles.receiptCard}>
          <Text style={styles.receiptTitle}>영수증 미리보기</Text>
          <Text style={styles.receiptDash}>- - - - - - - - - - - - - - - - - - - -</Text>

          <ReceiptLine label="기본요금" value={formatWon(bill.basicFee)} />
          <ReceiptLine label="전력량요금" value={formatWon(bill.energyFee)} />
          <ReceiptLine label="기후환경요금" value={formatWon(bill.climateFee)} />
          <ReceiptLine label="전력산업기반기금" value={formatWon(bill.fundFee)} />
          <ReceiptLine label="부가가치세" value={formatWon(bill.vat)} />

          <Text style={styles.receiptDash}>- - - - - - - - - - - - - - - - - - - -</Text>

          <View style={styles.receiptTotalRow}>
            <Text style={styles.receiptTotalLabel}>합계(예상)</Text>
            <Text style={styles.receiptTotalValue}>{formatWon(bill.total)}</Text>
          </View>

          <Text style={styles.disclaimer}>
            실시간 사용 전력을 기준으로 추정한 값이에요. 실제 청구 금액과 다를 수 있어요.
          </Text>
        </Card>
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
    width: 26,
    height: 26,
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

  card: {},
  cardTitle: {
    fontFamily: fonts.jalnan,
    fontSize: 15,
    color: colors.text,
    marginBottom: 10,
  },

  wattRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  wattValue: {
    fontFamily: fonts.jalnan,
    fontSize: 36,
    color: colors.text,
  },
  wattUnit: {
    fontFamily: fonts.jalnan,
    fontSize: 15,
    color: colors.textGray2,
    marginBottom: 6,
  },
  wattHint: {
    fontSize: 12,
    color: colors.textGray,
    marginTop: 4,
  },

  deviceList: {
    marginTop: 10,
  },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 8,
  },
  deviceRoomText: {
    fontFamily: fonts.jalnan,
    fontSize: 12,
    color: colors.textGray,
    width: 64,
  },
  deviceNameText: {
    flex: 1,
    fontFamily: fonts.jalnan,
    fontSize: 14,
    color: colors.text,
  },
  deviceWattText: {
    fontFamily: fonts.jalnan,
    fontSize: 13,
    color: colors.orange,
  },
  emptyHint: {
    marginTop: 10,
    fontSize: 13,
    color: colors.textGray,
  },

  savingsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  savingsCol: {
    alignItems: 'center',
    flex: 1,
  },
  savingsLabel: {
    fontSize: 12,
    color: colors.textGray,
  },
  savingsValue: {
    fontFamily: fonts.jalnan,
    fontSize: 16,
    color: colors.orange,
    marginTop: 4,
  },

  progressText: {
    fontSize: 13,
    color: colors.textGray2,
    marginBottom: 8,
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.card,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: colors.orange,
  },
  kwhRow: {
    flexDirection: 'row',
    marginTop: 14,
    gap: 12,
  },
  kwhCol: {
    flex: 1,
  },
  kwhLabel: {
    fontSize: 12,
    color: colors.textGray,
    marginBottom: 4,
  },
  kwhValue: {
    fontFamily: fonts.jalnan,
    fontSize: 18,
    color: colors.text,
  },

  // 영수증처럼 보이도록 픽셀 폰트(DungGeunMo)와 점선 구분선을 쓴다.
  receiptCard: {
    backgroundColor: colors.card,
  },
  receiptTitle: {
    fontFamily: fonts.pixel,
    fontSize: 18,
    color: colors.text,
    textAlign: 'center',
    marginBottom: 6,
  },
  receiptDash: {
    fontFamily: fonts.pixel,
    fontSize: 12,
    color: colors.textGray,
    textAlign: 'center',
    marginVertical: 4,
  },
  receiptLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  receiptLabel: {
    fontFamily: fonts.pixel,
    fontSize: 14,
    color: colors.textGray2,
  },
  receiptValue: {
    fontFamily: fonts.pixel,
    fontSize: 14,
    color: colors.text,
  },
  receiptTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    marginBottom: 10,
  },
  receiptTotalLabel: {
    fontFamily: fonts.pixel,
    fontSize: 17,
    color: colors.text,
  },
  receiptTotalValue: {
    fontFamily: fonts.pixel,
    fontSize: 17,
    color: colors.orange,
  },
  disclaimer: {
    fontSize: 11,
    color: colors.textGray,
    textAlign: 'center',
    lineHeight: 16,
  },

  bottomNavWrap: {
    paddingHorizontal: 20,
    paddingBottom: 10,
    paddingTop: 6,
  },
});
