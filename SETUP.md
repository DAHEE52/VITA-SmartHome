# Supabase 프로젝트 설정 가이드

VITA 하드웨어(ESP32 노드) ↔ FastAPI ↔ Supabase 연동을 위한 최초 1회 설정 절차.

## 1. Supabase 프로젝트 생성

1. [supabase.com](https://supabase.com)에 가입/로그인 후 **New Project** 클릭
2. 조직 선택 → 프로젝트 이름 입력(예: `vita-smart-home`) → DB 비밀번호 생성(강력한 값으로, 어딘가 저장해두기 — 직접 쓸 일은 거의 없지만 생성 시 필수)
3. 리전은 **Seoul (ap-northeast-2)**를 우선 선택 (한국에서 백엔드를 돌릴 예정이라면). 프로비저닝에 1~2분 소요.

## 2. API 키 확인

1. 왼쪽 메뉴 **Project Settings → Data API**에서 **Project URL** 확인 → 아래 `.env`의 `SUPABASE_URL`
2. **Project Settings → API Keys**에서 **서버 전용(service_role 또는 secret으로 표시된) 키**를 확인 → `SUPABASE_SERVICE_KEY`
   - ⚠️ `anon`/`publishable`로 표시된 키가 아니라, 반드시 서버 전용 키를 사용할 것. 이 키는 RLS를 우회하므로 **절대 VITA 앱이나 ESP32 펌웨어 코드에 넣지 않는다** — FastAPI의 `.env`에만 존재해야 한다.

## 3. 스키마 적용

1. 왼쪽 메뉴 **SQL Editor** → New query
2. 이 저장소의 [backend/supabase/schema.sql](backend/supabase/schema.sql) 내용을 그대로 붙여넣고 Run
3. Auth/RLS/Storage는 따로 건드릴 필요 없음 — service_role 키만 서버에서 사용하고, 다른 클라이언트(앱/펌웨어)는 Supabase에 직접 접근하지 않기 때문.

## 4. 환경변수 설정

`backend/.env.example`을 복사해 `backend/.env`를 만들고 값을 채운다:

```bash
SUPABASE_URL=https://xxxxxxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...  # service_role/secret 키
DEVICE_API_KEY=345e01dbf13a5ba7d12843403115746a7f18b270431bc565  # 이미 생성해둔 값, 펌웨어 config.h들과 이미 맞춰져 있음
```

`.env.example`에는 `DEVICE_API_KEY`가 이미 채워져 있고 `firmware/*/config.h.example`에도 같은 값이 들어있으니, 이 부분은 그대로 복사만 하면 된다. 채워야 하는 건 `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` 두 개뿐이다.

## 5. 패키지 설치 & 서버 실행

```bash
cd backend
python -m venv venv          # 최초 1회만
venv\Scripts\pip install -r requirements.txt
venv\Scripts\python API_main.py
# 또는: venv\Scripts\python -m uvicorn API_main:app --reload --host 0.0.0.0 --port 8000
```

`http://localhost:8000/health` 접속해서 정상 응답 확인.

## 6. Supabase 연동 확인

서버가 뜬 상태에서, **서버를 실행한 터미널은 그대로 두고 새 터미널을 하나 더 열어서**(터미널 탭 옆 `+` 버튼) 다음을 순서대로 실행해보고, Supabase 대시보드의 **Table Editor**에서 `devices`/`sensor_readings`/`device_commands` 테이블에 실제로 row가 쌓이는지 확인한다.

**PowerShell (VSCode 기본 터미널)인 경우:**

```powershell
$KEY = "345e01dbf13a5ba7d12843403115746a7f18b270431bc565"
$headers = @{ "X-Device-Key" = $KEY }

# 1) 가짜 기기 등록
Invoke-RestMethod -Uri "http://localhost:8000/devices/register" -Method Post -Headers $headers -ContentType "application/json" -Body '{"device_id":"test-01","type":"env_sensor","room":"거실","label":"테스트"}'

# 2) 센서값 전송
Invoke-RestMethod -Uri "http://localhost:8000/devices/test-01/readings" -Method Post -Headers $headers -ContentType "application/json" -Body '{"readings":[{"metric":"temperature","value":24.5},{"metric":"humidity","value":55}]}'

# 3) 앱이 보는 것과 동일한 응답 확인
Invoke-RestMethod -Uri "http://localhost:8000/home/summary"
Invoke-RestMethod -Uri "http://localhost:8000/rooms/status"
```

**Git Bash/macOS/Linux 터미널인 경우:**

```bash
KEY=345e01dbf13a5ba7d12843403115746a7f18b270431bc565

curl -X POST http://localhost:8000/devices/register \
  -H "Content-Type: application/json" -H "X-Device-Key: $KEY" \
  -d '{"device_id":"test-01","type":"env_sensor","room":"거실","label":"테스트"}'

curl -X POST http://localhost:8000/devices/test-01/readings \
  -H "Content-Type: application/json" -H "X-Device-Key: $KEY" \
  -d '{"readings":[{"metric":"temperature","value":24.5},{"metric":"humidity","value":55}]}'

curl http://localhost:8000/home/summary
curl http://localhost:8000/rooms/status
```

세 개 다 정상 JSON이 나오고 Supabase 테이블에 row가 보이면 백엔드 쪽은 끝난 것이다.

## 7. (선택) 라즈베리파이에서 상시 실행

노트북을 계속 켜두지 않아도 되도록, 백엔드를 라즈베리파이에서 systemd 서비스로 돌릴 수 있다.

```bash
# 라즈베리파이에 backend/ 전체(venv 제외)를 복사한 뒤
cd ~/vita-backend
python3 -m venv venv
venv/bin/pip install -r requirements.txt
```

`/etc/systemd/system/vita-backend.service`:

```ini
[Unit]
Description=VITA SmartHome FastAPI backend
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=<사용자명>
WorkingDirectory=/home/<사용자명>/vita-backend
ExecStart=/home/<사용자명>/vita-backend/venv/bin/python -m uvicorn API_main:app --host 0.0.0.0 --port 8000
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now vita-backend.service
```

이후 `firmware/*/config.h`의 `API_BASE_URL`을 라즈베리파이의 LAN IP로 바꾸면 ESP32 노드들이 여기로 push한다.

### Tapo 스마트플러그로 전력 측정 + 원격 제어 (PZEM/릴레이 대신)

AC 배선(PZEM/릴레이)을 직접 다루는 대신 완제품 스마트플러그(TP-Link Tapo P100/P105/P110/P110M/P115)를 쓰려면 라즈베리파이에서 두 스크립트(`backend/tapo_mqtt_publisher.py`, `backend/tapo_mqtt_bridge.py`)를 함께 돌린다. 이 둘은 같은 Pi 안에서 로컬 MQTT 브로커(Mosquitto)로 서로 통신한다 - ESP32 노드와 FastAPI 백엔드는 지금처럼 HTTP만 그대로 쓰고, MQTT는 Pi 내부(Tapo 기기 ↔ 백엔드 연동 구간)에서만 쓰인다.

```bash
# 1) 라즈베리파이에 Mosquitto 브로커 설치 (외부 노출 없이 localhost만 씀 - 인증 없이 기본 설정으로 충분)
sudo apt install mosquitto mosquitto-clients
sudo systemctl enable --now mosquitto
```

`.env.example`의 `TAPO_*`/`MQTT_*` 값을 채운 뒤, Tapo 앱에서 **나 > 제3자 서비스 > 제3자 호환성**을 켜고(안 켜면 "Unsupported device" 에러) 아래처럼 두 서비스로 등록한다. IP를 직접 알아낼 필요는 없다 - 발행자가 30초마다 같은 네트워크를 검색해서 새로 켜진 Tapo 플러그를 자동으로 찾아 등록한다. 등록된 기기는 앱의 "스마트홈 제어 > 스마트 플러그 연결(+)" 목록에 바로 나타나고, 3초마다 앱에서 내려온 on/off 명령도 실행한다(전력 측정이 되는 P110 계열은 실시간 W도 같이 push).

```ini
# /etc/systemd/system/tapo-mqtt-publisher.service
[Unit]
Description=VITA Tapo MQTT publisher (Tapo <-> local broker)
After=network-online.target mosquitto.service
Wants=network-online.target

[Service]
Type=simple
User=<사용자명>
WorkingDirectory=/home/<사용자명>/vita-backend
Environment=PYTHONUNBUFFERED=1
ExecStart=/home/<사용자명>/vita-backend/venv/bin/python tapo_mqtt_publisher.py
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```ini
# /etc/systemd/system/tapo-mqtt-bridge.service
[Unit]
Description=VITA Tapo MQTT bridge (local broker <-> FastAPI backend)
After=network-online.target mosquitto.service vita-backend.service
Wants=network-online.target

[Service]
Type=simple
User=<사용자명>
WorkingDirectory=/home/<사용자명>/vita-backend
Environment=PYTHONUNBUFFERED=1
ExecStart=/home/<사용자명>/vita-backend/venv/bin/python tapo_mqtt_bridge.py
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now tapo-mqtt-publisher.service tapo-mqtt-bridge.service
```

발견된 플러그마다 `tapo-<기기ID>`로 자동 등록된다 - 전력 측정이 되는 기종(P110/P110M/P115)은 `power_monitor`, 안 되는 기종(P100/P105)은 `relay` 타입으로 등록된다. 두 서비스 중 하나만 죽어도 나머지는 계속 도니, 문제 생기면 `sudo journalctl -u tapo-mqtt-publisher -u tapo-mqtt-bridge -f`로 어느 쪽인지 먼저 구분할 것.

## 알아둘 점

- **무료 플랜은 약 1주일 비활성 시 자동 일시정지된다.** 실제 시연/발표 전에 Supabase 대시보드에 접속해서 프로젝트가 paused 상태가 아닌지 미리 확인할 것.
- ESP32 펌웨어와 VITA 앱은 전부 FastAPI를 거쳐서만 통신하고, Supabase에 직접 연결하지 않는다. Supabase 키가 필요한 곳은 이 백엔드(`backend/.env`) 단 한 곳뿐이다.
- VITA 앱에서 실제 휴대폰(Expo Go)으로 테스트할 때는 `VITA/.env`의 `EXPO_PUBLIC_API_URL`을 `localhost`가 아니라 **이 백엔드를 실행 중인 PC의 LAN IP**로 설정해야 한다 (`localhost`는 휴대폰 기준 휴대폰 자기 자신을 가리키기 때문).
