// 대부분의 화면 하단에 공통으로 깔리는 네비게이션 바.
// 메인화면: 사이렌(빨강) / 홈 / 북(가이드북) 3개 아이콘
// 서브화면(스마트홈제어/에너지/캘린더/헬스케어): 홈 1개 아이콘만 중앙에 배치
// -> variant prop으로 두 레이아웃을 한 컴포넌트에서 처리한다.
import React from 'react';
import { View, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';

// 경보/알람 메뉴 아이콘
function SirenIcon({ size }: { size: number }) {
  return (
    <Image
      source={require('../../assets/icons/4-emergency-bell.png')}
      style={{ width: size, height: size }}
      resizeMode="contain"
    />
  );
}

// 홈 아이콘
function HomeIcon({ size }: { size: number }) {
  return (
    <Image
      source={require('../../assets/icons/5-home.png')}
      style={{ width: size, height: size }}
      resizeMode="contain"
    />
  );
}

// 가이드/설명서 메뉴 아이콘
function BookIcon({ size }: { size: number }) {
  return (
    <Image
      source={require('../../assets/icons/8-guidebook.png')}
      style={{ width: size, height: size }}
      resizeMode="contain"
    />
  );
}

type Props = {
  /** 'main' = 사이렌/홈/북 3개, 'sub' = 홈 1개(중앙) */
  variant?: 'main' | 'sub';
};

export default function BottomNav({ variant = 'main' }: Props) {
  const navigation = useNavigation<any>();
  const iconSize = 38;

  if (variant === 'sub') {
    return (
      <View style={styles.subRow}>
        <TouchableOpacity onPress={() => navigation.navigate('Main')} hitSlop={16}>
          <HomeIcon size={iconSize} />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.mainRow}>
      {/* 3칸을 동일한 flex:1 컬럼으로 나눠 각 아이콘을 칸 중앙에 배치.
          아이콘마다 svg 원본 비율이 달라 실제 렌더 폭이 제각각이므로,
          space-between처럼 아이콘 자체 크기에 좌우되는 정렬 대신 이 방식을 써야
          가운데 칸(홈)이 항상 행의 정확한 가로 중앙에 온다. */}
      <View style={styles.mainCol}>
        <TouchableOpacity onPress={() => navigation.navigate('FirePrevention')} hitSlop={16}>
          <SirenIcon size={iconSize} />
        </TouchableOpacity>
      </View>
      <View style={styles.mainCol}>
        <TouchableOpacity onPress={() => navigation.navigate('Main')} hitSlop={16}>
          <HomeIcon size={iconSize} />
        </TouchableOpacity>
      </View>
      <View style={styles.mainCol}>
        <TouchableOpacity onPress={() => navigation.navigate('Guidebook')} hitSlop={16}>
          <BookIcon size={iconSize} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  mainCol: {
    flex: 1,
    alignItems: 'center',
  },
  subRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
