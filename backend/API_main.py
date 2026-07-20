from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import devices, energy, rooms

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


@app.get("/health")
def health():
    # 서버 상태 확인용 엔드포인트
    return {"status": "안녕하세요"}

if __name__ == "__main__" :
    import uvicorn
    uvicorn.run("API_main:app", host = "0.0.0.0", port = 8000,reload = True)