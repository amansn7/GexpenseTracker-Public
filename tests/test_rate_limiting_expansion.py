"""Tests for rate limiting expansion: new endpoints, prefix matching, and per-user limits."""
import time
from unittest.mock import patch

from app.rate_limiter import RATE_LIMIT_PREFIXES, RATE_LIMITS, RateLimiter


class TestRateLimitsDict:
    """Verify all expected endpoints are in RATE_LIMITS."""

    def test_bulk_transactions_rate_limit(self):
        assert "/api/transactions/bulk" in RATE_LIMITS
        assert RATE_LIMITS["/api/transactions/bulk"] == (10, 60)

    def test_review_reprocess_all_rate_limit(self):
        assert "/api/review/reprocess-all" in RATE_LIMITS
        assert RATE_LIMITS["/api/review/reprocess-all"] == (5, 300)

    def test_ai_services_rate_limit(self):
        assert "/api/account/ai-services" in RATE_LIMITS
        assert RATE_LIMITS["/api/account/ai-services"] == (10, 60)

    def test_verify_2fa_rate_limit(self):
        assert "/api/auth/verify-2fa" in RATE_LIMITS
        assert RATE_LIMITS["/api/auth/verify-2fa"] == (5, 60)

    def test_emails_retrain_rate_limit(self):
        assert "/api/emails/retrain" in RATE_LIMITS
        assert RATE_LIMITS["/api/emails/retrain"] == (10, 60)

    def test_existing_limits_unchanged(self):
        assert RATE_LIMITS["/api/sync/trigger"] == (1, 60)
        assert RATE_LIMITS["/api/auth/google"] == (5, 60)
        assert RATE_LIMITS["/api/auth/callback"] == (5, 60)
        assert RATE_LIMITS["/api/auth/logout"] == (5, 60)
        assert RATE_LIMITS["/api/sync/backfill-bodies"] == (5, 300)
        assert RATE_LIMITS["/api/admin/reset-my-data"] == (3, 3600)
        assert RATE_LIMITS["/api/account/schedule-deletion"] == (3, 3600)


class TestRateLimitPrefixes:
    """Verify prefix matching for dynamic paths."""

    def test_transactions_prefix_exists(self):
        assert "/api/transactions/" in RATE_LIMIT_PREFIXES
        assert RATE_LIMIT_PREFIXES["/api/transactions/"] == (30, 60)

    def test_review_prefix_exists(self):
        assert "/api/review/" in RATE_LIMIT_PREFIXES
        assert RATE_LIMIT_PREFIXES["/api/review/"] == (20, 60)


class TestMatchRateLimit:
    """Test the _match_rate_limit helper function."""

    def _match(self, path):
        from app.main import _match_rate_limit
        return _match_rate_limit(path)

    def test_exact_match_bulk(self):
        assert self._match("/api/transactions/bulk") == (10, 60)

    def test_exact_match_reprocess_all(self):
        assert self._match("/api/review/reprocess-all") == (5, 300)

    def test_exact_match_ai_services(self):
        assert self._match("/api/account/ai-services") == (10, 60)

    def test_exact_match_verify_2fa(self):
        assert self._match("/api/auth/verify-2fa") == (5, 60)

    def test_prefix_match_transaction_by_id(self):
        assert self._match("/api/transactions/abc-123") == (30, 60)

    def test_prefix_match_transaction_patch(self):
        assert self._match("/api/transactions/tx-456") == (30, 60)

    def test_prefix_match_review_reprocess(self):
        assert self._match("/api/review/abc-123/reprocess") == (20, 60)

    def test_no_match_for_unrelated_path(self):
        assert self._match("/api/stats/summary") is None

    def test_no_match_for_health(self):
        assert self._match("/health") is None

    def test_exact_match_takes_precedence_over_prefix(self):
        result = self._match("/api/transactions/bulk")
        assert result == (10, 60)


class TestRateLimiterCore:
    """Test the RateLimiter class directly."""

    def setup_method(self):
        self.limiter = RateLimiter()

    def test_allows_within_limit(self):
        for i in range(10):
            assert self.limiter.is_allowed("user1", "/api/transactions/bulk", 10, 60) is True

    def test_blocks_after_limit(self):
        for i in range(10):
            self.limiter.is_allowed("user1", "/api/transactions/bulk", 10, 60)
        assert self.limiter.is_allowed("user1", "/api/transactions/bulk", 10, 60) is False

    def test_11th_bulk_action_blocked(self):
        """11 bulk actions in 60s → 429 on 11th."""
        for i in range(10):
            assert self.limiter.is_allowed("user1", "/api/transactions/bulk", 10, 60) is True
        assert self.limiter.is_allowed("user1", "/api/transactions/bulk", 10, 60) is False

    def test_6th_review_retrain_blocked(self):
        """6 review bulk-retrains in 300s → 429 on 6th."""
        for i in range(5):
            assert self.limiter.is_allowed("user1", "/api/review/reprocess-all", 5, 300) is True
        assert self.limiter.is_allowed("user1", "/api/review/reprocess-all", 5, 300) is False

    def test_rate_limit_resets_after_window(self):
        """Rate limit resets after window expires."""
        limiter = RateLimiter()
        for i in range(5):
            limiter.is_allowed("user1", "/api/auth/verify-2fa", 5, 60)
        assert limiter.is_allowed("user1", "/api/auth/verify-2fa", 5, 60) is False

        with patch("time.time", return_value=time.time() + 61):
            assert limiter.is_allowed("user1", "/api/auth/verify-2fa", 5, 60) is True

    def test_different_endpoints_have_separate_limits(self):
        limiter = RateLimiter()
        for i in range(10):
            limiter.is_allowed("user1", "/api/transactions/bulk", 10, 60)
        assert limiter.is_allowed("user1", "/api/transactions/bulk", 10, 60) is False
        assert limiter.is_allowed("user1", "/api/auth/verify-2fa", 5, 60) is True

    def test_different_users_have_separate_limits(self):
        limiter = RateLimiter()
        for i in range(10):
            limiter.is_allowed("user1", "/api/transactions/bulk", 10, 60)
        assert limiter.is_allowed("user1", "/api/transactions/bulk", 10, 60) is False
        assert limiter.is_allowed("user2", "/api/transactions/bulk", 10, 60) is True

    def test_cleanup_removes_stale_buckets(self):
        limiter = RateLimiter()
        limiter.is_allowed("user1", "/api/test", 5, 60)
        with patch("time.time", return_value=time.time() + 7201):
            limiter.cleanup(max_age_seconds=3600)
        assert limiter.is_allowed("user1", "/api/test", 5, 60) is True


class TestPerUserRateLimiting:
    """Test that authenticated requests use session token as identifier."""

    def test_session_token_used_as_identifier_for_authenticated(self):
        """Two different session tokens have separate rate limits (simulating per-user)."""
        limiter = RateLimiter()
        session_a = "aaaa1111"
        session_b = "bbbb2222"

        for i in range(10):
            assert limiter.is_allowed(session_a, "/api/transactions/bulk", 10, 60) is True
        assert limiter.is_allowed(session_a, "/api/transactions/bulk", 10, 60) is False
        assert limiter.is_allowed(session_b, "/api/transactions/bulk", 10, 60) is True

    def test_ip_used_as_identifier_for_unauthenticated(self):
        """Different IPs have separate rate limits (simulating per-IP for unauthenticated)."""
        limiter = RateLimiter()
        ip_a = "192.168.1.1"
        ip_b = "192.168.1.2"

        for i in range(10):
            assert limiter.is_allowed(ip_a, "/api/transactions/bulk", 10, 60) is True
        assert limiter.is_allowed(ip_a, "/api/transactions/bulk", 10, 60) is False
        assert limiter.is_allowed(ip_b, "/api/transactions/bulk", 10, 60) is True

    def test_same_ip_different_sessions_separate_limits(self):
        """Same IP but different session tokens = separate limits (prevents NAT collisions)."""
        limiter = RateLimiter()
        session_1 = "user1-session-token"
        session_2 = "user2-session-token"

        for i in range(5):
            limiter.is_allowed(session_1, "/api/auth/verify-2fa", 5, 60)
        assert limiter.is_allowed(session_1, "/api/auth/verify-2fa", 5, 60) is False
        assert limiter.is_allowed(session_2, "/api/auth/verify-2fa", 5, 60) is True


class TestDynamicPathRateLimiting:
    """Test that dynamic paths like /api/transactions/{id} are rate-limited."""

    def test_transaction_by_id_matches_prefix(self):
        """PATCH /api/transactions/{id} is rate-limited via prefix matching."""
        from app.main import _match_rate_limit

        assert _match_rate_limit("/api/transactions/tx-123") == (30, 60)
        assert _match_rate_limit("/api/transactions/abc-def-456") == (30, 60)
        assert _match_rate_limit("/api/transactions/bulk") == (10, 60)

    def test_review_reprocess_matches_prefix(self):
        """POST /api/review/{id}/reprocess is rate-limited via prefix matching."""
        from app.main import _match_rate_limit

        assert _match_rate_limit("/api/review/tx-456/reprocess") == (20, 60)
        assert _match_rate_limit("/api/review/abc-123/reprocess") == (20, 60)
        assert _match_rate_limit("/api/review/reprocess-all") == (5, 300)

    def test_prefix_rate_limit_enforced(self):
        """Prefix-matched paths enforce their rate limits."""
        limiter = RateLimiter()
        for i in range(30):
            assert limiter.is_allowed("user1", "/api/transactions/tx-123", 30, 60) is True
        assert limiter.is_allowed("user1", "/api/transactions/tx-123", 30, 60) is False

    def test_each_transaction_id_has_own_bucket(self):
        """Each transaction ID gets its own rate limit bucket (prevents abuse of single resource)."""
        limiter = RateLimiter()
        for i in range(30):
            limiter.is_allowed("user1", "/api/transactions/tx-001", 30, 60)
        assert limiter.is_allowed("user1", "/api/transactions/tx-001", 30, 60) is False
        assert limiter.is_allowed("user1", "/api/transactions/tx-002", 30, 60) is True
