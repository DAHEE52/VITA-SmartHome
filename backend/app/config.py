from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Supabase 프로젝트 설정법: SETUP.md 참고
    supabase_url: str
    supabase_service_key: str
    # 기상청 공공데이터포털(data.go.kr) "단기예보 조회서비스" 인증키 - 없으면 /weather/current가
    # condition=null을 반환하고, 앱은 기존처럼 "-"로 표시한다(SETUP.md 발급 방법 참고).
    kma_api_key: Optional[str] = None
    # DEVICE_API_KEY는 여기서 안 읽는다 - app/deps.py의 verify_device_key가 기기별 개별 키를
    # DB(devices.device_key)에서 직접 확인하기 때문. .env의 DEVICE_API_KEY는 이제 "새 기기가
    # 처음 등록할 때 들고 오는 초기 키"로서 firmware config.h 쪽에서만 의미가 있다.

    # .env 하나를 tapo_mqtt_publisher.py/tapo_mqtt_bridge.py(TAPO_*, MQTT_*, API_BASE_URL 등)와
    # 공유해서 쓰는 배포가 흔하다(예: 라즈베리파이 한 대에서 백엔드+Tapo 브릿지를 같이 돌리는 경우).
    # extra="ignore"가 없으면 이 클래스에 선언 안 된 키가 .env에 하나만 있어도 서버가 아예 안 뜬다 -
    # 실제로 TAPO_EMAIL/PASSWORD, 이후 TAPO_*/MQTT_* 키들 때문에 두 번 겪었던 장애.
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
