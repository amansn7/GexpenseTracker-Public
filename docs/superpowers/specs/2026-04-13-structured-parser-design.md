# SP1: Structured Transaction Parser + Merchant Normalization

## Goal

Add a parsing layer before classification that extracts structured transaction data from raw email text. The parser produces a `ParsedTransaction` with normalized merchant names, amounts, payment methods, and transaction direction — replacing ad-hoc regex extraction scattered across `rules.py` and `llm_client.py`.

## Architecture

```
sync.py / emails.py
    │
    ▼
parse_transaction(sender, subject, body_snippet)
    │
    ▼
ParsedTransaction
    │
    ▼
classify_email(parsed, sender_domain, db_rules)
    │
    ▼
apply_rules() — uses parsed.merchant_clean, parsed.direction, parsed.amount
    │
    ▼
ClassificationResult
```

## New File: `app/classifier/parser.py`

### ParsedTransaction Schema

```python
class ParsedTransaction(BaseModel):
    amount: Optional[float] = None
    currency: str = "INR"
    merchant_raw: Optional[str] = None
    merchant_clean: Optional[str] = None
    payment_method: Optional[str] = None   # "upi" | "credit_card" | "debit_card" | "netbanking" | "wallet"
    direction: Optional[str] = None        # "debit" | "credit"
    reference: Optional[str] = None        # UPI ID, masked card, ref number
    txn_date: Optional[date] = None
```

### parse_transaction(sender, subject, body_snippet) → ParsedTransaction

Combines subject + body_snippet into a single text blob, then runs extractors in order:

1. `extract_amount(text)` → float or None
2. `extract_direction(text)` → "debit" | "credit" | None
3. `extract_merchant_raw(text, sender)` → raw merchant string
4. `normalize_merchant(raw)` → cleaned merchant name
5. `detect_payment_method(text)` → payment method string
6. `extract_reference(text)` → UPI ID, masked card, ref number
7. `extract_txn_date(text)` → date from body (not email received_at)

Each extractor is a standalone function. All are synchronous (pure regex, no I/O).

### Amount Extraction

Regex: `(?:rs\.?|inr|₹)\s?([\d,]+(?:\.\d{1,2})?)`

When multiple amounts found, return the largest (bank alerts sometimes mention both balance and transaction amount — the transaction amount is typically larger than a balance check amount, but smaller amounts like "Rs. 0.00" are noise). If exactly two amounts found and one matches common noise patterns (balance, available limit), prefer the other.

### Direction Detection

```python
DEBIT_REGEX  = re.compile(r"\b(debited|spent|paid|withdrawn|charged|purchase|bill payment)\b", re.I)
CREDIT_REGEX = re.compile(r"\b(credited|received|deposited|refund|cashback|salary|reversed)\b", re.I)
```

If both match, the one appearing first in text wins (bank alerts state the action early: "Rs.488 debited ... refund pending").

### Merchant Extraction

**Step 1 — extract raw merchant from text:**

Patterns tried in order:
1. `"towards ([A-Za-z0-9 ._-]+)"` — HDFC style: "towards WWW SWIGGY IN"
2. `"to ([A-Za-z0-9 ._-]+?)(?:\s+on|\s+via|\s+ref|\s*$)"` — "paid to Swiggy on 07 Apr"
3. `"at ([A-Za-z0-9 ._-]+)"` — "purchase at Amazon"
4. `"([\w.\-]+)@[\w]+"` — UPI handle: "swiggy@ybl" → "swiggy"
5. Sender-based hint: if sender domain is a known bank, skip. Otherwise sender domain itself may be the merchant (e.g., "noreply@swiggy.in" → "swiggy").

**Step 2 — normalize:**

```python
def normalize_merchant(raw: str) -> str:
    text = raw.lower().strip()
    # 1. Strip prefixes
    for prefix in ["www ", "www.", "http ", "https "]:
        if text.startswith(prefix):
            text = text[len(prefix):]
    # 2. Strip suffixes
    for suffix in [" in", " india", " limited", " ltd", " pvt",
                   " blr", " bangalore", " mumbai", " delhi",
                   " chennai", " hyderabad", " pune"]:
        if text.endswith(suffix):
            text = text[:-len(suffix)]
    # 3. Strip UPI handle portion
    if "@" in text:
        text = text.split("@")[0]
    # 4. Strip card network noise
    for noise in ["visa ", "mastercard ", "rupay "]:
        text = text.replace(noise, "")
    # 5. Collapse whitespace
    text = re.sub(r"\s+", " ", text).strip()
    # 6. Alias lookup
    return MERCHANT_ALIASES.get(text, text)
```

**Step 3 — alias map:**

```python
MERCHANT_ALIASES = {
    "amzn mktp": "amazon",
    "amzn": "amazon",
    "swgy": "swiggy",
    "swiggy instamart": "swiggy instamart",
    "gpay": "google pay",
    "phonepe merchant": "phonepe",
    "paytm mall": "paytm",
    "uber trip": "uber",
    "uber eats": "uber eats",
    "ola money": "ola",
    "namma yatri": "namma yatri",
}
```

Alias check runs longest-match-first so "swiggy instamart" matches before "swiggy" substring.

### Payment Method Detection

```python
PAYMENT_METHOD_PATTERNS = [
    (re.compile(r"\b(upi|unified payment|bhim)\b", re.I), "upi"),
    (re.compile(r"\bcredit card\b", re.I), "credit_card"),
    (re.compile(r"\b(debit card|atm card)\b", re.I), "debit_card"),
    (re.compile(r"\b(neft|rtgs|imps|netbanking|net banking)\b", re.I), "netbanking"),
    (re.compile(r"\b(wallet|paytm wallet|phonepe wallet)\b", re.I), "wallet"),
]
```

First match wins.

### Reference Extraction

Patterns:
- UPI ref: `"upi ref[:\s]*(\d+)"` or `"rrn[:\s]*(\d+)"`
- Masked card: `"\*{2,4}(\d{4})"` → "**3912"
- IMPS/NEFT ref: `"ref[:\s]*([A-Z0-9]+)"`

### Transaction Date Extraction

Patterns for Indian date formats:
- `"on (\d{2}\s+\w{3},?\s+\d{4})"` — "on 07 Apr, 2026"
- `"on (\d{2}/\d{2}/\d{4})"` — "on 07/04/2026"
- `"on (\d{2}-\d{2}-\d{4})"` — "on 07-04-2026"
- `"dated? (\d{2}.\d{2}.\d{4})"` — "dt 07.04.2026"

Parsed to `date` object. Returns None if no pattern matches (caller falls back to email received_at).

## Modified Files

### classifier.py

`classify_email()` signature change:

```python
# Before:
async def classify_email(sender, sender_domain, subject, body_snippet, db_rules, force_extraction)

# After:
async def classify_email(sender, sender_domain, subject, body_snippet, db_rules, force_extraction, parsed=None)
```

If `parsed` is None, the function calls `parse_transaction()` internally (backward compatible). When `parsed` is provided, it skips parsing.

The parsed fields are used:
- `parsed.direction` → if "debit" → hint label=expense, if "credit" → hint label=income (before rules fire)
- `parsed.merchant_clean` → passed to rules and stored on Transaction
- `parsed.amount` → stored on Transaction (no LLM needed for extraction when parser found it)
- `parsed.payment_method` → stored on Transaction

When the parser extracts amount + merchant + direction with high confidence, the LLM extraction-only call can be skipped entirely (cost savings).

### rules.py

`apply_rules()` gains optional `parsed` parameter:

```python
def apply_rules(sender_domain, subject, body_snippet, db_rules=None, parsed=None) -> RuleResult:
```

When `parsed` is provided:
- Layer 6 (merchant detection) checks `parsed.merchant_clean` against `MERCHANT_MAP` instead of re-scanning raw text
- Layer 1 (direction regex) is skipped — `parsed.direction` already has the answer
- `RuleResult.merchant` is set from `parsed.merchant_clean`

When `parsed` is None, behavior is unchanged (backward compatible).

### sync.py

In `_classify_one()`:
```python
parsed = parse_transaction(
    sender=msg["sender"],
    subject=msg["subject"] or "",
    body_snippet=clean_body(msg.get("body_text") or msg.get("body_snippet") or ""),
)
result = await classify_email(..., parsed=parsed)
```

### models.py

Add one nullable column to Transaction:

```python
payment_method: Mapped[Optional[str]] = mapped_column(String(20))  # upi, credit_card, etc.
```

Alembic migration: `0004_payment_method.py`

## MERCHANT_MAP Update

Add "swiggy instamart" entry:

```python
MERCHANT_MAP = {
    ...
    "swiggy instamart": "Groceries",  # distinct from "swiggy" → "Food"
    ...
}
```

The merchant map lookup must check longest keys first to avoid "swiggy instamart" matching "swiggy" → Food.

## Testing

### Unit tests: `tests/test_parser.py`

Test cases for each extractor:

**Amount extraction:**
- `"Rs.488.00 debited"` → 488.0
- `"INR 85,000 credited"` → 85000.0
- `"₹350 debited"` → 350.0
- `"Rs. 0.00 debited"` → 0.0 (valid — zero-amount alerts exist)
- `"no amount here"` → None

**Direction:**
- `"debited from your account"` → "debit"
- `"credited to your account"` → "credit"
- `"Rs.500 debited ... refund of Rs.200 credited"` → "debit" (first mention wins)

**Merchant normalization:**
- `"WWW SWIGGY IN"` → "swiggy"
- `"SWIGGY LIMITED BLR"` → "swiggy"
- `"swiggy@ybl"` → "swiggy"
- `"AMZN MKTP IN"` → "amazon"
- `"swiggy instamart"` → "swiggy instamart" (not collapsed to "swiggy")
- `"UBER TRIP BLR"` → "uber"

**Payment method:**
- `"via UPI"` → "upi"
- `"Credit Card ending 3912"` → "credit_card"
- `"via NEFT"` → "netbanking"

**Reference:**
- `"UPI Ref: 123456789"` → "123456789"
- `"card **3912"` → "**3912"

**Full parse_transaction:**
- `"Rs. 250 debited via UPI to swiggy@upi"` → ParsedTransaction(amount=250, direction="debit", merchant_clean="swiggy", payment_method="upi")
- `"INR 85,000 credited to your account"` → ParsedTransaction(amount=85000, direction="credit", merchant_clean=None, payment_method=None)

### Integration test

Verify that `classify_email()` with parsed input produces same or better results than without.

## What This Does NOT Include

- Fuzzy matching (rapidfuzz) — not needed for consistent bank message formats; add later if accuracy data shows a gap
- New DB tables — parser output maps to existing Transaction columns + one new column
- SMS support — parser interface works for SMS but no SMS ingestion pipeline yet
- Auto-learning (SP2) or feedback loop (SP2) — separate sub-project
- LLM prompt changes — existing prompts work; parser just reduces how often we need LLM

## Example End-to-End

**Input email:**
```
From: HDFC Bank InstaAlerts <alerts@hdfcbank.net>
Subject: Rs.488.00 debited via Credit Card **3912
Body: Dear Customer, Rs.488.00 is debited from your HDFC Bank Credit Card
      ending 3912 towards WWW SWIGGY IN on 07 Apr, 2026 at 20:29:46.
```

**ParsedTransaction:**
```json
{
  "amount": 488.0,
  "currency": "INR",
  "merchant_raw": "WWW SWIGGY IN",
  "merchant_clean": "swiggy",
  "payment_method": "credit_card",
  "direction": "debit",
  "reference": "**3912",
  "txn_date": "2026-04-07"
}
```

**ClassificationResult:**
```json
{
  "label": "expense",
  "category": "Food",
  "amount": 488.0,
  "merchant": "swiggy",
  "confidence": 0.95,
  "status": "auto",
  "classifier_method": "rule"
}
```

No LLM call needed — parser extracted amount + merchant, rules matched domain + merchant map.
