import time
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import httpx
from fastapi import APIRouter

from app.config import settings
from app.schemas import WeatherOut

router = APIRouter(tags=["weather"])

KST = ZoneInfo("Asia/Seoul")
# 기상청 공공데이터포털(data.go.kr) "단기예보 조회서비스" - 초단기예보(getUltraSrtFcst).
# 실황(getUltraSrtNcst)에는 하늘상태(SKY)가 없어서(강수형태 PTY만 제공), "지금 하늘상태"를
# 보여주려면 가장 가까운 미래 시각을 예보하는 이 API를 대신 쓴다.
KMA_URL = "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtFcst"

# 서울(종로구 인근) 격자좌표를 임시로 고정해서 쓴다 - 설정 화면의 "집 주소"가 아직 자유 텍스트라
# 실제 좌표로 지오코딩하는 기능이 없다. 나중에 주소 등록이 좌표까지 저장하게 되면 여기를
# app_settings 기반 값으로 바꾸면 된다.
DEFAULT_NX = 60
DEFAULT_NY = 127

SKY_LABELS = {"1": "맑음", "3": "구름많음", "4": "흐림"}
PTY_LABELS = {
    "1": "비",
    "2": "비/눈",
    "3": "눈",
    "4": "소나기",
    "5": "빗방울",
    "6": "빗방울눈날림",
    "7": "눈날림",
}

# 기상청 응답은 시간 단위로만 갱신되고, 앱은 다른 값(온습도 등)을 훨씬 촘촘히 폴링하므로 여기서
# 자체적으로 캐싱해 불필요한 외부 호출(+ 공공데이터포털 일일 호출 한도 소진)을 막는다.
_cache: dict = {"condition": None, "fetched_at": 0.0}
CACHE_TTL_SEC = 600


def _base_date_time(now: datetime) -> tuple[str, str]:
    # 초단기예보는 매시 30분에 생성되고 그 직후부터 조회할 수 있다 - 생성/전파 지연을 감안해
    # 넉넉히 45분 전 시각을 기준으로 가장 최근 30분 슬롯을 고른다.
    adjusted = now - timedelta(minutes=45)
    return adjusted.strftime("%Y%m%d"), adjusted.strftime("%H") + "30"


def _fetch_condition() -> str | None:
    if not settings.kma_api_key:
        return None

    base_date, base_time = _base_date_time(datetime.now(KST))

    try:
        res = httpx.get(
            KMA_URL,
            params={
                "serviceKey": settings.kma_api_key,
                "pageNo": 1,
                "numOfRows": 100,
                "dataType": "JSON",
                "base_date": base_date,
                "base_time": base_time,
                "nx": DEFAULT_NX,
                "ny": DEFAULT_NY,
            },
            timeout=5.0,
        )
        res.raise_for_status()
        items = res.json()["response"]["body"]["items"]["item"]
    except Exception:
        # 키 오류, 네트워크 실패, 응답 형식 이상 등 - 어떤 이유든 실패하면 그냥 "값 없음"으로 처리
        # (프론트가 "-"로 표시하는 기존 온습도 조회 실패 패턴과 동일하게 맞춘다).
        return None

    # fcstTime(HHmm)별로 카테고리 값을 모은 뒤, 가장 가까운(=가장 이른) 시각을 "지금"으로 본다.
    by_fcst_time: dict[str, dict[str, str]] = {}
    for item in items:
        by_fcst_time.setdefault(item["fcstTime"], {})[item["category"]] = item["fcstValue"]
    if not by_fcst_time:
        return None
    nearest = by_fcst_time[min(by_fcst_time.keys())]

    pty = nearest.get("PTY", "0")
    if pty != "0":
        return PTY_LABELS.get(pty)
    return SKY_LABELS.get(nearest.get("SKY", ""))


@router.get("/weather/current", response_model=WeatherOut)
def get_current_weather():
    now = time.time()
    if now - _cache["fetched_at"] > CACHE_TTL_SEC:
        _cache["condition"] = _fetch_condition()
        _cache["fetched_at"] = now
    return WeatherOut(condition=_cache["condition"])
