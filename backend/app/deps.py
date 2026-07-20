from fastapi import Header, HTTPException

from app.config import settings


def require_device_key(x_device_key: str = Header(...)) -> None:
    if x_device_key != settings.device_api_key:
        raise HTTPException(status_code=401, detail="invalid device key")
