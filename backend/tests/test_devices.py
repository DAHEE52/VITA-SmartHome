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
