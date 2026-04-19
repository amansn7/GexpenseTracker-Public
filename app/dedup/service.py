import uuid
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Optional, Tuple
from sqlalchemy import select, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import Transaction, Email, DuplicatePair, DomainPairRule

logger = logging.getLogger(__name__)

_AUTO_RESOLVE_THRESHOLD = 0.85
_AUTO_RESOLVE_MIN_CONFIRMED = 3


def _sorted_domains(d1: str, d2: str) -> Tuple[str, str]:
    """Return (domain_a, domain_b) alphabetically sorted."""
    return (d1, d2) if d1 <= d2 else (d2, d1)


async def detect_and_record_duplicates(
    tx: Transaction,
    email: Optional[Email],
    db: AsyncSession,
) -> None:
    """
    Run immediately after a Transaction row is written.
    Checks for duplicate expense transactions within ±1 day with same amount.
    Creates DuplicatePair rows and updates DomainPairRules accordingly.
    No-op if tx is not an expense or has no amount/date.
    """
    if tx.label != "expense" or tx.amount is None or tx.txn_date is None:
        return
    if not email or not email.sender_domain:
        return

    tx_domain = email.sender_domain.lower()
    window_start = tx.txn_date - timedelta(days=1)
    window_end = tx.txn_date + timedelta(days=1)

    candidates = (await db.execute(
        select(Transaction, Email)
        .outerjoin(Email, Transaction.email_id == Email.id)
        .where(
            Transaction.id != tx.id,
            Transaction.label == "expense",
            Transaction.amount == tx.amount,
            Transaction.txn_date >= window_start,
            Transaction.txn_date <= window_end,
            Email.sender_domain.isnot(None),
        )
    )).all()

    for cand_tx, cand_email in candidates:
        if not cand_email or not cand_email.sender_domain:
            continue
        cand_domain = cand_email.sender_domain.lower()
        if cand_domain == tx_domain:
            continue  # same domain = not a duplicate pair

        # Avoid creating reverse duplicate of an existing pair
        existing_pair = (await db.execute(
            select(DuplicatePair).where(
                or_(
                    and_(DuplicatePair.primary_tx_id == tx.id,
                         DuplicatePair.duplicate_tx_id == cand_tx.id),
                    and_(DuplicatePair.primary_tx_id == cand_tx.id,
                         DuplicatePair.duplicate_tx_id == tx.id),
                )
            )
        )).scalar_one_or_none()
        if existing_pair:
            continue

        domain_a, domain_b = _sorted_domains(tx_domain, cand_domain)
        rule = (await db.execute(
            select(DomainPairRule).where(
                DomainPairRule.domain_a == domain_a,
                DomainPairRule.domain_b == domain_b,
            )
        )).scalar_one_or_none()

        if rule and rule.auto_resolve:
            # Silently mark the newer transaction as duplicate
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
            # Mark the duplicate transaction as ignore
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


def _pick_primary(tx1: Transaction, tx2: Transaction) -> str:
    """Pick the primary (canonical) transaction — prefer the earlier created_at."""
    if tx1.created_at and tx2.created_at:
        return tx1.id if tx1.created_at <= tx2.created_at else tx2.id
    return tx1.id


async def resolve_duplicate(
    pair: DuplicatePair,
    action: str,
    db: AsyncSession,
) -> None:
    """
    Apply a user resolution and update the DomainPairRule learning loop.
    action: 'confirmed' | 'dismissed'
    Caller must set pair.primary_tx_id before calling if user changed the primary.
    """
    pair.status = action
    pair.resolved_at = datetime.now(timezone.utc)

    # Identify domains for the pair
    primary_email = (await db.execute(
        select(Email).join(Transaction, Email.id == Transaction.email_id)
        .where(Transaction.id == pair.primary_tx_id)
    )).scalar_one_or_none()
    duplicate_email = (await db.execute(
        select(Email).join(Transaction, Email.id == Transaction.email_id)
        .where(Transaction.id == pair.duplicate_tx_id)
    )).scalar_one_or_none()

    if not primary_email or not duplicate_email:
        return

    d1 = (primary_email.sender_domain or "").lower()
    d2 = (duplicate_email.sender_domain or "").lower()
    if not d1 or not d2 or d1 == d2:
        return

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
        )
        db.add(rule)

    if action == "confirmed":
        rule.confirmed_count += 1
        # Update primary: mark duplicate tx as ignore
        dup_tx = (await db.execute(
            select(Transaction).where(Transaction.id == pair.duplicate_tx_id)
        )).scalar_one_or_none()
        if dup_tx:
            dup_tx.label = "ignore"
    else:
        rule.dismissed_count += 1

    total = rule.confirmed_count + rule.dismissed_count
    rule.confidence = rule.confirmed_count / total if total > 0 else 0.0
    if rule.confidence > _AUTO_RESOLVE_THRESHOLD and rule.confirmed_count >= _AUTO_RESOLVE_MIN_CONFIRMED:
        rule.auto_resolve = True
    else:
        rule.auto_resolve = False
