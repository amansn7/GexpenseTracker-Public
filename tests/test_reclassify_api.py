import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.auth_deps import get_current_user
from app.database import get_db
from app.main import app

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


async def _client(db_session, mock_user):
    async def override_get_db():
        yield db_session
    async def override_get_current_user():
        return mock_user
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_get_current_user
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def _consume_sse(resp):
    events = []
    async for line in resp.aiter_lines():
        if line.startswith("data:"):
            import json
            events.append(json.loads(line[5:]))
    return events


@pytest.mark.asyncio
async def test_reclassify_own_email_succeeds(db_session, mock_user, monkeypatch):
    from app.models import Email

    # Build independent engine for SSE generator's AsyncSessionLocal
    engine = create_async_engine(TEST_DATABASE_URL)
    from app.models import Base
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    sse_factory = async_sessionmaker(engine, expire_on_commit=False)

    async with sse_factory() as sse_session:
        email = Email(gmail_id="g-rec-001", subject="Test", user_id=mock_user.id, pre_filter_status="passed", sender_domain="example.com", sender="test@example.com", body_text="Rs 100")
        sse_session.add(email)
        await sse_session.commit()
        await sse_session.refresh(email)
        email_id = email.id

    monkeypatch.setattr("app.api.emails.AsyncSessionLocal", sse_factory)

    async def _fake_classify(*args, **kwargs):
        from app.classifier.protocol import ClassificationResult
        from app.models import Label
        from app.models.transaction import ClassifierMethod
        return ClassificationResult(label=Label.expense, amount=100.0, merchant="Test", category="general", confidence=0.8, classifier_method=ClassifierMethod.rule, warnings=[])

    monkeypatch.setattr("app.classifier.classifier.classify_email", _fake_classify)

    client = await _client(db_session, mock_user)
    try:
        async with client:
            resp = await client.post("/api/emails/reclassify", json={"email_ids": [email_id]})
            assert resp.status_code == 200
            events = await _consume_sse(resp)
            error_events = [e for e in events if e.get("type") == "error"]
            assert len(error_events) == 0, f"Unexpected errors: {[e['message'] for e in error_events]}"
            result_events = [e for e in events if e.get("type") == "result"]
            assert len(result_events) >= 1, f"No result events. All events: {[e.get('type') for e in events]}"
            assert result_events[0]["email_id"] == email_id
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)
        await engine.dispose()


@pytest.mark.asyncio
async def test_reclassify_other_users_email_returns_not_found(db_session, mock_user, monkeypatch):
    from app.models import Email, User, UserRole, UserStatus, UserSettings, UserProfile

    other_user = User(email="other@example.com", role=UserRole.owner, status=UserStatus.active, onboarding_complete=True)
    db_session.add(other_user)
    await db_session.flush()
    db_session.add(UserSettings(user_id=other_user.id))
    db_session.add(UserProfile(user_id=other_user.id, full_name="Other", default_currency="INR", timezone="Asia/Kolkata"))
    await db_session.commit()
    await db_session.refresh(other_user)

    # Build independent engine for SSE generator's AsyncSessionLocal
    engine = create_async_engine(TEST_DATABASE_URL)
    from app.models import Base
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    sse_factory = async_sessionmaker(engine, expire_on_commit=False)

    async with sse_factory() as sse_session:
        email = Email(gmail_id="g-rec-other-001", subject="Other's email", user_id=other_user.id, pre_filter_status="passed", sender_domain="other.com", sender="test@other.com", body_text="Rs 200")
        sse_session.add(email)
        await sse_session.commit()
        await sse_session.refresh(email)
        email_id = email.id

    monkeypatch.setattr("app.api.emails.AsyncSessionLocal", sse_factory)

    async def _fake_classify(*args, **kwargs):
        from app.classifier.protocol import ClassificationResult
        from app.models import Label
        from app.models.transaction import ClassifierMethod
        return ClassificationResult(label=Label.expense, amount=200.0, merchant="Other", category="general", confidence=0.8, classifier_method=ClassifierMethod.rule, warnings=[])

    monkeypatch.setattr("app.classifier.classifier.classify_email", _fake_classify)

    client = await _client(db_session, mock_user)
    try:
        async with client:
            resp = await client.post("/api/emails/reclassify", json={"email_ids": [email_id]})
            assert resp.status_code == 200
            events = await _consume_sse(resp)
            error_events = [e for e in events if e.get("type") == "error"]
            assert len(error_events) >= 1
            assert "NOT FOUND" in error_events[0]["message"]
            result_events = [e for e in events if e.get("type") == "result"]
            assert len(result_events) == 0
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)
        await engine.dispose()
