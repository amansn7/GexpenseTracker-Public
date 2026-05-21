"""Test that AuthMiddleware does not block JWT/Bearer-authenticated requests."""
import os

import pytest

os.environ.setdefault("TESTING", "1")  # TESTING=1 bypasses middleware — so we test manually

# These tests deliberately unset TESTING to exercise real middleware
@pytest.mark.asyncio
async def test_refresh_endpoint_not_blocked_by_middleware():
    """POST /api/auth/token/refresh must not return 401/redirect from middleware."""
    import os as _os
    _os.environ.pop("TESTING", None)
    try:
        from httpx import ASGITransport, AsyncClient

        from app.main import app
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            # Sending garbage token — expect 401 from handler (invalid token), NOT a redirect
            resp = await client.post(
                "/api/auth/token/refresh",
                json={"refresh_token": "not-a-real-token"},
            )
        # Middleware would return 401 with {"detail": "Not authenticated"}
        # Handler returns 401 with {"detail": "invalid"} — different detail
        assert resp.status_code == 401
        assert resp.json().get("detail") != "Not authenticated"
    finally:
        _os.environ["TESTING"] = "1"
