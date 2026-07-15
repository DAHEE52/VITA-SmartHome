// 메인화면 헤더의 "메뉴"(햄버거) 아이콘을 누르면 뜨는 전체 기능 목록 창.
// 앱에 구현되어 있는 화면(홈/스마트홈 제어/캘린더/에너지 사용량/에너지 나무/화재 예방 시스템/
// 안전 가이드북/전기요금 영수증 미리보기/설정)으로 바로 이동할 수 있는 버튼을 한 곳에 모아둔다.
import React from 'react';
import { Modal, Pressable, View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { colors, fonts } from '../theme/colors';
import { RemoteIcon, CalendarIcon, ChartUpIcon, TreeIcon } from './icons';

type MenuItem = {
  key: string;
  label: string;
  route: string;
  renderIcon: () => React.ReactNode;
};

const ICON_SIZE = 26;

const MENU_ITEMS: MenuItem[] = [
  { key: 'home', label: '홈', route: 'Main', renderIcon: () => <Text style={styles.itemEmoji}>🏠</Text> },
  {
    key: 'smarthome',
    label: '스마트홈 제어',
    route: 'SmartHomeControl',
    renderIcon: () => <RemoteIcon size={ICON_SIZE} />,
  },
  { key: 'calendar', label: '캘린더', route: 'Calendar', renderIcon: () => <CalendarIcon size={ICON_SIZE} /> },
  {
    key: 'energy',
    label: '에너지 사용량',
    route: 'EnergyUsage',
    renderIcon: () => <ChartUpIcon size={ICON_SIZE} />,
  },
  { key: 'tree', label: '에너지 나무', route: 'EnergyTree', renderIcon: () => <TreeIcon size={ICON_SIZE} /> },
  {
    key: 'fire',
    label: '화재 예방 시스템',
    route: 'FirePrevention',
    renderIcon: () => (
      <Image
        source={require('../../UIUX/icon/4-비상벨.png')}
        style={{ width: ICON_SIZE, height: ICON_SIZE }}
        resizeMode="contain"
      />
    ),
  },
  {
    key: 'guidebook',
    label: '안전 가이드북',
    route: 'Guidebook',
    renderIcon: () => (
      <Image
        source={require('../../UIUX/icon/11-가이드북.png')}
        style={{ width: ICON_SIZE, height: ICON_SIZE }}
        resizeMode="contain"
      />
    ),
  },
  {
    key: 'bill',
    label: '전기요금 영수증 미리보기',
    route: 'BillReceipt',
    renderIcon: () => (
      <Image
        source={require('../../UIUX/icon/10-영수증.png')}
        style={{ width: ICON_SIZE, height: ICON_SIZE }}
        resizeMode="contain"
      />
    ),
  },
  {
    key: 'settings',
    label: '설정',
    route: 'Settings',
    renderIcon: () => <Text style={styles.itemEmoji}>⚙️</Text>,
  },
];

export default function MenuModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const navigation = useNavigation<any>();

  const goTo = (route: string) => {
    onClose();
    navigation.navigate(route);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.panel} onPress={() => {}}>
          <Text style={styles.title}>메뉴</Text>
          {MENU_ITEMS.map((item, i) => (
            <TouchableOpacity
              key={item.key}
              style={[styles.row, i === MENU_ITEMS.length - 1 && styles.rowLast]}
              onPress={() => goTo(item.route)}
              activeOpacity={0.7}
            >
              <View style={styles.iconWrap}>{item.renderIcon()}</View>
              <Text style={styles.rowLabel}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  panel: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 20,
  },
  title: {
    fontFamily: fonts.jalnan,
    fontSize: 18,
    color: colors.text,
    textAlign: 'center',
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  iconWrap: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemEmoji: {
    fontSize: 24,
  },
  rowLabel: {
    fontFamily: fonts.jalnan,
    fontSize: 15,
    color: colors.text,
  },
});
