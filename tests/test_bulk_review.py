import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.auth_deps import get_current_user
from app.database import get_db
from app.main import app


async def _client(db_session, mock_user):
    async def override_get_db():
        yield db_session
    async def override_get_current_user():
        return mock_user
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_get_current_user
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.asyncio
async def test_bulk_keep_creates_transactions_for_all(db_session, mock_user, monkeypatch):
    from datetime import date

    from app.models import Email, FilterRule, Transaction
    from app.models.transaction import TransactionStatus

    emails = [
        Email(gmail_id=f"g-bulk-keep-{i}", subject=f"Debit {i}", user_id=mock_user.id, pre_filter_status="review_pending", sender_domain="bank.com", sender="alert@bank.com", body_text=f"Rs {i}00")
        for i in range(3)
    ]
    db_session.add_all(emails)
    await db_session.commit()
    for e in emails:
        await db_session.refresh(e)

    async def _fake_classify(*args, **kwargs):
        from app.classifier.protocol import ClassificationResult
        from app.models import Label
        return ClassificationResult(label=Label.expense, amount=100.0, merchant="Bank", category="banking", confidence=0.9, classifier_method="stub", txn_date=date(2026, 5, 15), status=TransactionStatus.auto, warnings=[])

    monkeypatch.setattr("app.classifier.classifier.classify_email", _fake_classify)

    ids = [e.id for e in emails]
    client = await _client(db_session, mock_user)
    try:
        async with client:
            resp = await client.post("/api/emails/bulk-review", json={"email_ids": ids, "action": "keep"})
            assert resp.status_code == 200
            data = resp.json()
            assert data["ok"] == 3
            assert data["errors"] == []

        for email in emails:
            await db_session.refresh(email)
            assert email.pre_filter_status == "passed", f"Email {email.id} should be passed"

        txns = (await db_session.execute(
            select(Transaction).where(Transaction.email_id.in_(ids))
        )).scalars().all()
        assert len(txns) == 3

        rule = (await db_session.execute(
            select(FilterRule).where(FilterRule.rule_type == "allowlist_domain", FilterRule.value == "bank.com", FilterRule.source == "user")
        )).scalar_one_or_none()
        assert rule is not None
        assert rule.hit_count == 3
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_bulk_discard_all_updated(db_session, mock_user):
    from app.models import Email, FilterRule

    emails = [
        Email(gmail_id=f"g-bulk-disc-{i}", subject=f"Spam {i}", user_id=mock_user.id, pre_filter_status="review_pending", sender_domain="spam.com", sender="promo@spam.com")
        for i in range(3)
    ]
    db_session.add_all(emails)
    await db_session.commit()
    ids = [e.id for e in emails]
    for e in emails:
        await db_session.refresh(e)

    client = await _client(db_session, mock_user)
    try:
        async with client:
            resp = await client.post("/api/emails/bulk-review", json={"email_ids": ids, "action": "discard"})
            assert resp.status_code == 200
            data = resp.json()
            assert data["ok"] == 3

        for email in emails:
            await db_session.refresh(email)
            assert email.pre_filter_status == "discarded"

        rule = (await db_session.execute(
            select(FilterRule).where(FilterRule.rule_type == "blocklist_domain", FilterRule.value == "spam.com", FilterRule.source == "user")
        )).scalar_one_or_none()
        assert rule is not None
        assert rule.hit_count == 3
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_bulk_review_unknown_ids_returned_as_errors(db_session, mock_user):
    client = await _client(db_session, mock_user)
    try:
        async with client:
            resp = await client.post("/api/emails/bulk-review", json={"email_ids": ["nonexistent-id"], "action": "keep"})
            assert resp.status_code == 200
            data = resp.json()
            assert data["ok"] == 0
            assert len(data["errors"]) == 1
            assert data["errors"][0]["id"] == "nonexistent-id"
            assert data["errors"][0]["error"] == "not found"
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)
