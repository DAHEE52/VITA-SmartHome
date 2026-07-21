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

## 알아둘 점

- **무료 플랜은 약 1주일 비활성 시 자동 일시정지된다.** 실제 시연/발표 전에 Supabase 대시보드에 접속해서 프로젝트가 paused 상태가 아닌지 미리 확인할 것.
- ESP32 펌웨어와 VITA 앱은 전부 FastAPI를 거쳐서만 통신하고, Supabase에 직접 연결하지 않는다. Supabase 키가 필요한 곳은 이 백엔드(`backend/.env`) 단 한 곳뿐이다.
- VITA 앱에서 실제 휴대폰(Expo Go)으로 테스트할 때는 `VITA/.env`의 `EXPO_PUBLIC_API_URL`을 `localhost`가 아니라 **이 백엔드를 실행 중인 PC의 LAN IP**로 설정해야 한다 (`localhost`는 휴대폰 기준 휴대폰 자기 자신을 가리키기 때문).
