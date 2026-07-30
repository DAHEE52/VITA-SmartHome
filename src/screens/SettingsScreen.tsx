// 신규 화면 - 설정.
// 구조: 주소 등록 카드 / 글자 크기 조절 카드(가이드북 전용) / 앱 정보 카드 / 하단 네비(홈)
import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView } from 'react-native';
import AnimatedPressable from '../components/AnimatedPressable';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts } from '../theme/colors';
import Card from '../components/Card';
import BottomNav from '../components/BottomNav';
import { useSettings, FontSizeOption, FONT_SIZE_SCALE, FONT_SIZE_LABEL } from '../context/SettingsContext';

const SCREEN_PADDING = 20;
const FONT_SIZE_OPTIONS: FontSizeOption[] = ['small', 'medium', 'large'];

export default function SettingsScreen() {
  const { address, setAddress, guidebookFontSize, setGuidebookFontSize, emergencyPhone, setEmergencyPhone } =
    useSettings();
  const [addressDraft, setAddressDraft] = useState(address);
  const [emergencyPhoneDraft, setEmergencyPhoneDraft] = useState(emergencyPhone);

  const saveAddress = () => {
    setAddress(addressDraft.trim());
  };

  const saveEmergencyPhone = () => {
    setEmergencyPhone(emergencyPhoneDraft.trim());
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.headerIcon}>⚙️</Text>
        <Text style={styles.headerTitle}>설정</Text>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner} showsVerticalScrollIndicator={false}>
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>🏠 주소 등록</Text>
          <View style={styles.addressRow}>
            <TextInput
              style={styles.addressInput}
              value={addressDraft}
              onChangeText={setAddressDraft}
              placeholder="집 주소를 입력하세요"
              placeholderTextColor={colors.textGray}
              onSubmitEditing={saveAddress}
              returnKeyType="done"
            />
            <AnimatedPressable style={styles.saveButton} onPress={saveAddress} activeOpacity={0.7}>
              <Text style={styles.saveButtonText}>등록</Text>
            </AnimatedPressable>
          </View>
          {address ? (
            <Text style={styles.addressSavedText}>등록된 주소: {address}</Text>
          ) : (
            <Text style={styles.addressHint}>등록된 주소가 없어요.</Text>
          )}
        </Card>

        <Card style={styles.card}>
          <Text style={styles.cardTitle}>🚨 화재 위험 비상 연락처</Text>
          <Text style={styles.cardSubtitle}>
            화재 위험(전원 자동 차단)이 감지되면 이 번호로 긴급 SMS를 보내요. 비워두면 문자는 안
            가고 앱 알림만 떠요.
          </Text>
          <View style={styles.addressRow}>
            <TextInput
              style={styles.addressInput}
              value={emergencyPhoneDraft}
              onChangeText={(v) => setEmergencyPhoneDraft(v.replace(/[^0-9]/g, ''))}
              placeholder="01012345678"
              placeholderTextColor={colors.textGray}
              keyboardType="number-pad"
              onSubmitEditing={saveEmergencyPhone}
              returnKeyType="done"
            />
            <AnimatedPressable style={styles.saveButton} onPress={saveEmergencyPhone} activeOpacity={0.7}>
              <Text style={styles.saveButtonText}>등록</Text>
            </AnimatedPressable>
          </View>
          {emergencyPhone ? (
            <Text style={styles.addressSavedText}>등록된 번호: {emergencyPhone}</Text>
          ) : (
            <Text style={styles.addressHint}>등록된 번호가 없어요.</Text>
          )}
        </Card>

        <Card style={styles.card}>
          <Text style={styles.cardTitle}>🔤 글자 크기 조절</Text>
          <Text style={styles.cardSubtitle}>안전 가이드북 화면의 글자 크기에만 적용돼요.</Text>

          <View style={styles.fontSizeRow}>
            {FONT_SIZE_OPTIONS.map((option) => {
              const selected = option === guidebookFontSize;
              return (
                <AnimatedPressable
                  key={option}
                  style={[styles.fontSizeChip, selected && styles.fontSizeChipSelected]}
                  onPress={() => setGuidebookFontSize(option)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.fontSizeChipText, selected && styles.fontSizeChipTextSelected]}>
                    {FONT_SIZE_LABEL[option]}
                  </Text>
                </AnimatedPressable>
              );
            })}
          </View>

          <View style={styles.previewBox}>
            <Text style={[styles.previewText, { fontSize: 14 * FONT_SIZE_SCALE[guidebookFontSize] }]}>
              미리보기: 화재가 나면 신속하게 대피하세요.
            </Text>
          </View>
        </Card>

        <Card style={styles.card}>
          <Text style={styles.cardTitle}>🔒 프라이버시 정보</Text>
          <Text style={styles.privacyLine}>· 카메라 영상은 저장되지 않아요.</Text>
          <Text style={styles.privacyLine}>· 재실/취침/생활 패턴은 기기(엣지)에서 분석한 결과만 전송돼요.</Text>
          <Text style={styles.privacyLine}>· 원본 영상은 클라우드에 업로드되지 않아요.</Text>
        </Card>

        <Card style={styles.card}>
          <Text style={styles.cardTitle}>ℹ️ 앱 정보</Text>
          <Text style={styles.infoText}>VITA 스마트홈 v1.0 (프로토타입)</Text>
        </Card>
      </ScrollView>

      <View style={styles.bottomNavWrap}>
        <BottomNav variant="sub" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
    fontSize: 26,
  },
  headerTitle: {
    fontFamily: fonts.jalnan,
    fontSize: 18,
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

  card: {},
  cardTitle: {
    fontFamily: fonts.jalnan,
    fontSize: 15,
    color: colors.text,
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 12,
    color: colors.textGray,
    marginBottom: 12,
  },

  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
  },
  addressInput: {
    flex: 1,
    fontFamily: fonts.jalnan,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  saveButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: colors.orange,
  },
  saveButtonText: {
    fontFamily: fonts.jalnan,
    fontSize: 14,
    color: colors.white,
  },
  addressSavedText: {
    marginTop: 10,
    fontSize: 13,
    color: colors.textGray2,
  },
  addressHint: {
    marginTop: 10,
    fontSize: 13,
    color: colors.textGray,
  },

  fontSizeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  fontSizeChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.card,
  },
  fontSizeChipSelected: {
    backgroundColor: colors.orange,
  },
  fontSizeChipText: {
    fontFamily: fonts.jalnan,
    fontSize: 14,
    color: colors.textGray2,
  },
  fontSizeChipTextSelected: {
    color: colors.white,
  },
  previewBox: {
    marginTop: 14,
    padding: 14,
    borderRadius: 12,
    backgroundColor: colors.card,
  },
  previewText: {
    fontFamily: fonts.jalnan,
    color: colors.text,
  },

  infoText: {
    fontSize: 13,
    color: colors.textGray2,
  },

  privacyLine: {
    fontSize: 13,
    color: colors.textGray2,
    lineHeight: 20,
  },

  bottomNavWrap: {
    paddingHorizontal: 20,
    paddingBottom: 10,
    paddingTop: 6,
  },
});
