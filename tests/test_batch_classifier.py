import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from app.classifier.classifier import (
    _extract_amount, _rules_fallback_result, batch_classify_emails,
    ClassificationResult,
)
from app.classifier.llm_client import _parse_batch_response, LLMClassification
from app.models import Label, TransactionStatus, ClassifierMethod


# ── _extract_amount ──────────────────────────────────────────────────────────

def test_extract_amount_rs():
    assert _extract_amount("Rs. 500 debited") == 500.0

def test_extract_amount_inr():
    assert _extract_amount("INR 1,299 charged") == 1299.0

def test_extract_amount_rupee_symbol():
    assert _extract_amount("₹ 349 paid") == 349.0

def test_extract_amount_bare_number_requires_prefix():
    assert _extract_amount("amount 500.00") is None

def test_extract_amount_zero():
    assert _extract_amount("Rs.0") == 0.0

def test_extract_amount_with_cents():
    assert _extract_amount("credited Rs.1,234.56") == 1234.56

def test_extract_amount_no_match():
    assert _extract_amount("no money here") is None

def test_extract_amount_empty():
    assert _extract_amount("") is None

def test_extract_amount_bare_int_no_match():
    assert _extract_amount("5 unread messages") is None

def test_extract_amount_date_no_match():
    assert _extract_amount("Payment due on 2026-05-15") is None


# ── _rules_fallback_result ───────────────────────────────────────────────────

def test_rules_fallback_known_domain_expense():
    result = _rules_fallback_result("swiggy.in", "Order confirmed", "Rs. 349 debited from account", None)
    assert result.label == Label.expense
    assert result.merchant == "Swiggy"
    assert result.amount == 349.0
    assert result.category == "Food"
    assert result.classifier_method == ClassifierMethod.rule

def test_rules_fallback_income_keyword():
    result = _rules_fallback_result("bank.com", "Salary credited", "Rs. 50,000 credited to account", None)
    assert result.label == Label.income
    assert result.amount == 50000.0
    assert result.category == "Income"

def test_rules_fallback_ignore_keyword():
    result = _rules_fallback_result("marketing.com", "Great offer!", "Click here for promotional offer", None)
    assert result.label == Label.ignore
    assert result.merchant is None
    assert result.amount is None

def test_rules_fallback_unknown_no_amount():
    result = _rules_fallback_result("unknown.com", "Hello", "Just a friendly email", None)
    assert result.label == Label.ignore
    assert result.amount is None
    assert result.confidence == 0.0

def test_rules_fallback_empty_body():
    result = _rules_fallback_result("test.com", "Subject", "", None)
    assert result.label == Label.ignore


# ── _parse_batch_response ────────────────────────────────────────────────────

def test_parse_batch_valid_array():
    raw = '[{"label":"expense","amount":500.0,"merchant":"Swiggy","category":"Food","txn_date":"2026-04-10","confidence":0.95}]'
    results = _parse_batch_response(raw, 1)
    assert len(results) == 1
    assert results[0].label == "expense"
    assert results[0].amount == 500.0
    assert results[0].merchant == "Swiggy"

def test_parse_batch_pads_to_expected():
    raw = '[{"label":"expense","amount":100.0,"merchant":"X","category":"Food","txn_date":null,"confidence":0.9}]'
    results = _parse_batch_response(raw, 3)
    assert len(results) == 3
    assert results[0].label == "expense"
    assert results[1].label == "ignore"
    assert results[1].amount is None
    assert results[2].label == "ignore"

def test_parse_batch_truncates_overflow():
    raw = '[{"label":"expense","amount":1.0,"merchant":"A","category":"Food","txn_date":null,"confidence":0.9},{"label":"income","amount":2.0,"merchant":"B","category":"Income","txn_date":null,"confidence":0.9}]'
    results = _parse_batch_response(raw, 1)
    assert len(results) == 1
    assert results[0].label == "expense"
    assert results[0].amount == 1.0

def test_parse_batch_non_list_wraps():
    raw = '{"label":"ignore","amount":null,"merchant":null,"category":null,"txn_date":null,"confidence":0.5}'
    results = _parse_batch_response(raw, 1)
    assert len(results) == 1
    assert results[0].label == "ignore"

def test_parse_batch_non_dict_items_default():
    raw = '[42, "hello"]'
    results = _parse_batch_response(raw, 2)
    assert len(results) == 2
    for r in results:
        assert r.label == "ignore"
        assert r.confidence == 0.0

def test_parse_batch_markdown_fence():
    raw = '```json\n[{"label":"expense","amount":250.0,"merchant":"Uber","category":"Travel","txn_date":null,"confidence":0.88}]\n```'
    results = _parse_batch_response(raw, 1)
    assert len(results) == 1
    assert results[0].label == "expense"
    assert results[0].amount == 250.0
    assert results[0].merchant == "Uber"

def test_parse_batch_bad_json_raises():
    with pytest.raises(ValueError, match="Cannot parse batch response"):
        _parse_batch_response("not json at all", 1)


# ── batch_classify_emails ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_batch_empty_items():
    results = await batch_classify_emails([])
    assert results == []

@pytest.mark.asyncio
async def test_batch_rule_prefilter_skips_high_conf_ignore():
    items = [("e1", "marketing@spam.com", "spam.com", "Great offer!", "Click here for promotional offer")]
    results = await batch_classify_emails(items, rule_engine_enabled=True, use_llm=True)
    assert len(results) == 1
    assert results[0].label == Label.ignore
    assert results[0].classifier_method == ClassifierMethod.rule

@pytest.mark.asyncio
async def test_batch_no_llm_falls_back_to_rules():
    items = [("e1", "noreply@swiggy.in", "swiggy.in", "Order", "Rs. 349 debited")]
    results = await batch_classify_emails(items, rule_engine_enabled=True, use_llm=False)
    assert len(results) == 1
    assert results[0].label == Label.expense
    assert results[0].merchant == "Swiggy"
    assert results[0].amount == 349.0
    assert results[0].classifier_method == ClassifierMethod.rule

@pytest.mark.asyncio
async def test_batch_llm_success():
    mock_client = AsyncMock()
    mock_client.batch_classify_verbose = AsyncMock(return_value={
        "results": [
            LLMClassification(label="expense", amount=499.0, merchant="Swiggy",
                              category="Food", txn_date="2026-04-10", confidence=0.95),
        ],
        "provider": "test",
        "model": "test-model",
        "raw_response": '[{"label":"expense","amount":499.0,"merchant":"Swiggy","category":"Food","txn_date":"2026-04-10","confidence":0.95}]',
        "prompt": "...",
    })

    items = [("e1", "noreply@swiggy.in", "swiggy.in", "Order", "Rs. 499 debited")]
    results = await batch_classify_emails(
        items, llm_client_override=mock_client, rule_engine_enabled=False,
    )
    assert len(results) == 1
    assert results[0].label == Label.expense
    assert results[0].amount == 499.0
    assert results[0].merchant == "swiggy"
    assert results[0].classifier_method == ClassifierMethod.llm
    assert results[0].status == TransactionStatus.auto

@pytest.mark.asyncio
async def test_batch_llm_failure_falls_back_to_rules():
    mock_client = AsyncMock()
    mock_client.batch_classify_verbose = AsyncMock(side_effect=RuntimeError("LLM down"))

    items = [("e1", "noreply@swiggy.in", "swiggy.in", "Order", "Rs. 349 debited")]
    results = await batch_classify_emails(
        items, llm_client_override=mock_client, rule_engine_enabled=False,
    )
    assert len(results) == 1
    assert results[0].label == Label.expense
    assert results[0].merchant == "Swiggy"
    assert results[0].amount == 349.0
    assert results[0].classifier_method == ClassifierMethod.rule

@pytest.mark.asyncio
async def test_batch_mixed_rule_prefilter_and_llm():
    mock_client = AsyncMock()
    mock_client.batch_classify_verbose = AsyncMock(return_value={
        "results": [
            LLMClassification(label="expense", amount=200.0, merchant="Uber",
                              category="Travel", txn_date="2026-04-11", confidence=0.9),
        ],
        "provider": "test",
        "model": "test-model",
        "raw_response": "...",
        "prompt": "...",
    })

    items = [
        ("e1", "marketing@spam.com", "spam.com", "Great offer!", "Click here for promotional offer"),
        ("e2", "noreply@uber.com", "uber.com", "Trip receipt", "Rs. 200 charged"),
    ]
    results = await batch_classify_emails(
        items, llm_client_override=mock_client, rule_engine_enabled=True, use_llm=True,
    )
    assert len(results) == 2
    assert results[0].label == Label.ignore
    assert results[0].classifier_method == ClassifierMethod.rule
    assert results[1].label == Label.expense
    assert results[1].amount == 200.0
    assert results[1].classifier_method == ClassifierMethod.llm

    mock_client.batch_classify_verbose.assert_awaited_once()

@pytest.mark.asyncio
async def test_batch_splits_across_multiple_batches():
    mock_client = AsyncMock()
    mock_client.batch_classify_verbose = AsyncMock(return_value={
        "results": [
            LLMClassification(label="expense", amount=float(i), merchant="X",
                              category="Food", txn_date=None, confidence=0.9)
            for i in range(2)
        ],
        "provider": "test",
        "model": "test-model",
        "raw_response": "...",
        "prompt": "...",
    })

    items = [(f"e{i}", f"sender{i}@x.com", "x.com", "Subj", "Body") for i in range(5)]
    results = await batch_classify_emails(
        items, llm_client_override=mock_client, rule_engine_enabled=False, batch_size=2,
    )
    assert len(results) == 5
    assert mock_client.batch_classify_verbose.await_count == 3

@pytest.mark.asyncio
async def test_batch_writes_classification_log_when_session_provided():
    mock_client = AsyncMock()
    mock_client.batch_classify_verbose = AsyncMock(return_value={
        "results": [
            LLMClassification(label="expense", amount=100.0, merchant="Netflix",
                              category="Entertainment", txn_date="2026-04-15", confidence=0.92),
        ],
        "provider": "test-provider",
        "model": "test-model",
        "raw_response": '{"label":"expense","amount":100.0,"merchant":"Netflix","category":"Entertainment","txn_date":"2026-04-15","confidence":0.92}',
        "prompt": "...",
    })
    mock_session = MagicMock()
    mock_session.add = MagicMock()

    items = [("e-log", "info@netflix.com", "netflix.com", "Subscription", "Rs. 100 charged")]
    results = await batch_classify_emails(
        items, session=mock_session, llm_client_override=mock_client, rule_engine_enabled=False,
    )
    assert len(results) == 1
    mock_session.add.assert_called()
    from app.models import ClassificationLog
    log_row = mock_session.add.call_args[0][0]
    assert isinstance(log_row, ClassificationLog)

@pytest.mark.asyncio
async def test_batch_no_session_does_not_crash():
    mock_client = AsyncMock()
    mock_client.batch_classify_verbose = AsyncMock(return_value={
        "results": [
            LLMClassification(label="expense", amount=50.0, merchant="Test",
                              category="Misc", txn_date=None, confidence=0.8),
        ],
        "provider": "test",
        "model": "test-model",
        "raw_response": "...",
        "prompt": "...",
    })

    items = [("e-ns", "t@test.com", "test.com", "Subject", "Rs. 50 charged")]
    results = await batch_classify_emails(
        items, session=None, llm_client_override=mock_client, rule_engine_enabled=False,
    )
    assert len(results) == 1
    assert results[0].label == Label.expense

@pytest.mark.asyncio
async def test_batch_llm_bad_label_defaults_to_ignore():
    mock_client = AsyncMock()
    mock_client.batch_classify_verbose = AsyncMock(return_value={
        "results": [
            LLMClassification(label="BOGUS", amount=100.0, merchant="X",
                              category="Food", txn_date=None, confidence=0.9),
        ],
        "provider": "test",
        "model": "test-model",
        "raw_response": "...",
        "prompt": "...",
    })

    items = [("e-bad", "s@x.com", "x.com", "Subj", "Body")]
    results = await batch_classify_emails(
        items, llm_client_override=mock_client, rule_engine_enabled=False,
    )
    assert results[0].label == Label.ignore
    assert results[0].classifier_method == ClassifierMethod.llm


@pytest.mark.asyncio
async def test_batch_failure_triggers_per_email_classify():
    """When batch LLM fails, each email gets a fresh classify_email attempt
    (retrying providers) before falling back to rules."""
    mock_client = AsyncMock()
    mock_client.batch_classify_verbose = AsyncMock(side_effect=RuntimeError("LLM down"))

    items = [("e1", "noreply@swiggy.in", "swiggy.in", "Order", "Rs. 349 debited")]
    with patch("app.classifier.classifier.classify_email") as mock_ce:
        mock_ce.return_value = ClassificationResult(
            label=Label.expense, amount=349.0, merchant="Swiggy",
            category="Food", txn_date=None, confidence=0.92,
            status=TransactionStatus.needs_review,
            classifier_method=ClassifierMethod.llm,
        )
        results = await batch_classify_emails(
            items, llm_client_override=mock_client, rule_engine_enabled=False,
        )
    mock_ce.assert_awaited_once()
    assert results[0].label == Label.expense
    assert results[0].amount == 349.0
    assert results[0].classifier_method == ClassifierMethod.llm


@pytest.mark.asyncio
async def test_batch_failure_classify_email_also_fails():
    """When both batch and per-email LLM fail, falls back to rules."""
    mock_client = AsyncMock()
    mock_client.batch_classify_verbose = AsyncMock(side_effect=RuntimeError("LLM down"))

    items = [("e1", "noreply@swiggy.in", "swiggy.in", "Order", "Rs. 349 debited")]
    with patch("app.classifier.classifier.classify_email") as mock_ce:
        mock_ce.side_effect = RuntimeError("Per-email LLM also down")
        results = await batch_classify_emails(
            items, llm_client_override=mock_client, rule_engine_enabled=False,
        )
    assert results[0].label == Label.expense
    assert results[0].amount == 349.0
    assert results[0].classifier_method == ClassifierMethod.rule


@pytest.mark.asyncio
async def test_batch_log_body_snippet_600_chars():
    """ClassificationLog stores 600-char snippet matching what LLM saw."""
    mock_client = AsyncMock()
    long_body = "x" * 5000
    mock_client.batch_classify_verbose = AsyncMock(return_value={
        "results": [
            LLMClassification(label="expense", amount=100.0, merchant="Test",
                              category="Misc", txn_date=None, confidence=0.8),
        ],
        "provider": "test",
        "model": "test-model",
        "raw_response": "...",
        "prompt": "...",
    })
    mock_session = MagicMock()
    mock_session.add = MagicMock()

    items = [("e-log", "t@test.com", "test.com", "Subject", long_body)]
    await batch_classify_emails(
        items, session=mock_session, llm_client_override=mock_client, rule_engine_enabled=False,
    )
    log_row = mock_session.add.call_args[0][0]
    from app.models import ClassificationLog
    assert isinstance(log_row, ClassificationLog)
    assert len(log_row.body_snippet) == 600
    assert log_row.body_snippet == "x" * 600
