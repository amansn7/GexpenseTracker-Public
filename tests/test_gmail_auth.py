from unittest.mock import patch, MagicMock
from pathlib import Path
from app.gmail.auth import get_credentials, is_authenticated, save_credentials

def test_is_authenticated_false_when_no_token(tmp_path, monkeypatch):
    monkeypatch.setattr("app.gmail.auth.TOKEN_FILE", tmp_path / "token.json")
    assert is_authenticated() is False

def test_save_and_load_credentials(tmp_path, monkeypatch):
    monkeypatch.setattr("app.gmail.auth.TOKEN_FILE", tmp_path / "token.json")
    mock_creds = MagicMock()
    mock_creds.to_json.return_value = '{"token": "fake", "refresh_token": "r", "token_uri": "u", "client_id": "c", "client_secret": "s", "scopes": []}'
    mock_creds.valid = True
    mock_creds.expired = False
    save_credentials(mock_creds)
    assert (tmp_path / "token.json").exists()
