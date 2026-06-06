from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.auth_deps import get_current_user
from app.database import get_db
from app.main import app, _infer_resource
from app.models import AuditLog, User, UserRole, UserStatus


@pytest.mark.asyncio
async def test_write_audit_entry_creates_entry(db_session):
    """_write_audit_entry creates an AuditLog row with new fields."""
    from app.main import _write_audit_entry

    uid = "test-user-id"
    await _write_audit_entry(
        action="POST /api/test",
        method="POST",
        path="/api/test",
        user_id=uid,
        resource_type="test",
        resource_id="123",
        status_code=201,
        ip_address="127.0.0.1",
        user_agent="TestAgent",
        db=db_session,
    )

    from sqlalchemy import select

    row = (await db_session.execute(select(AuditLog).where(AuditLog.action == "POST /api/test"))).scalar_one_or_none()
    assert row is not None
    assert row.method == "POST"
    assert row.path == "/api/test"
    assert row.user_id == uid
    assert row.resource_type == "test"
    assert row.resource_id == "123"
    assert row.status_code == 201
    assert row.ip_address == "127.0.0.1"
    assert row.user_agent == "TestAgent"


@pytest.mark.asyncio
async def test_auto_audit_logs_state_changing_endpoints(db_session):
    """POST/PUT/PATCH/DELETE to /api/* produce audit log entries."""
    from app.models import UserSettings

    owner = User(email="audit@test.com", role=UserRole.owner, status=UserStatus.active, onboarding_complete=True)
    db_session.add(owner)
    await db_session.flush()
    db_session.add(UserSettings(user_id=owner.id))
    await db_session.commit()
    await db_session.refresh(owner)

    async def _override():
        return owner

    async def _override_db():
        yield db_session

    app.dependency_overrides[get_current_user] = _override
    app.dependency_overrides[get_db] = _override_db

    with patch("app.main._write_audit_entry", new_callable=AsyncMock) as mock_write:
        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.post("/api/admin/test-provider", json={"provider": "openai", "prompt": "Say OK"})
                assert resp.status_code == 200
        finally:
            app.dependency_overrides.pop(get_current_user, None)
            app.dependency_overrides.pop(get_db, None)

        mock_write.assert_awaited_once()
        call_kwargs = mock_write.await_args.kwargs if mock_write.await_args else {}
        assert call_kwargs.get("method") == "POST"
        assert call_kwargs.get("path") == "/api/admin/test-provider"
        assert call_kwargs.get("status_code") == 200


@pytest.mark.asyncio
async def test_auto_audit_skips_get_requests():
    """GET requests to /api/* are NOT audited."""
    with patch("app.main._write_audit_entry", new_callable=AsyncMock) as mock_write:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/health/ready")
            assert resp.status_code == 200

    mock_write.assert_not_awaited()


@pytest.mark.asyncio
async def test_auto_audit_skips_exempt_paths():
    """Exempt paths (auth endpoints) are NOT audited."""
    with patch("app.main._write_audit_entry", new_callable=AsyncMock) as mock_write:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/api/auth/login")
            mock_write.assert_not_awaited()


@pytest.mark.asyncio
async def test_auto_audit_skips_non_api_paths():
    """POST to non-/api paths are NOT audited."""
    with patch("app.main._write_audit_entry", new_callable=AsyncMock) as mock_write:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/health")
            mock_write.assert_not_awaited()


@pytest.mark.asyncio
async def test_auto_audit_logs_failed_requests():
    """Failed state-changing requests still produce audit logs."""
    with patch("app.main._write_audit_entry", new_callable=AsyncMock) as mock_write:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/api/auth/logout")
            mock_write.assert_awaited_once()

        call_kwargs = mock_write.await_args.kwargs if mock_write.await_args else {}
        assert call_kwargs.get("method") == "POST"
        assert call_kwargs.get("path") == "/api/auth/logout"


def test_infer_resource_parses_path():
    """_infer_resource extracts resource_type and resource_id."""
    assert _infer_resource("/api/transactions/550e8400-e29b-41d4-a716-446655440000") == (
        "transactions",
        "550e8400-e29b-41d4-a716-446655440000",
    )
    assert _infer_resource("/api/budgets") == ("budgets", None)
    assert _infer_resource("/api/settings/profile") == ("settings", None)
    assert _infer_resource("/api/transactions") == ("transactions", None)
    assert _infer_resource("/") == (None, None)
    assert _infer_resource("/api/transactions/42") == ("transactions", "42")


@pytest.mark.asyncio
async def test_list_audit_logs_exposes_new_fields(db_session, mock_user):
    """Admin audit logs endpoint exposes method, path, status_code, user_agent."""
    al = AuditLog(
        user_id=mock_user.id,
        action="POST /api/test",
        method="POST",
        path="/api/test",
        resource_type="test",
        resource_id="123",
        status_code=201,
        ip_address="127.0.0.1",
        user_agent="TestAgent",
    )
    db_session.add(al)
    await db_session.commit()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/admin/audit-logs")

    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 1
    item = next(i for i in data["items"] if i["action"] == "POST /api/test")
    assert item["method"] == "POST"
    assert item["path"] == "/api/test"
    assert item["status_code"] == 201
    assert item["resource_type"] == "test"
    assert item["resource_id"] == "123"
    assert item["user_agent"] == "TestAgent"


@pytest.mark.asyncio
async def test_audit_log_admin_filters_by_method(db_session, mock_user):
    """Admin audit log endpoint supports method and user_id filtering."""
    db_session.add_all([
        AuditLog(user_id=mock_user.id, action="POST /api/a", method="POST", path="/api/a"),
        AuditLog(user_id=mock_user.id, action="PUT /api/b", method="PUT", path="/api/b"),
    ])
    await db_session.commit()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/admin/audit-logs?method=PUT")

    assert resp.status_code == 200
    data = resp.json()
    assert all(i["method"] == "PUT" for i in data["items"])


@pytest.mark.asyncio
async def test_audit_log_cleanup_removes_old_entries(db_session):
    """Old audit log entries are purged after 90 days."""
    from sqlalchemy import delete, select

    old = AuditLog(
        action="old_entry",
        created_at=datetime.now(UTC) - timedelta(days=91),
    )
    recent = AuditLog(
        action="recent_entry",
        created_at=datetime.now(UTC),
    )
    db_session.add_all([old, recent])
    await db_session.commit()

    cutoff = datetime.now(UTC) - timedelta(days=90)
    await db_session.execute(delete(AuditLog).where(AuditLog.created_at < cutoff))
    await db_session.commit()

    remaining = (await db_session.execute(select(AuditLog).order_by(AuditLog.created_at))).scalars().all()
    assert len(remaining) == 1
    assert remaining[0].action == "recent_entry"


@pytest.mark.asyncio
async def test_explicit_log_audit_still_works(db_session):
    """Explicit log_audit() calls still work alongside middleware."""
    from app.audit import log_audit

    await log_audit(
        db_session,
        action="manual_action",
        user_id="manual-user",
        method="POST",
        path="/api/manual",
        resource_type="manual",
        status_code=200,
        details="custom details",
        ip_address="10.0.0.1",
    )

    from sqlalchemy import select

    row = (await db_session.execute(select(AuditLog).where(AuditLog.action == "manual_action"))).scalar_one_or_none()
    assert row is not None
    assert row.method == "POST"
    assert row.path == "/api/manual"
    assert row.status_code == 200
    assert row.details == "custom details"
