// 화면 전반에서 재사용되는 아이콘 모음.
// 일부는 0~100 기준 정사각형 viewBox의 직접 그린 라인 아이콘(size, color props)이고,
// 일부(달리기/리모컨/캘린더/그래프)는 UIUX/icon 폴더의 svg 아트를,
// 일부(온도계/깃발/기압/에너지 나무)는 같은 폴더의 png 아트를 그대로 불러와 쓴다.
// 둘 다 원본 비율을 유지한 채(svg는 preserveAspectRatio, png는 resizeMode="contain") size 프롭 하나로 스케일된다.
import React from 'react';
import Svg, { Path, Circle, Line } from 'react-native-svg';
import { Image } from 'react-native';
import { colors } from '../theme/colors';

import RunnerSvg from '../../UIUX/icon/runner.svg';
import RemoteSvg from '../../UIUX/icon/remote.svg';
import CalendarSvg from '../../UIUX/icon/calendar.svg';
import GraphSvg from '../../UIUX/icon/graph.svg';

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
export function ThermometerIcon({ size = 40 }: { size?: number }) {
  return (
    <Image
      source={require('../../UIUX/icon/2-온도계.png')}
      style={{ width: size, height: size }}
      resizeMode="contain"
    />
  );
}

// 기압 위젯의 게이지 아이콘.
// 원본 png(8-기압.png)는 캔버스 안에 실제 그림이 차지하는 비율이 온도계 아이콘보다 훨씬 작아서
// (500x500 캔버스에 그림은 약 400x273) 같은 size를 줘도 눈에 띄게 작아 보였다. 투명 여백을
// 잘라낸 8-기압-cropped.png로 바꿔서 다른 위젯 아이콘들과 체감 크기가 맞도록 했다.
export function PressureIcon({ size = 40 }: { size?: number }) {
  return (
    <Image
      source={require('../../UIUX/icon/8-기압-cropped.png')}
      style={{ width: size, height: size }}
      resizeMode="contain"
    />
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

// 절전 목표 progress bar 위를 달리는 사람 아이콘
export function RunnerIcon({ size = 36 }: { size?: number }) {
  return <RunnerSvg width={size} height={size} />;
}

// progress bar 끝에 꽂혀있는 목표 깃발 아이콘
export function FlagIcon({ size = 36 }: { size?: number }) {
  return (
    <Image
      source={require('../../UIUX/icon/3-깃발.png')}
      style={{ width: size, height: size }}
      resizeMode="contain"
    />
  );
}

// "스마트홈 제어" 메뉴 아이콘 - 리모컨
export function RemoteIcon({ size = 40 }: { size?: number }) {
  return <RemoteSvg width={size} height={size} />;
}

// "캘린더" 메뉴 아이콘
export function CalendarIcon({ size = 40 }: { size?: number }) {
  return <CalendarSvg width={size} height={size} />;
}

// "에너지 사용량" 메뉴 아이콘 - 상승 막대그래프
export function ChartUpIcon({ size = 40 }: { size?: number }) {
  return <GraphSvg width={size} height={size} />;
}

// "에너지 나무" 메뉴 아이콘
export function TreeIcon({ size = 40 }: { size?: number }) {
  return (
    <Image
      source={require('../../UIUX/icon/9-에너지 나무.png')}
      style={{ width: size, height: size }}
      resizeMode="contain"
    />
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
