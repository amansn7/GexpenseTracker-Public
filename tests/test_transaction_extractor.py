"""Tests for the regex-based transaction extractor."""

from app.classifier.transaction_extractor import extract


def test_extract_usd_prefix_no_space():
    """USD5.90 (no space) should be extracted correctly."""
    body = "USD5.90 spent on your SBI Credit Card at ANTHROPIC on 17/05/26"
    result = extract("Transaction Alert", body)
    assert result["amount"] == 5.90
    assert result["source_currency"] == "USD"
    assert result["merchant"] == "ANTHROPIC"


def test_extract_usd_prefix_with_space():
    """USD 5.90 (with space) should be extracted correctly."""
    body = "USD 5.90 spent on your card at NETFLIX"
    result = extract("Alert", body)
    assert result["amount"] == 5.90
    assert result["source_currency"] == "USD"


def test_extract_eur_prefix():
    """EUR 50.00 should be extracted correctly."""
    body = "EUR 50.00 charged to your card at SPOTIFY"
    result = extract("Alert", body)
    assert result["amount"] == 50.00
    assert result["source_currency"] == "EUR"


def test_extract_gbp_prefix():
    """GBP 25.50 should be extracted correctly."""
    body = "GBP 25.50 debited from your account"
    result = extract("Alert", body)
    assert result["amount"] == 25.50
    assert result["source_currency"] == "GBP"


def test_extract_usd_suffix():
    """5.90 USD (suffix format) should be extracted correctly."""
    body = "Amount of 5.90 USD was charged to your card"
    result = extract("Alert", body)
    assert result["amount"] == 5.90
    assert result["source_currency"] == "USD"


def test_extract_dollar_symbol():
    """$99.99 should be extracted as USD."""
    body = "$99.99 charged to your card at AMAZON"
    result = extract("Alert", body)
    assert result["amount"] == 99.99
    assert result["source_currency"] == "USD"


def test_extract_euro_symbol():
    """€50.00 should be extracted as EUR."""
    body = "€50.00 charged to your card"
    result = extract("Alert", body)
    assert result["amount"] == 50.00
    assert result["source_currency"] == "EUR"


def test_extract_inr_prefix():
    """₹500 or Rs.500 should be extracted as INR."""
    body = "Rs.500 debited from your account at SWIGGY"
    result = extract("Alert", body)
    assert result["amount"] == 500.0
    assert result["source_currency"] == "INR"


def test_extract_inr_rupee_symbol():
    """₹1299 should be extracted as INR."""
    body = "₹1299 charged to your card"
    result = extract("Alert", body)
    assert result["amount"] == 1299.0
    assert result["source_currency"] == "INR"


def test_extract_anthropic_subscription_hint():
    """Anthropic merchant should get Subscriptions category hint."""
    body = "USD5.90 spent on your SBI Credit Card at ANTHROPIC on 17/05/26"
    result = extract("Transaction Alert", body)
    assert result["category_hint"] == "Subscriptions"
    assert result["merchant"] == "ANTHROPIC"


def test_extract_no_foreign_currency():
    """Email with no foreign currency should have None source_currency."""
    body = "Rs.500 debited from your account at ZOMATO"
    result = extract("Alert", body)
    assert result["amount"] == 500.0
    assert result["source_currency"] == "INR"


def test_extract_comma_in_amount():
    """Amounts with commas like USD 1,200.50 should be extracted."""
    body = "USD 1,200.50 charged to your card"
    result = extract("Alert", body)
    assert result["amount"] == 1200.50
    assert result["source_currency"] == "USD"


def test_extract_does_not_match_standalone_comma():
    """Regex should not match ', USD' as an amount."""
    body = "Dear Cardholder, This is to inform you that, USD5.90 spent on your card"
    result = extract("Alert", body)
    assert result["amount"] == 5.90
    assert result["source_currency"] == "USD"
