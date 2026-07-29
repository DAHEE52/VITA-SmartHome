def test_mock_register_default_name(client):
    res = client.post("/devices/mock-register", json={})
    assert res.status_code == 201
    body = res.json()
    assert body["label"].startswith("unregistered-")
    assert body["room_id"] is None
    assert body["state"] == "off"
    assert body["type"] == "relay"


def test_mock_register_with_custom_name(client):
    res = client.post("/devices/mock-register", json={"name": "테스트기기"})
    assert res.status_code == 201
    assert res.json()["label"] == "테스트기기"


def test_patch_device_updates_name_and_room(client):
    room = client.post("/rooms", json={"name": "거실"}).json()
    device = client.post("/devices/mock-register", json={}).json()

    res = client.patch(f"/devices/{device['id']}", json={"name": "냉장고", "room_id": room["id"]})
    assert res.status_code == 200
    body = res.json()
    assert body["label"] == "냉장고"
    assert body["room_id"] == room["id"]


def test_patch_device_room_id_null_unassigns(client):
    room = client.post("/rooms", json={"name": "거실"}).json()
    device = client.post("/devices/mock-register", json={}).json()
    client.patch(f"/devices/{device['id']}", json={"room_id": room["id"]})

    res = client.patch(f"/devices/{device['id']}", json={"room_id": None})
    assert res.status_code == 200
    assert res.json()["room_id"] is None


def test_patch_device_without_room_id_leaves_assignment_untouched(client):
    room = client.post("/rooms", json={"name": "거실"}).json()
    device = client.post("/devices/mock-register", json={}).json()
    client.patch(f"/devices/{device['id']}", json={"room_id": room["id"]})

    res = client.patch(f"/devices/{device['id']}", json={"name": "새이름"})
    assert res.status_code == 200
    body = res.json()
    assert body["label"] == "새이름"
    assert body["room_id"] == room["id"]


def test_patch_device_not_found(client):
    res = client.patch("/devices/does-not-exist", json={"name": "x"})
    assert res.status_code == 404


def test_patch_device_room_not_found(client):
    device = client.post("/devices/mock-register", json={}).json()

    res = client.patch(f"/devices/{device['id']}", json={"room_id": 9999})
    assert res.status_code == 404


def test_unassigned_devices_excludes_assigned(client):
    room = client.post("/rooms", json={"name": "거실"}).json()
    unassigned = client.post("/devices/mock-register", json={"name": "미배정기기"}).json()
    assigned = client.post("/devices/mock-register", json={"name": "배정된기기"}).json()
    client.patch(f"/devices/{assigned['id']}", json={"room_id": room["id"]})

    res = client.get("/devices/unassigned")
    assert res.status_code == 200
    ids = [d["id"] for d in res.json()]
    assert unassigned["id"] in ids
    assert assigned["id"] not in ids


def test_latest_power_no_readings(client):
    device = client.post("/devices/mock-register", json={}).json()

    res = client.get(f"/devices/{device['id']}/latest")
    assert res.status_code == 200
    assert res.json() == {"power_w": None, "recorded_at": None}


def test_delete_device_removes_it_from_unassigned_list(client):
    device = client.post("/devices/mock-register", json={"name": "지울기기"}).json()

    res = client.delete(f"/devices/{device['id']}")
    assert res.status_code == 200

    ids = [d["id"] for d in client.get("/devices/unassigned").json()]
    assert device["id"] not in ids


def test_delete_device_not_found(client):
    res = client.delete("/devices/does-not-exist")
    assert res.status_code == 404


def test_delete_device_with_readings_succeeds(client):
    device = client.post("/devices/mock-register", json={}).json()
    headers = {"X-Device-Key": "test-device-key"}
    client.post(
        f"/devices/{device['id']}/readings",
        json={"readings": [{"metric": "power_w", "value": 10.0}]},
        headers=headers,
    )

    res = client.delete(f"/devices/{device['id']}")
    assert res.status_code == 200


def test_latest_power_returns_most_recent_value(client):
    device = client.post("/devices/mock-register", json={}).json()
    headers = {"X-Device-Key": "test-device-key"}

    client.post(
        f"/devices/{device['id']}/readings",
        json={"readings": [{"metric": "power_w", "value": 100.0}]},
        headers=headers,
    )
    client.post(
        f"/devices/{device['id']}/readings",
        json={"readings": [{"metric": "power_w", "value": 142.5}]},
        headers=headers,
    )

    res = client.get(f"/devices/{device['id']}/latest")
    assert res.status_code == 200
    assert res.json()["power_w"] == 142.5
