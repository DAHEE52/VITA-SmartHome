from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Supabase 프로젝트 설정법: SETUP.md 참고
    supabase_url: str
    supabase_service_key: str
    # ESP32 펌웨어 쪽 config.h의 DEVICE_KEY와 동일한 값이어야 함
    device_api_key: str

    class Config:
        env_file = ".env"
        extra = "ignore"  # tapo_power_bridge.py 등 다른 스크립트가 같은 .env를 공유하므로,
        # Settings에 없는 키(TAPO_* 등)가 있어도 에러 내지 않고 무시한다.


settings = Settings()
