from datetime import UTC
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy.ext.asyncio import AsyncSession


@pytest.fixture(autouse=True)
def override_auth():
    """Override get_current_user for all review tests."""
    import uuid

    from app.auth_deps import get_current_user
    from app.main import app
    from app.models import User

    fake_user = MagicMock(spec=User)
    fake_user.id = str(uuid.uuid4())
    fake_user.email = "review-test@example.com"

    async def _override():
        return fake_user

    app.dependency_overrides[get_current_user] = _override
    yield
    app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_get_review_queue_domain_count_no_n1():
    """
    3 transactions from the same sender domain → each should report domain_count=2.
    db.execute must be called exactly 2 times (main query + aggregate), not 4.
    """
    import os

    from httpx import ASGITransport, AsyncClient

    os.environ["TESTING"] = "1"
    import uuid
    from datetime import datetime

    from app.database import get_db
    from app.main import app
    from app.models import Email, Transaction, TransactionStatus

    def _make_pair(domain: str, txn_id: str):
        e = MagicMock(spec=Email)
        e.id = str(uuid.uuid4())
        e.sender = f"noreply@{domain}"
        e.sender_domain = domain
        e.subject = "Debit alert"
        e.received_at = datetime(2026, 4, 1, tzinfo=UTC)
        e.body_snippet = "Rs.100 debited"
        e.gmail_link = f"https://mail.google.com/mail/u/0/#inbox/{e.id}"

        t = MagicMock(spec=Transaction)
        t.id = txn_id
        t.label = "expense"
        t.amount = 100.0
        t.merchant = "TestMerchant"
        t.category = "Shopping"
        t.confidence = 0.9
        t.status = TransactionStatus.needs_review.value
        return t, e

    tx1, em1 = _make_pair("swiggy.in", "tx-1")
    tx2, em2 = _make_pair("swiggy.in", "tx-2")
    tx3, em3 = _make_pair("swiggy.in", "tx-3")

    review_rows = [(tx1, em1), (tx2, em2), (tx3, em3)]

    agg_row = MagicMock()
    agg_row.sender_domain = "swiggy.in"
    agg_row.cnt = 3

    execute_call_count = 0

    async def override_get_db():
        db = AsyncMock(spec=AsyncSession)

        def execute_side_effect(query):
            nonlocal execute_call_count
            execute_call_count += 1
            result = MagicMock()
            if execute_call_count == 1:
                result.all.return_value = review_rows
            else:
                result.all.return_value = [agg_row]
            return result

        db.execute = AsyncMock(side_effect=execute_side_effect)
        yield db

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.get("/api/review")
        assert r.status_code == 200
        data = r.json()
        assert len(data) == 3
        for item in data:
            assert item["domain_count"] == 2, f"expected 2, got {item['domain_count']}"
        assert execute_call_count == 2, f"expected 2 db.execute calls, got {execute_call_count}"
    finally:
        app.dependency_overrides.pop(get_db, None)
