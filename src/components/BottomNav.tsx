// 대부분의 화면 하단에 공통으로 깔리는 네비게이션 바.
// 메인화면: 사이렌(빨강) / 홈 / 북(가이드북) 3개 아이콘
// 서브화면(스마트홈제어/에너지/캘린더/헬스케어): 뒤로가기(undo 화살표) / 홈 2개 아이콘
// -> variant prop으로 두 레이아웃을 한 컴포넌트에서 처리한다.
import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Path, Rect, Circle } from 'react-native-svg';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../theme/colors';

// 빨간 사이렌 아이콘 (경보/알람 메뉴). 돔 + 받침대 형태를 단순화해서 표현.
function SirenIcon({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path
        d="M30 62 C30 38 70 38 70 62 L70 68 L30 68 Z"
        fill={colors.red}
      />
      <Rect x={26} y={68} width={48} height={10} rx={3} fill={colors.red} />
      <Rect x={16} y={82} width={68} height={8} rx={3} fill={colors.text} />
      <Rect x={46} y={26} width={8} height={14} rx={3} fill={colors.red} />
    </Svg>
  );
}

// 집 모양 홈 아이콘 (외곽선만, 채우기 없음)
function HomeIcon({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path
        d="M14 54 L50 20 L86 54 L86 84 L14 84 Z"
        fill="none"
        stroke={colors.text}
        strokeWidth={7}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Svg>
  );
}

// 펼쳐진 책 모양 아이콘 (가이드/설명서 메뉴)
function BookIcon({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path
        d="M50 26 C42 20 26 18 16 20 L16 76 C26 74 42 76 50 82"
        fill="none"
        stroke={colors.text}
        strokeWidth={6}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <Path
        d="M50 26 C58 20 74 18 84 20 L84 76 C74 74 58 76 50 82"
        fill="none"
        stroke={colors.text}
        strokeWidth={6}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <Path d="M50 26 L50 82" stroke={colors.text} strokeWidth={5} />
    </Svg>
  );
}

// 뒤로가기(되돌리기) 화살표 아이콘. 서브화면 좌측 하단에 쓰임.
function BackIcon({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path
        d="M70 30 L70 60 C70 68 64 74 56 74 L20 74"
        fill="none"
        stroke={colors.text}
        strokeWidth={7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M34 58 L18 74 L34 90"
        fill="none"
        stroke={colors.text}
        strokeWidth={7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

type Props = {
  /** 'main' = 사이렌/홈/북 3개, 'sub' = 뒤로가기/홈 2개 */
  variant?: 'main' | 'sub';
};

export default function BottomNav({ variant = 'main' }: Props) {
  const navigation = useNavigation<any>();
  const iconSize = 44;

  if (variant === 'sub') {
    return (
      <View style={styles.subRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={16}>
          <BackIcon size={iconSize} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate('Main')} hitSlop={16}>
          <HomeIcon size={iconSize} />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.mainRow}>
      {/* 사이렌 탭은 아직 연결할 화면이 없어 현재는 시각적 요소로만 존재 */}
      <TouchableOpacity hitSlop={16}>
        <SirenIcon size={iconSize} />
      </TouchableOpacity>
      <TouchableOpacity onPress={() => navigation.navigate('Main')} hitSlop={16}>
        <HomeIcon size={iconSize} />
      </TouchableOpacity>
      <TouchableOpacity hitSlop={16}>
        <BookIcon size={iconSize} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  mainRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 36,
    alignItems: 'center',
  },
  subRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 48,
    alignItems: 'center',
  },
});
