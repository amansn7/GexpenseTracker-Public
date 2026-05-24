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
async def test_undo_keep_deletes_transaction_and_rule(db_session, mock_user, monkeypatch):
    from datetime import date

    from app.models import Email, FilterRule, Transaction
    from app.models.transaction import TransactionStatus

    email = Email(gmail_id="g-undo-keep-001", subject="HDFC debit", user_id=mock_user.id, pre_filter_status="review_pending", sender_domain="hdfcbank.com", sender="alerts@hdfcbank.com", body_text="Rs 500 debited")
    db_session.add(email)
    await db_session.commit()
    await db_session.refresh(email)

    async def _fake_classify(*args, **kwargs):
        from app.classifier.protocol import ClassificationResult
        from app.models import Label
        return ClassificationResult(label=Label.expense, amount=500.0, merchant="HDFC", category="banking", confidence=0.95, classifier_method="stub", txn_date=date(2026, 5, 15), status=TransactionStatus.auto, warnings=[])

    monkeypatch.setattr("app.classifier.classifier.classify_email", _fake_classify)

    client = await _client(db_session, mock_user)
    try:
        async with client:
            resp = await client.post(f"/api/emails/{email.id}/review", json={"action": "keep"})
            assert resp.status_code == 200

            await db_session.refresh(email)
            assert email.pre_filter_status == "passed"
            txn = (await db_session.execute(select(Transaction).where(Transaction.email_id == email.id))).scalar_one_or_none()
            assert txn is not None
            rule = (await db_session.execute(
                select(FilterRule).where(FilterRule.rule_type == "allowlist_domain", FilterRule.value == "hdfcbank.com", FilterRule.source == "user")
            )).scalar_one_or_none()
            assert rule is not None

            resp = await client.post(f"/api/emails/{email.id}/undo-review")
            assert resp.status_code == 200

        await db_session.refresh(email)
        assert email.pre_filter_status == "review_pending"
        txn = (await db_session.execute(select(Transaction).where(Transaction.email_id == email.id))).scalar_one_or_none()
        assert txn is None
        rule = (await db_session.execute(
            select(FilterRule).where(FilterRule.rule_type == "allowlist_domain", FilterRule.value == "hdfcbank.com", FilterRule.source == "user")
        )).scalar_one_or_none()
        assert rule is None
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_undo_discard_restores_review_pending(db_session, mock_user):
    from app.models import Email, FilterRule

    email = Email(gmail_id="g-undo-disc-001", subject="Buy now!", user_id=mock_user.id, pre_filter_status="review_pending", sender_domain="spam.deals.com", sender="promo@spam.deals.com")
    db_session.add(email)
    await db_session.commit()
    await db_session.refresh(email)

    client = await _client(db_session, mock_user)
    try:
        async with client:
            resp = await client.post(f"/api/emails/{email.id}/review", json={"action": "discard"})
            assert resp.status_code == 200

            await db_session.refresh(email)
            assert email.pre_filter_status == "discarded"
            rule = (await db_session.execute(
                select(FilterRule).where(FilterRule.rule_type == "blocklist_domain", FilterRule.value == "spam.deals.com", FilterRule.source == "user")
            )).scalar_one_or_none()
            assert rule is not None

            resp = await client.post(f"/api/emails/{email.id}/undo-review")
            assert resp.status_code == 200

        await db_session.refresh(email)
        assert email.pre_filter_status == "review_pending"
        rule = (await db_session.execute(
            select(FilterRule).where(FilterRule.rule_type == "blocklist_domain", FilterRule.value == "spam.deals.com", FilterRule.source == "user")
        )).scalar_one_or_none()
        assert rule is None
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_undo_keep_shared_domain_decrements_hit_count(db_session, mock_user, monkeypatch):
    from datetime import date

    from app.models import Email, FilterRule, Transaction
    from app.models.transaction import TransactionStatus

    domain = "sharedbank.com"

    email_a = Email(gmail_id="g-shared-a", subject="Debit A", user_id=mock_user.id, pre_filter_status="review_pending", sender_domain=domain, sender=f"alert@{domain}", body_text="Rs 100")
    email_b = Email(gmail_id="g-shared-b", subject="Debit B", user_id=mock_user.id, pre_filter_status="review_pending", sender_domain=domain, sender=f"alert@{domain}", body_text="Rs 200")
    db_session.add_all([email_a, email_b])
    await db_session.commit()
    await db_session.refresh(email_a)
    await db_session.refresh(email_b)

    async def _fake_classify(*args, **kwargs):
        from app.classifier.protocol import ClassificationResult
        from app.models import Label
        return ClassificationResult(label=Label.expense, amount=100.0, merchant="Shared", category="banking", confidence=0.8, classifier_method="stub", txn_date=date(2026, 5, 15), status=TransactionStatus.auto, warnings=[])

    monkeypatch.setattr("app.classifier.classifier.classify_email", _fake_classify)

    client = await _client(db_session, mock_user)
    try:
        async with client:
            await client.post(f"/api/emails/{email_a.id}/review", json={"action": "keep"})
            await client.post(f"/api/emails/{email_b.id}/review", json={"action": "keep"})

            rule = (await db_session.execute(
                select(FilterRule).where(FilterRule.rule_type == "allowlist_domain", FilterRule.value == domain, FilterRule.source == "user")
            )).scalar_one_or_none()
            assert rule is not None
            assert rule.hit_count == 2

            resp = await client.post(f"/api/emails/{email_a.id}/undo-review")
            assert resp.status_code == 200

            await db_session.refresh(rule)
            assert rule.hit_count == 1

            resp = await client.post(f"/api/emails/{email_b.id}/undo-review")
            assert resp.status_code == 200

        rule = (await db_session.execute(
            select(FilterRule).where(FilterRule.rule_type == "allowlist_domain", FilterRule.value == domain, FilterRule.source == "user")
        )).scalar_one_or_none()
        assert rule is None
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_undo_twice_is_noop(db_session, mock_user, monkeypatch):
    from app.models import Email, Transaction

    email = Email(gmail_id="g-undo-twice", subject="Test", user_id=mock_user.id, pre_filter_status="review_pending", sender_domain="test.com", sender="test@test.com", body_text="test")
    db_session.add(email)
    await db_session.commit()
    await db_session.refresh(email)

    async def _fake_classify(*args, **kwargs):
        from app.classifier.protocol import ClassificationResult
        from app.models import Label
        from app.models.transaction import TransactionStatus
        return ClassificationResult(label=Label.expense, amount=100.0, merchant="Test", category="general", confidence=0.9, classifier_method="stub", txn_date=None, status=TransactionStatus.auto, warnings=[])

    monkeypatch.setattr("app.classifier.classifier.classify_email", _fake_classify)

    client = await _client(db_session, mock_user)
    try:
        async with client:
            await client.post(f"/api/emails/{email.id}/review", json={"action": "keep"})
            resp1 = await client.post(f"/api/emails/{email.id}/undo-review")
            assert resp1.status_code == 200
            assert resp1.json()["status"] == "review_pending"
            resp2 = await client.post(f"/api/emails/{email.id}/undo-review")
            assert resp2.status_code == 200
            assert resp2.json()["status"] == "review_pending"

        txn = (await db_session.execute(select(Transaction).where(Transaction.email_id == email.id))).scalar_one_or_none()
        assert txn is None
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_undo_unreviewed_email_returns_200_noop(db_session, mock_user):
    from app.models import Email

    email = Email(gmail_id="g-undo-never", subject="Never reviewed", user_id=mock_user.id, pre_filter_status="review_pending", sender_domain="never.com", sender="never@never.com")
    db_session.add(email)
    await db_session.commit()
    await db_session.refresh(email)

    client = await _client(db_session, mock_user)
    try:
        async with client:
            resp = await client.post(f"/api/emails/{email.id}/undo-review")
            assert resp.status_code == 200
            assert resp.json()["status"] == "review_pending"
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)
