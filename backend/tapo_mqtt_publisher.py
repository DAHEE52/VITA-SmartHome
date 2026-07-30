"""
Tapo 스마트플러그 <-> 로컬 MQTT 브릿지 (발행자 쪽).
라즈베리파이에서 tapo_mqtt_bridge.py와 함께 상시 실행한다. 같은 네트워크의 Tapo
스마트플러그(P100/P105/P110/P110M/P115)를 찾아 로컬 Mosquitto 브로커에만 상태를
publish한다 - VITA 백엔드(FastAPI) 주소나 기기 키는 이 스크립트에 전혀 없다.
백엔드 연동(HTTP)은 tapo_mqtt_bridge.py가 별도 프로세스로 맡는다.
(ESP32 노드와 백엔드 쪽 HTTP 인터페이스는 그대로 유지한 채, 라즈베리파이 안에서만
Tapo<->MQTT 구간을 두기 위한 구조 - CLAUDE.md의 "펌웨어는 순수 HTTP" 원칙은 안 바뀐다.)

토픽 구조 (전부 JSON payload):
  vita/tapo/{device_id}/discovered      (retained) {"type", "label", "on"} - 기기가 검색될 때마다
  vita/tapo/{device_id}/power                      {"power_w", "energy_kwh"} - 전력 측정 기종만,
                                                    POLL_INTERVAL_SEC마다. energy_kwh는 기기 자체
                                                    누적값(하루/한달 단위로 리셋됨, PZEM 같은 진짜
                                                    수명 카운터가 아님)을 안 쓰고, 이 스크립트가 매
                                                    조회마다 power_w를 구간 적분해서 직접 만든 리셋
                                                    없는 누적치다 - 백엔드의 /energy/usage가 "구간
                                                    diff로 사용량 계산"을 전제하므로(년 단위 버킷도
                                                    있음) 리셋되는 값을 그대로 쓰면 년 집계가 깨진다.
  vita/tapo/{device_id}/command                    {"command_id", "command"} - bridge가 발행, 이 스크립트가 구독
  vita/tapo/{device_id}/command_result             {"command_id", "status"} - 명령 실행 후 이 스크립트가 발행

필요 환경변수 (.env, .env.example 참고):
  TAPO_USERNAME, TAPO_PASSWORD  - Tapo 앱 로그인 계정 (로컬 인증에도 필요)
  TAPO_DISCOVERY_TARGET         - 검색할 브로드캐스트 주소 (기본 255.255.255.255)
  MQTT_HOST, MQTT_PORT          - 로컬 Mosquitto 주소 (기본 localhost:1883)

주의: Tapo 앱에서 "나 > 제3자 서비스 > 제3자 호환성"을 켜야 한다. 안 켜면
"Unsupported device (encrypt_type='TPAP')" 에러가 나며 접속이 거부된다.

systemd로 상시 실행하는 예시는 SETUP.md 참고.
"""

import asyncio
import json
import os
import time

import aiomqtt
from dotenv import load_dotenv
from tapo import ApiClient, DiscoveryResult

load_dotenv()

TAPO_USERNAME = os.environ["TAPO_USERNAME"]
TAPO_PASSWORD = os.environ["TAPO_PASSWORD"]
DISCOVERY_TARGET = os.environ.get("TAPO_DISCOVERY_TARGET", "255.255.255.255")
MQTT_HOST = os.environ.get("MQTT_HOST", "localhost")
MQTT_PORT = int(os.environ.get("MQTT_PORT", "1883"))

DISCOVERY_INTERVAL_SEC = 30
POLL_INTERVAL_SEC = 3


# device_id -> {"handler": ..., "type": "power_monitor" | "relay"}
known_devices: dict[str, dict] = {}


def _device_id_for(tapo_device_id: str) -> str:
    return f"tapo-{tapo_device_id}"


async def publish_discovered(mqtt: aiomqtt.Client, device_id: str, type_: str, label: str, on: bool):
    # retain=True - bridge가 재시작돼도 다음 검색 주기(최대 30초)를 안 기다리고 바로 알 수 있게.
    await mqtt.publish(
        f"vita/tapo/{device_id}/discovered",
        payload=json.dumps({"type": type_, "label": label, "on": on}),
        retain=True,
    )


async def discover_once(tapo_client: ApiClient, mqtt: aiomqtt.Client):
    """로컬 네트워크에서 Tapo 스마트플러그를 찾아 known_devices에 채우고 발견 사실을 publish한다.
    조명/허브/카메라 등 플러그가 아닌 기종은 이 브릿지의 범위 밖이라 건너뛴다."""
    try:
        async for maybe_result in await tapo_client.discover_devices(DISCOVERY_TARGET):
            try:
                result = maybe_result.get()
            except Exception as err:
                print("검색 응답 파싱 실패(무시하고 계속):", err)
                continue

            match result:
                case DiscoveryResult.PlugEnergyMonitoring(device_info, handler):
                    device_id = _device_id_for(device_info.device_id)
                    is_new = device_id not in known_devices
                    # energy_kwh/last_sample_mono(적산 전력량 상태)는 재검색 때마다 지우면 안 되므로
                    # 기존 값이 있으면 유지하고 handler/type만 최신으로 덮어쓴다.
                    known_devices[device_id] = {
                        **known_devices.get(device_id, {}),
                        "handler": handler,
                        "type": "power_monitor",
                    }
                    if is_new:
                        print(f"새 스마트플러그(전력측정) 발견: {device_id} ({device_info.nickname})")
                    await publish_discovered(
                        mqtt, device_id, "power_monitor", device_info.nickname, device_info.device_on
                    )
                case DiscoveryResult.Plug(device_info, handler):
                    device_id = _device_id_for(device_info.device_id)
                    is_new = device_id not in known_devices
                    known_devices[device_id] = {"handler": handler, "type": "relay"}
                    if is_new:
                        print(f"새 스마트플러그 발견: {device_id} ({device_info.nickname})")
                    await publish_discovered(mqtt, device_id, "relay", device_info.nickname, device_info.device_on)
                case _:
                    pass  # 플러그가 아닌 기종(조명/허브/카메라 등) - 이 브릿지에서는 다루지 않음
    except Exception as err:  # noqa: BLE001 - 검색 한 번 실패해도 다음 주기에 재시도
        print("기기 검색 실패(다음 주기에 재시도):", err)


async def discovery_loop(tapo_client: ApiClient, mqtt: aiomqtt.Client):
    while True:
        await discover_once(tapo_client, mqtt)
        await asyncio.sleep(DISCOVERY_INTERVAL_SEC)


async def poll_power_readings(mqtt: aiomqtt.Client):
    while True:
        now_mono = time.monotonic()
        for device_id, info in list(known_devices.items()):
            if info["type"] != "power_monitor":
                continue
            try:
                power = await info["handler"].get_current_power()

                # 이전 샘플 이후 경과 시간 동안 이 순간 전력이 유지됐다고 보고 사다리꼴 대신
                # 직사각형 적분(순간전력 x 경과시간)으로 kWh를 누적한다 - PZEM의 실측 적산과
                # 달리 근사치지만, 폴링 주기(POLL_INTERVAL_SEC)가 짧아 오차가 작다.
                info.setdefault("energy_kwh", 0.0)
                last_mono = info.get("last_sample_mono")
                if last_mono is not None:
                    elapsed_hours = (now_mono - last_mono) / 3600
                    info["energy_kwh"] += (power.current_power / 1000) * elapsed_hours
                info["last_sample_mono"] = now_mono

                await mqtt.publish(
                    f"vita/tapo/{device_id}/power",
                    payload=json.dumps({"power_w": power.current_power, "energy_kwh": round(info["energy_kwh"], 6)}),
                )
            except Exception as err:  # noqa: BLE001 - 다음 주기에 재시도
                print(f"[{device_id}] 전력 조회 실패(다음 주기에 재시도):", err)
        await asyncio.sleep(POLL_INTERVAL_SEC)


async def handle_commands(mqtt: aiomqtt.Client):
    """tapo_mqtt_bridge.py가 vita/tapo/+/command로 발행한 on/off 명령을 실행하고 결과를 회신한다."""
    await mqtt.subscribe("vita/tapo/+/command")
    async for message in mqtt.messages:
        device_id = str(message.topic).split("/")[2]
        info = known_devices.get(device_id)
        if not info:
            continue  # 아직 검색 전이거나 사라진 기기 - 다음 discovered 갱신 후 재시도됨

        body = json.loads(message.payload)
        try:
            handler = info["handler"]
            if body["command"] == "on":
                await handler.on()
            else:
                await handler.off()
            status = "done"
        except Exception as err:  # noqa: BLE001 - 이 명령만 실패 처리
            print(f"[{device_id}] 명령 실행 실패:", err)
            status = "failed"

        await mqtt.publish(
            f"vita/tapo/{device_id}/command_result",
            payload=json.dumps({"command_id": body["command_id"], "status": status}),
        )


async def main():
    tapo_client = ApiClient(TAPO_USERNAME, TAPO_PASSWORD)

    async with aiomqtt.Client(MQTT_HOST, MQTT_PORT) as mqtt:
        print(f"Tapo MQTT 발행자 시작 - 검색 대상: {DISCOVERY_TARGET}, 브로커: {MQTT_HOST}:{MQTT_PORT}")
        # 첫 검색은 다른 루프가 기기를 찾기 전에 한 번 끝내둔다.
        await discover_once(tapo_client, mqtt)
        await asyncio.gather(
            discovery_loop(tapo_client, mqtt),
            poll_power_readings(mqtt),
            handle_commands(mqtt),
        )


if __name__ == "__main__":
    asyncio.run(main())
