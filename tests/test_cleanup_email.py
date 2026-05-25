from datetime import UTC, datetime, timedelta

import pytest
from httpx import ASGITransport, AsyncClient

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
async def test_cleanup_dry_run_reports_count(db_session, mock_user):
    from app.models import Email

    old_time = datetime.now(UTC) - timedelta(days=100)
    recent_time = datetime.now(UTC) - timedelta(days=10)

    # Old discarded email — should be eligible
    old_discarded = Email(
        gmail_id="g-old-disc",
        subject="Old discarded",
        user_id=mock_user.id,
        pre_filter_status="discarded",
        sender_domain="old.com",
        sender="old@old.com",
        synced_at=old_time,
    )
    # Old review_pending email — should be eligible
    old_pending = Email(
        gmail_id="g-old-pend",
        subject="Old pending",
        user_id=mock_user.id,
        pre_filter_status="review_pending",
        sender_domain="old2.com",
        sender="old2@old2.com",
        synced_at=old_time,
    )
    # Recent discarded email — should NOT be eligible
    recent_discarded = Email(
        gmail_id="g-recent-disc",
        subject="Recent discarded",
        user_id=mock_user.id,
        pre_filter_status="discarded",
        sender_domain="recent.com",
        sender="recent@recent.com",
        synced_at=recent_time,
    )
    db_session.add_all([old_discarded, old_pending, recent_discarded])
    await db_session.commit()

    client = await _client(db_session, mock_user)
    try:
        async with client:
            resp = await client.post("/api/cleanup/emails", json={"dry_run": True})
            assert resp.status_code == 200
            data = resp.json()
            assert data["dry_run"] is True
            assert data["would_delete"] == 2, f"Expected 2 eligible, got {data['would_delete']}"
            assert data["days"] == 90
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_cleanup_execute_deletes_old_emails(db_session, mock_user):
    from app.models import Email

    old_time = datetime.now(UTC) - timedelta(days=100)
    recent_time = datetime.now(UTC) - timedelta(days=10)

    old_email = Email(
        gmail_id="g-exec-old",
        subject="Old to delete",
        user_id=mock_user.id,
        pre_filter_status="discarded",
        sender_domain="delete.com",
        sender="del@delete.com",
        synced_at=old_time,
    )
    recent_email = Email(
        gmail_id="g-exec-recent",
        subject="Recent keep",
        user_id=mock_user.id,
        pre_filter_status="review_pending",
        sender_domain="keep.com",
        sender="keep@keep.com",
        synced_at=recent_time,
    )
    db_session.add_all([old_email, recent_email])
    await db_session.commit()
    old_id = old_email.id
    recent_id = recent_email.id

    client = await _client(db_session, mock_user)
    try:
        async with client:
            resp = await client.post("/api/cleanup/emails", json={"dry_run": False})
            assert resp.status_code == 200
            data = resp.json()
            assert data["dry_run"] is False
            assert data["deleted"] == 1

        # Old email should be deleted
        old_check = await db_session.get(Email, old_id)
        assert old_check is None, "Old email should be deleted"

        # Recent email should remain
        recent_check = await db_session.get(Email, recent_id)
        assert recent_check is not None, "Recent email should remain"
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_cleanup_does_not_delete_passed_emails(db_session, mock_user):
    from app.models import Email

    old_time = datetime.now(UTC) - timedelta(days=100)

    passed_email = Email(
        gmail_id="g-passed-old",
        subject="Old passed",
        user_id=mock_user.id,
        pre_filter_status="passed",
        sender_domain="passed.com",
        sender="passed@passed.com",
        synced_at=old_time,
    )
    db_session.add(passed_email)
    await db_session.commit()
    passed_id = passed_email.id

    client = await _client(db_session, mock_user)
    try:
        async with client:
            resp = await client.post("/api/cleanup/emails", json={"dry_run": False})
            assert resp.status_code == 200
            data = resp.json()
            assert data["deleted"] == 0

        passed_check = await db_session.get(Email, passed_id)
        assert passed_check is not None, "Passed email should not be deleted"
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)
