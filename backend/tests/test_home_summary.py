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
