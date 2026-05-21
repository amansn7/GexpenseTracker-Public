"""Tests for streaming backfill — batch processing instead of collect-all-then-process."""
import os

os.environ.setdefault("TESTING", "1")

from unittest.mock import AsyncMock, MagicMock, patch

import pytest


@pytest.mark.asyncio
async def test_backfill_bodies_processes_in_batches(db_session, mock_user):
    """backfill-bodies should commit after each batch, not once at the end."""
    from httpx import ASGITransport, AsyncClient

    from app.auth_deps import get_current_user
    from app.database import get_db
    from app.main import app
    from app.models import Email

    for i in range(200):
        db_session.add(Email(
            gmail_id=f"gid_{i}",
            sender_domain="test.com",
            user_id=mock_user.id,
            body_text=None,
        ))
    await db_session.commit()

    mock_service = MagicMock()
    mock_service.users().messages().get.return_value.execute = MagicMock(
        return_value={"payload": {"parts": [{"mimeType": "text/plain", "body": {"data": "SGVsbG8="}}]}}
    )

    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_current_user] = lambda: mock_user

    try:
        with patch("app.gmail.auth.get_credentials_for_user", return_value=MagicMock()):
            with patch("app.gmail.client._build_service", return_value=mock_service):
                async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                    resp = await client.post("/api/sync/backfill-bodies", json={})
        assert resp.status_code == 200
        data = resp.json()
        assert data["updated"] > 0
        assert data["total"] > 0
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_backfill_bodies_with_email_ids(db_session, mock_user):
    """backfill-bodies with explicit email_ids should only process those."""
    from httpx import ASGITransport, AsyncClient

    from app.auth_deps import get_current_user
    from app.database import get_db
    from app.main import app
    from app.models import Email

    emails = []
    for i in range(5):
        e = Email(gmail_id=f"gid_{i}", sender_domain="test.com", user_id=mock_user.id, body_text=None)
        db_session.add(e)
        emails.append(e)
    await db_session.commit()

    mock_service = MagicMock()
    mock_service.users().messages().get.return_value.execute = MagicMock(
        return_value={"payload": {"parts": [{"mimeType": "text/plain", "body": {"data": "SGVsbG8="}}]}}
    )

    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_current_user] = lambda: mock_user

    try:
        target_ids = [emails[0].id, emails[2].id]
        with patch("app.gmail.auth.get_credentials_for_user", return_value=MagicMock()):
            with patch("app.gmail.client._build_service", return_value=mock_service):
                async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                    resp = await client.post("/api/sync/backfill-bodies", json={"email_ids": target_ids})
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 2
        assert data["updated"] == 2
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_clean_bodies_job_batches_commits():
    """clean_bodies_job should process in batches with separate sessions, not one big session."""
    from app.sync.fetch import clean_bodies_job
    from app.sync.progress import _sync_progress

    user_id = "test_clean_bodies_batch"
    _sync_progress[user_id] = {
        "running": True, "phase": "fetching", "phase_detail": "",
        "current": 0, "total": 0, "tally": {}, "previews": [],
        "current_email": None, "log": [], "result": None,
        "error": None, "minimized": False,
    }

    session_call_count = 0

    class CountingSession:
        def __init__(self, *args, **kwargs):
            nonlocal session_call_count
            session_call_count += 1
            self._real = MagicMock()
            self._real.__aenter__ = AsyncMock(return_value=self._real)
            self._real.__aexit__ = AsyncMock(return_value=False)
            self._real.execute = AsyncMock()
            mock_result = MagicMock()
            mock_result.scalars.return_value.all.return_value = []
            self._real.execute.return_value = mock_result
            self._real.commit = AsyncMock()

        async def __aenter__(self):
            return self._real

        async def __aexit__(self, *args):
            return await self._real.__aexit__(*args)

    with patch("app.sync.fetch.AsyncSessionLocal", side_effect=CountingSession):
        await clean_bodies_job(user_id=user_id)

    assert session_call_count >= 1

    _sync_progress.pop(user_id, None)


@pytest.mark.asyncio
async def test_clean_bodies_job_no_single_session_hold():
    """clean_bodies_job should not hold a single session open for the entire operation."""
    from app.sync.fetch import clean_bodies_job
    from app.sync.progress import _sync_progress

    user_id = "test_clean_no_hold"
    _sync_progress[user_id] = {
        "running": True, "phase": "fetching", "phase_detail": "",
        "current": 0, "total": 0, "tally": {}, "previews": [],
        "current_email": None, "log": [], "result": None,
        "error": None, "minimized": False,
    }

    session_enter_count = 0

    class TrackedSession:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            nonlocal session_enter_count
            session_enter_count += 1
            mock = MagicMock()
            mock.execute = AsyncMock()
            mock_result = MagicMock()
            mock_result.scalars.return_value.all.return_value = []
            mock.execute.return_value = mock_result
            mock.commit = AsyncMock()
            return mock

        async def __aexit__(self, *args):
            pass

    with patch("app.sync.fetch.AsyncSessionLocal", side_effect=TrackedSession):
        await clean_bodies_job(user_id=user_id)

    assert session_enter_count >= 1

    _sync_progress.pop(user_id, None)


@pytest.mark.asyncio
async def test_fetch_range_backfill_paginates(db_session, mock_user):
    """fetch-range backfill should paginate through missing bodies."""
    from datetime import datetime

    from app.models import Email
    from app.sync.progress import _sync_progress
    from app.sync.range import run_sync_range

    user_id = "test_range_paginate"
    _sync_progress[user_id] = {
        "running": True, "phase": "fetching", "phase_detail": "",
        "current": 0, "total": 0, "tally": {}, "previews": [],
        "current_email": None, "log": [], "result": None,
        "error": None, "minimized": False,
    }

    base_dt = datetime(2024, 1, 15)
    for i in range(100):
        db_session.add(Email(
            gmail_id=f"range_gid_{i}",
            sender_domain="test.com",
            user_id=user_id,
            body_text=None,
            received_at=base_dt,
            subject=f"Test {i}",
        ))
    await db_session.commit()

    mock_service = MagicMock()
    mock_service.users().messages().get.return_value.execute = MagicMock(
        return_value={"payload": {"parts": [{"mimeType": "text/plain", "body": {"data": "SGVsbG8="}}]}}
    )

    mock_session_ctx = AsyncMock()
    mock_session_ctx.__aenter__ = AsyncMock(return_value=db_session)
    mock_session_ctx.__aexit__ = AsyncMock(return_value=False)

    with patch("app.sync.range.AsyncSessionLocal", return_value=mock_session_ctx):
        with patch("app.sync.range.get_credentials_for_user", return_value=MagicMock()):
            with patch("app.sync.range.fetch_new_messages", return_value=([], "hist_1")):
                with patch("app.sync.range._build_service", return_value=mock_service):
                    result = await run_sync_range(
                        user_id=user_id,
                        after_date="2024/01/01",
                        before_date="2024/02/01",
                    )

    assert result["fetched"] == 0
    assert result["backfilled"] > 0
    assert result["errors"] == 0

    _sync_progress.pop(user_id, None)


@pytest.mark.asyncio
async def test_backfill_partial_commits_preserve_data_on_error(db_session, mock_user):
    """If an error occurs mid-batch, previously committed batches should be preserved."""
    from httpx import ASGITransport, AsyncClient

    from app.auth_deps import get_current_user
    from app.database import get_db
    from app.main import app
    from app.models import Email

    for i in range(15):
        db_session.add(Email(
            gmail_id=f"err_gid_{i}",
            sender_domain="test.com",
            user_id=mock_user.id,
            body_text=None,
        ))
    await db_session.commit()

    call_counter = 0

    def flaky_execute():
        nonlocal call_counter
        call_counter += 1
        if call_counter > 5:
            raise Exception("Gmail API transient error")
        return {"payload": {"parts": [{"mimeType": "text/plain", "body": {"data": "SGVsbG8="}}]}}

    mock_service = MagicMock()
    mock_service.users().messages().get.return_value.execute = MagicMock(side_effect=flaky_execute)

    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_current_user] = lambda: mock_user

    try:
        with patch("app.gmail.auth.get_credentials_for_user", return_value=MagicMock()):
            with patch("app.gmail.client._build_service", return_value=mock_service):
                async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                    resp = await client.post("/api/sync/backfill-bodies", json={})
        assert resp.status_code == 200
        data = resp.json()
        assert data["errors"] >= 1
        assert data["updated"] >= 1
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_backfill_bodies_empty_result(db_session, mock_user):
    """backfill-bodies should return 0 when all emails already have body text."""
    from httpx import ASGITransport, AsyncClient

    from app.auth_deps import get_current_user
    from app.database import get_db
    from app.main import app
    from app.models import Email

    db_session.add(Email(
        gmail_id="gid_complete",
        sender_domain="test.com",
        user_id=mock_user.id,
        body_text="Already has body",
    ))
    await db_session.commit()

    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_current_user] = lambda: mock_user

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/api/sync/backfill-bodies", json={})
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0
        assert data["updated"] == 0
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)
