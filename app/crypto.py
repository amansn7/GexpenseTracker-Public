"""Symmetric encryption helpers for secrets stored in the DB."""
import base64
import hashlib

from app.config import settings


def _fernet():
    from cryptography.fernet import Fernet
    if not settings.FERNET_KEY:
        raise RuntimeError("FERNET_KEY is not configured. Encryption is required.")
    try:
        return Fernet(settings.FERNET_KEY.encode())
    except ValueError:
        # If FERNET_KEY is not valid url-safe base64, derive a proper key from it
        key = base64.urlsafe_b64encode(hashlib.sha256(settings.FERNET_KEY.encode("utf-8")).digest())
        return Fernet(key)


def encrypt_secret(plaintext: str) -> str:
    """Encrypt plaintext string using FERNET_KEY. Used for refresh tokens."""
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt_secret(value: str) -> str:
    """Decrypt a FERNET_KEY-encrypted value. Falls back to plaintext for unencrypted legacy rows."""
    if not settings.FERNET_KEY:
        raise RuntimeError("FERNET_KEY is not configured. Cannot decrypt secrets.")
    try:
        return _fernet().decrypt(value.encode()).decode()
    except Exception:
        return value


def _ai_key_fernet():
    from cryptography.fernet import Fernet
    if not settings.FERNET_KEY:
        raise RuntimeError("FERNET_KEY is required for AI key encryption")
    try:
        return Fernet(settings.FERNET_KEY.encode())
    except ValueError:
        key = base64.urlsafe_b64encode(hashlib.sha256(settings.FERNET_KEY.encode("utf-8")).digest())
        return Fernet(key)


def encrypt_ai_secret(secret: str | None) -> str | None:
    """Encrypt user AI-service API key using FERNET_KEY-derived Fernet key."""
    if not secret:
        return None
    return _ai_key_fernet().encrypt(secret.encode("utf-8")).decode("utf-8")


def decrypt_ai_secret(encrypted: str | None) -> str | None:
    """Decrypt user AI-service API key encrypted with encrypt_ai_secret."""
    if not encrypted:
        return None
    return _ai_key_fernet().decrypt(encrypted.encode("utf-8")).decode("utf-8")
