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
