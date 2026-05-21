import pytest
from httpx import ASGITransport, AsyncClient


@pytest.mark.asyncio
async def test_2fa_setup_returns_secret_and_qr(mock_user, db_session):
    from app.main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/account/2fa/setup")
    assert resp.status_code == 200
    data = resp.json()
    assert "secret" in data
    assert len(data["secret"]) >= 16
    assert data["qr_url"].startswith("data:image/png;base64,")


@pytest.mark.asyncio
async def test_2fa_verify_valid_code_enables_totp(mock_user, db_session):
    import pyotp

    from app.main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        setup = await client.post("/api/account/2fa/setup")
        secret = setup.json()["secret"]
        code = pyotp.TOTP(secret).now()
        resp = await client.post("/api/account/2fa/verify", json={"code": code})
    assert resp.status_code == 200
    assert resp.json()["ok"] is True
    await db_session.refresh(mock_user)
    assert mock_user.totp_enabled is True
    assert mock_user.totp_secret == secret
    assert mock_user.totp_secret_pending is None


@pytest.mark.asyncio
async def test_2fa_verify_wrong_code_returns_ok_false(mock_user, db_session):
    from app.main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        await client.post("/api/account/2fa/setup")
        resp = await client.post("/api/account/2fa/verify", json={"code": "000000"})
    assert resp.status_code == 200
    assert resp.json()["ok"] is False
    await db_session.refresh(mock_user)
    assert mock_user.totp_enabled is False


@pytest.mark.asyncio
async def test_2fa_disable_clears_totp(mock_user, db_session):
    import pyotp

    from app.main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        setup = await client.post("/api/account/2fa/setup")
        secret = setup.json()["secret"]
        code = pyotp.TOTP(secret).now()
        await client.post("/api/account/2fa/verify", json={"code": code})
        resp = await client.delete("/api/account/2fa")
    assert resp.status_code == 200
    assert resp.json()["ok"] is True
    await db_session.refresh(mock_user)
    assert mock_user.totp_enabled is False
    assert mock_user.totp_secret is None
