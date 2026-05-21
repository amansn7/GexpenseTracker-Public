"""Tests for AI key encryption using FERNET_KEY hierarchy."""
import base64
import hashlib

import pytest

from app.crypto import decrypt_ai_secret, encrypt_ai_secret


def _make_fernet_key(raw: str) -> str:
    """Derive a valid Fernet key from an arbitrary string."""
    return base64.urlsafe_b64encode(hashlib.sha256(raw.encode("utf-8")).digest()).decode()


def test_encrypt_decrypt_roundtrip(monkeypatch):
    """Encrypt with FERNET_KEY, decrypt with same key → round-trip works."""
    monkeypatch.setenv("FERNET_KEY", _make_fernet_key("test-roundtrip-key"))
    from app.config import settings
    settings.FERNET_KEY = _make_fernet_key("test-roundtrip-key")

    plaintext = "sk-test-abc123xyz"
    encrypted = encrypt_ai_secret(plaintext)
    assert encrypted is not None
    assert encrypted != plaintext
    decrypted = decrypt_ai_secret(encrypted)
    assert decrypted == plaintext


def test_decrypt_with_wrong_fernet_key_raises(monkeypatch):
    """Decrypt with a different FERNET_KEY → raises InvalidToken."""
    from cryptography.fernet import InvalidToken

    monkeypatch.setenv("FERNET_KEY", _make_fernet_key("correct-key"))
    from app.config import settings
    settings.FERNET_KEY = _make_fernet_key("correct-key")

    plaintext = "sk-secret-value"
    encrypted = encrypt_ai_secret(plaintext)

    monkeypatch.setenv("FERNET_KEY", _make_fernet_key("wrong-key"))
    settings.FERNET_KEY = _make_fernet_key("wrong-key")

    with pytest.raises(InvalidToken):
        decrypt_ai_secret(encrypted)


def test_encrypt_none_returns_none(monkeypatch):
    """encrypt_ai_secret with None → returns None."""
    monkeypatch.setenv("FERNET_KEY", _make_fernet_key("test-none-key"))
    from app.config import settings
    settings.FERNET_KEY = _make_fernet_key("test-none-key")

    assert encrypt_ai_secret(None) is None
    assert encrypt_ai_secret("") is None


def test_decrypt_none_returns_none(monkeypatch):
    """decrypt_ai_secret with None → returns None."""
    monkeypatch.setenv("FERNET_KEY", _make_fernet_key("test-none-key"))
    from app.config import settings
    settings.FERNET_KEY = _make_fernet_key("test-none-key")

    assert decrypt_ai_secret(None) is None
    assert decrypt_ai_secret("") is None


def test_migration_reencryption_scenario(monkeypatch):
    """Simulate migration: encrypt with old SECRET_KEY-derived key, re-encrypt with FERNET_KEY."""
    from cryptography.fernet import Fernet

    old_secret_key = "old-secret-key"
    new_fernet_key = _make_fernet_key("new-fernet-key")

    old_f = Fernet(base64.urlsafe_b64encode(hashlib.sha256(old_secret_key.encode("utf-8")).digest()))
    new_f = Fernet(new_fernet_key.encode())

    plaintext = "sk-migration-test-key"
    old_encrypted = old_f.encrypt(plaintext.encode("utf-8")).decode("utf-8")

    decrypted_old = old_f.decrypt(old_encrypted.encode("utf-8")).decode("utf-8")
    assert decrypted_old == plaintext

    new_encrypted = new_f.encrypt(decrypted_old.encode("utf-8")).decode("utf-8")
    decrypted_new = new_f.decrypt(new_encrypted.encode("utf-8")).decode("utf-8")
    assert decrypted_new == plaintext

    assert old_encrypted != new_encrypted

    monkeypatch.setenv("FERNET_KEY", new_fernet_key)
    from app.config import settings
    settings.FERNET_KEY = new_fernet_key

    final_decrypted = decrypt_ai_secret(new_encrypted)
    assert final_decrypted == plaintext


def test_migration_skip_on_corrupt_data(monkeypatch):
    """Migration should skip rows that cannot be decrypted with old key (simulated)."""
    from cryptography.fernet import Fernet

    new_fernet_key = _make_fernet_key("new-fernet-key")
    new_f = Fernet(new_fernet_key.encode())

    old_f = Fernet(base64.urlsafe_b64encode(hashlib.sha256(b"old-secret").digest()))

    corrupt_value = new_f.encrypt(b"already-new-encrypted").decode("utf-8")

    with pytest.raises(Exception):
        old_f.decrypt(corrupt_value.encode("utf-8"))

    monkeypatch.setenv("FERNET_KEY", new_fernet_key)
    from app.config import settings
    settings.FERNET_KEY = new_fernet_key

    result = decrypt_ai_secret(corrupt_value)
    assert result == "already-new-encrypted"
