from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import automation, devices, energy, notifications, rooms, schedule, settings, sleep

app = FastAPI()

# 프로토타입 단계라 오리진 제한 없이 전부 허용 (VITA Expo 개발 서버/실기기에서 바로 호출 가능하도록)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(devices.router)
app.include_router(rooms.router)
app.include_router(energy.router)
app.include_router(schedule.router)
app.include_router(notifications.router)
app.include_router(settings.router)
app.include_router(automation.router)
app.include_router(sleep.router)


@app.get("/health")
def health():
    # 서버 상태 확인용 엔드포인트
    return {"status": "안녕하세요"}

if __name__ == "__main__" :
    import uvicorn
    # reload=True(파일 변경 감지 시 자동 재시작)는 Windows에서 감시 프로세스 + 워커 프로세스로
    # 나뉘어 실행되는데, 감시 프로세스만 죽이면 워커가 소켓을 쥔 채 orphan으로 남아 포트를 계속
    # 점유하는 문제가 있었다(재시작해도 이전 코드가 계속 응답). 로컬 개발 편의보다 이 문제가
    # 더 크므로 끈다 - 코드를 바꾸면 서버를 직접 껐다 켜야 한다.
    uvicorn.run("API_main:app", host = "0.0.0.0", port = 8000, reload = False)