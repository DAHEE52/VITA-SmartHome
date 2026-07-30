from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Supabase 프로젝트 설정법: SETUP.md 참고
    supabase_url: str
    supabase_service_key: str
    # ESP32 펌웨어 쪽 config.h의 DEVICE_KEY와 동일한 값이어야 함
    device_api_key: str

    # .env 하나를 tapo_mqtt_publisher.py/tapo_mqtt_bridge.py(TAPO_*, MQTT_*, API_BASE_URL 등)와
    # 공유해서 쓰는 배포가 흔하다(예: 라즈베리파이 한 대에서 백엔드+Tapo 브릿지를 같이 돌리는 경우).
    # extra="ignore"가 없으면 이 클래스에 선언 안 된 키가 .env에 하나만 있어도 서버가 아예 안 뜬다 -
    # 실제로 TAPO_EMAIL/PASSWORD, 이후 TAPO_*/MQTT_* 키들 때문에 두 번 겪었던 장애.
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
