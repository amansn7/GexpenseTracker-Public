import os

import pytest

os.environ["TESTING"] = "1"
from httpx import ASGITransport, AsyncClient

from app.database import get_db
from app.main import app


@pytest.mark.asyncio
async def test_settings_patch_accepts_starting_balance(db_session, mock_user):
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.patch(
                "/api/account/settings",
                json={
                    "starting_balance": 100000,
                    "starting_balance_date": "2026-01-01",
                },
            )
        assert r.status_code == 200
        data = r.json()
        assert data["settings"]["starting_balance"] == 100000.0
        assert data["settings"]["starting_balance_date"] == "2026-01-01"
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_health_returns_expected_fields(db_session, mock_user):
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.get("/api/stats/health?months=6")
        assert r.status_code == 200
        data = r.json()
        assert "current_balance" in data
        assert "savings_rate" in data
        assert "runway_months" in data
        assert "monthly_net" in data
        assert "balance_mode" in data
        assert data["balance_mode"] == "computed"
        assert isinstance(data["monthly_net"], list)
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_health_rejects_invalid_months(db_session, mock_user):
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.get("/api/stats/health?months=7")
        assert r.status_code == 422
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_health_accepts_months_3_and_12(db_session, mock_user):
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r3 = await client.get("/api/stats/health?months=3")
            r12 = await client.get("/api/stats/health?months=12")
        assert r3.status_code == 200
        assert r12.status_code == 200
        for r in [r3, r12]:
            data = r.json()
            assert "monthly_net" in data
            for entry in data["monthly_net"]:
                assert "month" in entry
                assert "income" in entry
                assert "expenses" in entry
                assert "net" in entry
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_health_anchored_balance_mode(db_session, mock_user):
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            await client.patch(
                "/api/account/settings",
                json={
                    "starting_balance": 50000,
                    "starting_balance_date": "2026-01-01",
                },
            )
            r = await client.get("/api/stats/health?months=6")
        assert r.status_code == 200
        data = r.json()
        assert data["balance_mode"] == "anchored"
        assert data["starting_balance"] == 50000.0
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_health_balance_reflects_transactions(db_session, mock_user):
    import uuid
    from datetime import date as date_type

    from app.models import Email as EmailModel
    from app.models import Label, TransactionStatus
    from app.models import Transaction as TxnModel

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            # Seed: one expense of 5000 owned by mock_user
            email_id = str(uuid.uuid4())
            email = EmailModel(
                id=email_id,
                gmail_id="msg-bal-test-1",
                sender="test@bank.com",
                subject="Debit",
                body_text="",
                user_id=mock_user.id,
            )
            txn = TxnModel(
                id=str(uuid.uuid4()),
                email_id=email_id,
                label=Label.expense,
                amount=5000.0,
                status=TransactionStatus.auto,
                txn_date=date_type.today(),
            )
            db_session.add(email)
            db_session.add(txn)
            await db_session.flush()

            r = await client.get("/api/stats/health?months=6")
        assert r.status_code == 200
        data = r.json()
        # No starting_balance, so current_balance = 0 (income) - 5000 (expense) = -5000
        assert data["current_balance"] == -5000.0
        assert data["balance_mode"] == "computed"
        # runway must be 0 (not negative)
        assert data["runway_months"] == 0.0
    finally:
        app.dependency_overrides.pop(get_db, None)
