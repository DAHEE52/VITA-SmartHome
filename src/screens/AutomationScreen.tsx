// 신규 화면 - 자동화 규칙.
// 구조: 헤더 / "🛏 취침 모드" 버튼(취침 감지 조건 + 기기 설정을 여기서 직접 관리 - 예전 별도
//      화면이던 SleepModeScreen을 통째로 흡수) / 등록된 규칙 카드 목록(없으면 안내문) /
//      "+" 규칙 추가 버튼 / 하단 네비(홈)
//
// 캘린더에 등록한 "외출·외박 일정"(SPECIAL 일정 중 kind='outing'|'overnight' 전체, 자동화 트리거
// 관점에서는 구분하지 않는다) 또는 "요일별 루틴"(DAILY 일정), 취침 모드를 트리거로 골라, 지정한
// 콘센트를 켜고 끄는 규칙을 사용자가 직접 만든다.
// 실제 발동/실행은 화면과 무관하게 AutomationContext/SleepContext가 계속 감시한다.
import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, TextInput, ScrollView, Switch } from 'react-native';
import AnimatedPressable from '../components/AnimatedPressable';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts } from '../theme/colors';
import Card from '../components/Card';
import BottomNav from '../components/BottomNav';
import { PlusIcon, AutomationIcon } from '../components/icons';
import { useCalendar, ScheduleItem } from '../context/CalendarContext';
import { useRooms, Room, Device } from '../context/RoomsContext';
import { useSleep } from '../context/SleepContext';
import { SleepDeviceConfig } from '../api/client';
import {
  useAutomation,
  AutomationRule,
  AutomationTrigger,
  AutomationAction,
  describeTrigger,
  LIGHT_DEVICE_ID,
} from '../context/AutomationContext';

const SCREEN_PADDING = 20;
const WEEKDAY_SHORT = ['일', '월', '화', '수', '목', '금', '토'];
const MIN_BRIGHTNESS = 0;
const MAX_BRIGHTNESS = 100;

function summarizeWeekdays(weekdays?: number[]): string {
  if (!weekdays || weekdays.length === 0 || weekdays.length >= 7) return '매일';
  return [...weekdays].sort((a, b) => a - b).map((d) => WEEKDAY_SHORT[d]).join('·');
}

// 액션이 가리키는 기기 이름들을 방 안에서 찾아 "콘센트A, 콘센트B 켜기"처럼 요약한다.
// 이미 삭제된 기기 id가 남아있을 수 있으므로, 못 찾은 건 조용히 건너뛴다.
function describeAction(action: AutomationAction, room: Room | undefined): string {
  const names = (room?.devices ?? [])
    .filter((d) => action.deviceIds.includes(d.id))
    .map((d) => d.name);
  if (action.deviceIds.includes(LIGHT_DEVICE_ID)) {
    names.push(action.on && action.brightness != null ? `조명(밝기 ${action.brightness}%)` : '조명');
  }
  const verb = action.on ? '켜기' : '끄기';
  if (names.length === 0) return `(선택된 기기 없음) · ${verb}`;
  return `${names.join(', ')} · ${verb}`;
}

function describeExecuteTime(executeTime: string): string {
  return `${executeTime} 실행`;
}

// "HH:MM" 형식인지만 확인한다(AutomationContext의 parseHHMM과 동일한 규칙).
function isValidHHMM(time: string): boolean {
  const match = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return false;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

// 아래 SleepStepperRow/SleepDeviceRow/SleepPresetModal은 예전 SleepModeScreen.tsx를 그대로
// 옮겨온 것 - "취침 모드" 기능을 별도 화면 대신 이 화면의 전용 버튼(모달)으로 흡수했다.
function SleepStepperRow({
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
    <View style={styles.sleepStepperRow}>
      <Text style={styles.sleepToggleLabel} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.sleepStepperControl}>
        <AnimatedPressable
          style={styles.sleepStepperButton}
          onPress={() => onChange(Math.max(min, value - step))}
          activeOpacity={0.7}
        >
          <Text style={styles.sleepStepperButtonText}>-</Text>
        </AnimatedPressable>
        <Text style={styles.sleepStepperValue}>
          {value}
          {unit}
        </Text>
        <AnimatedPressable
          style={styles.sleepStepperButton}
          onPress={() => onChange(Math.min(max, value + step))}
          activeOpacity={0.7}
        >
          <Text style={styles.sleepStepperButtonText}>+</Text>
        </AnimatedPressable>
      </View>
    </View>
  );
}

// 기기 하나의 취침 모드 포함 여부 + (포함됐다면) 목표 상태(ON/OFF)를 고르는 행.
function SleepDeviceRow({
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
    <View style={styles.sleepDeviceRow}>
      <View style={styles.sleepToggleRow}>
        <Text style={styles.sleepToggleLabel} numberOfLines={1}>
          {name}
        </Text>
        <AnimatedPressable
          style={[styles.sleepToggleChip, included && styles.sleepToggleChipOn]}
          onPress={onToggleIncluded}
          activeOpacity={0.7}
        >
          <Text style={[styles.sleepToggleChipText, included && styles.sleepToggleChipTextOn]}>
            {included ? '포함됨' : '포함 안 함'}
          </Text>
        </AnimatedPressable>
      </View>
      {included && (
        <View style={styles.sleepTargetRow}>
          <Text style={styles.sleepTargetLabel}>취침 중 상태</Text>
          <View style={styles.sleepTargetSegment}>
            <AnimatedPressable
              style={[styles.sleepTargetOption, !config!.on && styles.sleepTargetOptionSelected]}
              onPress={() => onSetOn(false)}
              activeOpacity={0.7}
            >
              <Text style={[styles.sleepTargetOptionText, !config!.on && styles.sleepTargetOptionTextSelected]}>
                OFF
              </Text>
            </AnimatedPressable>
            <AnimatedPressable
              style={[styles.sleepTargetOption, config!.on && styles.sleepTargetOptionSelected]}
              onPress={() => onSetOn(true)}
              activeOpacity={0.7}
            >
              <Text style={[styles.sleepTargetOptionText, config!.on && styles.sleepTargetOptionTextSelected]}>
                ON
              </Text>
            </AnimatedPressable>
          </View>
        </View>
      )}
    </View>
  );
}

// "🛏 취침 모드" 버튼을 누르면 뜨는 모달 - 취침 감지 조건(시작 시각/무움직임 시간)과 취침 모드로
// 전환될 기기를 설정한다. 규칙(AutomationRule)과 달리 "저장" 버튼 없이 조작 즉시 반영된다
// (예전 SleepModeScreen과 동일한 동작 - useSleep().setPreset이 매번 바로 서버에 저장함).
function SleepPresetModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
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
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={() => {}}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.modalTitle}>🛏 취침 모드</Text>

            {!preset ? (
              <Text style={styles.hintText}>설정을 불러오는 중이에요...</Text>
            ) : (
              <>
                <Text style={styles.fieldLabel}>⏱ 취침 감지 조건</Text>
                <Text style={styles.hintText}>
                  재실 중 + 조명 OFF + 아래 시각 이후, 설정한 시간 동안 움직임이 없으면 취침 확인 알림을
                  보내요.
                </Text>
                <SleepStepperRow
                  label="취침 감지 시작 시각"
                  value={preset.bedtime_hour}
                  unit="시"
                  step={1}
                  min={18}
                  max={23}
                  onChange={(v) => setPreset({ bedtime_hour: v })}
                />
                <SleepStepperRow
                  label="무움직임 감지 시간"
                  value={preset.no_motion_minutes}
                  unit="분"
                  step={5}
                  min={5}
                  max={60}
                  onChange={(v) => setPreset({ no_motion_minutes: v })}
                />

                <Text style={[styles.fieldLabel, { marginTop: 18 }]}>🌙 취침 모드로 전환될 기기 설정</Text>
                <Text style={styles.hintText}>
                  취침 모드에 포함할 기기를 직접 고르고, 취침 중에는 켜질지 꺼질지 정해요. 기상하면 반대
                  상태로 자동 복원돼요.
                </Text>
                {allDevices.length === 0 ? (
                  <Text style={styles.hintText}>
                    등록된 기기가 없어요. 스마트홈 제어 화면에서 먼저 기기를 추가해 주세요.
                  </Text>
                ) : (
                  allDevices.map((device) => (
                    <SleepDeviceRow
                      key={device.id}
                      name={device.name}
                      config={preset.devices.find((d) => d.device_id === device.id)}
                      onToggleIncluded={() => toggleIncluded(device.id)}
                      onSetOn={(on) => setDeviceOn(device.id, on)}
                    />
                  ))
                )}
              </>
            )}

            <AnimatedPressable
              style={[styles.modalCloseButton, styles.modalCloseButtonSolo]}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Text style={styles.modalCloseText}>닫기</Text>
            </AnimatedPressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

type TriggerKind = 'away' | 'routine' | 'sleep';

const TRIGGER_OPTIONS: { value: TriggerKind; label: string }[] = [
  { value: 'away', label: '외출·외박 일정' },
  { value: 'routine', label: '요일별 루틴' },
  { value: 'sleep', label: '취침 모드' },
];

const POWER_OPTIONS: { value: boolean; label: string }[] = [
  { value: true, label: '켜기' },
  { value: false, label: '끄기' },
];

// 규칙 하나를 요약해서 보여주는 카드. 탭하면 수정 모달이 열리고, 우측 스위치로 바로 켜고 끌 수 있다.
function RuleCard({
  rule,
  room,
  dailyItems,
  onToggle,
  onPress,
}: {
  rule: AutomationRule;
  room: Room | undefined;
  dailyItems: ScheduleItem[];
  onToggle: () => void;
  onPress: () => void;
}) {
  const trigger = rule.trigger;
  const triggerText = describeTrigger(trigger, dailyItems);
  const routineWeekdayText =
    trigger.kind === 'routine'
      ? summarizeWeekdays(dailyItems.find((it) => it.id === trigger.routineId)?.weekdays)
      : null;

  return (
    <AnimatedPressable activeOpacity={0.85} onPress={onPress}>
      <Card style={styles.ruleCard}>
        <View style={styles.ruleHeaderRow}>
          <Text style={styles.ruleTrigger} numberOfLines={1}>
            {triggerText}
            {routineWeekdayText ? ` · ${routineWeekdayText}` : ''}
          </Text>
          <Switch
            value={rule.enabled}
            onValueChange={onToggle}
            trackColor={{ false: colors.card, true: colors.orange }}
            thumbColor={colors.white}
          />
        </View>
        <Text style={styles.ruleOffset}>
          {trigger.kind === 'sleep' ? '취침 모드가 시작될 때 실행' : describeExecuteTime(rule.executeTime)}
        </Text>
        <Text style={styles.ruleAction} numberOfLines={1}>
          {describeAction(rule.action, room)}
        </Text>
      </Card>
    </AnimatedPressable>
  );
}

type SavedRuleInput = {
  trigger: AutomationTrigger;
  executeTime: string;
  roomId: string;
  action: AutomationAction;
};

// "+" 버튼 또는 규칙 카드를 눌렀을 때 뜨는 추가/수정 폼. initial이 있으면 수정(삭제 버튼도 함께 노출).
function RuleEditModal({
  visible,
  initial,
  rooms,
  dailyItems,
  onClose,
  onSave,
  onDelete,
}: {
  visible: boolean;
  initial: AutomationRule | null;
  rooms: Room[];
  dailyItems: ScheduleItem[];
  onClose: () => void;
  onSave: (input: SavedRuleInput) => void;
  onDelete?: () => void;
}) {
  const [triggerKind, setTriggerKind] = useState<TriggerKind>('away');
  const [routineId, setRoutineId] = useState<string | null>(null);
  const [executeTimeText, setExecuteTimeText] = useState('07:00');
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);
  const [powerOn, setPowerOn] = useState(true);
  const [brightnessText, setBrightnessText] = useState('80');

  // VITA는 원룸 전용이라 방 선택 UI 없이 항상 유일한 방(rooms[0])에 적용한다.
  const roomId = rooms[0]?.id ?? null;
  const devices: Device[] = rooms[0]?.devices ?? [];

  React.useEffect(() => {
    if (!visible) return;
    if (initial) {
      setTriggerKind(initial.trigger.kind);
      setRoutineId(initial.trigger.kind === 'routine' ? initial.trigger.routineId : null);
      setExecuteTimeText(initial.executeTime);
      setSelectedDeviceIds(initial.action.deviceIds);
      setPowerOn(initial.action.on);
      setBrightnessText(initial.action.brightness != null ? String(initial.action.brightness) : '80');
    } else {
      setTriggerKind('away');
      setRoutineId(dailyItems[0]?.id ?? null);
      setExecuteTimeText('07:00');
      setSelectedDeviceIds([]);
      setPowerOn(true);
      setBrightnessText('80');
    }
  }, [visible, initial]);

  // 취침 모드는 "시각"이 아니라 "잠들었다고 판단되는 순간"에 반응하는 트리거라 시각 입력이 필요 없고,
  // 액션도 "조명 끄기"로 고정이라 기기/전원 선택 UI 자체가 필요 없다(아래 isDeviceSelectable 참고).
  const isTimeless = triggerKind === 'sleep';
  const isDeviceSelectable = triggerKind !== 'sleep';
  // 조명이 선택되고 "켜기"일 때만 밝기가 의미 있다 - 콘센트는 on/off만 지원하고, 끌 때는 밝기가 무의미하다.
  const isBrightnessRelevant = isDeviceSelectable && selectedDeviceIds.includes(LIGHT_DEVICE_ID) && powerOn;
  const brightnessValid =
    !isBrightnessRelevant ||
    (brightnessText.trim() !== '' && Number(brightnessText) >= MIN_BRIGHTNESS && Number(brightnessText) <= MAX_BRIGHTNESS);

  const canSave =
    !!roomId &&
    (triggerKind !== 'routine' || !!routineId) &&
    (isTimeless || isValidHHMM(executeTimeText)) &&
    (!isDeviceSelectable || selectedDeviceIds.length > 0) &&
    brightnessValid;

  const toggleDevice = (deviceId: string) => {
    setSelectedDeviceIds((prev) =>
      prev.includes(deviceId) ? prev.filter((id) => id !== deviceId) : [...prev, deviceId]
    );
  };

  const handleSave = () => {
    if (canSave && roomId) {
      const trigger: AutomationTrigger =
        triggerKind === 'routine'
          ? { kind: 'routine', routineId: routineId! }
          : { kind: triggerKind };
      // 취침 모드는 "조명 끄기"로 고정 - 사용자가 고른 기기/전원 상태를 쓰지 않는다.
      const action: AutomationAction = !isDeviceSelectable
        ? { kind: 'set_power', deviceIds: [LIGHT_DEVICE_ID], on: false }
        : {
            kind: 'set_power',
            deviceIds: selectedDeviceIds,
            on: powerOn,
            ...(isBrightnessRelevant ? { brightness: Number(brightnessText) } : {}),
          };
      onSave({ trigger, executeTime: isTimeless ? '00:00' : executeTimeText, roomId, action });
    }
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={() => {}}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.modalTitle}>{initial ? '자동화 규칙 수정' : '자동화 규칙 추가'}</Text>

            <Text style={styles.fieldLabel}>어떤 상황에 실행할까요</Text>
            <View style={styles.chipRow}>
              {TRIGGER_OPTIONS.map((opt) => (
                <AnimatedPressable
                  key={opt.value}
                  style={[styles.chip, triggerKind === opt.value && styles.chipSelected]}
                  onPress={() => setTriggerKind(opt.value)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.chipText, triggerKind === opt.value && styles.chipTextSelected]}>
                    {opt.label}
                  </Text>
                </AnimatedPressable>
              ))}
            </View>

            {triggerKind === 'routine' &&
              (dailyItems.length === 0 ? (
                <Text style={styles.hintText}>캘린더에서 먼저 루틴(DAILY 일정)을 추가해 주세요.</Text>
              ) : (
                <View style={styles.chipRowWrap}>
                  {dailyItems.map((item) => (
                    <AnimatedPressable
                      key={item.id}
                      style={[styles.chip, routineId === item.id && styles.chipSelected]}
                      onPress={() => setRoutineId(item.id)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[styles.chipText, routineId === item.id && styles.chipTextSelected]}
                        numberOfLines={1}
                      >
                        {(item.label || '(제목 없음)') + ' · ' + summarizeWeekdays(item.weekdays)}
                      </Text>
                    </AnimatedPressable>
                  ))}
                </View>
              ))}

            {!isTimeless && (
              <>
                <Text style={styles.fieldLabel}>언제 실행할까요</Text>
                <TextInput
                  style={styles.numberInput}
                  value={executeTimeText}
                  onChangeText={setExecuteTimeText}
                  placeholder="07:00"
                  placeholderTextColor={colors.textGray}
                  keyboardType="numbers-and-punctuation"
                />
                {!isValidHHMM(executeTimeText) && (
                  <Text style={styles.hintText}>"07:00"처럼 시:분 형식으로 입력해 주세요.</Text>
                )}
              </>
            )}

            {isDeviceSelectable ? (
              <>
                <Text style={styles.fieldLabel}>어떤 기기를 조작할까요</Text>
                <View style={styles.chipRowWrap}>
                  <AnimatedPressable
                    style={[styles.chip, selectedDeviceIds.includes(LIGHT_DEVICE_ID) && styles.chipSelected]}
                    onPress={() => toggleDevice(LIGHT_DEVICE_ID)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        selectedDeviceIds.includes(LIGHT_DEVICE_ID) && styles.chipTextSelected,
                      ]}
                    >
                      조명
                    </Text>
                  </AnimatedPressable>
                  {devices.map((d) => (
                    <AnimatedPressable
                      key={d.id}
                      style={[styles.chip, selectedDeviceIds.includes(d.id) && styles.chipSelected]}
                      onPress={() => toggleDevice(d.id)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[styles.chipText, selectedDeviceIds.includes(d.id) && styles.chipTextSelected]}
                        numberOfLines={1}
                      >
                        {d.name}
                      </Text>
                    </AnimatedPressable>
                  ))}
                </View>
                {devices.length === 0 && (
                  <Text style={styles.hintText}>등록된 스마트 콘센트가 없어요. 먼저 기기를 추가해 주세요.</Text>
                )}

                <Text style={styles.fieldLabel}>어떻게 할까요</Text>
                <View style={styles.chipRow}>
                  {POWER_OPTIONS.map((opt) => (
                    <AnimatedPressable
                      key={String(opt.value)}
                      style={[styles.chip, powerOn === opt.value && styles.chipSelected]}
                      onPress={() => setPowerOn(opt.value)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.chipText, powerOn === opt.value && styles.chipTextSelected]}>
                        {opt.label}
                      </Text>
                    </AnimatedPressable>
                  ))}
                </View>

                {isBrightnessRelevant && (
                  <>
                    <Text style={styles.fieldLabel}>조명 밝기 (0~100)</Text>
                    <TextInput
                      style={styles.numberInput}
                      value={brightnessText}
                      onChangeText={(v) => setBrightnessText(v.replace(/[^0-9]/g, ''))}
                      placeholder="80"
                      placeholderTextColor={colors.textGray}
                      keyboardType="number-pad"
                    />
                    {!brightnessValid && (
                      <Text style={styles.hintText}>0~100 사이의 숫자로 입력해 주세요.</Text>
                    )}
                  </>
                )}
              </>
            ) : (
              <Text style={styles.hintText}>취침 모드가 시작되면(잠들었다고 판단되면) 조명을 자동으로 꺼요.</Text>
            )}

            {onDelete && (
              <AnimatedPressable style={styles.deleteButton} onPress={onDelete} activeOpacity={0.7}>
                <Text style={styles.deleteButtonText}>규칙 삭제</Text>
              </AnimatedPressable>
            )}

            <View style={styles.modalBottomRow}>
              <AnimatedPressable style={styles.modalCloseButton} onPress={onClose} activeOpacity={0.7}>
                <Text style={styles.modalCloseText}>취소</Text>
              </AnimatedPressable>
              <AnimatedPressable style={styles.saveButton} onPress={handleSave} activeOpacity={0.7}>
                <Text style={styles.saveButtonText}>저장</Text>
              </AnimatedPressable>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function AutomationScreen() {
  const { rules, addRule, updateRule, deleteRule, toggleRuleEnabled } = useAutomation();
  const { dailyItems } = useCalendar();
  const { rooms } = useRooms();

  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [sleepModalOpen, setSleepModalOpen] = useState(false);

  const roomFor = (roomId: string) => rooms.find((r) => r.id === roomId);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <AutomationIcon size={24} />
        <Text style={styles.headerTitle}>자동화 규칙</Text>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentInner}
        showsVerticalScrollIndicator={false}
      >
        <AnimatedPressable activeOpacity={0.85} onPress={() => setSleepModalOpen(true)}>
          <Card style={styles.sleepButton}>
            <Text style={styles.sleepButtonIcon}>🛏</Text>
            <View style={styles.sleepButtonTextWrap}>
              <Text style={styles.sleepButtonTitle}>취침 모드</Text>
              <Text style={styles.sleepButtonSubtitle}>취침 감지 조건과 취침 중 기기 상태를 설정해요</Text>
            </View>
            <Text style={styles.sleepButtonChevron}>›</Text>
          </Card>
        </AnimatedPressable>

        {rules.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Text style={styles.emptyText}>
              아직 등록된 자동화 규칙이 없어요.{'\n'}외출·외박 일정·요일별 루틴이나 취침 모드에 맞춰
              지정한 콘센트를 자동으로 켜고 꺼 보세요.
            </Text>
          </Card>
        ) : (
          rules.map((rule) => (
            <RuleCard
              key={rule.id}
              rule={rule}
              room={roomFor(rule.roomId)}
              dailyItems={dailyItems}
              onToggle={() => toggleRuleEnabled(rule.id)}
              onPress={() => setEditingRule(rule)}
            />
          ))
        )}

        <View style={styles.addButtonWrap}>
          <AnimatedPressable
            style={styles.addCircle}
            activeOpacity={0.7}
            onPress={() => setIsAdding(true)}
            accessibilityLabel="자동화 규칙 추가"
          >
            <PlusIcon size={20} />
          </AnimatedPressable>
        </View>
      </ScrollView>

      <View style={styles.bottomNavWrap}>
        <BottomNav variant="sub" />
      </View>

      <RuleEditModal
        visible={isAdding}
        initial={null}
        rooms={rooms}
        dailyItems={dailyItems}
        onClose={() => setIsAdding(false)}
        onSave={(input) => addRule(input)}
      />
      <RuleEditModal
        visible={editingRule != null}
        initial={editingRule}
        rooms={rooms}
        dailyItems={dailyItems}
        onClose={() => setEditingRule(null)}
        onSave={(input) => editingRule && updateRule(editingRule.id, input)}
        onDelete={
          editingRule
            ? () => {
                deleteRule(editingRule.id);
                setEditingRule(null);
              }
            : undefined
        }
      />
      <SleepPresetModal visible={sleepModalOpen} onClose={() => setSleepModalOpen(false)} />
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
  headerTitle: {
    fontFamily: fonts.jalnan,
    fontSize: 20,
    color: colors.text,
  },
  content: {
    flex: 1,
    paddingHorizontal: SCREEN_PADDING,
  },
  contentInner: {
    paddingBottom: 20,
  },

  emptyCard: {
    paddingVertical: 28,
    paddingHorizontal: 20,
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textGray,
    textAlign: 'center',
  },

  ruleCard: {
    marginBottom: 12,
  },
  ruleHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ruleTrigger: {
    flex: 1,
    fontFamily: fonts.jalnan,
    fontSize: 15,
    color: colors.text,
    marginRight: 10,
  },
  ruleOffset: {
    marginTop: 6,
    fontSize: 12,
    color: colors.textGray,
  },
  ruleAction: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },

  addButtonWrap: {
    alignItems: 'center',
    marginTop: 4,
  },
  addCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },

  bottomNavWrap: {
    paddingHorizontal: 20,
    paddingBottom: 10,
    paddingTop: 6,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 40,
  },
  modalCard: {
    width: '100%',
    maxWidth: 340,
    maxHeight: '100%',
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 24,
  },
  modalTitle: {
    fontFamily: fonts.jalnan,
    fontSize: 18,
    color: colors.text,
    marginBottom: 16,
    textAlign: 'center',
  },
  fieldLabel: {
    fontFamily: fonts.jalnan,
    fontSize: 13,
    color: colors.textGray2,
    marginTop: 14,
    marginBottom: 8,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chipRowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: colors.card,
    maxWidth: '100%',
  },
  chipSelected: {
    backgroundColor: colors.orange,
  },
  chipText: {
    fontFamily: fonts.jalnan,
    fontSize: 13,
    color: colors.textGray2,
  },
  chipTextSelected: {
    color: colors.white,
  },
  hintText: {
    fontSize: 12,
    color: colors.textGray,
    lineHeight: 17,
  },
  numberInput: {
    fontFamily: fonts.jalnan,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    width: 90,
  },

  deleteButton: {
    alignItems: 'center',
    marginTop: 20,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: colors.red,
  },
  deleteButtonText: {
    fontFamily: fonts.jalnan,
    fontSize: 14,
    color: colors.white,
  },
  modalBottomRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  modalCloseButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: colors.card,
  },
  modalCloseText: {
    fontFamily: fonts.jalnan,
    fontSize: 15,
    color: colors.text,
  },
  saveButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: colors.orange,
  },
  saveButtonText: {
    fontFamily: fonts.jalnan,
    fontSize: 15,
    color: colors.white,
  },
  modalCloseButtonSolo: {
    flex: 0,
    flexBasis: 'auto',
    marginTop: 16,
  },

  // "🛏 취침 모드" 진입 버튼(규칙 목록 위) 및 SleepPresetModal 전용 스타일 - 예전 SleepModeScreen.tsx에서 그대로 옮김.
  sleepButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  sleepButtonIcon: { fontSize: 22 },
  sleepButtonTextWrap: { flex: 1 },
  sleepButtonTitle: { fontFamily: fonts.jalnan, fontSize: 15, color: colors.text },
  sleepButtonSubtitle: { fontSize: 12, color: colors.textGray, marginTop: 2 },
  sleepButtonChevron: { fontSize: 18, color: colors.textGray },

  sleepToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  sleepToggleLabel: { flex: 1, fontFamily: fonts.jalnan, fontSize: 14, color: colors.text },
  sleepToggleChip: {
    flexShrink: 0,
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sleepToggleChipOn: { backgroundColor: colors.orange, borderColor: colors.orange },
  sleepToggleChipText: { fontFamily: fonts.jalnan, fontSize: 12, color: colors.textGray2 },
  sleepToggleChipTextOn: { color: colors.white },

  sleepDeviceRow: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  sleepTargetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
  },
  sleepTargetLabel: { fontSize: 12, color: colors.textGray },
  sleepTargetSegment: {
    flexDirection: 'row',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  sleepTargetOption: {
    paddingVertical: 5,
    paddingHorizontal: 14,
    backgroundColor: colors.white,
  },
  sleepTargetOptionSelected: { backgroundColor: colors.orange },
  sleepTargetOptionText: { fontFamily: fonts.jalnan, fontSize: 12, color: colors.textGray2 },
  sleepTargetOptionTextSelected: { color: colors.white },

  sleepStepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  sleepStepperControl: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sleepStepperButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sleepStepperButtonText: { fontFamily: fonts.jalnan, fontSize: 16, color: colors.text },
  sleepStepperValue: { fontFamily: fonts.jalnan, fontSize: 14, color: colors.text, minWidth: 46, textAlign: 'center' },
});
