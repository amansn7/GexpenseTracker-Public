from dataclasses import dataclass, field
from typing import Optional, List, Tuple
from app.models import Label

# Ordered longest-first within each list to avoid substring inflation:
# e.g. "debited" supersedes "debit", "credited" supersedes "credit"
EXPENSE_KEYWORDS = [
    "order confirmed", "order confirmation",
    "payment successful", "payment confirmation",
    "booking confirmed", "amount paid",
    "receipt", "invoice", "debited", "charged",
    "bill", "purchase", "transaction", "₹", "rs.", "inr",
]

INCOME_KEYWORDS = [
    "transferred to you", "you have received", "amount credited",
    "salary", "cashback", "refund", "credited", "received",
]

IGNORE_KEYWORDS = [
    "verification code", "one time password", "verify your",
    "no-reply marketing", "newsletter", "unsubscribe", "promotional",
    "otp", "offers", "click here",
]

BUILTIN_SENDER_RULES = {
    "amazon.in": (Label.expense, "Shopping"),
    "flipkart.com": (Label.expense, "Shopping"),
    "myntra.com": (Label.expense, "Shopping"),
    "meesho.com": (Label.expense, "Shopping"),
    "zomato.com": (Label.expense, "Food"),
    "swiggy.in": (Label.expense, "Food"),
    "blinkit.com": (Label.expense, "Groceries"),
    "bigbasket.com": (Label.expense, "Groceries"),
    "phonepe.com": (Label.expense, "UPI Payment"),
    "paytm.com": (Label.expense, "UPI Payment"),
    "razorpay.com": (Label.expense, "Payment"),
    "cred.club": (Label.expense, "Bill Payment"),
    "makemytrip.com": (Label.expense, "Travel"),
    "irctc.co.in": (Label.expense, "Travel"),
    "olacabs.com": (Label.expense, "Transport"),
    "uber.com": (Label.expense, "Transport"),
    "rapido.bike": (Label.expense, "Transport"),
    "airtel.in": (Label.expense, "Utilities"),
    "jio.com": (Label.expense, "Utilities"),
}


@dataclass
class RuleResult:
    label: Optional[Label]
    category: Optional[str]
    confidence: float
    matched_domain: bool
    matched_keywords: List[str] = field(default_factory=list)


def _score(text: str, keywords: List[str]) -> Tuple[int, List[str]]:
    """Count distinct keyword matches in text (case-insensitive).
    Skips a keyword if any longer keyword from this list already matched at the same position.
    Returns (count, matched_keywords).
    """
    lower = text.lower()
    matched = []
    for kw in keywords:
        if kw in lower:
            # Skip if a longer phrase in our list already covers this keyword
            if any(len(other) > len(kw) and kw in other and other in lower for other in keywords):
                continue
            matched.append(kw)
    return len(matched), matched


def apply_rules(
    sender_domain: str,
    subject: str,
    body_snippet: str,
    db_rules: Optional[dict] = None,
) -> RuleResult:
    """Classify an email using domain lookup and keyword scoring.

    Args:
        sender_domain: extracted domain from sender email address
        subject: email subject line (None-safe)
        body_snippet: first ~500 chars of email body (None-safe)
        db_rules: {domain: (Label, category)} — user-trained rules, override builtins

    Returns:
        RuleResult with label=None and confidence=0.0 when classification is uncertain.
    """
    all_rules = {**BUILTIN_SENDER_RULES, **(db_rules or {})}

    if sender_domain in all_rules:
        label, category = all_rules[sender_domain]
        return RuleResult(label=label, category=category, confidence=0.95, matched_domain=True)

    text = f"{subject or ''} {body_snippet or ''}"
    expense_count, expense_matched = _score(text, EXPENSE_KEYWORDS)
    income_count, income_matched = _score(text, INCOME_KEYWORDS)
    ignore_count, ignore_matched = _score(text, IGNORE_KEYWORDS)

    if ignore_count >= 2:
        return RuleResult(label=Label.ignore, category=None, confidence=0.80,
                          matched_domain=False, matched_keywords=ignore_matched)

    if expense_count > income_count and expense_count >= 2:
        confidence = min(0.60 + expense_count * 0.05, 0.84)
        return RuleResult(label=Label.expense, category="Other", confidence=confidence,
                          matched_domain=False, matched_keywords=expense_matched)

    if income_count > expense_count and income_count >= 2:
        confidence = min(0.60 + income_count * 0.05, 0.84)
        return RuleResult(label=Label.income, category="Income", confidence=confidence,
                          matched_domain=False, matched_keywords=income_matched)

    return RuleResult(label=None, category=None, confidence=0.0, matched_domain=False)


def diagnose_email(
    sender_domain: str,
    subject: str,
    body_snippet: str,
    db_rules: Optional[dict] = None,
) -> dict:
    """Return a full rule-engine diagnostic without side-effects."""
    all_rules = {**BUILTIN_SENDER_RULES, **(db_rules or {})}
    domain_match = all_rules.get(sender_domain)
    text = f"{subject or ''} {body_snippet or ''}"
    expense_count, expense_matched = _score(text, EXPENSE_KEYWORDS)
    income_count,  income_matched  = _score(text, INCOME_KEYWORDS)
    ignore_count,  ignore_matched  = _score(text, IGNORE_KEYWORDS)
    return {
        "domain": sender_domain,
        "domain_rule": {
            "matched": bool(domain_match),
            "label": domain_match[0].value if domain_match else None,
            "category": domain_match[1] if domain_match else None,
            "source": "user" if (db_rules and sender_domain in db_rules) else "builtin" if domain_match else None,
        },
        "text_checked": text[:300],
        "expense":  {"count": expense_count,  "matched": expense_matched},
        "income":   {"count": income_count,   "matched": income_matched},
        "ignore":   {"count": ignore_count,   "matched": ignore_matched},
        "thresholds": {
            "domain_confidence": 0.95,
            "keyword_min_hits": 2,
            "ignore_min_hits": 2,
        },
    }
