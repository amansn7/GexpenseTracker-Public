"""Symmetric encryption helpers for secrets stored in the DB (e.g. refresh tokens)."""
from app.config import settings


def _fernet():
    from cryptography.fernet import Fernet
    return Fernet(settings.FERNET_KEY.encode())


def encrypt_secret(plaintext: str) -> str:
    """Encrypt plaintext string if FERNET_KEY is configured; return as-is otherwise."""
    if not settings.FERNET_KEY:
        return plaintext
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt_secret(value: str) -> str:
    """Decrypt a Fernet-encrypted value. Falls back to plaintext for unencrypted legacy rows."""
    if not settings.FERNET_KEY:
        return value
    try:
        return _fernet().decrypt(value.encode()).decode()
    except Exception:
        # Row predates encryption — return raw value so token can still be used
        return value
