import pytest
import pytest_asyncio
from sqlalchemy import select
from app.models import Email, Transaction, SyncState, SenderRule, Label, TransactionStatus, RuleSource

@pytest.mark.asyncio
async def test_create_email(db_session):
    email = Email(gmail_id="abc123", subject="Receipt", sender="no-reply@amazon.in", sender_domain="amazon.in")
    db_session.add(email)
    await db_session.commit()
    result = await db_session.execute(select(Email).where(Email.gmail_id == "abc123"))
    assert result.scalar_one().subject == "Receipt"

@pytest.mark.asyncio
async def test_create_transaction(db_session):
    email = Email(gmail_id="xyz789", sender_domain="zomato.com")
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
    rule = SenderRule(sender_domain="swiggy.in", label=Label.expense, category="Food", source=RuleSource.builtin)
    db_session.add(rule)
    await db_session.commit()
    result = await db_session.execute(select(SenderRule).where(SenderRule.sender_domain == "swiggy.in"))
    assert result.scalar_one().category == "Food"
