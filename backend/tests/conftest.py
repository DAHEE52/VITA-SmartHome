import os
from datetime import datetime, timezone
from unittest.mock import patch

import pytest

# Settings()는 import 시점에 env var를 요구하므로, app 모듈을 import하기 전에
# 더미 값을 채워둔다 (실제 backend/.env를 덮어쓰지 않음 — 프로세스 환경변수만 설정).
os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "test-service-key")
os.environ.setdefault("DEVICE_API_KEY", "test-device-key")

from fastapi.testclient import TestClient  # noqa: E402

from API_main import app  # noqa: E402


class _Result:
    def __init__(self, data):
        self.data = data


class _QueryBuilder:
    """supabase-py의 fluent 쿼리 빌더를 라우터가 실제로 쓰는 범위만큼만 흉내내는 인메모리 더블."""

    def __init__(self, store: dict, table: str):
        self._store = store
        self._table = table
        self._op = None
        self._payload = None
        self._filters: list[tuple[str, str, object]] = []
        self._order = None
        self._limit = None

    def select(self, *_args, **_kwargs):
        self._op = self._op or "select"
        return self

    def insert(self, payload):
        self._op = "insert"
        self._payload = payload if isinstance(payload, list) else [payload]
        return self

    def update(self, payload):
        self._op = "update"
        self._payload = payload
        return self

    def delete(self):
        self._op = "delete"
        return self

    def eq(self, col, val):
        self._filters.append(("eq", col, val))
        return self

    def in_(self, col, vals):
        self._filters.append(("in", col, vals))
        return self

    def is_(self, col, val):
        # supabase-py의 is_(col, "null")만 라우터에서 쓰므로 그 경우만 지원한다.
        self._filters.append(("eq", col, None if val == "null" else val))
        return self

    def like(self, col, pattern):
        # 라우터가 접두사 매칭(예: "tapo-%")에만 like를 쓰므로 그 형태만 지원한다.
        self._filters.append(("like", col, pattern))
        return self

    def order(self, col, desc=False):
        self._order = (col, desc)
        return self

    def limit(self, n):
        self._limit = n
        return self

    def _matches(self, row):
        for kind, col, val in self._filters:
            if kind == "eq" and row.get(col) != val:
                return False
            if kind == "in" and row.get(col) not in val:
                return False
            if kind == "like":
                # SQL LIKE의 %를 정규식 .*로만 바꿔서 지원(현재 쓰이는 접두사 패턴 기준으로 충분).
                # %로 먼저 나눠서 각 조각을 이스케이프해야 한다 - re.escape는 %를 이스케이프하지
                # 않으므로 이스케이프 후에 치환하면 리터럴 "%"를 찾다가 매칭에 실패한다.
                import re

                parts = val.split("%")
                regex = "^" + ".*".join(re.escape(p) for p in parts) + "$"
                if not re.match(regex, str(row.get(col, ""))):
                    return False
        return True

    def _compute_latest_sensor_readings(self):
        """실제 DB의 latest_sensor_readings 뷰(device_id/metric별 DISTINCT ON 최신값)를 흉내낸다 -
        sensor_readings 더미 데이터에서 (device_id, metric)별로 recorded_at이 가장 큰 행만 남긴다."""
        source = self._store.get("sensor_readings", [])
        latest: dict[tuple, dict] = {}
        for row in source:
            key = (row.get("device_id"), row.get("metric"))
            current = latest.get(key)
            if current is None or row["recorded_at"] > current["recorded_at"]:
                latest[key] = row
        return list(latest.values())

    def execute(self):
        rows = self._store.setdefault(self._table, [])

        if self._op in (None, "select"):
            source_rows = self._compute_latest_sensor_readings() if self._table == "latest_sensor_readings" else rows
            result = [dict(r) for r in source_rows if self._matches(r)]
            if self._order:
                col, desc = self._order
                result.sort(key=lambda r: r[col], reverse=desc)
            if self._limit is not None:
                result = result[: self._limit]
            return _Result(result)

        if self._op == "insert":
            created = []
            for item in self._payload:
                row = dict(item)
                if row.get("id") is None:
                    existing_ids = [r["id"] for r in rows if isinstance(r.get("id"), int)]
                    row["id"] = max(existing_ids, default=0) + 1
                # 실제 스키마의 `default now()` 컬럼들을 흉내낸다 - 라우터가 값을 안 넣고 insert하면
                # DB가 채워주는 걸 그대로 재현해야 order("recorded_at"/"created_at") 쿼리가 동작함.
                for ts_col in ("recorded_at", "created_at"):
                    if ts_col not in row:
                        row[ts_col] = datetime.now(timezone.utc).isoformat()
                rows.append(row)
                created.append(dict(row))
            return _Result(created)

        if self._op == "update":
            updated = []
            for r in rows:
                if self._matches(r):
                    r.update(self._payload)
                    updated.append(dict(r))
            return _Result(updated)

        if self._op == "delete":
            deleted = [dict(r) for r in rows if self._matches(r)]
            rows[:] = [r for r in rows if not self._matches(r)]
            return _Result(deleted)

        raise AssertionError(f"unsupported fake supabase op: {self._op}")


class FakeSupabase:
    def __init__(self):
        self._data: dict[str, list[dict]] = {}

    def table(self, name: str) -> _QueryBuilder:
        return _QueryBuilder(self._data, name)


@pytest.fixture
def fake_supabase():
    return FakeSupabase()


@pytest.fixture
def client(fake_supabase):
    with patch("app.routers.rooms.get_supabase", return_value=fake_supabase), patch(
        "app.routers.devices.get_supabase", return_value=fake_supabase
    ):
        yield TestClient(app)
