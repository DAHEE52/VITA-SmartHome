from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Supabase 프로젝트 설정법: SETUP.md 참고
    supabase_url: str
    supabase_service_key: str
    # ESP32 펌웨어 쪽 config.h의 DEVICE_KEY와 동일한 값이어야 함
    device_api_key: str

    class Config:
        env_file = ".env"


settings = Settings()
