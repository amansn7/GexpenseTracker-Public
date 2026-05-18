import pytest
from app.classifier.llm_client import _parse_response


def test_parse_trailing_comma_before_brace():
    raw = '{"label": "expense", "amount": 500.0, "merchant": "Swiggy", "category": "food", "txn_date": null, "confidence": 0.9,}'
    result = _parse_response(raw)
    assert result.label == "expense"
    assert result.amount == 500.0


def test_parse_trailing_comma_before_bracket():
    raw = '{"label": "ignore", "amount": null, "merchant": null, "category": null, "txn_date": null, "confidence": 0.5}'
    result = _parse_response(raw)
    assert result.label == "ignore"


def test_parse_markdown_fence():
    raw = '```json\n{"label": "expense", "amount": 100.0, "merchant": "Test", "category": "misc", "txn_date": null, "confidence": 0.8}\n```'
    result = _parse_response(raw)
    assert result.label == "expense"
    assert result.amount == 100.0


def test_parse_source_currency_inr():
    """source_currency defaults to None for INR transactions."""
    raw = '{"label":"expense","amount":499.0,"merchant":"Swiggy","category":"Food","txn_date":"2026-04-10","confidence":0.95}'
    result = _parse_response(raw)
    assert result.source_currency is None


def test_parse_source_currency_usd():
    """source_currency parsed from JSON when present."""
    raw = '{"label":"expense","amount":5.90,"merchant":"Anthropic","category":"Software","txn_date":"2026-05-17","confidence":0.95,"source_currency":"USD"}'
    result = _parse_response(raw)
    assert result.amount == 5.90
    assert result.source_currency == "USD"


def test_parse_source_currency_via_currency_field():
    """source_currency also accepts 'currency' as fallback key."""
    raw = '{"label":"expense","amount":50.0,"merchant":"Uber","category":"Travel","txn_date":"2026-05-01","confidence":0.9,"currency":"EUR"}'
    result = _parse_response(raw)
    assert result.source_currency == "EUR"


def test_parse_source_currency_lowercase():
    """source_currency is uppercased when read."""
    raw = '{"label":"expense","amount":99.99,"merchant":"AWS","category":"Software","txn_date":"2026-05-17","confidence":0.95,"source_currency":"usd"}'
    result = _parse_response(raw)
    assert result.source_currency == "USD"
