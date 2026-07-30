from datetime import datetime, timedelta, timezone


def _insert_reading(fake_supabase, device_id, metric, value, minutes_ago):
    recorded_at = (datetime.now(timezone.utc) - timedelta(minutes=minutes_ago)).isoformat()
    fake_supabase.table("sensor_readings").insert(
        {"device_id": device_id, "metric": metric, "value": value, "recorded_at": recorded_at}
    ).execute()


def test_presence_none_when_no_camera_and_no_motion(client):
    res = client.get("/home/summary")
    assert res.status_code == 200
    assert res.json()["presence"] is None


def test_presence_true_from_recent_motion_alone(client, fake_supabase):
    _insert_reading(fake_supabase, "cam-1", "motion", 1, minutes_ago=2)

    res = client.get("/home/summary")
    assert res.json()["presence"] is True


def test_presence_false_when_camera_empty_and_no_recent_motion(client, fake_supabase):
    _insert_reading(fake_supabase, "cam-1", "presence", 0, minutes_ago=1)

    res = client.get("/home/summary")
    assert res.json()["presence"] is False


def test_recent_motion_overrides_camera_empty(client, fake_supabase):
    _insert_reading(fake_supabase, "cam-1", "presence", 0, minutes_ago=1)
    _insert_reading(fake_supabase, "pir-1", "motion", 1, minutes_ago=1)

    res = client.get("/home/summary")
    assert res.json()["presence"] is True


def test_old_motion_does_not_override_camera_empty(client, fake_supabase):
    _insert_reading(fake_supabase, "cam-1", "presence", 0, minutes_ago=1)
    _insert_reading(fake_supabase, "pir-1", "motion", 1, minutes_ago=30)

    res = client.get("/home/summary")
    assert res.json()["presence"] is False


def test_camera_occupied_true_regardless_of_motion(client, fake_supabase):
    _insert_reading(fake_supabase, "cam-1", "presence", 1, minutes_ago=1)

    res = client.get("/home/summary")
    assert res.json()["presence"] is True


def test_quiet_device_not_dropped_when_many_devices_push_frequently(client, fake_supabase):
    """센서(기기) 수가 많아져도 각 기기의 최신값이 전부 반영돼야 한다.
    예전 구현은 "recorded_at 기준 최근 200행"만 보고 기기별 첫 값을 취했는데, 자주 push하는
    기기가 많아지면 드물게 push하는 기기의 값이 그 200행 밖으로 밀려나 통째로 누락됐다.
    (예: 수다스러운 기기 하나가 250번 push하면, 가끔 push하는 기기의 값은 상위 200행에 못 들어감)"""
    for i in range(250):
        _insert_reading(fake_supabase, "chatty-device", "temperature", 30.0, minutes_ago=i * 0.1)
    # 조용한 기기는 훨씬 예전에 딱 한 번만 값을 보냈다 - 여전히 반영돼야 한다.
    _insert_reading(fake_supabase, "quiet-device", "temperature", 10.0, minutes_ago=500)

    res = client.get("/home/summary")
    # 두 기기의 최신값이 둘 다 평균에 들어가야 함: (30.0 + 10.0) / 2 = 20.0
    assert res.json()["temperature"] == 20.0
