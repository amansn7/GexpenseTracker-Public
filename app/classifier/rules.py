from dataclasses import dataclass, field
from app.models import Label

EXPENSE_KEYWORDS = [
    "receipt", "invoice", "order confirmed", "order confirmation",
    "payment successful", "payment confirmation", "debited", "charged",
    "bill", "debit", "purchase", "booking confirmed", "amount paid",
    "transaction", "₹", "rs.", "inr",
]

INCOME_KEYWORDS = [
    "credited", "received", "salary", "transferred to you",
    "refund", "cashback", "credit", "you have received", "amount credited",
]

IGNORE_KEYWORDS = [
    "newsletter", "unsubscribe", "promotional", "otp", "verify your",
    "verification code", "one time password", "offers", "sale",
    "click here", "no-reply marketing",
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
    label: object  # Label | None
    category: object  # str | None
    confidence: float
    matched_domain: bool
    matched_keywords: list = field(default_factory=list)

def _score(text, keywords):
    lower = text.lower()
    matched = [kw for kw in keywords if kw in lower]
    return len(matched), matched

def apply_rules(sender_domain, subject, body_snippet, db_rules=None):
    """
    db_rules format: {domain: (Label, category)}
    User-trained db_rules override builtin rules.
    """
    all_rules = {**BUILTIN_SENDER_RULES, **(db_rules or {})}

    if sender_domain in all_rules:
        label, category = all_rules[sender_domain]
        return RuleResult(label=label, category=category, confidence=0.95, matched_domain=True)

    text = f"{subject} {body_snippet}"
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
