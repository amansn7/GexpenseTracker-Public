import pytest
from datetime import date, datetime, timezone
from httpx import ASGITransport, AsyncClient

from app.database import get_db
from app.main import app
from app.models import Budget, BudgetLink, Email, Transaction
from app.models.transaction import Label, TransactionStatus


@pytest.fixture
def override_db(db_session):
    async def _override():
        yield db_session
    app.dependency_overrides[get_db] = _override
    yield
    app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_list_links_empty(override_db, db_session, mock_user):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/budgets/links")
    assert resp.status_code == 200
    assert resp.json() == {"links": []}


@pytest.mark.asyncio
async def test_create_link(override_db, db_session, mock_user):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            "/api/budgets/links",
            json={"source_category": "Rent", "target_category": "Maintenance", "split_amount": 2000},
        )
    assert resp.status_code == 201
    body = resp.json()
    assert body["source_category"] == "Rent"
    assert body["target_category"] == "Maintenance"
    assert body["split_amount"] == 2000.0
    assert "id" in body


@pytest.mark.asyncio
async def test_create_link_duplicate_returns_409(override_db, db_session, mock_user):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        await client.post(
            "/api/budgets/links",
            json={"source_category": "Rent", "target_category": "Maintenance", "split_amount": 2000},
        )
        resp = await client.post(
            "/api/budgets/links",
            json={"source_category": "Rent", "target_category": "Maintenance", "split_amount": 3000},
        )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_create_link_same_category_returns_422(override_db, db_session, mock_user):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            "/api/budgets/links",
            json={"source_category": "Rent", "target_category": "Rent", "split_amount": 1000},
        )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_link_zero_amount_returns_422(override_db, db_session, mock_user):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            "/api/budgets/links",
            json={"source_category": "Rent", "target_category": "Maintenance", "split_amount": 0},
        )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_delete_link(override_db, db_session, mock_user):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        created = (
            await client.post(
                "/api/budgets/links",
                json={"source_category": "Rent", "target_category": "Maintenance", "split_amount": 2000},
            )
        ).json()
        resp = await client.delete(f"/api/budgets/links/{created['id']}")
        assert resp.status_code == 200
        listing = await client.get("/api/budgets/links")
        assert listing.json()["links"] == []


@pytest.mark.asyncio
async def test_linked_spend_included_in_budget(override_db, db_session, mock_user):
    """Rent transaction 20000, link split_amount=2000 → Maintenance budget shows 2000 spent."""
    today = date.today()

    email = Email(
        user_id=mock_user.id,
        gmail_id="msg-link-1",
        subject="Rent paid",
        sender="landlord@example.com",
        received_at=datetime.now(timezone.utc),
        body_text="Rent 20000",
    )
    db_session.add(email)
    await db_session.flush()

    txn = Transaction(
        email_id=email.id,
        amount=20000.0,
        category="Rent",
        label=Label.expense,
        status=TransactionStatus.confirmed,
        txn_date=today,
    )
    db_session.add(txn)

    budget = Budget(user_id=mock_user.id, category="Maintenance", monthly_limit=2000)
    db_session.add(budget)

    link = BudgetLink(
        user_id=mock_user.id,
        source_category="Rent",
        target_category="Maintenance",
        split_amount=2000.0,
    )
    db_session.add(link)
    await db_session.commit()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/budgets")
    assert resp.status_code == 200
    maintenance = next(
        (b for b in resp.json()["budgets"] if b["category"] == "Maintenance"), None
    )
    assert maintenance is not None
    assert maintenance["spent_this_month"] == 2000.0
    assert maintenance["pct"] == 100.0


@pytest.mark.asyncio
async def test_linked_spend_capped_at_txn_amount(override_db, db_session, mock_user):
    """Rent transaction 500 with link split_amount=2000 → Maintenance shows 500 (capped)."""
    today = date.today()

    email = Email(
        user_id=mock_user.id,
        gmail_id="msg-link-2",
        subject="Small rent",
        sender="landlord@example.com",
        received_at=datetime.now(timezone.utc),
        body_text="Rent 500",
    )
    db_session.add(email)
    await db_session.flush()

    txn = Transaction(
        email_id=email.id,
        amount=500.0,
        category="Rent",
        label=Label.expense,
        status=TransactionStatus.confirmed,
        txn_date=today,
    )
    db_session.add(txn)

    budget = Budget(user_id=mock_user.id, category="Maintenance", monthly_limit=2000)
    db_session.add(budget)

    link = BudgetLink(
        user_id=mock_user.id,
        source_category="Rent",
        target_category="Maintenance",
        split_amount=2000.0,
    )
    db_session.add(link)
    await db_session.commit()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/budgets")
    maintenance = next(b for b in resp.json()["budgets"] if b["category"] == "Maintenance")
    assert maintenance["spent_this_month"] == 500.0
