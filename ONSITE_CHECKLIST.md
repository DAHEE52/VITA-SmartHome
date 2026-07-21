# 행사장 당일 체크리스트

WiFi/하드웨어가 없는 지금은 준비만 해두고, 실제로 현장에서 연결할 때 이 순서대로 진행한다.

## 0. 도착 직후

- [ ] 행사장 WiFi가 WPA2-PSK(개인용)인지 확인. WPA2-Enterprise(eduroam 등)면 XIAO ESP32S3가 못 붙으니 모바일 핫스팟/여행자 라우터로 전환.
- [ ] 백엔드(FastAPI)를 돌릴 노트북을 그 WiFi에 연결.

## 1. 백엔드 PC의 LAN IP 확인 → 3곳에 반영

노트북이 WiFi에 붙으면 IP가 이 문서 작성 시점(`192.168.200.141`)과 달라진다. PowerShell에서:

```powershell
ipconfig
```

"IPv4 주소" 값을 확인한 뒤, 아래 파일들의 IP를 전부 그 값으로 바꾼다:

- [ ] `VITA/.env`의 `EXPO_PUBLIC_API_URL`
- [ ] `VITA/firmware/env_presence_node/config.h`의 `API_BASE_URL`
- [ ] `VITA/firmware/relay_node/config.h`의 `API_BASE_URL`
- [ ] `VITA/firmware/power_monitor_node/config.h`의 `API_BASE_URL`

(포트 `:8000`은 그대로 둔다.)

## 2. 백엔드 실행

```powershell
cd VITA/backend
venv\Scripts\python API_main.py
```

- [ ] 브라우저로 `http://localhost:8000/health` 접속해서 정상 응답 확인
- [ ] Supabase 대시보드에서 프로젝트가 paused 상태가 아닌지 확인 (무료 플랜은 장기간 미사용 시 자동 정지됨)

## 3. 각 config.h에 실제 WiFi 정보 입력

3개 파일(`env_presence_node`/`relay_node`/`power_monitor_node`의 `config.h`) 전부에서:

- [ ] `WIFI_SSID` — 실제 SSID로 교체
- [ ] `WIFI_PASSWORD` — 실제 비밀번호로 교체

(`API_BASE_URL`은 1번에서 이미 교체함. `DEVICE_KEY`/`DEVICE_ID`/`ROOM`은 미리 맞춰둔 값이라 안 건드려도 됨.)

## 4. Arduino IDE로 업로드

- [ ] 보드: `XIAO_ESP32S3` 선택, Tools → **USB CDC On Boot: Enabled**
- [ ] 스케치 열기 → 업로드
- [ ] 시리얼 모니터(115200 baud) 열어서 다음 로그 확인:
  - `WiFi 연결됨: <IP주소>`
  - `등록 응답 코드: 200`
- [ ] 3개 보드 전부 반복

## 5. VITA 앱에서 확인

```powershell
cd VITA
npm start
```

Expo Go 앱으로 QR 스캔 후:

- [ ] MainScreen — 온습도가 대시(—)가 아니라 실제 숫자로 뜨는지
- [ ] SmartHomeControl — 방 카드가 실제로 표시되고, 탭했을 때 릴레이가 켜지는지
- [ ] EnergyUsage — 항목별 사용량에 실제 기기가 뜨는지

## 자주 막히는 지점

| 증상 | 원인 |
|---|---|
| 시리얼 모니터에 "WiFi 연결 중....." 계속 반복 | SSID/비밀번호 오타, 또는 WPA2-Enterprise 네트워크 |
| "등록 응답 코드"가 -1이나 음수 | `API_BASE_URL`의 IP가 틀림(1번 다시 확인) 또는 백엔드 서버가 꺼져있음 |
| 앱에서 계속 대시(—)만 표시 | `VITA/.env`의 `EXPO_PUBLIC_API_URL`이 실제 백엔드 PC IP와 다름 |
| 401 Unauthorized | `config.h`의 `DEVICE_KEY`와 `backend/.env`의 `DEVICE_API_KEY`가 다름 (건드리지 않았으면 발생 안 함) |
| 릴레이가 반응 없음 | `RELAY_ACTIVE_LEVEL` 극성이 실제 보드와 반대 |
