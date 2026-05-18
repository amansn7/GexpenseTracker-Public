"""Tests for the /api/today endpoint."""
import pytest
from datetime import date, timedelta
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.database import get_db
from app.auth_deps import get_current_user
from app.models import Transaction, Email, User, UserSettings, UserProfile, TransactionStatus


@pytest.fixture
def today_user(db_session):
    """Create a test user with settings."""
    import asyncio
    from app.models import User, UserSettings, UserProfile, UserRole, UserStatus

    async def _create():
        user = User(
            email="today@test.com",
            role=UserRole.owner, status=UserStatus.active,
            onboarding_complete=True,
        )
        db_session.add(user)
        await db_session.flush()
        db_session.add(UserSettings(
            user_id=user.id,
            starting_balance=50000.0,
            starting_balance_date=date.today().replace(day=1) - timedelta(days=90),
        ))
        db_session.add(UserProfile(
            user_id=user.id,
            full_name="Today User",
            default_currency="INR",
            timezone="Asia/Kolkata",
        ))
        await db_session.commit()
        await db_session.refresh(user)
        return user

    return asyncio.get_event_loop().run_until_complete(_create())


@pytest.fixture
def today_data(db_session, today_user):
    """Create test transactions for this month."""
    import asyncio
    today = date.today()
    month_start = today.replace(day=1)

    async def _create():
        emails = []
        transactions = []

        # Income email
        e1 = Email(
            id="today-email-1", user_id=today_user.id,
            gmail_id="gmail-1",
            sender="salary@company.com", sender_domain="company.com",
            subject="Salary Credit", body_snippet="Your salary has been credited",
            received_at=month_start,
        )
        emails.append(e1)
        transactions.append(Transaction(
            id="today-tx-1", email_id=e1.id,
            label="income", amount=80000.0, merchant="Company",
            category="salary", txn_date=month_start,
            confidence=0.95, status=TransactionStatus.confirmed.value,
        ))

        # Expense emails
        for i, (merchant, amount, cat) in enumerate([
            ("Swiggy", 450.0, "food"),
            ("Amazon", 1200.0, "shop"),
            ("Netflix", 649.0, "sub"),
            ("Uber", 280.0, "transport"),
        ]):
            e = Email(
                id=f"today-email-{i+2}", user_id=today_user.id,
                gmail_id=f"gmail-{i+2}",
                sender=f"noreply@{merchant.lower()}.com", sender_domain=f"{merchant.lower()}.com",
                subject=f"Payment of Rs {amount}", body_snippet=f"Your payment of Rs {amount} to {merchant}",
                received_at=month_start + timedelta(days=i),
            )
            emails.append(e)
            transactions.append(Transaction(
                id=f"today-tx-{i+2}", email_id=e.id,
                label="expense", amount=amount, merchant=merchant,
                category=cat, txn_date=month_start + timedelta(days=i),
                confidence=0.85, status=TransactionStatus.confirmed.value,
            ))

        # Needs review transaction
        e_review = Email(
            id="today-email-review", user_id=today_user.id,
            gmail_id="gmail-review",
            sender="unknown@store.com", sender_domain="store.com",
            subject="Purchase confirmation", body_snippet="Your order has been confirmed",
            received_at=month_start + timedelta(days=5),
        )
        emails.append(e_review)
        transactions.append(Transaction(
            id="today-tx-review", email_id=e_review.id,
            label="expense", amount=500.0, merchant="Unknown Store",
            category="other", txn_date=month_start + timedelta(days=5),
            confidence=0.45, status=TransactionStatus.needs_review.value,
        ))

        for e in emails:
            db_session.add(e)
        for t in transactions:
            db_session.add(t)
        await db_session.commit()
        return transactions

    return asyncio.get_event_loop().run_until_complete(_create())


@pytest.mark.asyncio
async def test_today_view_returns_data(db_session, today_user, today_data):
    """Test that /api/today returns the expected structure."""

    async def override_db():
        yield db_session

    async def override_user():
        return today_user

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/today")

        assert resp.status_code == 200
        data = resp.json()

        assert "answer" in data
        assert "attention" in data
        assert "context" in data

        answer = data["answer"]
        assert "income" in answer
        assert "spent" in answer
        assert "remaining" in answer
        assert "sparkline" in answer
        assert "month_label" in answer

        assert answer["income"] > 0
        assert answer["spent"] > 0
        assert answer["remaining"] == answer["income"] - answer["spent"]
        assert len(answer["sparkline"]) >= 1

        attention = data["attention"]
        review_items = [a for a in attention if a["type"] == "review"]
        assert len(review_items) == 1
        assert review_items[0]["count"] == 1

        context = data["context"]
        assert "categories" in context
        assert len(context["categories"]) > 0
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_today_review_queue(db_session, today_user, today_data):
    """Test that /api/today/review-queue returns needs_review items."""

    async def override_db():
        yield db_session

    async def override_user():
        return today_user

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/today/review-queue")

        assert resp.status_code == 200
        data = resp.json()

        assert isinstance(data, list)
        assert len(data) == 1
        assert data[0]["id"] == "today-tx-review"
        assert data[0]["confidence"] == 0.45
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_today_approve_review(db_session, today_user, today_data):
    """Test approving a review item."""

    async def override_db():
        yield db_session

    async def override_user():
        return today_user

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/api/today/review/today-tx-review/approve")

        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "confirmed"

        # Verify in DB
        from sqlalchemy import select
        result = await db_session.execute(
            select(Transaction).where(Transaction.id == "today-tx-review")
        )
        tx = result.scalar_one()
        assert tx.status == TransactionStatus.confirmed.value
        assert tx.read == True
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_today_skip_review(db_session, today_user, today_data):
    """Test skipping a review item."""

    async def override_db():
        yield db_session

    async def override_user():
        return today_user

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/api/today/review/today-tx-review/skip")

        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "skipped"

        # Verify in DB
        from sqlalchemy import select
        result = await db_session.execute(
            select(Transaction).where(Transaction.id == "today-tx-review")
        )
        tx = result.scalar_one()
        assert tx.status == TransactionStatus.needs_review.value
        assert tx.read == True
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_today_approve_not_found(db_session, today_user):
    """Test approving a non-existent transaction."""

    async def override_db():
        yield db_session

    async def override_user():
        return today_user

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/api/today/review/nonexistent-id/approve")

        assert resp.status_code == 404
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)
