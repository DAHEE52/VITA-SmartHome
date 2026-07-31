from datetime import datetime, timedelta, timezone


def _insert_device(fake_supabase, device_id, type_="power_monitor", label=None):
    fake_supabase.table("devices").insert(
        {"id": device_id, "room_id": None, "type": type_, "label": label or device_id, "state": "off"}
    ).execute()


def _insert_reading(fake_supabase, device_id, metric, value, days_ago):
    recorded_at = (datetime.now(timezone.utc) - timedelta(days=days_ago)).isoformat()
    fake_supabase.table("sensor_readings").insert(
        {"device_id": device_id, "metric": metric, "value": value, "recorded_at": recorded_at}
    ).execute()


def test_usage_diffs_monotonic_cumulative_readings(client, fake_supabase):
    """PZEM처럼 리셋 없이 계속 증가하는 적산값은 그냥 인접 구간을 빼면 된다."""
    _insert_device(fake_supabase, "pzem-1")
    _insert_reading(fake_supabase, "pzem-1", "energy_kwh", 10.0, days_ago=2)
    _insert_reading(fake_supabase, "pzem-1", "energy_kwh", 12.5, days_ago=1)

    res = client.get("/energy/usage?period=day")
    assert res.status_code == 200
    points = {p["x_label"]: p["value"] for p in res.json()["series"][0]["points"]}
    assert sorted(points.values()) == [0.0, 2.5]


def test_usage_does_not_go_negative_when_counter_resets(client, fake_supabase):
    """Tapo MQTT 브릿지의 energy_kwh는 프로세스 재시작 시 0부터 다시 쌓이고, PZEM도 기기
    재부팅으로 카운터가 리셋될 수 있다. 리셋 직후 값이 이전 값보다 작아지면, 그 구간 사용량은
    (음수가 아니라) 리셋 이후 다시 쌓인 값 그대로여야 한다."""
    _insert_device(fake_supabase, "tapo-1")
    _insert_reading(fake_supabase, "tapo-1", "energy_kwh", 5.0, days_ago=3)
    # 브릿지 재시작 - 리셋되어 다시 0부터 쌓임
    _insert_reading(fake_supabase, "tapo-1", "energy_kwh", 0.8, days_ago=2)
    _insert_reading(fake_supabase, "tapo-1", "energy_kwh", 1.6, days_ago=1)

    res = client.get("/energy/usage?period=day")
    assert res.status_code == 200
    points = {p["x_label"]: p["value"] for p in res.json()["series"][0]["points"]}

    assert all(v >= 0 for v in points.values()), points
    # 리셋 구간은 음수 대신 리셋 이후 값(0.8) 그대로, 그다음 구간은 정상적으로 차분(1.6-0.8=0.8)
    assert sorted(points.values()) == [0.0, 0.8, 0.8]
