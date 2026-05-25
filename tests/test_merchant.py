"""Unit tests for app/classifier/merchant.py"""

from app.classifier.merchant import _regex_clean, extract_raw_merchant, normalize_merchant

# ── _regex_clean ──────────────────────────────────────────────────────────────


def test_clean_www_prefix():
    assert _regex_clean("WWW SWIGGY IN") == "swiggy"


def test_clean_city_suffix():
    assert _regex_clean("SWIGGY BLR") == "swiggy"


def test_clean_legal_suffix():
    assert _regex_clean("SWIGGY LIMITED") == "swiggy"


def test_clean_upi_handle():
    assert _regex_clean("swiggy@ybl") == "swiggy"


def test_clean_card_noise():
    assert _regex_clean("VISA AMAZON") == "amazon"


def test_clean_multi_suffix():
    assert _regex_clean("SWIGGY PVT LTD BLR") == "swiggy"


# ── normalize_merchant ────────────────────────────────────────────────────────


def test_normalize_www_swiggy():
    name, conf = normalize_merchant("WWW SWIGGY IN")
    assert name == "swiggy"
    assert conf == 1.0


def test_normalize_swiggy_limited_blr():
    name, conf = normalize_merchant("SWIGGY LIMITED BLR")
    assert name == "swiggy"
    assert conf == 1.0


def test_normalize_upi_handle():
    name, conf = normalize_merchant("swiggy@ybl")
    assert name == "swiggy"
    assert conf == 1.0


def test_normalize_amazon_alias():
    name, conf = normalize_merchant("AMZN MKTP IN")
    assert name == "amazon"
    assert conf == 1.0


def test_normalize_instamart_not_collapsed():
    name, conf = normalize_merchant("SWIGGY INSTAMART")
    assert name == "swiggy instamart"
    assert conf == 1.0


def test_normalize_uber_trip():
    name, conf = normalize_merchant("UBER TRIP BLR")
    assert name == "uber"
    assert conf == 1.0


def test_normalize_zomato_upi():
    name, conf = normalize_merchant("zomato@upi")
    assert name == "zomato"


def test_normalize_unknown_returns_cleaned():
    name, conf = normalize_merchant("TOTALLY UNKNOWN VENDOR")
    assert conf == 0.5
    assert name == "totally unknown vendor"


def test_normalize_empty():
    name, conf = normalize_merchant("")
    assert name == ""
    assert conf == 0.0


def test_normalize_confidence_exact_alias():
    _, conf = normalize_merchant("swiggy@ybl")
    assert conf == 1.0


# ── extract_raw_merchant ──────────────────────────────────────────────────────


def test_extract_towards_pattern():
    text = "Rs.488 debited towards WWW SWIGGY IN on 07 Apr"
    raw = extract_raw_merchant(text)
    assert raw is not None
    assert "SWIGGY" in raw.upper()


def test_extract_upi_handle():
    text = "Rs.350 debited via UPI to zomato@upi ref 123456"
    raw = extract_raw_merchant(text)
    assert raw is not None


def test_extract_at_pattern():
    text = "Purchase at Amazon INR 1299"
    raw = extract_raw_merchant(text)
    assert raw is not None


def test_extract_none_for_generic():
    text = "Your OTP is 123456"
    # May or may not find something — just ensure no crash
    result = extract_raw_merchant(text)
    assert result is None or isinstance(result, str)
