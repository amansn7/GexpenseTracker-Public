import re
from dataclasses import dataclass
from typing import Optional, TYPE_CHECKING

from app.models import Label

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession


@dataclass
class RuleResult:
    label: Optional[Label]
    confidence: float
    category: Optional[str] = None
    matched_domain: bool = False
    merchant: Optional[str] = None


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
}

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
    db_rules: Optional[dict[str, tuple[Label, Optional[str]]]] = None,
) -> RuleResult:
    domain = (sender_domain or "").strip().lower()
    text = f"{subject or ''} {body or ''}".lower()

    subject_lower = (subject or "").lower()
    has_delivery_only = any(sig in subject_lower for sig in DELIVERY_SIGNALS) and not any(sig in subject_lower for sig in _ORDER_SIGNALS)

    if has_delivery_only:
        return RuleResult(label=Label.ignore, confidence=0.85)

    if db_rules and domain in db_rules:
        label, category = db_rules[domain]
        return RuleResult(label=label, category=category, confidence=0.98, matched_domain=True, merchant=_DOMAIN_MERCHANT.get(domain))

    if domain in BUILTIN_DOMAIN_RULES:
        label, category = BUILTIN_DOMAIN_RULES[domain]
        return RuleResult(label=label, category=category, confidence=0.92, matched_domain=True, merchant=_DOMAIN_MERCHANT.get(domain))

    cc_payment = re.search(r'credit\s+card.*(?:received\s+payment|payment\s+received)', text)
    if cc_payment:
        return RuleResult(label=Label.ignore, category="CC Payment", confidence=0.95)

    if any(keyword in text for keyword in IGNORE_KEYWORDS):
        return RuleResult(label=Label.ignore, confidence=0.82)

    income_hits = sum(1 for keyword in INCOME_KEYWORDS if keyword in text)
    expense_hits = sum(1 for keyword in EXPENSE_KEYWORDS if keyword in text)

    if income_hits > expense_hits:
        return RuleResult(label=Label.income, category="Income", confidence=min(0.62 + income_hits * 0.12, 0.9))
    if expense_hits:
        return RuleResult(label=Label.expense, confidence=min(0.62 + expense_hits * 0.1, 0.88))

    return RuleResult(label=None, confidence=0.0)


async def build_domain_rules(
    session: "AsyncSession",
    min_count: int = 3,
    min_confidence: float = 0.75,
) -> dict[str, tuple[Label, Optional[str]]]:
    """
    Learn domain→(label, category) from high-confidence existing transactions
    and user-trained SenderRule entries. SenderRule entries always take priority
    over transaction-based learning.
    """
    from sqlalchemy import func, select
    from app.models import Transaction, Email

    rows = (await session.execute(
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
    )).all()

    domain_tally: dict[str, dict] = {}
    for row in rows:
        domain = row.sender_domain.lower()
        domain_tally.setdefault(domain, {})
        domain_tally[domain][(row.label, row.category)] = (
            domain_tally[domain].get((row.label, row.category), 0) + row.cnt
        )

    result: dict[str, tuple[Label, Optional[str]]] = {}
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
    sender_rules = (await session.execute(
        select(SenderRule).where(SenderRule.sender_domain.isnot(None))
    )).scalars().all()
    for sr in sender_rules:
        domain = sr.sender_domain.lower().strip()
        if sr.label:
            try:
                result[domain] = (Label(sr.label), sr.category)
            except ValueError:
                pass

    return result
