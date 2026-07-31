// 시안 3 - 메인화면.
// 구조(위→아래): 헤더 / 시계 카드 / 습도·온도·날씨 카드 / 오늘의 절전목표 카드
//              / 4개 메뉴 바로가기 / 하단 네비(사이렌·홈·북)
//
// 화면을 스크롤 없이 한 번에 다 보여줘야 하므로, 화면 높이가 작은 기기(iPhone SE 등)에서도
// 안 잘리도록 useWindowDimensions로 화면 높이를 재서 카드 padding/폰트 크기를 함께 줄이는
// `scale` 값을 만들어 쓴다. 큰 화면에서는 scale=1(원래 크기), 작은 화면일수록 최대 22%까지 축소.
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  ScrollView,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import AnimatedPressable from '../components/AnimatedPressable';
import { useAppWindowDimensions } from '../hooks/useAppWindowDimensions';

import { getHomeSummary, HomeSummary, getWeather, WeatherOut } from '../api/client';

import { colors, fonts } from '../theme/colors';
import Card from '../components/Card';
import VitaLogo from '../components/VitaLogo';
import BottomNav from '../components/BottomNav';
import {
  MenuIcon,
  BellIcon,
  GearIcon,
  DropletIcon,
  ThermometerIcon,
  WeatherIcon,
  BoltOutlineIcon,
  RunnerIcon,
  FlagIcon,
  RemoteIcon,
  CalendarIcon,
  ChartUpIcon,
  TreeIcon,
} from '../components/icons';
import { useGoal } from '../context/GoalContext';
import { useNotifications } from '../context/NotificationsContext';
import { useEnergyHistory } from '../context/EnergyHistoryContext';
import { useSleep } from '../context/SleepContext';
import { useRooms } from '../context/RoomsContext';
import { usePresence } from '../context/PresenceContext';
import { useFireSafety } from '../context/FireSafetyContext';
import { useEmergencyContacts } from '../context/EmergencyContactsContext';
import { monthAchievementRate, daysInMonthOf } from '../utils/goalProgress';
import MenuModal from '../components/MenuModal';
import NotificationsModal from '../components/NotificationsModal';

// 디자인 기준 높이(iPhone 14 등 표준 화면). 이보다 작은 기기에서만 scale이 1 밑으로 내려간다.
const REFERENCE_HEIGHT = 820;
const MIN_SCALE = 0.78;

// 시계/상태/목표/메뉴 4개 회색 블록 사이의 최소 간격(iPhone 기준 스케일에서의 값). 화면에 남는
// 여유 공간은 이 최소값 위에 justifyContent:'space-evenly'로 고르게 더해진다.
const BLOCK_GAP = 12;

// 상단 헤더: 좌측 VITA 로고, 우측 메뉴/알림/설정 아이콘 3개.
// 로고와 아이콘들이 서로 비슷한 무게감으로 보이도록 같은 크기값(32)을 공유한다.
const HEADER_ICON_SIZE = 32;

function Header({ scale }: { scale: number }) {
  const navigation = useNavigation<any>();
  const [menuVisible, setMenuVisible] = useState(false);
  const [notificationsVisible, setNotificationsVisible] = useState(false);
  const { unreadCount } = useNotifications();

  return (
    <View style={[styles.header, { paddingTop: 2 * scale, paddingBottom: 0 }]}>
      <VitaLogo size={HEADER_ICON_SIZE} />
      <View style={styles.headerIcons}>
        <AnimatedPressable hitSlop={12} onPress={() => setMenuVisible(true)}>
          <MenuIcon size={HEADER_ICON_SIZE} />
        </AnimatedPressable>
        <AnimatedPressable hitSlop={12} onPress={() => setNotificationsVisible(true)} style={styles.bellWrap}>
          <BellIcon size={HEADER_ICON_SIZE} />
          {unreadCount > 0 && <View style={styles.unreadBadge} />}
        </AnimatedPressable>
        <AnimatedPressable hitSlop={12} onPress={() => navigation.navigate('Settings')}>
          <GearIcon size={HEADER_ICON_SIZE} />
        </AnimatedPressable>
      </View>
      <MenuModal visible={menuVisible} onClose={() => setMenuVisible(false)} />
      <NotificationsModal visible={notificationsVisible} onClose={() => setNotificationsVisible(false)} />
    </View>
  );
}

function formatTime(date: Date) {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

// CalendarScreen의 요일 헤더(SUN~SAT)와 동일한 표기를 쓴다.
const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THR', 'FRI', 'SAT'] as const;

// 요일 + 현재 시각 카드. 시간 숫자만 7세그먼트 디지털시계 폰트(DSEG7)를 써서 디지털 시계 느낌을 낸다.
// 요일은 카드 좌측에, 시간은 카드 안에서 가운데 정렬되도록 구성.
// 시간은 실제 기기 시각을 표시하고, 분이 바뀔 수 있으니 10초마다 다시 읽어서 갱신한다.
function TimeCard({ scale }: { scale: number }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 10000);
    return () => clearInterval(timer);
  }, []);

  return (
    <Card style={[styles.timeCard, { padding: 14 * scale }]}>
      <Text style={[styles.dayLabel, { fontSize: 20 * scale }]}>{WEEKDAYS[now.getDay()]}</Text>
      <Text style={[styles.timeText, { fontSize: 68 * scale, marginTop: 2 * scale }]}>
        {formatTime(now)}
      </Text>
    </Card>
  );
}

// 내부 습도 / 실내 온도 / 날씨 3열 위젯.
// 습도·온도는 /home/summary(env_presence_node 센서 실측값)를, 날씨는 /weather/current(기상청
// 공공데이터포털 초단기예보)를 받아 보여준다 - 값이 아직 없으면(센서 미연결/조회 실패/기상청
// 인증키 미설정) 셋 다 "-"로 표시한다.
function StatusCard({
  scale,
  summary,
  weather,
}: {
  scale: number;
  summary: HomeSummary | null;
  weather: WeatherOut | null;
}) {
  const iconWrapStyle = [styles.statusIconWrap, { height: 60 * scale, marginTop: 14 * scale }];
  const valueStyle = [styles.statusValue, { fontSize: 19 * scale, marginTop: 14 * scale }];
  const labelStyle = [styles.statusLabel, { fontSize: 16 * scale }];
  const humidityText = summary?.humidity != null ? `${summary.humidity.toFixed(1)} %` : '-';
  const temperatureText = summary?.temperature != null ? `${summary.temperature.toFixed(1)} °C` : '-';
  const weatherText = weather?.condition ?? '-';
  return (
    <Card style={[styles.statusCard, { padding: 20 * scale }]}>
      <View style={styles.statusRow}>
        <View style={styles.statusCol}>
          <Text style={labelStyle}>내부 습도</Text>
          <View style={iconWrapStyle}>
            <DropletIcon size={48 * scale} />
          </View>
          <Text style={valueStyle}>{humidityText}</Text>
        </View>
        <View style={styles.statusCol}>
          <Text style={labelStyle}>실내 온도</Text>
          <View style={iconWrapStyle}>
            <ThermometerIcon size={48 * scale} />
          </View>
          <Text style={valueStyle}>{temperatureText}</Text>
        </View>
        <View style={styles.statusCol}>
          <Text style={labelStyle}>날씨</Text>
          <View style={iconWrapStyle}>
            <WeatherIcon size={48 * scale} />
          </View>
          <Text style={valueStyle}>{weatherText}</Text>
        </View>
      </View>
    </Card>
  );
}

// "한국 평균 전력 소비량"의 1인 가구 월간 근사치(kWh). 실제 통계 API 연동은 아니고, 절전 목표
// 기본값을 계산하기 위한 참고용 상수. VITA는 원룸 전용 서비스라 가구 인원은 항상 1인이다.
const HOUSEHOLD_AVG_KWH_1P = 200;
// 평균 소비량 대비 25% 절감을 기본 목표로 삼는다.
const GOAL_REDUCTION_RATIO = 0.25;
const DEFAULT_GOAL_KWH = Math.round(HOUSEHOLD_AVG_KWH_1P * (1 - GOAL_REDUCTION_RATIO));

// "수정" 버튼을 누르면 뜨는 모달 - 가구 인원 기준값과 무관하게 목표를 자유로운 숫자로 바꿀 수 있다.
// "초기화" 버튼은 값을 다른 숫자로 되돌리는 게 아니라 절전 목표 자체를 완전히 삭제한다 - 삭제 후엔
// 카드가 "목표 미설정" 상태로 돌아가서, 다시 탭하면 가구 인원 선택부터 새로 시작한다.
function GoalEditModal({
  visible,
  value,
  onClose,
  onSave,
  onReset,
}: {
  visible: boolean;
  value: number | null;
  onClose: () => void;
  onSave: (kwh: number) => void;
  onReset: () => void;
}) {
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (visible) setDraft(value != null ? String(value) : '');
  }, [visible, value]);

  const handleSave = () => {
    const digits = draft.replace(/[^0-9]/g, '');
    if (digits) onSave(Number(digits));
    onClose();
  };

  const handleReset = () => {
    onReset();
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={() => {}}>
          <Text style={styles.modalTitle}>절전 목표 수정</Text>
          <View style={styles.goalEditRow}>
            <TextInput
              style={styles.goalEditInput}
              value={draft}
              onChangeText={(v) => setDraft(v.replace(/[^0-9]/g, ''))}
              placeholder="목표"
              placeholderTextColor={colors.textGray}
              keyboardType="number-pad"
            />
            <Text style={styles.goalEditUnit}>kWh / 월</Text>
          </View>
          <AnimatedPressable onPress={handleReset} activeOpacity={0.7}>
            <Text style={styles.goalResetText}>절전 목표 삭제(초기화)</Text>
          </AnimatedPressable>
          <View style={styles.modalBottomRow}>
            <AnimatedPressable style={styles.modalCloseButton} onPress={onClose} activeOpacity={0.7}>
              <Text style={styles.modalCloseText}>취소</Text>
            </AnimatedPressable>
            <AnimatedPressable style={styles.renameSaveButtonWide} onPress={handleSave} activeOpacity={0.7}>
              <Text style={styles.renameSaveText}>저장</Text>
            </AnimatedPressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// 오늘의 절전 목표 - 달성률 progress bar (달리는 사람 = 현재 지점, 깃발 = 목표 지점).
// 카드를 탭하면 가구 인원 선택 모달이 열려 기본 목표(kWh)를 계산해주고, "수정" 버튼으로는
// 그 값을 무시하고 자유롭게 원하는 숫자로 바꿀 수 있다.
function GoalCard({ scale }: { scale: number }) {
  // householdSize/goalKwh는 다른 화면으로 이동했다가 돌아와도 값이 유지되도록 GoalProvider(App.tsx
  // 최상단에 마운트됨)가 들고 있는 전역 값을 쓴다. 모달 열림 여부는 화면을 나가면 초기화되는 게
  // 자연스러우므로 그대로 이 컴포넌트의 지역 state로 둔다.
  const { goalKwh, setHouseholdSize, setGoalKwh, resetGoal } = useGoal();
  const { dailyUsage } = useEnergyHistory();
  const [editVisible, setEditVisible] = useState(false);

  // EnergyTreeScreen의 나무 성장률과 완전히 같은 계산(monthAchievementRate)을 써서, 이 카드의
  // 퍼센트와 에너지 나무의 "이번 달 목표 달성률"이 항상 같은 값을 보여주도록 한다.
  const now = new Date();
  const year = now.getFullYear();
  const month0 = now.getMonth();
  const dailyTarget = goalKwh == null ? null : goalKwh / daysInMonthOf(year, month0);
  const progress = Math.round(monthAchievementRate(dailyUsage, dailyTarget, year, month0) * 100);

  // 원룸 전용 서비스라 가구 인원은 항상 1인 - 목표가 아직 없을 때 카드를 탭하면 별도로 물어보지
  // 않고 바로 1인 가구 기본 목표(DEFAULT_GOAL_KWH)로 설정한 뒤, 원하면 곧바로 숫자를 고칠 수 있게
  // 수정 모달을 연다.
  const handlePress = () => {
    if (goalKwh == null) {
      setHouseholdSize(1);
      setGoalKwh(DEFAULT_GOAL_KWH);
    }
    setEditVisible(true);
  };

  return (
    <>
      <AnimatedPressable activeOpacity={0.85} onPress={handlePress}>
        <Card style={[styles.goalCard, { padding: 20 * scale }]}>
          <View style={styles.goalTitleRow}>
            <BoltOutlineIcon size={22 * scale} />
            <Text style={[styles.goalTitle, { fontSize: 19 * scale }]}>이번 달 절전 목표</Text>
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
          {/* 목표를 아직 설정하지 않았을 땐 안내 문구 없이 카드를 탭하는 것만으로 설정되게 하고,
              목표가 있을 때만 이 행(kWh 표시 + 수정 버튼)을 보여준다. */}
          {goalKwh != null && (
            <View style={[styles.goalMetaRow, { marginTop: 6 * scale }]}>
              <Text style={[styles.goalKwhText, { fontSize: 13 * scale }]}>목표 {goalKwh}kWh/월</Text>
              <AnimatedPressable hitSlop={10} onPress={() => setEditVisible(true)}>
                <Text style={[styles.goalEditText, { fontSize: 13 * scale }]}>수정</Text>
              </AnimatedPressable>
            </View>
          )}
        </Card>
      </AnimatedPressable>

      <GoalEditModal
        visible={editVisible}
        value={goalKwh}
        onClose={() => setEditVisible(false)}
        onSave={(kwh) => setGoalKwh(kwh)}
        onReset={resetGoal}
      />
    </>
  );
}

// 규칙 기반 "AI 추천" 배너 - 명세서 6번 항목("간단한 AI 추천"). ML 없이 현재 재실/기기 상태만으로
// 우선순위가 가장 높은 추천 한 가지만 골라 보여준다.
function useAiRecommendation(): string | null {
  const { isHome } = usePresence();
  const { rooms } = useRooms();
  const onDevices = rooms.flatMap((r) => r.devices.filter((d) => d.on));

  if (!isHome && onDevices.length > 0) {
    return `외출 중인데 ${onDevices[0].name}이(가) 켜져 있어요. 꺼두면 절약할 수 있어요!`;
  }
  return null;
}

function AiRecommendationBanner({ scale }: { scale: number }) {
  const message = useAiRecommendation();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setDismissed(false);
  }, [message]);

  if (!message || dismissed) return null;

  return (
    <Card style={[styles.aiCard, { padding: 16 * scale }]}>
      <View style={styles.aiRow}>
        <Text style={[styles.aiText, { fontSize: 13 * scale }]}>💡 {message}</Text>
        <AnimatedPressable hitSlop={10} onPress={() => setDismissed(true)}>
          <Text style={[styles.aiDismiss, { fontSize: 13 * scale }]}>닫기</Text>
        </AnimatedPressable>
      </View>
    </Card>
  );
}

// "😴 수면 중" 배너 - SleepContext.state가 active일 때만 보인다. 누르면 취침 모드를 바로 끈다
// (기상 감지와 동일하게 기기 상태를 원래대로 되돌림 - SleepContext.endSleepMode 참고).
function SleepBanner({ scale }: { scale: number }) {
  const { state, endSleepMode } = useSleep();
  if (state !== 'active') return null;
  return (
    <AnimatedPressable onPress={endSleepMode} activeOpacity={0.8}>
      <Card style={[styles.sleepBanner, { padding: 14 * scale }]}>
        <Text style={[styles.sleepBannerText, { fontSize: 14 * scale }]}>😴 수면 중 - 취침 모드가 활성화됐어요</Text>
        <Text style={[styles.sleepBannerHint, { fontSize: 11 * scale }]}>탭하면 취침 모드를 꺼요</Text>
      </Card>
    </AnimatedPressable>
  );
}

// "취침 중이신가요?" 확인 모달 - SleepContext.state가 confirming일 때 자동으로 뜬다.
// "나중에"를 누르면 닫히고, 다시 무움직임 감지 시간만큼 조용해야 재질문한다. "확인"을 누르면 즉시
// 취침 모드가 활성화되고 이후 12시간은 재질문하지 않는다(SleepContext.confirm/dismiss 참고).
function SleepConfirmModal() {
  const { state, preset, confirm, dismiss } = useSleep();

  if (state !== 'confirming' || !preset) return null;

  return (
    <Modal visible transparent animationType="fade">
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>취침 중이신가요?</Text>
          <Text style={styles.modalSubtitle}>{preset.no_motion_seconds}초간 움직임이 없었어요.</Text>
          <View style={styles.modalBottomRow}>
            <AnimatedPressable style={styles.modalCloseButton} onPress={dismiss} activeOpacity={0.7}>
              <Text style={styles.modalCloseText}>나중에</Text>
            </AnimatedPressable>
            <AnimatedPressable style={styles.renameSaveButtonWide} onPress={confirm} activeOpacity={0.7}>
              <Text style={styles.renameSaveText}>확인</Text>
            </AnimatedPressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// "🚨 화재가 의심됩니다" 확인 모달 - FireSafetyContext.emergency가 있을 때 자동으로 뜬다.
// SleepConfirmModal과 같은 이유로 MainScreen에 마운트해서, 어느 화면을 보고 있었든 감지 즉시
// 눈에 띄게 한다. 두 단계로 나뉜다:
// - confirming: 남은 시간을 카운트다운하며 "안전해요"(오탐 해제) 또는 "119 신고"를 고를 수 있다.
//   시간 안에 응답이 없으면 FireSafetyContext가 알아서 escalated로 넘긴다(이 모달은 그 결과만 반영).
// - escalated: 이미 비상 연락망에 알림을 보낸 뒤 - 등록된 연락처를 원터치로 바로 전화 걸 수 있게
//   보여주고, "확인했어요"를 누르면 닫힌다.
function FireEmergencyModal() {
  const { emergency, confirmSafe, dismissEmergency } = useFireSafety();
  const { contacts } = useEmergencyContacts();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!emergency || emergency.phase !== 'confirming') return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [emergency?.phase]);

  if (!emergency) return null;

  const callEmergency = () => Linking.openURL('tel:119');
  const callContact = (phone: string) => {
    const digits = phone.replace(/[^0-9+]/g, '');
    if (digits) Linking.openURL(`tel:${digits}`);
  };

  const remainingSec = Math.max(0, Math.ceil((emergency.confirmDeadlineAt - now) / 1000));

  return (
    <Modal visible transparent animationType="fade">
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>🚨 화재가 의심됩니다</Text>
          <Text style={styles.modalSubtitle}>{emergency.reason}</Text>

          {emergency.phase === 'confirming' ? (
            <Text style={styles.fireCountdownText}>
              {remainingSec}초 후 자동으로 비상 연락망에 알림이 전송돼요
            </Text>
          ) : (
            <>
              <Text style={styles.fireCountdownText}>비상 연락망에 알림을 보냈어요</Text>
              {contacts.map((c) => (
                <AnimatedPressable
                  key={c.id}
                  style={styles.fireContactRow}
                  onPress={() => callContact(c.phone)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.fireContactName}>{c.name}</Text>
                  <Text style={styles.fireContactCallText}>📞 전화</Text>
                </AnimatedPressable>
              ))}
            </>
          )}

          <AnimatedPressable style={styles.fireCallButton} onPress={callEmergency} activeOpacity={0.7}>
            <Text style={styles.fireCallButtonText}>📞 119 신고하기</Text>
          </AnimatedPressable>

          {emergency.phase === 'confirming' ? (
            <AnimatedPressable style={styles.renameSaveButtonWide} onPress={confirmSafe} activeOpacity={0.7}>
              <Text style={styles.renameSaveText}>✅ 안전해요</Text>
            </AnimatedPressable>
          ) : (
            <AnimatedPressable style={styles.modalCloseButton} onPress={dismissEmergency} activeOpacity={0.7}>
              <Text style={styles.modalCloseText}>확인했어요</Text>
            </AnimatedPressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

const MENU_GAP = 4;

// 스마트홈 제어 / 캘린더 / 에너지 사용량 / 에너지 나무로 이동하는 4개 바로가기 카드
function MenuGrid({ scale }: { scale: number }) {
  const navigation = useNavigation<any>();
  const { width } = useAppWindowDimensions();
  // 정확히 정사각형이 되도록 flex 비율 대신 실제 픽셀 크기를 계산해서 쓴다.
  const cellSize = (width - 40 - MENU_GAP * 3) / 4;
  const items = [
    { label: '스마트홈 제어', Icon: RemoteIcon, route: 'SmartHomeControl' },
    { label: '캘린더', Icon: CalendarIcon, route: 'Calendar' },
    { label: '에너지 사용량', Icon: ChartUpIcon, route: 'EnergyUsage' },
    { label: '에너지 나무', Icon: TreeIcon, route: 'EnergyTree' },
  ] as const;

  return (
    <View style={[styles.menuRow, { gap: MENU_GAP }]}>
      {items.map(({ label, Icon, route }) => (
        <AnimatedPressable
          key={label}
          style={[styles.menuItem, { width: cellSize, height: cellSize, gap: 10 * scale }]}
          onPress={() => navigation.navigate(route)}
        >
          <Icon size={54 * scale} />
          <Text style={[styles.menuLabel, { fontSize: 12 * scale }]}>{label}</Text>
        </AnimatedPressable>
      ))}
    </View>
  );
}

export default function MainScreen() {
  const { height } = useAppWindowDimensions();
  // 화면이 REFERENCE_HEIGHT보다 작을 때만 비례해서 축소하고, MIN_SCALE 밑으로는 더 줄이지 않는다
  // (너무 작아지면 오히려 가독성이 떨어지므로 하한선을 둠).
  const scale = Math.min(1, Math.max(MIN_SCALE, height / REFERENCE_HEIGHT));

  const [summary, setSummary] = useState<HomeSummary | null>(null);
  // 화면에 머무는 동안 센서 노드의 push 주기(5초)에 맞춰 계속 다시 불러와 라이브 업데이트한다.
  // 화면을 벗어나면(다른 탭 이동 등) interval을 정리해 불필요한 요청을 막는다.
  useFocusEffect(
    useCallback(() => {
      const refresh = () => {
        getHomeSummary()
          .then(setSummary)
          .catch((err) => console.warn('홈 요약 조회 실패:', err));
      };
      refresh();
      const timer = setInterval(refresh, 5000);
      return () => clearInterval(timer);
    }, [])
  );

  const [weather, setWeather] = useState<WeatherOut | null>(null);
  // 날씨는 기상청 예보가 시간 단위로만 갱신되고 백엔드도 10분 캐시를 두므로, 온습도처럼 5초마다
  // 다시 부를 필요가 없다 - 10분 간격이면 충분하다.
  useFocusEffect(
    useCallback(() => {
      const refresh = () => {
        getWeather()
          .then(setWeather)
          .catch((err) => console.warn('날씨 조회 실패:', err));
      };
      refresh();
      const timer = setInterval(refresh, 600000);
      return () => clearInterval(timer);
    }, [])
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Header scale={scale} />
      {/* 기존 4블록(시계/상태/목표/메뉴)은 화면 높이에 맞춰 scale로 줄어드는 원래 레이아웃을 그대로
          쓰고, 명세서에서 새로 추가된 카드들(절감액/AI추천/수면중 배너)은 그 아래 스크롤 영역에
          이어 붙인다 - 화면이 넉넉하면 스크롤 없이 다 보이고, 작은 기기에서만 스크롤된다. */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.middleContent, { gap: BLOCK_GAP * scale, paddingBottom: 12 * scale }]}
        showsVerticalScrollIndicator={false}
      >
        <TimeCard scale={scale} />
        <StatusCard scale={scale} summary={summary} weather={weather} />
        <GoalCard scale={scale} />
        <SleepBanner scale={scale} />
        <AiRecommendationBanner scale={scale} />
        <MenuGrid scale={scale} />
      </ScrollView>
      {/* bottomNavWrap은 다른 화면들(Calendar/EnergyUsage/EnergyTree/SmartHomeControl)과
          동일하게 paddingTop:6, paddingBottom:10 고정값을 그대로 쓴다. */}
      <View style={styles.bottomNavWrap}>
        <BottomNav variant="main" />
      </View>
      <SleepConfirmModal />
      <FireEmergencyModal />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.white,
  },
  // 로고/카드/메뉴/하단 네비 사이 간격을 전부 BLOCK_GAP으로 고정했으므로
  // 더 이상 flex:1로 남는 공간을 채울 필요가 없어 콘텐츠 높이만큼만 차지한다.
  middleContent: {
    paddingHorizontal: 20,
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 4,
  },
  headerIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  bellWrap: {
    position: 'relative',
  },
  // 안읽은 알림이 있을 때 종 아이콘 우상단에 표시하는 빨간 점
  unreadBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.red,
    borderWidth: 1.5,
    borderColor: colors.white,
  },

  timeCard: {},
  dayLabel: {
    fontFamily: fonts.jalnan,
    color: colors.text,
    textAlign: 'left',
    alignSelf: 'flex-start',
  },
  timeText: {
    fontFamily: fonts.digital,
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
  aiCard: {
    backgroundColor: colors.yellow,
  },
  aiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  aiText: {
    flex: 1,
    color: colors.text,
    lineHeight: 18,
  },
  aiDismiss: {
    fontFamily: fonts.jalnan,
    color: colors.text,
    textDecorationLine: 'underline',
  },

  sleepBanner: {
    backgroundColor: colors.chartBlue,
  },
  sleepBannerText: {
    fontFamily: fonts.jalnan,
    color: colors.white,
    textAlign: 'center',
  },
  sleepBannerHint: {
    color: colors.white,
    opacity: 0.8,
    textAlign: 'center',
    marginTop: 4,
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
  goalMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  goalKwhText: {
    fontFamily: fonts.jalnan,
    color: colors.textGray2,
  },
  goalEditText: {
    fontFamily: fonts.jalnan,
    color: colors.orange,
    textDecorationLine: 'underline',
  },

  menuRow: {
    flexDirection: 'row',
  },
  // width/height는 정확한 정사각형을 위해 JS에서 계산해서 inline으로 준다.
  menuItem: {
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
    paddingHorizontal: 20,
    paddingBottom: 10,
    paddingTop: 6,
  },

  // 이 아래는 절전 목표 카드에서 뜨는 두 모달(가구 인원 선택/목표 수정)의 스타일.
  // CalendarScreen의 모달들과 같은 값을 써서 앱 전체에서 모달 룩이 통일되도록 했다.
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  modalCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 24,
  },
  modalTitle: {
    fontFamily: fonts.jalnan,
    fontSize: 19,
    color: colors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 13,
    color: colors.textGray,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 18,
  },

  goalEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 8,
  },
  goalEditInput: {
    width: 100,
    fontFamily: fonts.jalnan,
    fontSize: 20,
    color: colors.text,
    backgroundColor: colors.card,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    textAlign: 'center',
  },
  goalEditUnit: {
    fontFamily: fonts.jalnan,
    fontSize: 15,
    color: colors.textGray2,
  },
  goalResetText: {
    fontFamily: fonts.jalnan,
    fontSize: 12,
    color: colors.red,
    textDecorationLine: 'underline',
    textAlign: 'center',
    marginBottom: 12,
  },

  modalBottomRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  modalCloseButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: colors.card,
  },
  modalCloseText: {
    fontFamily: fonts.jalnan,
    fontSize: 15,
    color: colors.text,
  },
  renameSaveButtonWide: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: colors.orange,
  },
  renameSaveText: {
    fontFamily: fonts.jalnan,
    fontSize: 15,
    color: colors.white,
  },

  fireCountdownText: {
    fontFamily: fonts.jalnan,
    fontSize: 14,
    color: colors.red,
    textAlign: 'center',
    marginBottom: 14,
  },
  fireContactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  fireContactName: {
    fontFamily: fonts.jalnan,
    fontSize: 14,
    color: colors.text,
  },
  fireContactCallText: {
    fontFamily: fonts.jalnan,
    fontSize: 13,
    color: colors.orange,
  },
  fireCallButton: {
    alignItems: 'center',
    marginTop: 14,
    marginBottom: 10,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: colors.red,
  },
  fireCallButtonText: {
    fontFamily: fonts.jalnan,
    fontSize: 15,
    color: colors.white,
  },
});
