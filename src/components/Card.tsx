// 시안 전체에서 반복되는 "연회색 둥근 모서리 카드" 배경을 감싸는 공통 컴포넌트.
// 화면마다 이 컴포넌트로 감싸고 padding/margin만 style prop으로 덮어쓰면 된다.
import React, { ReactNode } from 'react';
import { View, StyleProp, ViewStyle, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';

type Props = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export default function Card({ children, style }: Props) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 20,
  },
});
