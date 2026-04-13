"""
Rule engine — layered classifier (no LLM).

Layers (highest → lowest priority):
  0. Domain rules   — DB user rules + BUILTIN_SENDER_RULES       (conf 0.95)
  1. Ignore signals — strong regex (OTP, login, password)         (conf 0.95)
  2. Income regex   — credited, received, refund, salary          (conf 0.90)
  3. Fake-alert     — "upi txn" + "check details" pattern        (conf 0.80)
  4. Debit regex    — debited, spent, paid, withdrawn             (conf 0.90)
  5. Bank sender    — bank domain + amount found                  (conf 0.85)
  6. Merchant map   — known merchant name in text                 (conf 0.92)
  7. UPI merchant   — extract payee from "to X" / "X@upi"       (conf 0.75)
  8. Keyword score  — hit-count fallback                         (conf 0.60–0.84)
  9. Learning       — auto-learned merchant rules                 (conf 0.95)
"""
import re
from dataclasses import dataclass, field
from typing import Optional, List, Tuple, Dict, Any

from app.models import Label

# ── Layer 0: Domain rules ────────────────────────────────────────────────────

BUILTIN_SENDER_RULES: Dict[str, Tuple[Label, Optional[str]]] = {
    "amazon.in":      (Label.expense, "Shopping"),
    "flipkart.com":   (Label.expense, "Shopping"),
    "myntra.com":     (Label.expense, "Shopping"),
    "meesho.com":     (Label.expense, "Shopping"),
    "ajio.com":       (Label.expense, "Shopping"),
    "zomato.com":     (Label.expense, "Food"),
    "swiggy.in":      (Label.expense, "Food"),
    "blinkit.com":    (Label.expense, "Groceries"),
    "bigbasket.com":  (Label.expense, "Groceries"),
    "zepto.com":      (Label.expense, "Groceries"),
    "jiomart.com":    (Label.expense, "Groceries"),
    "phonepe.com":    (Label.expense, "UPI Payment"),
    "paytm.com":      (Label.expense, "UPI Payment"),
    "paytmmoney.com": (Label.expense, "Investment"),
    "razorpay.com":   (Label.expense, "Payment"),
    "cred.club":      (Label.expense, "Bill Payment"),
    "makemytrip.com": (Label.expense, "Travel"),
    "irctc.co.in":    (Label.expense, "Travel"),
    "goibibo.com":    (Label.expense, "Travel"),
    "cleartrip.com":  (Label.expense, "Travel"),
    "olacabs.com":    (Label.expense, "Transport"),
    "uber.com":       (Label.expense, "Transport"),
    "rapido.bike":    (Label.expense, "Transport"),
    "airtel.in":      (Label.expense, "Utilities"),
    "jio.com":        (Label.expense, "Utilities"),
    "netflix.com":    (Label.expense, "Entertainment"),
    "spotify.com":    (Label.expense, "Entertainment"),
    "zerodha.com":    (Label.expense, "Investment"),
    "groww.in":       (Label.expense, "Investment"),
}

# ── Layer 1: Regex signals ────────────────────────────────────────────────────

AMOUNT_REGEX = re.compile(
    r"(?:rs\.?|inr|₹)\s?([\d,]+(?:\.\d{1,2})?)",
    re.IGNORECASE,
)
UPI_REGEX = re.compile(r"\b[\w.\-]+@[\w]+\b", re.IGNORECASE)

# Strong ignore: stop here, no financial transaction
IGNORE_STRONG_REGEX = re.compile(
    r"\b(otp|one.?time.?password|verification code|verify your"
    r"|login alert|password reset)\b",
    re.IGNORECASE,
)
# Weak ignore: only if no amount found
IGNORE_WEAK_REGEX = re.compile(
    r"\b(check details|statement|communication|newsletter|unsubscribe"
    r"|promotional|offer|sale)\b",
    re.IGNORECASE,
)

DEBIT_REGEX = re.compile(
    r"\b(debited|spent|paid|withdrawn|purchase|charged|bill payment)\b",
    re.IGNORECASE,
)
CREDIT_REGEX = re.compile(
    r"\b(credited|received|deposited|refund|cashback|salary|reversed)\b",
    re.IGNORECASE,
)

# ── Layer 2: Sender intelligence ─────────────────────────────────────────────

BANK_DOMAINS = [
    "hdfc", "icici", "sbi", "axis", "kotak", "yesbank", "indusind",
    "idfc", "rbl", "federal", "bob", "pnb", "canara", "iob", "unionbank",
]

# ── Layer 3: Merchant detection ───────────────────────────────────────────────
# Keys: lowercase name fragment · Values: proper-case category

MERCHANT_MAP: Dict[str, str] = {
    # Food
    "swiggy":      "Food",
    "zomato":      "Food",
    "dunzo":       "Food",
    "eatsure":     "Food",
    "dominos":     "Food",
    "dominoes":    "Food",
    "pizza hut":   "Food",
    "kfc":         "Food",
    "mcdonald":    "Food",
    "burger king": "Food",
    # Groceries
    "blinkit":     "Groceries",
    "zepto":       "Groceries",
    "bbdaily":     "Groceries",
    "bigbasket":   "Groceries",
    "jiomart":     "Groceries",
    "dmart":       "Groceries",
    # Transport
    "uber":        "Transport",
    "ola":         "Transport",
    "rapido":      "Transport",
    "bmrc":        "Transport",
    "namma metro": "Transport",
    # Utilities
    "bescom":      "Utilities",
    "act fibernet":"Internet",
    "act broadband":"Internet",
    "jio":         "Mobile",
    "airtel":      "Mobile",
    "bsnl":        "Mobile",
    "vi ":         "Mobile",
    # Shopping
    "amazon":      "Shopping",
    "flipkart":    "Shopping",
    "myntra":      "Shopping",
    "meesho":      "Shopping",
    "ajio":        "Shopping",
    "nykaa":       "Shopping",
    # Entertainment
    "netflix":     "Entertainment",
    "spotify":     "Entertainment",
    "hotstar":     "Entertainment",
    "prime video": "Entertainment",
    "youtube premium": "Entertainment",
    "bookmyshow":  "Entertainment",
    # Financial
    "lic":         "Insurance",
    "nps":         "Investment",
    "zerodha":     "Investment",
    "groww":       "Investment",
    "paytm money": "Investment",
    # Travel
    "irctc":       "Travel",
    "makemytrip":  "Travel",
    "goibibo":     "Travel",
    "cleartrip":   "Travel",
    "indigo":      "Travel",
    "air india":   "Travel",
    # Healthcare
    "apollo":      "Healthcare",
    "1mg":         "Healthcare",
    "pharmeasy":   "Healthcare",
    "practo":      "Healthcare",
    "cult.fit":    "Healthcare",
}

# ── Layer 4: Keyword scoring ──────────────────────────────────────────────────

EXPENSE_KEYWORDS = [
    "order confirmed", "order confirmation",
    "payment successful", "payment confirmation",
    "booking confirmed", "amount paid",
    "receipt", "invoice", "debited", "charged",
    "bill", "purchase", "transaction", "₹", "rs.", "inr",
    "upi", "txn", "withdrawn", "spent", "paid",
]

INCOME_KEYWORDS = [
    "transferred to you", "you have received", "amount credited",
    "salary", "cashback", "refund", "credited", "received",
    "deposited", "reversed", "amount received",
]

IGNORE_KEYWORDS = [
    "verification code", "one time password", "verify your",
    "newsletter", "unsubscribe", "promotional",
    "otp", "offers", "click here", "login alert", "password reset",
]

# ── Data classes ──────────────────────────────────────────────────────────────

@dataclass
class RuleResult:
    label: Optional[Label]
    category: Optional[str]
    confidence: float
    matched_domain: bool
    matched_keywords: List[str] = field(default_factory=list)
    matched_layer: str = "none"
    merchant: Optional[str] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def extract_amount(text: str) -> Optional[float]:
    """Return largest INR amount found in text, or None."""
    values = []
    for m in AMOUNT_REGEX.findall(text):
        try:
            values.append(float(m.replace(",", "")))
        except ValueError:
            continue
    return max(values) if values else None


def detect_merchant(text: str) -> Tuple[Optional[str], Optional[str], float]:
    """Return (merchant_display_name, category, confidence) or (None, None, 0.0)."""
    from app.classifier.merchant import extract_raw_merchant, normalize_merchant

    # Try structured extraction first (towards/to/at/UPI handle)
    raw = extract_raw_merchant(text)
    if raw:
        canonical, conf = normalize_merchant(raw)
        category = MERCHANT_MAP.get(canonical)
        if category and conf >= 0.70:
            return canonical.title(), category, conf

    # Fallback: scan full text for known merchant names
    tl = text.lower()
    for name, category in MERCHANT_MAP.items():
        if name in tl:
            _, conf = normalize_merchant(name)
            return name.title(), category, max(conf, 0.92)

    return None, None, 0.0


def extract_upi_merchant(text: str) -> Optional[str]:
    """Extract payee from 'paid to X' or 'X@upi' patterns."""
    m = re.search(r"(?:to|paid to)\s+([a-zA-Z0-9\s]{2,30})", text, re.IGNORECASE)
    if m:
        return m.group(1).strip().lower()
    m = re.search(r"([\w.\-]+)@[\w]+", text)
    if m:
        return m.group(1).lower()
    return None


def infer_category_from_context(text: str) -> Optional[str]:
    """Fallback category inference from payment method keywords."""
    tl = text.lower()
    if "credit card" in tl or "cc " in tl:
        return "CC Payment"
    if "upi" in tl:
        return "UPI Payment"
    if "atm" in tl:
        return "Cash"
    if "investment" in tl or "amc" in tl or "mutual fund" in tl:
        return "Investment"
    if "rent" in tl:
        return "Rent"
    if "emi" in tl or "loan" in tl:
        return "EMI"
    return None


def _kw_score(text: str, keywords: List[str]) -> Tuple[int, List[str]]:
    lower = text.lower()
    matched = []
    for kw in keywords:
        if kw in lower:
            if any(len(o) > len(kw) and kw in o and o in lower for o in keywords):
                continue
            matched.append(kw)
    return len(matched), matched


# ── Core layered classifier ───────────────────────────────────────────────────

def classify_transaction(text: str, sender: str = "") -> Dict[str, Any]:
    """
    Classify a financial text through all layers.
    Returns a dict: label, category, confidence, amount, merchant, matched_layer.
    """
    tl = text.lower()
    sender_l = sender.lower()

    amount = extract_amount(tl)
    result: Dict[str, Any] = {
        "label": None, "category": None, "confidence": 0.0,
        "amount": amount, "merchant": None, "matched_layer": "none",
        "matched_keywords": [],
    }

    # Layer 1a: Strong ignore (OTP, login, password)
    m = IGNORE_STRONG_REGEX.search(tl)
    if m:
        return {**result, "label": "ignore", "confidence": 0.95,
                "matched_layer": "regex_ignore_strong",
                "matched_keywords": [m.group(0)]}

    # Layer 2: Income signal (check before debit — refunds also credit)
    m = CREDIT_REGEX.search(tl)
    if m:
        result["label"] = "income"
        result["confidence"] = 0.90
        result["matched_layer"] = "regex_income"
        result["matched_keywords"] = [m.group(0)]

    # Layer 1b: Weak ignore (only if no amount and no income signal yet)
    if not result["label"] and not amount:
        m = IGNORE_WEAK_REGEX.search(tl)
        if m:
            return {**result, "label": "ignore", "confidence": 0.75,
                    "matched_layer": "regex_ignore_weak",
                    "matched_keywords": [m.group(0)]}

    # Fake UPI alert ("upi txn" + "check details")
    if not result["label"] and "upi txn" in tl and "check details" in tl:
        return {**result, "label": "ignore", "confidence": 0.80,
                "matched_layer": "regex_fake_alert"}

    # Layer 4: Debit signal (overrides income only if debit appears first)
    m = DEBIT_REGEX.search(tl)
    if m:
        debit_pos = tl.index(m.group(0).lower())
        credit_pos = len(tl)
        cm = CREDIT_REGEX.search(tl)
        if cm:
            try:
                credit_pos = tl.index(cm.group(0).lower())
            except ValueError:
                pass
        if debit_pos < credit_pos:
            result["label"] = "expense"
            result["confidence"] = 0.90
            result["matched_layer"] = "regex_debit"
            result["matched_keywords"] = [m.group(0)]

    # Layer 5: Bank sender + amount
    if any(b in sender_l for b in BANK_DOMAINS) and amount:
        if not result["label"]:
            result["label"] = "expense"
            result["matched_layer"] = "bank_sender"
        result["confidence"] = max(result["confidence"], 0.85)

    # Layer 6: Merchant detection (highest confidence, also sets category)
    merchant, category, merch_conf = detect_merchant(text)
    if merchant:
        result["merchant"] = merchant
        result["category"] = category
        result["label"] = "expense"
        result["confidence"] = max(result["confidence"], round(0.92 * merch_conf, 2) if merch_conf < 1.0 else 0.92)
        result["matched_layer"] = "merchant"
        result["matched_keywords"] = result["matched_keywords"] + [f"merchant:{merchant}"]

    # Layer 7: UPI merchant extraction
    if not result["merchant"]:
        upi_m = extract_upi_merchant(tl)
        if upi_m:
            result["merchant"] = upi_m
            result["matched_layer"] = result["matched_layer"] or "upi_merchant"

    # Layer 8: Keyword scoring fallback
    if not result["label"]:
        exp_count, exp_matched = _kw_score(text, EXPENSE_KEYWORDS)
        inc_count, inc_matched = _kw_score(text, INCOME_KEYWORDS)
        ign_count, ign_matched = _kw_score(text, IGNORE_KEYWORDS)

        if ign_count >= 2:
            return {**result, "label": "ignore", "confidence": 0.85,
                    "matched_layer": "keyword_ignore",
                    "matched_keywords": ign_matched}
        if exp_count > inc_count and exp_count >= 2:
            result["label"] = "expense"
            result["confidence"] = min(0.60 + exp_count * 0.05, 0.84)
            result["matched_layer"] = "keyword_expense"
            result["matched_keywords"] = exp_matched
        elif inc_count > exp_count and inc_count >= 2:
            result["label"] = "income"
            result["confidence"] = min(0.60 + inc_count * 0.05, 0.84)
            result["matched_layer"] = "keyword_income"
            result["matched_keywords"] = inc_matched

    # Layer 9: Auto-learning override
    if result["merchant"] and result["label"]:
        try:
            from app.classifier.learning import get_learned_rule, update_learning
            learned = get_learned_rule(result["merchant"])
            if learned:
                result["category"] = learned["category"] or result["category"]
                result["confidence"] = max(result["confidence"], 0.95)
                result["matched_layer"] = "learned"

            update_learning(result["merchant"], result["label"], result["category"])
        except Exception:
            pass  # learning is non-fatal

    # Category fallback
    if not result["category"]:
        result["category"] = infer_category_from_context(text)

    # Final fallback
    if not result["label"]:
        result["matched_layer"] = "none"

    return result


# ── Public interface (used by classifier.py and emails.py) ────────────────────

def apply_rules(
    sender_domain: str,
    subject: str,
    body_snippet: str,
    db_rules: Optional[dict] = None,
) -> RuleResult:
    """
    Classify an email through all layers. Returns RuleResult.
    label=None + confidence=0.0 means uncertain → caller should use LLM.
    """
    all_rules = {**BUILTIN_SENDER_RULES, **(db_rules or {})}

    # Layer 0: domain match (highest priority)
    if sender_domain in all_rules:
        lbl, cat = all_rules[sender_domain]
        # Normalise to Label enum (db_rules may store Label or string)
        if not isinstance(lbl, Label):
            lbl = Label(str(lbl))
        return RuleResult(label=lbl, category=cat, confidence=0.95,
                          matched_domain=True, matched_layer="domain")

    # Layers 1–9: classify combined text
    text = f"{subject or ''} {body_snippet or ''}"

    # Layer 0.5: LLM-generated pattern cache (checked after domain, before regex)
    try:
        from app.classifier.pattern_gen import match_pattern_cache
        hit = match_pattern_cache(text)
        if hit:
            return RuleResult(
                label=Label(hit.label),
                category=hit.category,
                confidence=hit.confidence,
                matched_domain=False,
                matched_layer="pattern_cache",
                merchant=hit.merchant,
            )
    except Exception:
        pass  # non-fatal
    raw = classify_transaction(text, sender=sender_domain)

    label_str = raw.get("label")
    if not label_str or label_str == "ignore" and raw.get("confidence", 0) < 0.5:
        # Truly uncertain — signal caller to use LLM
        return RuleResult(label=None, category=None, confidence=0.0,
                          matched_domain=False, matched_layer="none")

    try:
        label = Label(label_str)
    except ValueError:
        label = Label.ignore

    return RuleResult(
        label=label,
        category=raw.get("category"),
        confidence=raw.get("confidence", 0.0),
        matched_domain=False,
        matched_layer=raw.get("matched_layer", "none"),
        matched_keywords=raw.get("matched_keywords", []),
        merchant=raw.get("merchant"),
    )


def diagnose_email(
    sender_domain: str,
    subject: str,
    body_snippet: str,
    db_rules: Optional[dict] = None,
) -> dict:
    """Full diagnostic — all layers, no side-effects. Used by terminal output."""
    all_rules = {**BUILTIN_SENDER_RULES, **(db_rules or {})}
    domain_match = all_rules.get(sender_domain)
    text = f"{subject or ''} {body_snippet or ''}"

    exp_count, exp_matched = _kw_score(text, EXPENSE_KEYWORDS)
    inc_count, inc_matched = _kw_score(text, INCOME_KEYWORDS)
    ign_count, ign_matched = _kw_score(text, IGNORE_KEYWORDS)

    merchant, merchant_cat, _merch_conf = detect_merchant(text)
    sender_is_bank = any(b in sender_domain.lower() for b in BANK_DOMAINS)
    has_upi = bool(UPI_REGEX.search(text))
    debit_m  = DEBIT_REGEX.search(text)
    credit_m = CREDIT_REGEX.search(text)
    ignore_m = IGNORE_STRONG_REGEX.search(text)
    amount   = extract_amount(text)

    return {
        "domain": sender_domain,
        "domain_rule": {
            "matched":  bool(domain_match),
            "label":    domain_match[0].value if domain_match else None,
            "category": domain_match[1]       if domain_match else None,
            "source":   "user" if (db_rules and sender_domain in db_rules)
                        else "builtin" if domain_match else None,
        },
        "regex": {
            "debit_match":    debit_m.group(0)  if debit_m  else None,
            "credit_match":   credit_m.group(0) if credit_m else None,
            "ignore_match":   ignore_m.group(0) if ignore_m else None,
            "has_upi":        has_upi,
            "is_bank_sender": sender_is_bank,
            "amount_found":   amount,
        },
        "merchant": {
            "detected": merchant,
            "category": merchant_cat,
        },
        "text_checked": text[:300],
        "expense":  {"count": exp_count, "matched": exp_matched},
        "income":   {"count": inc_count, "matched": inc_matched},
        "ignore":   {"count": ign_count, "matched": ign_matched},
        "thresholds": {
            "domain_confidence":   0.95,
            "regex_confidence":    0.90,
            "merchant_confidence": 0.92,
            "keyword_min_hits":    2,
            "ignore_min_hits":     2,
        },
    }
