"""
Regex-based transaction extractor ported from ExpenseRuleEngine.
Produces structured pre-extraction hints fed to the LLM prompt.
No external ML models required.
"""

import re

from app.services.currency import SUPPORTED_CURRENCIES

# ── Amount ────────────────────────────────────────────────────────────────────

_AMOUNT_RE = re.compile(
    r"(?:₹|Rs\.?|INR)\s*([\d,]+(?:\.\d{1,2})?)"  # prefix: ₹2754, Rs. 2754, INR 2754
    r"|"
    r"([\d,]+(?:\.\d{1,2})?)\s*(?:Rs\.?|INR|₹)",  # suffix: 2754 INR, 2754 Rs, 2754₹
    re.IGNORECASE,
)

_CURRENCY_CODES = "|".join(sorted(SUPPORTED_CURRENCIES - {"INR"}, key=len, reverse=True))
_SYMBOL_MAP = {
    "$": "USD",
    "€": "EUR",
    "£": "GBP",
    "¥": "JPY",
    "A$": "AUD",
    "C$": "CAD",
    "HK$": "HKD",
    "S$": "SGD",
    "NZ$": "NZD",
}

_FOREIGN_CURRENCY_RE = re.compile(
    # 1. Currency code prefix: USD5.90, USD 5.90
    r"(?:(" + _CURRENCY_CODES + r")\s*([\d][\d,]*(?:\.\d{1,2})?))"
    r"|"
    # 2. Symbol prefix: $5.90, €50.00, £25.00
    r"(?:([$€£¥])\s*([\d][\d,]*(?:\.\d{1,2})?))"
    r"|"
    # 3. Amount suffix: 5.90 USD, 10.50 US Dollars (amount must start with digit)
    r"(?:((?<![\d,])[\d][\d,]*(?:\.\d{1,2})?)\s+((?:" + _CURRENCY_CODES + r"|US\s+Dollars?)))",
    re.IGNORECASE,
)


def _resolve_symbol_currency(symbol: str) -> str:
    upper = symbol.upper()
    for prefix, curr in _SYMBOL_MAP.items():
        if upper == prefix.upper():
            return curr
    return "USD"


def _extract_foreign_amount(text: str) -> tuple[float | None, str | None]:
    m = _FOREIGN_CURRENCY_RE.search(text)
    if not m:
        return None, None
    raw = None
    currency = None
    # Group 1-2: currency code prefix
    if m.group(1):
        raw = m.group(2)
        currency = m.group(1).upper()
    # Group 3-4: symbol prefix
    elif m.group(3):
        raw = m.group(4)
        currency = _resolve_symbol_currency(m.group(3))
    # Group 5-6: amount suffix
    elif m.group(5):
        raw = m.group(5)
        currency = m.group(6).upper()
        if currency.startswith("US"):
            currency = "USD"
    if not raw:
        return None, None
    try:
        return float(raw.replace(",", "")), currency
    except ValueError:
        return None, None


# ── Date ─────────────────────────────────────────────────────────────────────

_DATE_RE = re.compile(
    r"\d{4}[-/.]\d{1,2}[-/.]\d{1,2}"
    r"|\d{1,2}[-/.]\d{1,2}[-/.]\d{4}"
    r"|\d{1,2}[-/.]\d{1,2}[-/.]\d{2}"
    r"|\d{1,2}\s+[A-Za-z]{3,9},?\s+\d{4}"
    r"|[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}",
    re.IGNORECASE,
)

_MONTH = {
    "jan": "01",
    "feb": "02",
    "mar": "03",
    "apr": "04",
    "may": "05",
    "jun": "06",
    "jul": "07",
    "aug": "08",
    "sep": "09",
    "oct": "10",
    "nov": "11",
    "dec": "12",
}


def _normalize_date(raw: str) -> str | None:
    raw = raw.strip()
    patterns = [
        (r"^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$", "ymd"),
        (r"^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$", "dmy"),
        (r"^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})$", "dmy2"),
        (r"^(\d{1,2})\s+([A-Za-z]{3,9}),?\s+(\d{4})$", "dMy"),
        (r"^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})$", "Mdy"),
    ]
    for pattern, fmt in patterns:
        m = re.match(pattern, raw, re.IGNORECASE)
        if not m:
            continue
        g = m.groups()
        try:
            if fmt == "ymd":
                return f"{g[0]}-{int(g[1]):02d}-{int(g[2]):02d}"
            if fmt == "dmy":
                return f"{g[2]}-{int(g[1]):02d}-{int(g[0]):02d}"
            if fmt == "dmy2":
                return f"{2000 + int(g[2])}-{int(g[1]):02d}-{int(g[0]):02d}"
            if fmt == "dMy":
                mon = _MONTH.get(g[1].lower()[:3], "01")
                return f"{g[2]}-{mon}-{int(g[0]):02d}"
            if fmt == "Mdy":
                mon = _MONTH.get(g[0].lower()[:3], "01")
                return f"{g[2]}-{mon}-{int(g[1]):02d}"
        except (ValueError, IndexError):
            continue
    return None


# ── Direction ────────────────────────────────────────────────────────────────

_DEBIT_RE = re.compile(r"\b(debited|paid|spent|deducted|charged|withdrawn)\b", re.IGNORECASE)
_CREDIT_RE = re.compile(r"\b(credited|received|deposited|refunded|reversed)\b", re.IGNORECASE)
_CC_PAYMENT_RE = re.compile(r"credit\s+card.*(?:received\s+payment|payment\s+received)", re.IGNORECASE)


def _extract_direction(text: str) -> str:
    if _CC_PAYMENT_RE.search(text):
        return "debit"
    if _DEBIT_RE.search(text):
        return "debit"
    if _CREDIT_RE.search(text):
        return "credit"
    return "unknown"


# ── Mode ─────────────────────────────────────────────────────────────────────

_MODE_PATTERNS = [
    ("upi", r"\b(upi|gpay|phonepe|paytm|bhim|googlepay|p2m)\b"),
    ("credit_card", r"\b(credit card|cc)\b"),
    ("debit_card", r"\b(debit card|dc)\b"),
    ("neft", r"\b(neft|rtgs|imps)\b"),
]


def _extract_mode(text: str) -> str:
    t = text.lower()
    for mode, pattern in _MODE_PATTERNS:
        if re.search(pattern, t, re.IGNORECASE):
            return mode
    return "unknown"


# ── Merchant ─────────────────────────────────────────────────────────────────

_MERCHANT_PATTERNS = [
    # UPI format: "upi_id Name on"
    re.compile(r"[\w.\-]+@[\w.\-]+\s+([\w ]+?)\s+on\b", re.IGNORECASE),
    # "Merchant Name: XYZ" (Axis Bank)
    re.compile(r"(?:Merchant\s+Name|Merchant)[:\s]+([A-Za-z][\w ._\-]{1,39})(?:\s+Axis|\s+Bank|$|\n)", re.IGNORECASE),
    # "Info: AMAZON PAY IN E COMMERCE"
    re.compile(r"Info[:\s]+([A-Za-z][\w ._\-]{1,39})(?:\s+(?:XX|\d{4})|$)", re.IGNORECASE),
    # "towards MERCHANT on|via|ref" — space only (no newline via \s)
    re.compile(r"\btowards\s+([A-Za-z0-9][A-Za-z0-9 ._\-]{1,39})(?:\s+on\b|\s+via\b|\s+ref\b|$)", re.IGNORECASE),
    # "at MERCHANT on"
    re.compile(r"\bat\s+([A-Za-z][A-Za-z0-9 ._\-]{1,29})(?:\s+on\b|\s+Trxn\b)", re.IGNORECASE),
    # "to MERCHANT via|ref|on"
    re.compile(r"\bto\s+([A-Za-z][A-Za-z0-9 ._\-]{1,29})(?:\s+on\b|\s+via\b|\s+ref\b)", re.IGNORECASE),
    # "UPI/P2M/UTR/NAME"
    re.compile(r"UPI[\w/]+/([A-Za-z]+)", re.IGNORECASE),
]

_AMAZON_RE = re.compile(r"^AMAZON\s+PAY.*", re.IGNORECASE)
_NOISE_RE = re.compile(r"\s+XX\d{4}.*$", re.IGNORECASE)
_TRAILING_RE = re.compile(r"\s+(?:on|via|ref|using|from|for)\b.*$", re.IGNORECASE)
_DATE_SUFFIX_RE = re.compile(r"\s+\d{1,2}[-/.]\d{1,2}.*$")


def _clean_merchant(raw: str) -> str:
    raw = _AMAZON_RE.sub("Amazon", raw)
    raw = _NOISE_RE.sub("", raw)
    raw = _TRAILING_RE.sub("", raw)
    raw = _DATE_SUFFIX_RE.sub("", raw)
    raw = re.sub(r"\s+", " ", raw)
    raw = raw.split("(")[0].split(".")[0].replace("*", "").strip()
    return raw


def _extract_merchant(text: str) -> str | None:
    for pattern in _MERCHANT_PATTERNS:
        m = pattern.search(text)
        if m:
            candidate = _clean_merchant(m.group(1).strip())
            if len(candidate) >= 2 and not candidate.isdigit():
                return candidate
    return None


# ── Category keyword map ──────────────────────────────────────────────────────

_MERCHANT_EXACT: dict[str, str] = {
    "swiggy": "Food",
    "zomato": "Food",
    "instamart": "Groceries",
    "blinkit": "Groceries",
    "bigbasket": "Groceries",
    "zepto": "Groceries",
    "amazon": "Shopping",
    "flipkart": "Shopping",
    "myntra": "Shopping",
    "meesho": "Shopping",
    "uber": "Transport",
    "ola": "Transport",
    "rapido": "Transport",
    "netflix": "Entertainment",
    "spotify": "Entertainment",
    "hotstar": "Entertainment",
    "youtube": "Entertainment",
    "airtel": "Utilities",
    "jio": "Utilities",
    "zerodha": "Investment",
    "groww": "Investment",
    "irctc": "Travel",
    "ixigo": "Travel",
    "redbus": "Travel",
    "apollo": "Healthcare",
    "pharmeasy": "Healthcare",
    "1mg": "Healthcare",
    "cred": "Other",
    "anthropic": "Subscriptions",
    "openai": "Subscriptions",
    "claude": "Subscriptions",
    "chatgpt": "Subscriptions",
}

_CATEGORY_KEYWORDS: dict[str, list[str]] = {
    "Food": [
        "swiggy",
        "zomato",
        "dominos",
        "pizza",
        "burger",
        "kfc",
        "mcdonalds",
        "restaurant",
        "dhaba",
        "food",
        "meal",
        "dineout",
        "cafe",
    ],
    "Groceries": ["blinkit", "zepto", "bigbasket", "grofers", "grocery", "vegetables", "kirana", "instamart"],
    "Transport": ["uber", "ola", "rapido", "namma yatri", "metro", "taxi", "auto", "cab", "ride", "parking", "toll"],
    "Shopping": ["amazon", "flipkart", "myntra", "meesho", "ajio", "snapdeal", "zudio", "dmart"],
    "Entertainment": [
        "netflix",
        "spotify",
        "hotstar",
        "disney",
        "youtube",
        "prime video",
        "sonyliv",
        "movie",
        "cinema",
    ],
    "Utilities": ["electricity", "water", "broadband", "wifi", "airtel", "jio", "recharge", "bill payment", "bescom"],
    "Travel": ["flight", "irctc", "indigo", "air india", "redbus", "train", "bus ticket", "ixigo"],
    "Healthcare": ["hospital", "pharmacy", "medicine", "apollo", "pharmeasy", "1mg", "clinic", "doctor"],
    "Investment": ["sip", "mutual fund", "zerodha", "groww", "upstox", "folio", "amc", "demat"],
    "Subscriptions": ["subscription", "membership", "premium", "annual plan"],
    "Fuel": ["petrol", "diesel", "cng", "fuel", "hpcl", "iocl", "bpcl"],
    "Rent": ["rent", "emi", "home loan", "mortgage"],
    "CC Payment": ["credit card", "cc payment", "credit card bill"],
    "Income": ["credited", "salary", "cashback", "refund", "reversal", "reward"],
    "UPI Payment": ["upi", "gpay", "phonepe", "paytm", "bhim"],
}


def _classify_category(text: str, merchant: str | None) -> str | None:
    t = text.lower()
    # Exact merchant lookup first
    if merchant:
        m_lower = merchant.lower()
        for key, cat in _MERCHANT_EXACT.items():
            if key in m_lower:
                return cat
    # Keyword scoring
    best_cat, best_score = None, 0
    for cat, keywords in _CATEGORY_KEYWORDS.items():
        score = sum(1 for kw in keywords if kw in t)
        if score > best_score:
            best_score, best_cat = score, cat
    return best_cat if best_score > 0 else None


# ── Public API ────────────────────────────────────────────────────────────────


def extract(subject: str, body: str) -> dict:
    """
    Return pre-extracted transaction hints from subject + body.
    All fields may be None/unknown if not found.
    """
    text = f"{subject or ''}\n{body or ''}"
    text_clean = re.sub(r"\s+", " ", text)

    amount: float | None = None
    foreign_amount, foreign_currency = _extract_foreign_amount(text_clean)
    m = _AMOUNT_RE.search(text_clean)
    if m:
        raw = m.group(1) or m.group(2) or m.group(3)
        if raw:
            try:
                amount = float(raw.replace(",", ""))
            except ValueError:
                pass

    source_currency: str | None = None
    if amount is not None:
        source_currency = "INR"
    elif foreign_amount is not None:
        amount = foreign_amount
        source_currency = foreign_currency

    date: str | None = None
    dm = _DATE_RE.search(text_clean)
    if dm:
        date = _normalize_date(dm.group())

    direction = _extract_direction(text_clean)
    mode = _extract_mode(text_clean)
    merchant = _extract_merchant(text_clean)
    category_hint = _classify_category(text_clean, merchant)

    return {
        "amount": amount,
        "date": date,
        "direction": direction,
        "mode": mode,
        "merchant": merchant,
        "category_hint": category_hint,
        "source_currency": source_currency,
    }
