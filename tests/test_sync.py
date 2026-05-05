import pytest
from unittest.mock import AsyncMock, patch, MagicMock


def test_fetch_new_messages_date_range_query():
    """fetch_new_messages with after_date builds correct Gmail query and preserves history_id."""
    from unittest.mock import patch, MagicMock
    from app.gmail.client import fetch_new_messages

    mock_service = MagicMock()
    mock_service.users().messages().list().execute.return_value = {"messages": []}

    with patch("app.gmail.client._build_service", return_value=mock_service):
        messages, returned_history_id = fetch_new_messages(
            last_history_id="abc123",
            after_date="2024/01/01",
            before_date="2024/03/31",
        )

    assert messages == []
    assert returned_history_id == "abc123"  # preserved, not advanced

    call_kwargs = mock_service.users().messages().list.call_args[1]
    assert "after:2024/01/01" in call_kwargs["q"]
    assert "before:2024/03/31" in call_kwargs["q"]


async def _make_service_user(db_session):
    """Create a minimal service user for sync tests."""
    from app.models import User, UserRole, UserStatus
    user = User(
        email="service@localhost",
        role=UserRole.owner,
        status=UserStatus.active,
        onboarding_complete=True,
    )
    db_session.add(user)
    await db_session.flush()
    return user


@pytest.mark.asyncio
async def test_run_sync_skips_duplicate_gmail_id(db_session):
    from app.models import Email, Transaction
    from sqlalchemy import select

    user = await _make_service_user(db_session)
    existing = Email(gmail_id="dup001", sender_domain="amazon.in", user_id=user.id)
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
        "user_id": user.id,
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

    user = await _make_service_user(db_session)

    fake_messages = [{
        "gmail_id": "swiggy001",
        "subject": "Debit alert",
        "sender": "alerts@bank.com",
        "sender_domain": "bank.com",
        "received_at": None,
        "body_snippet": "Rs.488 debited towards WWW SWIGGY IN",
        "body_text": "Rs.488 debited towards WWW SWIGGY IN",
        "gmail_link": "",
        "user_id": user.id,
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
    assert txns[0].merchant is not None
    assert "wiggy" in txns[0].merchant.lower()
    assert txns[0].category == "Food"
