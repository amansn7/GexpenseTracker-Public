"""Tests for LLM provider rate limit reset behavior."""
import time
from unittest.mock import patch

import pytest

from app.classifier.llm.providers import Provider


class TestProviderRateLimitReset:
    def test_rate_limit_count_resets_after_timeout(self):
        """Provider rate-limited 5 times, wait 1 hour (mock time), verify count resets to 0."""
        p = Provider(
            name="test",
            base_url="http://test",
            api_key="test-key",
            model="test-model",
            rate_limit_reset_after=3600,
        )

        # Simulate 5 rate limit hits
        for _ in range(5):
            p.mark_rate_limited(retry_after=60)

        assert p.rate_limit_count == 5
        assert p.last_rate_limit_at is not None

        # Mock time to be 1 hour + 1 second after last rate limit
        with patch("app.classifier.llm.providers.time.time") as mock_time:
            mock_time.return_value = p.last_rate_limit_at + 3601

            # Accessing priority_score triggers the reset check
            _ = p.priority_score

            assert p.rate_limit_count == 0
            assert p.last_rate_limit_at is None

    def test_rate_limit_count_does_not_reset_before_timeout(self):
        """Provider rate-limited, but not enough time has passed — count stays."""
        p = Provider(
            name="test",
            base_url="http://test",
            api_key="test-key",
            model="test-model",
            rate_limit_reset_after=3600,
        )

        p.mark_rate_limited(retry_after=60)
        assert p.rate_limit_count == 1

        with patch("app.classifier.llm.providers.time.time") as mock_time:
            mock_time.return_value = p.last_rate_limit_at + 1800  # 30 min

            _ = p.priority_score

            assert p.rate_limit_count == 1

    def test_successful_call_decrements_count(self):
        """Successful call decrements rate_limit_count."""
        p = Provider(
            name="test",
            base_url="http://test",
            api_key="test-key",
            model="test-model",
        )

        p.mark_rate_limited(retry_after=60)
        p.mark_rate_limited(retry_after=60)
        assert p.rate_limit_count == 2

        p.decrement_rate_limit_count()
        assert p.rate_limit_count == 1

        p.decrement_rate_limit_count()
        assert p.rate_limit_count == 0

    def test_count_never_goes_below_zero(self):
        """decrement_rate_limit_count() never makes count negative."""
        p = Provider(
            name="test",
            base_url="http://test",
            api_key="test-key",
            model="test-model",
        )

        assert p.rate_limit_count == 0
        p.decrement_rate_limit_count()
        assert p.rate_limit_count == 0

        # Even after many decrements
        for _ in range(10):
            p.decrement_rate_limit_count()
        assert p.rate_limit_count == 0

    def test_reset_rate_limits_manually(self):
        """reset_rate_limits() manually resets all rate limit state."""
        p = Provider(
            name="test",
            base_url="http://test",
            api_key="test-key",
            model="test-model",
        )

        p.mark_rate_limited(retry_after=60)
        p.mark_rate_limited(retry_after=60)
        assert p.rate_limit_count == 2
        assert p.last_rate_limit_at is not None
        assert p.rate_limited_until > 0

        p.reset_rate_limits()

        assert p.rate_limit_count == 0
        assert p.last_rate_limit_at is None
        assert p.rate_limited_until == 0.0

    def test_no_rate_limits_priority_score_unchanged(self):
        """Provider with no rate limits has priority score based only on error_rate."""
        p = Provider(
            name="test",
            base_url="http://test",
            api_key="test-key",
            model="test-model",
        )

        # No rate limits, no failures
        score = p.priority_score
        assert score == 0.0

        # Add some successes and failures to test error_rate component
        p.success_count = 8
        p.fail_count = 2
        score = p.priority_score
        assert score == pytest.approx(0.2)  # error_rate = 2/10 = 0.2

    def test_priority_score_includes_rate_limit_penalty(self):
        """Rate limit count adds 0.25 per hit to priority score."""
        p = Provider(
            name="test",
            base_url="http://test",
            api_key="test-key",
            model="test-model",
        )

        p.mark_rate_limited(retry_after=60)
        p.mark_rate_limited(retry_after=60)
        p.mark_rate_limited(retry_after=60)

        # 3 hits * 0.25 = 0.75, no errors
        score = p.priority_score
        assert score == pytest.approx(0.75)

    def test_should_reset_rate_limit_returns_false_when_no_hits(self):
        """should_reset_rate_limit() returns False when count is 0."""
        p = Provider(
            name="test",
            base_url="http://test",
            api_key="test-key",
            model="test-model",
        )

        assert p.rate_limit_count == 0
        assert p.should_reset_rate_limit() is False

    def test_should_reset_rate_limit_returns_false_when_no_timestamp(self):
        """should_reset_rate_limit() returns False when last_rate_limit_at is None."""
        p = Provider(
            name="test",
            base_url="http://test",
            api_key="test-key",
            model="test-model",
        )

        p.rate_limit_count = 5
        p.last_rate_limit_at = None

        assert p.should_reset_rate_limit() is False

    def test_mark_rate_limited_records_timestamp(self):
        """mark_rate_limited() sets last_rate_limit_at to current time."""
        p = Provider(
            name="test",
            base_url="http://test",
            api_key="test-key",
            model="test-model",
        )

        before = time.time()
        p.mark_rate_limited(retry_after=60)
        after = time.time()

        assert p.last_rate_limit_at is not None
        assert before <= p.last_rate_limit_at <= after
        assert p.rate_limit_count == 1
