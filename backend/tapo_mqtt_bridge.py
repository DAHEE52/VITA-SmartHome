"""
Tapo MQTT <-> VITA 백엔드(HTTP) 브릿지.
라즈베리파이에서 tapo_mqtt_publisher.py와 함께 상시 실행한다. 이 스크립트만 백엔드 주소/기기
키를 알고, Tapo 기기나 tapo 라이브러리는 전혀 모른다 - 발견/전력값/명령결과는 전부 로컬
Mosquitto 브로커를 통해 MQTT로만 주고받는다. relay_node.ino 등 ESP32 노드가 쓰는 것과
동일한 /devices/register, /devices/{id}/readings, /devices/{id}/commands/pending,
/devices/{id}/commands/{id}/ack HTTP 엔드포인트를 그대로 재사용한다.

동작:
  - vita/tapo/+/discovered (retained) 구독 -> POST /devices/register
  - vita/tapo/+/power 구독                 -> POST /devices/{id}/readings
  - vita/tapo/+/command_result 구독         -> POST /devices/{id}/commands/{id}/ack
  - 알고 있는 기기마다 COMMAND_POLL_INTERVAL_SEC마다 GET /devices/{id}/commands/pending 폴링
    -> 대기 명령이 있으면 vita/tapo/{id}/command로 발행 (실제 실행/ack는 publisher가 회신)

필요 환경변수 (.env, .env.example 참고):
  MQTT_HOST, MQTT_PORT  - 로컬 Mosquitto 주소 (기본 localhost:1883)
  API_BASE_URL          - FastAPI 백엔드 주소 (기본 http://localhost:8000)
  DEVICE_API_KEY        - .env의 DEVICE_API_KEY와 동일해야 함

systemd로 상시 실행하는 예시는 SETUP.md 참고.
"""

import asyncio
import json
import os

import aiomqtt
import httpx
from dotenv import load_dotenv

load_dotenv()

MQTT_HOST = os.environ.get("MQTT_HOST", "localhost")
MQTT_PORT = int(os.environ.get("MQTT_PORT", "1883"))
API_BASE_URL = os.environ.get("API_BASE_URL", "http://localhost:8000")
DEVICE_API_KEY = os.environ["DEVICE_API_KEY"]

COMMAND_POLL_INTERVAL_SEC = 3

# vita/tapo/{id}/discovered로 알게 된 기기 id 모음 - 대기 명령 폴링 대상.
known_device_ids: set[str] = set()


async def handle_mqtt_messages(mqtt: aiomqtt.Client, http: httpx.AsyncClient):
    await mqtt.subscribe("vita/tapo/+/discovered")
    await mqtt.subscribe("vita/tapo/+/power")
    await mqtt.subscribe("vita/tapo/+/command_result")

    async for message in mqtt.messages:
        device_id, kind = str(message.topic).split("/")[2:4]
        body = json.loads(message.payload)

        if kind == "discovered":
            known_device_ids.add(device_id)
            resp = await http.post(
                "/devices/register",
                json={
                    "device_id": device_id,
                    "type": body["type"],
                    "label": body["label"],
                    "state": "on" if body["on"] else "off",
                },
            )
            if resp.status_code != 200:
                print(f"[{device_id}] 등록 응답 코드:", resp.status_code)

        elif kind == "power":
            resp = await http.post(
                f"/devices/{device_id}/readings",
                json={"readings": [{"metric": "power_w", "value": body["power_w"]}]},
            )
            if resp.status_code != 200:
                print(f"[{device_id}] readings 응답 코드:", resp.status_code)

        elif kind == "command_result":
            await http.post(
                f"/devices/{device_id}/commands/{body['command_id']}/ack",
                json={"status": body["status"]},
            )


async def poll_pending_commands(mqtt: aiomqtt.Client, http: httpx.AsyncClient):
    """VITA 백엔드에 쌓인 on/off 대기 명령을 찾아 MQTT로 발행한다 - 실제 실행/ack는
    tapo_mqtt_publisher.py가 command_result로 회신하면 위 handle_mqtt_messages가 처리한다."""
    while True:
        for device_id in list(known_device_ids):
            resp = await http.get(f"/devices/{device_id}/commands/pending")
            if resp.status_code != 200:
                continue
            for cmd in resp.json():
                await mqtt.publish(
                    f"vita/tapo/{device_id}/command",
                    payload=json.dumps({"command_id": cmd["id"], "command": cmd["command"]}),
                )
        await asyncio.sleep(COMMAND_POLL_INTERVAL_SEC)


async def main():
    async with aiomqtt.Client(MQTT_HOST, MQTT_PORT) as mqtt:
        async with httpx.AsyncClient(
            base_url=API_BASE_URL, headers={"X-Device-Key": DEVICE_API_KEY}, timeout=10
        ) as http:
            print(f"Tapo MQTT 브릿지 시작 - 브로커: {MQTT_HOST}:{MQTT_PORT}, 백엔드: {API_BASE_URL}")
            await asyncio.gather(
                handle_mqtt_messages(mqtt, http),
                poll_pending_commands(mqtt, http),
            )


if __name__ == "__main__":
    asyncio.run(main())
