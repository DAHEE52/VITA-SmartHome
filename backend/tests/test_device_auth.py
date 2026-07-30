def _register(client, device_id, key, type_="env_sensor"):
    return client.post(
        "/devices/register",
        json={"device_id": device_id, "type": type_, "label": "테스트"},
        headers={"X-Device-Key": key},
    )


def test_new_device_binds_to_whatever_key_it_first_presents(client):
    res = _register(client, "dev-1", "key-a")
    assert res.status_code == 200


def test_second_register_with_same_key_succeeds(client):
    _register(client, "dev-1", "key-a")
    res = _register(client, "dev-1", "key-a")
    assert res.status_code == 200


def test_second_register_with_different_key_is_rejected(client):
    """기기 하나가 탈취돼도 그 키로 다른 기기(여기선 자기 자신조차)를 사칭할 수 없어야 한다 -
    한 번 바인딩된 기기는 다른 키로는 더 이상 인증되지 않는다."""
    _register(client, "dev-1", "key-a")
    res = _register(client, "dev-1", "key-b")
    assert res.status_code == 401


def test_different_devices_can_share_the_same_key_value_independently(client):
    """여러 기기가 같은 초기 키(예: firmware config.h.example 기본값)로 처음 등록하는 건
    문제없다 - 바인딩은 기기별로 독립적이라 서로 간섭하지 않는다."""
    assert _register(client, "dev-1", "shared-initial-key").status_code == 200
    assert _register(client, "dev-2", "shared-initial-key").status_code == 200

    # dev-1을 다른 키로 흉내내려 하면 실패해야 함(dev-2와 같은 키를 썼다는 사실과 무관).
    res = _register(client, "dev-1", "attacker-key")
    assert res.status_code == 401


def test_wrong_key_rejected_on_readings_endpoint(client):
    _register(client, "dev-1", "key-a")
    res = client.post(
        "/devices/dev-1/readings",
        json={"readings": [{"metric": "power_w", "value": 1.0}]},
        headers={"X-Device-Key": "wrong-key"},
    )
    assert res.status_code == 401


def test_correct_key_accepted_on_readings_endpoint(client):
    _register(client, "dev-1", "key-a")
    res = client.post(
        "/devices/dev-1/readings",
        json={"readings": [{"metric": "power_w", "value": 1.0}]},
        headers={"X-Device-Key": "key-a"},
    )
    assert res.status_code == 200


def test_legacy_device_without_stored_key_binds_on_first_authenticated_call(client, fake_supabase):
    """이 기능 도입 전에 만들어진 기기 행(device_key 컬럼이 비어있음)은 다음 요청의 키로
    바인딩된다 - 마이그레이션 없이도 기존 기기가 자연스럽게 개별 키 체계로 넘어온다."""
    fake_supabase.table("devices").insert(
        {"id": "legacy-1", "room_id": None, "type": "relay", "label": "legacy", "state": "off"}
    ).execute()

    res = client.get("/devices/legacy-1/commands/pending", headers={"X-Device-Key": "new-key"})
    assert res.status_code == 200

    # 바인딩된 뒤에는 다른 키로 접근 못 함.
    res = client.get("/devices/legacy-1/commands/pending", headers={"X-Device-Key": "different-key"})
    assert res.status_code == 401


def test_reregistering_after_delete_binds_new_key(client):
    """분실/유출 의심 등으로 키를 재발급하고 싶으면 기기를 삭제하고 다시 등록시키면 된다."""
    _register(client, "dev-1", "old-key")
    assert client.delete("/devices/dev-1").status_code == 200

    res = _register(client, "dev-1", "new-key")
    assert res.status_code == 200

    # 이제는 새 키만 통함.
    assert _register(client, "dev-1", "old-key").status_code == 401
