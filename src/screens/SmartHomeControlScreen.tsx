// 시안 4 - 스마트홈 제어 화면.
// 구조: 활성화된 기기 수 카드 / 방(Room) 카드 2열 그리드(마지막 칸은 방 추가 버튼, 스크롤 가능) / 하단 네비(홈)
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
  TextInput,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts } from '../theme/colors';
import Card from '../components/Card';
import BottomNav from '../components/BottomNav';
import { PlusIcon, CloseIcon } from '../components/icons';
import { useRooms, Room, MAX_ROOMS } from '../context/RoomsContext';

// 화면이 작은 기기에서는 카드 padding/폰트 크기를 함께 줄이는 scale 값을 쓴다.
const REFERENCE_HEIGHT = 820;
const MIN_SCALE = 0.7;
const SCREEN_PADDING = 20;
const GRID_GAP = 14;

// 현재 켜져있는 기기 대수를 보여주는 상단 카드
function ActiveDevicesCard({ scale, count }: { scale: number; count: number }) {
  return (
    <Card style={[styles.activeCard, { paddingVertical: 24 * scale }]}>
      <Text style={[styles.activeLabel, { fontSize: 20 * scale }]}>현재 활성화된 기기</Text>
      <Text style={[styles.activeCount, { fontSize: 40 * scale, marginTop: 10 * scale }]}>{count}대</Text>
    </Card>
  );
}

// 방 하나를 나타내는 회색 박스 카드.
// 좌상단에 켜져있는 기기가 하나라도 있으면 초록 점 하나만 표시한다(개수와 무관하게 항상 1개 - 몇 대가
// 켜져 있는지가 아니라 "이 방에 켜진 기기가 있는지"만 보여주기 위함). 0개면 점 없음.
// 별도의 설정 버튼 없이 카드(회색 박스) 자체를 누르면 그 방의 설정 창이 열린다.
function RoomCard({
  label,
  onCount,
  scale,
  cellSize,
  onOpenSettings,
}: {
  label: string;
  onCount: number;
  scale: number;
  cellSize: number;
  onOpenSettings: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.gridCell, styles.roomCard, { width: cellSize, height: cellSize }]}
      onPress={onOpenSettings}
      activeOpacity={0.8}
      accessibilityLabel={`${label} 방 설정`}
    >
      {onCount > 0 && <View style={styles.activeDot} />}
      <Text style={[styles.roomLabel, { fontSize: 20 * scale }]}>{label}</Text>
    </TouchableOpacity>
  );
}

// 방 카드(회색 박스)를 누르면 뜨는 방 설정 창 - 이름 수정 + 기기 ON/OFF 현황(자동/수동) + 방 삭제.
// 기기별로 평소엔 "자동"(센서가 읽은 값을 그대로 표시, 직접 못 누름)이고, "수동"으로 바꾸면
// 센서 고장 등으로 값을 믿을 수 없을 때 ON/OFF 배지를 직접 눌러 바꿀 수 있다.
// 목표 온도 조절 범위 - 냉/난방기 목표 설정치로 흔히 쓰이는 범위 정도로 제한한다.
const MIN_TARGET_TEMP = 16;
const MAX_TARGET_TEMP = 30;

function RoomSettingsModal({
  room,
  onClose,
  onRename,
  onDelete,
  onToggleDeviceMode,
  onToggleDevicePower,
  onDeleteDevice,
  onAddDevice,
  onSetTargetTemp,
}: {
  room: Room | null;
  onClose: () => void;
  onRename: (id: string, label: string) => void;
  onDelete: (id: string) => void;
  onToggleDeviceMode: (roomId: string, deviceName: string) => void;
  onToggleDevicePower: (roomId: string, deviceName: string) => void;
  onDeleteDevice: (roomId: string, deviceName: string) => void;
  onAddDevice: (roomId: string) => void;
  onSetTargetTemp: (roomId: string, temp: number) => void;
}) {
  const [nameInput, setNameInput] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmDeleteDevice, setConfirmDeleteDevice] = useState<string | null>(null);

  useEffect(() => {
    if (room) {
      setNameInput(room.label);
      setConfirmDelete(false);
      setConfirmDeleteDevice(null);
    }
  }, [room]);

  const handleSave = () => {
    if (room && nameInput.trim()) {
      onRename(room.id, nameInput.trim());
    }
    onClose();
  };

  const handleConfirmDelete = () => {
    if (room) onDelete(room.id);
    onClose();
  };

  const handleConfirmDeleteDevice = () => {
    if (room && confirmDeleteDevice) onDeleteDevice(room.id, confirmDeleteDevice);
    setConfirmDeleteDevice(null);
  };

  return (
    <Modal visible={!!room} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={() => {}}>
          {confirmDelete ? (
            <>
              <Text style={styles.modalTitle}>{room?.label} 방을 삭제할까요?</Text>
              <Text style={styles.confirmSubtitle}>삭제하면 되돌릴 수 없어요.</Text>
              <View style={styles.modalBottomRow}>
                <TouchableOpacity
                  style={styles.modalCloseButton}
                  onPress={() => setConfirmDelete(false)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.modalCloseText}>취소</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.deleteButton} onPress={handleConfirmDelete} activeOpacity={0.7}>
                  <Text style={styles.deleteButtonText}>삭제</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : confirmDeleteDevice ? (
            <>
              <Text style={styles.modalTitle}>{confirmDeleteDevice} 기기를 삭제할까요?</Text>
              <Text style={styles.confirmSubtitle}>삭제하면 되돌릴 수 없어요.</Text>
              <View style={styles.modalBottomRow}>
                <TouchableOpacity
                  style={styles.modalCloseButton}
                  onPress={() => setConfirmDeleteDevice(null)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.modalCloseText}>취소</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={handleConfirmDeleteDevice}
                  activeOpacity={0.7}
                >
                  <Text style={styles.deleteButtonText}>삭제</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.modalTitle}>방 설정</Text>

              <View style={styles.renameRow}>
                <TextInput
                  style={styles.renameInput}
                  value={nameInput}
                  onChangeText={setNameInput}
                  onSubmitEditing={handleSave}
                  placeholder="방 이름"
                  placeholderTextColor={colors.textGray}
                  returnKeyType="done"
                />
                <TouchableOpacity style={styles.renameSaveButton} onPress={handleSave} activeOpacity={0.7}>
                  <Text style={styles.renameSaveText}>저장</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.tempRow}>
                <Text style={styles.tempLabel}>목표 온도</Text>
                <View style={styles.tempStepperRow}>
                  <TouchableOpacity
                    style={styles.tempStepButton}
                    onPress={() =>
                      room && onSetTargetTemp(room.id, Math.max(MIN_TARGET_TEMP, room.targetTemp - 1))
                    }
                    activeOpacity={0.7}
                    hitSlop={8}
                  >
                    <Text style={styles.tempStepText}>−</Text>
                  </TouchableOpacity>
                  <Text style={styles.tempValue}>{room?.targetTemp ?? 24}°C</Text>
                  <TouchableOpacity
                    style={styles.tempStepButton}
                    onPress={() =>
                      room && onSetTargetTemp(room.id, Math.min(MAX_TARGET_TEMP, room.targetTemp + 1))
                    }
                    activeOpacity={0.7}
                    hitSlop={8}
                  >
                    <Text style={styles.tempStepText}>＋</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <Text style={styles.deviceSectionHint}>
                평소엔 센서가 자동으로 전원 상태를 확인해요. 센서 오류 등으로 값이 다르면
                "수동"으로 바꿔 직접 켜고 끌 수 있어요.
              </Text>

              {room?.devices.map((d) => (
                <View key={d.name} style={styles.deviceRow}>
                  <Text style={styles.deviceName}>{d.name}</Text>
                  <View style={styles.deviceControls}>
                    <TouchableOpacity
                      style={[styles.modeToggle, d.mode === 'manual' && styles.modeToggleManual]}
                      onPress={() => room && onToggleDeviceMode(room.id, d.name)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.modeToggleText,
                          d.mode === 'manual' && styles.modeToggleTextManual,
                        ]}
                      >
                        {d.mode === 'auto' ? '자동' : '수동'}
                      </Text>
                    </TouchableOpacity>

                    {d.mode === 'manual' ? (
                      <TouchableOpacity
                        style={[styles.statusBadge, d.on ? styles.statusOn : styles.statusOff]}
                        onPress={() => room && onToggleDevicePower(room.id, d.name)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.statusText, d.on ? styles.statusTextOn : styles.statusTextOff]}>
                          {d.on ? 'ON' : 'OFF'}
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <View style={[styles.statusBadge, d.on ? styles.statusOn : styles.statusOff]}>
                        <Text style={[styles.statusText, d.on ? styles.statusTextOn : styles.statusTextOff]}>
                          {d.on ? 'ON' : 'OFF'}
                        </Text>
                      </View>
                    )}

                    <TouchableOpacity
                      style={styles.deviceDeleteButton}
                      onPress={() => setConfirmDeleteDevice(d.name)}
                      hitSlop={8}
                      activeOpacity={0.7}
                      accessibilityLabel={`${d.name} 기기 삭제`}
                    >
                      <CloseIcon size={14} color={colors.textGray} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}

              <TouchableOpacity
                style={styles.addDeviceInModalButton}
                onPress={() => room && onAddDevice(room.id)}
                activeOpacity={0.7}
              >
                <Text style={styles.addDeviceInModalText}>기기 추가</Text>
              </TouchableOpacity>

              <View style={styles.modalBottomRow}>
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => setConfirmDelete(true)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.deleteButtonText}>방 삭제</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalCloseButton} onPress={onClose} activeOpacity={0.7}>
                  <Text style={styles.modalCloseText}>닫기</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// 새 방을 추가하는 원형 "+" 버튼. 다른 방 카드와 달리 배경 카드 없이 원만 떠 있음.
function AddRoomButton({ scale, cellSize, onPress }: { scale: number; cellSize: number; onPress: () => void }) {
  const size = 56 * scale;
  return (
    <View style={[styles.gridCell, { width: cellSize, height: cellSize }]}>
      <TouchableOpacity
        style={[styles.addCircle, { width: size, height: size, borderRadius: size / 2 }]}
        activeOpacity={0.7}
        onPress={onPress}
        accessibilityLabel="방 추가"
      >
        <PlusIcon size={24 * scale} />
      </TouchableOpacity>
    </View>
  );
}

// 방 카드의 "+" 버튼을 누르면 뜨는 창 - 그 방(room)에 등록할 기기 이름만 입력하면 되고,
// 등록하면 바로 그 방의 기기 목록에 추가되어 방 설정 창에서 확인할 수 있다.
function AddDeviceModal({
  room,
  onClose,
  onSubmit,
}: {
  room: Room | null;
  onClose: () => void;
  onSubmit: (roomId: string, deviceName: string) => void;
}) {
  const [deviceName, setDeviceName] = useState('');

  useEffect(() => {
    if (room) setDeviceName('');
  }, [room]);

  const handleSubmit = () => {
    if (!room || !deviceName.trim()) return;
    onSubmit(room.id, deviceName.trim());
    onClose();
  };

  return (
    <Modal visible={!!room} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={() => {}}>
          <Text style={styles.modalTitle}>{room?.label}에 기기 추가</Text>

          <View style={styles.renameRow}>
            <TextInput
              style={styles.renameInput}
              value={deviceName}
              onChangeText={setDeviceName}
              onSubmitEditing={handleSubmit}
              placeholder="기기 이름"
              placeholderTextColor={colors.textGray}
              returnKeyType="done"
              autoFocus
            />
          </View>

          <View style={styles.modalBottomRow}>
            <TouchableOpacity style={styles.modalCloseButton} onPress={onClose} activeOpacity={0.7}>
              <Text style={styles.modalCloseText}>취소</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.renameSaveButtonWide} onPress={handleSubmit} activeOpacity={0.7}>
              <Text style={styles.renameSaveText}>등록</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function SmartHomeControlScreen() {
  const { height, width } = useWindowDimensions();
  const scale = Math.min(1, Math.max(MIN_SCALE, height / REFERENCE_HEIGHT));
  // 정확히 정사각형이 되도록 %/aspectRatio 대신 실제 픽셀 크기를 계산해서 쓴다.
  const cellSize = (width - SCREEN_PADDING * 2 - GRID_GAP) / 2;
  const {
    rooms,
    addRoom,
    renameRoom,
    deleteRoom,
    addDevice,
    deleteDevice,
    toggleDeviceMode,
    toggleDevicePower,
    setRoomTargetTemp,
  } = useRooms();
  const [settingsRoomId, setSettingsRoomId] = useState<string | null>(null);
  const [addDeviceRoomId, setAddDeviceRoomId] = useState<string | null>(null);

  const activeCount = rooms.reduce(
    (sum, r) => sum + r.devices.filter((d) => d.on).length,
    0
  );
  const settingsRoom = rooms.find((r) => r.id === settingsRoomId) ?? null;
  const addDeviceRoom = rooms.find((r) => r.id === addDeviceRoomId) ?? null;

  // 방 설정 창의 "기기 추가"를 누르면 호출된다. RN의 Modal은 두 개가 동시에 visible:true면
  // (설정 창 + 기기 추가 창) 터치가 먹통이 되는 문제가 있어서, 기기 추가 창을 열기 전에
  // 반드시 설정 창부터 닫는다 - 두 Modal이 함께 열려 있는 상태를 만들지 않기 위함.
  const openAddDeviceFromSettings = (roomId: string) => {
    setSettingsRoomId(null);
    setAddDeviceRoomId(roomId);
  };

  // 기기 추가 창을 닫을 때(취소/등록 모두) 원래 보고 있던 방의 설정 창으로 되돌아간다.
  const closeAddDeviceModal = () => {
    const roomId = addDeviceRoomId;
    setAddDeviceRoomId(null);
    if (roomId) setSettingsRoomId(roomId);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={[styles.content, { paddingTop: 20 * scale }]}>
        <ActiveDevicesCard scale={scale} count={activeCount} />
        <View style={{ height: 16 * scale }} />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 * scale }}>
          <View style={[styles.grid, { rowGap: GRID_GAP }]}>
            {rooms.map((room) => (
              <RoomCard
                key={room.id}
                label={room.label}
                onCount={room.devices.filter((d) => d.on).length}
                scale={scale}
                cellSize={cellSize}
                onOpenSettings={() => setSettingsRoomId(room.id)}
              />
            ))}
            {rooms.length < MAX_ROOMS && (
              <AddRoomButton scale={scale} cellSize={cellSize} onPress={addRoom} />
            )}
          </View>
        </ScrollView>
      </View>
      <View style={styles.bottomNavWrap}>
        <BottomNav variant="sub" />
      </View>
      <RoomSettingsModal
        room={settingsRoom}
        onClose={() => setSettingsRoomId(null)}
        onRename={renameRoom}
        onDelete={deleteRoom}
        onToggleDeviceMode={toggleDeviceMode}
        onToggleDevicePower={toggleDevicePower}
        onDeleteDevice={deleteDevice}
        onAddDevice={openAddDeviceFromSettings}
        onSetTargetTemp={setRoomTargetTemp}
      />
      <AddDeviceModal
        room={addDeviceRoom}
        onClose={closeAddDeviceModal}
        onSubmit={addDevice}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.white,
  },
  content: {
    flex: 1,
    paddingHorizontal: SCREEN_PADDING,
  },

  activeCard: {
    alignItems: 'center',
  },
  activeLabel: {
    fontFamily: fonts.jalnan,
    color: colors.text,
  },
  activeCount: {
    fontFamily: fonts.jalnan,
    color: colors.text,
  },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  // 2열 그리드의 한 칸. width/height는 정확한 정사각형을 위해 JS에서 계산해서 inline으로 준다.
  gridCell: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  roomCard: {
    backgroundColor: colors.card,
    borderRadius: 20,
  },
  // 켜진 기기가 있는 방 카드 좌상단에 표시하는 점 하나. 개수 상관없이 항상 이 점 하나만 쓴다.
  activeDot: {
    position: 'absolute',
    top: 18,
    left: 18,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.green,
  },
  roomLabel: {
    fontFamily: fonts.jalnan,
    color: colors.text,
  },
  addCircle: {
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
  },
  modalCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 24,
  },
  modalTitle: {
    fontFamily: fonts.jalnan,
    fontSize: 19,
    color: colors.text,
    marginBottom: 18,
    textAlign: 'center',
  },
  renameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 18,
  },
  renameInput: {
    flex: 1,
    fontFamily: fonts.jalnan,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  renameSaveButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: colors.orange,
  },
  renameSaveButtonWide: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: colors.orange,
  },
  renameSaveText: {
    fontFamily: fonts.jalnan,
    fontSize: 14,
    color: colors.white,
  },
  tempRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  tempLabel: {
    fontFamily: fonts.jalnan,
    fontSize: 14,
    color: colors.text,
  },
  tempStepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  tempStepButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tempStepText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  tempValue: {
    fontFamily: fonts.jalnan,
    fontSize: 15,
    color: colors.text,
    minWidth: 46,
    textAlign: 'center',
  },
  deviceSectionHint: {
    fontSize: 12,
    color: colors.textGray,
    lineHeight: 16,
    marginBottom: 10,
  },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  deviceName: {
    fontFamily: fonts.jalnan,
    fontSize: 16,
    color: colors.text,
  },
  deviceControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  deviceDeleteButton: {
    padding: 4,
  },
  // 방 설정 창의 기기 목록 아래에 놓이는 "기기 추가" 버튼 - 이 방에 바로 기기를 등록하는 창을 연다.
  addDeviceInModalButton: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: colors.card,
  },
  addDeviceInModalText: {
    fontFamily: fonts.jalnan,
    fontSize: 14,
    color: colors.textGray2,
  },
  // 기기별 자동/수동 전환 pill. 수동일 때만 강조색으로 바꿔서, 지금 "센서 대신 내가 직접
  // 정한 값"이라는 걸 한눈에 알아볼 수 있게 한다.
  modeToggle: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: colors.card,
  },
  modeToggleManual: {
    backgroundColor: colors.orange,
  },
  modeToggleText: {
    fontFamily: fonts.jalnan,
    fontSize: 12,
    color: colors.textGray2,
  },
  modeToggleTextManual: {
    color: colors.white,
  },
  statusBadge: {
    paddingVertical: 5,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  statusOn: {
    backgroundColor: colors.green,
  },
  statusOff: {
    backgroundColor: colors.card,
  },
  statusText: {
    fontFamily: fonts.jalnan,
    fontSize: 13,
  },
  statusTextOn: {
    color: colors.white,
  },
  statusTextOff: {
    color: colors.textGray,
  },
  confirmSubtitle: {
    fontFamily: fonts.jalnan,
    fontSize: 13,
    color: colors.textGray,
    textAlign: 'center',
    marginTop: -10,
    marginBottom: 4,
  },
  modalBottomRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  deleteButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: colors.red,
  },
  deleteButtonText: {
    fontFamily: fonts.jalnan,
    fontSize: 15,
    color: colors.white,
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
});
