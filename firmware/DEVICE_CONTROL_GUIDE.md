# 기기 ON/OFF 제어 가이드 (조명 기준)

앱에서 "조명"(또는 다른 기기)을 켜고 끄는 기능이 실제로 어떻게 동작하는지, 무엇을 배선하고
설정해야 하는지 처음부터 끝까지 정리한 문서다. 코드/배선 자체는 이미 `actuator_hub_node`에
구현되어 있으므로, 이 문서는 새로 만드는 게 아니라 **연결하는 절차**를 안내한다.

관련 문서: 배선 상세는 [WIRING_GUIDE.md](WIRING_GUIDE.md), 노드 목록은 [README.md](README.md),
브레드보드 배치도는 [브레드보드_최종배치_v4.md](../브레드보드_최종배치_v4.md).

## 0. 전체 그림

```
앱(DeviceCard/DeviceSettingsModal) 에서 ON/OFF 탭
  → RoomsContext.toggleDevicePower()          src/context/RoomsContext.tsx
  → api.controlDevice(deviceId, 'on'|'off')   src/api/client.ts
  → POST /devices/{id}/control                backend/app/routers/rooms.py
  → Supabase device_commands 테이블에 pending 명령 insert

actuator_hub_node.ino (2.5초마다, 채널별로)
  → GET /devices/{id}/commands/pending 로 poll
  → digitalWrite(relay.pin, ...) 로 실제 채널(LED/릴레이) 스위칭
  → POST /devices/{id}/commands/{id}/ack 로 완료 보고
```

**어떤 채널이 "조명"인지는 코드가 정하지 않는다.** `actuator_hub_node.ino`는 릴레이 4채널
(`living-relay-01`~`04`)을 그냥 번호로만 다루고, 그중 하나를 "조명"이라고 부르는 건 앱에서
그 기기를 연결할 때 **사용자가 붙이는 이름**일 뿐이다. 그래서 같은 절차로 에어컨/TV 등
다른 기기도 채널만 바꿔서 그대로 쓸 수 있다 (§5 참고).

## 1. 하드웨어 배선

`브레드보드_최종배치_v4.md`의 **보드 2(XIAO ESP32-S3 액추에이터 허브)** 구성을 그대로 쓴다.
조명은 **채널1(D2)**에 배정하는 걸 기본으로 하되, 이번 데모에서는 실제 조명 기구(AC 220V/110V)
대신 **LED(발광 다이오드)로 조명을 대체**한다 - 그래서 릴레이 모듈도, AC 배선도 필요 없고
저항 하나만 있으면 된다. 감전 위험이 있는 AC 작업 자체가 없어지는 게 핵심 이점이다.

### 1-1. 부품

- LED 1개 (색은 무관 - 데모에서는 켜짐/꺼짐만 보여주면 되므로 빨강/노랑/초록 등 순방향
  전압이 낮은 색이 더 밝게 보임)
- 저항 220Ω 1개 (더 밝게 하고 싶으면 100Ω까지는 안전 범위 - §1-2 계산 참고)

### 1-2. 배선

| 부품 | 연결 |
|---|---|
| XIAO D2 | 저항 220Ω 한쪽 다리 |
| 저항 220Ω 나머지 다리 | LED 애노드(+, 다리가 긴 쪽) |
| LED 캐소드(-, 다리가 짧은 쪽 / 몸체 테두리 살짝 눌린 쪽) | GND(- 레일) |
| XIAO D1 | PIR OUT (재실 감지, 조명 제어와는 별개 기능) |

```
XIAO D2 ──[220Ω]── LED 애노드(+) ──▶│── LED 캐소드(-) ── GND
```

GPIO(D2)가 **HIGH**가 되면 저항→LED→GND로 전류가 흘러 켜지고(active-HIGH), **LOW**가 되면
꺼진다. 릴레이처럼 극성을 실측할 필요가 없다 - LED를 반대로 꽂으면 그냥 안 켜질 뿐이고
(전류가 역방향으로 흐르지 않음), 위험한 상태가 되지는 않는다. 안 켜지면 LED 방향을
뒤집어 다시 꽂아보면 된다.

**저항값 계산**: XIAO의 GPIO 출력은 3.3V, LED 순방향 전압은 보통 약 2.0V(빨강/노랑/초록
기준)이므로 저항에 걸리는 전압은 약 1.3V다. 220Ω이면 전류 ≈ 1.3V / 220Ω ≈ 6mA로 매우
안전하고(ESP32-S3 GPIO 권장 최대치보다 한참 낮음), 더 밝게 하고 싶으면 100Ω(≈ 13mA)까지는
안전 범위 안이다. 저항 없이 직결하면 GPIO에 과전류가 흘러 핀이 손상될 수 있으니 반드시
저항을 거친다.

**여러 개/더 밝은 LED가 필요하면** GPIO에서 직접 구동하지 말고 트랜지스터(2N2222 등)로
스위칭하는 방식으로 바꾼다 - §5 참고. 다른 3채널(IN2/D3, IN3/D6, IN4/D7)은 기존 릴레이
모듈 배선을 그대로 두면 나중에 에어컨/TV 등 실제 AC 기기를 바로 추가할 수 있다(AC 작업이므로
[WIRING_GUIDE.md 0장 안전 수칙](WIRING_GUIDE.md#0-안전-수칙-필독) 필독).

## 2. 소프트웨어 설정

1. `firmware/actuator_hub_node/config.h.example`을 같은 폴더에 `config.h`로 복사한다
   (`config.h`는 커밋하지 않는다 - WiFi 비밀번호/기기 키가 들어있다).
2. `config.h`를 채운다:
   - `WIFI_SSID` / `WIFI_PASSWORD`
   - `API_BASE_URL` - 백엔드 주소 (로컬 개발이면 PC의 LAN IP:8000, 배포판이면 Lambda Function
     URL)
   - `DEVICE_KEY` - `backend/.env`의 `DEVICE_API_KEY`와 반드시 동일해야 함
   - `RELAY1_ACTIVE_LEVEL` - 조명 LED 직결 채널은 기본값 `HIGH` 그대로 두면 된다(§1-2 참고).
     `RELAY2~4_ACTIVE_LEVEL`은 실제 릴레이 모듈을 쓰는 채널만 실측 후 맞춘다(기본 `LOW`)
3. `xiao-esp32s3` 스킬(또는 직접 arduino-cli)로 컴파일·업로드한다:
   ```powershell
   arduino-cli compile --fqbn esp32:esp32:XIAO_ESP32S3 firmware/actuator_hub_node
   arduino-cli upload -p <PORT> --fqbn esp32:esp32:XIAO_ESP32S3 firmware/actuator_hub_node
   ```
4. 부팅하면 `living-presence-01`(PIR)과 `living-relay-01`~`04`가 자동으로 백엔드에 등록된다
   (아직 방에 배정되지 않은 상태).

## 3. 앱에서 연결하고 이름 설정

1. 앱 → 스마트홈 제어 화면 → "+" (스마트 플러그 연결) 버튼
2. 목록에서 `living-relay-01` 찾아서 "연결" 탭
3. 연결되는 즉시 뜨는 이름 입력창에 **"조명"** 입력 후 저장
   (`ConnectDeviceModal`, `src/screens/SmartHomeControlScreen.tsx` - 연결과 이름 설정이 한
   흐름으로 이어지도록 되어 있다)
4. 이제 조명 카드를 탭해서 "수동" 모드로 바꾸고 ON/OFF를 누르면 §0의 흐름대로 실제 LED가
   반응한다.

## 4. 확인 방법

- 앱에서 ON을 눌렀을 때 LED가 켜지고, `actuator_hub_node`의 시리얼 로그에
  `living-relay-01 채널 적용: on`이 찍히는지 확인한다(시리얼 확인은 이 노드처럼 WiFi
  핫스팟을 띄우지 않는 일반 노드라면 안전하다 - `camera-dataset-collector` 스킬의 주의사항은
  카메라 데이터셋 수집 노드 전용).
- 반응이 2~3초 정도 걸리는 건 정상이다(`RELAY_POLL_INTERVAL_MS = 2500`).
- 앱 쪽에서 켜졌는데 실제로 안 켜지면: ①LED 극성(애노드/캐소드)이 반대로 꽂혀있지 않은지
  확인 - 반대면 그냥 안 켜질 뿐 위험하지는 않다 ②`RELAY1_ACTIVE_LEVEL`이 `HIGH`인지 확인
  ③저항/배선이 D2에 제대로 물려있는지 ④보드가 WiFi에 연결되어 있는지(재부팅 후 재연결
  로직은 있음) 확인.

## 5. 다른 기기로 확장하기

같은 절차를 채널만 바꿔서 반복하면 된다:

| 하고 싶은 것 | 방법 |
|---|---|
| 조명을 더 밝게/여러 개로 | GPIO 직결(§1) 대신 트랜지스터(2N2222 등)로 스위칭한다: `XIAO D2 → 저항(~1kΩ) → 트랜지스터 베이스`, `LED(+저항) → 5V 레일 → 트랜지스터 컬렉터`, `트랜지스터 이미터 → GND`. GPIO는 트랜지스터를 켜고 끄는 신호만 주고 LED 전류는 5V 레일에서 공급되므로 GPIO 전류 제한(§1-2)에서 자유로워진다. 코드/`config.h`는 그대로 - active level만 실측 후 맞추면 된다 |
| 에어컨/TV 등 추가 기기 (실제 AC 가전) | `actuator_hub_node`의 나머지 채널(IN2/IN3/IN4, `living-relay-02`~`04`)에 옵토릴레이 모듈 + AC 배선을 그대로 적용하고(§1과 달리 AC 안전 수칙 적용 대상, [WIRING_GUIDE.md](WIRING_GUIDE.md#0-안전-수칙-필독) 필독), 앱에서 연결할 때 "에어컨"/"TV" 등으로 이름만 다르게 저장 |
| 완제품 스마트플러그(TP-Link Tapo 등) 사용 | 릴레이를 직접 배선하지 않고 `backend/tapo_power_bridge.py`를 쓰면, 네트워크에 있는 Tapo 플러그를 자동으로 찾아 등록한다 - 이후 앱에서 연결하는 절차(§3)는 동일하다. 자세한 건 [SETUP.md](../SETUP.md#tapo-스마트플러그로-전력-측정--원격-제어-pzem릴레이-대신) 참고 |

## 6. 안전 요약

**이 가이드의 조명(LED, 채널1)은 GPIO 저전압(3.3V)만 다루므로 감전 위험이 없다.** 다만
같은 보드의 다른 채널에 실제 AC 가전(에어컨/TV 등)을 릴레이로 연결하거나, PZEM-004T로
전력을 측정하는 경우에는 220V/110V AC 전원선을 직접 다루게 되므로 절연 인클로저 없이
작업하지 말고 통전 상태에서 배선을 만지지 않는다. 자세한 수칙은
[WIRING_GUIDE.md](WIRING_GUIDE.md#0-안전-수칙-필독)를 반드시 먼저 읽는다.
