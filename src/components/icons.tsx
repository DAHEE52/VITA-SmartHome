// 화면 전반에서 재사용되는 간단한 라인 아이콘 모음.
// 전부 0~100 기준 정사각형 viewBox라서 size prop 하나로 비율 안 깨지고 스케일된다.
// 새 아이콘이 필요하면 이 파일에 같은 패턴(size, color props)으로 추가하면 다른 화면에서도 바로 재사용 가능.
import React from 'react';
import Svg, { Path, Circle, Rect, Line } from 'react-native-svg';
import { Image } from 'react-native';
import { colors } from '../theme/colors';

type IconProps = { size?: number; color?: string };

// 상단 헤더의 햄버거 메뉴(3줄) 아이콘
export function MenuIcon({ size = 28, color = colors.text }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Line x1={12} y1={26} x2={88} y2={26} stroke={color} strokeWidth={7} strokeLinecap="round" />
      <Line x1={12} y1={50} x2={88} y2={50} stroke={color} strokeWidth={7} strokeLinecap="round" />
      <Line x1={12} y1={74} x2={88} y2={74} stroke={color} strokeWidth={7} strokeLinecap="round" />
    </Svg>
  );
}

// 알림 벨 아이콘
export function BellIcon({ size = 28, color = colors.text }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path
        d="M50 12 C50 12 50 18 50 18 C32 18 24 32 24 50 L24 62 L14 76 L86 76 L76 62 L76 50 C76 32 68 18 50 18"
        fill="none"
        stroke={color}
        strokeWidth={6}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <Path d="M40 82 C40 88 44 92 50 92 C56 92 60 88 60 82" fill="none" stroke={color} strokeWidth={6} strokeLinecap="round" />
    </Svg>
  );
}

// 설정 톱니바퀴 아이콘
export function GearIcon({ size = 28, color = colors.text }: IconProps) {
  const teeth = 8;
  const cx = 50;
  const cy = 50;
  const rOuter = 40;
  const rInner = 30;
  const points: string[] = [];
  for (let i = 0; i < teeth * 2; i++) {
    const angle = (Math.PI / teeth) * i;
    const r = i % 2 === 0 ? rOuter : rInner;
    points.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path
        d={`M ${points.join(' L ')} Z`}
        fill="none"
        stroke={color}
        strokeWidth={6}
        strokeLinejoin="round"
      />
      <Circle cx={cx} cy={cy} r={14} fill="none" stroke={color} strokeWidth={6} />
    </Svg>
  );
}

// 습도 위젯의 물방울 아이콘 (테두리만, 안은 비어있음)
export function DropletIcon({ size = 40, color = colors.text }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path
        d="M50 10 C50 10 20 46 20 66 C20 84 34 96 50 96 C66 96 80 84 80 66 C80 46 50 10 50 10 Z"
        fill="none"
        stroke={color}
        strokeWidth={6}
        strokeLinejoin="round"
      />
      {/* 물방울 안쪽 하이라이트 곡선 */}
      <Path d="M34 68 C34 76 40 82 47 83" fill="none" stroke={color} strokeWidth={5} strokeLinecap="round" />
    </Svg>
  );
}

// 온도 위젯의 온도계 아이콘
export function ThermometerIcon({ size = 40, color = colors.text }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path
        d="M46 14 C46 8 52 8 52 14 L52 62 C60 66 64 74 64 80 C64 90 56 96 48 96 C38 96 30 90 30 80 C30 72 34 66 40 62 L40 14"
        fill="none"
        stroke={color}
        strokeWidth={6}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <Circle cx={72} cy={20} r={4} fill="none" stroke={color} strokeWidth={5} />
    </Svg>
  );
}

// 스트레스 위젯의 웃는 얼굴 (노란 원 + 검은 이목구비) - "좋음" 상태 표현용
export function SmileyIcon({ size = 40 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Circle cx={50} cy={50} r={44} fill={colors.yellow} />
      <Circle cx={35} cy={44} r={5} fill={colors.text} />
      <Circle cx={65} cy={44} r={5} fill={colors.text} />
      <Path
        d="M32 60 C38 70 62 70 68 60"
        fill="none"
        stroke={colors.text}
        strokeWidth={5}
        strokeLinecap="round"
      />
    </Svg>
  );
}

// 절전 목표 카드 제목 옆의 작은 번개 아이콘 (테두리만, 채우기 없음)
export function BoltOutlineIcon({ size = 24, color = colors.text }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path
        d="M58 6 L20 58 L46 58 L38 94 L82 40 L54 40 Z"
        fill="none"
        stroke={color}
        strokeWidth={7}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// 절전 목표 progress bar 위를 달리는 사람 아이콘 (단순화된 실루엣)
export function RunnerIcon({ size = 36, color = colors.text }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Circle cx={62} cy={18} r={10} fill={color} />
      <Path
        d="M58 30 L44 46 L58 54 L50 66 M58 54 L70 62 L78 78 M44 46 L26 52 M50 66 L34 74 L24 90"
        fill="none"
        stroke={color}
        strokeWidth={8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// progress bar 끝에 꽂혀있는 목표 깃발 아이콘
export function FlagIcon({ size = 36 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Line x1={20} y1={10} x2={20} y2={94} stroke={colors.text} strokeWidth={6} strokeLinecap="round" />
      <Path d="M20 14 L78 24 L58 38 L78 52 L20 60 Z" fill={colors.orange} />
    </Svg>
  );
}

// "스마트홈 제어" 메뉴 아이콘 - 리모컨 + wifi 신호
export function RemoteIcon({ size = 40, color = colors.text }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Rect x={30} y={22} width={30} height={64} rx={12} fill="none" stroke={color} strokeWidth={6} />
      <Circle cx={45} cy={38} r={4} fill={color} />
      <Line x1={38} y1={52} x2={52} y2={52} stroke={color} strokeWidth={5} strokeLinecap="round" />
      <Line x1={38} y1={64} x2={52} y2={64} stroke={color} strokeWidth={5} strokeLinecap="round" />
      <Line x1={38} y1={76} x2={52} y2={76} stroke={color} strokeWidth={5} strokeLinecap="round" />
      {/* 리모컨 우측 위에서 뻗어나가는 wifi 신호 곡선 3개 */}
      <Path d="M66 34 C74 28 84 28 92 34" fill="none" stroke={color} strokeWidth={5} strokeLinecap="round" />
      <Path d="M62 26 C74 16 88 16 100 26" fill="none" stroke={color} strokeWidth={5} strokeLinecap="round" />
    </Svg>
  );
}

// "캘린더" 메뉴 아이콘
export function CalendarIcon({ size = 40, color = colors.text }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Rect x={14} y={22} width={72} height={64} rx={8} fill="none" stroke={color} strokeWidth={6} />
      <Line x1={14} y1={40} x2={86} y2={40} stroke={color} strokeWidth={6} />
      <Line x1={32} y1={10} x2={32} y2={28} stroke={color} strokeWidth={6} strokeLinecap="round" />
      <Line x1={68} y1={10} x2={68} y2={28} stroke={color} strokeWidth={6} strokeLinecap="round" />
      <Rect x={26} y={50} width={12} height={12} fill={color} />
      <Rect x={44} y={50} width={12} height={12} fill={color} />
      <Rect x={62} y={50} width={12} height={12} fill={color} />
      <Rect x={26} y={68} width={12} height={12} fill={color} />
      <Rect x={44} y={68} width={12} height={12} fill={color} />
    </Svg>
  );
}

// "에너지 사용량" 메뉴 아이콘 - 상승 막대그래프 + 화살표
export function ChartUpIcon({ size = 40, color = colors.text }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Line x1={14} y1={90} x2={14} y2={20} stroke={color} strokeWidth={6} strokeLinecap="round" />
      <Line x1={14} y1={90} x2={90} y2={90} stroke={color} strokeWidth={6} strokeLinecap="round" />
      <Rect x={26} y={62} width={12} height={22} fill={color} />
      <Rect x={48} y={48} width={12} height={36} fill={color} />
      <Rect x={70} y={34} width={12} height={50} fill={color} />
      <Path d="M40 30 L64 30 L64 54" fill="none" stroke={color} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M28 66 L64 30" fill="none" stroke={color} strokeWidth={6} strokeLinecap="round" />
    </Svg>
  );
}

// "헬스케어" 메뉴 아이콘 - 하트 + 심전도 라인
export function HeartPulseIcon({ size = 40, color = colors.text }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path
        d="M50 88 C20 66 10 46 10 30 C10 16 22 8 34 12 C42 15 48 22 50 28 C52 22 58 15 66 12 C78 8 90 16 90 30 C90 46 80 66 50 88 Z"
        fill="none"
        stroke={color}
        strokeWidth={6}
        strokeLinejoin="round"
      />
      <Path
        d="M20 46 L36 46 L42 32 L52 60 L60 46 L80 46"
        fill="none"
        stroke={color}
        strokeWidth={6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// 방/카드 우측 상단에 쓰이는 "..." 더보기 아이콘
export function EllipsisIcon({ size = 24, color = colors.text }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Circle cx={20} cy={50} r={9} fill={color} />
      <Circle cx={50} cy={50} r={9} fill={color} />
      <Circle cx={80} cy={50} r={9} fill={color} />
    </Svg>
  );
}

// 추가하기 "+" 버튼 아이콘
export function PlusIcon({ size = 24, color = colors.text }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Line x1={50} y1={16} x2={50} y2={84} stroke={color} strokeWidth={8} strokeLinecap="round" />
      <Line x1={16} y1={50} x2={84} y2={50} stroke={color} strokeWidth={8} strokeLinecap="round" />
    </Svg>
  );
}

// 삭제/닫기용 "X" 아이콘. PlusIcon과 같은 두 직선 조합을 대각선으로 그린 것.
export function CloseIcon({ size = 24, color = colors.text }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Line x1={22} y1={22} x2={78} y2={78} stroke={color} strokeWidth={8} strokeLinecap="round" />
      <Line x1={78} y1={22} x2={22} y2={78} stroke={color} strokeWidth={8} strokeLinecap="round" />
    </Svg>
  );
}

// "에너지 나무" 메뉴 아이콘
export function TreeIcon({ size = 40 }: { size?: number }) {
  return (
    <Image
      source={require('../../assets/icons/6-energy-tree.png')}
      style={{ width: size, height: size }}
      resizeMode="contain"
    />
  );
}

// "자동화 규칙" 메뉴 아이콘
export function AutomationIcon({ size = 40 }: { size?: number }) {
  return (
    <Image
      source={require('../../assets/icons/13-automation.png')}
      style={{ width: size, height: size }}
      resizeMode="contain"
    />
  );
}

// 에너지 나무 화면의 성장 단계 아이콘 - 새싹(가장 어림) → 어린 나무 → 나무(다 자람) 순.
export function SproutIcon({ size = 40 }: { size?: number }) {
  return (
    <Image
      source={require('../../assets/icons/9-sprout.png')}
      style={{ width: size, height: size }}
      resizeMode="contain"
    />
  );
}
export function SaplingIcon({ size = 40 }: { size?: number }) {
  return (
    <Image
      source={require('../../assets/icons/10-sapling.png')}
      style={{ width: size, height: size }}
      resizeMode="contain"
    />
  );
}
export function GrownTreeIcon({ size = 40 }: { size?: number }) {
  return (
    <Image
      source={require('../../assets/icons/11-tree.png')}
      style={{ width: size, height: size }}
      resizeMode="contain"
    />
  );
}
