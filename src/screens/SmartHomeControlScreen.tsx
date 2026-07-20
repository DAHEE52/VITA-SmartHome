// 시안 4 - 스마트홈 제어 화면.
// 구조: 활성화된 기기 수 카드 / 방(Room) 카드 2x2 그리드(마지막 칸은 방 추가 버튼) / 하단 네비(뒤로가기·홈)
import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';

import { colors, fonts } from '../theme/colors';
import Card from '../components/Card';
import BottomNav from '../components/BottomNav';
import { EllipsisIcon, PlusIcon } from '../components/icons';
import { controlDevice, getRoomsStatus, RoomStatus } from '../api/client';

// 현재 켜져있는 기기 대수를 보여주는 상단 카드
function ActiveDevicesCard({ count }: { count: number }) {
  return (
    <Card style={styles.activeCard}>
      <Text style={styles.activeLabel}>현재 활성화된 기기</Text>
      <Text style={styles.activeCount}>{count}대</Text>
    </Card>
  );
}

// 방 하나를 나타내는 카드.
// active === true 인 방(현재는 거실만)은 좌상단에 초록 점으로 "기기 켜짐" 상태를 표시한다.
function RoomCard({
  label,
  active,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity style={[styles.gridCell, styles.roomCard]} onPress={onPress} activeOpacity={0.8}>
      {active && <View style={styles.activeDot} />}
      <View style={styles.ellipsisWrap}>
        <EllipsisIcon size={22} />
      </View>
      <Text style={styles.roomLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

// 새 방을 추가하는 원형 "+" 버튼. 다른 방 카드와 달리 배경 카드 없이 원만 떠 있음.
function AddRoomButton() {
  return (
    <View style={styles.gridCell}>
      <TouchableOpacity style={styles.addCircle} activeOpacity={0.7}>
        <PlusIcon size={26} />
      </TouchableOpacity>
    </View>
  );
}

export default function SmartHomeControlScreen() {
  const [rooms, setRooms] = useState<RoomStatus[]>([]);

  const loadRooms = useCallback(() => {
    getRoomsStatus()
      .then(setRooms)
      .catch((err) => console.warn('방 상태 조회 실패:', err));
  }, []);

  // 다른 화면 갔다가 돌아올 때마다 최신 기기 상태로 다시 불러온다.
  useFocusEffect(loadRooms);

  const activeCount = rooms.reduce(
    (sum, room) => sum + room.devices.filter((d) => d.state === 'on').length,
    0
  );

  // 방마다 릴레이 기기가 하나라고 가정하고, 탭하면 그 기기를 토글한다(메이커톤 프로토타입 범위).
  const handleToggleRoom = (room: RoomStatus) => {
    const target = room.devices.find((d) => d.type === 'relay') ?? room.devices[0];
    if (!target) return;
    const next = target.state === 'on' ? 'off' : 'on';
    controlDevice(target.id, next)
      .then(() => loadRooms())
      .catch((err) => console.warn('기기 제어 실패:', err));
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <ActiveDevicesCard count={activeCount} />
        <View style={styles.grid}>
          {rooms.map((room) => (
            <RoomCard
              key={room.room}
              label={room.room}
              active={room.active}
              onPress={() => handleToggleRoom(room)}
            />
          ))}
          <AddRoomButton />
        </View>
      </View>
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
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
  },

  activeCard: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  activeLabel: {
    fontFamily: fonts.jalnan,
    fontSize: 22,
    color: colors.text,
  },
  activeCount: {
    fontFamily: fonts.jalnan,
    fontSize: 48,
    color: colors.text,
    marginTop: 14,
  },

  grid: {
    marginTop: 20,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 16,
  },
  // 2열 그리드의 한 칸. width 48%로 두 칸 + 여백이 한 줄에 맞도록 함.
  gridCell: {
    width: '48%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roomCard: {
    backgroundColor: colors.card,
    borderRadius: 20,
  },
  activeDot: {
    position: 'absolute',
    top: 18,
    left: 18,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.green,
  },
  ellipsisWrap: {
    position: 'absolute',
    top: 16,
    right: 16,
  },
  roomLabel: {
    fontFamily: fonts.jalnan,
    fontSize: 22,
    color: colors.text,
  },
  addCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },

  bottomNavWrap: {
    paddingHorizontal: 20,
    paddingBottom: 10,
    paddingTop: 6,
  },
});
