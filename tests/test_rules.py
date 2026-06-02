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


def test_income_overrides_domain_ignore():
    """Income signals override domain ignore rules (e.g., Axis Bank salary)."""
    db_rules = {"axis.bank.in": (Label.ignore, "transfer")}
    result = apply_rules("axis.bank.in", "Salary credited", "₹138633 credited to your account")
    assert result.label == Label.income
    assert result.confidence > 0.60


def test_expense_overrides_domain_ignore():
    """Financial expense signals override domain ignore rules."""
    db_rules = {"axis.bank.in": (Label.ignore, "transfer")}
    result = apply_rules("axis.bank.in", "Debit notification", "₹500 debited from account")
    assert result.label == Label.expense


def test_amount_only_no_keywords_is_ambiguous():
    """Email with amount but no income/expense keywords returns None (LLM decides)."""
    result = apply_rules("merchant.co", "Your receipt", "Total: ₹1,299")
    assert result.label is None
    assert result.confidence == 0.0


def test_non_financial_respects_domain_ignore():
    """Non-financial email from an ignore domain stays ignored."""
    db_rules = {"marketing.co": (Label.ignore, None)}
    result = apply_rules("marketing.co", "Newsletter", "Latest updates and offers")
    assert result.label == Label.ignore


def test_non_financial_with_keywords_but_no_amount():
    """Keywords without amount/verb context return keyword-based result."""
    result = apply_rules("newsletter.co", "Special offer", "You are credited with bonus points")
    assert result.label == Label.income
    assert result.confidence > 0.50
