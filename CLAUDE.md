# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## 프로젝트 개요

Expo(React Native) 기반 스마트홈 모바일 앱 **VITA**의 UI 프로토타입. 디자인 시안(원본 PNG 목업, 이 저장소에는 포함되어 있지 않음)의 화면 번호를 기준으로 화면을 하나씩 구현하는 단계이며, 현재는 실제 서버/기기 연동 없이 화면마다 하드코딩된 목업 값(온습도, 절전목표 %, 에너지 사용량 등)을 표시한다. 상태 관리 라이브러리(Redux/Zustand/Context 등)는 아직 도입되지 않았다.

### 서비스 전체 기획 (서비스 제안서 기준)

[service_proposal.txt](service_proposal.txt)에 정리된 VITA의 전체 기획은 "에너지 절약 + 화재 안전 통합 관리"를 핵심으로 한다. 지금 구현된 화면은 이 기획의 일부(홈 대시보드/기기 제어/캘린더/에너지 사용량 정도)일 뿐이며, 아래 기능들은 아직 코드에 없는 향후 구현 대상이다:

- **일정·재실 기반 자동화 규칙**: 캘린더의 외출/외박/요일별 루틴, 재실·외출 감지(카메라 연동 예정, 현재는 스위치로 시뮬레이션)를 트리거로 기기 on/off·목표 온도를 자동 실행
- **화재 감지 및 자동 안전 대응**: 기기별 정상 사용 시간 초과 감지 + 온습도/연기 센서 이상 감지 → 방별 위험도(안전/주의/위험) 판정 → 자동 전원 차단 + 119 신고 버튼 + 알림. 실제 센서 연결 전까지는 더미 데이터/시뮬레이션 버튼으로 동작
- **에너지 나무**: 절전 목표 달성도에 따라 새싹→어린나무→다 자란 나무로 성장하는 게이미피케이션, 월간 "숲 보기", 절약량/CO2 절감량 통계
- **전기요금 예측**: 실시간 소비전력 기준 이번 달 예상 사용량·요금(누진 구간 반영) 미리보기
- **안전 가이드북**: 화재 예방·대응 교육 콘텐츠 11개 섹션(전문은 [guidebook.txt](guidebook.txt) 참고) + 비상연락처 원터치 전화 연결 + 자가진단 체크리스트
- **알림·설정**: 자동화/화재감지 이벤트 알림함, 집 주소 등록, 가이드북 글자 크기 조절

새 화면이나 기능을 추가할 때는 이 문서의 해당 섹션을 먼저 확인해서 의도된 동작(예: 자동화 트리거 4종, 위험도 판정 기준)에 맞추는 것이 좋다. 참고로 현재 `Healthcare` 화면(걸음수/심박수/스트레스 지수)은 이 제안서 어디에도 없는 내용이라, 초기 시안에만 있었던 화면이거나 향후 재구성/제거될 여지가 있다.

## 하드웨어/백엔드 연동

MainScreen/SmartHomeControlScreen/EnergyUsageScreen 3화면은 이제 목업이 아니라 `src/api/client.ts`를 통해 실제 백엔드를 호출한다 (다른 화면은 아직 목업 그대로).

- **백엔드**: `backend/`(이 VITA 폴더 안)에 FastAPI가 있다. Supabase(Postgres)를 데이터 저장소로 쓰고, ESP32 기기와 VITA 앱 양쪽 모두 이 FastAPI만 거쳐서 통신한다(둘 다 Supabase에 직접 접근하지 않음). 최초 설정은 [SETUP.md](SETUP.md) 참고.
- **펌웨어**: `firmware/`에 XIAO ESP32S3용 Arduino 스케치 3종(`env_presence_node`, `relay_node`, `power_monitor_node`)이 있다. 통신은 순수 HTTP(MQTT 없음) — 센서 노드는 주기적으로 push, 릴레이 노드는 대기 명령을 poll.
- **로컬 실행 시 주소**: `.env`의 `EXPO_PUBLIC_API_URL`이 백엔드 주소다. 웹에서는 `localhost`도 되지만 실기기(Expo Go)에서는 반드시 백엔드를 실행 중인 PC의 LAN IP를 써야 한다.

## 명령어

```bash
npm install          # 의존성 설치
npm start            # expo start (Expo Go / 개발 서버)
npm run android      # expo start --android
npm run ios          # expo start --ios
npm run web          # expo start --web
```

lint/typecheck/test 스크립트는 아직 `package.json`에 정의되어 있지 않다. 타입 체크가 필요하면 `npx tsc --noEmit`을 직접 실행한다.

## 아키텍처

**부팅 순서**: [index.ts](index.ts)가 `registerRootComponent(App)`로 진입점 역할을 하고, [App.tsx](App.tsx)가 커스텀 폰트(Jalnan, DungGeunMo)를 `useFonts`로 로드하는 동안 네이티브 스플래시를 유지한 뒤, 로드가 끝나면 [src/navigation/RootNavigator.tsx](src/navigation/RootNavigator.tsx)를 렌더링한다.

**네비게이션**: `@react-navigation/native-stack` 기반 단일 스택([RootNavigator.tsx](src/navigation/RootNavigator.tsx)). 라우트는 디자인 시안 번호에 대응(`Splash`→시안1, `Main`→시안3, `SmartHomeControl`→시안4, `EnergyUsage`→시안5, `Calendar`→시안6, `Healthcare`→시안8). 시안 2, 7은 아직 화면이 없음 — 새 화면 추가 시 라우트 타입(`RootStackParamList`)과 `<Stack.Screen>` 둘 다 갱신해야 한다. 헤더는 전부 `headerShown: false`로 끄고 각 화면이 자체적으로 그린다. `SplashScreen`은 1.4초 후 `navigation.replace('Main')`으로 자동 전환된다.

**디자인 토큰**: [src/theme/colors.ts](src/theme/colors.ts)가 색상/폰트 이름의 단일 출처다. 색상은 원본 시안 PNG에서 직접 픽셀 샘플링한 값이므로, 새 화면에서 색이 필요하면 여기서 가져다 쓰고 눈대중으로 새로 고르지 않는다. 폰트는 `fonts.jalnan`(헤드라인/본문 대부분)과 `fonts.pixel`(메인화면 디지털시계 숫자 전용) 두 개뿐이며, 이 키 이름이 `App.tsx`의 `useFonts()` 키와 정확히 일치해야 한다. 폰트 파일은 `assets/fonts/Jalnan.ttf`, `assets/fonts/DungGeunMo.ttf`로 존재한다. `assets/fonts/DSEG7Classic-Bold.ttf`(7세그먼트 디지털 폰트, SIL OFL 라이선스)도 함께 들어있지만 아직 `App.tsx`/`colors.ts` 어디에도 연결되어 있지 않은 미사용 에셋이다.

**에셋 폴더 상태**: `assets/`에는 시안에서 추출한 아이콘 PNG 20개(`1-logo.png` ~ `20-menu.png`)와, `app.json`이 요구하는 앱 아이콘 5종(`icon.png`, `favicon.png`, `android-icon-foreground.png`, `android-icon-background.png`, `android-icon-monochrome.png`)이 모두 들어있다. 이 5종은 `1-logo.png`(VITA 로고 원본)에서 집+번개 심볼 부분만 잘라내어 생성한 것이다 — 로고를 다시 만들거나 교체할 경우 이 5개 파일도 함께 재생성해야 한다.

**공용 컴포넌트**:
- [src/components/Card.tsx](src/components/Card.tsx) — 시안 전반에 반복되는 연회색 둥근 카드. 화면마다 이걸로 감싸고 `style` prop으로 padding/margin만 덮어쓴다.
- [src/components/BottomNav.tsx](src/components/BottomNav.tsx) — `variant='main'`(사이렌/홈/북, MainScreen 전용)과 `variant='sub'`(뒤로가기/홈, 나머지 서브 화면 전용) 두 레이아웃을 하나의 컴포넌트로 처리.
- [src/components/VitaLogo.tsx](src/components/VitaLogo.tsx) — 스플래시(크게)와 메인 헤더(작게)에서 `size` prop만 바꿔 재사용하는 브랜드 로고.
- [src/components/icons.tsx](src/components/icons.tsx) — 아이콘 라이브러리 없이 `react-native-svg`로 직접 그린 커스텀 아이콘 모음 (일부 화면 전용 아이콘은 해당 화면 파일 안에 직접 정의되어 있기도 함, 예: BottomNav 내부의 Siren/Home/Book/Back 아이콘).

**반응형 스케일 패턴**: [MainScreen.tsx](src/screens/MainScreen.tsx)는 스크롤 없이 한 화면에 모든 카드를 담아야 해서, `useWindowDimensions` 높이를 `REFERENCE_HEIGHT`(820)와 비교해 `scale`(하한 `MIN_SCALE`=0.78)을 계산하고 이를 모든 카드의 padding/폰트 크기에 곱한다. 화면 높이가 빠듯한 화면을 새로 만들 때 참고할 패턴.

**차트**: 별도 차트 라이브러리 없이 `react-native-svg`(`Polyline`, `Circle`, `SvgText` 등)로 직접 그린다 — [EnergyUsageScreen.tsx](src/screens/EnergyUsageScreen.tsx)의 라인차트 참고.
