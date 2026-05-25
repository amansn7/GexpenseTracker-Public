"""Tests for Gmail socket timeout isolation — Task 2E.

Verifies that:
1. No `socket.setdefaulttimeout` calls exist anywhere in the codebase
2. `_build_service` creates httplib2.Http with timeout=30
3. Gmail API calls still work with the new timeout approach
"""

import ast
import os
import pathlib
from unittest.mock import MagicMock, patch

import pytest

ROOT = pathlib.Path(__file__).resolve().parents[1]


def _find_python_files(root: pathlib.Path) -> list[pathlib.Path]:
    """Recursively find all .py files under root, skipping common exclusions."""
    skip = {".git", "__pycache__", "venv", ".venv", "node_modules", ".mypy_cache"}
    result = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in skip]
        for fn in filenames:
            if fn.endswith(".py"):
                result.append(pathlib.Path(dirpath) / fn)
    return result


class TestNoGlobalSocketDefaultTimeout:
    """Ensure no socket.setdefaulttimeout calls exist in the codebase."""

    def test_no_socket_setdefaulttimeout_in_source(self):
        """Scan all .py files — socket.setdefaulttimeout must not appear."""
        py_files = _find_python_files(ROOT)
        offenders = []
        for fp in py_files:
            try:
                tree = ast.parse(fp.read_text())
            except SyntaxError:
                continue
            for node in ast.walk(tree):
                if (
                    isinstance(node, ast.Call)
                    and isinstance(node.func, ast.Attribute)
                    and isinstance(node.func.value, ast.Name)
                    and node.func.value.id == "socket"
                    and node.func.attr == "setdefaulttimeout"
                ):
                    offenders.append(f"{fp.relative_to(ROOT)}:{node.lineno}")

        assert offenders == [], f"Found socket.setdefaulttimeout() in: {offenders}. Use per-client timeouts instead."


class TestBuildServiceTimeout:
    """Verify _build_service uses httplib2.Http with explicit timeout."""

    @patch("app.gmail.client.get_credentials")
    @patch("app.gmail.client.build")
    def test_build_service_creates_httplib2_with_timeout(self, mock_build, mock_get_creds):
        """_build_service must create httplib2.Http(timeout=30)."""
        mock_creds = MagicMock()
        mock_get_creds.return_value = mock_creds
        mock_service = MagicMock()
        mock_build.return_value = mock_service

        from app.gmail.client import _build_service

        with patch("httplib2.Http") as mock_http_cls:
            mock_http_instance = MagicMock()
            mock_http_cls.return_value = mock_http_instance

            with patch("google_auth_httplib2.AuthorizedHttp") as mock_auth_http:
                mock_auth_http_instance = MagicMock()
                mock_auth_http.return_value = mock_auth_http_instance

                _build_service(mock_creds)

                # Verify httplib2.Http was called with timeout=30
                mock_http_cls.assert_called_once_with(timeout=30)

                # Verify num_retries was set to 0
                assert mock_http_instance.num_retries == 0

                # Verify AuthorizedHttp was constructed with the http transport
                mock_auth_http.assert_called_once_with(mock_creds, http=mock_http_instance)

                # Verify build was called with the authorized http
                mock_build.assert_called_once_with("gmail", "v1", http=mock_auth_http_instance)


class TestGmailApiCallsWithTimeout:
    """Verify Gmail API calls work correctly with the new timeout approach."""

    @patch("app.gmail.client.get_credentials")
    @patch("app.gmail.client._build_service")
    @pytest.mark.asyncio
    async def test_fetch_new_messages_uses_service(self, mock_build_service, mock_get_creds):
        """fetch_new_messages should use the service returned by _build_service."""
        mock_creds = MagicMock()
        mock_get_creds.return_value = mock_creds

        mock_service = MagicMock()
        mock_service.users().messages().list().execute.return_value = {
            "messages": [{"id": "msg1"}],
            "nextPageToken": None,
        }
        mock_service.users().getProfile().execute.return_value = {"historyId": "12345"}
        mock_service.users().messages().get().execute.return_value = {
            "id": "msg1",
            "internalDate": "1700000000000",
            "snippet": "test snippet",
            "payload": {
                "mimeType": "text/plain",
                "parts": [],
                "body": {"data": ""},
                "headers": [
                    {"name": "From", "value": "test@example.com"},
                    {"name": "Subject", "value": "Test"},
                    {"name": "Date", "value": "Wed, 15 Nov 2023 00:00:00 +0000"},
                ],
            },
            "labelIds": ["INBOX"],
        }
        mock_build_service.return_value = mock_service

        from app.gmail.client import fetch_new_messages

        messages, history_id = await fetch_new_messages(
            last_history_id=None,
            email_filter="all",
            creds=mock_creds,
        )

        assert len(messages) == 1
        assert messages[0]["gmail_id"] == "msg1"
        assert history_id == "12345"
        mock_build_service.assert_called_once_with(mock_creds)
