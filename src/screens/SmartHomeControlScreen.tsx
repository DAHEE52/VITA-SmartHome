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
import { EllipsisIcon, PlusIcon } from '../components/icons';

// 화면이 작은 기기에서는 카드 padding/폰트 크기를 함께 줄이는 scale 값을 쓴다.
const REFERENCE_HEIGHT = 820;
const MIN_SCALE = 0.7;
const SCREEN_PADDING = 20;
const GRID_GAP = 14;
const MAX_ROOMS = 12; // "+" 버튼으로 추가할 수 있는 방의 최대 개수

type Device = { name: string; on: boolean };
type Room = { id: string; label: string; devices: Device[] };

// 초기 방 목록 + 방별 기기 ON/OFF 목업 데이터. 실제 앱에서는 서버/기기 상태로 교체될 값.
const initialRooms: Room[] = [
  {
    id: 'room-1',
    label: '거실',
    devices: [
      { name: '조명', on: true },
      { name: '에어컨', on: true },
      { name: 'TV', on: false },
    ],
  },
  {
    id: 'room-2',
    label: 'ROOM 2',
    devices: [
      { name: '조명', on: false },
      { name: '선풍기', on: false },
    ],
  },
  {
    id: 'room-3',
    label: 'ROOM 3',
    devices: [
      { name: '조명', on: false },
      { name: '난방', on: false },
    ],
  },
];

// 새로 추가되는 방에 기본으로 붙는 기기 목록
function defaultDevices(): Device[] {
  return [{ name: '조명', on: false }];
}

// 현재 켜져있는 기기 대수를 보여주는 상단 카드
function ActiveDevicesCard({ scale, count }: { scale: number; count: number }) {
  return (
    <Card style={[styles.activeCard, { paddingVertical: 24 * scale }]}>
      <Text style={[styles.activeLabel, { fontSize: 20 * scale }]}>현재 활성화된 기기</Text>
      <Text style={[styles.activeCount, { fontSize: 40 * scale, marginTop: 10 * scale }]}>{count}대</Text>
    </Card>
  );
}

// 방 하나를 나타내는 카드.
// 좌상단에 켜져있는 기기 개수만큼 초록 점을 나란히 표시한다 (0개면 점 없음).
// 우상단 "..." 버튼은 그 방의 설정 창(이름 수정 + 기기 ON/OFF 현황)을 연다.
function RoomCard({
  label,
  onCount,
  scale,
  cellSize,
  onPress,
  onOpenSettings,
}: {
  label: string;
  onCount: number;
  scale: number;
  cellSize: number;
  onPress?: () => void;
  onOpenSettings: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.gridCell, styles.roomCard, { width: cellSize, height: cellSize }]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {onCount > 0 && (
        <View style={styles.activeDotRow}>
          {Array.from({ length: onCount }).map((_, i) => (
            <View key={i} style={styles.activeDot} />
          ))}
        </View>
      )}
      <TouchableOpacity
        style={styles.ellipsisWrap}
        onPress={onOpenSettings}
        hitSlop={10}
        accessibilityLabel={`${label} 방 설정`}
      >
        <EllipsisIcon size={20 * scale} />
      </TouchableOpacity>
      <Text style={[styles.roomLabel, { fontSize: 20 * scale }]}>{label}</Text>
    </TouchableOpacity>
  );
}

// "..." 버튼을 누르면 뜨는 방 설정 창 - 이름 수정 + 기기 ON/OFF 현황 + 방 삭제
function RoomSettingsModal({
  room,
  onClose,
  onRename,
  onDelete,
}: {
  room: Room | null;
  onClose: () => void;
  onRename: (id: string, label: string) => void;
  onDelete: (id: string) => void;
}) {
  const [nameInput, setNameInput] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (room) {
      setNameInput(room.label);
      setConfirmDelete(false);
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

              {room?.devices.map((d) => (
                <View key={d.name} style={styles.deviceRow}>
                  <Text style={styles.deviceName}>{d.name}</Text>
                  <View style={[styles.statusBadge, d.on ? styles.statusOn : styles.statusOff]}>
                    <Text style={[styles.statusText, d.on ? styles.statusTextOn : styles.statusTextOff]}>
                      {d.on ? 'ON' : 'OFF'}
                    </Text>
                  </View>
                </View>
              ))}

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

export default function SmartHomeControlScreen() {
  const { height, width } = useWindowDimensions();
  const scale = Math.min(1, Math.max(MIN_SCALE, height / REFERENCE_HEIGHT));
  // 정확히 정사각형이 되도록 %/aspectRatio 대신 실제 픽셀 크기를 계산해서 쓴다.
  const cellSize = (width - SCREEN_PADDING * 2 - GRID_GAP) / 2;
  const [rooms, setRooms] = useState<Room[]>(initialRooms);
  const [settingsRoomId, setSettingsRoomId] = useState<string | null>(null);

  const activeCount = rooms.reduce(
    (sum, r) => sum + r.devices.filter((d) => d.on).length,
    0
  );
  const settingsRoom = rooms.find((r) => r.id === settingsRoomId) ?? null;

  const addRoom = () => {
    if (rooms.length >= MAX_ROOMS) return;
    setRooms([
      ...rooms,
      {
        id: `room-${Date.now()}`,
        label: `ROOM ${rooms.length + 1}`,
        devices: defaultDevices(),
      },
    ]);
  };

  const renameRoom = (id: string, label: string) => {
    setRooms(rooms.map((r) => (r.id === id ? { ...r, label } : r)));
  };

  const deleteRoom = (id: string) => {
    setRooms(rooms.filter((r) => r.id !== id));
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={[styles.content, { paddingTop: 20 * scale }]}>
        <ActiveDevicesCard scale={scale} count={activeCount} />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 * scale }}>
          <View style={[styles.grid, { marginTop: 16 * scale, rowGap: GRID_GAP }]}>
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
  activeDotRow: {
    position: 'absolute',
    top: 18,
    left: 18,
    flexDirection: 'row',
    gap: 5,
  },
  activeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.green,
  },
  ellipsisWrap: {
    position: 'absolute',
    top: 16,
    right: 16,
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
  renameSaveText: {
    fontFamily: fonts.jalnan,
    fontSize: 14,
    color: colors.white,
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
