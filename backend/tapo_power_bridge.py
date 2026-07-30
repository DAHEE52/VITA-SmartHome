"""
Tapo P110M -> VITA 백엔드 브릿지.
라즈베리파이(또는 백엔드가 떠 있는 아무 기기)에서 상시 실행하며, 5초마다 스마트플러그의
실시간 전력(W)을 읽어서 FastAPI 백엔드(/devices/{id}/readings)로 push한다. AC 배선을
직접 다루는 PZEM 대신 완제품 스마트플러그로 전력을 측정하는 방식 - 안전하고 배선이 필요 없다.

필요 환경변수 (.env, .env.example 참고):
  TAPO_USERNAME, TAPO_PASSWORD - Tapo 앱 로그인 계정 (로컬 인증에도 필요)
  TAPO_IP                      - P110M의 LAN IP (예: 192.168.0.94)
  API_BASE_URL                 - FastAPI 백엔드 주소 (기본 http://localhost:8000)
  DEVICE_API_KEY                - .env의 DEVICE_API_KEY와 동일해야 함

주의: Tapo 앱에서 "나 > 제3자 서비스 > 제3자 호환성"을 켜야 한다. 안 켜면
"Unsupported device (encrypt_type='TPAP')" 에러가 나며 접속이 거부된다.

systemd로 상시 실행하는 예시는 firmware/README.md 또는 SETUP.md 참고.
"""

import asyncio
import os

import httpx
from dotenv import load_dotenv
from tapo import ApiClient

load_dotenv()

TAPO_USERNAME = os.environ["TAPO_USERNAME"]
TAPO_PASSWORD = os.environ["TAPO_PASSWORD"]
TAPO_IP = os.environ["TAPO_IP"]
API_BASE_URL = os.environ.get("API_BASE_URL", "http://localhost:8000")
DEVICE_API_KEY = os.environ["DEVICE_API_KEY"]

DEVICE_ID = "living-smartplug-01"
ROOM = "거실"
PUSH_INTERVAL_SEC = 5


async def register_device(client: httpx.AsyncClient):
    resp = await client.post(
        "/devices/register",
        json={"device_id": DEVICE_ID, "type": "power_monitor", "room": ROOM, "label": f"{ROOM} 스마트플러그"},
    )
    print("등록 응답 코드:", resp.status_code)


async def push_reading(client: httpx.AsyncClient, power_w: float):
    resp = await client.post(
        f"/devices/{DEVICE_ID}/readings",
        json={"readings": [{"metric": "power_w", "value": power_w}]},
    )
    print("readings 응답 코드:", resp.status_code, "power_w:", power_w)


async def main():
    tapo_client = ApiClient(TAPO_USERNAME, TAPO_PASSWORD)
    device = await tapo_client.p110(TAPO_IP)

    async with httpx.AsyncClient(
        base_url=API_BASE_URL, headers={"X-Device-Key": DEVICE_API_KEY}, timeout=10
    ) as http:
        await register_device(http)

        while True:
            try:
                energy = await device.get_energy_usage()
                power_w = energy.current_power / 1000.0
                await push_reading(http, power_w)
            except Exception as err:  # noqa: BLE001 - 데모용 상시 실행 루프, 한 번 실패해도 계속 돌아야 함
                print("오류(다음 주기에 재시도):", err)
            await asyncio.sleep(PUSH_INTERVAL_SEC)


if __name__ == "__main__":
    asyncio.run(main())
