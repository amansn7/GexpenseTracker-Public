import re
from dataclasses import dataclass
from typing import TYPE_CHECKING

from app.models import Label

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession


@dataclass
class RuleResult:
    label: Label | None
    confidence: float
    category: str | None = None
    matched_domain: bool = False
    merchant: str | None = None


BUILTIN_DOMAIN_RULES = {
    "zomato.com": (Label.expense, "Food"),
    "swiggy.in": (Label.expense, "Food"),
    "amazon.in": (Label.expense, "Shopping"),
    "uber.com": (Label.expense, "Travel"),
}

_DOMAIN_MERCHANT = {
    "zomato.com": "Zomato",
    "swiggy.in": "Swiggy",
    "amazon.in": "Amazon",
    "uber.com": "Uber",
    "bigbasket.com": "BigBasket",
    "netflix.com": "Netflix",
}

MERCHANT_MAP = {
    "swiggy": {"display": "Swiggy", "category": "Food"},
    "swiggy instamart": {"display": "Swiggy Instamart", "category": "Groceries"},
    "zomato": {"display": "Zomato", "category": "Food"},
    "amazon": {"display": "Amazon", "category": "Shopping"},
    "uber": {"display": "Uber", "category": "Travel"},
    "bigbasket": {"display": "BigBasket", "category": "Groceries"},
    "netflix": {"display": "Netflix", "category": "Subscriptions"},
    "youtube premium": {"display": "YouTube Premium", "category": "Subscriptions"},
    "anthropic": {"display": "Anthropic", "category": "Subscriptions"},
    "openai": {"display": "OpenAI", "category": "Subscriptions"},
    "claude": {"display": "Anthropic", "category": "Subscriptions"},
    "chatgpt": {"display": "OpenAI", "category": "Subscriptions"},
}

_FINANCIAL_AMOUNT_RE = re.compile(
    r"(?:Rs\.?\s*|INR\s*|₹)\s*[\d,]+|[\d,]+\s*(?:INR|Rs)",
    re.IGNORECASE,
)
_FINANCIAL_VERB_RE = re.compile(
    r"\b(?:debit(?:ed)?|credit(?:ed)?|charged?|spent|received?|deposited|withdrawn)\b",
    re.IGNORECASE,
)

EXPENSE_KEYWORDS = (
    "debited",
    "debit",
    "paid",
    "payment receipt",
    "charged",
    "purchase",
    "invoice",
    "bill",
    "order confirmed",
)

INCOME_KEYWORDS = (
    "credited",
    "credit",
    "salary",
    "refund",
    "cashback",
    "received",
)

DELIVERY_SIGNALS = (
    "delivered",
    "out for delivery",
    "out-for-delivery",
    "shipment delivered",
    "package delivered",
    "item delivered",
)

_ORDER_SIGNALS = (
    "order confirmed",
    "order confirmation",
    "order placed",
    "order receipt",
    "thanks for your order",
    "thank you for your order",
    "order received",
)

IGNORE_KEYWORDS = (
    "unsubscribe",
    "newsletter",
    "promotional",
    "offer",
    "click here",
)


def apply_rules(
    sender_domain: str,
    subject: str,
    body: str,
    db_rules: dict[str, tuple[Label, str | None]] | None = None,
) -> RuleResult:
    domain = (sender_domain or "").strip().lower()
    text = f"{subject or ''} {body or ''}".lower()

    subject_lower = (subject or "").lower()
    has_delivery_only = any(sig in text for sig in DELIVERY_SIGNALS) and not any(
        sig in subject_lower for sig in _ORDER_SIGNALS
    )

    if has_delivery_only:
        return RuleResult(label=Label.ignore, confidence=0.85)

    income_hits = sum(1 for keyword in INCOME_KEYWORDS if keyword in text)
    expense_hits = sum(1 for keyword in EXPENSE_KEYWORDS if keyword in text)
    has_amount = bool(_FINANCIAL_AMOUNT_RE.search(text))
    has_verb = bool(_FINANCIAL_VERB_RE.search(text))

    cc_payment = re.search(r"credit\s+card.*(?:received\s+payment|payment\s+received)", text)
    if cc_payment:
        return RuleResult(label=Label.ignore, category="CC Payment", confidence=0.95)

    is_financial = has_amount or (has_verb and (income_hits > 0 or expense_hits > 0))

    domain_label = None
    domain_category = None
    matched_domain = False
    if db_rules and domain in db_rules:
        domain_label, domain_category = db_rules[domain]
        matched_domain = True
    elif domain in BUILTIN_DOMAIN_RULES:
        domain_label, domain_category = BUILTIN_DOMAIN_RULES[domain]
        matched_domain = True

    if is_financial:
        if income_hits > expense_hits:
            if matched_domain and domain_label == Label.income:
                conf = 0.98 if (db_rules and domain in db_rules) else 0.92
            else:
                conf = min(0.62 + income_hits * 0.12, 0.9)
            return RuleResult(
                label=Label.income,
                category=domain_category or "Income",
                confidence=conf,
                matched_domain=matched_domain,
                merchant=_DOMAIN_MERCHANT.get(domain) if matched_domain else None,
            )
        if expense_hits > 0:
            if matched_domain and domain_label == Label.expense:
                conf = 0.98 if (db_rules and domain in db_rules) else 0.92
            else:
                conf = 0.88
            return RuleResult(
                label=Label.expense,
                category=domain_category,
                confidence=conf,
                matched_domain=matched_domain,
                merchant=_DOMAIN_MERCHANT.get(domain) if matched_domain else None,
            )
        return RuleResult(label=None, confidence=0.0)

    if matched_domain:
        return RuleResult(
            label=domain_label, category=domain_category,
            confidence=0.98 if (db_rules and domain in db_rules) else 0.92,
            matched_domain=True,
            merchant=_DOMAIN_MERCHANT.get(domain),
        )

    if any(keyword in text for keyword in IGNORE_KEYWORDS):
        return RuleResult(label=Label.ignore, confidence=0.82)

    if income_hits > expense_hits:
        return RuleResult(label=Label.income, category="Income", confidence=min(0.62 + income_hits * 0.12, 0.9))
    if expense_hits:
        return RuleResult(label=Label.expense, confidence=min(0.62 + expense_hits * 0.1, 0.88))

    return RuleResult(label=None, confidence=0.0)


async def build_domain_rules(
    session: "AsyncSession",
    min_count: int = 3,
    min_confidence: float = 0.75,
) -> dict[str, tuple[Label, str | None]]:
    """
    Learn domain→(label, category) from high-confidence existing transactions
    and user-trained SenderRule entries. SenderRule entries always take priority
    over transaction-based learning.
    """
    from sqlalchemy import func, select

    from app.models import Email, Transaction

    rows = (
        await session.execute(
            select(
                Email.sender_domain,
                Transaction.label,
                Transaction.category,
                func.count().label("cnt"),
            )
            .join(Email, Transaction.email_id == Email.id)
            .where(
                Transaction.label.in_(["expense", "income", "ignore"]),
                Email.sender_domain.isnot(None),
                Transaction.confidence >= min_confidence,
            )
            .group_by(Email.sender_domain, Transaction.label, Transaction.category)
        )
    ).all()

    domain_tally: dict[str, dict] = {}
    for row in rows:
        domain = row.sender_domain.lower()
        domain_tally.setdefault(domain, {})
        domain_tally[domain][(row.label, row.category)] = (
            domain_tally[domain].get((row.label, row.category), 0) + row.cnt
        )

    result: dict[str, tuple[Label, str | None]] = {}
    for domain, tally in domain_tally.items():
        best_key, best_cnt = max(tally.items(), key=lambda x: x[1])
        total = sum(tally.values())
        if best_cnt >= min_count and best_cnt / total >= 0.8:
            label_str, category = best_key
            try:
                result[domain] = (Label(label_str), category)
            except ValueError:
                pass

    # Merge in SenderRule entries (user-trained, always overrides transaction data)
    from app.models.financial import SenderRule

    sender_rules = (
        await session.execute(
            select(
                SenderRule.sender_domain,
                SenderRule.label,
                SenderRule.category,
            ).where(SenderRule.sender_domain.isnot(None))
        )
    ).all()
    for sr in sender_rules:
        domain = sr.sender_domain.lower().strip()
        if sr.label:
            try:
                result[domain] = (Label(sr.label), sr.category)
            except ValueError:
                pass

    return result
