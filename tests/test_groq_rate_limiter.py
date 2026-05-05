import pytest
from app.classifier.groq_rate_limiter import get_groq_limiter, _user_limiters


def setup_function():
    _user_limiters.clear()


def test_get_groq_limiter_returns_none_when_no_key_cached():
    result = get_groq_limiter(user_id="user-no-key")
    assert result is None


def test_get_groq_limiter_creates_limiter_with_api_key():
    limiter = get_groq_limiter(user_id="user-with-key", api_key="test-key")
    assert limiter is not None
    assert limiter.api_key == "test-key"


def test_get_groq_limiter_returns_cached_on_repeat_call():
    limiter1 = get_groq_limiter(user_id="user-cached", api_key="key1")
    limiter2 = get_groq_limiter(user_id="user-cached")
    assert limiter1 is limiter2
