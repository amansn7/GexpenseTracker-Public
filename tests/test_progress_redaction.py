"""Tests for progress redaction — ensure sensitive fields are stripped from public API."""

import pytest


def test_get_sync_progress_public_excludes_current_email():
    """get_sync_progress_public must not include current_email."""
    from app.sync.progress import _sync_progress, get_sync_progress_public

    user_id = "test_redact_current_email"
    _sync_progress[user_id] = {
        "running": True,
        "phase": "processing",
        "phase_detail": "",
        "current": 5,
        "total": 20,
        "tally": {"expense": 3, "income": 1, "ignore": 1, "review": 0},
        "previews": [
            {
                "subject": "Receipt",
                "sender": "store@example.com",
                "label": "expense",
                "category": "Food",
                "amount": 25.0,
            }
        ],
        "current_email": {"subject": "Receipt from Store", "sender": "noreply@store.com"},
        "log": [],
        "result": None,
        "error": None,
        "minimized": False,
    }

    try:
        result = get_sync_progress_public(user_id)
        assert "current_email" not in result
    finally:
        _sync_progress.pop(user_id, None)


def test_get_sync_progress_public_excludes_previews():
    """get_sync_progress_public must not include previews (contains email subjects)."""
    from app.sync.progress import _sync_progress, get_sync_progress_public

    user_id = "test_redact_previews"
    _sync_progress[user_id] = {
        "running": True,
        "phase": "processing",
        "phase_detail": "",
        "current": 3,
        "total": 10,
        "tally": {"expense": 2, "income": 0, "ignore": 1, "review": 0},
        "previews": [
            {
                "subject": "Invoice #123",
                "sender": "billing@vendor.com",
                "label": "expense",
                "category": "Software",
                "amount": 99.0,
            },
            {
                "subject": "Payment received",
                "sender": "pay@client.com",
                "label": "income",
                "category": "Freelance",
                "amount": 500.0,
            },
        ],
        "current_email": None,
        "log": [],
        "result": None,
        "error": None,
        "minimized": False,
    }

    try:
        result = get_sync_progress_public(user_id)
        assert "previews" not in result
    finally:
        _sync_progress.pop(user_id, None)


def test_get_sync_progress_public_retains_safe_fields():
    """get_sync_progress_public must still include phase, running, current, total."""
    from app.sync.progress import _sync_progress, get_sync_progress_public

    user_id = "test_retain_safe_fields"
    _sync_progress[user_id] = {
        "running": True,
        "phase": "classifying",
        "phase_detail": "batch 3 of 5",
        "current": 15,
        "total": 50,
        "tally": {"expense": 10, "income": 2, "ignore": 2, "review": 1},
        "previews": [],
        "current_email": None,
        "log": [{"time": "2024-01-01T00:00:00Z", "message": "started", "type": "info"}],
        "result": None,
        "error": None,
        "minimized": False,
    }

    try:
        result = get_sync_progress_public(user_id)
        assert result["running"] is True
        assert result["phase"] == "classifying"
        assert result["current"] == 15
        assert result["total"] == 50
        assert "phase_detail" in result
        assert "tally" in result
        assert "log" in result
        assert "result" in result
        assert "error" in result
        assert "minimized" in result
    finally:
        _sync_progress.pop(user_id, None)


@pytest.mark.asyncio
async def test_progress_api_endpoint_returns_redacted_data():
    """GET /api/sync/progress must not return current_email or previews."""
    from httpx import ASGITransport, AsyncClient

    from app.auth_deps import get_current_user
    from app.database import get_db
    from app.main import app
    from app.models import User, UserRole, UserStatus

    fake_user = User(email="api@test.com", role=UserRole.owner, status=UserStatus.active, onboarding_complete=True)
    fake_user.id = "api_redact_test_user"

    async def _override_db():
        yield None

    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[get_current_user] = lambda: fake_user

    from app.sync.progress import _sync_progress

    _sync_progress[fake_user.id] = {
        "running": True,
        "phase": "fetching",
        "phase_detail": "",
        "current": 1,
        "total": 10,
        "tally": {"expense": 0, "income": 0, "ignore": 0, "review": 0},
        "previews": [
            {
                "subject": "Secret Invoice",
                "sender": "ceo@company.com",
                "label": "expense",
                "category": "Travel",
                "amount": 1200.0,
            }
        ],
        "current_email": {"subject": "Confidential: Salary Details", "sender": "hr@company.com"},
        "log": [],
        "result": None,
        "error": None,
        "minimized": False,
    }

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/sync/progress")

        assert resp.status_code == 200
        data = resp.json()
        assert "current_email" not in data, "current_email should be redacted from API response"
        assert "previews" not in data, "previews should be redacted from API response"
        assert data["running"] is True
        assert data["phase"] == "fetching"
        assert data["current"] == 1
        assert data["total"] == 10
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)
        _sync_progress.pop(fake_user.id, None)
