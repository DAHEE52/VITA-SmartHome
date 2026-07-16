// 시안 3 - 메인화면.
// 구조(위→아래): 헤더 / 시계 카드 / 습도·온도·날씨 카드 / 오늘의 절전목표 카드
//              / 4개 메뉴 바로가기 / 하단 네비(사이렌·홈·북)
//
// 화면을 스크롤 없이 한 번에 다 보여줘야 하므로, 화면 높이가 작은 기기(iPhone SE 등)에서도
// 안 잘리도록 useWindowDimensions로 화면 높이를 재서 카드 padding/폰트 크기를 함께 줄이는
// `scale` 값을 만들어 쓴다. 큰 화면에서는 scale=1(원래 크기), 작은 화면일수록 최대 22%까지 축소.
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
  TextInput,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';

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
import { useGoal, HouseholdSize } from '../context/GoalContext';
import { useNotifications } from '../context/NotificationsContext';
import MenuModal from '../components/MenuModal';
import NotificationsModal from '../components/NotificationsModal';

// 디자인 기준 높이(iPhone 14 등 표준 화면). 이보다 작은 기기에서만 scale이 1 밑으로 내려간다.
const REFERENCE_HEIGHT = 820;
const MIN_SCALE = 0.78;

// 시계/상태/목표/메뉴 4개 회색 블록 사이의 간격. 기존 space-between 자동 분배 값(약 31.6, scale=1
// 기준)의 절반 정도로 고정했다가, 요청에 따라 한 번 더 살짝 줄인 값.
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
    <View style={[styles.header, { paddingTop: 6 * scale, paddingBottom: 0 }]}>
      <VitaLogo size={HEADER_ICON_SIZE} />
      <View style={styles.headerIcons}>
        <TouchableOpacity hitSlop={12} onPress={() => setMenuVisible(true)}>
          <MenuIcon size={HEADER_ICON_SIZE} />
        </TouchableOpacity>
        <TouchableOpacity hitSlop={12} onPress={() => setNotificationsVisible(true)} style={styles.bellWrap}>
          <BellIcon size={HEADER_ICON_SIZE} />
          {unreadCount > 0 && <View style={styles.unreadBadge} />}
        </TouchableOpacity>
        <TouchableOpacity hitSlop={12} onPress={() => navigation.navigate('Settings')}>
          <GearIcon size={HEADER_ICON_SIZE} />
        </TouchableOpacity>
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
    <Card style={[styles.timeCard, { padding: 20 * scale }]}>
      <Text style={[styles.dayLabel, { fontSize: 26 * scale }]}>Wen</Text>
      <Text style={[styles.timeText, { fontSize: 92 * scale, marginTop: 4 * scale }]}>
        {formatTime(now)}
      </Text>
    </Card>
  );
}

// 내부 습도 / 실내 온도 / 날씨 3열 위젯
function StatusCard({ scale }: { scale: number }) {
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
          <Text style={valueStyle}>60 %</Text>
        </View>
        <View style={styles.statusCol}>
          <Text style={labelStyle}>실내 온도</Text>
          <View style={iconWrapStyle}>
            <ThermometerIcon size={48 * scale} />
          </View>
          <Text style={valueStyle}>24.0 °C</Text>
        </View>
        <View style={styles.statusCol}>
          <Text style={labelStyle}>날씨</Text>
          <View style={iconWrapStyle}>
            <WeatherIcon size={48 * scale} />
          </View>
          <Text style={valueStyle}>맑음</Text>
        </View>
      </View>
    </Card>
  );
}

// "한국 평균 전력 소비량"의 일반적으로 알려진 가구 인원별 월간 근사치(kWh). 실제 통계 API 연동은
// 아니고, 절전 목표 기본값을 계산하기 위한 참고용 상수.
const HOUSEHOLD_AVG_KWH: Record<HouseholdSize, number> = {
  1: 200,
  2: 250,
  3: 300,
  4: 350,
  5: 400,
};
const HOUSEHOLD_OPTIONS: { size: HouseholdSize; label: string }[] = [
  { size: 1, label: '1인 가구' },
  { size: 2, label: '2인 가구' },
  { size: 3, label: '3인 가구' },
  { size: 4, label: '4인 가구' },
  { size: 5, label: '5인 이상 가구' },
];
// 가구 인원별 평균 소비량 대비 25% 절감을 기본 목표로 삼는다.
const GOAL_REDUCTION_RATIO = 0.25;
const defaultGoalFor = (size: HouseholdSize) =>
  Math.round(HOUSEHOLD_AVG_KWH[size] * (1 - GOAL_REDUCTION_RATIO));

// 카드를 탭하면 뜨는 가구 인원 선택 모달 - 인원에 맞는 평균 소비량의 25% 절감분을 기본 목표로 설정한다.
function HouseholdPickerModal({
  visible,
  selected,
  onClose,
  onSelect,
}: {
  visible: boolean;
  selected: HouseholdSize | null;
  onClose: () => void;
  onSelect: (size: HouseholdSize) => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={() => {}}>
          <Text style={styles.modalTitle}>가구 인원 선택</Text>
          <Text style={styles.modalSubtitle}>
            한국 평균 전력 소비량 대비 25% 절감을 기본 목표로 설정해요.
          </Text>
          <View style={styles.householdList}>
            {HOUSEHOLD_OPTIONS.map(({ size, label }) => {
              const isSelected = size === selected;
              return (
                <TouchableOpacity
                  key={size}
                  style={[styles.householdRow, isSelected && styles.householdRowSelected]}
                  onPress={() => onSelect(size)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[styles.householdRowLabel, isSelected && styles.householdRowTextSelected]}
                  >
                    {label}
                  </Text>
                  <Text style={[styles.householdRowSub, isSelected && styles.householdRowTextSelected]}>
                    목표 {defaultGoalFor(size)}kWh/월
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TouchableOpacity
            style={[styles.modalCloseButton, styles.modalCloseButtonSolo]}
            onPress={onClose}
            activeOpacity={0.7}
          >
            <Text style={styles.modalCloseText}>닫기</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

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
          <TouchableOpacity onPress={handleReset} activeOpacity={0.7}>
            <Text style={styles.goalResetText}>절전 목표 삭제(초기화)</Text>
          </TouchableOpacity>
          <View style={styles.modalBottomRow}>
            <TouchableOpacity style={styles.modalCloseButton} onPress={onClose} activeOpacity={0.7}>
              <Text style={styles.modalCloseText}>취소</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.renameSaveButtonWide} onPress={handleSave} activeOpacity={0.7}>
              <Text style={styles.renameSaveText}>저장</Text>
            </TouchableOpacity>
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
  const progress = 0; // 절전 목표 달성률(%). 이번 달 시작 시점이라 0%부터 시작하고, 실제 앱에서는 서버 데이터로 교체될 값.
  // householdSize/goalKwh는 다른 화면으로 이동했다가 돌아와도 값이 유지되도록 GoalProvider(App.tsx
  // 최상단에 마운트됨)가 들고 있는 전역 값을 쓴다. 모달 열림 여부는 화면을 나가면 초기화되는 게
  // 자연스러우므로 그대로 이 컴포넌트의 지역 state로 둔다.
  const { householdSize, goalKwh, setHouseholdSize, setGoalKwh, resetGoal } = useGoal();
  const [pickerVisible, setPickerVisible] = useState(false);
  const [editVisible, setEditVisible] = useState(false);

  return (
    <>
      <TouchableOpacity activeOpacity={0.85} onPress={() => setPickerVisible(true)}>
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
          {/* 목표를 아직 설정하지 않았을 땐 안내 문구 없이 카드를 탭하는 것만으로 설정 창이
              열리게 하고, 목표가 있을 때만 이 행(kWh 표시 + 수정 버튼)을 보여준다. */}
          {goalKwh != null && (
            <View style={[styles.goalMetaRow, { marginTop: 6 * scale }]}>
              <Text style={[styles.goalKwhText, { fontSize: 13 * scale }]}>목표 {goalKwh}kWh/월</Text>
              <TouchableOpacity hitSlop={10} onPress={() => setEditVisible(true)}>
                <Text style={[styles.goalEditText, { fontSize: 13 * scale }]}>수정</Text>
              </TouchableOpacity>
            </View>
          )}
        </Card>
      </TouchableOpacity>

      <HouseholdPickerModal
        visible={pickerVisible}
        selected={householdSize}
        onClose={() => setPickerVisible(false)}
        onSelect={(size) => {
          setHouseholdSize(size);
          setGoalKwh(defaultGoalFor(size));
          setPickerVisible(false);
        }}
      />
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

const MENU_GAP = 4;

// 스마트홈 제어 / 캘린더 / 에너지 사용량 / 에너지 나무로 이동하는 4개 바로가기 카드
function MenuGrid({ scale }: { scale: number }) {
  const navigation = useNavigation<any>();
  const { width } = useWindowDimensions();
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
        <TouchableOpacity
          key={label}
          style={[styles.menuItem, { width: cellSize, height: cellSize, gap: 10 * scale }]}
          onPress={() => navigation.navigate(route)}
        >
          <Icon size={54 * scale} />
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

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Header scale={scale} />
      {/* 로고~시계, 블록 사이, 메뉴~하단 네비까지 전부 BLOCK_GAP 하나로 통일된 리듬을 갖도록
          paddingTop(로고 밑 첫 간격)과 gap(블록 사이 간격)을 같은 값으로 준다. */}
      <View style={[styles.middleContent, { paddingTop: BLOCK_GAP * scale, gap: BLOCK_GAP * scale }]}>
        <TimeCard scale={scale} />
        <StatusCard scale={scale} />
        <GoalCard scale={scale} />
        <MenuGrid scale={scale} />
      </View>
      {/* 홈 버튼(하단 네비)이 다른 화면들과 똑같이 화면 맨 아래에 붙어 있도록, 이 spacer가
          flex:1로 남는 공간을 전부 떠안는다. 블록 사이 간격(BLOCK_GAP)에는 영향을 주지 않는다. */}
      <View style={{ flex: 1 }} />
      {/* bottomNavWrap은 다른 화면들(Calendar/EnergyUsage/EnergyTree/SmartHomeControl)과
          동일하게 paddingTop:6, paddingBottom:10 고정값을 그대로 쓴다. */}
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

  householdList: {
    gap: 8,
    marginBottom: 8,
  },
  householdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: colors.card,
  },
  householdRowSelected: {
    backgroundColor: colors.orange,
  },
  householdRowLabel: {
    fontFamily: fonts.jalnan,
    fontSize: 15,
    color: colors.text,
  },
  householdRowSub: {
    fontSize: 13,
    color: colors.textGray2,
  },
  householdRowTextSelected: {
    color: colors.white,
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
  // 버튼 행(취소/저장) 없이 단독으로 쓰일 때는 flex:1이 세로로 늘어나 보이므로 상쇄한다.
  modalCloseButtonSolo: {
    flex: 0,
    marginTop: 16,
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
});
