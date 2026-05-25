"""
Parametrized 401 tests: every formerly-open endpoint must reject requests
that carry no session cookie. db_session overrides get_db so FastAPI can
resolve the dependency; no session cookie means get_current_user raises
401 before any DB query runs.
"""

import pytest
from httpx import ASGITransport, AsyncClient

from app.database import get_db
from app.main import app


@pytest.fixture(autouse=False)
def db_override(db_session):
    async def _override():
        yield db_session

    app.dependency_overrides[get_db] = _override
    yield
    app.dependency_overrides.pop(get_db, None)


# (HTTP method, path)  — one representative per formerly-open file/group
PROTECTED = [
    # sync (vuln 5)
    ("GET", "/api/sync/status"),
    ("PATCH", "/api/sync/settings"),
    ("POST", "/api/sync/backfill-bodies"),
    ("POST", "/api/alerts/clear"),
    # emails
    ("GET", "/api/emails"),
    ("POST", "/api/emails/retrain"),
    ("POST", "/api/emails/reclassify"),
    # review
    ("GET", "/api/review"),
    ("POST", "/api/review/batch"),
    ("POST", "/api/review/reprocess-all"),
    # transactions
    ("GET", "/api/transactions"),
    ("GET", "/api/search"),
    # stats
    ("GET", "/api/stats/summary"),
    ("GET", "/api/stats/health"),
    ("GET", "/api/stats/category-breakdown"),
    ("GET", "/api/stats/monthly-trend"),
    ("GET", "/api/stats/top-merchants"),
    ("GET", "/api/stats/income-vs-expense"),
    # budgets
    ("GET", "/api/budgets"),
    ("POST", "/api/budgets"),
    # debts
    ("GET", "/api/debts"),
    ("POST", "/api/debts"),
    # recurring
    ("GET", "/api/recurring"),
    ("POST", "/api/recurring"),
    # rules
    ("GET", "/api/rules"),
    ("POST", "/api/rules"),
    # duplicates
    ("GET", "/api/duplicates"),
    # admin (vuln 2)
    ("POST", "/api/admin/fetch-preview"),
    ("POST", "/api/admin/classify-test"),
    # settings / account
    ("PATCH", "/api/account/settings"),
    ("GET", "/api/account/categories"),
    ("POST", "/api/account/categories"),
    # auth self-service (require valid session)
    ("GET", "/api/auth/me"),
    ("POST", "/api/auth/logout"),
    ("GET", "/api/auth/allowlist"),
    ("POST", "/api/auth/allowlist"),
    ("POST", "/api/auth/claim-seed-data"),
]


@pytest.mark.asyncio
@pytest.mark.parametrize("method,path", PROTECTED)
async def test_endpoint_requires_auth(db_override, method, path):
    """No session cookie → 401 from get_current_user dependency."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.request(method, path, json={})
    assert resp.status_code == 401, f"{method} {path} returned {resp.status_code} — expected 401"
