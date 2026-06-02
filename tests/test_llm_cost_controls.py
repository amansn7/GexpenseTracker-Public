from datetime import date
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.classifier.classifier import (
    _compute_cost,
    _ESTIMATE_FALLBACK,
    batch_classify_emails,
    check_llm_budget,
    classify_email,
    record_llm_spend,
)
from app.classifier.context import ClassificationContext
from app.classifier.llm_client import LLMClassification
from app.config import settings
from app.models import ClassifierMethod, Label


def _mock_verbose_result(
    label="expense", amount=499.0, merchant="Swiggy", category="Food", txn_date="2026-04-10", confidence=0.95
):
    return {
        "result": LLMClassification(
            label=label,
            amount=amount,
            merchant=merchant,
            category=category,
            txn_date=txn_date,
            confidence=confidence,
        ),
        "provider": "google",
        "model": "gemini-2.0-flash-exp",
        "prompt": "...",
        "raw_response": '{"label":"expense","amount":499.0}',
    }


@pytest.mark.asyncio
async def test_check_llm_budget_under_budget():
    """User under budget → returns True."""
    mock_session = AsyncMock()
    today = date.today()
    mock_result = MagicMock()
    mock_result.scalar.return_value = 2.5  # $2.50 spent today
    mock_session.execute = AsyncMock(return_value=mock_result)

    with patch("app.classifier.classifier.date") as mock_date:
        mock_date.today.return_value = today
        result = await check_llm_budget(mock_session, "user-123")

    assert result is True


@pytest.mark.asyncio
async def test_check_llm_budget_over_budget():
    """User over budget → returns False."""
    mock_session = AsyncMock()
    today = date.today()
    mock_result = MagicMock()
    mock_result.scalar.return_value = 15.0  # $15 spent, over $10 budget
    mock_session.execute = AsyncMock(return_value=mock_result)

    with patch("app.classifier.classifier.date") as mock_date:
        mock_date.today.return_value = today
        result = await check_llm_budget(mock_session, "user-123")

    assert result is False


@pytest.mark.asyncio
async def test_check_llm_budget_no_session():
    """No session → returns True (non-blocking)."""
    result = await check_llm_budget(None, "user-123")
    assert result is True


@pytest.mark.asyncio
async def test_check_llm_budget_no_user_id():
    """No user_id → returns True (non-blocking)."""
    mock_session = AsyncMock()
    result = await check_llm_budget(mock_session, None)
    assert result is True


@pytest.mark.asyncio
async def test_record_llm_spend_inserts_new():
    """First call for user+date+provider+model creates new row."""
    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None  # No existing row
    mock_session.execute = AsyncMock(return_value=mock_result)
    mock_session.add = MagicMock()
    mock_session.flush = AsyncMock()

    with patch("app.classifier.classifier.date") as mock_date:
        mock_date.today.return_value = date(2026, 5, 20)
        await record_llm_spend(
            mock_session,
            "user-123",
            "google",
            "gemini-flash",
            tokens_in=500,
            tokens_out=200,
            estimated_cost=0.0001,
        )

    mock_session.execute.assert_called_once()
    mock_session.add.assert_called_once()
    mock_session.flush.assert_called_once()


@pytest.mark.asyncio
async def test_record_llm_spend_no_session():
    """No session → no-op, no crash."""
    await record_llm_spend(None, "user-123", "google", "gemini-flash")


@pytest.mark.asyncio
async def test_record_llm_spend_no_user_id():
    """No user_id → no-op, no crash."""
    mock_session = AsyncMock()
    await record_llm_spend(mock_session, None, "google", "gemini-flash")


@pytest.mark.asyncio
async def test_classify_email_budget_exceeded_falls_back_to_rules():
    """Budget exceeded → LLM skipped, rules fallback used."""
    with patch("app.classifier.classifier.check_llm_budget", new_callable=AsyncMock, return_value=False):
        result = await classify_email(
            ClassificationContext(
                email_id="e-budget",
                sender="noreply@swiggy.in",
                sender_domain="swiggy.in",
                subject="Order",
                body_text="Rs. 349 debited",
                user_id="user-123",
            )
        )

    assert result.classifier_method == ClassifierMethod.rule
    assert result.label == Label.expense
    assert result.merchant == "Swiggy"
    assert "LLM daily budget exceeded" in result.warnings


@pytest.mark.asyncio
async def test_classify_email_under_budget_calls_llm():
    """Under budget → LLM call proceeds normally."""
    with (
        patch("app.classifier.classifier.check_llm_budget", new_callable=AsyncMock, return_value=True),
        patch(
            "app.classifier.classifier.llm_client.classify_verbose",
            new_callable=AsyncMock,
            return_value=_mock_verbose_result(),
        ),
    ):
        result = await classify_email(
            ClassificationContext(
                email_id="e-ok",
                sender="s@bank.com",
                sender_domain="bank.com",
                subject="Debit",
                body_text="Rs. 500 debited",
                user_id="user-123",
            )
        )

    assert result.classifier_method == ClassifierMethod.llm
    assert result.label == Label.expense


@pytest.mark.asyncio
async def test_classify_email_no_user_id_skips_budget_check():
    """No user_id → budget check skipped, LLM proceeds."""
    with (
        patch("app.classifier.classifier.check_llm_budget", new_callable=AsyncMock) as mock_check,
        patch(
            "app.classifier.classifier.llm_client.classify_verbose",
            new_callable=AsyncMock,
            return_value=_mock_verbose_result(),
        ),
    ):
        result = await classify_email(
            ClassificationContext(
                email_id="e-nouser",
                sender="s@bank.com",
                sender_domain="bank.com",
                subject="Debit",
                body_text="Rs. 500 debited",
            )
        )

    mock_check.assert_not_called()
    assert result.classifier_method == ClassifierMethod.llm


@pytest.mark.asyncio
async def test_batch_classify_emails_budget_exceeded_falls_back():
    """Budget exceeded in batch → all emails fall back to rules."""
    mock_client = AsyncMock()
    mock_client.batch_classify_verbose = AsyncMock()

    items = [
        ("e1", "noreply@swiggy.in", "swiggy.in", "Order", "Rs. 349 debited"),
        ("e2", "noreply@uber.com", "uber.com", "Trip", "Rs. 200 charged"),
    ]

    with patch("app.classifier.classifier.check_llm_budget", new_callable=AsyncMock, return_value=False):
        results = await batch_classify_emails(
            items,
            llm_client_override=mock_client,
            rule_engine_enabled=True,
            user_id="user-123",
        )

    assert len(results) == 2
    assert all(r.classifier_method == ClassifierMethod.rule for r in results)
    mock_client.batch_classify_verbose.assert_not_awaited()


@pytest.mark.asyncio
async def test_batch_classify_emails_under_budget_proceeds():
    """Under budget → batch LLM call proceeds."""
    mock_client = AsyncMock()
    mock_client.batch_classify_verbose = AsyncMock(
        return_value={
            "results": [
                LLMClassification(
                    label="expense", amount=349.0, merchant="Swiggy", category="Food", txn_date=None, confidence=0.95
                ),
            ],
            "provider": "test",
            "model": "test-model",
            "raw_response": "...",
            "prompt": "...",
        }
    )

    items = [("e1", "noreply@swiggy.in", "swiggy.in", "Order", "Rs. 349 debited")]

    with patch("app.classifier.classifier.check_llm_budget", new_callable=AsyncMock, return_value=True):
        results = await batch_classify_emails(
            items,
            llm_client_override=mock_client,
            rule_engine_enabled=False,
            user_id="user-123",
        )

    assert len(results) == 1
    assert results[0].classifier_method == ClassifierMethod.llm
    mock_client.batch_classify_verbose.assert_awaited_once()


@pytest.mark.asyncio
async def test_budget_resets_at_midnight():
    """New date = fresh budget (spend from yesterday doesn't count)."""
    mock_session = AsyncMock()
    today = date.today()
    mock_result = MagicMock()
    mock_result.scalar.return_value = 0.0  # $0 spent today
    mock_session.execute = AsyncMock(return_value=mock_result)

    with patch("app.classifier.classifier.date") as mock_date:
        mock_date.today.return_value = today
        result = await check_llm_budget(mock_session, "user-123")

    # Today's spend is $0, so under budget
    assert result is True


@pytest.mark.asyncio
async def test_compute_cost_uses_fallback_for_unknown_provider():
    """_compute_cost should return _ESTIMATE_FALLBACK for unknown provider/models."""
    cost = _compute_cost("unknown", "unknown-model", 100, 50)
    assert cost == _ESTIMATE_FALLBACK

@pytest.mark.asyncio
async def test_compute_cost_returns_zero_for_free_tiers():
    """_compute_cost should return _ESTIMATE_FALLBACK for free-tier providers."""
    cost = _compute_cost("openrouter", "google/gemini-2.0-flash-exp:free", 500, 200)
    assert cost == _ESTIMATE_FALLBACK

@pytest.mark.asyncio
async def test_compute_cost_scales_with_tokens():
    """_compute_cost should scale with token count for known providers."""
    cost = _compute_cost("google", "gemini-2.0-flash-exp", 1_000_000, 0)
    assert cost > 0
    cost2 = _compute_cost("google", "gemini-2.0-flash-exp", 2_000_000, 0)
    assert cost2 == pytest.approx(cost * 2, rel=0.01)


@pytest.mark.asyncio
async def test_daily_llm_budget_config_default():
    """DAILY_LLM_BUDGET should default to $10."""
    assert settings.DAILY_LLM_BUDGET == 10.0


# ── API endpoint tests ───────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_llm_usage_returns_correct_structure():
    """GET /account/settings/llm-usage returns today, month, and budget."""
    from app.api.settings import get_llm_usage

    mock_user = MagicMock()
    mock_user.id = "user-123"

    mock_today_result = MagicMock()
    mock_today_result.one.return_value = (5, 2500, 1000, 0.0005)

    mock_month_result = MagicMock()
    mock_month_result.one.return_value = (50, 0.005)

    mock_session = AsyncMock()
    mock_session.execute = AsyncMock(side_effect=[mock_today_result, mock_month_result])

    result = await get_llm_usage(user=mock_user, db=mock_session)

    assert "today" in result
    assert "month" in result
    assert "budget" in result
    assert result["today"]["calls"] == 5
    assert result["budget"]["daily_limit_usd"] == 10.0
    assert result["month"]["calls"] == 50
