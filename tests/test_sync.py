import pytest
from unittest.mock import AsyncMock, patch, MagicMock

@pytest.mark.asyncio
async def test_run_sync_skips_duplicate_gmail_id(db_session):
    from app.models import Email, Transaction
    from sqlalchemy import select

    existing = Email(gmail_id="dup001", sender_domain="amazon.in")
    db_session.add(existing)
    await db_session.commit()

    fake_messages = [{
        "gmail_id": "dup001",
        "subject": "Duplicate",
        "sender": "x@amazon.in",
        "sender_domain": "amazon.in",
        "received_at": None,
        "body_snippet": "",
        "gmail_link": "",
    }]

    mock_ctx = AsyncMock()
    mock_ctx.__aenter__ = AsyncMock(return_value=db_session)
    mock_ctx.__aexit__ = AsyncMock(return_value=False)

    with patch("app.sync.fetch_new_messages", return_value=(fake_messages, "100")):
        with patch("app.sync.AsyncSessionLocal", return_value=mock_ctx):
            from app.sync import run_sync
            result = await run_sync()

    # No new transaction — duplicate skipped
    txns = await db_session.execute(select(Transaction))
    assert txns.scalars().all() == []


@pytest.mark.asyncio
async def test_run_sync_persists_rule_detected_merchant(db_session):
    from app.models import Transaction
    from sqlalchemy import select

    fake_messages = [{
        "gmail_id": "swiggy001",
        "subject": "Debit alert",
        "sender": "alerts@bank.com",
        "sender_domain": "bank.com",
        "received_at": None,
        "body_snippet": "Rs.488 debited towards WWW SWIGGY IN",
        "body_text": "Rs.488 debited towards WWW SWIGGY IN",
        "gmail_link": "",
    }]

    mock_ctx = AsyncMock()
    mock_ctx.__aenter__ = AsyncMock(return_value=db_session)
    mock_ctx.__aexit__ = AsyncMock(return_value=False)

    with patch("app.sync.fetch_new_messages", return_value=(fake_messages, "101")):
        with patch("app.sync.AsyncSessionLocal", return_value=mock_ctx):
            from app.sync import run_sync
            await run_sync()

    txns = (await db_session.execute(select(Transaction))).scalars().all()
    assert len(txns) == 1
    assert txns[0].label == "expense"
    assert txns[0].merchant == "Swiggy"
    assert txns[0].category == "Food"
