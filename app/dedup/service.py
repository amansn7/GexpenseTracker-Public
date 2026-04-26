import uuid
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Optional, Tuple
from sqlalchemy import select, or_, and_, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import Transaction, Email, DuplicatePair, DomainPairRule

logger = logging.getLogger(__name__)

_AUTO_RESOLVE_THRESHOLD = 0.85
_AUTO_RESOLVE_MIN_CONFIRMED = 3

# Subject keywords that signal an investment order being placed
_INVEST_ORDER_SIGNALS = frozenset([
    "order placed", "order sent", "purchase initiated", "sip initiated",
    "sip registered", "folio", "nav", "invest", "purchase order",
    "transaction initiated", "processing of purchase",
])

# Subject keywords that signal an investment being confirmed/settled
_INVEST_CONFIRM_SIGNALS = frozenset([
    "units allotted", "transaction successful", "purchase successful",
    "investment successful", "transaction confirmation", "purchase confirmation",
    "allotment", "credited to your folio", "transaction complete",
    "purchase transaction confirmation",
])


def _sorted_domains(d1: str, d2: str) -> Tuple[str, str]:
    """Return (domain_a, domain_b) alphabetically sorted."""
    return (d1, d2) if d1 <= d2 else (d2, d1)


def _amount_tolerance(amount: float) -> float:
    """Fuzzy tolerance: 0.5% of amount or ₹5, whichever is larger."""
    return max(abs(amount) * 0.005, 5.0)


def _subject_has_any(subject: Optional[str], signals: frozenset) -> bool:
    text = (subject or "").lower()
    return any(sig in text for sig in signals)


def _pair_exists_query(tx_id: str, cand_id: str):
    return select(DuplicatePair).where(
        or_(
            and_(DuplicatePair.primary_tx_id == tx_id,
                 DuplicatePair.duplicate_tx_id == cand_id),
            and_(DuplicatePair.primary_tx_id == cand_id,
                 DuplicatePair.duplicate_tx_id == tx_id),
        )
    )


async def detect_and_record_duplicates(
    tx: Transaction,
    email: Optional[Email],
    db: AsyncSession,
) -> None:
    """
    Run immediately after a Transaction row is written.
    Detects duplicate expense transactions via three strategies:
      1. Same-domain: same sender, same amount (±0.5%), within ±3 days received_at
      2. Cross-domain: different sender, same amount (±0.5%), within ±1 day of txn/received date
      3. Investment flow: "order sent" + "confirmation" pair across domains for same amount
    """
    if tx.label != "expense" or tx.amount is None:
        return
    if not email or not email.sender_domain:
        return

    tx_domain = email.sender_domain.lower()
    amount = float(tx.amount)
    tol = _amount_tolerance(amount)

    # ── 1. Same-domain duplicate check (±3 day received_at window) ────────────
    # txn_date excluded — terse bank alerts often have null extracted date.
    if email.received_at is not None:
        recv_start = email.received_at - timedelta(days=3)
        recv_end   = email.received_at + timedelta(days=3)
        same_domain_dupes = (await db.execute(
            select(Transaction, Email)
            .join(Email, Transaction.email_id == Email.id)
            .where(
                Transaction.id != tx.id,
                Transaction.label == "expense",
                func.abs(Transaction.amount - amount) <= tol,
                Email.sender_domain == email.sender_domain,
                Email.received_at >= recv_start,
                Email.received_at <= recv_end,
            )
        )).all()

        for cand_tx, cand_email in same_domain_dupes:
            if (await db.execute(_pair_exists_query(tx.id, cand_tx.id))).scalar_one_or_none():
                continue

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
    # Use txn_date when available, fall back to received_at date.
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
            Email.sender_domain.isnot(None),
        )
    )).all()

    for cand_tx, cand_email in candidates:
        if not cand_email or not cand_email.sender_domain:
            continue
        cand_domain = cand_email.sender_domain.lower()
        if cand_domain == tx_domain:
            continue

        if (await db.execute(_pair_exists_query(tx.id, cand_tx.id))).scalar_one_or_none():
            continue

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
    await _detect_investment_flow(tx, email, tx_domain, amount, tol, db)


async def _detect_investment_flow(
    tx: Transaction,
    email: Email,
    tx_domain: str,
    amount: float,
    tol: float,
    db: AsyncSession,
) -> None:
    """
    Detect the mutual fund / investment pattern where:
      - Email A: "order placed / purchase initiated" → expense
      - Email B: "transaction confirmation / units allotted" from different domain → expense
      - Same or near-same amount, within 3 days
    Creates a pending DuplicatePair with rule_source="investment_flow".
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

        # Require one side to be order and the other to be confirmation
        if not ((is_order and cand_is_confirm) or (is_confirm and cand_is_order)):
            continue

        if (await db.execute(_pair_exists_query(tx.id, cand_tx.id))).scalar_one_or_none():
            continue

        # Order email is primary (it came first, represents the user's intent)
        if is_order:
            primary_id, dup_id = tx.id, cand_tx.id
        else:
            primary_id, dup_id = cand_tx.id, tx.id

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
    """Pick the primary (canonical) transaction — prefer the earlier created_at."""
    if tx1.created_at and tx2.created_at:
        return tx1.id if tx1.created_at <= tx2.created_at else tx2.id
    return tx1.id


async def resolve_duplicate(
    pair: DuplicatePair,
    action: str,
    db: AsyncSession,
    discard_tx_id: Optional[str] = None,
) -> None:
    """
    Apply a user resolution and update the DomainPairRule learning loop.
    action: 'confirmed' | 'dismissed'
    discard_tx_id: the TX to delete (confirmed only). Caller computes this
    BEFORE overwriting pair.primary_tx_id so the right side is discarded.
    """
    pair.status = action
    pair.resolved_at = datetime.now(timezone.utc)

    # Identify domains for learning. Use discard_tx_id as the "duplicate" side
    # when provided so the lookup is correct even after primary_tx_id was overwritten.
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
        # Hard-delete the discarded transaction; keep the Email row for history.
        # Must delete all DuplicatePair rows referencing it first (FK constraint).
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
