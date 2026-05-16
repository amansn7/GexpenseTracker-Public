"""Symmetric encryption helpers for secrets stored in the DB (e.g. refresh tokens)."""
from app.config import settings


def _fernet():
    from cryptography.fernet import Fernet
    if not settings.FERNET_KEY:
        raise RuntimeError("FERNET_KEY is not configured. Encryption is required.")
    return Fernet(settings.FERNET_KEY.encode())


def encrypt_secret(plaintext: str) -> str:
    """Encrypt plaintext string using Fernet. Fails if FERNET_KEY is not configured."""
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt_secret(value: str) -> str:
    """Decrypt a Fernet-encrypted value. Falls back to plaintext for unencrypted legacy rows."""
    if not settings.FERNET_KEY:
        raise RuntimeError("FERNET_KEY is not configured. Cannot decrypt secrets.")
    try:
        return _fernet().decrypt(value.encode()).decode()
    except Exception:
        return value
