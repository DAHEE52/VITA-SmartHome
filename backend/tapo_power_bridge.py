"""
Tapo 스마트플러그 <-> VITA 백엔드 브릿지.
라즈베리파이(또는 백엔드가 떠 있는 아무 기기)에서 상시 실행하며, 같은 네트워크에 있는 Tapo
스마트플러그를 자동으로 찾아 VITA 기기로 등록하고, 실시간 전력(W)을 읽어서 push하는 동시에
앱에서 내려온 on/off 명령을 실제 플러그에 반영한다.

동작 방식:
  1. (DISCOVERY_INTERVAL_SEC마다) 로컬 네트워크에 브로드캐스트로 Tapo 기기를 검색해서,
     새로 찾은 스마트플러그(P100/P105/P110/P110M/P115)를 /devices/register로 등록한다.
     이미 등록된 기기는 last_seen_at/실제 on-off 상태만 갱신되고, 방 배정(room_id)이나
     사용자가 붙인 이름은 건드리지 않는다 - 그래서 앱의 "스마트 플러그 연결"(+) 목록에
     자동으로 나타나고, 사용자가 거기서 기기를 고르면 바로 이름을 설정하는 흐름과 자연스럽게
     이어진다.
  2. (POLL_INTERVAL_SEC마다) 찾은 기기마다: 전력 측정이 되는 기종이면 실시간 W를 push하고,
     VITA 백엔드에 쌓인 대기 명령(on/off)이 있으면 실제 플러그에 실행한 뒤 ack한다.
     relay_node/power_relay_node 등 ESP32 노드와 동일한 명령 큐 패턴을 그대로 재사용한다.

필요 환경변수 (.env, .env.example 참고):
  TAPO_USERNAME, TAPO_PASSWORD - Tapo 앱 로그인 계정 (로컬 인증에도 필요)
  TAPO_DISCOVERY_TARGET         - 검색할 브로드캐스트 주소 (기본 255.255.255.255)
  API_BASE_URL                  - FastAPI 백엔드 주소 (기본 http://localhost:8000)
  DEVICE_API_KEY                 - .env의 DEVICE_API_KEY와 동일해야 함

주의: Tapo 앱에서 "나 > 제3자 서비스 > 제3자 호환성"을 켜야 한다. 안 켜면
"Unsupported device (encrypt_type='TPAP')" 에러가 나며 접속이 거부된다.

systemd로 상시 실행하는 예시는 firmware/README.md 또는 SETUP.md 참고.
"""

import asyncio
import os

import httpx
from dotenv import load_dotenv
from tapo import ApiClient
from tapo.discovery_result import DiscoveryResult

load_dotenv()

TAPO_USERNAME = os.environ["TAPO_USERNAME"]
TAPO_PASSWORD = os.environ["TAPO_PASSWORD"]
DISCOVERY_TARGET = os.environ.get("TAPO_DISCOVERY_TARGET", "255.255.255.255")
API_BASE_URL = os.environ.get("API_BASE_URL", "http://localhost:8000")
DEVICE_API_KEY = os.environ["DEVICE_API_KEY"]

DISCOVERY_INTERVAL_SEC = 30
POLL_INTERVAL_SEC = 3


# device_id -> {"handler": ..., "type": "power_monitor" | "relay", "nickname": str}
known_devices: dict[str, dict] = {}


def _device_id_for(tapo_device_id: str) -> str:
    return f"tapo-{tapo_device_id}"


async def register_device(client: httpx.AsyncClient, device_id: str, type_: str, label: str, on: bool):
    resp = await client.post(
        "/devices/register",
        json={"device_id": device_id, "type": type_, "label": label, "state": "on" if on else "off"},
    )
    if resp.status_code != 200:
        print(f"[{device_id}] 등록 응답 코드:", resp.status_code)


async def discover_once(tapo_client: ApiClient, http: httpx.AsyncClient):
    """로컬 네트워크에서 Tapo 스마트플러그를 찾아 known_devices에 채우고 백엔드에 등록한다.
    조명/허브/카메라 등 플러그가 아닌 기종은 이 브릿지의 범위 밖이라 건너뛴다."""
    try:
        async for maybe_result in tapo_client.discover_devices(DISCOVERY_TARGET):
            try:
                result = maybe_result.get()
            except Exception as err:
                print("검색 응답 파싱 실패(무시하고 계속):", err)
                continue

            match result:
                case DiscoveryResult.PlugEnergyMonitoring(device_info, handler):
                    device_id = _device_id_for(device_info.device_id)
                    is_new = device_id not in known_devices
                    known_devices[device_id] = {
                        "handler": handler,
                        "type": "power_monitor",
                        "nickname": device_info.nickname,
                    }
                    if is_new:
                        print(f"새 스마트플러그(전력측정) 발견: {device_id} ({device_info.nickname})")
                    await register_device(
                        http, device_id, "power_monitor", device_info.nickname, device_info.device_on
                    )
                case DiscoveryResult.Plug(device_info, handler):
                    device_id = _device_id_for(device_info.device_id)
                    is_new = device_id not in known_devices
                    known_devices[device_id] = {
                        "handler": handler,
                        "type": "relay",
                        "nickname": device_info.nickname,
                    }
                    if is_new:
                        print(f"새 스마트플러그 발견: {device_id} ({device_info.nickname})")
                    await register_device(http, device_id, "relay", device_info.nickname, device_info.device_on)
                case _:
                    pass  # 플러그가 아닌 기종(조명/허브/카메라 등) - 이 브릿지에서는 다루지 않음
    except Exception as err:  # noqa: BLE001 - 검색 한 번 실패해도 다음 주기에 재시도
        print("기기 검색 실패(다음 주기에 재시도):", err)


async def push_reading(http: httpx.AsyncClient, device_id: str, power_w: float):
    resp = await http.post(
        f"/devices/{device_id}/readings",
        json={"readings": [{"metric": "power_w", "value": power_w}]},
    )
    if resp.status_code != 200:
        print(f"[{device_id}] readings 응답 코드:", resp.status_code)


async def apply_pending_commands(http: httpx.AsyncClient, device_id: str, handler):
    """VITA 백엔드에 쌓인 on/off 대기 명령을 실제 Tapo 플러그에 실행하고 ack한다 -
    relay_node.ino가 하는 것과 동일한 poll+ack 패턴."""
    resp = await http.get(f"/devices/{device_id}/commands/pending")
    if resp.status_code != 200:
        return
    for cmd in resp.json():
        try:
            if cmd["command"] == "on":
                await handler.on()
            else:
                await handler.off()
            status = "done"
        except Exception as err:  # noqa: BLE001 - 이 명령만 실패 처리하고 다음 명령/기기는 계속 진행
            print(f"[{device_id}] 명령 실행 실패({cmd['command']}):", err)
            status = "failed"
        await http.post(f"/devices/{device_id}/commands/{cmd['id']}/ack", json={"status": status})


async def poll_device(http: httpx.AsyncClient, device_id: str, info: dict):
    handler = info["handler"]
    try:
        if info["type"] == "power_monitor":
            power = await handler.get_current_power()
            await push_reading(http, device_id, power.current_power)
    except Exception as err:  # noqa: BLE001 - 다음 주기에 재시도
        print(f"[{device_id}] 전력 조회 실패(다음 주기에 재시도):", err)

    try:
        await apply_pending_commands(http, device_id, handler)
    except Exception as err:  # noqa: BLE001 - 다음 주기에 재시도
        print(f"[{device_id}] 명령 확인 실패(다음 주기에 재시도):", err)


async def discovery_loop(tapo_client: ApiClient, http: httpx.AsyncClient):
    while True:
        await discover_once(tapo_client, http)
        await asyncio.sleep(DISCOVERY_INTERVAL_SEC)


async def poll_loop(http: httpx.AsyncClient):
    while True:
        # dict를 복사해서 순회 - discovery_loop가 같은 시점에 known_devices를 갱신해도 안전하게.
        for device_id, info in list(known_devices.items()):
            await poll_device(http, device_id, info)
        await asyncio.sleep(POLL_INTERVAL_SEC)


async def main():
    tapo_client = ApiClient(TAPO_USERNAME, TAPO_PASSWORD)

    async with httpx.AsyncClient(
        base_url=API_BASE_URL, headers={"X-Device-Key": DEVICE_API_KEY}, timeout=10
    ) as http:
        print(f"Tapo 브릿지 시작 - 검색 대상: {DISCOVERY_TARGET}, 백엔드: {API_BASE_URL}")
        # 첫 검색은 poll_loop가 기기를 찾기 전에 한 번 끝내둔다.
        await discover_once(tapo_client, http)
        await asyncio.gather(
            discovery_loop(tapo_client, http),
            poll_loop(http),
        )


if __name__ == "__main__":
    asyncio.run(main())
