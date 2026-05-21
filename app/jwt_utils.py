"""JWT utilities — sign and verify access + refresh tokens.

Uses PyJWT with HS256. Secret read from JWT_SECRET env var (or settings).
Raises ValueError (not HTTPException) so callers can wrap appropriately.
"""
import os
import time
from enum import StrEnum

import jwt as pyjwt

ACCESS_TTL_SECONDS: int = 3600          # 1 hour
REFRESH_TTL_SECONDS: int = 30 * 86400   # 30 days
_ALGORITHM = "HS256"


class TokenType(StrEnum):
    ACCESS = "access"
    REFRESH = "refresh"


def _secret() -> str:
    # Prefer settings object; fall back to env var for test isolation
    from app.config import settings as _settings
    secret = _settings.JWT_SECRET or os.getenv("JWT_SECRET", "")
    if not secret:
        raise RuntimeError("JWT_SECRET is not configured — set it in .env")
    return secret


def _make_token(user_id: str, email: str, token_type: TokenType, ttl: int) -> str:
    now = int(time.time())
    payload = {
        "sub": user_id,
        "email": email,
        "type": token_type.value,
        "iat": now,
        "exp": now + ttl,
    }
    return pyjwt.encode(payload, _secret(), algorithm=_ALGORITHM)


def create_access_token(user_id: str, email: str) -> str:
    """Return a signed access JWT valid for ACCESS_TTL_SECONDS."""
    return _make_token(user_id, email, TokenType.ACCESS, ACCESS_TTL_SECONDS)


def create_refresh_token(user_id: str, email: str) -> str:
    """Return a signed refresh JWT valid for REFRESH_TTL_SECONDS."""
    return _make_token(user_id, email, TokenType.REFRESH, REFRESH_TTL_SECONDS)


def create_token_pair(user_id: str, email: str) -> dict:
    """Return {"access_token": ..., "refresh_token": ...}."""
    return {
        "access_token": create_access_token(user_id, email),
        "refresh_token": create_refresh_token(user_id, email),
    }


def decode_token(token: str, *, expected_type: TokenType) -> dict:
    """Decode and validate a JWT.

    Raises ValueError on expiry, bad signature, or wrong type.
    Returns the full payload dict on success.
    """
    try:
        payload = pyjwt.decode(token, _secret(), algorithms=[_ALGORITHM])
    except pyjwt.ExpiredSignatureError:
        raise ValueError("expired")
    except pyjwt.PyJWTError:
        raise ValueError("invalid")

    actual_type = payload.get("type")
    if actual_type != expected_type.value:
        raise ValueError(f"wrong type: expected {expected_type.value}, got {actual_type}")

    return payload
