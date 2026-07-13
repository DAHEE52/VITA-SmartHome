// 대부분의 화면 하단에 공통으로 깔리는 네비게이션 바.
// 메인화면: 사이렌(빨강) / 홈 / 북(가이드북) 3개 아이콘
// 서브화면(스마트홈제어/에너지/캘린더/헬스케어): 홈 1개 아이콘만 중앙에 배치
// -> variant prop으로 두 레이아웃을 한 컴포넌트에서 처리한다.
import React from 'react';
import { View, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import BookSvg from '../../UIUX/icon/guidebook.svg';

// 경보/알람 메뉴 아이콘
function SirenIcon({ size }: { size: number }) {
  return (
    <Image
      source={require('../../UIUX/icon/4-비상벨.png')}
      style={{ width: size, height: size }}
      resizeMode="contain"
    />
  );
}

// 홈 아이콘
function HomeIcon({ size }: { size: number }) {
  return (
    <Image
      source={require('../../UIUX/icon/7-홈화면.png')}
      style={{ width: size, height: size }}
      resizeMode="contain"
    />
  );
}

// 가이드/설명서 메뉴 아이콘.
// guidebook.svg는 원본 viewBox 안에서 실제 내용이 차지하는 비율이 홈 아이콘 png보다 작아서
// (특히 세로 방향) 같은 size를 줘도 눈에 띄게 작아 보인다. 체감 크기를 홈 아이콘과 맞추기 위해
// 1.2배 보정한 크기로 렌더링한다.
const BOOK_SIZE_COMPENSATION = 1.2;

function BookIcon({ size }: { size: number }) {
  const compensated = size * BOOK_SIZE_COMPENSATION;
  return <BookSvg width={compensated} height={compensated} />;
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
        {/* 사이렌 탭은 아직 연결할 화면이 없어 현재는 시각적 요소로만 존재 */}
        <TouchableOpacity hitSlop={16}>
          <SirenIcon size={iconSize} />
        </TouchableOpacity>
      </View>
      <View style={styles.mainCol}>
        <TouchableOpacity onPress={() => navigation.navigate('Main')} hitSlop={16}>
          <HomeIcon size={iconSize} />
        </TouchableOpacity>
      </View>
      <View style={styles.mainCol}>
        <TouchableOpacity hitSlop={16}>
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
