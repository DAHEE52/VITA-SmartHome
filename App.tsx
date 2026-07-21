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
import { GoalProvider } from './src/context/GoalContext';
import { DemoRoomsProvider } from './src/context/DemoRoomsContext';
import { EnergyHistoryProvider } from './src/context/EnergyHistoryContext';
import { NotificationsProvider } from './src/context/NotificationsContext';
import { CalendarProvider } from './src/context/CalendarContext';
import { PresenceProvider } from './src/context/PresenceContext';
import { AutomationProvider } from './src/context/AutomationContext';
import { SensorProvider } from './src/context/SensorContext';
import { FireSafetyProvider } from './src/context/FireSafetyContext';
import { SettingsProvider } from './src/context/SettingsContext';

// 네이티브 스플래시(앱 아이콘 로딩 화면)가 폰트 로딩 전에 자동으로 사라지지 않도록 유지시킨다.
SplashScreenModule.preventAutoHideAsync().catch(() => {});

export default function App() {
  const [fontsLoaded] = useFonts({
    // 키 이름이 곧 style의 fontFamily 값이 되므로 theme/colors.ts의 fonts.* 값과 반드시 일치해야 함
    Jalnan: require('./assets/fonts/Jalnan.ttf'),
    DungGeunMo: require('./assets/fonts/DungGeunMo.ttf'),
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
      {/* 자동화/전기요금/에너지나무/화재감지 등 신규 화면들이 쓰는 Context 레이어.
          DemoRooms 계열은 실제 백엔드(getRoomsStatus 등)와 무관한 순수 시뮬레이션이고,
          Calendar/Notifications만 실제 Supabase에 저장된다. 의존 순서: 아래 참고. */}
      <GoalProvider>
        <DemoRoomsProvider>
          <EnergyHistoryProvider>
            <NotificationsProvider>
              <CalendarProvider>
                <PresenceProvider>
                  <AutomationProvider>
                    <SensorProvider>
                      <FireSafetyProvider>
                        <SettingsProvider>
                          <RootNavigator />
                        </SettingsProvider>
                      </FireSafetyProvider>
                    </SensorProvider>
                  </AutomationProvider>
                </PresenceProvider>
              </CalendarProvider>
            </NotificationsProvider>
          </EnergyHistoryProvider>
        </DemoRoomsProvider>
      </GoalProvider>
    </View>
  );
}
