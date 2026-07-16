// 화면 전반에서 재사용되는 아이콘 모음.
// 대부분은 assets/icons 폴더의 png 아트를 그대로 불러와 쓰고(resizeMode="contain"으로 원본
// 비율 유지), 새 png 에셋이 없는 몇 개(날씨/번개/더보기/추가/닫기)만 0~100 기준 정사각형 viewBox의
// 직접 그린 라인 아이콘(size, color props)으로 남아있다.
import React from 'react';
import Svg, { Path, Circle, Line } from 'react-native-svg';
import { Image } from 'react-native';
import { colors } from '../theme/colors';

type IconProps = { size?: number; color?: string };

// 상단 헤더의 햄버거 메뉴(3줄) 아이콘
export function MenuIcon({ size = 28 }: { size?: number }) {
  return (
    <Image
      source={require('../../assets/icons/20-menu.png')}
      style={{ width: size, height: size }}
      resizeMode="contain"
    />
  );
}

// 알림 벨 아이콘
export function BellIcon({ size = 28 }: { size?: number }) {
  return (
    <Image
      source={require('../../assets/icons/19-notification.png')}
      style={{ width: size, height: size }}
      resizeMode="contain"
    />
  );
}

// 설정 톱니바퀴 아이콘
export function GearIcon({ size = 28 }: { size?: number }) {
  return (
    <Image
      source={require('../../assets/icons/12-settings.png')}
      style={{ width: size, height: size }}
      resizeMode="contain"
    />
  );
}

// 습도 위젯 아이콘
export function DropletIcon({ size = 40 }: { size?: number }) {
  return (
    <Image
      source={require('../../assets/icons/14-humidity.png')}
      style={{ width: size, height: size }}
      resizeMode="contain"
    />
  );
}

// 온도 위젯의 온도계 아이콘
export function ThermometerIcon({ size = 40 }: { size?: number }) {
  return (
    <Image
      source={require('../../assets/icons/2-thermometer.png')}
      style={{ width: size, height: size }}
      resizeMode="contain"
    />
  );
}

// 날씨 위젯의 해 아이콘 (테두리만, 안은 비어있음)
export function WeatherIcon({ size = 40, color = colors.text }: IconProps) {
  const rays = 8;
  const cx = 50;
  const cy = 50;
  const rInner = 24;
  const rOuterStart = 32;
  const rOuterEnd = 42;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Circle cx={cx} cy={cy} r={rInner} fill="none" stroke={color} strokeWidth={6} />
      {Array.from({ length: rays }).map((_, i) => {
        const angle = (Math.PI / (rays / 2)) * i;
        const x1 = cx + rOuterStart * Math.cos(angle);
        const y1 = cy + rOuterStart * Math.sin(angle);
        const x2 = cx + rOuterEnd * Math.cos(angle);
        const y2 = cy + rOuterEnd * Math.sin(angle);
        return <Line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={6} strokeLinecap="round" />;
      })}
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

// 절전 목표 progress bar 위를 달리는 사람 아이콘
export function RunnerIcon({ size = 36 }: { size?: number }) {
  return (
    <Image
      source={require('../../assets/icons/15-runner.png')}
      style={{ width: size, height: size }}
      resizeMode="contain"
    />
  );
}

// progress bar 끝에 꽂혀있는 목표 깃발 아이콘
export function FlagIcon({ size = 36 }: { size?: number }) {
  return (
    <Image
      source={require('../../assets/icons/3-flag.png')}
      style={{ width: size, height: size }}
      resizeMode="contain"
    />
  );
}

// "스마트홈 제어" 메뉴 아이콘 - 리모컨
export function RemoteIcon({ size = 40 }: { size?: number }) {
  return (
    <Image
      source={require('../../assets/icons/16-remote.png')}
      style={{ width: size, height: size }}
      resizeMode="contain"
    />
  );
}

// "캘린더" 메뉴 아이콘
export function CalendarIcon({ size = 40 }: { size?: number }) {
  return (
    <Image
      source={require('../../assets/icons/18-calendar.png')}
      style={{ width: size, height: size }}
      resizeMode="contain"
    />
  );
}

// "에너지 사용량" 메뉴 아이콘 - 상승 막대그래프
export function ChartUpIcon({ size = 40 }: { size?: number }) {
  return (
    <Image
      source={require('../../assets/icons/17-graph.png')}
      style={{ width: size, height: size }}
      resizeMode="contain"
    />
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
