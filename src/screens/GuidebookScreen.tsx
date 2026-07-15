// 신규 화면 - 안전 가이드북 (guidebook.txt 내용을 기반으로 구성).
// 구조: 접고 펼치는 11개 섹션(화재 예방/체크리스트/행동요령/상황별 대처/자취생 꿀팁/아이와 함께 배우기/
//      대피계획/비상용품/화재 후 할 일/안전 상식/긴급 연락처) / 하단 네비(홈)
//
// 아이도 이해하기 쉽도록 섹션마다 큰 이모지를 "그림"으로 붙였고(별도 이미지 에셋 없이 문자만으로
// 다채로운 그림 효과를 냄), 체크리스트는 실제로 눌러서 체크할 수 있게 만들었다.
// 긴급 연락처의 119/112는 고정값이고, 가족 비상 연락처와 경비실(관리사무소) 번호는 사용자가
// 직접 등록 - 등록한 번호는 탭하면 바로 전화가 걸리도록 Linking으로 연결했다.
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
  TextInput,
  ScrollView,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts } from '../theme/colors';
import Card from '../components/Card';
import BottomNav from '../components/BottomNav';
import { PlusIcon, CloseIcon } from '../components/icons';
import { useSettings, FONT_SIZE_SCALE } from '../context/SettingsContext';

// 설정 화면의 "글자 크기 조절"은 이 화면의 글자 크기에만 영향을 준다. 매 컴포넌트가 현재 배율을
// 읽어 자기 몫의 스타일을 새로 만들어 쓴다(모듈 최상단 고정 StyleSheet 대신 함수로 생성).
function useGuidebookStyles() {
  const { guidebookFontSize } = useSettings();
  return createStyles(FONT_SIZE_SCALE[guidebookFontSize]);
}

type Contact = { id: string; name: string; phone: string };

// "tel:" 스킴으로 전화 앱을 연다. 숫자/+ 외 문자(하이픈, 공백 등)는 제거해서 넘긴다.
function callNumber(phone: string) {
  const digits = phone.replace(/[^0-9+]/g, '');
  if (!digits) return;
  Linking.openURL(`tel:${digits}`);
}

// 섹션 헤더(아이콘+제목)를 누르면 펼쳐지는 아코디언 카드.
function Section({
  icon,
  title,
  isOpen,
  onToggle,
  children,
}: {
  icon: string;
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const styles = useGuidebookStyles();
  return (
    <Card style={styles.sectionCard}>
      <TouchableOpacity style={styles.sectionHeader} onPress={onToggle} activeOpacity={0.7}>
        <Text style={styles.sectionIcon}>{icon}</Text>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionChevron}>{isOpen ? '▲' : '▼'}</Text>
      </TouchableOpacity>
      {isOpen && <View style={styles.sectionBody}>{children}</View>}
    </Card>
  );
}

// 이모지 + 짧은 소제목 (예: "🍳 주방 화재")
function SubHeading({ icon, text }: { icon: string; text: string }) {
  const styles = useGuidebookStyles();
  return (
    <View style={styles.subHeadingRow}>
      <Text style={styles.subHeadingIcon}>{icon}</Text>
      <Text style={styles.subHeadingText}>{text}</Text>
    </View>
  );
}

// 일반 글머리 기호 목록 한 줄
function Bullet({ text }: { text: string }) {
  const styles = useGuidebookStyles();
  return (
    <View style={styles.bulletRow}>
      <Text style={styles.bulletDot}>•</Text>
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
}

// 번호가 매겨진 행동요령 한 단계
function Step({ number, text }: { number: string; text: string }) {
  const styles = useGuidebookStyles();
  return (
    <View style={styles.bulletRow}>
      <Text style={styles.stepNumber}>{number}</Text>
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
}

// 눌러서 체크하는 체크리스트 한 줄
function ChecklistRow({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  const styles = useGuidebookStyles();
  return (
    <TouchableOpacity style={styles.checklistRow} onPress={onToggle} activeOpacity={0.7}>
      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
        {checked && <Text style={styles.checkboxMark}>✓</Text>}
      </View>
      <Text style={[styles.checklistLabel, checked && styles.checklistLabelChecked]}>{label}</Text>
    </TouchableOpacity>
  );
}

const RISK_CHECK_ITEMS = [
  '소화기가 있다.',
  '화재감지기가 설치되어 있다.',
  '비상구 위치를 알고 있다.',
  '멀티탭 과부하 없이 사용한다.',
  '가스레인지 사용 후 밸브를 잠근다.',
  '비상연락처를 저장해 두었다.',
];

const SUPPLY_CHECK_ITEMS = [
  '소화기',
  '화재담요',
  '손전등',
  '응급약품',
  '생수',
  '보조배터리',
  '호루라기',
  '비상열쇠',
  '휴대용 라디오',
];

// 가족 비상 연락처를 새로 등록하는 창 - 이름과 전화번호를 입력하면 목록에 추가된다.
function AddContactModal({
  visible,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (name: string, phone: string) => void;
}) {
  const styles = useGuidebookStyles();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  const reset = () => {
    setName('');
    setPhone('');
  };

  const handleSubmit = () => {
    if (!name.trim() || !phone.trim()) return;
    onSubmit(name.trim(), phone.trim());
    reset();
    onClose();
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <Pressable style={styles.modalBackdrop} onPress={handleClose}>
        <Pressable style={styles.modalCard} onPress={() => {}}>
          <Text style={styles.modalTitle}>가족 비상 연락처 추가</Text>

          <View style={styles.modalInputGroup}>
            <TextInput
              style={styles.modalInput}
              value={name}
              onChangeText={setName}
              placeholder="이름 (예: 엄마)"
              placeholderTextColor={colors.textGray}
              returnKeyType="next"
            />
            <TextInput
              style={styles.modalInput}
              value={phone}
              onChangeText={setPhone}
              placeholder="전화번호"
              placeholderTextColor={colors.textGray}
              keyboardType="phone-pad"
              onSubmitEditing={handleSubmit}
              returnKeyType="done"
            />
          </View>

          <View style={styles.modalBottomRow}>
            <TouchableOpacity style={styles.modalCloseButton} onPress={handleClose} activeOpacity={0.7}>
              <Text style={styles.modalCloseText}>취소</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalSaveButton} onPress={handleSubmit} activeOpacity={0.7}>
              <Text style={styles.modalSaveText}>등록</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function GuidebookScreen() {
  const styles = useGuidebookStyles();
  // 처음 화면에서 바로 눈에 띄어야 할 "예방수칙"과 "긴급 연락처"만 기본으로 펼쳐두고,
  // 나머지 섹션은 필요할 때 눌러서 펼쳐보도록 접어둔다.
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    prevention: true,
    contacts: true,
  });
  const toggleSection = (id: string) => setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }));

  const [riskChecks, setRiskChecks] = useState<boolean[]>(Array(RISK_CHECK_ITEMS.length).fill(false));
  const toggleRiskCheck = (i: number) =>
    setRiskChecks((prev) => prev.map((v, idx) => (idx === i ? !v : v)));
  const riskScore = riskChecks.filter(Boolean).length;
  const riskResult =
    riskScore >= 5
      ? { label: '안전', color: colors.green }
      : riskScore >= 3
      ? { label: '주의', color: colors.yellow }
      : { label: '개선 필요', color: colors.red };

  const [supplyChecks, setSupplyChecks] = useState<boolean[]>(Array(SUPPLY_CHECK_ITEMS.length).fill(false));
  const toggleSupplyCheck = (i: number) =>
    setSupplyChecks((prev) => prev.map((v, idx) => (idx === i ? !v : v)));

  // 가족 비상 연락처는 처음엔 등록된 게 없는 상태로 시작 - 사용자가 직접 추가해야 한다.
  const [familyContacts, setFamilyContacts] = useState<Contact[]>([]);
  const [addContactVisible, setAddContactVisible] = useState(false);
  const addFamilyContact = (name: string, phone: string) => {
    setFamilyContacts((prev) => [...prev, { id: `contact-${Date.now()}`, name, phone }]);
  };
  const removeFamilyContact = (id: string) => {
    setFamilyContacts((prev) => prev.filter((c) => c.id !== id));
  };

  // 경비실/관리사무소 번호도 마찬가지로 빈 값에서 시작해서 사용자가 직접 입력한다.
  const [guardPhone, setGuardPhone] = useState('');

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.headerIcon}>📖</Text>
        <Text style={styles.headerTitle}>안전 가이드북</Text>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner} showsVerticalScrollIndicator={false}>
        <Section
          icon="🔥"
          title="1. 화재 예방 생활수칙"
          isOpen={!!openSections.prevention}
          onToggle={() => toggleSection('prevention')}
        >
          <SubHeading icon="🔥" text="화재가 자주 발생하는 원인" />
          <Bullet text="멀티탭 과부하 및 문어발식 사용" />
          <Bullet text="사용하지 않는 전기제품 플러그 방치" />
          <Bullet text="음식 조리 중 자리 비우기" />
          <Bullet text="휴대폰·보조배터리 과충전" />
          <Bullet text="담배꽁초 및 라이터 부주의" />
          <Bullet text="가스레인지 사용 후 밸브 미확인" />

          <SubHeading icon="✔️" text="생활 속 예방법" />
          <Bullet text="멀티탭은 정격용량을 확인하고 사용하기" />
          <Bullet text="전기장판은 접어서 사용하지 않기" />
          <Bullet text="외출 전 가스와 전기 확인하기" />
          <Bullet text="충전기는 충전 완료 후 분리하기" />
          <Bullet text="콘센트 주변 먼지 주기적으로 청소하기" />
        </Section>

        <Section
          icon="📋"
          title="2. 우리 집 화재 위험도 체크"
          isOpen={!!openSections.risk}
          onToggle={() => toggleSection('risk')}
        >
          {RISK_CHECK_ITEMS.map((item, i) => (
            <ChecklistRow key={item} label={item} checked={riskChecks[i]} onToggle={() => toggleRiskCheck(i)} />
          ))}
          <View style={[styles.scoreBadge, { backgroundColor: riskResult.color }]}>
            <Text style={styles.scoreBadgeText}>
              {riskScore}개 체크 · {riskResult.label}
            </Text>
          </View>
        </Section>

        <Section
          icon="🚨"
          title="3. 화재 발생 시 행동요령"
          isOpen={!!openSections.action}
          onToggle={() => toggleSection('action')}
        >
          <Step number="①" text='"불이야!" 크게 외쳐 주변에 알린다.' />
          <Step number="②" text="119에 신고한다." />
          <Step number="③" text="초기 화재일 경우 소화기를 사용한다." />
          <Step number="④" text="연기가 많다면 - 낮은 자세로 이동, 입과 코를 가리고 이동, 엘리베이터 이용 금지" />
          <Step number="⑤" text="안전한 장소로 대피한다." />
          <Step number="⑥" text="절대 다시 건물 안으로 들어가지 않는다." />
        </Section>

        <Section
          icon="🧯"
          title="4. 상황별 대처법"
          isOpen={!!openSections.situations}
          onToggle={() => toggleSection('situations')}
        >
          <SubHeading icon="🍳" text="주방 화재" />
          <Bullet text="기름에 물 붓지 않기" />
          <Bullet text="뚜껑이나 젖은 수건으로 덮기" />
          <Bullet text="소화기 사용" />

          <SubHeading icon="🔌" text="전기 화재" />
          <Bullet text="전원 차단" />
          <Bullet text="물 사용 금지" />
          <Bullet text="전용 소화기 사용" />

          <SubHeading icon="🔥" text="가스 화재" />
          <Bullet text="가스 밸브 잠그기 (가능한 경우)" />
          <Bullet text="창문을 열어 환기" />
          <Bullet text="즉시 대피" />

          <SubHeading icon="🔋" text="리튬배터리 화재" />
          <Bullet text="충전 중 이상 발열 시 즉시 분리" />
          <Bullet text="불꽃이 발생하면 가까이 가지 않기" />
          <Bullet text="119 신고" />
        </Section>

        <Section
          icon="🏠"
          title="5. 자취생을 위한 안전 꿀팁"
          isOpen={!!openSections.soloTips}
          onToggle={() => toggleSection('soloTips')}
        >
          <Bullet text="외출 전 전기제품 플러그 확인하기" />
          <Bullet text="멀티탭 하나에 여러 고전력 제품 연결하지 않기" />
          <Bullet text="전기장판 위에 이불 겹쳐 놓지 않기" />
          <Bullet text="라면 끓이다 잠들지 않기" />
          <Bullet text="전자레인지 금속 용기 사용 금지" />
          <Bullet text="소화기 위치를 항상 기억하기" />
        </Section>

        <Section
          icon="🧒"
          title="6. 아이와 함께 배우는 화재 안전"
          isOpen={!!openSections.kids}
          onToggle={() => toggleSection('kids')}
        >
          <SubHeading icon="🧒" text="아이에게 알려주세요" />
          <Bullet text="불장난은 절대 하지 않아요." />
          <Bullet text="성냥과 라이터는 만지지 않아요." />
          <Bullet text="불이 나면 숨지 않고 밖으로 나가요." />
          <Bullet text="엘리베이터를 타지 않아요." />
          <Bullet text="119를 누르는 방법을 배워요." />

          <SubHeading icon="👨‍👩‍👧" text="부모를 위한 팁" />
          <Bullet text="아이와 함께 대피 연습하기" />
          <Bullet text="비상연락처 외우기" />
          <Bullet text="화재 발생 시 가족 집결 장소 정하기" />
        </Section>

        <Section
          icon="🗺️"
          title="7. 우리 집 대피 계획"
          isOpen={!!openSections.evacuation}
          onToggle={() => toggleSection('evacuation')}
        >
          <Bullet text="출입문 확인" />
          <Bullet text="비상계단 위치 확인" />
          <Bullet text="가족 집결 장소 정하기" />
          <Bullet text="반려동물 대피 방법 정하기" />
          <Bullet text="야간 대피 경로 확인하기" />
        </Section>

        <Section
          icon="🎒"
          title="8. 비상용품 체크리스트"
          isOpen={!!openSections.supplies}
          onToggle={() => toggleSection('supplies')}
        >
          {SUPPLY_CHECK_ITEMS.map((item, i) => (
            <ChecklistRow
              key={item}
              label={item}
              checked={supplyChecks[i]}
              onToggle={() => toggleSupplyCheck(i)}
            />
          ))}
        </Section>

        <Section
          icon="🧾"
          title="9. 화재 후 해야 할 일"
          isOpen={!!openSections.afterFire}
          onToggle={() => toggleSection('afterFire')}
        >
          <Bullet text="안전이 확인된 후 귀가하기" />
          <Bullet text="전기·가스 점검받기" />
          <Bullet text="피해 사진 촬영하기" />
          <Bullet text="보험사 및 관리사무소 연락하기" />
          <Bullet text="가족 건강 상태 확인하기" />
        </Section>

        <Section
          icon="💡"
          title="10. 알아두면 좋은 안전 상식"
          isOpen={!!openSections.tips}
          onToggle={() => toggleSection('tips')}
        >
          <SubHeading icon="🧯" text="소화기 사용법 (PASS)" />
          <Bullet text="🟢 P (Pull) : 안전핀 뽑기" />
          <Bullet text="🟢 A (Aim) : 노즐을 불의 아랫부분으로 향하기" />
          <Bullet text="🟢 S (Squeeze) : 손잡이 꽉 누르기" />
          <Bullet text="🟢 S (Sweep) : 좌우로 골고루 분사하기" />

          <SubHeading icon="☎️" text="119 신고할 때 말해야 하는 내용" />
          <Bullet text="어디에서 불이 났는지" />
          <Bullet text="무엇이 타고 있는지" />
          <Bullet text="사람이 있는지" />
          <Bullet text="자신의 이름과 연락처" />
        </Section>

        <Section
          icon="☎️"
          title="11. 긴급 연락처"
          isOpen={!!openSections.contacts}
          onToggle={() => toggleSection('contacts')}
        >
          <TouchableOpacity style={styles.emergencyRow} onPress={() => callNumber('119')} activeOpacity={0.7}>
            <Text style={styles.emergencyIcon}>🚒</Text>
            <View style={styles.emergencyTextGroup}>
              <Text style={styles.emergencyName}>119 · 화재/응급 신고</Text>
            </View>
            <Text style={styles.callText}>전화</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.emergencyRow} onPress={() => callNumber('112')} activeOpacity={0.7}>
            <Text style={styles.emergencyIcon}>🚓</Text>
            <View style={styles.emergencyTextGroup}>
              <Text style={styles.emergencyName}>112 · 경찰 신고</Text>
            </View>
            <Text style={styles.callText}>전화</Text>
          </TouchableOpacity>

          <Text style={styles.contactGroupTitle}>가족 비상 연락처</Text>
          {familyContacts.length === 0 && (
            <Text style={styles.contactEmptyHint}>등록된 가족 연락처가 없어요. 아래에서 추가해 보세요.</Text>
          )}
          {familyContacts.map((c) => (
            <View key={c.id} style={styles.emergencyRow}>
              <Text style={styles.emergencyIcon}>👪</Text>
              <View style={styles.emergencyTextGroup}>
                <Text style={styles.emergencyName}>{c.name}</Text>
                <Text style={styles.emergencyPhone}>{c.phone}</Text>
              </View>
              <TouchableOpacity onPress={() => callNumber(c.phone)} hitSlop={8}>
                <Text style={styles.callText}>전화</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.contactDeleteButton}
                onPress={() => removeFamilyContact(c.id)}
                hitSlop={8}
                accessibilityLabel={`${c.name} 연락처 삭제`}
              >
                <CloseIcon size={14} color={colors.textGray} />
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity
            style={styles.addContactButton}
            onPress={() => setAddContactVisible(true)}
            activeOpacity={0.7}
          >
            <PlusIcon size={14} />
            <Text style={styles.addContactButtonText}>가족 연락처 추가</Text>
          </TouchableOpacity>

          <Text style={styles.contactGroupTitle}>경비실 / 관리사무소</Text>
          <View style={styles.guardRow}>
            <Text style={styles.emergencyIcon}>🏢</Text>
            <TextInput
              style={styles.guardInput}
              value={guardPhone}
              onChangeText={setGuardPhone}
              placeholder="경비실 번호를 등록하세요"
              placeholderTextColor={colors.textGray}
              keyboardType="phone-pad"
            />
            {!!guardPhone && (
              <TouchableOpacity onPress={() => callNumber(guardPhone)} hitSlop={8}>
                <Text style={styles.callText}>전화</Text>
              </TouchableOpacity>
            )}
          </View>
        </Section>
      </ScrollView>

      <View style={styles.bottomNavWrap}>
        <BottomNav variant="sub" />
      </View>

      <AddContactModal
        visible={addContactVisible}
        onClose={() => setAddContactVisible(false)}
        onSubmit={addFamilyContact}
      />
    </SafeAreaView>
  );
}

const SCREEN_PADDING = 20;

// 글자 크기 설정(fontScale)에 따라 이 화면에 쓰이는 모든 fontSize를 함께 스케일한 StyleSheet를
// 새로 만든다. 레이아웃(padding/margin/색상 등)은 그대로 두고 글자 크기만 바뀐다.
function createStyles(fontScale: number) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.white,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: SCREEN_PADDING,
      paddingTop: 10,
      paddingBottom: 8,
    },
    headerIcon: {
      fontSize: 26 * fontScale,
    },
    headerTitle: {
      fontFamily: fonts.jalnan,
      fontSize: 20 * fontScale,
      color: colors.text,
    },

    content: {
      flex: 1,
    },
    contentInner: {
      paddingHorizontal: SCREEN_PADDING,
      paddingBottom: 20,
      gap: 12,
    },

    sectionCard: {
      padding: 0,
      overflow: 'hidden',
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: 16,
    },
    sectionIcon: {
      fontSize: 22 * fontScale,
    },
    sectionTitle: {
      flex: 1,
      fontFamily: fonts.jalnan,
      fontSize: 15 * fontScale,
      color: colors.text,
    },
    sectionChevron: {
      fontSize: 12 * fontScale,
      color: colors.textGray,
    },
    sectionBody: {
      paddingHorizontal: 16,
      paddingBottom: 16,
    },

    subHeadingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 10,
      marginBottom: 4,
    },
    subHeadingIcon: {
      fontSize: 16 * fontScale,
    },
    subHeadingText: {
      fontFamily: fonts.jalnan,
      fontSize: 14 * fontScale,
      color: colors.text,
    },

    bulletRow: {
      flexDirection: 'row',
      paddingVertical: 3,
      gap: 6,
    },
    bulletDot: {
      fontSize: 14 * fontScale,
      color: colors.textGray2,
    },
    bulletText: {
      flex: 1,
      fontSize: 14 * fontScale,
      color: colors.textGray2,
      lineHeight: 20 * fontScale,
    },
    stepNumber: {
      fontFamily: fonts.jalnan,
      fontSize: 14 * fontScale,
      color: colors.orange,
    },

    checklistRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 8,
    },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkboxChecked: {
      backgroundColor: colors.green,
      borderColor: colors.green,
    },
    checkboxMark: {
      color: colors.white,
      fontSize: 13 * fontScale,
      fontWeight: 'bold',
    },
    checklistLabel: {
      fontSize: 14 * fontScale,
      color: colors.text,
    },
    checklistLabelChecked: {
      color: colors.textGray,
      textDecorationLine: 'line-through',
    },
    scoreBadge: {
      marginTop: 10,
      alignItems: 'center',
      paddingVertical: 10,
      borderRadius: 12,
    },
    scoreBadgeText: {
      fontFamily: fonts.jalnan,
      fontSize: 14 * fontScale,
      color: colors.white,
    },

    emergencyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    emergencyIcon: {
      fontSize: 22 * fontScale,
    },
    emergencyTextGroup: {
      flex: 1,
    },
    emergencyName: {
      fontFamily: fonts.jalnan,
      fontSize: 14 * fontScale,
      color: colors.text,
    },
    emergencyPhone: {
      fontSize: 13 * fontScale,
      color: colors.textGray,
      marginTop: 2,
    },
    callText: {
      fontFamily: fonts.jalnan,
      fontSize: 13 * fontScale,
      color: colors.orange,
      textDecorationLine: 'underline',
    },
    contactDeleteButton: {
      padding: 4,
    },
    contactGroupTitle: {
      fontFamily: fonts.jalnan,
      fontSize: 13 * fontScale,
      color: colors.textGray2,
      marginTop: 16,
      marginBottom: 4,
    },
    contactEmptyHint: {
      fontSize: 13 * fontScale,
      color: colors.textGray,
      marginBottom: 6,
    },
    addContactButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginTop: 10,
      paddingVertical: 12,
      borderRadius: 14,
      backgroundColor: colors.card,
    },
    addContactButtonText: {
      fontFamily: fonts.jalnan,
      fontSize: 14 * fontScale,
      color: colors.textGray2,
    },
    guardRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    guardInput: {
      flex: 1,
      fontFamily: fonts.jalnan,
      fontSize: 14 * fontScale,
      color: colors.text,
      backgroundColor: colors.card,
      borderRadius: 12,
      paddingVertical: 10,
      paddingHorizontal: 14,
    },

    bottomNavWrap: {
      paddingHorizontal: 20,
      paddingBottom: 10,
      paddingTop: 6,
    },

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
      fontSize: 18 * fontScale,
      color: colors.text,
      marginBottom: 18,
      textAlign: 'center',
    },
    modalInputGroup: {
      gap: 10,
      marginBottom: 18,
    },
    modalInput: {
      fontFamily: fonts.jalnan,
      fontSize: 15 * fontScale,
      color: colors.text,
      backgroundColor: colors.card,
      borderRadius: 12,
      paddingVertical: 10,
      paddingHorizontal: 14,
    },
    modalBottomRow: {
      flexDirection: 'row',
      gap: 10,
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
      fontSize: 15 * fontScale,
      color: colors.text,
    },
    modalSaveButton: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 12,
      borderRadius: 14,
      backgroundColor: colors.orange,
    },
    modalSaveText: {
      fontFamily: fonts.jalnan,
      fontSize: 15 * fontScale,
      color: colors.white,
    },
  });
}
