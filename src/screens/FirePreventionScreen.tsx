// 신규 화면 - 화재 예방 시스템 (방별 화재 감지 센서 대시보드 + AI 이상 패턴 감지 + 자동 대응).
// 구조: 긴급 경보 카드(있을 때만) / 전체 요약 카드 / AI 이상 패턴 감지 현황 / 방별 상태 카드
//      / 자동 대응 기록 / 하단 네비(홈)
//
// 위험도(안전/주의/위험)는 두 갈래를 합쳐서 판단한다.
// 1) 기기 사용 패턴: DemoRoomsContext의 시뮬레이션 방·기기 on/off 상태 기준("화재가 자주 발생하는
//    원인"에 나온 기기가 켜져 있으면 위험, 고전력 기기 동시 사용은 주의) + 종류별 정상 지속시간
//    (fireRisk.ts)보다 오래 켜져 있으면 "AI 이상 패턴 감지".
// 2) 온도/습도 센서: SensorContext가 내놓는 값 기준(고온이면 위험). 아직 실제 센서가 연결되지 않아
//    지금은 더미 값으로 채워지고 있고, 방 카드의 "화재 상황 시뮬레이션" 버튼으로 위험 범위 값을 직접
//    만들어 감지 흐름을 확인해볼 수 있다. 나중에 실제 센서가 붙으면 SensorContext 내부만 교체하면
//    되고, 이 화면과 판정 로직은 그대로 쓸 수 있다.
// 위 둘 중 하나라도 위험이 감지되면(고위험 기기 이상 패턴, 또는 고온 센서) 전원을 자동 차단하고
// 알림을 보내며, 이 화면에 119 신고 안내가 뜬다. 실제로 전화를 자동으로 걸 수는 없어서(운영체제가
// 막음), "119 신고" 버튼은 전화 앱을 119가 입력된 채로 열어줄 뿐 - 실제 발신은 사용자가 통화 버튼을
// 눌러야 이뤄진다.
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts } from '../theme/colors';
import Card from '../components/Card';
import BottomNav from '../components/BottomNav';
import { useDemoRooms, Room, Device } from '../context/DemoRoomsContext';
import { useFireSafety } from '../context/FireSafetyContext';
import { useSensors } from '../context/SensorContext';
import { estimateWattage } from '../utils/energy';
import {
  getNormalDurationMs,
  isHighRiskDevice,
  HIGH_RISK_KEYWORDS,
  sensorRiskLevel,
  RoomSensorReading,
  SENSOR_CAUTION_TEMP_C,
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

// 센서 값만 근거로 한 위험도 + 이유 문구.
function getSensorRisk(sensor: RoomSensorReading | undefined): { level: RiskLevel; reason: string | null } {
  const level = sensorRiskLevel(sensor);
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
function getRoomRisk(room: Room, sensor: RoomSensorReading | undefined): { level: RiskLevel; reason: string | null } {
  const deviceRisk = getDeviceRisk(room);
  const sensorRisk = getSensorRisk(sensor);
  return RISK_RANK[sensorRisk.level] >= RISK_RANK[deviceRisk.level] ? sensorRisk : deviceRisk;
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m > 0 ? `${m}분 ${s}초` : `${s}초`;
}

// 긴급 경보 카드 - 고위험 기기의 이상 패턴(장시간 방치)이 감지됐을 때만 뜬다.
// "119 신고"는 전화 앱을 119가 입력된 채로 열어줄 뿐이고, 실제 발신은 사용자가 통화 버튼을 눌러야 한다.
function EmergencyBanner({ reason, onDismiss }: { reason: string; onDismiss: () => void }) {
  const callEmergency = () => {
    Linking.openURL('tel:119');
  };

  return (
    <Card style={styles.emergencyCard}>
      <Text style={styles.emergencyTitle}>🚨 화재 위험 감지</Text>
      <Text style={styles.emergencyBody}>{reason}</Text>
      <TouchableOpacity style={styles.emergencyCallButton} onPress={callEmergency} activeOpacity={0.7}>
        <Text style={styles.emergencyCallButtonText}>📞 119 신고하기</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.emergencyDismissButton} onPress={onDismiss} activeOpacity={0.7}>
        <Text style={styles.emergencyDismissButtonText}>괜찮아요, 확인했어요</Text>
      </TouchableOpacity>
    </Card>
  );
}

// "AI 이상 패턴 감지" 한 줄 - 켜져 있는 기기 하나의 경과 시간 / 정상 지속시간을 보여준다.
function AnomalyRow({ room, device, now }: { room: string; device: Device; now: number }) {
  const normalMs = getNormalDurationMs(device.name);
  const elapsedMs = device.onSince != null ? now - device.onSince : 0;
  const isInfinite = !Number.isFinite(normalMs);
  const ratio = isInfinite ? 0 : Math.min(1, elapsedMs / normalMs);
  const isAnomalous = !isInfinite && elapsedMs > normalMs;

  return (
    <View style={styles.anomalyRow}>
      <View style={styles.anomalyHeaderRow}>
        <Text style={styles.anomalyDeviceText}>
          {room} · {device.name}
        </Text>
        <Text style={[styles.anomalyStatusText, isAnomalous && styles.anomalyStatusTextAlert]}>
          {isAnomalous ? '이상 패턴' : '정상'}
        </Text>
      </View>
      <View style={styles.anomalyBarTrack}>
        <View
          style={[
            styles.anomalyBarFill,
            { width: `${ratio * 100}%`, backgroundColor: isAnomalous ? colors.red : colors.green },
          ]}
        />
      </View>
      <Text style={styles.anomalyTimeText}>
        {isInfinite
          ? `계속 켜져 있어도 정상인 기기예요 (경과 ${formatDuration(elapsedMs)})`
          : `경과 ${formatDuration(elapsedMs)} / 정상 기준 ${formatDuration(normalMs)}`}
      </Text>
    </View>
  );
}

function RoomRiskCard({
  room,
  sensor,
  isSimulating,
  onToggleSimulate,
}: {
  room: Room;
  sensor: RoomSensorReading | undefined;
  isSimulating: boolean;
  onToggleSimulate: () => void;
}) {
  const { level, reason } = getRoomRisk(room, sensor);
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

      <TouchableOpacity
        style={[styles.simulateButton, isSimulating && styles.simulateButtonActive]}
        onPress={onToggleSimulate}
        activeOpacity={0.7}
      >
        <Text style={[styles.simulateButtonText, isSimulating && styles.simulateButtonTextActive]}>
          {isSimulating ? '화재 상황 시뮬레이션 해제' : '화재 상황 시뮬레이션 (테스트)'}
        </Text>
      </TouchableOpacity>
    </Card>
  );
}

export default function FirePreventionScreen() {
  const { rooms } = useDemoRooms();
  const { autoActions, emergency, dismissEmergency } = useFireSafety();
  const { readings, isSimulatingFire, simulateFire, clearSimulation } = useSensors();
  const [now, setNow] = useState(() => Date.now());

  // 경과 시간 표시를 1초마다 갱신한다(실제 감시/자동 차단은 FireSafetyContext가 화면과 무관하게 처리).
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const risks = rooms.map((room) => ({ room, risk: getRoomRisk(room, readings[room.id]) }));
  const dangerCount = risks.filter((r) => r.risk.level === 'danger').length;
  const cautionCount = risks.filter((r) => r.risk.level === 'caution').length;

  const summary =
    dangerCount > 0
      ? { text: `${dangerCount}개 방 위험 감지`, color: colors.red }
      : cautionCount > 0
      ? { text: `${cautionCount}개 방 주의 필요`, color: colors.yellow }
      : { text: '모든 방 안전', color: colors.green };

  const onDevicesWithRoom = rooms.flatMap((room) => room.devices.filter((d) => d.on).map((d) => ({ room, d })));

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.headerIcon}>🔥</Text>
        <Text style={styles.headerTitle}>화재 예방 시스템</Text>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner} showsVerticalScrollIndicator={false}>
        {emergency && <EmergencyBanner reason={emergency.reason} onDismiss={dismissEmergency} />}

        <Card style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>전체 상태</Text>
          <View style={[styles.summaryBadge, { backgroundColor: summary.color }]}>
            <Text style={styles.summaryBadgeText}>{summary.text}</Text>
          </View>
        </Card>

        <Text style={styles.sectionTitle}>🤖 AI 이상 패턴 감지</Text>
        <Text style={styles.sectionHint}>
          기기 종류별 평소 사용 패턴을 기준으로, 정상 범위보다 오래 켜져 있으면 이상 패턴으로 보고
          전원을 자동 차단해요. ({HIGH_RISK_KEYWORDS.join(' · ')}은 고위험 기기로 분류돼요.)
        </Text>
        <Card style={styles.anomalyCard}>
          {onDevicesWithRoom.length > 0 ? (
            onDevicesWithRoom.map(({ room, d }) => (
              <AnomalyRow key={`${room.id}-${d.name}`} room={room.label} device={d} now={now} />
            ))
          ) : (
            <Text style={styles.emptyHint}>지금 켜져 있는 기기가 없어요.</Text>
          )}
        </Card>

        <Text style={styles.sectionTitle}>방별 화재 감지 센서</Text>
        <Text style={styles.sectionHint}>
          방마다 온도·습도 센서 값을 보여줘요. 아직 실제 센서가 연결되지 않아 지금은 더미 값으로
          채워지고 있고, 실제 센서가 연동되면 이 값이 그대로 실제 값으로 바뀌어요.
        </Text>
        {rooms.length > 0 ? (
          rooms.map((room) => (
            <RoomRiskCard
              key={room.id}
              room={room}
              sensor={readings[room.id]}
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
    marginBottom: 14,
  },
  emergencyCallButton: {
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: colors.white,
    marginBottom: 8,
  },
  emergencyCallButtonText: {
    fontFamily: fonts.jalnan,
    fontSize: 15,
    color: colors.red,
  },
  emergencyDismissButton: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  emergencyDismissButtonText: {
    fontFamily: fonts.jalnan,
    fontSize: 13,
    color: colors.white,
    textDecorationLine: 'underline',
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
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  anomalyDeviceText: {
    fontFamily: fonts.jalnan,
    fontSize: 14,
    color: colors.text,
  },
  anomalyStatusText: {
    fontFamily: fonts.jalnan,
    fontSize: 12,
    color: colors.green,
  },
  anomalyStatusTextAlert: {
    color: colors.red,
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
