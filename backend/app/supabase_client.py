from functools import lru_cache

import httpx
from supabase import Client, ClientOptions, create_client

from app.config import settings


@lru_cache
def get_supabase() -> Client:
    # httpx는 서버가 지원하면 자동으로 HTTP/2로 협상하는데, 이 Windows 개발 환경에서는 동시
    # 요청이 몰릴 때 httpcore의 HTTP/2 구현이 WinError 10035(비동기 소켓 작업 미완료)를 던지며
    # 500을 반환하거나, 심하면 uvicorn 프로세스 전체가 응답 불능에 빠지는 문제가 여러 차례
    # 재현됐다. Supabase REST API는 HTTP/1.1로도 완전히 동작하므로 HTTP/1.1로 고정해 문제를 없앤다.
    http_client = httpx.Client(http2=False)
    options = ClientOptions(httpx_client=http_client)
    return create_client(settings.supabase_url, settings.supabase_service_key, options=options)
