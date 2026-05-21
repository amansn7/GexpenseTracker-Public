"""Pure-Python unit tests for app/services/.

No database, no fixtures, no async — just the deterministic logic in
``CategoryService.resolve`` and ``format_transaction``.
"""
from datetime import date, datetime
from types import SimpleNamespace

from app.services.category_service import CategoryService
from app.services.transaction_formatter import format_transaction

# ---------------------------------------------------------------------------
# CategoryService.resolve
# ---------------------------------------------------------------------------


def test_resolve_known_canonical_food():
    assert CategoryService.resolve("Food", False) == "food"


def test_resolve_uppercase_normalized():
    assert CategoryService.resolve("GROCERIES", False) == "groceries"


def test_resolve_strips_whitespace_and_lowercases():
    assert CategoryService.resolve("  rent  ", False) == "rent"


def test_resolve_none_falls_back_to_other():
    assert CategoryService.resolve(None, False) == "other"


def test_resolve_empty_string_falls_back_to_other():
    assert CategoryService.resolve("", False) == "other"


def test_resolve_is_income_shortcut_bypasses_lookup():
    # Any raw value is ignored when is_income=True.
    assert CategoryService.resolve("anything", True) == "income"


def test_resolve_unknown_raw_falls_back_to_other():
    assert CategoryService.resolve("totally-unknown-category", False) == "other"


def test_resolve_cc_payment_maps_to_card():
    # `"card"` is the canonical key for CC repayments (load-bearing in
    # Sankey + dashboard, fed by stats summary `total_cc_payments`).
    assert CategoryService.resolve("cc payment", False) == "card"


def test_resolve_card_aliases_all_map_to_card():
    for alias in ("card", "card payment", "credit card payment", "cc", "credit card"):
        assert CategoryService.resolve(alias, False) == "card", alias


def test_resolve_investment_aliases_all_map_to_investment():
    # `"investment"` is the canonical key for investment outflows
    # (load-bearing — frontend filters `cat === "investment"`).
    for alias in ("investment", "investments", "mutual fund", "mutual funds", "stocks", "sip"):
        assert CategoryService.resolve(alias, False) == "investment", alias


def test_resolve_cash_maps_to_other():
    # `cash` intentionally collapses to "other" — no dedicated bucket today.
    assert CategoryService.resolve("cash", False) == "other"


# ---------------------------------------------------------------------------
# format_transaction
# ---------------------------------------------------------------------------


def _make_tx(**overrides):
    """Build a SimpleNamespace Transaction-like object with sensible defaults."""
    defaults = dict(
        id="tx-1",
        label="expense",
        transaction_type="debit",
        amount=499.0,
        currency="INR",
        merchant="Swiggy",
        category="food",
        txn_date=date(2026, 4, 10),
        confidence=0.95,
        status="auto",
        classifier_method="llm",
        user_notes=None,
        read=False,
        flagged=False,
    )
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


def _make_email(**overrides):
    defaults = dict(
        subject="Your Swiggy order",
        sender="noreply@swiggy.in",
        sender_domain="swiggy.in",
        received_at=datetime(2026, 4, 10, 12, 30, 0),
        gmail_link="https://mail.google.com/mail/u/0/#inbox/abc",
        body_snippet="Rs.499 debited for your order",
    )
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


_EXPECTED_TOP_KEYS = {
    "id", "label", "transaction_type", "amount", "currency", "merchant",
    "category", "txn_date", "confidence", "status", "classifier_method",
    "user_notes", "read", "flagged", "email",
}

_EXPECTED_EMAIL_KEYS = {
    "subject", "sender", "sender_domain", "received_at",
    "gmail_link", "body_snippet",
}


def test_format_transaction_with_email_populated():
    t = _make_tx()
    e = _make_email()
    out = format_transaction(t, e)

    assert set(out.keys()) == _EXPECTED_TOP_KEYS
    assert out["id"] == "tx-1"
    assert out["amount"] == 499.0
    assert out["txn_date"] == "2026-04-10"
    assert out["read"] is False
    assert out["flagged"] is False

    assert set(out["email"].keys()) == _EXPECTED_EMAIL_KEYS
    assert out["email"]["subject"] == "Your Swiggy order"
    assert out["email"]["sender"] == "noreply@swiggy.in"
    assert out["email"]["sender_domain"] == "swiggy.in"
    assert out["email"]["received_at"] == "2026-04-10T12:30:00"
    assert out["email"]["gmail_link"] == "https://mail.google.com/mail/u/0/#inbox/abc"
    assert out["email"]["body_snippet"] == "Rs.499 debited for your order"


def test_format_transaction_with_none_email_keeps_block_with_none_values():
    """Current contract: e=None still emits an 'email' dict with all keys=None.

    Assert this explicitly so a future refactor that "drops the email block
    when None" trips this test.
    """
    t = _make_tx()
    out = format_transaction(t, None)

    assert "email" in out
    assert set(out["email"].keys()) == _EXPECTED_EMAIL_KEYS
    for k in _EXPECTED_EMAIL_KEYS:
        assert out["email"][k] is None, f"email[{k!r}] expected None, got {out['email'][k]!r}"


def test_format_transaction_txn_date_none():
    t = _make_tx(txn_date=None)
    out = format_transaction(t, _make_email(received_at=None))
    assert out["txn_date"] is None
    assert out["email"]["received_at"] is None


def test_format_transaction_amount_none():
    t = _make_tx(amount=None)
    out = format_transaction(t, _make_email())
    assert out["amount"] is None


def test_format_transaction_received_at_none():
    t = _make_tx()
    e = _make_email(received_at=None)
    out = format_transaction(t, e)
    assert out["email"]["received_at"] is None
    # Other email fields still populated.
    assert out["email"]["subject"] == "Your Swiggy order"
