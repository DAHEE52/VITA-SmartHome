// 디자인 토큰(색상/폰트) 모음.
// UIUX 폴더의 원본 PNG 시안에서 픽셀을 직접 샘플링해서 뽑은 값이라
// 화면마다 눈대중으로 색을 다시 고르지 않고 항상 여기서 가져다 써야 함.
export const colors = {
  white: '#FFFFFF',
  card: '#EEEEEE', // 시안 전반에 쓰이는 연회색 카드 배경 (거의 모든 화면 공통)
  cardDark: '#E4E4E4', // card보다 살짝 어두운 톤이 필요할 때(예: 눌린 상태) 사용
  black: '#111111',
  text: '#000000', // 본문/아이콘 기본 검정
  textGray: '#797979', // 보조 텍스트(라벨 등) 회색
  textGray2: '#4F4F4F',
  border: '#C2C2C2',

  // 포인트 오렌지/옐로우 계열 - 로고 번개, 절전목표 progress bar, 스트레스 이모지 등에 사용
  orange: '#FD9F28',
  yellow: '#FFCD4A',
  red: '#D61F26', // 사이렌 아이콘, 캘린더 빨간 날짜(일요일/공휴일)
  coral: '#FF6363', // 캘린더/헬스케어 화면의 붉은 계열 포인트

  // 에너지 사용량 화면 라인차트 색상 (에어컨=blue, 선풍기=teal)
  chartBlue: '#5D6DBE',
  chartTeal: '#2FA599',
  chartGreen: '#38D39F', // 헬스케어 화면 걸음수 바차트 색상

  // 에너지 사용량 화면 상단 연/월/일 탭 칩 색상
  chipRed: '#FF6363',
  chipYellow: '#FAE472',
  chipGreen: '#9AE87C',

  calendarPeach: '#FEEED0', // 캘린더 "오늘" 원형 하이라이트
  calendarGrayCircle: '#E9E9EB',
  calendarRed: '#FF2020', // 캘린더 일요일 라벨/날짜 색 (사이렌 red보다 더 선명한 순빨강)
  calendarBlue: '#0F78C3', // 캘린더 토요일 라벨/날짜 색

  // 헬스케어 화면 - 스트레스 지수 이모지 3종 + 그라데이션 슬라이더용 색상
  stressBlue: '#63CDF3', // 1번째(스트레스 높음/찡그림) 이모지
  stressYellow: '#FEE04D', // 2번째(걱정) 이모지
  stressOrange: '#F15C36', // 3번째(좋음/웃음) 이모지
  stressGreen: '#38D39F', // 슬라이더 중간 그라데이션 색 + 걸음수 막대그래프 색
  stressPin: '#C79BE0', // 슬라이더 위 현재 위치를 가리키는 보라색 핀

  green: '#7ED87E',
} as const;

// 커스텀 폰트 family 키. App.tsx의 useFonts()에서 이 이름으로 로드해야
// 아래 폰트 이름 그대로 fontFamily에 쓸 수 있음.
export const fonts = {
  jalnan: 'Jalnan', // 굵고 각진 헤드라인용 한글 폰트 (로고, 타이틀, 큰 숫자 등)
  pixel: 'DungGeunMo', // 메인화면 시계 숫자 등 픽셀 느낌이 필요한 곳 전용
} as const;
