// 메인화면 헤더의 "메뉴"(햄버거) 아이콘을 누르면 뜨는 전체 기능 목록 창.
// 메인화면 하단에 이미 바로가기 카드(스마트홈 제어/캘린더/에너지 사용량/에너지 나무)가 있는
// 화면은 여기서 중복으로 보여주지 않고, 그 카드들에 없는 나머지 화면(자동화 규칙/화재 예방
// 시스템/안전 가이드북/전기요금 영수증 미리보기/설정)만 모아둔다.
// "취침 모드 관리"는 별도 화면이 아니라 자동화 규칙 화면 안의 "🛏 취침 모드" 버튼으로 옮겨졌다.
// 수면 통계 화면(SleepStatsScreen)은 기능 자체를 제거했다 - 취침 감지/자동 대응(SleepContext)만 남는다.
// 홈은 하단 네비게이션(BottomNav)에 이미 있으므로 여기서는 중복으로 넣지 않는다.
import React from 'react';
import { Modal, Pressable, View, Text, Image, StyleSheet } from 'react-native';
import AnimatedPressable from './AnimatedPressable';
import { useNavigation } from '@react-navigation/native';

import { colors, fonts } from '../theme/colors';
import { AutomationIcon, GearIcon } from './icons';

type MenuItem = {
  key: string;
  label: string;
  route: string;
  renderIcon: () => React.ReactNode;
};

const ICON_SIZE = 26;

const MENU_ITEMS: MenuItem[] = [
  {
    key: 'automation',
    label: '자동화 규칙',
    route: 'Automation',
    renderIcon: () => <AutomationIcon size={ICON_SIZE} />,
  },
  {
    key: 'fire',
    label: '화재 예방 시스템',
    route: 'FirePrevention',
    renderIcon: () => (
      <Image
        source={require('../../assets/icons/4-emergency-bell.png')}
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
        source={require('../../assets/icons/8-guidebook.png')}
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
        source={require('../../assets/icons/7-receipt.png')}
        style={{ width: ICON_SIZE, height: ICON_SIZE }}
        resizeMode="contain"
      />
    ),
  },
  {
    key: 'settings',
    label: '설정',
    route: 'Settings',
    renderIcon: () => <GearIcon size={ICON_SIZE} />,
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
            <AnimatedPressable
              key={item.key}
              style={[styles.row, i === MENU_ITEMS.length - 1 && styles.rowLast]}
              onPress={() => goTo(item.route)}
              activeOpacity={0.7}
            >
              <View style={styles.iconWrap}>{item.renderIcon()}</View>
              <Text style={styles.rowLabel}>{item.label}</Text>
            </AnimatedPressable>
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
  rowLabel: {
    fontFamily: fonts.jalnan,
    fontSize: 15,
    color: colors.text,
  },
});
