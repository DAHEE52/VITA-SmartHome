// 시안 3 - 메인화면.
// 구조(위→아래): 헤더 / 시계 카드 / 습도·온도·스트레스 카드 / 오늘의 절전목표 카드
//              / 4개 메뉴 바로가기 / 하단 네비(사이렌·홈·북)
//
// 화면을 스크롤 없이 한 번에 다 보여줘야 하므로, 화면 높이가 작은 기기(iPhone SE 등)에서도
// 안 잘리도록 useWindowDimensions로 화면 높이를 재서 카드 padding/폰트 크기를 함께 줄이는
// `scale` 값을 만들어 쓴다. 큰 화면에서는 scale=1(원래 크기), 작은 화면일수록 최대 22%까지 축소.
import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';

import { colors, fonts } from '../theme/colors';
import Card from '../components/Card';
import VitaLogo from '../components/VitaLogo';
import BottomNav from '../components/BottomNav';
import { getHomeSummary, HomeSummary } from '../api/client';
import {
  MenuIcon,
  BellIcon,
  GearIcon,
  DropletIcon,
  ThermometerIcon,
  SmileyIcon,
  BoltOutlineIcon,
  RunnerIcon,
  FlagIcon,
  RemoteIcon,
  CalendarIcon,
  ChartUpIcon,
  HeartPulseIcon,
} from '../components/icons';

// 디자인 기준 높이(iPhone 14 등 표준 화면). 이보다 작은 기기에서만 scale이 1 밑으로 내려간다.
const REFERENCE_HEIGHT = 820;
const MIN_SCALE = 0.78;

// 상단 헤더: 좌측 VITA 로고, 우측 메뉴/알림/설정 아이콘 3개
function Header() {
  return (
    <View style={styles.header}>
      <VitaLogo size={26} />
      <View style={styles.headerIcons}>
        <TouchableOpacity hitSlop={12}>
          <MenuIcon size={30} />
        </TouchableOpacity>
        <TouchableOpacity hitSlop={12}>
          <BellIcon size={30} />
        </TouchableOpacity>
        <TouchableOpacity hitSlop={12}>
          <GearIcon size={30} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// 요일 + 현재 시각 카드. 시간 숫자만 픽셀 폰트(DungGeunMo)를 써서 디지털 시계 느낌을 낸다.
// 요청에 따라 시간 텍스트를 크게 키우고, 카드 안에서 가운데 정렬되도록 구성.
function TimeCard({ scale }: { scale: number }) {
  return (
    <Card style={[styles.timeCard, { padding: 20 * scale }]}>
      <Text style={[styles.dayLabel, { fontSize: 26 * scale }]}>Wen</Text>
      <Text style={[styles.timeText, { fontSize: 92 * scale, marginTop: 4 * scale }]}>
        10:28
      </Text>
    </Card>
  );
}

// 내부 습도 / 실내 온도 / 스트레스 3열 위젯
// humidity/temperature는 env_presence_node(BME280) 실측값, null이면 아직 값을 못 받아온 상태(대시로 표시)
function StatusCard({
  scale,
  humidity,
  temperature,
}: {
  scale: number;
  humidity: number | null;
  temperature: number | null;
}) {
  const iconWrapStyle = [styles.statusIconWrap, { height: 60 * scale, marginTop: 14 * scale }];
  const valueStyle = [styles.statusValue, { fontSize: 19 * scale, marginTop: 14 * scale }];
  const labelStyle = [styles.statusLabel, { fontSize: 16 * scale }];
  return (
    <Card style={[styles.statusCard, { padding: 20 * scale }]}>
      <View style={styles.statusRow}>
        <View style={styles.statusCol}>
          <Text style={labelStyle}>내부 습도</Text>
          <View style={iconWrapStyle}>
            <DropletIcon size={48 * scale} />
          </View>
          <Text style={valueStyle}>{humidity !== null ? `${humidity.toFixed(0)} %` : '—'}</Text>
        </View>
        <View style={styles.statusCol}>
          <Text style={labelStyle}>실내 온도</Text>
          <View style={iconWrapStyle}>
            <ThermometerIcon size={48 * scale} />
          </View>
          <Text style={valueStyle}>{temperature !== null ? `${temperature.toFixed(1)} °C` : '—'}</Text>
        </View>
        <View style={styles.statusCol}>
          <Text style={labelStyle}>스트레스</Text>
          <View style={iconWrapStyle}>
            <SmileyIcon size={56 * scale} />
          </View>
          <Text style={valueStyle}>좋음</Text>
        </View>
      </View>
    </Card>
  );
}

// 오늘의 절전 목표 - 달성률 progress bar (달리는 사람 = 현재 지점, 깃발 = 목표 지점)
function GoalCard({ scale }: { scale: number }) {
  const progress = 42; // 절전 목표 달성률(%). 실제 앱에서는 서버 데이터로 교체될 값.
  return (
    <Card style={[styles.goalCard, { padding: 20 * scale }]}>
      <View style={styles.goalTitleRow}>
        <BoltOutlineIcon size={22 * scale} />
        <Text style={[styles.goalTitle, { fontSize: 19 * scale }]}>오늘의 절전 목표</Text>
      </View>
      <View style={[styles.progressTrackWrap, { marginTop: 46 * scale }]}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>
        {/* 달리는 사람 아이콘을 현재 달성률 위치 위에 겹쳐서 그림 */}
        <View style={[styles.runnerWrap, { left: `${progress}%`, marginLeft: -20 * scale }]}>
          <RunnerIcon size={40 * scale} />
        </View>
        {/* 목표 깃발은 항상 바의 맨 오른쪽(100%) 끝에 위치 */}
        <View style={styles.flagWrap}>
          <FlagIcon size={40 * scale} />
        </View>
      </View>
      <Text style={[styles.progressPercent, { fontSize: 16 * scale, marginTop: 14 * scale }]}>
        {progress}%
      </Text>
    </Card>
  );
}

// 스마트홈 제어 / 캘린더 / 에너지 사용량 / 헬스케어로 이동하는 4개 바로가기 카드
function MenuGrid({ scale }: { scale: number }) {
  const navigation = useNavigation<any>();
  const items = [
    { label: '스마트홈 제어', Icon: RemoteIcon, route: 'SmartHomeControl' },
    { label: '캘린더', Icon: CalendarIcon, route: 'Calendar' },
    { label: '에너지 사용량', Icon: ChartUpIcon, route: 'EnergyUsage' },
    { label: '헬스케어', Icon: HeartPulseIcon, route: 'Healthcare' },
  ] as const;

  return (
    <View style={styles.menuRow}>
      {items.map(({ label, Icon, route }) => (
        <TouchableOpacity
          key={label}
          style={[styles.menuItem, { paddingVertical: 20 * scale, gap: 10 * scale }]}
          onPress={() => navigation.navigate(route)}
        >
          <Icon size={34 * scale} />
          <Text style={[styles.menuLabel, { fontSize: 12 * scale }]}>{label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function MainScreen() {
  const { height } = useWindowDimensions();
  // 화면이 REFERENCE_HEIGHT보다 작을 때만 비례해서 축소하고, MIN_SCALE 밑으로는 더 줄이지 않는다
  // (너무 작아지면 오히려 가독성이 떨어지므로 하한선을 둠).
  const scale = Math.min(1, Math.max(MIN_SCALE, height / REFERENCE_HEIGHT));

  const [summary, setSummary] = useState<HomeSummary | null>(null);

  // useEffect(마운트 1회)가 아니라 useFocusEffect를 써서, 다른 화면 갔다가 돌아올 때마다
  // 최신 센서 값으로 다시 불러온다 (실기기 센서 값은 계속 바뀌므로).
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getHomeSummary()
        .then((data) => {
          if (!cancelled) setSummary(data);
        })
        .catch((err) => {
          // 백엔드가 꺼져 있어도 화면은 대시(—)로 계속 정상 표시되게 함
          console.warn('홈 요약 조회 실패:', err);
        });
      return () => {
        cancelled = true;
      };
    }, [])
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Header />
      {/* 스크롤 없이 화면 높이 안에 다 들어오도록 flex:1 + space-between으로
          네 블록(시계/상태/목표/메뉴) 사이 여백을 화면 크기에 맞춰 자동 분배한다. */}
      <View style={styles.middleContent}>
        <TimeCard scale={scale} />
        <StatusCard
          scale={scale}
          humidity={summary?.humidity ?? null}
          temperature={summary?.temperature ?? null}
        />
        <GoalCard scale={scale} />
        <MenuGrid scale={scale} />
      </View>
      <View style={styles.bottomNavWrap}>
        <BottomNav variant="main" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.white,
  },
  // 스크롤 없이 화면 안에 모든 블록을 담기 위한 가운데 영역.
  // flex:1 + justifyContent:'space-between'으로 기기 화면 높이에 맞춰
  // 카드 사이 여백이 자동으로 줄어들거나 늘어난다.
  middleContent: {
    flex: 1,
    paddingHorizontal: 20,
    justifyContent: 'space-between',
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    // 'center'로 두면 아래 VitaLogo의 자체 paddingTop(오렌지 조각 겹침 방지용) 때문에
    // 로고 실제 내용이 알림/설정 아이콘보다 아래로 처지므로, 서로의 아랫줄 기준으로 맞춘다.
    alignItems: 'flex-end',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 4,
  },
  headerIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },

  timeCard: {
    alignItems: 'center',
  },
  dayLabel: {
    fontFamily: fonts.jalnan,
    color: colors.text,
  },
  timeText: {
    fontFamily: fonts.pixel,
    color: colors.text,
    textAlign: 'center',
  },

  statusCard: {},
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statusCol: {
    flex: 1,
    alignItems: 'center',
  },
  statusLabel: {
    fontFamily: fonts.jalnan,
    color: colors.text,
  },
  statusIconWrap: {
    justifyContent: 'center',
  },
  statusValue: {
    fontFamily: fonts.jalnan,
    color: colors.text,
  },

  goalCard: {},
  goalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  goalTitle: {
    fontFamily: fonts.jalnan,
    color: colors.text,
  },
  progressTrackWrap: {
    justifyContent: 'center',
  },
  progressTrack: {
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.text,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.orange,
    borderRadius: 4,
  },
  runnerWrap: {
    position: 'absolute',
    bottom: 4, // 발이 바 위에 딱 닿도록 정렬
  },
  flagWrap: {
    position: 'absolute',
    right: -6,
    bottom: 0,
  },
  progressPercent: {
    fontFamily: fonts.jalnan,
    color: colors.text,
    textAlign: 'center',
  },

  menuRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  menuItem: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLabel: {
    fontFamily: fonts.jalnan,
    color: colors.text,
    textAlign: 'center',
  },

  bottomNavWrap: {
    paddingBottom: 10,
    paddingTop: 6,
  },
});
