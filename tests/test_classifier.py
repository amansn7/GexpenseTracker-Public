import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from app.classifier.classifier import classify_email, ClassificationResult
from app.classifier.llm_client import LLMClassification
from app.models import Label, TransactionStatus, ClassifierMethod


def _mock_verbose_result(label="expense", amount=499.0, merchant="Swiggy",
                          category="Food", txn_date="2026-04-10", confidence=0.95):
    return {
        "result": LLMClassification(
            label=label, amount=amount, merchant=merchant,
            category=category, txn_date=txn_date, confidence=confidence,
        ),
        "provider": "google",
        "model": "gemini-2.0-flash-exp",
        "prompt": "...",
        "raw_response": '{"label":"expense","amount":499.0,"merchant":"Swiggy","category":"Food","txn_date":"2026-04-10","confidence":0.95}',
    }


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
    assert result.classifier_method == ClassifierMethod.llm


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
