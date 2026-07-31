// 앱 진입점.
// 1) 커스텀 폰트(Jalnan, DungGeunMo)를 미리 로드하고
// 2) 로드가 끝나기 전에는 흰 화면만 보여줘서 폰트가 늦게 바뀌며 깜빡이는 현상(FOUT)을 막은 뒤
// 3) 로드가 끝나면 RootNavigator로 실제 화면들을 렌더링한다.
import React, { useCallback } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreenModule from 'expo-splash-screen';
import { useFonts } from 'expo-font';

import RootNavigator from './src/navigation/RootNavigator';
import { WEB_MAX_WIDTH } from './src/hooks/useAppWindowDimensions';
import { GoalProvider } from './src/context/GoalContext';
import { RoomsProvider } from './src/context/RoomsContext';
import { EnergyHistoryProvider } from './src/context/EnergyHistoryContext';
import { NotificationsProvider } from './src/context/NotificationsContext';
import { FireSafetyProvider } from './src/context/FireSafetyContext';
import { EmergencyContactsProvider } from './src/context/EmergencyContactsContext';
import { SettingsProvider } from './src/context/SettingsContext';
import { CalendarProvider } from './src/context/CalendarContext';
import { HomeSummaryProvider } from './src/context/HomeSummaryContext';
import { PresenceProvider } from './src/context/PresenceContext';
import { AutomationProvider } from './src/context/AutomationContext';
import { SensorProvider } from './src/context/SensorContext';
import { SleepProvider } from './src/context/SleepContext';

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
    <SafeAreaProvider>
      {/* 웹에서 노트북 등 넓은 창으로 열었을 때 앱이 브라우저 폭 전체로 늘어지지 않도록, 폰 폭(WEB_MAX_WIDTH)으로
          가운데 정렬해 보여준다. 네이티브(폰 실기기)에서는 항상 화면 폭이 이보다 좁으므로 기존과 동일하게 꽉 채운다. */}
      <View style={styles.webBackdrop}>
        <View style={styles.webFrame} onLayout={onLayoutRootView}>
          <StatusBar style="dark" />
          {/* NotificationsProvider를 가장 바깥에 둔 이유: 저장 실패 시 되돌리고(rollback) 사용자에게
              보이는 알림도 띄우는 낙관적 업데이트 패턴(rollbackOnFailure)을 GoalContext/RoomsContext를
              포함한 모든 하위 Context에서 쓰려면, 그 아래(자손)에서만 useNotifications()를 호출할 수
              있는 React Context 규칙상 Notifications가 전부를 감싸야 한다. */}
          <NotificationsProvider>
            <GoalProvider>
              <RoomsProvider>
                <EnergyHistoryProvider>
                  <CalendarProvider>
                    {/* HomeSummaryProvider는 /home/summary를 한 번만 폴링해서 아래 4개 Context
                        (Presence/Sleep/FireSafety/Automation)가 나눠 구독하게 한다 - 예전에는 넷이
                        각자 따로 폴링해서 같은 데이터를 4배 더 자주 요청했다. */}
                    <HomeSummaryProvider>
                      <PresenceProvider>
                        <SensorProvider>
                          <SleepProvider>
                            {/* AutomationProvider는 SleepProvider 아래(자손)에 있어야 한다 - 자동화 규칙의
                                "취침 모드" 트리거가 useSleep()으로 SleepContext의 상태를 읽기 때문. */}
                            <AutomationProvider>
                              {/* EmergencyContactsProvider는 FireSafetyProvider보다 위(조상)에 있어야 한다 -
                                  화재 확인 시간 초과 시 자동으로 비상 연락망에 알림을 보내려면
                                  FireSafetyContext가 useEmergencyContacts()로 이 목록을 읽어야 하기 때문. */}
                              <EmergencyContactsProvider>
                                <FireSafetyProvider>
                                  <SettingsProvider>
                                    <RootNavigator />
                                  </SettingsProvider>
                                </FireSafetyProvider>
                              </EmergencyContactsProvider>
                            </AutomationProvider>
                          </SleepProvider>
                        </SensorProvider>
                      </PresenceProvider>
                    </HomeSummaryProvider>
                  </CalendarProvider>
                </EnergyHistoryProvider>
              </RoomsProvider>
            </GoalProvider>
          </NotificationsProvider>
        </View>
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  webBackdrop: {
    flex: 1,
    ...(Platform.OS === 'web' ? { alignItems: 'center', backgroundColor: '#1c1c1e' } : null),
  },
  webFrame: {
    flex: 1,
    width: '100%',
    ...(Platform.OS === 'web' ? { maxWidth: WEB_MAX_WIDTH } : null),
  },
});
