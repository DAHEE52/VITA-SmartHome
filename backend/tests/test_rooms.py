def _register_mock_device(client, name=None):
    body = {"name": name} if name else {}
    res = client.post("/devices/mock-register", json=body)
    assert res.status_code == 201
    return res.json()


def test_create_room(client):
    res = client.post("/rooms", json={"name": "거실"})
    assert res.status_code == 201
    body = res.json()
    assert body["name"] == "거실"
    assert isinstance(body["id"], int)


def test_list_rooms_includes_assigned_devices(client):
    room = client.post("/rooms", json={"name": "거실"}).json()
    device = _register_mock_device(client, "에어컨")
    client.patch(f"/devices/{device['id']}", json={"room_id": room["id"]})

    res = client.get("/rooms")
    assert res.status_code == 200
    rooms = res.json()
    assert len(rooms) == 1
    assert rooms[0]["id"] == room["id"]
    assert len(rooms[0]["devices"]) == 1
    assert rooms[0]["devices"][0]["id"] == device["id"]


def test_list_rooms_shows_empty_room_with_no_devices(client):
    client.post("/rooms", json={"name": "안방"})

    res = client.get("/rooms")
    assert res.status_code == 200
    rooms = res.json()
    assert len(rooms) == 1
    assert rooms[0]["devices"] == []


def test_update_room_name(client):
    room = client.post("/rooms", json={"name": "거실"}).json()

    res = client.patch(f"/rooms/{room['id']}", json={"name": "안방"})
    assert res.status_code == 200
    assert res.json() == {"id": room["id"], "name": "안방"}


def test_update_room_not_found(client):
    res = client.patch("/rooms/9999", json={"name": "안방"})
    assert res.status_code == 404


def test_delete_room_unassigns_devices_instead_of_deleting_them(client):
    room = client.post("/rooms", json={"name": "거실"}).json()
    device = _register_mock_device(client, "에어컨")
    client.patch(f"/devices/{device['id']}", json={"room_id": room["id"]})

    res = client.delete(f"/rooms/{room['id']}")
    assert res.status_code == 200

    # 방은 삭제됨
    assert client.get("/rooms").json() == []

    # 하지만 기기 자체는 남아있고 미배정 상태로 돌아감
    patched = client.patch(f"/devices/{device['id']}", json={})
    assert patched.status_code == 200
    assert patched.json()["room_id"] is None


def test_delete_room_not_found(client):
    res = client.delete("/rooms/9999")
    assert res.status_code == 404


def test_rooms_status_groups_by_assigned_room_and_ignores_unassigned(client):
    room = client.post("/rooms", json={"name": "거실"}).json()
    assigned = _register_mock_device(client, "에어컨")
    client.patch(f"/devices/{assigned['id']}", json={"room_id": room["id"]})
    client.post(f"/devices/{assigned['id']}/control", json={"command": "on"})

    _register_mock_device(client, "미배정기기")  # room_id 없음

    res = client.get("/rooms/status")
    assert res.status_code == 200
    data = res.json()
    assert len(data) == 1
    assert data[0]["room"] == "거실"
    assert data[0]["active"] is True
    assert len(data[0]["devices"]) == 1
    assert data[0]["devices"][0]["label"] == "에어컨"
