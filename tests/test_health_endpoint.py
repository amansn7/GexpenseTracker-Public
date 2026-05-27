"""Tests for /health/detailed and /health/ready endpoints."""

import os

import pytest
import pytest_asyncio
from fastapi.testclient import TestClient


@pytest_asyncio.fixture
async def auth_client(mock_user):
    """Client with owner-level auth via mock_user fixture."""
    os.environ["TESTING"] = "1"
    os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"
    from app.main import app

    return TestClient(app)


@pytest.fixture
def unauth_client():
    """Client with no auth overrides — for testing 401 responses."""
    os.environ["TESTING"] = "1"
    os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"
    # Ensure no auth overrides are active
    from app.auth_deps import get_current_user
    from app.main import app

    app.dependency_overrides.pop(get_current_user, None)


@pytest.fixture
def unauth_client_ctx():
    unauth_client()
    from app.main import app

    with TestClient(app) as client:
        yield client


# ── /health/ready — public, minimal ──────────────────────────────────────────


def test_health_ready_returns_200(unauth_client):
    resp = unauth_client.get("/api/health/ready")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"


def test_health_ready_no_internal_details(unauth_client):
    """Ready probe must not leak internals."""
    resp = unauth_client.get("/api/health/ready")
    assert resp.status_code == 200
    data = resp.json()
    assert "latency_ms" not in data
    assert "version" not in data
    assert "components" not in data
    assert "uptime_seconds" not in data


# ── /health/detailed — requires authentication ────────────────────────────────


def test_health_detailed_unauthenticated_returns_401(unauth_client):
    """Unauthenticated requests must be rejected."""
    resp = unauth_client.get("/api/health/detailed")
    assert resp.status_code in (401, 403)


def test_health_detailed_returns_components(auth_client):
    resp = auth_client.get("/api/health/detailed")
    assert resp.status_code == 200
    data = resp.json()
    assert "status" in data
    assert "components" in data
    assert "version" in data
    assert "uptime_seconds" in data
    assert "database" in data["components"]
    assert "scheduler" in data["components"]
    assert "worker_queue" in data["components"]


def test_health_detailed_database_ok(auth_client):
    resp = auth_client.get("/api/health/detailed")
    assert resp.status_code == 200
    db_status = resp.json()["components"]["database"]
    assert db_status["status"] == "ok"
    assert "latency_ms" in db_status


def test_health_detailed_has_llm_providers(auth_client):
    resp = auth_client.get("/api/health/detailed")
    assert resp.status_code == 200
    llm = resp.json()["components"]["llm_providers"]
    assert "status" in llm
    assert "available" in llm


def test_health_detailed_has_gmail_auth(auth_client):
    resp = auth_client.get("/api/health/detailed")
    assert resp.status_code == 200
    gmail = resp.json()["components"]["gmail_auth"]
    assert "status" in gmail
