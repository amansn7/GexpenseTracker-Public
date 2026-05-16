import uuid
import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Optional, Set, Tuple, List, Dict, Any
from sqlalchemy import select, or_, and_, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import Transaction, Email, DuplicatePair, DomainPairRule

logger = logging.getLogger(__name__)

_AUTO_RESOLVE_THRESHOLD = 0.85
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


def _amount_tolerance(amount: float) -> float:
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
    All queries are scoped to email.user_id to prevent cross-user false positives.
    """
    if tx.label != "expense" or tx.amount is None:
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

            primary_id = _pick_primary(tx, cand_tx)
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
            primary_id = _pick_primary(tx, cand_tx)
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


def _pick_primary(tx1: Transaction, tx2: Transaction) -> str:
    if tx1.created_at and tx2.created_at:
        return tx1.id if tx1.created_at <= tx2.created_at else tx2.id
    return tx1.id


async def batch_detect_duplicates(
    new_transactions: List[Tuple[Transaction, Email]],
    db: AsyncSession,
    user_id: str,
) -> Dict[str, int]:
    """
    Batch dedup: replace N individual detect_and_record_duplicates calls with
    a single windowed query + multi-layer scoring.

    new_transactions: list of (Transaction, Email) tuples just written.
    Returns {"checked": N, "same_domain": N, "cross_domain": N, "investment_flow": N, "merchant_alias": N}.
    """
    if not new_transactions:
        return {"checked": 0, "same_domain": 0, "cross_domain": 0, "investment_flow": 0, "merchant_alias": 0}

    stats = {"checked": len(new_transactions), "same_domain": 0, "cross_domain": 0, "investment_flow": 0, "merchant_alias": 0}

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

    if not dates or not amounts:
        return stats

    min_date = min(dates) - timedelta(days=3)
    max_date = max(dates) + timedelta(days=3)
    min_amount = min(amounts) * 0.95
    max_amount = max(amounts) * 1.05

    # Single windowed query: all expense transactions in the date/amount range for this user
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

    # Build lookup: existing tx IDs → (tx, email)
    existing_map: Dict[str, Tuple[Transaction, Email]] = {
        row[0].id: (row[0], row[1]) for row in existing if row[1]
    }

    # Track which pairs we've already created to avoid duplicates
    seen_pairs: Set[Tuple[str, str]] = set()

    for new_tx, new_email in new_transactions:
        if new_tx.label != "expense" or new_tx.amount is None:
            continue
        if not new_email or not new_email.sender_domain:
            continue

        new_amount = float(new_tx.amount)
        new_tol = _amount_tolerance(new_amount)
        new_domain = new_email.sender_domain.lower()
        new_subject = (new_email.subject or "").lower()
        new_merchant = new_tx.merchant or ""
        new_effective = new_tx.txn_date or (new_email.received_at.date() if new_email.received_at else None)
        if new_effective is None:
            continue

        is_order = _subject_has_any(new_subject, _INVEST_ORDER_SIGNALS)
        is_confirm = _subject_has_any(new_subject, _INVEST_CONFIRM_SIGNALS)

        for existing_tx, existing_email in existing_map.values():
            if existing_tx.id == new_tx.id:
                continue
            if not existing_email or not existing_email.sender_domain:
                continue

            existing_domain = existing_email.sender_domain.lower()
            existing_amount = float(existing_tx.amount) if existing_tx.amount else 0
            existing_subject = (existing_email.subject or "").lower()
            existing_merchant = existing_tx.merchant or ""
            existing_effective = existing_tx.txn_date or (existing_email.received_at.date() if existing_email.received_at else None)
            if existing_effective is None:
                continue

            # Amount proximity check
            if abs(new_amount - existing_amount) > new_tol:
                continue

            # Time proximity check
            day_diff = abs((new_effective - existing_effective).days)
            if day_diff > 3:
                continue

            # Sort pair key to avoid duplicates
            pair_key = tuple(sorted([new_tx.id, existing_tx.id]))
            if pair_key in seen_pairs:
                continue

            # Check if already paired
            existing_paired = await _load_paired_ids(new_tx.id, db)
            if existing_tx.id in existing_paired:
                continue

            # Multi-layer scoring
            score = 0.0
            rule_source = "unknown"

            # Layer 1: Same domain (highest confidence)
            if new_domain == existing_domain:
                same_domain_window = 3 if (new_email.received_at and existing_email.received_at) else 3
                if day_diff <= same_domain_window:
                    score = 1.0
                    rule_source = "same_domain_exact"

            # Layer 2: Merchant alias match across domains
            if score == 0.0:
                m_score = _merchant_match(new_merchant, existing_merchant, new_domain, existing_domain)
                if m_score >= 0.7:
                    score = 0.75 + m_score * 0.2  # 0.75 to 0.95
                    rule_source = "merchant_alias"

            # Layer 3: Cross-domain with domain pair rule
            if score == 0.0:
                domain_a, domain_b = _sorted_domains(new_domain, existing_domain)
                rule = (await db.execute(
                    select(DomainPairRule).where(
                        DomainPairRule.domain_a == domain_a,
                        DomainPairRule.domain_b == domain_b,
                    )
                )).scalar_one_or_none()
                if rule:
                    score = rule.confidence
                    rule_source = "domain_pair"

            # Layer 4: Investment flow
            if score == 0.0:
                existing_is_order = _subject_has_any(existing_subject, _INVEST_ORDER_SIGNALS)
                existing_is_confirm = _subject_has_any(existing_subject, _INVEST_CONFIRM_SIGNALS)
                if (is_order and existing_is_confirm) or (is_confirm and existing_is_order):
                    if new_domain != existing_domain and day_diff <= 3:
                        score = 0.65
                        rule_source = "investment_flow"

            # Layer 5: Amount + date only (lowest confidence)
            if score == 0.0:
                if abs(new_amount - existing_amount) <= new_tol and day_diff <= 1:
                    score = 0.5
                    rule_source = "amount_date"

            if score < 0.5:
                continue

            seen_pairs.add(pair_key)
            stats[rule_source] = stats.get(rule_source, 0) + 1

            # Resolve or queue
            if score >= _AUTO_RESOLVE_THRESHOLD:
                primary_id = _pick_primary(new_tx, existing_tx)
                dup_id = new_tx.id if primary_id == existing_tx.id else existing_tx.id
                dup_tx = new_tx if dup_id == new_tx.id else existing_tx
                dup_tx.label = "ignore"
                db.add(DuplicatePair(
                    id=str(uuid.uuid4()),
                    primary_tx_id=primary_id,
                    duplicate_tx_id=dup_id,
                    status="auto_resolved",
                    confidence=score,
                    rule_source=rule_source,
                ))
                logger.info("Batch auto-resolved: %s vs %s (%s, conf=%.2f)", primary_id, dup_id, rule_source, score)
            else:
                db.add(DuplicatePair(
                    id=str(uuid.uuid4()),
                    primary_tx_id=new_tx.id,
                    duplicate_tx_id=existing_tx.id,
                    status="pending",
                    confidence=score,
                    rule_source=rule_source,
                ))
                logger.info("Batch queued for review: %s vs %s (%s, conf=%.2f)", new_tx.id, existing_tx.id, rule_source, score)

    return stats


async def resolve_duplicate(
    pair: DuplicatePair,
    action: str,
    db: AsyncSession,
    discard_tx_id: Optional[str] = None,
) -> None:
    """
    Apply a user resolution and update the DomainPairRule learning loop.
    action: 'confirmed' | 'dismissed'
    discard_tx_id: the TX to delete (confirmed only).
    """
    pair.status = action
    pair.resolved_at = datetime.now(timezone.utc)

    primary_email = (await db.execute(
        select(Email).join(Transaction, Email.id == Transaction.email_id)
        .where(Transaction.id == pair.primary_tx_id)
    )).scalar_one_or_none()
    discard_lookup_id = discard_tx_id or pair.duplicate_tx_id
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
                rule.confidence > _AUTO_RESOLVE_THRESHOLD
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
