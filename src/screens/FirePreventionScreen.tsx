// 신규 화면 - 화재 예방 시스템 (방별 화재 감지 센서 대시보드 + AI 이상 패턴 감지 + 자동 대응).
// 구조: 긴급 경보 카드(있을 때만) / 전체 요약 카드 / AI 이상 패턴 감지 현황 / 방별 상태 카드
//      / 자동 대응 기록 / 하단 네비(홈)
//
// 이 화면은 서로 다른 두 판정을 함께 보여준다.
// 1) 방 카드의 위험도(안전/주의/위험, getRoomRisk): 기기 사용 패턴(RoomsContext의 on/off 상태 기준 -
//    "화재가 자주 발생하는 원인"에 나온 고위험 기기가 켜져 있으면 위험, 고전력 기기 동시 사용은 주의)과
//    온도/습도 센서(SensorContext, 고온이면 위험) 중 더 심각한 쪽을 그 방의 최종 위험도로 삼는다.
//    센서는 아직 실제 하드웨어가 연결되지 않아 더미 값으로 채워지고, 방 카드의 "화재 상황 시뮬레이션"
//    버튼으로 위험 범위 값을 직접 만들어 감지 흐름을 확인해볼 수 있다. 나중에 실제 센서가 붙으면
//    SensorContext 내부만 교체하면 되고, 이 화면과 판정 로직은 그대로 쓸 수 있다.
// 2) "AI 이상 패턴 감지" 카드(anomalyStatuses): 위 방 위험도와 별개로, 전력 측정 기기별 평소 사용
//    패턴을 백엔드(backend/app/anomaly/)가 14일간 학습해 점수/등급을 매긴다 - 방 카드처럼 기기 종류
//    키워드가 아니라 그 기기 자신의 과거 데이터를 기준으로 판단한다. 위험 등급이면 백엔드가 전력을
//    직접 차단하고 비상 연락처로 SMS를 보낸다(FireSafetyContext가 GET /anomaly를 폴링해 반영).
// 온도 위험(고온 센서 급상승)에 대해서는, 실제 비상 알림(전원 차단·안전 확인·비상 연락망 알림)이 PIR
// 무움직임까지 함께 확인해야 발동한다(FireSafetyContext의 isFireSuspected). 실제로 전화를 자동으로 걸
// 수는 없어서(운영체제가 막음), "119 신고" 버튼은 전화 앱을 119가 입력된 채로 열어줄 뿐 - 실제 발신은
// 사용자가 통화 버튼을 눌러야 이뤄진다.
import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import AnimatedPressable from '../components/AnimatedPressable';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts } from '../theme/colors';
import Card from '../components/Card';
import BottomNav from '../components/BottomNav';
import { useRooms, Room } from '../context/RoomsContext';
import { useFireSafety } from '../context/FireSafetyContext';
import { useSensors } from '../context/SensorContext';
import { estimateWattage } from '../utils/energy';
import { AnomalyLevel, AnomalyStatus } from '../api/client';
import {
  isHighRiskDevice,
  HIGH_RISK_KEYWORDS,
  sensorRiskLevel,
  temperatureRiseRisk,
  RoomSensorReading,
  SENSOR_CAUTION_TEMP_C,
  RISE_DANGER_DELTA_C,
} from '../utils/fireRisk';

const SCREEN_PADDING = 20;

// 여러 고전력 기기가 한 방에서 동시에 켜져 있을 때(멀티탭 과부하 위험) 기준 전력(W)
const CAUTION_WATT_THRESHOLD = 1500;

type RiskLevel = 'safe' | 'caution' | 'danger';

const RISK_META: Record<RiskLevel, { label: string; color: string }> = {
  safe: { label: '안전', color: colors.green },
  caution: { label: '주의', color: colors.yellow },
  danger: { label: '위험', color: colors.red },
};

const RISK_RANK: Record<RiskLevel, number> = { safe: 0, caution: 1, danger: 2 };

const ANOMALY_LEVEL_META: Record<AnomalyLevel, { label: string; color: string }> = {
  normal: { label: '정상', color: colors.green },
  caution: { label: '주의', color: colors.yellow },
  warning: { label: '경고', color: colors.orange },
  danger: { label: '위험', color: colors.red },
};

// 기기 사용 패턴만 근거로 한 위험도(기존 로직).
function getDeviceRisk(room: Room): { level: RiskLevel; reason: string | null } {
  const onDevices = room.devices.filter((d) => d.on);
  const dangerDevice = onDevices.find((d) => isHighRiskDevice(d.name));
  if (dangerDevice) {
    return { level: 'danger', reason: `"${dangerDevice.name}" 장시간 사용 시 화재 위험이 있어요.` };
  }

  const totalWatt = onDevices.reduce((sum, d) => sum + estimateWattage(d.name), 0);
  if (totalWatt >= CAUTION_WATT_THRESHOLD) {
    return { level: 'caution', reason: '여러 고전력 기기가 동시에 켜져 있어요. 멀티탭 과부하를 확인하세요.' };
  }

  return { level: 'safe', reason: null };
}

// 센서 값만 근거로 한 위험도 + 이유 문구. 절대 온도 임계치뿐 아니라, 5분 내 5℃ 이상 급상승도
// 별도로 위험 신호로 본다(화재 초기 - 아직 절대 온도는 안 높아도 오르는 속도 자체가 이상 징후).
function getSensorRisk(
  sensor: RoomSensorReading | undefined,
  riseC: number
): { level: RiskLevel; reason: string | null } {
  const level = sensorRiskLevel(sensor);
  const riseLevel = temperatureRiseRisk(riseC);

  if (riseLevel === 'danger') {
    return { level: 'danger', reason: `5분 사이 온도가 ${riseC.toFixed(1)}℃나 올랐어요. 급격한 온도 상승이에요.` };
  }
  if (level === 'safe' || !sensor) return { level: 'safe', reason: null };
  if (level === 'danger') {
    return { level, reason: `온도가 비정상적으로 높아요 (${sensor.temperatureC}°C).` };
  }
  return {
    level,
    reason:
      sensor.temperatureC >= SENSOR_CAUTION_TEMP_C
        ? `온도가 평소보다 높아요 (${sensor.temperatureC}°C).`
        : `습도가 낮아요 (${sensor.humidityPct}%). 건조한 환경은 화재에 취약해요.`,
  };
}

// 기기 사용 패턴 위험도와 센서 위험도 중 더 심각한 쪽을 그 방의 최종 위험도로 삼는다.
function getRoomRisk(
  room: Room,
  sensor: RoomSensorReading | undefined,
  riseC: number
): { level: RiskLevel; reason: string | null } {
  const deviceRisk = getDeviceRisk(room);
  const sensorRisk = getSensorRisk(sensor, riseC);
  return RISK_RANK[sensorRisk.level] >= RISK_RANK[deviceRisk.level] ? sensorRisk : deviceRisk;
}

// 긴급 경보 카드 - 실제 응답(안전 확인/119 신고)은 MainScreen의 전역 팝업(FireEmergencyModal)에서
// 처리하므로, 여기서는 지금 상황을 놓치지 않도록 알려주는 상태 표시만 한다(버튼 없음 - 중복 UI 방지).
function EmergencyBanner({ reason, phase }: { reason: string; phase: 'confirming' | 'escalated' }) {
  return (
    <Card style={styles.emergencyCard}>
      <Text style={styles.emergencyTitle}>🚨 화재 위험 감지</Text>
      <Text style={styles.emergencyBody}>{reason}</Text>
      <Text style={styles.emergencyHint}>
        {phase === 'confirming'
          ? '홈 화면 팝업에서 안전 여부를 확인해 주세요.'
          : '비상 연락망에 알림을 보냈어요. 홈 화면 팝업에서 확인할 수 있어요.'}
      </Text>
    </Card>
  );
}

// 기기 하나의 device_id를 "방 · 기기명"으로 바꿔준다. 등록된 방/기기에서 못 찾으면(예: 아직 방에
// 배정되지 않은 콘센트) device_id를 그대로 보여준다.
function findDeviceLabel(rooms: Room[], deviceId: string): string {
  for (const room of rooms) {
    const device = room.devices.find((d) => d.id === deviceId);
    if (device) return `${room.label} · ${device.name}`;
  }
  return deviceId;
}

// "AI 이상 패턴 감지" 한 줄 - 백엔드(backend/app/anomaly/)가 계산한 점수/등급/근거를 그대로 보여준다.
// is_learning은 "14일 학습 기간이 안 끝났다"는 뜻일 뿐 판정 자체가 없다는 뜻이 아니다 - 장시간
// 사용·무재실·온도 급상승처럼 개인 학습 데이터가 필요 없는 조건은 학습 중에도 이미 감시하고
// 있으므로, 학습 중이어도 점수/등급/근거는 그대로 보여주고 그 위에 안내 문구만 덧붙인다.
function AnomalyRow({ label, status }: { label: string; status: AnomalyStatus }) {
  const meta = ANOMALY_LEVEL_META[status.level];
  const reasons = status.conditions.filter((c) => c.triggered);

  return (
    <View style={styles.anomalyRow}>
      <View style={styles.anomalyHeaderRow}>
        <Text style={styles.anomalyDeviceText} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[styles.anomalyStatusText, { color: meta.color }]}>
          {meta.label} · {status.score}점
        </Text>
      </View>
      <View style={styles.anomalyBarTrack}>
        <View
          style={[styles.anomalyBarFill, { width: `${status.score}%`, backgroundColor: meta.color }]}
        />
      </View>
      {status.is_learning && (
        <Text style={styles.anomalyTimeText}>
          아직 평소 패턴을 학습하는 중이에요(14일). 장시간 사용·무재실·온도 급상승은 학습 중에도 감시해요.
        </Text>
      )}
      {reasons.length > 0 ? (
        reasons.map((reason) => (
          <Text key={reason.name} style={styles.anomalyTimeText}>
            · {reason.detail}
          </Text>
        ))
      ) : (
        !status.is_learning && <Text style={styles.anomalyTimeText}>평소와 비슷하게 사용되고 있어요.</Text>
      )}
    </View>
  );
}

function RoomRiskCard({
  room,
  sensor,
  riseC,
  isSimulating,
  onToggleSimulate,
}: {
  room: Room;
  sensor: RoomSensorReading | undefined;
  riseC: number;
  isSimulating: boolean;
  onToggleSimulate: () => void;
}) {
  const { level, reason } = getRoomRisk(room, sensor, riseC);
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

      {sensor && (
        <Text style={styles.sensorReadingText}>
          🌡 {sensor.temperatureC}°C · 💧 {sensor.humidityPct}%
        </Text>
      )}

      {reason && <Text style={styles.reasonText}>{reason}</Text>}

      <Text style={styles.deviceSummary}>
        {onDevices.length > 0 ? `켜진 기기: ${onDevices.map((d) => d.name).join(', ')}` : '켜진 기기가 없어요.'}
      </Text>

      <AnimatedPressable
        style={[styles.simulateButton, isSimulating && styles.simulateButtonActive]}
        onPress={onToggleSimulate}
        activeOpacity={0.7}
      >
        <Text style={[styles.simulateButtonText, isSimulating && styles.simulateButtonTextActive]}>
          {isSimulating ? '화재 상황 시뮬레이션 해제' : '화재 상황 시뮬레이션 (테스트)'}
        </Text>
      </AnimatedPressable>
    </Card>
  );
}

export default function FirePreventionScreen() {
  const { rooms } = useRooms();
  const { autoActions, emergency, anomalyStatuses } = useFireSafety();
  const { readings, isSimulatingFire, simulateFire, clearSimulation, getTemperatureRiseC } = useSensors();

  const risks = rooms.map((room) => ({
    room,
    risk: getRoomRisk(room, readings[room.id], getTemperatureRiseC(room.id)),
  }));
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
        {emergency && <EmergencyBanner reason={emergency.reason} phase={emergency.phase} />}

        <Card style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>전체 상태</Text>
          <View style={[styles.summaryBadge, { backgroundColor: summary.color }]}>
            <Text style={styles.summaryBadgeText}>{summary.text}</Text>
          </View>
        </Card>

        <Text style={styles.sectionTitle}>🤖 AI 이상 패턴 감지</Text>
        <Text style={styles.sectionHint}>
          전력 측정 기기별로 평소 사용 패턴(전력량·지속시간·시간대 등)을 14일간 학습해요. 전력량·
          시간대처럼 개인 데이터가 필요한 조건은 학습이 끝나야 정확해지지만, 장시간 사용·무재실·
          온도 급상승 조건은 학습 중에도 바로 감시를 시작해요(헤어드라이기·충전기처럼 어쩌다 한 번씩
          쓰는 기기도 최소한의 보호를 받도록). 점수가 높으면(위험) 전원을 자동 차단하고 비상 연락처로
          알려요.
        </Text>
        <Card style={styles.anomalyCard}>
          {anomalyStatuses.length > 0 ? (
            anomalyStatuses.map((status) => (
              <AnomalyRow key={status.device_id} label={findDeviceLabel(rooms, status.device_id)} status={status} />
            ))
          ) : (
            <Text style={styles.emptyHint}>아직 학습 중인 전력 측정 기기가 없어요.</Text>
          )}
        </Card>

        <Text style={styles.sectionTitle}>방별 화재 감지 센서</Text>
        <Text style={styles.sectionHint}>
          방마다 온도·습도 센서 값을 보여줘요. 절대 온도 임계치뿐 아니라 5분 내 {RISE_DANGER_DELTA_C}℃ 이상
          급상승도 "위험"으로 표시해요. 다만 실제 비상 알림(전원 차단·안전 확인·비상 연락망 알림)은
          온도가 위험 범위여도 PIR 센서로 최근에 사람 움직임이 감지됐으면 오탐 방지를 위해 보내지
          않고, 일정 시간 움직임이 없을 때만 발동해요. 아직 실제 센서가 연결되지 않아 지금은 더미
          값으로 채워지고 있고, 실제 센서가 연동되면 이 값이 그대로 실제 값으로 바뀌어요.
        </Text>
        {rooms.length > 0 ? (
          rooms.map((room) => (
            <RoomRiskCard
              key={room.id}
              room={room}
              sensor={readings[room.id]}
              riseC={getTemperatureRiseC(room.id)}
              isSimulating={isSimulatingFire(room.id)}
              onToggleSimulate={() =>
                isSimulatingFire(room.id) ? clearSimulation(room.id) : simulateFire(room.id)
              }
            />
          ))
        ) : (
          <Text style={styles.emptyHint}>등록된 방이 없어요.</Text>
        )}

        <Text style={styles.sectionTitle}>자동 대응 기록</Text>
        <Card style={styles.logCard}>
          {autoActions.length > 0 ? (
            autoActions.map((action) => (
              <View key={action.id} style={styles.logRow}>
                <Text style={styles.logTime}>{action.time}</Text>
                <Text style={styles.logMessage}>{action.message}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.emptyHint}>아직 자동으로 조치한 내역이 없어요.</Text>
          )}
        </Card>

        <Text style={styles.disclaimer}>
          온도·습도 값은 아직 실제 센서가 연결되지 않아 더미 데이터로 시뮬레이션돼요. 학습된 AI 모델과
          연동된 값도 아니고, 등록된 기기의 사용 현황·더미 센서 값을 기준으로 위험도를 추정해요. 119
          신고 버튼은 전화 앱을 열어줄 뿐, 실제 발신은 직접 눌러야 해요.
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

  emergencyCard: {
    backgroundColor: colors.red,
  },
  emergencyTitle: {
    fontFamily: fonts.jalnan,
    fontSize: 17,
    color: colors.white,
    marginBottom: 8,
  },
  emergencyBody: {
    fontSize: 13,
    color: colors.white,
    lineHeight: 18,
  },
  emergencyHint: {
    marginTop: 10,
    fontSize: 12,
    color: colors.white,
    opacity: 0.85,
    lineHeight: 17,
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
  sectionHint: {
    fontSize: 12,
    color: colors.textGray,
    lineHeight: 17,
    marginTop: -6,
  },

  anomalyCard: {},
  anomalyRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  anomalyHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 6,
  },
  anomalyDeviceText: {
    flex: 1,
    fontFamily: fonts.jalnan,
    fontSize: 14,
    color: colors.text,
  },
  anomalyStatusText: {
    flexShrink: 0,
    fontFamily: fonts.jalnan,
    fontSize: 12,
    color: colors.green,
  },
  anomalyBarTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.card,
    overflow: 'hidden',
  },
  anomalyBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  anomalyTimeText: {
    fontSize: 11,
    color: colors.textGray,
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
  sensorReadingText: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
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
  simulateButton: {
    alignItems: 'center',
    marginTop: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: colors.card,
  },
  simulateButtonActive: {
    backgroundColor: colors.red,
  },
  simulateButtonText: {
    fontFamily: fonts.jalnan,
    fontSize: 12,
    color: colors.textGray2,
  },
  simulateButtonTextActive: {
    color: colors.white,
  },
  emptyHint: {
    fontSize: 13,
    color: colors.textGray,
  },

  logCard: {},
  logRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  logTime: {
    fontFamily: fonts.jalnan,
    fontSize: 11,
    color: colors.textGray,
    marginBottom: 2,
  },
  logMessage: {
    fontSize: 13,
    color: colors.text,
    lineHeight: 18,
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
