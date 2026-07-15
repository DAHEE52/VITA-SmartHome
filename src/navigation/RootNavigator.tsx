// 앱 전체 화면 전환을 담당하는 최상위 네비게이터.
// UIUX 폴더의 시안 번호(1,3,4,5,6)에 대응해서 라우트 이름을 지었다.
// (2번, 7번 시안은 아직 전달되지 않아 화면이 없음 - 나중에 추가되면 여기에 Screen만 추가하면 됨)
// 8번(헬스케어) 시안은 삭제하고, 시안이 따로 없는 신규 화면인 "에너지 나무"로 그 자리를 대체했다.
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import SplashScreen from '../screens/SplashScreen';
import MainScreen from '../screens/MainScreen';
import SmartHomeControlScreen from '../screens/SmartHomeControlScreen';
import EnergyUsageScreen from '../screens/EnergyUsageScreen';
import CalendarScreen from '../screens/CalendarScreen';
import EnergyTreeScreen from '../screens/EnergyTreeScreen';
import GuidebookScreen from '../screens/GuidebookScreen';
import BillReceiptScreen from '../screens/BillReceiptScreen';
import FirePreventionScreen from '../screens/FirePreventionScreen';
import SettingsScreen from '../screens/SettingsScreen';

// 각 화면이 받는 파라미터 타입 정의. 전부 파라미터 없이 이동하므로 undefined.
// 새 화면을 추가할 땐 여기 타입과 아래 <Stack.Screen> 둘 다 추가해야 함.
export type RootStackParamList = {
  Splash: undefined;
  Main: undefined;
  SmartHomeControl: undefined;
  EnergyUsage: undefined;
  Calendar: undefined;
  EnergyTree: undefined;
  Guidebook: undefined;
  BillReceipt: undefined;
  FirePrevention: undefined;
  Settings: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Splash"
        // 시안에 자체 헤더(뒤로가기 화살표 등)가 이미 그려져 있으므로
        // 네비게이션 라이브러리의 기본 헤더는 끄고 화면마다 직접 그린다.
        screenOptions={{ headerShown: false, animation: 'fade' }}
      >
        <Stack.Screen name="Splash" component={SplashScreen} />
        <Stack.Screen name="Main" component={MainScreen} />
        <Stack.Screen name="SmartHomeControl" component={SmartHomeControlScreen} />
        <Stack.Screen name="EnergyUsage" component={EnergyUsageScreen} />
        <Stack.Screen name="Calendar" component={CalendarScreen} />
        <Stack.Screen name="EnergyTree" component={EnergyTreeScreen} />
        <Stack.Screen name="Guidebook" component={GuidebookScreen} />
        <Stack.Screen name="BillReceipt" component={BillReceiptScreen} />
        <Stack.Screen name="FirePrevention" component={FirePreventionScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
