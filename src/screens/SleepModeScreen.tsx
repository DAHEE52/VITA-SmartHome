// 신규 화면 - 취침 모드 관리 (명세서 6번 항목 "화면 3: 취침 모드 관리").
// 구조: 취침 감지 조건 카드(취침 시작 시각/확인 대기 시간) / 취침 모드로 전환될 기기 설정 카드
//      (스마트홈 제어에 실제로 등록된 기기 중 직접 골라서 켜질지/꺼질지 지정) / 안내 문구 / 하단 네비(홈)
// SleepContext.setPreset이 낙관적으로 로컬 값을 갱신한 뒤 백엔드(sleep_preset)에도 저장한다.
//
// 기기 설정은 예전엔 "조명/에어컨/가습기/TV/PC"처럼 고정된 기기 종류를 전제로 한 토글 목록이었다.
// 하지만 원룸마다 실제로 등록한 기기 이름과 종류가 다 다르므로(예: "히터"만 있고 "가습기"는 없는
// 집도 있음), 그 가정을 버리고 SmartHomeControl에 이미 등록된 실제 기기 목록에서 사용자가 직접
// "취침 모드에 포함할지"와 "포함한다면 켤지/끌지"를 고르는 방식으로 바꿨다.
import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import AnimatedPressable from '../components/AnimatedPressable';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts } from '../theme/colors';
import Card from '../components/Card';
import BottomNav from '../components/BottomNav';
import { useSleep } from '../context/SleepContext';
import { useRooms } from '../context/RoomsContext';
import { SleepDeviceConfig } from '../api/client';

const SCREEN_PADDING = 20;

function StepperRow({
  label,
  value,
  unit,
  step,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  unit: string;
  step: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
}) {
  return (
    <View style={styles.stepperRow}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <View style={styles.stepperControl}>
        <AnimatedPressable
          style={styles.stepperButton}
          onPress={() => onChange(Math.max(min, value - step))}
          activeOpacity={0.7}
        >
          <Text style={styles.stepperButtonText}>-</Text>
        </AnimatedPressable>
        <Text style={styles.stepperValue}>
          {value}
          {unit}
        </Text>
        <AnimatedPressable
          style={styles.stepperButton}
          onPress={() => onChange(Math.min(max, value + step))}
          activeOpacity={0.7}
        >
          <Text style={styles.stepperButtonText}>+</Text>
        </AnimatedPressable>
      </View>
    </View>
  );
}

// 기기 하나의 취침 모드 포함 여부 + (포함됐다면) 목표 상태(ON/OFF)를 고르는 행.
function DeviceSleepRow({
  name,
  config,
  onToggleIncluded,
  onSetOn,
}: {
  name: string;
  config: SleepDeviceConfig | undefined;
  onToggleIncluded: () => void;
  onSetOn: (on: boolean) => void;
}) {
  const included = config != null;
  return (
    <View style={styles.deviceRow}>
      <View style={styles.toggleRow}>
        <Text style={styles.toggleLabel}>{name}</Text>
        <AnimatedPressable
          style={[styles.toggleChip, included && styles.toggleChipOn]}
          onPress={onToggleIncluded}
          activeOpacity={0.7}
        >
          <Text style={[styles.toggleChipText, included && styles.toggleChipTextOn]}>
            {included ? '포함됨' : '포함 안 함'}
          </Text>
        </AnimatedPressable>
      </View>
      {included && (
        <View style={styles.targetRow}>
          <Text style={styles.targetLabel}>취침 중 상태</Text>
          <View style={styles.targetSegment}>
            <AnimatedPressable
              style={[styles.targetOption, !config!.on && styles.targetOptionSelected]}
              onPress={() => onSetOn(false)}
              activeOpacity={0.7}
            >
              <Text style={[styles.targetOptionText, !config!.on && styles.targetOptionTextSelected]}>OFF</Text>
            </AnimatedPressable>
            <AnimatedPressable
              style={[styles.targetOption, config!.on && styles.targetOptionSelected]}
              onPress={() => onSetOn(true)}
              activeOpacity={0.7}
            >
              <Text style={[styles.targetOptionText, config!.on && styles.targetOptionTextSelected]}>ON</Text>
            </AnimatedPressable>
          </View>
        </View>
      )}
    </View>
  );
}

export default function SleepModeScreen() {
  const { preset, setPreset } = useSleep();
  const { rooms } = useRooms();
  const allDevices = rooms.flatMap((r) => r.devices);

  const toggleIncluded = (deviceId: string) => {
    if (!preset) return;
    const isIncluded = preset.devices.some((d) => d.device_id === deviceId);
    const nextDevices = isIncluded
      ? preset.devices.filter((d) => d.device_id !== deviceId)
      : [...preset.devices, { device_id: deviceId, on: false }];
    setPreset({ devices: nextDevices });
  };

  const setDeviceOn = (deviceId: string, on: boolean) => {
    if (!preset) return;
    setPreset({ devices: preset.devices.map((d) => (d.device_id === deviceId ? { ...d, on } : d)) });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.headerIcon}>🛏</Text>
        <Text style={styles.headerTitle}>취침 모드 관리</Text>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner} showsVerticalScrollIndicator={false}>
        {!preset ? (
          <Text style={styles.emptyHint}>설정을 불러오는 중이에요...</Text>
        ) : (
          <>
            <Card style={styles.card}>
              <Text style={styles.cardTitle}>⏱ 취침 감지 조건</Text>
              <Text style={styles.cardSubtitle}>
                재실 중 + 조명 OFF + 아래 시각 이후, 설정한 시간 동안 움직임이 없으면 취침 확인 알림을 보내요.
              </Text>
              <StepperRow
                label="취침 감지 시작 시각"
                value={preset.bedtime_hour}
                unit="시"
                step={1}
                min={18}
                max={23}
                onChange={(v) => setPreset({ bedtime_hour: v })}
              />
              <StepperRow
                label="무움직임 감지 시간"
                value={preset.no_motion_minutes}
                unit="분"
                step={5}
                min={5}
                max={60}
                onChange={(v) => setPreset({ no_motion_minutes: v })}
              />
              <StepperRow
                label="확인 알림 대기 시간"
                value={preset.confirm_wait_minutes}
                unit="분"
                step={1}
                min={1}
                max={15}
                onChange={(v) => setPreset({ confirm_wait_minutes: v })}
              />
            </Card>

            <Card style={styles.card}>
              <Text style={styles.cardTitle}>🌙 취침 모드로 전환될 기기 설정</Text>
              <Text style={styles.cardSubtitle}>
                스마트홈 제어에 등록한 기기 중 취침 모드에 포함할 기기를 직접 고르고, 취침 중에는 켜질지
                꺼질지 정해요. 기상하면 반대 상태로 자동 복원돼요.
              </Text>
              {allDevices.length === 0 ? (
                <Text style={styles.emptyHint}>
                  등록된 기기가 없어요. 스마트홈 제어 화면에서 먼저 기기를 추가해 주세요.
                </Text>
              ) : (
                allDevices.map((device) => (
                  <DeviceSleepRow
                    key={device.id}
                    name={device.name}
                    config={preset.devices.find((d) => d.device_id === device.id)}
                    onToggleIncluded={() => toggleIncluded(device.id)}
                    onSetOn={(on) => setDeviceOn(device.id, on)}
                  />
                ))
              )}
            </Card>

            <Text style={styles.disclaimer}>
              에어컨 등 온도 조절 기기는 아직 릴레이 on-off 제어만 가능한 하드웨어라, 실제로는 전원
              on-off에만 반영돼요.
            </Text>
          </>
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
  cardTitle: { fontFamily: fonts.jalnan, fontSize: 15, color: colors.text, marginBottom: 4 },
  cardSubtitle: { fontSize: 12, color: colors.textGray, marginBottom: 10, lineHeight: 17 },

  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  toggleLabel: { fontFamily: fonts.jalnan, fontSize: 14, color: colors.text },
  toggleChip: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggleChipOn: { backgroundColor: colors.orange, borderColor: colors.orange },
  toggleChipText: { fontFamily: fonts.jalnan, fontSize: 12, color: colors.textGray2 },
  toggleChipTextOn: { color: colors.white },

  deviceRow: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  // 기기가 취침 모드에 포함됐을 때만 아래 나타나는 ON/OFF 목표 상태 행 - deviceRow가 이미 위쪽
  // 구분선을 갖고 있으므로 이 행은 구분선 없이 바로 이어 붙는다.
  targetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
  },
  targetLabel: { fontSize: 12, color: colors.textGray },
  targetSegment: {
    flexDirection: 'row',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  targetOption: {
    paddingVertical: 5,
    paddingHorizontal: 14,
    backgroundColor: colors.white,
  },
  targetOptionSelected: { backgroundColor: colors.orange },
  targetOptionText: { fontFamily: fonts.jalnan, fontSize: 12, color: colors.textGray2 },
  targetOptionTextSelected: { color: colors.white },

  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  stepperControl: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepperButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonText: { fontFamily: fonts.jalnan, fontSize: 16, color: colors.text },
  stepperValue: { fontFamily: fonts.jalnan, fontSize: 14, color: colors.text, minWidth: 46, textAlign: 'center' },

  emptyHint: { fontSize: 13, color: colors.textGray, textAlign: 'center', marginTop: 20 },
  disclaimer: { fontSize: 11, color: colors.textGray, textAlign: 'center', lineHeight: 16 },

  bottomNavWrap: { paddingHorizontal: 20, paddingBottom: 10, paddingTop: 6 },
});
