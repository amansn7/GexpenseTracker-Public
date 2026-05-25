import pytest
from httpx import ASGITransport, AsyncClient

from app.database import get_db
from app.main import app


@pytest.mark.asyncio
async def test_auth_status_returns_authenticated():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/auth/status")
    assert resp.status_code == 200
    assert resp.json() == {"authenticated": True}


@pytest.mark.asyncio
async def test_get_transactions_empty(db_session, mock_user):
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/transactions")
        assert resp.status_code == 200
        assert resp.json() == {"items": [], "total": 0, "offset": 0, "limit": 50}
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_get_review_empty(db_session, mock_user):
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/review")
        assert resp.status_code == 200
        assert resp.json() == []
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_patch_transaction_not_found(db_session, mock_user):
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.patch(
                "/api/transactions/00000000-0000-0000-0000-000000000000", json={"label": "income"}
            )
        assert resp.status_code == 404
    finally:
        app.dependency_overrides.pop(get_db, None)


from datetime import UTC
from datetime import date as _date_cls


@pytest.mark.asyncio
async def test_effective_month_no_shift():
    from app.api.stats import _effective_month

    d = _date_cls(2026, 3, 15)
    assert _effective_month(d, "income", "axis bank") == _date_cls(2026, 3, 1)


@pytest.mark.asyncio
async def test_effective_month_shifts_axis_day_25():
    from app.api.stats import _effective_month

    d = _date_cls(2026, 2, 28)
    assert _effective_month(d, "income", "AXIS BANK SALARY") == _date_cls(2026, 3, 1)


@pytest.mark.asyncio
async def test_effective_month_no_shift_non_axis():
    from app.api.stats import _effective_month

    d = _date_cls(2026, 2, 28)
    assert _effective_month(d, "income", "HDFC BANK") == _date_cls(2026, 2, 1)


@pytest.mark.asyncio
async def test_effective_month_no_shift_expense():
    from app.api.stats import _effective_month

    d = _date_cls(2026, 2, 28)
    assert _effective_month(d, "expense", "AXIS BANK") == _date_cls(2026, 2, 1)


@pytest.mark.asyncio
async def test_stats_summary_empty(db_session, mock_user):
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/stats/summary?period=1m")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_expenses"] == 0.0
        assert data["total_income"] == 0.0
        assert data["savings_rate"] == 0.0
        assert data["needs_review_count"] == 0
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_stats_category_breakdown_empty(db_session, mock_user):
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/stats/category-breakdown?period=1m")
        assert resp.status_code == 200
        assert resp.json()["categories"] == []
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_stats_top_merchants_empty(db_session, mock_user):
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/stats/top-merchants?period=1m")
        assert resp.status_code == 200
        assert resp.json()["merchants"] == []
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_stats_monthly_trend_empty(db_session, mock_user):
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/stats/monthly-trend?period=1m")
        assert resp.status_code == 200
        data = resp.json()
        assert "months" in data
        assert isinstance(data["months"], list)
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_list_budgets_empty(db_session, mock_user):
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/budgets")
        assert resp.status_code == 200
        assert resp.json()["budgets"] == []
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_create_and_delete_budget(db_session, mock_user):
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/api/budgets", json={"category": "Food", "monthly_limit": 4000})
            assert resp.status_code == 201
            created = resp.json()
            assert created["category"] == "Food"
            assert created["monthly_limit"] == 4000.0
            budget_id = created["id"]

            resp2 = await client.get("/api/budgets")
            assert any(b["category"] == "Food" for b in resp2.json()["budgets"])

            resp3 = await client.delete(f"/api/budgets/{budget_id}")
            assert resp3.status_code == 200

            resp4 = await client.get("/api/budgets")
            assert resp4.json()["budgets"] == []
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_update_budget(db_session, mock_user):
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            created = (await client.post("/api/budgets", json={"category": "Shopping", "monthly_limit": 3000})).json()
            budget_id = created["id"]
            resp = await client.patch(f"/api/budgets/{budget_id}", json={"monthly_limit": 5000})
            assert resp.status_code == 200
            assert resp.json()["monthly_limit"] == 5000.0
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_get_transaction_detail_includes_body_text(db_session, mock_user):
    from datetime import datetime

    from app.models import Email, Transaction

    # Insert an Email + Transaction directly (owned by mock_user)
    email = Email(
        gmail_id="test_gmail_id_body",
        subject="Test Subject",
        sender="test@example.com",
        sender_domain="example.com",
        received_at=datetime.now(UTC),
        body_snippet="short snippet",
        body_text="Full body text here.",
        gmail_link="https://mail.google.com/mail/u/0/#inbox/test_gmail_id_body",
        user_id=mock_user.id,
    )
    db_session.add(email)
    await db_session.flush()

    txn = Transaction(
        email_id=email.id,
        label="expense",
        amount=100.0,
        currency="INR",
        status="auto",
        classifier_method="rule",
        confidence=0.9,
    )
    db_session.add(txn)
    await db_session.commit()
    await db_session.refresh(txn)

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get(f"/api/transactions/{txn.id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["email"]["body_text"] == "Full body text here."
    finally:
        app.dependency_overrides.pop(get_db, None)
