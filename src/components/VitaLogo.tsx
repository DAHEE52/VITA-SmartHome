// VITA 브랜드 로고 컴포넌트.
// 스플래시 화면(크게)과 메인화면 헤더(작게)에서 size만 다르게 주고 재사용한다.
// 로고는 세 부분으로 구성: ① 집+번개 아이콘  ② "VITA" 워드마크(Jalnan 폰트)  ③ 오렌지 조각 아이콘
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Rect, Circle, Line, G } from 'react-native-svg';
import { colors, fonts } from '../theme/colors';

// 집 모양 + 내부 번개 볼트 아이콘.
// viewBox 0~100 좌표계 기준으로 좌표를 잡아뒀기 때문에 size prop만 바꾸면
// SVG가 그대로 스케일되어 비율이 깨지지 않는다.
function HouseBoltIcon({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {/* 지붕 위로 튀어나온 굴뚝 (사각형 테두리만) */}
      <Rect x={64} y={16} width={10} height={16} fill="none" stroke={colors.text} strokeWidth={4} />
      {/* 지붕 라인 (삼각 지붕) */}
      <Path
        d="M6 52 L50 14 L94 52"
        fill="none"
        stroke={colors.text}
        strokeWidth={5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* 집 벽 (좌/하/우 테두리, 지붕과 만나는 부분은 열어둠) */}
      <Path
        d="M18 46 L18 90 L82 90 L82 46"
        fill="none"
        stroke={colors.text}
        strokeWidth={5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* 집 안쪽 번개 모양 (원본 시안의 오렌지색 지그재그 볼트) */}
      <Path
        d="M56 34 L34 60 L48 60 L42 82 L68 54 L52 54 Z"
        fill={colors.orange}
        stroke={colors.text}
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// "VITA" 텍스트 위, A자 오른쪽 위에 겹쳐지는 오렌지(귤) 조각 아이콘.
// 반원 테두리 + 중심에서 뻗어나가는 5개의 방사선으로 단면을 표현한다.
function OrangeSliceIcon({ size }: { size: number }) {
  const r = 44;
  const cx = 50;
  const cy = 66;
  // 방사선 각도(도 단위, 0도=정오 방향). 원본처럼 부채꼴로 5줄만 그린다.
  const lines = [-58, -30, 0, 30, 58];
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {/* 시안에서는 조각 전체가 시계방향으로 살짝 기울어져 떠 있으므로 그룹째로 회전시킴 */}
      <G rotation={22} origin={`${cx}, ${cy}`}>
        {/* 조각의 둥근 테두리(반원) */}
        <Path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke={colors.orange}
          strokeWidth={7}
          strokeLinecap="round"
        />
        {/* 과육을 나누는 방사선들 */}
        {lines.map((deg, i) => {
          const rad = (deg * Math.PI) / 180;
          const x2 = cx + r * 0.82 * Math.sin(rad);
          const y2 = cy - r * 0.82 * Math.cos(rad);
          return (
            <Line
              key={i}
              x1={cx}
              y1={cy}
              x2={x2}
              y2={y2}
              stroke={colors.orange}
              strokeWidth={6}
              strokeLinecap="round"
            />
          );
        })}
        {/* 중심점 (방사선이 모이는 부분을 자연스럽게 마감) */}
        <Circle cx={cx} cy={cy} r={4} fill={colors.orange} />
      </G>
    </Svg>
  );
}

type Props = {
  /** 로고 전체 크기 기준값(px). 다른 요소들은 전부 이 값에 비례해서 계산됨 */
  size?: number;
  /** true면 로고 아래에 "당신의 생활 리듬을 읽는 스마트홈" 태그라인을 표시 (스플래시 화면 전용) */
  showTagline?: boolean;
};

export default function VitaLogo({ size = 60, showTagline = false }: Props) {
  const iconSize = size;
  const fontSize = size * 1.05; // VITA 글자가 아이콘보다 살짝 크게 보이도록 비율 보정
  const sliceSize = size * 0.75; // 오렌지 조각 크기 (A 위에 떠 있는 보조 요소)
  // 오렌지 조각을 음수 marginTop(-size*0.78)으로 끌어올리기 때문에, 그만큼의 여유 공간을
  // 컴포넌트 자기 자신의 paddingTop으로 미리 확보해둔다.
  // 이게 없으면 헤더처럼 화면 맨 위쪽에 로고를 놓았을 때 조각 윗부분이 상태바/노치에 가려
  // "로고가 잘린 것"처럼 보이는 문제가 생긴다 (실기기에서 확인된 이슈).
  const overhangGuard = size * 0.8;

  return (
    <View style={{ paddingTop: overhangGuard }}>
      <View style={styles.row}>
        <View style={{ width: iconSize, height: iconSize }}>
          <HouseBoltIcon size={iconSize} />
        </View>
        <View style={{ marginLeft: size * 0.06 }}>
          <Text
            style={{
              fontFamily: fonts.jalnan,
              fontSize,
              color: colors.text,
              lineHeight: fontSize * 1.05,
            }}
          >
            VITA
          </Text>
        </View>
        {/* 오렌지 조각을 음수 margin으로 끌어올려 "A" 오른쪽 위쪽 공중에 배치 (시안 참고) */}
        <View
          style={{
            width: sliceSize,
            height: sliceSize,
            marginLeft: -size * 0.14,
            marginTop: -size * 0.78,
          }}
        >
          <OrangeSliceIcon size={sliceSize} />
        </View>
      </View>
      {showTagline && (
        <Text
          style={{
            fontFamily: fonts.jalnan,
            fontSize: size * 0.28,
            color: colors.text,
            marginTop: size * 0.22,
            textAlign: 'center',
          }}
        >
          당신의 생활 리듬을 읽는 스마트홈
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
