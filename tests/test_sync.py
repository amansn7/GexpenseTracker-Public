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
