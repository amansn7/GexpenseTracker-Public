from app.classifier.rules import apply_rules
from app.models import Label


def test_known_domain_expense():
    result = apply_rules("zomato.com", "Your order is confirmed", "₹299 paid")
    assert result.label == Label.expense
    assert result.confidence >= 0.90
    assert result.matched_domain is True


def test_known_domain_from_db_overrides_builtin():
    db_rules = {"zomato.com": (Label.income, "Refund")}
    result = apply_rules("zomato.com", "Refund processed", "₹100 credited", db_rules)
    assert result.label == Label.income


def test_expense_keywords_score():
    result = apply_rules("unknown.com", "Payment receipt", "Amount debited ₹500 invoice")
    assert result.label == Label.expense
    assert result.confidence > 0.60


def test_income_keywords_score():
    result = apply_rules("unknown.com", "Amount credited to your account", "₹5000 salary credited")
    assert result.label == Label.income


def test_ignore_keywords():
    result = apply_rules("marketing.co", "Unsubscribe from newsletter", "Promotional offer click here")
    assert result.label == Label.ignore


def test_unknown_low_confidence():
    result = apply_rules("randomblog.com", "Hello there", "Check this out")
    assert result.confidence == 0.0
    assert result.label is None
