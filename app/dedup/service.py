import uuid
import logging
import sys
import re
from datetime import datetime, timedelta, timezone
from typing import Optional, Set, Tuple, List, Dict, Any
from sqlalchemy import select, or_, and_, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import Transaction, Email, DuplicatePair, DomainPairRule
from app.config import settings

logger = logging.getLogger(__name__)

_AUTO_RESOLVE_MIN_CONFIRMED = 3

# ── Currency normalization ──────────────────────────────────────────────────
_CURRENCY_RE = re.compile(r'[₹$€£]\s*|Rs\.?\s*|INR\s*|USD\s*|EUR\s*|GBP\s*', re.IGNORECASE)
_COMMA_RE = re.compile(r',')

def _normalize_amount(raw: Any) -> Optional[float]:
    """Strip currency symbols, commas, and whitespace; return float or None."""
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        return float(raw)
    text = str(raw).strip()
    text = _CURRENCY_RE.sub('', text)
    text = _COMMA_RE.sub('', text)
    try:
        return float(text)
    except (ValueError, TypeError):
        return None

# ── Merchant similarity ─────────────────────────────────────────────────────
_MERCHANT_STOP = frozenset([
    "the", "and", "for", "of", "on", "at", "to", "in", "by", "pvt", "ltd",
    "limited", "private", "india", "indian", "services", "solutions", "technologies",
    "inc", "corp", "company", "llc", "payments", "payment",
])

def _normalize_merchant(name: Optional[str]) -> str:
    if not name:
        return ""
    return " ".join(
        w for w in re.split(r'[\s\-_./,]+', name.lower())
        if w not in _MERCHANT_STOP and len(w) > 1
    )

# Known cross-domain aliases: (canonical, variant domain)
_MERCHANT_DOMAIN_ALIASES: Dict[str, List[str]] = {
    "swiggy": ["swiggy.in", "bundl.in", "bundltechnologies.com"],
    "zomato": ["zomato.com", "zomatohyperpure.com"],
    "amazon": ["amazon.in", "amazonpay.in", "amazonpayments.in"],
    "flipkart": ["flipkart.com", "ekart.com"],
    "uber": ["uber.com", "ubereats.com"],
    "irctc": ["irctc.co.in", "irctctourism.com"],
    "bookmyshow": ["bookmyshow.com", "bmsprime.in"],
    "myntra": ["myntra.com", "myntrafashion.com"],
    "paytm": ["paytm.com", "paytmmall.com"],
    "phonepe": ["phonepe.com", "phonepe.in"],
}

_DOMAIN_TO_CANONICAL: Dict[str, str] = {}
for canonical, variants in _MERCHANT_DOMAIN_ALIASES.items():
    for v in variants:
        _DOMAIN_TO_CANONICAL[v.lower()] = canonical

def _merchant_match(m1: Optional[str], m2: Optional[str], d1: Optional[str], d2: Optional[str]) -> float:
    """
    Return 0.0-1.0 similarity between two merchants considering domain aliases.
    """
    n1 = _normalize_merchant(m1)
    n2 = _normalize_merchant(m2)
    if not n1 or not n2:
        # Fall back to domain alias check
        c1 = _DOMAIN_TO_CANONICAL.get((d1 or "").lower())
        c2 = _DOMAIN_TO_CANONICAL.get((d2 or "").lower())
        return 0.7 if (c1 and c2 and c1 == c2) else 0.0
    if n1 == n2:
        return 1.0
    # Partial overlap
    words1 = set(n1.split())
    words2 = set(n2.split())
    if not words1 or not words2:
        return 0.0
    overlap = len(words1 & words2)
    return overlap / max(len(words1), len(words2))

_INVEST_ORDER_SIGNALS = frozenset([
    "order placed", "order sent", "purchase initiated", "sip initiated",
    "sip registered", "folio", "nav", "invest", "purchase order",
    "transaction initiated", "processing of purchase",
])

_INVEST_CONFIRM_SIGNALS = frozenset([
    "units allotted", "transaction successful", "purchase successful",
    "investment successful", "transaction confirmation", "purchase confirmation",
    "allotment", "credited to your folio", "transaction complete",
    "purchase transaction confirmation",
])


def _sorted_domains(d1: str, d2: str) -> Tuple[str, str]:
    return (d1, d2) if d1 <= d2 else (d2, d1)


def _amount_tolerance(amount: float, *, bulk: bool = False) -> float:
    if bulk:
        return max(abs(amount) * 0.03, 5.0)
    return max(abs(amount) * 0.005, 5.0)


def _subject_has_any(subject: Optional[str], signals: frozenset) -> bool:
    text = (subject or "").lower()
    return any(sig in text for sig in signals)


async def _load_paired_ids(tx_id: str, db: AsyncSession) -> Set[str]:
    """One query — returns the set of tx IDs already paired with tx_id."""
    rows = (await db.execute(
        select(DuplicatePair.primary_tx_id, DuplicatePair.duplicate_tx_id).where(
            or_(
                DuplicatePair.primary_tx_id == tx_id,
                DuplicatePair.duplicate_tx_id == tx_id,
            )
        )
    )).all()
    return {
        row.duplicate_tx_id if row.primary_tx_id == tx_id else row.primary_tx_id
        for row in rows
    }


def _is_dedup_candidate(transaction):
    if transaction.amount is None:
        return False
    if transaction.label == "income":
        return False
    return True


async def _score_pair(
    tx_a: Transaction,
    email_a: Email,
    tx_b: Transaction,
    email_b: Email,
    db: AsyncSession,
) -> Tuple[float, str]:
    """
    Run the shared 5-layer scoring pipeline against an arbitrary pair.

    Returns (confidence, rule_source). Returns (0.0, "unknown") if no layer
    fires with score >= 0.5 or the pair is structurally ineligible (missing
    effective date, amount diff outside tolerance, or day diff > 3).

    Layer order:
      1. same_domain_exact (1.0)
      2. merchant_alias    (0.75 - 0.95)
      3. domain_pair       (rule.confidence)
      4. investment_flow   (0.65)
      5. amount_date       (0.5)

    Tolerance: uses _amount_tolerance(amount, bulk=True) (3%) so callers do
    not need to pre-filter. Per-tx callers accepting the looser reach is
    intentional for layers 2-5 — same_domain stays on the per-tx tighter path.
    """
    if tx_a.amount is None or tx_b.amount is None:
        return (0.0, "unknown")
    if not email_a or not email_b:
        return (0.0, "unknown")
    if not email_a.sender_domain or not email_b.sender_domain:
        return (0.0, "unknown")

    eff_a = tx_a.txn_date or (email_a.received_at.date() if email_a.received_at else None)
    eff_b = tx_b.txn_date or (email_b.received_at.date() if email_b.received_at else None)
    if eff_a is None or eff_b is None:
        return (0.0, "unknown")

    amount_a = float(tx_a.amount)
    amount_b = float(tx_b.amount)
    tol = _amount_tolerance(amount_a, bulk=True)
    if abs(amount_a - amount_b) > tol:
        return (0.0, "unknown")

    day_diff = abs((eff_a - eff_b).days)
    if day_diff > 3:
        return (0.0, "unknown")

    domain_a = email_a.sender_domain.lower()
    domain_b = email_b.sender_domain.lower()
    subject_a = (email_a.subject or "").lower()
    subject_b = (email_b.subject or "").lower()
    merchant_a = tx_a.merchant or ""
    merchant_b = tx_b.merchant or ""

    # Layer 1: same domain (highest confidence)
    if domain_a == domain_b:
        return (1.0, "same_domain_exact")

    # Layer 2: merchant alias across domains
    m_score = _merchant_match(merchant_a, merchant_b, domain_a, domain_b)
    if m_score >= 0.7:
        return (0.75 + m_score * 0.2, "merchant_alias")

    # Layer 3: cross-domain with DomainPairRule
    da, db_ = _sorted_domains(domain_a, domain_b)
    rule = (await db.execute(
        select(DomainPairRule).where(
            DomainPairRule.domain_a == da,
            DomainPairRule.domain_b == db_,
        )
    )).scalar_one_or_none()
    if rule and rule.confidence >= 0.5:
        return (rule.confidence, "domain_pair")

    # Layer 4: investment flow
    a_is_order = _subject_has_any(subject_a, _INVEST_ORDER_SIGNALS)
    a_is_confirm = _subject_has_any(subject_a, _INVEST_CONFIRM_SIGNALS)
    b_is_order = _subject_has_any(subject_b, _INVEST_ORDER_SIGNALS)
    b_is_confirm = _subject_has_any(subject_b, _INVEST_CONFIRM_SIGNALS)
    if (a_is_order and b_is_confirm) or (a_is_confirm and b_is_order):
        if day_diff <= 3:
            return (0.65, "investment_flow")

    # Layer 5: amount + date fallback (lowest confidence)
    if day_diff <= 1:
        return (0.5, "amount_date")

    return (0.0, "unknown")


def _score_pair_with_rules(
    tx_a: Transaction,
    email_a: Email,
    tx_b: Transaction,
    email_b: Email,
    rules: Dict[Tuple[str, str], DomainPairRule],
) -> Tuple[float, str]:
    """
    Synchronous variant of _score_pair that uses a pre-loaded rules dict
    instead of hitting the database. Returns (confidence, rule_source).
    """
    if tx_a.amount is None or tx_b.amount is None:
        return (0.0, "unknown")
    if not email_a or not email_b:
        return (0.0, "unknown")
    if not email_a.sender_domain or not email_b.sender_domain:
        return (0.0, "unknown")

    eff_a = tx_a.txn_date or (email_a.received_at.date() if email_a.received_at else None)
    eff_b = tx_b.txn_date or (email_b.received_at.date() if email_b.received_at else None)
    if eff_a is None or eff_b is None:
        return (0.0, "unknown")

    amount_a = float(tx_a.amount)
    amount_b = float(tx_b.amount)
    tol = _amount_tolerance(amount_a, bulk=True)
    if abs(amount_a - amount_b) > tol:
        return (0.0, "unknown")

    day_diff = abs((eff_a - eff_b).days)
    if day_diff > 3:
        return (0.0, "unknown")

    domain_a = email_a.sender_domain.lower()
    domain_b = email_b.sender_domain.lower()
    subject_a = (email_a.subject or "").lower()
    subject_b = (email_b.subject or "").lower()
    merchant_a = tx_a.merchant or ""
    merchant_b = tx_b.merchant or ""

    # Layer 1: same domain (highest confidence)
    if domain_a == domain_b:
        return (1.0, "same_domain_exact")

    # Layer 2: merchant alias across domains
    m_score = _merchant_match(merchant_a, merchant_b, domain_a, domain_b)
    if m_score >= 0.7:
        return (0.75 + m_score * 0.2, "merchant_alias")

    # Layer 3: cross-domain with DomainPairRule (dict lookup instead of DB query)
    da, db_ = _sorted_domains(domain_a, domain_b)
    rule = rules.get((da, db_))
    if rule and rule.confidence >= 0.5:
        return (rule.confidence, "domain_pair")

    # Layer 4: investment flow
    a_is_order = _subject_has_any(subject_a, _INVEST_ORDER_SIGNALS)
    a_is_confirm = _subject_has_any(subject_a, _INVEST_CONFIRM_SIGNALS)
    b_is_order = _subject_has_any(subject_b, _INVEST_ORDER_SIGNALS)
    b_is_confirm = _subject_has_any(subject_b, _INVEST_CONFIRM_SIGNALS)
    if (a_is_order and b_is_confirm) or (a_is_confirm and b_is_order):
        if day_diff <= 3:
            return (0.65, "investment_flow")

    # Layer 5: amount + date fallback (lowest confidence)
    if day_diff <= 1:
        return (0.5, "amount_date")

    return (0.0, "unknown")


async def detect_and_record_duplicates(
    tx: Transaction,
    email: Optional[Email],
    db: AsyncSession,
) -> None:
    """
    Run immediately after a Transaction row is written.
    Detects duplicate expense transactions via three strategies:
      1. Same-domain: same sender, same amount (±0.5%), within ±3 days
      2. Cross-domain: different sender, same amount (±0.5%), within ±1 day
      3. Investment flow: "order sent" + "confirmation" pair for same amount
    Then runs a final shared-scorer pass for merchant_alias / amount_date hits
    the strategies above don't cover.
    All queries are scoped to email.user_id to prevent cross-user false positives.
    """
    if not _is_dedup_candidate(tx):
        return
    if not email or not email.sender_domain:
        return

    tx_domain = email.sender_domain.lower()
    amount = float(tx.amount)
    tol = _amount_tolerance(amount)
    user_id = email.user_id

    # Pre-load all existing pairs in one query; check membership in O(1) below.
    paired_ids = await _load_paired_ids(tx.id, db)

    # ── 1. Same-domain duplicate check ────────────────────────────────────────
    # Primary window: ±3 days received_at. Falls back to txn_date when received_at is null.
    if email.received_at is not None:
        same_domain_filter = and_(
            Email.received_at >= email.received_at - timedelta(days=3),
            Email.received_at <= email.received_at + timedelta(days=3),
        )
    elif tx.txn_date is not None:
        same_domain_filter = and_(
            Transaction.txn_date.isnot(None),
            Transaction.txn_date >= tx.txn_date - timedelta(days=3),
            Transaction.txn_date <= tx.txn_date + timedelta(days=3),
        )
    else:
        same_domain_filter = None

    if same_domain_filter is not None:
        same_domain_dupes = (await db.execute(
            select(Transaction, Email)
            .join(Email, Transaction.email_id == Email.id)
            .where(
                Transaction.id != tx.id,
                Transaction.label == "expense",
                func.abs(Transaction.amount - amount) <= tol,
                Email.user_id == user_id,
                Email.sender_domain == email.sender_domain,
                same_domain_filter,
            )
        )).all()

        for cand_tx, cand_email in same_domain_dupes:
            if cand_tx.id in paired_ids:
                continue
            paired_ids.add(cand_tx.id)

            primary_id = _pick_primary(tx, email, cand_tx, cand_email)
            dup_id = tx.id if primary_id == cand_tx.id else cand_tx.id
            dup_tx = tx if dup_id == tx.id else cand_tx
            dup_tx.label = "ignore"
            db.add(DuplicatePair(
                id=str(uuid.uuid4()),
                primary_tx_id=primary_id,
                duplicate_tx_id=dup_id,
                status="auto_resolved",
                confidence=1.0,
                rule_source="same_domain_exact",
            ))
            logger.info("Auto-resolved same-domain duplicate: %s vs %s (domain %s)",
                        primary_id, dup_id, tx_domain)

    # ── 2. Cross-domain duplicate check (±1 day window) ──────────────────────
    effective_date = tx.txn_date or (email.received_at.date() if email.received_at else None)
    if effective_date is None:
        return

    window_start = effective_date - timedelta(days=1)
    window_end   = effective_date + timedelta(days=1)

    if email.received_at is not None:
        recv_d1 = email.received_at - timedelta(days=1)
        recv_d2 = email.received_at + timedelta(days=1)
        date_filter = or_(
            and_(
                Transaction.txn_date.isnot(None),
                Transaction.txn_date >= window_start,
                Transaction.txn_date <= window_end,
            ),
            and_(
                Transaction.txn_date.is_(None),
                Email.received_at.isnot(None),
                Email.received_at >= recv_d1,
                Email.received_at <= recv_d2,
            ),
        )
    else:
        date_filter = and_(
            Transaction.txn_date >= window_start,
            Transaction.txn_date <= window_end,
        )

    candidates = (await db.execute(
        select(Transaction, Email)
        .outerjoin(Email, Transaction.email_id == Email.id)
        .where(
            Transaction.id != tx.id,
            Transaction.label == "expense",
            func.abs(Transaction.amount - amount) <= tol,
            date_filter,
            Email.user_id == user_id,
            Email.sender_domain.isnot(None),
        )
    )).all()

    for cand_tx, cand_email in candidates:
        if not cand_email or not cand_email.sender_domain:
            continue
        cand_domain = cand_email.sender_domain.lower()
        if cand_domain == tx_domain:
            continue
        if cand_tx.id in paired_ids:
            continue
        paired_ids.add(cand_tx.id)

        domain_a, domain_b = _sorted_domains(tx_domain, cand_domain)
        rule = (await db.execute(
            select(DomainPairRule).where(
                DomainPairRule.domain_a == domain_a,
                DomainPairRule.domain_b == domain_b,
            )
        )).scalar_one_or_none()

        if rule and rule.auto_resolve:
            primary_id = _pick_primary(tx, email, cand_tx, cand_email)
            dup_id = tx.id if primary_id == cand_tx.id else cand_tx.id
            db.add(DuplicatePair(
                id=str(uuid.uuid4()),
                primary_tx_id=primary_id,
                duplicate_tx_id=dup_id,
                status="auto_resolved",
                confidence=rule.confidence,
                rule_source="domain_pair",
            ))
            dup_tx = tx if dup_id == tx.id else cand_tx
            dup_tx.label = "ignore"
            logger.info("Auto-resolved duplicate: %s vs %s (rule %s/%s)",
                        primary_id, dup_id, domain_a, domain_b)
        else:
            confidence = rule.confidence if rule else 0.0
            db.add(DuplicatePair(
                id=str(uuid.uuid4()),
                primary_tx_id=tx.id,
                duplicate_tx_id=cand_tx.id,
                status="pending",
                confidence=confidence,
                rule_source="domain_pair" if rule else "amount_date",
            ))
            logger.info("Queued duplicate for review: %s vs %s", tx.id, cand_tx.id)

    # ── 3. Investment flow detection (order + confirmation across domains) ─────
    await _detect_investment_flow(tx, email, tx_domain, amount, tol, user_id, paired_ids, db)

    # ── 4. Shared-scorer pass (merchant_alias + amount_date fallback) ─────────
    # Uses the bulk tolerance (3%) and a ±3-day window so old data picks up
    # the same layers batch_detect_duplicates uses. We only record matches
    # the prior blocks would have missed: rule_source in {merchant_alias,
    # amount_date}. The higher-confidence layers (same_domain_exact,
    # domain_pair, investment_flow) are already handled above with their
    # auto-resolve semantics — re-handling them here would double-create pairs.
    bulk_tol = _amount_tolerance(amount, bulk=True)
    extra_window_start = effective_date - timedelta(days=3)
    extra_window_end   = effective_date + timedelta(days=3)

    if email.received_at is not None:
        recv_lo = email.received_at - timedelta(days=3)
        recv_hi = email.received_at + timedelta(days=3)
        extra_date_filter = or_(
            and_(
                Transaction.txn_date.isnot(None),
                Transaction.txn_date >= extra_window_start,
                Transaction.txn_date <= extra_window_end,
            ),
            and_(
                Transaction.txn_date.is_(None),
                Email.received_at.isnot(None),
                Email.received_at >= recv_lo,
                Email.received_at <= recv_hi,
            ),
        )
    else:
        extra_date_filter = and_(
            Transaction.txn_date >= extra_window_start,
            Transaction.txn_date <= extra_window_end,
        )

    extra_candidates = (await db.execute(
        select(Transaction, Email)
        .outerjoin(Email, Transaction.email_id == Email.id)
        .where(
            Transaction.id != tx.id,
            Transaction.label == "expense",
            func.abs(Transaction.amount - amount) <= bulk_tol,
            extra_date_filter,
            Email.user_id == user_id,
            Email.sender_domain.isnot(None),
        )
    )).all()

    for cand_tx, cand_email in extra_candidates:
        if cand_tx.id in paired_ids:
            continue
        score, rule_source = await _score_pair(tx, email, cand_tx, cand_email, db)
        if score < 0.5:
            continue
        if rule_source not in ("merchant_alias", "amount_date"):
            # Higher-confidence layers already handled above.
            continue
        paired_ids.add(cand_tx.id)
        db.add(DuplicatePair(
            id=str(uuid.uuid4()),
            primary_tx_id=tx.id,
            duplicate_tx_id=cand_tx.id,
            status="pending",
            confidence=score,
            rule_source=rule_source,
        ))
        logger.info("Queued %s duplicate for review: %s vs %s (conf=%.2f)",
                    rule_source, tx.id, cand_tx.id, score)


async def _detect_investment_flow(
    tx: Transaction,
    email: Email,
    tx_domain: str,
    amount: float,
    tol: float,
    user_id: str,
    paired_ids: Set[str],
    db: AsyncSession,
) -> None:
    """
    Detect mutual fund / investment pairs:
      - Email A: "order placed / purchase initiated" → expense
      - Email B: "transaction confirmation / units allotted" from different domain → expense
      - Same or near-same amount, within 3 days
    """
    subject = email.subject or ""
    is_order   = _subject_has_any(subject, _INVEST_ORDER_SIGNALS)
    is_confirm = _subject_has_any(subject, _INVEST_CONFIRM_SIGNALS)

    if not is_order and not is_confirm:
        return

    recv_ref = email.received_at
    if recv_ref is None:
        return

    window_start = recv_ref - timedelta(days=3)
    window_end   = recv_ref + timedelta(days=3)

    candidates = (await db.execute(
        select(Transaction, Email)
        .join(Email, Transaction.email_id == Email.id)
        .where(
            Transaction.id != tx.id,
            Transaction.label == "expense",
            func.abs(Transaction.amount - amount) <= tol,
            Email.user_id == user_id,
            Email.sender_domain.isnot(None),
            Email.sender_domain != email.sender_domain,
            Email.received_at >= window_start,
            Email.received_at <= window_end,
        )
    )).all()

    for cand_tx, cand_email in candidates:
        cand_subject = cand_email.subject or ""
        cand_is_order   = _subject_has_any(cand_subject, _INVEST_ORDER_SIGNALS)
        cand_is_confirm = _subject_has_any(cand_subject, _INVEST_CONFIRM_SIGNALS)

        if not ((is_order and cand_is_confirm) or (is_confirm and cand_is_order)):
            continue
        if cand_tx.id in paired_ids:
            continue
        paired_ids.add(cand_tx.id)

        primary_id, dup_id = (tx.id, cand_tx.id) if is_order else (cand_tx.id, tx.id)
        db.add(DuplicatePair(
            id=str(uuid.uuid4()),
            primary_tx_id=primary_id,
            duplicate_tx_id=dup_id,
            status="pending",
            confidence=0.65,
            rule_source="investment_flow",
        ))
        logger.info("Queued investment-flow duplicate for review: %s vs %s", primary_id, dup_id)


def _pick_primary(tx1: Transaction, email1: Optional[Email], tx2: Transaction, email2: Optional[Email]) -> str:
    """Return the ID of whichever transaction arrived first (received_at → txn_date → created_at)."""
    t1 = (email1.received_at if email1 and email1.received_at else None)
    t2 = (email2.received_at if email2 and email2.received_at else None)
    if t1 and t2:
        return tx1.id if t1 <= t2 else tx2.id
    d1 = tx1.txn_date
    d2 = tx2.txn_date
    if d1 and d2:
        return tx1.id if d1 <= d2 else tx2.id
    if tx1.created_at and tx2.created_at:
        return tx1.id if tx1.created_at <= tx2.created_at else tx2.id
    return tx1.id


async def batch_detect_duplicates(
    new_transactions: List[Tuple[Transaction, Email]],
    db: AsyncSession,
    user_id: str,
) -> Dict[str, Any]:
    """
    Batch dedup: replace N individual detect_and_record_duplicates calls with
    a single windowed query + multi-layer scoring.

    new_transactions: list of (Transaction, Email) tuples just written.
    Returns {"checked": N, "same_domain": N, "cross_domain": N, "investment_flow": N,
             "merchant_alias": N, "new_pair_ids": [str, ...]}.
    """
    if not new_transactions:
        return {"checked": 0, "same_domain_exact": 0, "same_domain": 0, "cross_domain": 0, "investment_flow": 0, "merchant_alias": 0, "amount_date": 0, "existing_pairs": 0, "already_paired": 0, "new_pair_ids": []}

    stats = {"checked": len(new_transactions), "same_domain_exact": 0, "same_domain": 0, "cross_domain": 0, "investment_flow": 0, "merchant_alias": 0, "amount_date": 0, "existing_pairs": 0, "already_paired": 0}
    new_pair_ids: List[str] = []

    # Load ALL DomainPairRule rows once (eliminates per-pair DB queries)
    all_rules = (await db.execute(select(DomainPairRule))).scalars().all()
    rules_map: Dict[Tuple[str, str], DomainPairRule] = {
        (r.domain_a, r.domain_b): r for r in all_rules
    }

    # Collect date range and amounts for the windowed query
    dates = []
    amounts = []
    for tx, email in new_transactions:
        if tx.txn_date:
            dates.append(tx.txn_date)
        elif email.received_at:
            dates.append(email.received_at.date())
        if tx.amount:
            amounts.append(float(tx.amount))

    # ── Windowed query for existing expenses (skip if no dates/amounts) ─────
    existing_map: Dict[str, Tuple[Transaction, Email]] = {}
    if dates and amounts:
        min_date = min(dates) - timedelta(days=3)
        max_date = max(dates) + timedelta(days=3)
        min_amount = min(amounts) * 0.95
        max_amount = max(amounts) * 1.05

        existing = (await db.execute(
            select(Transaction, Email)
            .outerjoin(Email, Transaction.email_id == Email.id)
            .where(
                Transaction.label == "expense",
                Transaction.amount >= min_amount,
                Transaction.amount <= max_amount,
                Email.user_id == user_id,
                or_(
                    and_(Transaction.txn_date >= min_date, Transaction.txn_date <= max_date),
                    and_(Email.received_at >= min_date, Email.received_at <= max_date),
                ),
            )
        )).all()

        existing_map = {row[0].id: (row[0], row[1]) for row in existing if row[1]}

    # Pre-load ALL existing DuplicatePair rows for this user
    all_user_pairs = (await db.execute(
        select(DuplicatePair.primary_tx_id, DuplicatePair.duplicate_tx_id)
        .join(Transaction, Transaction.id == DuplicatePair.primary_tx_id)
        .join(Email, Email.id == Transaction.email_id)
        .where(Email.user_id == user_id)
    )).all()
    db_existing_pairs: Set[Tuple[str, str]] = {
        tuple(sorted([row.primary_tx_id, row.duplicate_tx_id]))
        for row in all_user_pairs
    }

    # Build a lookup: tx_id -> set of tx_ids it's already paired with
    paired_ids_map: Dict[str, Set[str]] = {}
    for tid_a, tid_b in db_existing_pairs:
        paired_ids_map.setdefault(tid_a, set()).add(tid_b)
        paired_ids_map.setdefault(tid_b, set()).add(tid_a)

    seen_pairs: Set[Tuple[str, str]] = set()

    for new_tx, new_email in new_transactions:
        if not _is_dedup_candidate(new_tx):
            logger.info("batch_detect_duplicates: skip tx=%s (not a dedup candidate, label=%s)", new_tx.id, new_tx.label)
            continue
        if not new_email or not new_email.sender_domain:
            logger.info("batch_detect_duplicates: skip tx=%s (no email or sender_domain)", new_tx.id)
            continue

        new_effective = new_tx.txn_date or (new_email.received_at.date() if new_email.received_at else None)
        if new_effective is None:
            logger.info("batch_detect_duplicates: skip tx=%s (no effective date)", new_tx.id)
            continue

        # Use pre-built paired_ids map (eliminates per-tx DB query)
        already_paired_ids = paired_ids_map.get(new_tx.id, set())

        # Compare against existing transactions in DB
        for existing_tx, existing_email in existing_map.values():
            if existing_tx.id == new_tx.id:
                continue

            # Sort pair key to avoid duplicates
            pair_key = tuple(sorted([new_tx.id, existing_tx.id]))
            if pair_key in seen_pairs:
                continue

            # Check if already paired
            if existing_tx.id in already_paired_ids:
                stats["already_paired"] += 1
                continue

            score, rule_source = _score_pair_with_rules(new_tx, new_email, existing_tx, existing_email, rules_map)
            if score < 0.5:
                continue

            # Skip if this pair already exists in DB (handles re-runs gracefully)
            if pair_key in db_existing_pairs:
                stats["existing_pairs"] += 1
                continue

            seen_pairs.add(pair_key)
            stats[rule_source] = stats.get(rule_source, 0) + 1

            # Bulk detect always creates pending pairs (user initiated this)
            pair_id = str(uuid.uuid4())
            db.add(DuplicatePair(
                id=pair_id,
                primary_tx_id=new_tx.id,
                duplicate_tx_id=existing_tx.id,
                status="pending",
                confidence=score,
                rule_source=rule_source,
            ))
            new_pair_ids.append(pair_id)
            logger.info("Batch queued for review: %s vs %s (%s, conf=%.2f)", new_tx.id, existing_tx.id, rule_source, score)

        # Compare against OTHER new transactions in the same batch (intra-batch dedup)
        for other_tx, other_email in new_transactions:
            if other_tx.id == new_tx.id:
                continue

            # Sort pair key to avoid duplicates
            pair_key = tuple(sorted([new_tx.id, other_tx.id]))
            if pair_key in seen_pairs:
                continue

            # Check if already paired
            if other_tx.id in already_paired_ids:
                stats["already_paired"] += 1
                continue

            score, rule_source = _score_pair_with_rules(new_tx, new_email, other_tx, other_email, rules_map)
            if score < 0.5:
                continue

            # Skip if this pair already exists in DB (handles re-runs gracefully)
            if pair_key in db_existing_pairs:
                stats["existing_pairs"] += 1
                continue

            seen_pairs.add(pair_key)
            stats[rule_source] = stats.get(rule_source, 0) + 1

            # Bulk detect always creates pending pairs (user initiated this)
            pair_id = str(uuid.uuid4())
            db.add(DuplicatePair(
                id=pair_id,
                primary_tx_id=new_tx.id,
                duplicate_tx_id=other_tx.id,
                status="pending",
                confidence=score,
                rule_source=rule_source,
            ))
            new_pair_ids.append(pair_id)
            logger.info("Batch intra-batch queued for review: %s vs %s (%s, conf=%.2f)", new_tx.id, other_tx.id, rule_source, score)

    logger.debug("batch_detect_duplicates: complete stats=%s new_pair_ids=%s", stats, new_pair_ids)
    return {**stats, "new_pair_ids": new_pair_ids}


async def resolve_duplicate(
    pair: DuplicatePair,
    action: str,
    db: AsyncSession,
    *,
    primary_email: Optional[Email] = None,
    duplicate_email: Optional[Email] = None,
    discard_tx_id: Optional[str] = None,
) -> None:
    """
    Apply a user resolution and update the DomainPairRule learning loop.
    action: 'confirmed' | 'dismissed'
    primary_email / duplicate_email: pass from caller to avoid re-querying.
    discard_tx_id: the TX to delete (confirmed only).
    """
    pair.status = action
    pair.resolved_at = datetime.now(timezone.utc)

    if primary_email is None:
        primary_email = (await db.execute(
            select(Email).join(Transaction, Email.id == Transaction.email_id)
            .where(Transaction.id == pair.primary_tx_id)
        )).scalar_one_or_none()
    discard_lookup_id = discard_tx_id or pair.duplicate_tx_id
    if duplicate_email is None:
        duplicate_email = (await db.execute(
            select(Email).join(Transaction, Email.id == Transaction.email_id)
            .where(Transaction.id == discard_lookup_id)
        )).scalar_one_or_none()

    if primary_email and duplicate_email:
        d1 = (primary_email.sender_domain or "").lower()
        d2 = (duplicate_email.sender_domain or "").lower()
        if d1 and d2 and d1 != d2:
            domain_a, domain_b = _sorted_domains(d1, d2)
            rule = (await db.execute(
                select(DomainPairRule).where(
                    DomainPairRule.domain_a == domain_a,
                    DomainPairRule.domain_b == domain_b,
                )
            )).scalar_one_or_none()
            if rule is None:
                rule = DomainPairRule(
                    id=str(uuid.uuid4()),
                    domain_a=domain_a,
                    domain_b=domain_b,
                    confirmed_count=0,
                    dismissed_count=0,
                    confidence=0.0,
                    auto_resolve=False,
                )
                db.add(rule)
            if action == "confirmed":
                rule.confirmed_count += 1
            else:
                rule.dismissed_count += 1
            total = rule.confirmed_count + rule.dismissed_count
            rule.confidence = rule.confirmed_count / total if total > 0 else 0.0
            rule.auto_resolve = (
                rule.confidence > settings.AUTO_RESOLVE_THRESHOLD
                and rule.confirmed_count >= _AUTO_RESOLVE_MIN_CONFIRMED
            )

    if action == "confirmed" and discard_tx_id:
        referencing_pairs = (await db.execute(
            select(DuplicatePair).where(
                or_(
                    DuplicatePair.primary_tx_id == discard_tx_id,
                    DuplicatePair.duplicate_tx_id == discard_tx_id,
                )
            )
        )).scalars().all()
        for p in referencing_pairs:
            await db.delete(p)

        discard_tx = (await db.execute(
            select(Transaction).where(Transaction.id == discard_tx_id)
        )).scalar_one_or_none()
        if discard_tx:
            await db.delete(discard_tx)
