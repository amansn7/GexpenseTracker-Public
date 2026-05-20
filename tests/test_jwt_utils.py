"""Tests for jwt_utils — sign/verify JWTs."""
import os
import time

import pytest

os.environ.setdefault("JWT_SECRET", "test-secret-key-at-least-32-chars!!")
os.environ.setdefault("TESTING", "1")

from app.jwt_utils import (
    ACCESS_TTL_SECONDS,
    REFRESH_TTL_SECONDS,
    TokenType,
    create_access_token,
    create_refresh_token,
    create_token_pair,
    decode_token,
)


def test_access_ttl_is_one_hour():
    assert ACCESS_TTL_SECONDS == 3600


def test_refresh_ttl_is_30_days():
    assert REFRESH_TTL_SECONDS == 30 * 86400


def test_create_access_token_returns_string():
    token = create_access_token(user_id="u1", email="a@b.com")
    assert isinstance(token, str)
    assert len(token) > 20


def test_decode_access_token_round_trip():
    token = create_access_token(user_id="u1", email="a@b.com")
    payload = decode_token(token, expected_type=TokenType.ACCESS)
    assert payload["sub"] == "u1"
    assert payload["email"] == "a@b.com"
    assert payload["type"] == "access"
    assert "exp" in payload
    assert "iat" in payload


def test_decode_refresh_token_round_trip():
    token = create_refresh_token(user_id="u1", email="a@b.com")
    payload = decode_token(token, expected_type=TokenType.REFRESH)
    assert payload["sub"] == "u1"
    assert payload["type"] == "refresh"


def test_wrong_type_raises():
    access = create_access_token(user_id="u1", email="a@b.com")
    with pytest.raises(ValueError, match="wrong type"):
        decode_token(access, expected_type=TokenType.REFRESH)


def test_expired_token_raises():
    import jwt as pyjwt

    secret = os.environ["JWT_SECRET"]
    now = int(time.time())
    payload = {
        "sub": "u1",
        "email": "a@b.com",
        "type": "access",
        "iat": now - 7200,
        "exp": now - 3600,  # already expired
    }
    expired = pyjwt.encode(payload, secret, algorithm="HS256")
    with pytest.raises(ValueError, match="expired"):
        decode_token(expired, expected_type=TokenType.ACCESS)


def test_tampered_token_raises():
    token = create_access_token(user_id="u1", email="a@b.com")
    bad = token[:-4] + "XXXX"
    with pytest.raises(ValueError, match="invalid"):
        decode_token(bad, expected_type=TokenType.ACCESS)


def test_create_token_pair_returns_both():
    pair = create_token_pair(user_id="u1", email="a@b.com")
    assert "access_token" in pair
    assert "refresh_token" in pair
    # Decode both to confirm they are valid
    decode_token(pair["access_token"], expected_type=TokenType.ACCESS)
    decode_token(pair["refresh_token"], expected_type=TokenType.REFRESH)
