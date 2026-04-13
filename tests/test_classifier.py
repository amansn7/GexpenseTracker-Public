import pytest
from unittest.mock import AsyncMock, patch
from app.classifier.classifier import classify_email
from app.classifier.llm_client import LLMClassification
from app.models import Label, TransactionStatus, ClassifierMethod

@pytest.mark.asyncio
async def test_high_confidence_rule_skips_llm():
    with patch("app.classifier.classifier.llm_client.classify") as mock_llm:
        result = await classify_email(
            sender="no-reply@amazon.in",
            sender_domain="amazon.in",
            subject="Your order has been confirmed",
            body_snippet="Amount charged ₹499",
        )
    mock_llm.assert_not_called()
    assert result.label == Label.expense
    assert result.classifier_method == ClassifierMethod.rule
    assert result.status == TransactionStatus.auto

@pytest.mark.asyncio
async def test_high_confidence_rule_preserves_detected_merchant():
    result = await classify_email(
        sender="alerts@bank.com",
        sender_domain="bank.com",
        subject="Debit alert",
        body_snippet="Rs.488 debited towards WWW SWIGGY IN",
    )
    assert result.label == Label.expense
    assert result.classifier_method == ClassifierMethod.rule
    assert result.merchant == "Swiggy"
    assert result.category == "Food"

@pytest.mark.asyncio
async def test_low_confidence_calls_llm():
    mock_result = LLMClassification(
        label="expense", amount=150.0, merchant="Café",
        category="Food", txn_date="2026-04-10", confidence=0.90
    )
    with patch("app.classifier.classifier.llm_client.classify", new_callable=AsyncMock, return_value=mock_result):
        result = await classify_email(
            sender="noreply@unknowncafe.com",
            sender_domain="unknowncafe.com",
            subject="Thank you for dining",
            body_snippet="Your bill is ₹150",
        )
    assert result.label == Label.expense
    assert result.amount == 150.0
    assert result.classifier_method == ClassifierMethod.llm
    assert result.status == TransactionStatus.auto

@pytest.mark.asyncio
async def test_llm_failure_returns_needs_review():
    with patch("app.classifier.classifier.llm_client.classify", new_callable=AsyncMock, side_effect=Exception("API error")):
        result = await classify_email(
            sender="x@unknown.org",
            sender_domain="unknown.org",
            subject="Random subject",
            body_snippet="Some body text",
        )
    assert result.status == TransactionStatus.needs_review
    assert result.confidence == 0.0

@pytest.mark.asyncio
async def test_low_llm_confidence_needs_review():
    mock_result = LLMClassification(
        label="expense", amount=50.0, merchant=None,
        category=None, txn_date=None, confidence=0.50
    )
    with patch("app.classifier.classifier.llm_client.classify", new_callable=AsyncMock, return_value=mock_result):
        result = await classify_email(
            sender="x@mystery.com",
            sender_domain="mystery.com",
            subject="Possible receipt",
            body_snippet="payment details",
        )
    assert result.status == TransactionStatus.needs_review
