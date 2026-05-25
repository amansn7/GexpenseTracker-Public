from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.alerts import clear_alerts, get_alerts
from app.classifier.classifier import ClassificationResult
from app.models import ClassifierMethod, Label


def _make_result(method=ClassifierMethod.llm):
    return ClassificationResult(
        label=Label.expense,
        amount=100.0,
        merchant="Test",
        category="Food",
        confidence=0.9,
        classifier_method=method,
    )


def _make_mock_execute_result(scalar=None, rows=None):
    """Create a proper mock for session.execute() return value."""
    result = MagicMock()
    if scalar is not None:
        result.scalar_one_or_none.return_value = scalar
    if rows is not None:
        result.all.return_value = rows
    return result


class TestClassificationAlerts:
    """Tests for alerting when batch classification degrades to rules-only."""

    @pytest.fixture(autouse=True)
    def clear_alerts_before_each(self):
        clear_alerts()
        yield
        clear_alerts()

    def _make_mock_session(self):
        mock_session = MagicMock()
        mock_session.commit = AsyncMock()
        mock_session.add = MagicMock()
        mock_session.flush = AsyncMock()
        return mock_session

    @pytest.mark.asyncio
    async def test_alert_created_when_over_50_percent_rules_fallback(self):
        """When > 50% of emails use rules fallback, a warning alert is created."""
        from app.sync.fetch import _sync_emails_inner

        mock_session = self._make_mock_session()
        sync_state_result = _make_mock_execute_result(scalar=None, rows=[])
        mock_session.execute = AsyncMock(return_value=sync_state_result)

        mock_prog = {
            "running": True,
            "phase": "fetching",
            "phase_detail": "",
            "total": 0,
            "current": 0,
            "tally": {},
            "current_email": None,
        }

        mock_uid = "test-user"
        mock_user_id = "test-user"

        messages = [
            {
                "gmail_id": f"msg-{i}",
                "sender": f"s{i}@x.com",
                "sender_domain": "x.com",
                "subject": f"Test {i}",
                "body_text": f"Body {i}",
                "body_snippet": f"Body {i}",
            }
            for i in range(4)
        ]

        # All 4 emails classified with rules (LLM failed)
        classifications = [_make_result(ClassifierMethod.rule) for _ in range(4)]

        # Mock _apply_pre_filter to pass all messages through
        async def mock_pre_filter(session, msgs, user_id, prog, uid):
            from app.models import Email

            pairs = []
            for msg in msgs:
                email = Email(**msg)
                if user_id:
                    email.user_id = user_id
                email.pre_filter_status = "passed"
                pairs.append((email, msg))
            return pairs, 0

        with (
            patch("app.sync.fetch.fetch_new_messages", return_value=(messages, 12345)),
            patch("app.sync.fetch.get_credentials_for_user", return_value=MagicMock()),
            patch("app.sync.fetch._apply_pre_filter", side_effect=mock_pre_filter),
            patch("app.sync.fetch._classify_batch", new_callable=AsyncMock, return_value=classifications),
            patch("app.sync.fetch._persist_transactions", new_callable=AsyncMock, return_value=([], 4)),
        ):
            await _sync_emails_inner(
                mock_session,
                mock_user_id,
                mock_uid,
                mock_prog,
                None,
                None,
                "all",
            )

        alerts = get_alerts()
        warning_alerts = [a for a in alerts if a["level"] == "warning" and a["source"] == "classifier"]
        assert len(warning_alerts) == 1
        assert "4/4" in warning_alerts[0]["message"]
        assert "rules only" in warning_alerts[0]["message"].lower()

    @pytest.mark.asyncio
    async def test_no_alert_when_under_50_percent_rules_fallback(self):
        """When < 50% of emails use rules fallback, no warning alert is created."""
        from app.sync.fetch import _sync_emails_inner

        mock_session = self._make_mock_session()
        sync_state_result = _make_mock_execute_result(scalar=None, rows=[])
        mock_session.execute = AsyncMock(return_value=sync_state_result)

        mock_prog = {
            "running": True,
            "phase": "fetching",
            "phase_detail": "",
            "total": 0,
            "current": 0,
            "tally": {},
            "current_email": None,
        }

        messages = [
            {
                "gmail_id": f"msg-{i}",
                "sender": f"s{i}@x.com",
                "sender_domain": "x.com",
                "subject": f"Test {i}",
                "body_text": f"Body {i}",
                "body_snippet": f"Body {i}",
            }
            for i in range(4)
        ]

        # 1 rules, 3 LLM → 25% rules, below threshold
        classifications = [
            _make_result(ClassifierMethod.rule),
            _make_result(ClassifierMethod.llm),
            _make_result(ClassifierMethod.llm),
            _make_result(ClassifierMethod.llm),
        ]

        async def mock_pre_filter(session, msgs, user_id, prog, uid):
            from app.models import Email

            pairs = []
            for msg in msgs:
                email = Email(**msg)
                if user_id:
                    email.user_id = user_id
                email.pre_filter_status = "passed"
                pairs.append((email, msg))
            return pairs, 0

        with (
            patch("app.sync.fetch.fetch_new_messages", return_value=(messages, 12345)),
            patch("app.sync.fetch.get_credentials_for_user", return_value=MagicMock()),
            patch("app.sync.fetch._apply_pre_filter", side_effect=mock_pre_filter),
            patch("app.sync.fetch._classify_batch", new_callable=AsyncMock, return_value=classifications),
            patch("app.sync.fetch._persist_transactions", new_callable=AsyncMock, return_value=([], 4)),
        ):
            await _sync_emails_inner(
                mock_session,
                "test-user",
                "test-user",
                mock_prog,
                None,
                None,
                "all",
            )

        alerts = get_alerts()
        warning_alerts = [a for a in alerts if a["level"] == "warning" and a["source"] == "classifier"]
        assert len(warning_alerts) == 0

    @pytest.mark.asyncio
    async def test_no_alert_when_all_emails_use_llm(self):
        """When all emails use LLM, no warning alert is created."""
        from app.sync.fetch import _sync_emails_inner

        mock_session = self._make_mock_session()
        sync_state_result = _make_mock_execute_result(scalar=None, rows=[])
        mock_session.execute = AsyncMock(return_value=sync_state_result)

        mock_prog = {
            "running": True,
            "phase": "fetching",
            "phase_detail": "",
            "total": 0,
            "current": 0,
            "tally": {},
            "current_email": None,
        }

        messages = [
            {
                "gmail_id": f"msg-{i}",
                "sender": f"s{i}@x.com",
                "sender_domain": "x.com",
                "subject": f"Test {i}",
                "body_text": f"Body {i}",
                "body_snippet": f"Body {i}",
            }
            for i in range(3)
        ]

        classifications = [_make_result(ClassifierMethod.llm) for _ in range(3)]

        async def mock_pre_filter(session, msgs, user_id, prog, uid):
            from app.models import Email

            pairs = []
            for msg in msgs:
                email = Email(**msg)
                if user_id:
                    email.user_id = user_id
                email.pre_filter_status = "passed"
                pairs.append((email, msg))
            return pairs, 0

        with (
            patch("app.sync.fetch.fetch_new_messages", return_value=(messages, 12345)),
            patch("app.sync.fetch.get_credentials_for_user", return_value=MagicMock()),
            patch("app.sync.fetch._apply_pre_filter", side_effect=mock_pre_filter),
            patch("app.sync.fetch._classify_batch", new_callable=AsyncMock, return_value=classifications),
            patch("app.sync.fetch._persist_transactions", new_callable=AsyncMock, return_value=([], 3)),
        ):
            await _sync_emails_inner(
                mock_session,
                "test-user",
                "test-user",
                mock_prog,
                None,
                None,
                "all",
            )

        alerts = get_alerts()
        warning_alerts = [a for a in alerts if a["level"] == "warning" and a["source"] == "classifier"]
        assert len(warning_alerts) == 0

    def test_warning_log_message_content(self):
        """Verify the warning alert message contains expected content."""
        from app.alerts import add_alert

        add_alert(
            "warning",
            "3/5 emails classified with rules only (LLM unavailable). Check AI service configuration.",
            source="classifier",
        )

        alerts = get_alerts()
        assert len(alerts) == 1
        alert = alerts[0]
        assert alert["level"] == "warning"
        assert alert["source"] == "classifier"
        assert "rules only" in alert["message"].lower()
        assert "LLM unavailable" in alert["message"]
        assert "Check AI service configuration" in alert["message"]
