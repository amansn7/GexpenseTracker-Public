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
async def test_list_emails_status_filter(db_session, mock_user):
    from app.models import Email

    e1 = Email(gmail_id="g-001", subject="Debit alert", user_id=mock_user.id, pre_filter_status="passed")
    e2 = Email(gmail_id="g-002", subject="Flash sale", user_id=mock_user.id, pre_filter_status="review_pending")
    db_session.add_all([e1, e2])
    await db_session.commit()

    client = await _client(db_session, mock_user)
    try:
        async with client:
            resp = await client.get("/api/emails?status=review_pending")
            assert resp.status_code == 200
            data = resp.json()
            assert len(data) == 1
            assert data[0]["subject"] == "Flash sale"
            assert data[0]["pre_filter_status"] == "review_pending"
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_review_keep_action_classifies_and_updates_status(db_session, mock_user, monkeypatch):
    from app.models import Email, FilterRule

    email = Email(gmail_id="g-keep-001", subject="HDFC debit Rs 500", user_id=mock_user.id, pre_filter_status="review_pending", sender_domain="hdfcbank.com", sender="alerts@hdfcbank.com", body_text="Rs 500 debited")
    db_session.add(email)
    await db_session.commit()
    await db_session.refresh(email)

    # Stub classify_email to avoid LLM calls
    async def _fake_classify(**kwargs):
        from app.classifier.protocol import ClassificationResult
        from app.models import Label
        return ClassificationResult(label=Label.expense, amount=500.0, merchant="HDFC", category="banking", confidence=0.95, classifier_method="stub", warnings=[])

    monkeypatch.setattr("app.api.emails.classify_email", _fake_classify)

    client = await _client(db_session, mock_user)
    try:
        async with client:
            resp = await client.post(f"/api/emails/{email.id}/review", json={"action": "keep"})
            assert resp.status_code == 200

        await db_session.refresh(email)
        assert email.pre_filter_status == "passed"

        rule = (await db_session.execute(
            select(FilterRule).where(
                FilterRule.rule_type == "allowlist_domain",
                FilterRule.value == "hdfcbank.com",
                FilterRule.source == "user",
            )
        )).scalar_one_or_none()
        assert rule is not None
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_review_discard_action_updates_status_and_blocklists(db_session, mock_user):
    from app.models import Email, FilterRule

    email = Email(gmail_id="g-discard-001", subject="Buy now!", user_id=mock_user.id, pre_filter_status="review_pending", sender_domain="spam.deals.com", sender="promo@spam.deals.com")
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
            select(FilterRule).where(
                FilterRule.rule_type == "blocklist_domain",
                FilterRule.value == "spam.deals.com",
                FilterRule.source == "user",
            )
        )).scalar_one_or_none()
        assert rule is not None
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)
