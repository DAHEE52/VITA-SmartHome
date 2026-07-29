# VITA 기능 검증 가이드라인

이 문서는 "코드가 배포 요건을 갖췄는가"(→ [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md))가 아니라 **"화면과 기능이 실제로 의도대로 동작하는가"**를 확인하기 위한 체크리스트다. 화면을 추가/수정할 때마다, 그리고 배포 전에 이 문서 순서대로 실행해서 상태(✅ 정상 / ⚠️ 부분 동작·주의 / ❌ 깨짐)를 갱신한다.

마지막 실행: 2026-07-29 (아래 "실행 결과"에 기록, 1차 빈 데이터 기준 + 2차 한 달치 더미 데이터 기준 두 번 실행)

---

## 0. 사전 준비

- [ ] 백엔드 기동: `cd backend && venv\Scripts\python API_main.py` → `http://localhost:8000/health`가 `{"status":"안녕하세요"}` 200 응답하는지 확인
- [ ] Supabase 프로젝트가 paused 상태가 아닌지 대시보드에서 확인 (무료 플랜은 장기 미사용 시 자동 정지)
- [ ] 프론트 기동: `npm start` (웹으로 빠르게 훑을 땐 `npm run web`, 실기기 최종 확인은 반드시 Expo Go로 별도 진행)
- [ ] `.env`의 `EXPO_PUBLIC_API_URL`이 지금 접속할 방식(웹=localhost, 실기기=LAN IP)과 맞는지 확인

## 1. 정적 검증 (코드 변경 시마다, 배포 전 필수)

| 항목 | 명령 | 통과 기준 |
|---|---|---|
| 프론트 타입체크 | `npx tsc --noEmit` | 에러 0건 |
| 백엔드 유닛 테스트 | `cd backend && venv\Scripts\python -m pytest` | 전부 PASS |

> `package.json`에 `lint`/`test` 스크립트가 없어 이 두 명령이 사실상 유일한 자동 검증 수단이다(CLAUDE.md 참고). CI에 붙이는 게 우선순위 높음 — [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md) §4 참고.

## 2. 백엔드 API 스모크 테스트

각 라우터의 GET이 200을 내려주는지, 쓰기 계열(POST/PATCH/DELETE)이 생성→조회 반영→삭제까지 왕복되는지 확인한다. 프로토타입이라 대부분 인증이 없으므로 `curl`로 바로 검증 가능하다.

| 라우터 | 확인 방법 | 비고 |
|---|---|---|
| `/home/summary` | GET 200, `temperature`/`humidity`가 숫자 또는 `null` | 센서 미연결이면 `null`이 정상 |
| `/rooms`, `/rooms/status` | GET 200 | |
| `/rooms` POST/PATCH/DELETE | 방 생성 → 이름 변경 → 삭제 후 목록에서 사라지는지 | 실제 `ROOM`(원룸 고정)은 건드리지 말 것 |
| `/devices/mock-register` + `/devices/{id}/control` | 기기 등록 → on/off 제어 → 상태가 `/rooms`에 반영되는지 | **`DELETE /devices/{id}` 엔드포인트가 없어 등록한 기기를 완전히 지울 수 없다** — 테스트 후 `PATCH {"room_id": null}`로 방에서만 뺴는 게 최선. 테스트 계정/DB 분리를 고려할 것 |
| `/energy/usage` | GET 200 | 기기 없으면 `series: []` |
| `/schedule/daily`, `/schedule/special` | POST → PATCH → DELETE 왕복 | |
| `/notifications` | POST → mark-read → DELETE 왕복 | |
| `/settings` | PATCH 후 GET에 반영, 원복 | |
| `/automation-rules` | POST → PATCH(`enabled` 토글) → DELETE 왕복 | |
| `/sleep/preset`, `/sleep/records` | GET 200 | records POST는 삭제 엔드포인트 없음 — 테스트 데이터 남는 것 감안 |
| `/pattern/latest`, `/pattern/today` | GET 200(빈 값이어도 정상 — 비전 모델 미배포 상태) | |
| `/devices/register` (ESP32용) | `X-Device-Key` 없이 호출 시 401/422, 틀린 키로 401 | 기기 인증이 유일한 인증 계층이므로 반드시 확인 |

### 2-1. 동시 요청 내성 (★ 2026-07-29 발견한 회귀 위험 구간)

앱이 화면에 진입하면 Context Provider(Rooms/Sensor/Sleep/Automation/Notifications/Settings/LifePattern 등) 여러 개가 동시에 각자 API를 호출한다. 이 부하 패턴을 재현해서 백엔드가 버티는지 확인한다:

```bash
# 짧은 시간에 여러 엔드포인트를 동시에 때려서 500/503/커넥션끊김이 나는지 확인
for p in /home/summary /rooms /rooms/status /schedule/daily /schedule/special /notifications /settings /automation-rules /sleep/preset /sleep/records?period=month /pattern/latest /pattern/today; do
  curl -s -o /dev/null -w "%{http_code} $p\n" "http://localhost:8000$p" &
done
wait
```
- [ ] 12개 요청 모두 200인지 확인 (500/503이 하나라도 나오면 재현된 것 — 아래 "발견된 이슈" #2 참고)

### 2-2. 한 달치 더미 데이터로 검증 (실데이터가 있어야 의미 있는 화면용)

기기 미등록·사용 이력 0인 상태에서는 EnergyUsage/SleepStats/LifePattern/EnergyTree/BillReceipt/Calendar 특별일정 등이 전부 "빈 상태" 화면만 보여줘서, 실제로 값이 찼을 때의 계산·렌더링이 맞는지 확인할 수 없다. `backend/seed_month_demo.py`가 최근 30일치(온습도/재실/움직임/전력 누적량/취침 기록/알림/캘린더 일정/생활패턴 이벤트)를 현재 스키마 기준으로 채워 넣는다.

> `backend/seed_demo.py`(기존 파일)는 원룸 이전 스키마(`devices.room` 텍스트 컬럼, 다중 방) 기준이라 지금 스키마에서 그대로 실행하면 실패한다 — 방치된 죽은 스크립트이니 실제로 쓰려면 `seed_month_demo.py`처럼 `room_id` 기준으로 다시 짜야 한다.

```powershell
cd backend
venv\Scripts\python seed_month_demo.py
```

- 여러 번 실행하면 알림/일정 등은 계속 쌓인다(중복 방지 없음) — 반복 실행 전 Supabase에서 해당 테이블을 비우거나, 결과가 늘어나는 걸 감안할 것
- 등록되는 기기: `seed-env-01`(온습도), `seed-power-01`(전력), `seed-cam-01`(재실 카메라), `seed-relay-light/aircon/tv`(릴레이 3종) — 전부 `room_id`를 기존 방에 배정
- `app_settings`의 `household_size`/`goal_kwh`/`address`도 함께 채워서 절전 목표 관련 화면(MainScreen 절감액 카드, EnergyTree)도 검증 가능해짐
- `/pattern/today`는 UTC 자정 기준으로 "오늘"을 계산하는 버그가 있어(§4 #6), KST 09시 이전 이벤트는 시드해도 타임라인에 안 잡힌다 — 검증하려면 KST 09시 이후 시각으로 이벤트를 넣을 것

## 3. 화면별 체크리스트

모든 화면은 메뉴(홈 화면 우측 상단 ☰) → 원하는 화면 클릭으로 이동한다. **웹 빌드는 URL 딥링크가 안 먹는다**(`linking` 설정이 없어 새로고침/직접 URL 접근 시 항상 Splash→Main으로 리셋됨) — 반드시 앱 내 네비게이션으로 이동해서 테스트할 것.

| 화면 | 확인 항목 | 빈 데이터 결과 | 한 달치 더미 데이터 결과 |
|---|---|---|---|
| Splash | 1.4초 후 Main으로 자동 전환 | ✅ | - |
| **Main** | 시계 실시간 갱신(10초), 요일 표시, 온습도(`/home/summary`) 표시, 절전목표/절감액 카드, 4개 메뉴 카드 이동 | ⚠️ 요일 "Wen" 고정(#1) | ✅ 목표 150kWh/월·오늘 절감액 477원 등 절감액 카드가 정상 계산됨 (요일 버그는 동일) |
| **SmartHomeControl** | 방 카드 표시, "+"로 기기 추가(`mock-register`), 방 설정 모달에서 자동/수동 전환·on/off 제어(`/devices/{id}/control`)가 실제로 반영 | ✅ 기기 추가→on/off 제어 왕복 확인 | ✅ 시드된 기기 6종(온습도/전력/카메라/조명/에어컨/TV)이 모두 방 설정 모달에 정상 표시 |
| **EnergyUsage** | 연/월/일 탭 전환, 차트 렌더, 전년/전월/전일 대비 사용량 | ✅ (y축 라벨 뭉침 - #4) | ⚠️ 월 탭 라인차트에 최근 5일치가 정상 표시되나, "전월 대비 49% 감소" 수치가 실제로는 월 비교가 아니라 그래프에 보이는 마지막 두 점(하루 전 vs 오늘)만 비교한 값 — 라벨과 실제 계산이 불일치(신규 발견, 아래 #7) |
| **Calendar** | 월 이동, 오늘 날짜 하이라이트, DAILY/SPECIAL 추가·수정·삭제, 특별일정 날짜 강조 | ✅ 생성→수정→삭제 왕복 확인 | ✅ 외출(7/15)·외박(7/20)·일반(7/25) 특별일정이 달력에 점으로 정상 강조됨. 다만 이 과정에서 앞서 "삭제 완료"로 확인했던 테스트 항목이 재조회 시 되살아나는 현상 발견(신규 발견, 아래 #5) |
| **Automation** | 재실 감지 토글, 규칙 추가/목록 | ✅ (0개 안내 정상) | ✅ 시드된 규칙 2개(외출→조명 off, 재실→온도조절)가 목록에 정상 표시 |
| **EnergyTree** | 절전 목표 미설정 시 안내 문구, 목표 설정 시 성장률/절약량/CO2 계산, 숲 보기·성장 트래커 진입 | ✅ 미설정 안내 정상 | ✅ 목표 150kWh 설정 후 "이번 달 목표 달성률 2%", 절약량 5kWh, CO2 2kg으로 정상 계산 |
| **FirePrevention** | 방별 센서 카드, "화재 상황 시뮬레이션" 버튼으로 위험 상태 전환·해제 | ✅ 급상승 판정(5분 내 5도↑) 정상 트리거 | - (센서 시뮬레이션은 더미 데이터 유무와 무관하게 항상 동일 로직) |
| **Guidebook** | 11개 섹션 아코디언, 119/112 전화 버튼, 비상연락처 안내 | ✅ | - |
| **BillReceipt** | 실시간 W, 이번 달 예상 사용량/요금 계산 | ✅ | ✅ (이 화면은 과거 `energy_kwh` 이력이 아니라 현재 기기 on/off 상태 기준 실시간 추정이라 더미 데이터 주입 전후 차이 없음 — 설계상 정상) |
| **SleepMode** | 취침 감지 조건·전환 기기 설정값이 `/sleep/preset`과 일치 | ✅ | - |
| **SleepStats** | 최근 수면 기록 표시(요약 카드/최근 7일 막대그래프/기록 리스트) | ⚠️ 기록 있는데 fetch 실패로 "없음"으로 오표시(#2) | ✅ 재요청 성공 시 취침 23:10→기상 06:28(7시간18분), 최근 7일 막대그래프, 최근 기록 10건까지 전부 정상 렌더 — **단, 같은 화면 재진입에서 다시 한번 "기록 없음" 오표시가 재현되어(#2) 안정성 문제가 산발적이 아니라 상시 위험임을 재확인** |
| **LifePattern** | 모델 미배포 안내 / 데이터 있을 때 "지금 상태"·오늘 타임라인·AI 인사이트 | ✅ 미배포 안내 정상 | ⚠️ KST 09시 이전에 넣은 이벤트가 "오늘의 타임라인"에서 통째로 빠짐 → 원인은 백엔드의 UTC/KST 날짜 경계 버그(신규 발견, 아래 #6). KST 09시 이후 이벤트는 정상 표시됨 |
| **Settings** | 주소 등록, 글자 크기, 기기관리/취침모드 바로가기, 앱 정보 | ✅ | ✅ 시드로 넣은 주소("서울시 어딘가 원룸")가 정상 표시 |

## 4. 발견된 이슈 (2026-07-29 실행 기준)

### 🔴 #2. 동시 요청 시 백엔드가 간헐적으로 500/503, 심하면 프로세스 자체가 죽음
화면 진입 시 여러 Context가 동시에 여러 엔드포인트를 호출하는데, 이 부하에서 Supabase Python 클라이언트(httpx, HTTP/2)가 `WinError 10035`(비동기 소켓 작업 미완료) 예외를 던지며 500을 반환하는 사례를 MainScreen/SmartHomeControl/Calendar/SleepStats 진입 시 반복 재현했다. **한 세션 동안 uvicorn 프로세스가 완전히 응답 불능(연결 거부) 상태에 빠져 수동 재시작이 필요했던 사례가 3회** 발생했다(모두 화면 이동 중 자연 발생, 의도적으로 부하를 준 게 아님).
- 프런트는 실패 시 `console.warn`만 하고 재시도/에러 표시가 없어(예: `MainScreen.tsx:577`), 사용자는 그냥 "-"나 "기록 없음"을 실제 상태로 오인하게 된다. SleepStats에서 실제로 있는 기록이 "없음"으로 표시된 사례를 한 달치 더미 데이터로 재현했고, **같은 화면을 다시 들어갔을 때 또 재현**되어 산발적 우연이 아니라 상시적인 위험임을 확인했다.
- 로컬 Windows 개발 환경 한정 이슈일 가능성이 있으나(Lambda 등 Linux 배포 시 재현 여부 별도 확인 필요), **화면 진입마다 8~12개 API를 동시 호출하는 현재 패턴 자체가 어떤 백엔드에서든 위험 요소**다.
- 권장 조치: (a) Supabase 클라이언트를 HTTP/1.1로 강제하거나 커넥션 풀 설정 점검, (b) 프런트에서 최소 재시도(1회) + 실패 시 사용자에게 보이는 에러 상태 추가, (c) 배포 전 Lambda/실서버 환경에서 동일 동시성 테스트 재현.

### 🔴 #3. `uvicorn.run(..., reload=True)`가 코드에 남아있어 로컬 실행이 불안정
[PRODUCTION_READINESS.md](PRODUCTION_READINESS.md) §3에 이미 기록된 항목이지만, 이번 실행에서 실제로 프로세스가 죽는 것으로 재확인됐다(#2와 동시에 발생). 배포 시 반드시 `reload=False`(또는 Lambda 경유라 무관한지 재확인) 후 프로세스 매니저/헬스체크 기반 자동 재시작을 붙일 것.

### 🔴 #5. 쓰기 동작이 "낙관적 업데이트 + 실패 시 조용히 무시" 패턴이라, 서버 반영 실패 시 되살아나는 유령 데이터가 생김
Calendar에서 DAILY 일정을 만들고(`QA테스트`) 정상적으로 삭제 확인까지 마쳤는데, 이후(한 달치 더미 데이터 시딩 이후) 캘린더를 다시 열어보니 **삭제했던 그 일정이 새 id로 다시 나타났다**. 원인은 `src/context/CalendarContext.tsx:113-119`의 `removeDailyItem`/`removeSpecialItem`이 로컬 state는 즉시 지우고 `api.deleteScheduleItem(...)`은 `.catch(console.warn)`으로만 처리하는 구조라서다 — DELETE 요청이 #2의 백엔드 불안정 때문에 실패해도 화면은 "삭제 완료"로 보이고, 실제 서버 데이터는 그대로 남는다. 다음에 목록을 다시 불러오면 지운 줄 알았던 항목이 그대로 부활한다.
- 같은 패턴(로컬 먼저 반영 + API 실패는 `console.warn`만)이 `RoomsContext`(기기 on/off·이름변경·삭제), `NotificationsContext`, `SettingsContext`, `AutomationContext`, `SleepContext` 등 앱 전역의 거의 모든 쓰기 동작에 반복돼 있다. #2와 결합하면 "사용자는 성공했다고 믿는데 서버엔 반영 안 된" 상태가 언제든 발생할 수 있다는 뜻이라, 단일 화면 버그가 아니라 아키텍처 차원의 위험으로 봐야 한다.
- 권장 조치: 최소한 실패 시 로컬 상태를 롤백하거나 사용자에게 "저장 실패, 다시 시도" 배너를 띄우는 공통 처리를 Context 레이어에 추가할 것.

### 🟡 #6. `/pattern/today`가 KST가 아니라 UTC 자정 기준으로 "오늘"을 계산함
`backend/app/routers/pattern.py:32` — `since = datetime.now(timezone.utc).replace(hour=0, ...)`. 한국은 UTC+9라 이 UTC 자정 기준 "오늘"은 실제 한국 시각으로는 오전 9시부터 시작한다. 한 달치 더미 데이터로 KST 00:00~09:00 사이의 생활 패턴 이벤트를 넣었더니 `/pattern/today`(LifePatternScreen의 "오늘의 타임라인")에서 통째로 빠지는 것을 확인했다(`/pattern/latest`는 날짜 필터가 없어 정상 조회됨 — 이 엔드포인트만의 문제). 실사용자 기준으로는 매일 새벽 시간대 활동 기록이 아침 9시까지 타임라인에 안 잡히는 버그다. `energy.py`의 `_bucket_key`처럼 KST로 변환한 뒤 자정을 구하도록 고치면 된다.

### 🟡 #7. EnergyUsage "전월/전일 대비" 증감률이 실제로는 그래프에 보이는 마지막 두 점만 비교함
`src/utils/energySeries.ts`의 `calcChange()`는 화면에 표시 중인 시리즈의 **마지막 두 포인트**만 비교한다. "연" 탭은 시리즈가 연도별 합계라 이 방식이 "전년 대비"라는 라벨과 맞지만, "월" 탭은 시리즈가 **일별** 포인트(최근 5일)라서 실제로는 "어제 대비 오늘"을 비교하고 있고, "일" 탭은 **시간별** 포인트라서 "직전 시간 대비 이번 시간"을 비교한다 — 그런데 카드 라벨은 각각 "전월 대비 사용량"/"전일 대비 사용량"으로 고정돼 있다(`CARD_LABEL`, `EnergyUsageScreen.tsx:53`). 더미 데이터로 월 탭을 열어보니 하루 사용량이 5.8kWh→3.0kWh로 줄어든 것뿐인데 "전월 대비 49% 감소"라고 표시됐다 — 실제 이번 달과 지난달 총사용량 비교가 전혀 아니다. 사용자가 "이번 달에 진짜 절반 가까이 아꼈다"고 오해할 수 있는, 배포 전에 고쳐야 할 계산 로직 버그다.

### 🟡 #1. MainScreen 요일 표시가 항상 "Wen" 고정값
`src/screens/MainScreen.tsx:112` — `<Text ...>Wen</Text>`가 하드코딩되어 있어 실제 요일과 무관하게 항상 같은 문자열을 보여준다(오늘은 수요일이라 우연히 비슷해 보이지만 "Wed"의 오타로 추정, 목·금요일에 접속하면 바로 드러남). Calendar 화면은 `now`에서 정확한 요일을 계산해 보여주므로 로직 자체는 이미 앱 안에 있다. `TimeCard`의 `now` state에서 요일을 계산하도록 한 줄만 고치면 된다.

### 🟢 #4. EnergyUsage 차트, 데이터가 전혀 없을 때 y축 라벨이 "0.01"로 뭉쳐 보임
`src/screens/EnergyUsageScreen.tsx:145`의 `Math.max(0.01, ...values)` 폴백 때문에, 사용량 데이터가 하나도 없는 기간을 볼 때 y축 5개 눈금이 `0.00`/`0.01`로 시각적으로 구분이 안 된다. 기능은 정상이나 첫 사용자 경험(기기 등록 전) 화면이라 손볼 가치는 있음.

> 인증 부재, CORS 전체 허용, 개인정보처리방침 부재 등 "배포 인프라/보안" 관점 이슈는 이 문서가 아니라 [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md)에서 계속 추적한다.

## 5. 실행 로그 (참고용)

**1차 (빈 데이터 상태)**
- 프론트: `npx tsc --noEmit` → 에러 0건
- 백엔드: `pytest` 15개 전부 PASS (`test_devices.py` 7개, `test_rooms.py` 8개)
- API 스모크: GET 13개 라우트 전부 200 확인, 쓰기 라우트(rooms/notifications/schedule/automation-rules/settings) 생성→반영→삭제 왕복 확인
- 브라우저(Expo web, `localhost:8081`)로 메뉴의 13개 화면 전부 진입, 콘솔 에러·네트워크 요청 확인
- 화재 시뮬레이션 버튼으로 위험 상태 전환/해제 확인
- 기기 추가(mock-register) → 방 설정에서 on/off 제어 → 상태 반영까지 end-to-end 확인 후 방에서 제거(완전 삭제 API가 없어 `room_id: null` 처리만 가능 — 테스트 잔여 기기 `mock-451087`("QA테스트기기")가 DB에 남아있음, 필요시 Supabase 대시보드에서 정리)

**2차 (한 달치 더미 데이터 시딩 후)**
- `backend/seed_month_demo.py` 신규 작성 후 실행 — 기기 6종, 온습도/움직임/재실 센서값 30일치, 전력 누적량 30일치, 취침기록 30일치(29건), 알림 14건, 캘린더 daily 3 + special 3, 자동화 규칙 2개, 생활패턴 이벤트, `app_settings`(1인 가구/목표 150kWh/주소) 시딩 완료
- 이 과정에서 백엔드 프로세스가 2회 추가로 다운되어 재시작(§4 #2) — 세션 누적 3회
- 위 2차 검증에서 신규 버그 3건 발견: 캘린더 삭제 유령 데이터 부활(#5), `/pattern/today` UTC/KST 경계 버그(#6), EnergyUsage 전월/전일 대비 계산 오류(#7)
- 시드 데이터는 정리하지 않고 그대로 둠 — 반복 실행하면 알림/일정 등이 계속 늘어나므로 다음에 실행할 땐 필요 시 Supabase에서 해당 테이블 비우고 시작할 것
