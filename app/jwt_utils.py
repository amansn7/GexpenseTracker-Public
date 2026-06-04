"""JWT utilities — sign and verify access + refresh tokens.

Uses PyJWT with RS256 (asymmetric). Private key signs, public key verifies.
Supports key rotation via JWT_PUBLIC_KEY_OLD env var for transition period.
"""

import os
import time
import uuid
from enum import StrEnum

import jwt as pyjwt

ACCESS_TTL_SECONDS: int = 3600  # 1 hour
REFRESH_TTL_SECONDS: int = 30 * 86400  # 30 days
_ALGORITHM = "RS256"


class TokenType(StrEnum):
    ACCESS = "access"
    REFRESH = "refresh"


def _load_key(name: str) -> str | None:
    from app.config import settings as _settings

    val = getattr(_settings, name, None) or os.getenv(name)
    if val:
        val = val.replace("\\n", "\n")
    return val


def _private_key() -> str:
    key = _load_key("JWT_PRIVATE_KEY")
    if not key:
        raise RuntimeError("JWT_PRIVATE_KEY is not configured — set it in .env")
    if "BEGIN PRIVATE KEY" not in key and "BEGIN RSA PRIVATE KEY" not in key:
        raise RuntimeError("JWT_PRIVATE_KEY does not appear to be a valid private key")
    return key


def _public_key() -> str:
    key = _load_key("JWT_PUBLIC_KEY")
    if not key:
        raise RuntimeError("JWT_PUBLIC_KEY is not configured — set it in .env")
    if "BEGIN PUBLIC KEY" not in key:
        raise RuntimeError("JWT_PUBLIC_KEY does not appear to be a valid public key")
    return key


def _public_keys() -> list[str]:
    keys = [_public_key()]
    old = _load_key("JWT_PUBLIC_KEY_OLD")
    if old:
        keys.append(old)
    return keys


def _make_token(user_id: str, email: str, token_type: TokenType, ttl: int) -> str:
    now = int(time.time())
    payload = {
        "sub": user_id,
        "email": email,
        "type": token_type.value,
        "iat": now,
        "exp": now + ttl,
        "jti": str(uuid.uuid4()),
    }
    return pyjwt.encode(payload, _private_key(), algorithm=_ALGORITHM)


def create_access_token(user_id: str, email: str) -> str:
    return _make_token(user_id, email, TokenType.ACCESS, ACCESS_TTL_SECONDS)


def create_refresh_token(user_id: str, email: str) -> str:
    return _make_token(user_id, email, TokenType.REFRESH, REFRESH_TTL_SECONDS)


def create_token_pair(user_id: str, email: str) -> dict:
    return {
        "access_token": create_access_token(user_id, email),
        "refresh_token": create_refresh_token(user_id, email),
    }


def decode_token(token: str, *, expected_type: TokenType) -> dict:
    """Decode and validate a JWT.

    Tries each configured public key in order (supports rotation).
    Raises ValueError on expiry, bad signature, or wrong type.
    """
    keys = _public_keys()
    last_error: Exception | None = None

    for key in keys:
        try:
            payload = pyjwt.decode(token, key, algorithms=[_ALGORITHM])
            break
        except pyjwt.ExpiredSignatureError:
            raise ValueError("expired")
        except pyjwt.PyJWTError as e:
            last_error = e
            continue
    else:
        msg = str(last_error) if last_error else "invalid"
        raise ValueError(msg)

    actual_type = payload.get("type")
    if actual_type != expected_type.value:
        raise ValueError(f"wrong type: expected {expected_type.value}, got {actual_type}")

    return payload
