// 시안 1 - 스타팅(스플래시) 화면.
// 흰 배경 중앙보다 살짝 아래에 VITA 로고 + 태그라인만 표시하고,
// 1.4초 뒤 자동으로 메인화면으로 넘어간다 (실제 앱의 로딩 연출을 흉내).
import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../theme/colors';
import VitaLogo from '../components/VitaLogo';

export default function SplashScreen() {
  const navigation = useNavigation<any>();

  useEffect(() => {
    // replace를 써서 스플래시 화면이 스택(뒤로가기 히스토리)에 남지 않게 함
    const timer = setTimeout(() => {
      navigation.replace('Main');
    }, 1400);
    return () => clearTimeout(timer);
  }, [navigation]);

  return (
    <View style={styles.container}>
      <View style={styles.logoWrap}>
        <VitaLogo size={64} showTagline />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.white,
  },
  logoWrap: {
    // 원본 시안에서 로고가 화면 세로 중앙보다 살짝 위쪽(전체 높이의 약 40% 지점)에 위치함
    position: 'absolute',
    top: '32%',
    width: '100%',
    alignItems: 'center',
  },
});
