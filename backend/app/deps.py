from fastapi import HTTPException

from app.supabase_client import get_supabase


def verify_device_key(device_id: str, x_device_key: str) -> None:
    """기기별 개별 인증 키 확인 (trust-on-first-use).

    예전에는 모든 기기가 같은 DEVICE_API_KEY 하나를 공유했다 - 기기 하나만 물리적으로 탈취돼도
    그 키로 다른 모든 기기인 척 가짜 값을 주입하거나 릴레이를 조작할 수 있는 문제가 있었다.
    지금은 기기(devices.id)가 아직 DB에 없거나 device_key가 비어있으면(신규 기기, 또는 이
    기능 도입 전 기존 행) 지금 보낸 키를 그 기기의 키로 저장하고 통과시킨다 - 이후부터는 정확히
    그 키만 통한다. 기기 키를 재발급하고 싶으면(분실/유출 의심 등) DELETE /devices/{device_id}로
    그 기기 행을 지운 뒤 다시 부팅시키면 새로 보낸 키로 다시 바인딩된다.
    """
    supabase = get_supabase()
    existing = supabase.table("devices").select("id, device_key").eq("id", device_id).execute()
    if not existing.data:
        return  # 완전히 새 기기 - register_device가 이 요청의 키를 device_key로 저장하며 확정한다

    stored_key = existing.data[0].get("device_key")
    if stored_key is None:
        supabase.table("devices").update({"device_key": x_device_key}).eq("id", device_id).execute()
        return

    if x_device_key != stored_key:
        raise HTTPException(status_code=401, detail="invalid device key")
