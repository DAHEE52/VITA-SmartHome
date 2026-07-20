# VITA-SmartHome

경상국립대 AI 에너지 스마트홈 메이커톤용 프로젝트. Expo(React Native) 앱 + FastAPI 백엔드(Supabase) + ESP32 펌웨어로 구성.

## 처음 받은 사람은 이 순서대로

1. **저장소 클론**
   ```bash
   git clone <이 저장소 주소>
   cd VITA
   ```

2. **`.env` 파일 두 개 받기** — 팀장에게 아래 두 파일의 실제 값을 **git이 아닌 다른 방법(카톡/슬랙 등)으로** 받아서 채운다. (git에는 `.env.example`만 있고 실제 값은 없음 — Supabase 키 등 비밀값이라 커밋 안 함)
   - `backend/.env.example` → 복사해서 `backend/.env` 만들고 값 채우기
   - `.env.example` → 복사해서 `.env` 만들고 값 채우기 (`EXPO_PUBLIC_API_URL`은 본인 PC에서 백엔드를 직접 돌릴 경우에만 IP를 바꿔야 함, 자세한 건 [SETUP.md](SETUP.md) 참고)

3. **앱 실행**
   ```bash
   npm install
   npm start        # 또는 npm run web / npm run android / npm run ios
   ```

4. **백엔드 실행** (백엔드는 보통 팀 내 한 사람만 돌리면 되고, 나머지는 그 사람의 LAN IP로 접속)
   ```bash
   cd backend
   python -m venv venv
   venv\Scripts\pip install -r requirements.txt
   venv\Scripts\python API_main.py
   ```

## 더 자세한 문서

- [CLAUDE.md](CLAUDE.md) — 프로젝트 구조/아키텍처 전반 (화면 구성, 백엔드 엔드포인트, 하드웨어 연동 방식)
- [SETUP.md](SETUP.md) — Supabase 프로젝트 생성부터 백엔드 연동 확인까지
- [ONSITE_CHECKLIST.md](ONSITE_CHECKLIST.md) — 행사장에서 실제 하드웨어 연결할 때 순서대로 따라가는 체크리스트
- [firmware/README.md](firmware/README.md) — ESP32(XIAO ESP32S3) 펌웨어 3종 빌드/업로드 방법

## 프로젝트 구성

```
VITA/
├── src/       # React Native 앱 (화면, API 클라이언트)
├── backend/   # FastAPI + Supabase
└── firmware/  # ESP32 Arduino 펌웨어 (env_presence_node / relay_node / power_monitor_node)
```
