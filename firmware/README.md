# VITA 하드웨어 노드 (XIAO ESP32S3)

FastAPI 백엔드(`VITA/backend/`)와 HTTP로 통신하는 ESP32 펌웨어 3종. 각 폴더가 독립된 Arduino 스케치다.

| 폴더 | 하드웨어 | 역할 |
|---|---|---|
| `env_presence_node/` | XIAO ESP32S3 + BME280(I2C) + PIR(HC-SR501) | 온습도/재실 감지, 30~60초마다 서버로 push |
| `relay_node/` | XIAO ESP32S3 + 릴레이 모듈 | 기기 on/off 제어, 2~3초마다 대기 명령 poll |
| `power_monitor_node/` | XIAO ESP32S3 + PZEM-004T v3 | 전력 사용량 측정, 30~60초마다 서버로 push |

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
- 인증: 모든 요청에 헤더 `X-Device-Key: <config.h의 DEVICE_KEY>` 포함. FastAPI `.env`의 `DEVICE_API_KEY`와 반드시 동일해야 함.

## 안전 경고

**PZEM-004T v3는 AC 전원선(220V/110V)에 직결된다.** 반드시 절연 인클로저 안에서 작업하고, 배선 전 line/load 방향을 데이터시트대로 확인할 것. 통전 상태에서 배선을 만지지 않는다.
