import pytest
import time
import app.classifier.groq_rate_limiter as _mod
from app.classifier.groq_rate_limiter import get_groq_limiter, GroqRateLimiter, _user_limiters


def setup_function():
    _user_limiters.clear()
    _mod._groq_limiter = None


def test_get_groq_limiter_returns_none_when_no_key_cached():
    result = get_groq_limiter(user_id="user-no-key")
    assert result is None


def test_get_groq_limiter_creates_limiter_with_api_key():
    limiter = get_groq_limiter(user_id="user-with-key", api_key="test-key")
    assert limiter is not None
    assert limiter.api_key == "test-key"
    limiter.stop()


def test_get_groq_limiter_returns_cached_on_repeat_call():
    limiter1 = get_groq_limiter(user_id="user-cached", api_key="key1")
    limiter2 = get_groq_limiter(user_id="user-cached")
    assert limiter1 is limiter2
    limiter1.stop()


def test_get_groq_limiter_raises_when_no_global_key():
    _mod._groq_limiter = None
    from unittest.mock import patch
    with patch("app.classifier.groq_rate_limiter.settings") as mock_settings:
        mock_settings.GROQ_API_KEY = None
        with pytest.raises(RuntimeError, match="GROQ_API_KEY not configured"):
            get_groq_limiter()


def test_maybe_reset_buckets_resets_rpm_after_minute():
    limiter = GroqRateLimiter("key")
    bucket = limiter._get_bucket("llama-3.3-70b-versatile")
    bucket["rpm_used"] = 10
    limiter._minute_start = time.time() - 61
    limiter._maybe_reset_buckets()
    assert bucket["rpm_used"] == 0
    limiter.stop()
