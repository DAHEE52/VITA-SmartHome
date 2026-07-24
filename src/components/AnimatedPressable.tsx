// 시안 전체에서 쓰던 TouchableOpacity의 드롭인 대체 컴포넌트 - opacity 페이드는 그대로 유지하면서
// 누르는 순간 살짝 축소됐다가 떼면 스프링으로 되돌아오는 스케일 애니메이션을 추가한다.
// props(activeOpacity 포함)를 TouchableOpacity와 동일하게 받으므로 호출부는 태그 이름과 import만 바꾸면 된다.
import React, { useRef } from 'react';
import { Animated, GestureResponderEvent, Pressable, PressableProps } from 'react-native';

const AnimatedPressableBase = Animated.createAnimatedComponent(Pressable);

type Props = Omit<PressableProps, 'style'> & {
  activeOpacity?: number;
  style?: any;
};

export default function AnimatedPressable({
  activeOpacity = 0.7,
  style,
  onPressIn,
  onPressOut,
  disabled,
  ...rest
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  const animateTo = (toScale: number, toOpacity: number) => {
    Animated.parallel([
      Animated.spring(scale, { toValue: toScale, useNativeDriver: true, speed: 50, bounciness: 6 }),
      Animated.timing(opacity, { toValue: toOpacity, duration: toScale === 1 ? 120 : 80, useNativeDriver: true }),
    ]).start();
  };

  const handlePressIn = (e: GestureResponderEvent) => {
    if (!disabled) animateTo(0.96, activeOpacity);
    onPressIn?.(e);
  };

  const handlePressOut = (e: GestureResponderEvent) => {
    if (!disabled) animateTo(1, 1);
    onPressOut?.(e);
  };

  return (
    <AnimatedPressableBase
      disabled={disabled}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[style, { transform: [{ scale }], opacity }]}
      {...rest}
    />
  );
}
