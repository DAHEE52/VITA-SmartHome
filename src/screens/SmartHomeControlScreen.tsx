// 시안 4 - 스마트홈 제어 화면.
// 구조: 활성화된 기기 수 카드 / 스마트 플러그(기기) 카드 2열 그리드(마지막 칸은 주변 기기 감지
// 버튼, 스크롤 가능) / 하단 네비(홈). 목표 온도 조절 UI는 이 화면에서 제거했다 - room.targetTemp
// 자체는 AutomationContext의 온도 유지 자동화가 계속 쓰므로 RoomsContext에는 남아있다.
// VITA는 원룸 전용 서비스라 방은 항상 정확히 하나만 존재한다(RoomsContext가 자동 보장) - 그래서
// 이 화면엔 방을 추가/삭제하는 UI가 없고, 그리드는 방이 아니라 그 방에 연결된 기기(스마트 플러그)를
// 카드로 보여준다. "+" 버튼을 누르면 주변에 감지되는 기기 목록이 뜨고, 등록하면 카드로 나타난다.
// 카드를 누르면 이름을 직접 지정할 수 있고, 전력 측정기(power_monitor)면 실시간 W도 보인다.
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts } from '../theme/colors';
import Card from '../components/Card';
import BottomNav from '../components/BottomNav';
import AnimatedPressable from '../components/AnimatedPressable';
import { PlusIcon } from '../components/icons';
import { useRooms, Device } from '../context/RoomsContext';
import { useAppWindowDimensions } from '../hooks/useAppWindowDimensions';
import * as api from '../api/client';

// 화면이 작은 기기에서는 카드 padding/폰트 크기를 함께 줄이는 scale 값을 쓴다.
const REFERENCE_HEIGHT = 820;
const MIN_SCALE = 0.7;
const SCREEN_PADDING = 20;
const GRID_GAP = 14;
// 전력 측정기(power_monitor) 카드의 실시간 W를 이 주기로 다시 조회한다. 실기기(power_relay_node
// 등)가 30초마다 값을 push하므로 그보다 촘촘히 조회해봐야 새 값이 없다.
const WATT_POLL_INTERVAL_MS = 20000;

// Tapo 스마트 콘센트는 3초마다 전력값을 push하므로, 이보다 훨씬 오래 새 값이 없으면 "콘센트 자체가
// 지금 통신이 안 되는 상태"(전원이 뽑혔거나 와이파이가 끊김)로 본다. WATT_POLL_INTERVAL_MS(20초)
// 주기로 조회하는 걸 감안해 여유 있게 잡음.
const OUTLET_OFFLINE_THRESHOLD_MS = 30000;

// 전력 측정기 카드/설정창에 공통으로 쓰는 상태 판정.
// - 콘센트 자체가 최근에 값을 보낸 적이 없으면(recorded_at이 없거나 너무 오래됨) "해제됨"으로 본다 -
//   콘센트 전원이 뽑혔거나 와이파이가 끊겼을 때.
// - 콘센트는 살아있는데 소비전력이 0에 가까우면, 콘센트에 아무 기기도 안 꽂혀있는(또는 완전히 꺼진)
//   것으로 본다.
type PowerStatus = { kind: 'ok'; watt: number } | { kind: 'no-device' } | { kind: 'outlet-offline' };

function computePowerStatus(power_w: number | null, recorded_at: string | null): PowerStatus {
  if (recorded_at == null) return { kind: 'outlet-offline' };
  const age = Date.now() - new Date(recorded_at).getTime();
  if (age > OUTLET_OFFLINE_THRESHOLD_MS) return { kind: 'outlet-offline' };
  if (power_w == null || power_w <= 0) return { kind: 'no-device' };
  return { kind: 'ok', watt: power_w };
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

// 연결된 스마트 플러그(기기) 하나를 나타내는 회색 박스 카드.
// 켜져 있으면 좌상단에 초록 점, 전력 측정기(power_monitor)면 실시간 소비전력(W)도 함께 보여준다.
// 카드를 누르면 그 기기의 설정(이름 변경/전원/연결 해제) 창이 열린다.
function DeviceCard({
  device,
  scale,
  cellSize,
  onPress,
}: {
  device: Device;
  scale: number;
  cellSize: number;
  onPress: () => void;
}) {
  const [powerStatus, setPowerStatus] = useState<PowerStatus | null>(null);

  useEffect(() => {
    if (device.type !== 'power_monitor') {
      setPowerStatus(null);
      return;
    }
    let cancelled = false;
    const fetchLatest = () => {
      api
        .getLatestPower(device.id)
        .then((r) => {
          if (!cancelled) setPowerStatus(computePowerStatus(r.power_w, r.recorded_at));
        })
        .catch(() => {});
    };
    fetchLatest();
    const interval = setInterval(fetchLatest, WATT_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [device.id, device.type]);

  return (
    <AnimatedPressable
      style={[styles.gridCell, styles.roomCard, { width: cellSize, height: cellSize }]}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityLabel={`${device.name} 설정`}
    >
      {device.on && <View style={styles.activeDot} />}
      <Text style={[styles.roomLabel, { fontSize: 18 * scale }]} numberOfLines={2}>
        {device.name}
      </Text>
      {powerStatus?.kind === 'ok' && (
        <Text style={[styles.deviceWattText, { fontSize: 12 * scale }]}>{Math.round(powerStatus.watt)}W</Text>
      )}
      {powerStatus?.kind === 'no-device' && (
        <Text style={[styles.deviceWattText, { fontSize: 12 * scale }]} numberOfLines={1}>
          연결된 기기 없음
        </Text>
      )}
      {powerStatus?.kind === 'outlet-offline' && (
        <Text style={[styles.deviceWattText, styles.deviceOfflineText, { fontSize: 12 * scale }]} numberOfLines={1}>
          콘센트 해제됨
        </Text>
      )}
    </AnimatedPressable>
  );
}

// 연결된 스마트 플러그(회색 박스) 대신 마지막 칸에 뜨는 원형 "+" 버튼. 주변 기기 감지 목록을 연다.
function AddDeviceButton({ scale, cellSize, onPress }: { scale: number; cellSize: number; onPress: () => void }) {
  const size = 56 * scale;
  return (
    <View style={[styles.gridCell, { width: cellSize, height: cellSize }]}>
      <AnimatedPressable
        style={[styles.addCircle, { width: size, height: size, borderRadius: size / 2 }]}
        activeOpacity={0.7}
        onPress={onPress}
        accessibilityLabel="주변 기기 감지"
      >
        <PlusIcon size={24 * scale} />
      </AnimatedPressable>
    </View>
  );
}

// "+" 버튼을 누르면 뜨는 창 - 주변에 감지되는(이미 서버에 자기소개를 마쳤지만 아직 방에 안 묶인)
// 기기 목록을 보여준다. Tapo 브릿지(backend/tapo_mqtt_publisher.py + tapo_mqtt_bridge.py)가
// 찾은 Tapo 스마트 콘센트도 같은 방식(자동 register)으로 여기 나타나므로 ESP32 기기와 동일하게
// 취급된다. 목록에서 기기를 탭하면: 1) 그 자리에서 등록하고 2) 곧바로 이름 설정 단계로 넘어가서,
// 사용자가 "이름 없는 기기를 눌러서 등록 → 나중에 카드 찾아서 이름 바꾸기" 두 단계를 거칠 필요 없이
// 한 흐름으로 끝낸다. 이름을 저장하면 목록으로 돌아가 다른 기기를 이어서 추가할 수 있다.
function ConnectDeviceModal({
  visible,
  roomId,
  onClose,
  onConnect,
  onRename,
}: {
  visible: boolean;
  roomId: string | null;
  onClose: () => void;
  onConnect: (roomId: string, deviceId: string) => void;
  onRename: (roomId: string, deviceId: string, name: string) => void;
}) {
  const [nearby, setNearby] = useState<api.DeviceOut[]>([]);
  const [connectedIds, setConnectedIds] = useState<Set<string>>(new Set());
  // 방금 연결해서 이름을 정하는 중인 기기 - null이 아니면 목록 대신 이름 설정 화면을 보여준다.
  const [namingDevice, setNamingDevice] = useState<api.DeviceOut | null>(null);
  const [nameInput, setNameInput] = useState('');

  useEffect(() => {
    if (!visible) return;
    setConnectedIds(new Set());
    setNamingDevice(null);
    api
      .getUnassignedDevices()
      .then(setNearby)
      .catch((err) => {
        console.warn('근처 스마트 플러그 조회 실패:', err);
        setNearby([]);
      });
  }, [visible]);

  const handleConnect = (device: api.DeviceOut) => {
    if (!roomId || connectedIds.has(device.id)) return;
    onConnect(roomId, device.id);
    setConnectedIds((prev) => new Set(prev).add(device.id));
    setNamingDevice(device);
    setNameInput(device.label ?? device.id);
  };

  const handleSaveName = () => {
    if (roomId && namingDevice && nameInput.trim()) {
      onRename(roomId, namingDevice.id, nameInput.trim());
    }
    setNamingDevice(null);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={() => {}}>
          {namingDevice ? (
            <>
              <Text style={styles.modalTitle}>등록됐어요!</Text>
              <Text style={styles.deviceSectionHint}>바로 사용할 이름을 정해주세요.</Text>
              <View style={styles.renameRow}>
                <TextInput
                  style={styles.renameInput}
                  value={nameInput}
                  onChangeText={setNameInput}
                  onSubmitEditing={handleSaveName}
                  placeholder="기기 이름"
                  placeholderTextColor={colors.textGray}
                  returnKeyType="done"
                  autoFocus
                />
              </View>
              <AnimatedPressable
                style={[styles.saveNameButton, styles.modalCloseButtonSolo]}
                onPress={handleSaveName}
                activeOpacity={0.7}
              >
                <Text style={styles.renameSaveText}>저장하고 계속 추가</Text>
              </AnimatedPressable>
            </>
          ) : (
            <>
              <Text style={styles.modalTitle}>주변 기기 감지</Text>
              <Text style={styles.deviceSectionHint}>
                {nearby.length > 0
                  ? '주변에 감지되는 기기예요. 등록할 기기를 골라주세요.'
                  : '주변에 감지되는 기기가 없어요. 전원을 확인해 주세요.'}
              </Text>

              <ScrollView style={styles.nearbyList}>
                {nearby.map((d) => {
                  const connected = connectedIds.has(d.id);
                  return (
                    <View key={d.id} style={styles.nearbyRow}>
                      <Text style={styles.nearbyLabel} numberOfLines={1}>
                        {d.label ?? d.id}
                      </Text>
                      <AnimatedPressable
                        style={[styles.connectButton, connected && styles.connectButtonDone]}
                        onPress={() => handleConnect(d)}
                        activeOpacity={0.7}
                        disabled={connected}
                      >
                        <Text style={[styles.connectButtonText, connected && styles.connectButtonTextDone]}>
                          {connected ? '등록됨' : '등록'}
                        </Text>
                      </AnimatedPressable>
                    </View>
                  );
                })}
              </ScrollView>

              <AnimatedPressable
                style={[styles.modalCloseButton, styles.modalCloseButtonSolo]}
                onPress={onClose}
                activeOpacity={0.7}
              >
                <Text style={styles.modalCloseText}>닫기</Text>
              </AnimatedPressable>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// 스마트 플러그 카드를 누르면 뜨는 창 - 이름 변경, 실시간 소비전력(측정기인 경우), 자동/수동 전원
// 제어, 연결 해제를 한 곳에서 처리한다.
function DeviceSettingsModal({
  device,
  roomId,
  onClose,
  onRename,
  onToggleMode,
  onTogglePower,
  onSetBrightness,
  onDisconnect,
}: {
  device: Device | null;
  roomId: string | null;
  onClose: () => void;
  onRename: (roomId: string, deviceId: string, name: string) => void;
  onToggleMode: (roomId: string, deviceId: string) => void;
  onTogglePower: (roomId: string, deviceId: string) => void;
  onSetBrightness: (roomId: string, deviceId: string, brightness: number) => void;
  onDisconnect: (roomId: string, deviceId: string) => void;
}) {
  const [nameInput, setNameInput] = useState('');
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [powerStatus, setPowerStatus] = useState<PowerStatus | null>(null);

  useEffect(() => {
    if (device) {
      setNameInput(device.name);
      setConfirmDisconnect(false);
    }
  }, [device?.id]);

  useEffect(() => {
    if (!device || device.type !== 'power_monitor') {
      setPowerStatus(null);
      return;
    }
    let cancelled = false;
    const fetchLatest = () => {
      api
        .getLatestPower(device.id)
        .then((r) => {
          if (!cancelled) setPowerStatus(computePowerStatus(r.power_w, r.recorded_at));
        })
        .catch(() => {});
    };
    fetchLatest();
    const interval = setInterval(fetchLatest, WATT_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [device?.id, device?.type]);

  const handleSaveName = () => {
    if (roomId && device && nameInput.trim() && nameInput.trim() !== device.name) {
      onRename(roomId, device.id, nameInput.trim());
    }
  };

  const handleDisconnect = () => {
    if (roomId && device) onDisconnect(roomId, device.id);
    setConfirmDisconnect(false);
    onClose();
  };

  return (
    <Modal visible={!!device} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={() => {}}>
          {confirmDisconnect ? (
            <>
              <Text style={styles.modalTitle}>{device?.name} 연결을 해제할까요?</Text>
              <Text style={styles.confirmSubtitle}>다시 연결하려면 주변 기기 감지에서 새로 골라야 해요.</Text>
              <View style={styles.modalBottomRow}>
                <AnimatedPressable
                  style={styles.modalCloseButton}
                  onPress={() => setConfirmDisconnect(false)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.modalCloseText}>취소</Text>
                </AnimatedPressable>
                <AnimatedPressable style={styles.deleteButton} onPress={handleDisconnect} activeOpacity={0.7}>
                  <Text style={styles.deleteButtonText}>해제</Text>
                </AnimatedPressable>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.modalTitle}>기기 설정</Text>

              <View style={styles.renameRow}>
                <TextInput
                  style={styles.renameInput}
                  value={nameInput}
                  onChangeText={setNameInput}
                  onSubmitEditing={handleSaveName}
                  onBlur={handleSaveName}
                  placeholder="기기 이름"
                  placeholderTextColor={colors.textGray}
                  returnKeyType="done"
                  autoFocus
                />
                <AnimatedPressable style={styles.renameSaveButton} onPress={handleSaveName} activeOpacity={0.7}>
                  <Text style={styles.renameSaveText}>저장</Text>
                </AnimatedPressable>
              </View>

              {powerStatus?.kind === 'ok' && (
                <Text style={styles.deviceSectionHint}>실시간 소비전력: {Math.round(powerStatus.watt)}W</Text>
              )}
              {powerStatus?.kind === 'no-device' && (
                <Text style={styles.deviceSectionHint}>연결된 기기 없음</Text>
              )}
              {powerStatus?.kind === 'outlet-offline' && (
                <Text style={[styles.deviceSectionHint, styles.deviceOfflineHint]}>
                  해당 스마트 콘센트가 해제됨
                </Text>
              )}

              <View style={styles.deviceRow}>
                <Text style={styles.deviceName}>전원</Text>
                <View style={styles.deviceControls}>
                  <AnimatedPressable
                    style={[styles.modeToggle, device?.mode === 'manual' && styles.modeToggleManual]}
                    onPress={() => roomId && device && onToggleMode(roomId, device.id)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[styles.modeToggleText, device?.mode === 'manual' && styles.modeToggleTextManual]}
                    >
                      {device?.mode === 'auto' ? '자동' : '수동'}
                    </Text>
                  </AnimatedPressable>

                  {/* 조명(living-light-01)은 자동/수동 전환 없이 항상 바로 켜고 끌 수 있다 -
                      다른 기기는 기존대로 수동 모드일 때만 직접 제어된다. */}
                  {device?.mode === 'manual' || device?.id === 'living-light-01' ? (
                    <AnimatedPressable
                      style={[styles.statusBadge, device?.on ? styles.statusOn : styles.statusOff]}
                      onPress={() => roomId && device && onTogglePower(roomId, device.id)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.statusText, device?.on ? styles.statusTextOn : styles.statusTextOff]}>
                        {device?.on ? 'ON' : 'OFF'}
                      </Text>
                    </AnimatedPressable>
                  ) : (
                    <View style={[styles.statusBadge, device?.on ? styles.statusOn : styles.statusOff]}>
                      <Text style={[styles.statusText, device?.on ? styles.statusTextOn : styles.statusTextOff]}>
                        {device?.on ? 'ON' : 'OFF'}
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              {/* PWM 밝기 조절이 되는 조명(env_power_hub_node의 living-light-01)만 노출 - 다른
                  기기(Tapo 콘센트 등)는 on/off만 지원하므로 밝기 명령을 보내면 안 된다.
                  자동/수동 전환 없이 항상 바로 조절 가능. */}
              {device?.id === 'living-light-01' && (
                <View style={styles.deviceRow}>
                  <Text style={styles.deviceName}>밝기</Text>
                  <View style={styles.deviceControls}>
                    <AnimatedPressable
                      style={styles.modeToggle}
                      onPress={() =>
                        roomId && device && onSetBrightness(roomId, device.id, Math.max(0, device.brightness - 10))
                      }
                      activeOpacity={0.7}
                    >
                      <Text style={styles.modeToggleText}>−</Text>
                    </AnimatedPressable>
                    <Text style={styles.deviceName}>{device.brightness}%</Text>
                    <AnimatedPressable
                      style={styles.modeToggle}
                      onPress={() =>
                        roomId && device && onSetBrightness(roomId, device.id, Math.min(100, device.brightness + 10))
                      }
                      activeOpacity={0.7}
                    >
                      <Text style={styles.modeToggleText}>＋</Text>
                    </AnimatedPressable>
                  </View>
                </View>
              )}

              <AnimatedPressable
                style={styles.disconnectButton}
                onPress={() => setConfirmDisconnect(true)}
                activeOpacity={0.7}
              >
                <Text style={styles.disconnectButtonText}>연결 해제</Text>
              </AnimatedPressable>

              <AnimatedPressable
                style={[styles.modalCloseButton, styles.modalCloseButtonSolo]}
                onPress={onClose}
                activeOpacity={0.7}
              >
                <Text style={styles.modalCloseText}>닫기</Text>
              </AnimatedPressable>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function SmartHomeControlScreen() {
  const { height, width } = useAppWindowDimensions();
  const scale = Math.min(1, Math.max(MIN_SCALE, height / REFERENCE_HEIGHT));
  // 정확히 정사각형이 되도록 %/aspectRatio 대신 실제 픽셀 크기를 계산해서 쓴다.
  const cellSize = (width - SCREEN_PADDING * 2 - GRID_GAP) / 2;
  const { rooms, connectDevice, renameDevice, deleteDevice, toggleDeviceMode, toggleDevicePower, setDeviceBrightness } =
    useRooms();
  const room = rooms[0] ?? null;
  const [connectModalOpen, setConnectModalOpen] = useState(false);
  const [settingsDeviceId, setSettingsDeviceId] = useState<string | null>(null);

  const activeCount = rooms.reduce((sum, r) => sum + r.devices.filter((d) => d.on).length, 0);
  const settingsDevice = room?.devices.find((d) => d.id === settingsDeviceId) ?? null;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={[styles.content, { paddingTop: 20 * scale }]}>
        <ActiveDevicesCard scale={scale} count={activeCount} />
        <View style={{ height: 16 * scale }} />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 * scale }}>
          <View style={[styles.grid, { rowGap: GRID_GAP }]}>
            {room?.devices.map((device) => (
              <DeviceCard
                key={device.id}
                device={device}
                scale={scale}
                cellSize={cellSize}
                onPress={() => setSettingsDeviceId(device.id)}
              />
            ))}
            {room && <AddDeviceButton scale={scale} cellSize={cellSize} onPress={() => setConnectModalOpen(true)} />}
          </View>
        </ScrollView>
      </View>
      <View style={styles.bottomNavWrap}>
        <BottomNav variant="sub" />
      </View>
      <DeviceSettingsModal
        device={settingsDevice}
        roomId={room?.id ?? null}
        onClose={() => setSettingsDeviceId(null)}
        onRename={renameDevice}
        onToggleMode={toggleDeviceMode}
        onTogglePower={toggleDevicePower}
        onSetBrightness={setDeviceBrightness}
        onDisconnect={deleteDevice}
      />
      <ConnectDeviceModal
        visible={connectModalOpen}
        roomId={room?.id ?? null}
        onClose={() => setConnectModalOpen(false)}
        onConnect={connectDevice}
        onRename={renameDevice}
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
  // 켜진 기기 카드 좌상단에 표시하는 점.
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
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  deviceWattText: {
    fontFamily: fonts.jalnan,
    color: colors.textGray2,
    marginTop: 6,
  },
  deviceOfflineText: {
    color: colors.red,
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
  nearbyList: {
    maxHeight: 260,
    marginBottom: 14,
  },
  nearbyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 10,
  },
  nearbyLabel: {
    flex: 1,
    fontFamily: fonts.jalnan,
    fontSize: 14,
    color: colors.text,
  },
  connectButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: colors.orange,
  },
  connectButtonDone: {
    backgroundColor: colors.card,
  },
  connectButtonText: {
    fontFamily: fonts.jalnan,
    fontSize: 12,
    color: colors.white,
  },
  connectButtonTextDone: {
    color: colors.textGray,
  },
  renameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 18,
  },
  renameInput: {
    flex: 1,
    minWidth: 0,
    fontFamily: fonts.jalnan,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  renameSaveButton: {
    flexShrink: 0,
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
  // "기기 연결" 직후 이름 설정 화면의 저장 버튼 - modalCloseButtonSolo와 짝지어 폭 전체를 채운다.
  saveNameButton: {
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: colors.orange,
  },
  deviceSectionHint: {
    fontSize: 12,
    color: colors.textGray,
    lineHeight: 16,
    marginBottom: 10,
  },
  deviceOfflineHint: {
    color: colors.red,
    fontWeight: '600',
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
  disconnectButton: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: colors.card,
  },
  disconnectButtonText: {
    fontFamily: fonts.jalnan,
    fontSize: 14,
    color: colors.red,
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
  // 삭제 확인 등 짝을 이루는 버튼 없이 "닫기" 버튼 하나만 쓸 때는 flex:1이 세로로 늘어나
  // 보이므로 상쇄한다(MainScreen의 절전 목표 모달과 동일한 패턴).
  modalCloseButtonSolo: {
    flex: 0,
    flexBasis: 'auto',
    marginTop: 16,
  },
  modalCloseText: {
    fontFamily: fonts.jalnan,
    fontSize: 15,
    color: colors.text,
  },
});
