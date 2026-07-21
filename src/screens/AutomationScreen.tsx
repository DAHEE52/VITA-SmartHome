// 신규 화면 - 자동화 규칙.
// 구조: 헤더 / 등록된 규칙 카드 목록(없으면 안내문) / "+" 규칙 추가 버튼 / 하단 네비(홈)
//
// 캘린더에 등록한 "외출 예정"/"외박 일정"(SPECIAL 일정의 유형 태그) 또는 "요일별 루틴"(DAILY 일정)을
// 트리거로 골라, 지정한 방의 기기를 켜고 끄거나 목표 온도를 바꾸는 규칙을 사용자가 직접 만든다.
// 실제 발동/실행은 화면과 무관하게 AutomationContext가 계속 감시한다.
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Pressable, TextInput, ScrollView, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts } from '../theme/colors';
import Card from '../components/Card';
import BottomNav from '../components/BottomNav';
import { PlusIcon } from '../components/icons';
import { useCalendar, ScheduleItem } from '../context/CalendarContext';
import { useDemoRooms, Room } from '../context/DemoRoomsContext';
import { usePresence } from '../context/PresenceContext';
import {
  useAutomation,
  AutomationRule,
  AutomationTrigger,
  AutomationAction,
  describeTrigger,
} from '../context/AutomationContext';

const SCREEN_PADDING = 20;
const WEEKDAY_SHORT = ['일', '월', '화', '수', '목', '금', '토'];

function summarizeWeekdays(weekdays?: number[]): string {
  if (!weekdays || weekdays.length === 0 || weekdays.length >= 7) return '매일';
  return [...weekdays].sort((a, b) => a - b).map((d) => WEEKDAY_SHORT[d]).join('·');
}

function describeAction(action: AutomationAction, roomLabel: string): string {
  if (action.kind === 'device_on') return `${roomLabel} · "${action.deviceName}" 켜기`;
  if (action.kind === 'device_off') return `${roomLabel} · "${action.deviceName}" 끄기`;
  if (action.kind === 'presence_temp') {
    return `${roomLabel} · 재실 ${action.homeTemp}°C / 외출 ${action.awayTemp}°C`;
  }
  return `${roomLabel} · 목표 온도 ${action.targetTemp}°C`;
}

function describeOffset(offsetMinutes: number): string {
  return offsetMinutes === 0 ? '정시 실행' : `${offsetMinutes}분 전 실행`;
}

type TriggerKind = 'outing' | 'overnight' | 'routine' | 'presence';

const TRIGGER_OPTIONS: { value: TriggerKind; label: string }[] = [
  { value: 'outing', label: '외출 예정' },
  { value: 'overnight', label: '외박 일정' },
  { value: 'routine', label: '요일별 루틴' },
  { value: 'presence', label: '재실/외출' },
];

const ACTION_OPTIONS: { value: 'device_off' | 'device_on' | 'set_temp'; label: string }[] = [
  { value: 'device_off', label: '기기 끄기' },
  { value: 'device_on', label: '기기 켜기' },
  { value: 'set_temp', label: '온도 설정' },
];

// 규칙 하나를 요약해서 보여주는 카드. 탭하면 수정 모달이 열리고, 우측 스위치로 바로 켜고 끌 수 있다.
function RuleCard({
  rule,
  roomLabel,
  dailyItems,
  onToggle,
  onPress,
}: {
  rule: AutomationRule;
  roomLabel: string;
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
    <TouchableOpacity activeOpacity={0.85} onPress={onPress}>
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
          {trigger.kind === 'presence' ? '재실 상태가 바뀔 때마다 자동 조절' : describeOffset(rule.offsetMinutes)}
        </Text>
        <Text style={styles.ruleAction} numberOfLines={1}>
          {describeAction(rule.action, roomLabel)}
        </Text>
      </Card>
    </TouchableOpacity>
  );
}

type SavedRuleInput = {
  trigger: AutomationTrigger;
  offsetMinutes: number;
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
  const [triggerKind, setTriggerKind] = useState<TriggerKind>('outing');
  const [routineId, setRoutineId] = useState<string | null>(null);
  const [offsetText, setOffsetText] = useState('0');
  const [roomId, setRoomId] = useState<string | null>(null);
  const [actionKind, setActionKind] = useState<'device_off' | 'device_on' | 'set_temp'>('device_off');
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [tempText, setTempText] = useState('22');
  const [homeTempText, setHomeTempText] = useState('24');
  const [awayTempText, setAwayTempText] = useState('28');

  React.useEffect(() => {
    if (!visible) return;
    if (initial) {
      setTriggerKind(initial.trigger.kind);
      setRoutineId(initial.trigger.kind === 'routine' ? initial.trigger.routineId : null);
      setOffsetText(String(initial.offsetMinutes));
      setRoomId(initial.roomId);
      if (initial.action.kind === 'presence_temp') {
        setHomeTempText(String(initial.action.homeTemp));
        setAwayTempText(String(initial.action.awayTemp));
        setActionKind('device_off');
        setDeviceName(null);
        setTempText('22');
      } else {
        setActionKind(initial.action.kind);
        setDeviceName(initial.action.kind !== 'set_temp' ? initial.action.deviceName : null);
        setTempText(initial.action.kind === 'set_temp' ? String(initial.action.targetTemp) : '22');
        setHomeTempText('24');
        setAwayTempText('28');
      }
    } else {
      setTriggerKind('outing');
      setRoutineId(dailyItems[0]?.id ?? null);
      setOffsetText('0');
      setRoomId(rooms[0]?.id ?? null);
      setActionKind('device_off');
      setDeviceName(null);
      setTempText('22');
      setHomeTempText('24');
      setAwayTempText('28');
    }
  }, [visible, initial]);

  const selectedRoom = rooms.find((r) => r.id === roomId) ?? null;
  const isPresence = triggerKind === 'presence';

  const canSave =
    !!roomId &&
    (triggerKind !== 'routine' || !!routineId) &&
    (isPresence
      ? homeTempText.trim() !== '' && awayTempText.trim() !== ''
      : actionKind === 'set_temp'
      ? tempText.trim() !== ''
      : !!deviceName);

  const handleSave = () => {
    if (canSave && roomId) {
      const trigger: AutomationTrigger =
        triggerKind === 'routine'
          ? { kind: 'routine', routineId: routineId! }
          : { kind: triggerKind };
      const action: AutomationAction = isPresence
        ? {
            kind: 'presence_temp',
            homeTemp: Math.max(0, Number(homeTempText) || 0),
            awayTemp: Math.max(0, Number(awayTempText) || 0),
          }
        : actionKind === 'set_temp'
        ? { kind: 'set_temp', targetTemp: Math.max(0, Number(tempText) || 0) }
        : { kind: actionKind, deviceName: deviceName! };
      onSave({ trigger, offsetMinutes: isPresence ? 0 : Math.max(0, Number(offsetText) || 0), roomId, action });
    }
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={() => {}}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.modalTitle}>{initial ? '자동화 규칙 수정' : '자동화 규칙 추가'}</Text>

            <Text style={styles.fieldLabel}>언제 실행할까요</Text>
            <View style={styles.chipRow}>
              {TRIGGER_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.chip, triggerKind === opt.value && styles.chipSelected]}
                  onPress={() => setTriggerKind(opt.value)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.chipText, triggerKind === opt.value && styles.chipTextSelected]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {triggerKind === 'routine' &&
              (dailyItems.length === 0 ? (
                <Text style={styles.hintText}>캘린더에서 먼저 루틴(DAILY 일정)을 추가해 주세요.</Text>
              ) : (
                <View style={styles.chipRowWrap}>
                  {dailyItems.map((item) => (
                    <TouchableOpacity
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
                    </TouchableOpacity>
                  ))}
                </View>
              ))}

            {!isPresence && (
              <>
                <Text style={styles.fieldLabel}>몇 분 전에 실행할까요 (0 = 정시)</Text>
                <TextInput
                  style={styles.numberInput}
                  value={offsetText}
                  onChangeText={(v) => setOffsetText(v.replace(/[^0-9]/g, ''))}
                  placeholder="0"
                  placeholderTextColor={colors.textGray}
                  keyboardType="number-pad"
                />
              </>
            )}

            <Text style={styles.fieldLabel}>어느 방에 적용할까요</Text>
            {rooms.length === 0 ? (
              <Text style={styles.hintText}>스마트홈 제어에서 먼저 방을 추가해 주세요.</Text>
            ) : (
              <View style={styles.chipRowWrap}>
                {rooms.map((r) => (
                  <TouchableOpacity
                    key={r.id}
                    style={[styles.chip, roomId === r.id && styles.chipSelected]}
                    onPress={() => {
                      setRoomId(r.id);
                      setDeviceName(null);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.chipText, roomId === r.id && styles.chipTextSelected]}>{r.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {isPresence ? (
              <>
                <Text style={styles.fieldLabel}>재실일 때 희망 온도 (°C)</Text>
                <TextInput
                  style={styles.numberInput}
                  value={homeTempText}
                  onChangeText={(v) => setHomeTempText(v.replace(/[^0-9]/g, ''))}
                  placeholder="24"
                  placeholderTextColor={colors.textGray}
                  keyboardType="number-pad"
                />
                <Text style={styles.fieldLabel}>외출 중일 때 희망 온도 (°C)</Text>
                <TextInput
                  style={styles.numberInput}
                  value={awayTempText}
                  onChangeText={(v) => setAwayTempText(v.replace(/[^0-9]/g, ''))}
                  placeholder="28"
                  placeholderTextColor={colors.textGray}
                  keyboardType="number-pad"
                />
              </>
            ) : (
              <>
                <Text style={styles.fieldLabel}>무엇을 할까요</Text>
                <View style={styles.chipRow}>
                  {ACTION_OPTIONS.map((opt) => (
                    <TouchableOpacity
                      key={opt.value}
                      style={[styles.chip, actionKind === opt.value && styles.chipSelected]}
                      onPress={() => setActionKind(opt.value)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.chipText, actionKind === opt.value && styles.chipTextSelected]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {actionKind === 'set_temp' ? (
                  <TextInput
                    style={styles.numberInput}
                    value={tempText}
                    onChangeText={(v) => setTempText(v.replace(/[^0-9]/g, ''))}
                    placeholder="22"
                    placeholderTextColor={colors.textGray}
                    keyboardType="number-pad"
                  />
                ) : !selectedRoom || selectedRoom.devices.length === 0 ? (
                  <Text style={styles.hintText}>이 방에 등록된 기기가 없어요. 스마트홈 제어에서 먼저 등록해 주세요.</Text>
                ) : (
                  <View style={styles.chipRowWrap}>
                    {selectedRoom.devices.map((d) => (
                      <TouchableOpacity
                        key={d.name}
                        style={[styles.chip, deviceName === d.name && styles.chipSelected]}
                        onPress={() => setDeviceName(d.name)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.chipText, deviceName === d.name && styles.chipTextSelected]}>
                          {d.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </>
            )}

            {onDelete && (
              <TouchableOpacity style={styles.deleteButton} onPress={onDelete} activeOpacity={0.7}>
                <Text style={styles.deleteButtonText}>규칙 삭제</Text>
              </TouchableOpacity>
            )}

            <View style={styles.modalBottomRow}>
              <TouchableOpacity style={styles.modalCloseButton} onPress={onClose} activeOpacity={0.7}>
                <Text style={styles.modalCloseText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={handleSave} activeOpacity={0.7}>
                <Text style={styles.saveButtonText}>저장</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// 재실 여부 카드 - 실제로는 카메라가 판단하지만, 아직 카메라 연동이 없어서 지금은 이 스위치로
// "카메라가 이렇게 감지했다고 치고" 상태를 직접 시뮬레이션한다.
function PresenceCard({ isHome, onToggle }: { isHome: boolean; onToggle: (v: boolean) => void }) {
  return (
    <Card style={styles.presenceCard}>
      <View style={styles.presenceRow}>
        <View style={styles.presenceTextCol}>
          <Text style={styles.presenceTitle}>재실 감지 (카메라)</Text>
          <Text style={styles.presenceHint}>
            {isHome
              ? '카메라가 재실 상태로 감지했어요.'
              : '카메라가 외출 상태로 감지했어요.'}
          </Text>
        </View>
        <Switch
          value={isHome}
          onValueChange={onToggle}
          trackColor={{ false: colors.card, true: colors.orange }}
          thumbColor={colors.white}
        />
      </View>
    </Card>
  );
}

export default function AutomationScreen() {
  const { rules, addRule, updateRule, deleteRule, toggleRuleEnabled } = useAutomation();
  const { dailyItems } = useCalendar();
  const { rooms } = useDemoRooms();
  const { isHome, setIsHome } = usePresence();

  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const roomLabel = (roomId: string) => rooms.find((r) => r.id === roomId)?.label ?? '(삭제된 방)';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.headerIcon}>🔁</Text>
        <Text style={styles.headerTitle}>자동화 규칙</Text>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentInner}
        showsVerticalScrollIndicator={false}
      >
        <PresenceCard isHome={isHome} onToggle={setIsHome} />

        {rules.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Text style={styles.emptyText}>
              아직 등록된 자동화 규칙이 없어요.{'\n'}외출 예정·외박 일정·요일별 루틴, 재실/외출 여부에 맞춰
              조명이나 실내 온도를 자동으로 조절해 보세요.
            </Text>
          </Card>
        ) : (
          rules.map((rule) => (
            <RuleCard
              key={rule.id}
              rule={rule}
              roomLabel={roomLabel(rule.roomId)}
              dailyItems={dailyItems}
              onToggle={() => toggleRuleEnabled(rule.id)}
              onPress={() => setEditingRule(rule)}
            />
          ))
        )}

        <View style={styles.addButtonWrap}>
          <TouchableOpacity
            style={styles.addCircle}
            activeOpacity={0.7}
            onPress={() => setIsAdding(true)}
            accessibilityLabel="자동화 규칙 추가"
          >
            <PlusIcon size={20} />
          </TouchableOpacity>
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
    fontSize: 24,
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

  presenceCard: {
    marginBottom: 14,
  },
  presenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  presenceTextCol: {
    flex: 1,
    marginRight: 10,
  },
  presenceTitle: {
    fontFamily: fonts.jalnan,
    fontSize: 15,
    color: colors.text,
  },
  presenceHint: {
    marginTop: 4,
    fontSize: 12,
    color: colors.textGray,
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
});
