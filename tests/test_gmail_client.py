import base64
from app.gmail.client import extract_domain, get_gmail_link, _extract_body_text

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
    """HTML-only email returns empty string."""
    payload = {
        "mimeType": "text/html",
        "body": {"data": _b64("<p>HTML only</p>")},
        "parts": [],
    }
    assert _extract_body_text(payload) == ""

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
