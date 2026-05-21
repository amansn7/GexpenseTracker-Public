"""Tests for /health/detailed and /health/ready endpoints."""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    import os
    os.environ["TESTING"] = "1"
    os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"
    os.environ["SECRET_KEY"] = "test-secret-key-for-health-tests"
    os.environ["FERNET_KEY"] = "test-fernet-key-for-health-tests"
    from app.main import app
    return TestClient(app)


def test_health_detailed_returns_components(client):
    resp = client.get("/health/detailed")
    assert resp.status_code == 200
    data = resp.json()
    assert "status" in data
    assert "components" in data
    assert "version" in data
    assert "uptime_seconds" in data
    assert "database" in data["components"]
    assert "scheduler" in data["components"]
    assert "worker_queue" in data["components"]


def test_health_detailed_database_ok(client):
    resp = client.get("/health/detailed")
    assert resp.status_code == 200
    db_status = resp.json()["components"]["database"]
    assert db_status["status"] == "ok"
    assert "latency_ms" in db_status


def test_health_ready_returns_200(client):
    resp = client.get("/health/ready")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ready"


def test_health_detailed_has_llm_providers(client):
    resp = client.get("/health/detailed")
    assert resp.status_code == 200
    llm = resp.json()["components"]["llm_providers"]
    assert "status" in llm
    assert "available" in llm


def test_health_detailed_has_gmail_auth(client):
    resp = client.get("/health/detailed")
    assert resp.status_code == 200
    gmail = resp.json()["components"]["gmail_auth"]
    assert "status" in gmail
    assert "accounts_connected" in gmail
