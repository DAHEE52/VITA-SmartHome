// VITA 브랜드 로고 컴포넌트.
// 스플래시 화면(크게)과 메인화면 헤더(작게)에서 size만 다르게 주고 재사용한다.
// 로고 아트(집+번개 아이콘 / VITA 워드마크 / 오렌지 조각)는 UIUX/icon/1-로고.png 파일 하나로 되어있고,
// 투명 여백을 꽉 채우도록 미리 잘라둬서 aspect ratio가 항상 유지된다.
import React from 'react';
import { View, Text, Image } from 'react-native';
import { fonts, colors } from '../theme/colors';

const LOGO_ASPECT_RATIO = 482 / 183;

type Props = {
  /** 로고 높이 기준값(px). 너비는 원본 비율(가로로 긴 형태)에 맞춰 자동 계산됨 */
  size?: number;
  /** true면 로고 아래에 "당신의 생활 리듬을 읽는 스마트홈" 태그라인을 표시 (스플래시 화면 전용) */
  showTagline?: boolean;
};

export default function VitaLogo({ size = 60, showTagline = false }: Props) {
  const height = size;
  const width = size * LOGO_ASPECT_RATIO;

  return (
    <View style={{ alignItems: 'center' }}>
      <Image
        source={require('../../UIUX/icon/1-로고.png')}
        style={{ width, height }}
        resizeMode="contain"
      />
      {showTagline && (
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          style={{
            fontFamily: fonts.jalnan,
            fontSize: size * 0.16,
            color: colors.text,
            marginTop: size * 0.3,
            textAlign: 'center',
          }}
        >
          당신의 생활 리듬을 읽는 스마트홈
        </Text>
      )}
    </View>
  );
}
