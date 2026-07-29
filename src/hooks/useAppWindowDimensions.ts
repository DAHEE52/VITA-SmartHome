// 화면 크기를 재는 훅. 네이티브(폰)에서는 react-native의 useWindowDimensions와 완전히 동일하게 동작한다.
// 웹에서 노트북처럼 넓은 브라우저 창으로 열었을 때는 폭을 WEB_MAX_WIDTH로 클램프해서, 각 화면이
// 그 값을 기준으로 계산하는 카드/그리드/차트 크기가 실제로 화면에 보이는 폰 모양 프레임(App.tsx의
// WebPhoneFrame) 폭과 일치하도록 맞춘다. 폰 실기기(좁은 화면)에서는 항상 실제 폭이 더 작으므로
// Math.min이 실제 값을 그대로 돌려줘 기존 동작에 영향이 없다.
import { Platform, useWindowDimensions } from 'react-native';

export const WEB_MAX_WIDTH = 430;

export function useAppWindowDimensions() {
  const dims = useWindowDimensions();
  if (Platform.OS !== 'web') return dims;
  return { ...dims, width: Math.min(dims.width, WEB_MAX_WIDTH) };
}
