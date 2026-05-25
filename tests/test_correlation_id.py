"""Tests for CorrelationIdMiddleware — request tracing via X-Request-ID."""

import re
import uuid

import pytest
import structlog
from httpx import ASGITransport, AsyncClient

from app.main import app

UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")


@pytest.mark.asyncio
async def test_generates_uuid_when_no_request_id():
    """Request without X-Request-ID gets a generated UUID in the response."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/health")
    assert resp.status_code == 200
    request_id = resp.headers.get("X-Request-ID")
    assert request_id is not None
    assert UUID_RE.match(request_id), f"Not a valid UUID: {request_id}"


@pytest.mark.asyncio
async def test_echoes_client_supplied_request_id():
    """Request with X-Request-ID echoes it back in the response."""
    client_id = str(uuid.uuid4())
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/health", headers={"X-Request-ID": client_id})
    assert resp.status_code == 200
    assert resp.headers.get("X-Request-ID") == client_id


@pytest.mark.asyncio
async def test_request_id_is_valid_uuid_format():
    """The X-Request-ID header value is always a valid UUID format."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/health")
    request_id = resp.headers.get("X-Request-ID")
    assert request_id is not None
    parsed = uuid.UUID(request_id)
    assert str(parsed) == request_id


@pytest.mark.asyncio
async def test_structlog_context_includes_request_id():
    """structlog contextvars contain request_id during request processing."""
    captured = {}

    list(app.routes)

    @app.get("/test-correlation-capture")
    async def _capture_correlation():
        captured["request_id"] = structlog.contextvars.get_contextvars().get("request_id")
        return {"ok": True}

    try:
        client_id = str(uuid.uuid4())
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/test-correlation-capture", headers={"X-Request-ID": client_id})
        assert resp.status_code == 200
        assert captured.get("request_id") == client_id
    finally:
        app.router.routes = [r for r in app.router.routes if getattr(r, "path", "") != "/test-correlation-capture"]
