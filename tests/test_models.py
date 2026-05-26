import pytest
from sqlalchemy import select

from app.models import (
    Email,
    Label,
    RuleSource,
    SenderRule,
    Transaction,
    TransactionStatus,
    User,
    UserRole,
    UserStatus,
)


async def _make_user(db_session):
    """Create a minimal user for email foreign key."""
    user = User(email="model-test@example.com", role=UserRole.owner, status=UserStatus.active, onboarding_complete=True)
    db_session.add(user)
    await db_session.flush()
    return user


@pytest.mark.asyncio
async def test_create_email(db_session):
    user = await _make_user(db_session)
    email = Email(
        gmail_id="abc123", subject="Receipt", sender="no-reply@amazon.in", sender_domain="amazon.in", user_id=user.id
    )
    db_session.add(email)
    await db_session.commit()
    result = await db_session.execute(select(Email).where(Email.gmail_id == "abc123"))
    assert result.scalar_one().subject == "Receipt"


@pytest.mark.asyncio
async def test_create_transaction(db_session):
    user = await _make_user(db_session)
    email = Email(gmail_id="xyz789", sender_domain="zomato.com", user_id=user.id)
    db_session.add(email)
    await db_session.flush()
    txn = Transaction(
        email_id=email.id,
        label=Label.expense,
        amount=299.00,
        currency="INR",
        merchant="Zomato",
        category="Food",
        status=TransactionStatus.auto,
    )
    db_session.add(txn)
    await db_session.commit()
    result = await db_session.execute(select(Transaction).where(Transaction.email_id == email.id))
    t = result.scalar_one()
    assert t.label == Label.expense
    assert float(t.amount) == 299.00


@pytest.mark.asyncio
async def test_sender_rule_unique(db_session):
    rule = SenderRule(user_id="test-user-id", sender_domain="swiggy.in", label=Label.expense, category="Food", source=RuleSource.builtin)
    db_session.add(rule)
    await db_session.commit()
    result = await db_session.execute(select(SenderRule).where(SenderRule.sender_domain == "swiggy.in"))
    assert result.scalar_one().category == "Food"


@pytest.mark.asyncio
async def test_budget_model_create_and_query(db_session):
    from sqlalchemy import select

    from app.models import Budget

    b = Budget(user_id="test-user-id", category="Food", monthly_limit=4000.0)
    db_session.add(b)
    await db_session.commit()
    row = (await db_session.execute(select(Budget).where(Budget.category == "Food"))).scalar_one()
    assert row.id is not None
    assert float(row.monthly_limit) == 4000.0
    assert row.created_at is not None
