"""데모/시연용 데이터를 Supabase에 채워 넣는 스크립트.

실기기가 아직 없을 때 Main/SmartHomeControl/EnergyUsage 화면이 보여줄
방/기기/센서값/전력 사용량을 미리 만들어둔다. 여러 번 실행해도 안전
(devices는 upsert, sensor_readings는 매번 새로 쌓임 - 데이터를 더 채우고
싶을 때 그냥 다시 실행하면 된다).

실행: backend 폴더에서 `venv/Scripts/python seed_demo.py`
"""

import random
from datetime import datetime, timedelta, timezone

from app.supabase_client import get_supabase

supabase = get_supabase()

ROOMS = {
    "거실": {
        "env": ("living-env-01", "거실 온습도 센서"),
        "power": ("living-power-01", "거실 전력 측정"),
        "relay": ("living-relay-01", "거실 기기 제어", "on"),
        "temp_range": (23.0, 26.0),
        "humidity_range": (45.0, 60.0),
        "daily_kwh": (3.0, 6.0),
    },
    "침실": {
        "env": ("bedroom-env-01", "침실 온습도 센서"),
        "relay": ("bedroom-relay-01", "침실 기기 제어", "off"),
        "temp_range": (21.0, 24.0),
        "humidity_range": (40.0, 55.0),
    },
    "주방": {
        "env": ("kitchen-env-01", "주방 온습도 센서"),
        "power": ("kitchen-power-01", "주방 전력 측정"),
        "relay": ("kitchen-relay-01", "주방 기기 제어", "on"),
        "temp_range": (22.0, 27.0),
        "humidity_range": (50.0, 65.0),
        "daily_kwh": (1.5, 3.5),
    },
    "화장실": {
        "env": ("bathroom-env-01", "화장실 온습도 센서"),
        "relay": ("bathroom-relay-01", "화장실 기기 제어", "off"),
        "temp_range": (20.0, 23.0),
        "humidity_range": (55.0, 75.0),
    },
}

now = datetime.now(timezone.utc)


def upsert_device(device_id: str, room: str, dtype: str, label: str, state: str) -> None:
    supabase.table("devices").upsert(
        {
            "id": device_id,
            "room": room,
            "type": dtype,
            "label": label,
            "state": state,
            "last_seen_at": now.isoformat(),
        }
    ).execute()


devices_created = 0
readings_created = 0

for room, cfg in ROOMS.items():
    env_id, env_label = cfg["env"]
    upsert_device(env_id, room, "env_sensor", env_label, "off")
    devices_created += 1

    relay_id, relay_label, relay_state = cfg["relay"]
    upsert_device(relay_id, room, "relay", relay_label, relay_state)
    devices_created += 1

    if "power" in cfg:
        power_id, power_label = cfg["power"]
        upsert_device(power_id, room, "power_monitor", power_label, "off")
        devices_created += 1

    # 최근 48시간, 1시간 간격 온습도 데이터 (완만한 랜덤워크)
    temp = random.uniform(*cfg["temp_range"])
    humidity = random.uniform(*cfg["humidity_range"])
    rows = []
    for hours_ago in range(48, -1, -1):
        temp += random.uniform(-0.4, 0.4)
        temp = min(max(temp, cfg["temp_range"][0] - 1), cfg["temp_range"][1] + 1)
        humidity += random.uniform(-1.5, 1.5)
        humidity = min(max(humidity, cfg["humidity_range"][0] - 5), cfg["humidity_range"][1] + 5)
        recorded_at = (now - timedelta(hours=hours_ago)).isoformat()
        rows.append({"device_id": env_id, "metric": "temperature", "value": round(temp, 1), "recorded_at": recorded_at})
        rows.append({"device_id": env_id, "metric": "humidity", "value": round(humidity, 1), "recorded_at": recorded_at})
    supabase.table("sensor_readings").insert(rows).execute()
    readings_created += len(rows)

    # 최근 30일, 하루 1포인트 누적 전력량(kWh) - PZEM 적산 방식 그대로 흉내
    if "power" in cfg:
        power_id, _ = cfg["power"]
        cumulative = 0.0
        rows = []
        for days_ago in range(30, -1, -1):
            cumulative += random.uniform(*cfg["daily_kwh"])
            recorded_at = (now - timedelta(days=days_ago)).isoformat()
            rows.append({"device_id": power_id, "metric": "energy_kwh", "value": round(cumulative, 2), "recorded_at": recorded_at})
        supabase.table("sensor_readings").insert(rows).execute()
        readings_created += len(rows)

print(f"devices upserted: {devices_created}, sensor_readings inserted: {readings_created}")
print(f"rooms: {list(ROOMS.keys())}")
