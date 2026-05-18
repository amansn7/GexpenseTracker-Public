import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from app.classifier.classifier import classify_email, ClassificationResult
from app.classifier.llm_client import LLMClassification
from app.models import Label, TransactionStatus, ClassifierMethod


def _mock_verbose_result(label="expense", amount=499.0, merchant="Swiggy",
                          category="Food", txn_date="2026-04-10", confidence=0.95,
                          source_currency=None):
    return {
        "result": LLMClassification(
            label=label, amount=amount, merchant=merchant,
            category=category, txn_date=txn_date, confidence=confidence,
            source_currency=source_currency,
        ),
        "provider": "google",
        "model": "gemini-2.0-flash-exp",
        "prompt": "...",
        "raw_response": '{"label":"expense","amount":499.0,"merchant":"Swiggy","category":"Food","txn_date":"2026-04-10","confidence":0.95}',
    }


@pytest.mark.asyncio
async def test_classify_email_default_currency_inr():
    """With no session/user, defaults to INR currency."""
    with patch("app.classifier.classifier.llm_client.classify_verbose",
               new_callable=AsyncMock, return_value=_mock_verbose_result()):
        result = await classify_email(
            email_id="e-curr", sender="s@bank.com", sender_domain="bank.com",
            subject="Debit", body_text="Rs.500 debited",
        )
    assert result.currency == "INR"
    assert result.source_currency is None


@pytest.mark.asyncio
async def test_classify_email_skips_conversion_when_source_is_inr():
    """INR source_currency → no conversion needed."""
    with patch("app.classifier.classifier.llm_client.classify_verbose",
               new_callable=AsyncMock,
               return_value=_mock_verbose_result(amount=500.0, source_currency="INR")):
        result = await classify_email(
            email_id="e-inr", sender="s@bank.com", sender_domain="bank.com",
            subject="Debit", body_text="Rs.500 debited",
        )
    assert result.amount == 500.0
    assert result.currency == "INR"


@pytest.mark.asyncio
async def test_classify_email_skips_conversion_no_source():
    """No source_currency → no conversion, keep amount as-is."""
    with patch("app.classifier.classifier.llm_client.classify_verbose",
               new_callable=AsyncMock,
               return_value=_mock_verbose_result(amount=500.0)):
        result = await classify_email(
            email_id="e-nosrc", sender="s@bank.com", sender_domain="bank.com",
            subject="Debit", body_text="Rs.500 debited",
        )
    assert result.amount == 500.0
    assert result.currency == "INR"


@pytest.mark.asyncio
async def test_classify_email_converts_foreign_currency():
    """Foreign source_currency triggers conversion."""
    with patch("app.classifier.classifier.llm_client.classify_verbose",
               new_callable=AsyncMock,
               return_value=_mock_verbose_result(
                   amount=5.90, merchant="Anthropic", category="Software",
                   source_currency="USD",
               )), \
         patch("app.classifier.classifier.convert_amount",
               new_callable=AsyncMock, return_value=491.47):
        result = await classify_email(
            email_id="e-fx", sender="alert@sbicard.com",
            sender_domain="sbicard.com",
            subject="Transaction alert",
            body_text="USD5.90 spent on your SBI Credit Card at ANTHROPIC",
        )
    assert result.amount == 491.47
    assert result.currency == "INR"
    assert result.source_currency == "USD"


@pytest.mark.asyncio
async def test_classify_email_always_calls_llm():
    """LLM is called for every email — no rule/ML bypass."""
    with patch("app.classifier.classifier.llm_client.classify_verbose",
               new_callable=AsyncMock, return_value=_mock_verbose_result()) as mock_llm:
        result = await classify_email(
            email_id="test-id",
            sender="noreply@swiggy.in",
            sender_domain="swiggy.in",
            subject="Your Swiggy order",
            body_text="Rs.499 debited for your order",
        )
    mock_llm.assert_called_once()
    assert result.label == Label.expense
    assert result.classifier_method == ClassifierMethod.llm


@pytest.mark.asyncio
async def test_classify_email_returns_correct_fields():
    """Result fields map correctly from LLM output."""
    with patch("app.classifier.classifier.llm_client.classify_verbose",
               new_callable=AsyncMock, return_value=_mock_verbose_result(
                   amount=1200.0, merchant="Netflix", category="Entertainment",
                   txn_date="2026-04-15", confidence=0.92)):
        result = await classify_email(
            email_id="e1",
            sender="info@netflix.com",
            sender_domain="netflix.com",
            subject="Your Netflix subscription",
            body_text="Rs.1200 charged",
        )
    assert result.amount == 1200.0
    assert result.category == "Entertainment"
    assert result.confidence == 0.92


@pytest.mark.asyncio
async def test_classify_email_high_confidence_is_auto():
    """confidence >= AUTO_CONFIRM_THRESHOLD → status=auto."""
    with patch("app.classifier.classifier.llm_client.classify_verbose",
               new_callable=AsyncMock, return_value=_mock_verbose_result(confidence=0.95)):
        result = await classify_email(
            email_id="e2", sender="s@bank.com", sender_domain="bank.com",
            subject="Debit alert", body_text="Rs.500 debited",
        )
    assert result.status == TransactionStatus.auto


@pytest.mark.asyncio
async def test_classify_email_low_confidence_is_needs_review():
    """confidence below threshold → status=needs_review."""
    with patch("app.classifier.classifier.llm_client.classify_verbose",
               new_callable=AsyncMock, return_value=_mock_verbose_result(confidence=0.5)):
        result = await classify_email(
            email_id="e3", sender="s@unknown.com", sender_domain="unknown.com",
            subject="Something", body_text="Some body",
        )
    assert result.status == TransactionStatus.needs_review


@pytest.mark.asyncio
async def test_classify_email_llm_failure_returns_ignore_no_exception():
    """All LLM providers fail → returns ignore/needs_review, does NOT raise."""
    with patch("app.classifier.classifier.llm_client.classify_verbose",
               new_callable=AsyncMock, side_effect=RuntimeError("No providers")):
        result = await classify_email(
            email_id="e4", sender="s@x.com", sender_domain="x.com",
            subject="Hi", body_text="Hello",
        )
    assert result.label == Label.ignore
    assert result.confidence == 0.0
    assert result.status == TransactionStatus.needs_review
    assert result.classifier_method == ClassifierMethod.rule  # Falls back to rules when LLM fails


@pytest.mark.asyncio
async def test_classify_email_writes_log_when_session_provided():
    """When a session is passed, a ClassificationLog row is added."""
    mock_session = MagicMock()
    mock_session.add = MagicMock()

    with patch("app.classifier.classifier.llm_client.classify_verbose",
               new_callable=AsyncMock, return_value=_mock_verbose_result()):
        await classify_email(
            email_id="e5", sender="s@bank.com", sender_domain="bank.com",
            subject="Debit", body_text="Rs.100 debited",
            session=mock_session,
        )
    mock_session.add.assert_called_once()
    log_row = mock_session.add.call_args[0][0]
    from app.models import ClassificationLog
    assert isinstance(log_row, ClassificationLog)
    assert log_row.email_id == "e5"
    assert log_row.provider == "google"
    assert log_row.llm_label == "expense"


@pytest.mark.asyncio
async def test_classify_email_no_session_does_not_crash():
    """session=None (default) → no log write, no crash."""
    with patch("app.classifier.classifier.llm_client.classify_verbose",
               new_callable=AsyncMock, return_value=_mock_verbose_result()):
        result = await classify_email(
            email_id=None, sender="s@bank.com", sender_domain="bank.com",
            subject="Debit", body_text="Rs.100 debited",
        )
    assert result.label == Label.expense


@pytest.mark.asyncio
async def test_classify_email_bad_label_defaults_to_ignore():
    """LLM returns unrecognised label (wrong case / typo) → Label.ignore, no raise."""
    for bad_label in ("Expense", "EXPENSE", "debit", "unknown", ""):
        with patch("app.classifier.classifier.llm_client.classify_verbose",
                   new_callable=AsyncMock,
                   return_value=_mock_verbose_result(label=bad_label)):
            result = await classify_email(
                email_id="e-bad", sender="s@bank.com", sender_domain="bank.com",
                subject="Alert", body_text="Rs.100 debited",
            )
        assert result.label == Label.ignore, f"expected ignore for label={bad_label!r}"
        assert result.classifier_method == ClassifierMethod.llm


@pytest.mark.asyncio
async def test_classify_email_empty_merchant_stored_as_none():
    """LLM returns empty-string merchant → result.merchant is None, not ''."""
    with patch("app.classifier.classifier.llm_client.classify_verbose",
               new_callable=AsyncMock,
               return_value=_mock_verbose_result(merchant="")):
        result = await classify_email(
            email_id="e-merch", sender="s@bank.com", sender_domain="bank.com",
            subject="Debit", body_text="Rs.50 debited",
        )
    assert result.merchant is None


@pytest.mark.asyncio
async def test_classify_email_anthropic_usd_converts_to_inr():
    """Anthropic USD transaction: LLM returns USD amount + source_currency, classifier converts to INR."""
    with patch("app.classifier.classifier.llm_client.classify_verbose",
               new_callable=AsyncMock,
               return_value=_mock_verbose_result(
                   amount=5.90, merchant="Anthropic", category="Subscriptions",
                   source_currency="USD", confidence=0.95,
               )), \
         patch("app.classifier.classifier.convert_amount",
               new_callable=AsyncMock, return_value=491.47):
        result = await classify_email(
            email_id="e-anthropic", sender="alert@sbicard.com",
            sender_domain="sbicard.com",
            subject="Transaction Alert from CASHBACK SBI Card",
            body_text="SBI Card TRANSACTION ALERT! Dear Cardholder, This is to inform you that, USD5.90 spent on your SBI Credit Card ending 7853 at ANTHROPIC on 17/05/26.",
        )
    assert result.amount == 491.47
    assert result.currency == "INR"
    assert result.source_currency == "USD"
    assert result.category == "Subscriptions"
    assert result.merchant == "Anthropic"
    assert result.label == Label.expense
