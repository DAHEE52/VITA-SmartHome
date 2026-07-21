# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## 프로젝트 개요

Expo(React Native) 기반 스마트홈 모바일 앱 **VITA**. [service_proposal.txt](service_proposal.txt)에 정리된 "에너지 절약 + 화재 안전 통합 관리" 기획을 화면 단위로 구현하고 있다. 하드웨어/백엔드가 실제로 연동된 3화면(Main/SmartHomeControl/EnergyUsage)과, 아직 클라이언트 시뮬레이션으로만 동작하는 6개 신규 화면(Automation/EnergyTree/FirePrevention/Guidebook/BillReceipt/Settings)이 공존한다 — 아래 "하드웨어/백엔드 연동"과 "Context 레이어" 절 참고.

기존에 있던 `Healthcare` 화면(걸음수/심박수/스트레스 지수)은 service_proposal.txt 어디에도 없는 내용이라 제거했고, MainScreen 4번째 메뉴 타일은 그 자리를 대체한 `EnergyTree`로 교체했다.

## 하드웨어/백엔드 연동

MainScreen/SmartHomeControlScreen/EnergyUsageScreen 3화면은 목업이 아니라 `src/api/client.ts`를 통해 실제 백엔드를 호출한다.

- **백엔드**: `backend/`(이 VITA 폴더 안)에 FastAPI가 있다. Supabase(Postgres)를 데이터 저장소로 쓰고, ESP32 기기와 VITA 앱 양쪽 모두 이 FastAPI만 거쳐서 통신한다(둘 다 Supabase에 직접 접근하지 않음). 최초 설정은 [SETUP.md](SETUP.md) 참고.
- **펌웨어**: `firmware/`에 XIAO ESP32S3용 Arduino 스케치 3종(`env_presence_node`, `relay_node`, `power_monitor_node`)이 있다. 통신은 순수 HTTP(MQTT 없음) — 센서 노드는 주기적으로 push, 릴레이 노드는 대기 명령을 poll.
- **로컬 실행 시 주소**: `.env`의 `EXPO_PUBLIC_API_URL`이 백엔드 주소다. 웹에서는 `localhost`도 되지만 실기기(Expo Go)에서는 반드시 백엔드를 실행 중인 PC의 LAN IP를 써야 한다.
- 캘린더(`schedule_items` 테이블)와 알림함(`notifications` 테이블)도 이 백엔드에 실제로 저장된다 — 아래 "Context 레이어" 절 참고.

## Context 레이어 (신규 6화면 + 자동화/화재감지 시뮬레이션)

`App.tsx`가 `RootNavigator`를 10개 Context Provider로 감싸고 있다(`src/context/`). 전부 App.tsx에 나열된 순서대로 의존한다(하위 Provider가 상위 Provider를 `useX()`로 참조).

- **`DemoRoomsContext`(`useDemoRooms`)**: Automation/FirePrevention/EnergyTree/BillReceipt 화면이 참조하는 방/기기 목록 — **순수 클라이언트 시뮬레이션이며 SmartHomeControlScreen이 보여주는 실제 백엔드 rooms(`getRoomsStatus()`)와는 완전히 별개다.** 이름을 `useRooms`가 아니라 `useDemoRooms`로 의도적으로 다르게 지어서 혼동을 방지했다 — 새 코드에서 실제 rooms API와 헷갈리지 않도록 주의.
- **`CalendarContext`/`NotificationsContext`**: 유일하게 실제 백엔드(위 절의 `schedule_items`/`notifications` 테이블)에 저장되는 두 Context. `pushNotification`(자동화/화재감지가 호출)만 예외적으로 로컬 즉시 반영 + 백그라운드 fire-and-forget으로 서버 저장 — 나머지 CRUD는 전부 "API 호출 → 재조회" 패턴.
- **`AutomationContext`/`FireSafetyContext`/`SensorContext`/`EnergyHistoryContext`/`GoalContext`/`SettingsContext`/`PresenceContext`**: 전부 순수 클라이언트 시뮬레이션(`setInterval` 기반), 앱 재시작 시 초기화됨. 실제 연기감지 센서가 없고 서버 스케줄러 구축은 범위 밖이라 의도적으로 이렇게 남겨뒀다 — using/ 프로토타입 폴더의 구현을 거의 그대로 가져온 것.

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

**네비게이션**: `@react-navigation/native-stack` 기반 단일 스택([RootNavigator.tsx](src/navigation/RootNavigator.tsx)). `Splash`/`Main`/`SmartHomeControl`/`EnergyUsage`/`Calendar`는 디자인 시안 번호(1,3,4,5,6)에 대응하고, `Automation`/`EnergyTree`/`FirePrevention`/`Guidebook`/`BillReceipt`/`Settings` 6개는 시안에 없던 신규 화면(위 "Context 레이어" 절 참고)이다. 새 화면 추가 시 라우트 타입(`RootStackParamList`)과 `<Stack.Screen>` 둘 다 갱신해야 한다. 헤더는 전부 `headerShown: false`로 끄고 각 화면이 자체적으로 그린다. `SplashScreen`은 1.4초 후 `navigation.replace('Main')`으로 자동 전환된다. `MainScreen`의 메뉴(햄버거)/알림(벨) 아이콘은 각각 `MenuModal`/`NotificationsModal` 팝업을 열고, 설정(톱니) 아이콘은 `Settings`로 바로 이동한다.

**디자인 토큰**: [src/theme/colors.ts](src/theme/colors.ts)가 색상/폰트 이름의 단일 출처다. 색상은 원본 시안 PNG에서 직접 픽셀 샘플링한 값이므로, 새 화면에서 색이 필요하면 여기서 가져다 쓰고 눈대중으로 새로 고르지 않는다. 폰트는 `fonts.jalnan`(헤드라인/본문 대부분)과 `fonts.pixel`(메인화면 디지털시계 숫자 전용) 두 개뿐이며, 이 키 이름이 `App.tsx`의 `useFonts()` 키와 정확히 일치해야 한다. 폰트 파일은 `assets/fonts/Jalnan.ttf`, `assets/fonts/DungGeunMo.ttf`로 존재한다. `assets/fonts/DSEG7Classic-Bold.ttf`(7세그먼트 디지털 폰트, SIL OFL 라이선스)도 함께 들어있지만 아직 `App.tsx`/`colors.ts` 어디에도 연결되어 있지 않은 미사용 에셋이다.

**에셋 폴더 상태**: `assets/`에는 시안에서 추출한 아이콘 PNG 20개(`1-logo.png` ~ `20-menu.png`)와, `app.json`이 요구하는 앱 아이콘 5종(`icon.png`, `favicon.png`, `android-icon-foreground.png`, `android-icon-background.png`, `android-icon-monochrome.png`)이 모두 들어있다. 이 5종은 `1-logo.png`(VITA 로고 원본)에서 집+번개 심볼 부분만 잘라내어 생성한 것이다 — 로고를 다시 만들거나 교체할 경우 이 5개 파일도 함께 재생성해야 한다. `assets/icons/`에는 같은 20개 PNG가 한 벌 더 있다 — `icons.tsx`/`MenuModal.tsx`의 `require('../../assets/icons/...')` 참조가 이 하위 폴더 기준이라 별도로 유지한다(루트의 20개와 내용은 같지만 참조 경로가 다름).

**공용 컴포넌트**:
- [src/components/Card.tsx](src/components/Card.tsx) — 시안 전반에 반복되는 연회색 둥근 카드. 화면마다 이걸로 감싸고 `style` prop으로 padding/margin만 덮어쓴다.
- [src/components/BottomNav.tsx](src/components/BottomNav.tsx) — `variant='main'`(사이렌/홈/북, MainScreen 전용)과 `variant='sub'`(뒤로가기/홈, 나머지 서브 화면 전용) 두 레이아웃을 하나의 컴포넌트로 처리.
- [src/components/VitaLogo.tsx](src/components/VitaLogo.tsx) — 스플래시(크게)와 메인 헤더(작게)에서 `size` prop만 바꿔 재사용하는 브랜드 로고.
- [src/components/icons.tsx](src/components/icons.tsx) — 아이콘 모음. 대부분은 `react-native-svg`로 직접 그렸지만, 신규 화면 추가 시 들여온 몇 개(`TreeIcon`/`AutomationIcon`/`SproutIcon`/`SaplingIcon`/`GrownTreeIcon`)는 `assets/icons/*.png`를 감싼 `Image` 컴포넌트다. 일부 화면 전용 아이콘은 해당 화면 파일 안에 직접 정의되어 있기도 함(예: BottomNav 내부의 Siren/Home/Book/Back 아이콘 — Siren→`FirePrevention`, Book→`Guidebook`으로 이동).
- [src/components/MenuModal.tsx](src/components/MenuModal.tsx) / [src/components/NotificationsModal.tsx](src/components/NotificationsModal.tsx) — MainScreen 헤더에서 여는 전체 메뉴/알림함 팝업.

**반응형 스케일 패턴**: [MainScreen.tsx](src/screens/MainScreen.tsx)는 스크롤 없이 한 화면에 모든 카드를 담아야 해서, `useWindowDimensions` 높이를 `REFERENCE_HEIGHT`(820)와 비교해 `scale`(하한 `MIN_SCALE`=0.78)을 계산하고 이를 모든 카드의 padding/폰트 크기에 곱한다. 화면 높이가 빠듯한 화면을 새로 만들 때 참고할 패턴.

**차트**: 별도 차트 라이브러리 없이 `react-native-svg`(`Polyline`, `Circle`, `SvgText` 등)로 직접 그린다 — [EnergyUsageScreen.tsx](src/screens/EnergyUsageScreen.tsx)의 라인차트 참고.
