// 신규 화면 - 취침 모드 관리 (명세서 6번 항목 "화면 3: 취침 모드 관리").
// 구조: 취침 감지 조건 카드(취침 시작 시각/확인 대기 시간) / 취침 모드 기기 설정 카드(조명/에어컨/
//      가습기/TV/PC) / 안내 문구 / 하단 네비(홈)
// SleepContext.setPreset이 낙관적으로 로컬 값을 갱신한 뒤 백엔드(sleep_preset)에도 저장한다.
import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import AnimatedPressable from '../components/AnimatedPressable';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts } from '../theme/colors';
import Card from '../components/Card';
import BottomNav from '../components/BottomNav';
import { useSleep } from '../context/SleepContext';

const SCREEN_PADDING = 20;

function ToggleRow({
  label,
  value,
  onToggle,
}: {
  label: string;
  value: boolean;
  onToggle: (next: boolean) => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <AnimatedPressable
        style={[styles.toggleChip, value && styles.toggleChipOn]}
        onPress={() => onToggle(!value)}
        activeOpacity={0.7}
      >
        <Text style={[styles.toggleChipText, value && styles.toggleChipTextOn]}>{value ? 'ON' : 'OFF'}</Text>
      </AnimatedPressable>
    </View>
  );
}

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

export default function SleepModeScreen() {
  const { preset, setPreset } = useSleep();

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
              <ToggleRow label="조명" value={preset.light_on} onToggle={(v) => setPreset({ light_on: v })} />
              <ToggleRow label="에어컨" value={preset.aircon_on} onToggle={(v) => setPreset({ aircon_on: v })} />
              {preset.aircon_on && (
                <>
                  <StepperRow
                    label="에어컨 온도"
                    value={preset.aircon_temp}
                    unit="°C"
                    step={1}
                    min={18}
                    max={28}
                    onChange={(v) => setPreset({ aircon_temp: v })}
                  />
                  <ToggleRow label="제습 모드" value={preset.dehumidify} onToggle={(v) => setPreset({ dehumidify: v })} />
                </>
              )}
              <ToggleRow label="가습기" value={preset.humidifier_on} onToggle={(v) => setPreset({ humidifier_on: v })} />
              <ToggleRow label="TV 자동 OFF" value={preset.tv_off} onToggle={(v) => setPreset({ tv_off: v })} />
              <ToggleRow label="컴퓨터 자동 OFF" value={preset.pc_off} onToggle={(v) => setPreset({ pc_off: v })} />
            </Card>

            <Text style={styles.disclaimer}>
              에어컨 온도/제습은 아직 릴레이 on-off 제어만 가능한 하드웨어라 값 자체는 기록만 되고, 실제
              전원 on-off에만 반영돼요.
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
