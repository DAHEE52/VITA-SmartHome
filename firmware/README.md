# VITA 하드웨어 노드 (XIAO ESP32S3)

FastAPI 백엔드(`VITA/backend/`)와 HTTP로 통신하는 ESP32 펌웨어. 각 폴더가 독립된 Arduino 스케치다.

실제 부품 배선/납땜 방법은 [WIRING_GUIDE.md](WIRING_GUIDE.md) 참고 (AC 전원을 다루는 안전 수칙 포함).
앱에서 조명 등 기기를 켜고 끄는 기능을 처음부터 끝까지(코드 흐름 + 배선 + 앱 연결) 연결하는
절차는 [DEVICE_CONTROL_GUIDE.md](DEVICE_CONTROL_GUIDE.md) 참고.

| 폴더 | 하드웨어 | 역할 |
|---|---|---|
| `env_presence_node/` | XIAO ESP32S3 + BME280(I2C) + PIR(HC-SR501) | 온습도/재실(움직임) 감지, 30~60초마다 서버로 push. **취침 감지(SleepContext) 상태머신이 여기서 push하는 `motion` 값을 그대로 쓴다** - 별도 취침 전용 센서 없이도 무움직임 30분 판정이 가능함 |
| `relay_node/` | XIAO ESP32S3 + 릴레이 모듈 | 기기 on/off 제어, 2~3초마다 대기 명령 poll |
| `power_monitor_node/` | XIAO ESP32S3 + PZEM-004T v3 | 전력 사용량 측정, 30~60초마다 서버로 push |
| `power_relay_node/` | XIAO ESP32S3 + PZEM-004T v3 + 릴레이 모듈 | 위 두 노드를 한 보드로 합친 스마트플러그형 노드 - device_id 하나로 전력 측정과 on/off 제어를 동시에 처리. 프로토타입 단계에서 "기기 하나 등록 → 측정+제어" 시나리오를 보여줄 때 씀 |
| `env_power_hub_node/` | XIAO ESP32S3 + BME280 + BH1750(조도) + PZEM-004T v3 | 브레드보드_최종배치_v4.md의 "보드 1"용 - 온습도/조도는 `living-env-01`(env_sensor), 전력은 `living-power-01`(power_monitor) 두 device_id로 등록해 각각 push(5초 주기). PZEM은 RX=D2/TX=D3(다른 노드의 D6/D7과 다름 - I2C가 D4/D5를 쓰기 때문). 값은 전부 앱으로 push되므로 OLED 로컬 표시는 제거함 |
| `actuator_hub_node/` | XIAO ESP32S3 + PIR(HC-SR501) + 4채널 릴레이 | 브레드보드_최종배치_v4.md의 "보드 2"용 - PIR은 `living-presence-01`(env_sensor)로 motion을 30초마다 push, 릴레이 4개는 `living-relay-01~04`(relay)로 각각 등록해 2.5초마다 대기 명령 poll. `relay_node`(단일 채널)의 4채널 확장판 |
| `presence_vision_node/` | XIAO ESP32S3 Sense(카메라) | Edge Impulse 비전 모델로 재실(occupied/empty) 프레임 분류, 8초마다 서버로 push. 움직임이 없어도(자는 중, TV 시청 중 등) 감지 가능. 추론 전 `<sketchbook>/libraries/vita-presence_inferencing` 라이브러리 설치 필요 |
| `life_pattern_vision_node/` | XIAO ESP32S3 Sense(카메라) | **(미학습 - 아직 컴파일 안 됨)** 생활 패턴 4-class(침대/책상/이동/외출) 분류, `/devices/{id}/classify`로 push. `vita-life_pattern_inferencing` 라이브러리를 Edge Impulse에서 학습·다운로드해야 컴파일된다 |

`presence_dataset_collector/`와 `life_pattern_dataset_collector/`는 위 노드들과 달리 상시 배포용이 아니라, 각각 `presence_vision_node`/`life_pattern_vision_node`의 Edge Impulse 모델을 학습/재학습할 때만 임시로 올리는 데이터 수집용 스케치다(AP 핫스팟 + 사진 촬영 웹페이지, `http://192.168.4.1`). `life_pattern_dataset_collector`는 라벨 입력창에 침대/책상/이동/외출 4개 버튼이 추가돼 있다 - `xiao-edgeimpulse-train` 스킬로 학습할 때 클래스당 80~100장(명세서 기준 총 400장) 정도 모으면 된다.

## 스코프에서 제외한 것 - 취침 3-class 비전 모델

명세서의 "AI 모델 2: 취침/기상 감지"(Person_Normal/Person_Blanket/Person_Sleeping 3-class)는 이번 구현에서 만들지 않았다. SleepContext(앱)의 4단계 상태머신이 이미 PIR `motion` + 카메라 `presence`만으로 스펙이 요구하는 판정(재실+조명OFF+시간 조건 → 30분 무움직임 → 확인 알림 → 자동 활성화)을 전부 구현하기 때문에, 별도 비전 모델 없이도 기능은 완성된다. 정확도를 더 높이고 싶을 때(예: 앉아서 무움직임인데 안 자는 경우 구분)만 나중에 추가하는 스트레치 항목으로 남겨둔다.

## 공통 준비

1. **보드 설치**: Arduino IDE → Boards Manager에서 "esp32 by Espressif Systems" 설치(2.x/3.x 최신). 보드로 **XIAO_ESP32S3** 선택.
2. **필수 설정**: Tools → **USB CDC On Boot: Enabled** (이 보드는 네이티브 USB라 이거 꺼져 있으면 `Serial.print()` 디버그 출력이 아예 안 보인다). 업로드가 안 되면 보드의 BOOT 버튼을 누른 채로 리셋해서 강제 부트로더 모드로 진입.
3. **라이브러리**: 각 스케치별 필요 라이브러리는 하위 폴더 설명 참고. 전부 Arduino Library Manager에서 검색 설치 가능.
4. **설정 파일**: 각 폴더의 `config.h.example`을 복사해 같은 폴더에 `config.h`로 저장하고 실제 값(WiFi, API 주소, 기기 키 등)을 채운다. `config.h`는 절대 커밋하지 않는다(비밀번호/키 포함).
5. **행사장 WiFi 확인 필수**: XIAO ESP32S3는 일반 가정용 WiFi(WPA2-PSK)에만 접속 가능하고, 대학 캠퍼스망에 흔한 **WPA2-Enterprise(eduroam 등)에는 접속할 수 없다.** 행사장이 WPA2-Enterprise만 제공한다면 모바일 핫스팟이나 여행자 라우터를 미리 준비할 것.

## 핀 배치 (XIAO ESP32S3 공통)

- I2C(BME280): `Wire.begin()`을 인자 없이 호출하면 기본 D4(SDA)/D5(SCL) 사용.
- UART(PZEM-004T): `HardwareSerial(1)`로 D6(TX)/D7(RX) 사용. `Serial`(USB)은 디버그 전용이라 센서 통신에 쓰지 않는다.
- PIR/릴레이 등 디지털 GPIO: D0/D1/D3/D8/D9/D10 사용 권장. D2(GPIO3)는 스트래핑 핀이라 되도록 회피.

## 공통 동작 패턴

- `setup()`: WiFi 연결 → `POST /devices/register` 1회 호출로 기기 등록.
- `loop()` 맨 위에서 `if (WiFi.status() != WL_CONNECTED) WiFi.reconnect();` — 라우터 순단 시 자동 복구(없으면 시연 중 노드가 멈춘 채로 방치됨).
- JSON은 **ArduinoJson v7** (`JsonDocument`, `serializeJson`/`deserializeJson`) 사용.
- 인증: 모든 요청에 헤더 `X-Device-Key: <config.h의 DEVICE_KEY>` 포함. 값은 기기마다 자유롭게 정해도 된다 - 백엔드가 그 기기의 첫 등록 요청에 실린 값을 그대로 그 기기의 영구 키로 저장하고(trust-on-first-use), 이후부터는 그 값으로만 인증한다. 기기 하나의 키가 유출돼도 다른 기기를 사칭할 수 없다. 키를 재발급하려면 백엔드에서 `DELETE /devices/{device_id}`로 그 기기를 지운 뒤 재부팅시키면 된다.

## 안전 경고

**PZEM-004T v3는 AC 전원선(220V/110V)에 직결된다.** 반드시 절연 인클로저 안에서 작업하고, 배선 전 line/load 방향을 데이터시트대로 확인할 것. 통전 상태에서 배선을 만지지 않는다.
