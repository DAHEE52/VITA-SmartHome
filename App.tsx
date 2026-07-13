// 앱 진입점.
// 1) 커스텀 폰트(Jalnan, DungGeunMo)를 미리 로드하고
// 2) 로드가 끝나기 전에는 흰 화면만 보여줘서 폰트가 늦게 바뀌며 깜빡이는 현상(FOUT)을 막은 뒤
// 3) 로드가 끝나면 RootNavigator로 실제 화면들을 렌더링한다.
import React, { useCallback } from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreenModule from 'expo-splash-screen';
import { useFonts } from 'expo-font';

import RootNavigator from './src/navigation/RootNavigator';

// 네이티브 스플래시(앱 아이콘 로딩 화면)가 폰트 로딩 전에 자동으로 사라지지 않도록 유지시킨다.
SplashScreenModule.preventAutoHideAsync().catch(() => {});

export default function App() {
  const [fontsLoaded] = useFonts({
    // 키 이름이 곧 style의 fontFamily 값이 되므로 theme/colors.ts의 fonts.* 값과 반드시 일치해야 함
    Jalnan: require('./assets/fonts/Jalnan.ttf'),
    DungGeunMo: require('./assets/fonts/DungGeunMo.ttf'),
    'DSEG7Classic-Bold': require('./assets/fonts/DSEG7Classic-Bold.ttf'),
  });

  // 폰트 로딩이 끝난 직후 레이아웃이 그려지면 그때 네이티브 스플래시를 감춘다.
  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded) {
      await SplashScreenModule.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <View style={{ flex: 1 }} onLayout={onLayoutRootView}>
      <StatusBar style="dark" />
      <RootNavigator />
    </View>
  );
}
