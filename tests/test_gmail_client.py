import base64
from unittest.mock import MagicMock, patch
from googleapiclient.errors import HttpError
from app.gmail.client import extract_domain, get_gmail_link, _extract_body_text, _retry_with_backoff

def test_extract_domain_standard():
    assert extract_domain("Amazon <no-reply@amazon.in>") == "amazon.in"

def test_extract_domain_bare():
    assert extract_domain("alerts@hdfcbank.com") == "hdfcbank.com"

def test_extract_domain_empty():
    assert extract_domain("") == ""

def test_gmail_link():
    link = get_gmail_link("abc123")
    assert link == "https://mail.google.com/mail/u/0/#inbox/abc123"


def _b64(text: str) -> str:
    return base64.urlsafe_b64encode(text.encode()).decode()

def test_extract_body_simple_payload():
    """Simple email: body directly on payload, no parts."""
    payload = {
        "mimeType": "text/plain",
        "body": {"data": _b64("Hello world")},
        "parts": [],
    }
    assert _extract_body_text(payload) == "Hello world"

def test_extract_body_multipart():
    """Multipart email: plain text is in parts."""
    payload = {
        "mimeType": "multipart/alternative",
        "body": {},
        "parts": [
            {
                "mimeType": "text/plain",
                "body": {"data": _b64("Plain text body")},
            },
            {
                "mimeType": "text/html",
                "body": {"data": _b64("<p>HTML body</p>")},
            },
        ],
    }
    assert _extract_body_text(payload) == "Plain text body"

def test_extract_body_nested_multipart():
    """Nested multipart — walks recursively."""
    inner = {
        "mimeType": "text/plain",
        "body": {"data": _b64("Nested plain")},
    }
    payload = {
        "mimeType": "multipart/mixed",
        "body": {},
        "parts": [
            {"mimeType": "multipart/alternative", "body": {}, "parts": [inner]},
        ],
    }
    assert _extract_body_text(payload) == "Nested plain"

def test_extract_body_no_plain_falls_back_empty():
    """HTML-only email is stripped into readable text."""
    payload = {
        "mimeType": "text/html",
        "body": {"data": _b64("<p>HTML only</p>")},
        "parts": [],
    }
    assert _extract_body_text(payload) == "HTML only"

def test_extract_body_collapses_whitespace():
    """Excessive blank lines collapsed to double newline."""
    raw = "Line 1\n\n\n\n\nLine 2"
    payload = {
        "mimeType": "text/plain",
        "body": {"data": _b64(raw)},
        "parts": [],
    }
    result = _extract_body_text(payload)
    assert "\n\n\n" not in result
    assert "Line 1" in result
    assert "Line 2" in result

def test_extract_body_caps_at_4000():
    """Output capped at 4000 chars."""
    long_text = "x" * 5000
    payload = {
        "mimeType": "text/plain",
        "body": {"data": _b64(long_text)},
        "parts": [],
    }
    assert len(_extract_body_text(payload)) == 4000

def test_extract_body_already_padded_base64():
    """Base64 input whose length is already a multiple of 4 — no extra padding needed."""
    # "Hello" base64url-encodes to "SGVsbG8=" (8 chars, multiple of 4)
    payload = {
        "mimeType": "text/plain",
        "body": {"data": "SGVsbG8="},
        "parts": [],
    }
    assert _extract_body_text(payload) == "Hello"


def test_retry_with_backoff_succeeds_on_first_try():
    """_retry_with_backoff returns result immediately on success."""
    call_count = 0
    def success_func():
        nonlocal call_count
        call_count += 1
        return "ok"
    result = _retry_with_backoff(success_func, max_retries=2)
    assert result == "ok"
    assert call_count == 1


def test_retry_with_backoff_retries_on_503():
    """_retry_with_backoff retries on 503 and succeeds."""
    call_count = 0
    def flaky_func():
        nonlocal call_count
        call_count += 1
        if call_count < 3:
            resp = MagicMock()
            resp.status = 503
            raise HttpError(resp, b"Service Unavailable")
        return "recovered"
    result = _retry_with_backoff(flaky_func, max_retries=3)
    assert result == "recovered"
    assert call_count == 3


def test_retry_with_backoff_retries_on_429():
    """_retry_with_backoff retries on 429 (rate limit)."""
    call_count = 0
    def rate_limited_func():
        nonlocal call_count
        call_count += 1
        if call_count < 2:
            resp = MagicMock()
            resp.status = 429
            resp.get = MagicMock(return_value=None)
            raise HttpError(resp, b"Rate Limited")
        return "allowed"
    result = _retry_with_backoff(rate_limited_func, max_retries=2)
    assert result == "allowed"
    assert call_count == 2


def test_retry_with_backoff_retries_on_oserror():
    """_retry_with_backoff retries on OSError (connection errors)."""
    call_count = 0
    def flaky_connection():
        nonlocal call_count
        call_count += 1
        if call_count < 2:
            raise OSError("Connection reset")
        return "connected"
    result = _retry_with_backoff(flaky_connection, max_retries=2)
    assert result == "connected"
    assert call_count == 2


def test_retry_with_backoff_gives_up_after_max_retries():
    """_retry_with_backoff raises after exhausting retries."""
    def always_fails():
        resp = MagicMock()
        resp.status = 500
        raise HttpError(resp, b"Internal Server Error")
    try:
        _retry_with_backoff(always_fails, max_retries=2)
        assert False, "Should have raised"
    except HttpError as e:
        assert e.resp.status == 500


def test_retry_with_backoff_does_not_retry_404():
    """_retry_with_backoff does not retry 404 (not retryable)."""
    call_count = 0
    def not_found():
        nonlocal call_count
        call_count += 1
        resp = MagicMock()
        resp.status = 404
        raise HttpError(resp, b"Not Found")
    try:
        _retry_with_backoff(not_found, max_retries=3)
        assert False, "Should have raised"
    except HttpError as e:
        assert e.resp.status == 404
        assert call_count == 1  # Only called once, no retries


def test_two_phase_fetch_skips_existing():
    """fetch_new_messages with existing_gmail_ids uses two-phase: metadata first, full only for new."""
    from app.gmail.client import fetch_new_messages

    mock_service = MagicMock()

    # Simulate 3 message IDs, 2 already exist
    mock_service.users().messages().list().execute.return_value = {
        "messages": [
            {"id": "msg1"},
            {"id": "msg2"},
            {"id": "msg3"},
        ]
    }
    mock_service.users().getProfile().execute.return_value = {"historyId": "999"}

    # Metadata fetch for all 3
    def mock_metadata_get(userId, id, format, metadataHeaders):
        msg = MagicMock()
        msg.execute.return_value = {
            "id": id,
            "internalDate": "1700000000000",
            "snippet": f"Snippet for {id}",
            "payload": {
                "headers": [
                    {"name": "From", "value": f"sender{id}@example.com"},
                    {"name": "Subject", "value": f"Subject {id}"},
                ]
            },
            "labelIds": ["INBOX"],
        }
        return msg

    # Full fetch only for new messages (msg3)
    def mock_full_get(userId, id, format):
        msg = MagicMock()
        msg.execute.return_value = {
            "id": id,
            "internalDate": "1700000000000",
            "snippet": f"Full snippet for {id}",
            "payload": {
                "mimeType": "text/plain",
                "body": {"data": _b64(f"Body for {id}")},
                "headers": [
                    {"name": "From", "value": f"sender{id}@example.com"},
                    {"name": "Subject", "value": f"Subject {id}"},
                ],
                "parts": [],
            },
            "labelIds": ["INBOX"],
        }
        return msg

    mock_service.users().messages().get.side_effect = lambda **kwargs: (
        mock_metadata_get(**kwargs) if kwargs.get("format") == "metadata"
        else mock_full_get(**kwargs)
    )

    with patch("app.gmail.client._build_service", return_value=mock_service):
        messages, history_id = fetch_new_messages(
            last_history_id=None,
            email_filter="all",
            existing_gmail_ids={"msg1", "msg2"},  # msg3 is new
        )

    # Only msg3 should be in results (msg1, msg2 skipped as existing)
    assert len(messages) == 1
    assert messages[0]["gmail_id"] == "msg3"
    assert history_id == "999"

    # Verify metadata was fetched for all 3, but full only for msg3
    get_calls = mock_service.users().messages().get.call_args_list
    metadata_calls = [c for c in get_calls if c[1].get("format") == "metadata"]
    full_calls = [c for c in get_calls if c[1].get("format") == "full"]
    assert len(metadata_calls) == 3  # All 3 got metadata
    assert len(full_calls) == 1  # Only msg3 got full fetch
