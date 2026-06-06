import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.auth_deps import get_current_user
from app.database import get_db
from app.dedup.service import resolve_duplicate
from app.models import DuplicatePair, Email, Transaction, User
from app.services.transaction_formatter import format_transaction

log = logging.getLogger(__name__)

router = APIRouter()


def _fmt_tx(t: Transaction, e: Email | None) -> dict:
    """Duplicate-specific format with sender_domain field."""
    base = format_transaction(t, e)
    return {
        "id": base["id"],
        "label": base["label"],
        "amount": base["amount"],
        "merchant": base["merchant"],
        "category": base["category"],
        "txn_date": base["txn_date"],
        "confidence": base["confidence"],
        "status": base["status"],
        "email": base["email"],
    }


def _fmt_pair(pair: DuplicatePair, primary_tx, primary_email, dup_tx, dup_email) -> dict:
    return {
        "id": pair.id,
        "status": pair.status,
        "confidence": pair.confidence,
        "rule_source": pair.rule_source,
        "created_at": pair.created_at.isoformat(),
        "resolved_at": pair.resolved_at.isoformat() if pair.resolved_at else None,
        "primary": _fmt_tx(primary_tx, primary_email),
        "duplicate": _fmt_tx(dup_tx, dup_email),
    }


async def _load_pair_with_txs(pair_id: str, db: AsyncSession, user_id: str):
    """Load pair + both transactions + both emails in a single query (T3)."""
    PrimaryTx = aliased(Transaction)
    PrimaryEmail = aliased(Email)
    DupTx = aliased(Transaction)
    DupEmail = aliased(Email)

    row = (
        await db.execute(
            select(DuplicatePair, PrimaryTx, PrimaryEmail, DupTx, DupEmail)
            .join(PrimaryTx, PrimaryTx.id == DuplicatePair.primary_tx_id)
            .join(PrimaryEmail, PrimaryEmail.id == PrimaryTx.email_id)
            .join(DupTx, DupTx.id == DuplicatePair.duplicate_tx_id)
            .outerjoin(DupEmail, DupEmail.id == DupTx.email_id)
            .where(DuplicatePair.id == pair_id, PrimaryEmail.user_id == user_id)
        )
    ).one_or_none()

    if not row:
        raise HTTPException(status_code=404, detail="Duplicate pair not found")
    return row[0], row[1], row[2], row[3], row[4]


@router.post("/duplicates/scan")
async def scan_duplicates(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Run duplicate detection on all expense transactions for the current user."""
    from app.sync import scan_all_for_duplicates

    result = await scan_all_for_duplicates(str(current_user.id))
    return {"checked": result.get("checked", 0), "new_pairs": result.get("new_pairs", 0)}


@router.get("/duplicates")
async def list_duplicates(
    status: str | None = None, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """List duplicate pairs — single joined query, no N+1 (T2)."""
    PrimaryTx = aliased(Transaction)
    PrimaryEmail = aliased(Email)
    DupTx = aliased(Transaction)
    DupEmail = aliased(Email)

    q = (
        select(DuplicatePair, PrimaryTx, PrimaryEmail, DupTx, DupEmail)
        .join(PrimaryTx, PrimaryTx.id == DuplicatePair.primary_tx_id)
        .join(PrimaryEmail, PrimaryEmail.id == PrimaryTx.email_id)
        .join(DupTx, DupTx.id == DuplicatePair.duplicate_tx_id)
        .outerjoin(DupEmail, DupEmail.id == DupTx.email_id)
        .where(PrimaryEmail.user_id == current_user.id)
        .order_by(DuplicatePair.created_at.desc())
    )
    if status:
        q = q.where(DuplicatePair.status == status)

    rows = (await db.execute(q)).all()
    return [_fmt_pair(row[0], row[1], row[2], row[3], row[4]) for row in rows]


class ResolvePatch(BaseModel):
    action: str  # "confirmed" | "dismissed"
    primary_tx_id: str


@router.post("/duplicates/{pair_id}/reopen")
async def reopen_pair(pair_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Reopen a resolved duplicate pair back to pending status."""
    pair, primary_tx, primary_email, dup_tx, dup_email = await _load_pair_with_txs(pair_id, db, current_user.id)
    if pair.status == "pending":
        raise HTTPException(status_code=409, detail="Pair is already pending")
    pair.status = "pending"
    pair.resolved_at = None
    await db.commit()
    return {"id": pair_id, "status": "pending"}


@router.patch("/duplicates/{pair_id}")
async def resolve_pair(
    pair_id: str, body: ResolvePatch, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)
):
    if body.action not in ("confirmed", "dismissed"):
        raise HTTPException(status_code=422, detail="action must be 'confirmed' or 'dismissed'")
    pair, primary_tx, primary_email, dup_tx, dup_email = await _load_pair_with_txs(pair_id, db, current_user.id)
    if body.primary_tx_id not in (pair.primary_tx_id, pair.duplicate_tx_id):
        raise HTTPException(status_code=422, detail="primary_tx_id must be one of the pair's transaction IDs")
    if pair.status not in ("pending",):
        raise HTTPException(status_code=409, detail=f"Pair already resolved: {pair.status}")

    # Compute which TX to discard BEFORE overwriting primary_tx_id.
    keeping_primary = body.primary_tx_id == pair.primary_tx_id
    discard_tx_id = pair.duplicate_tx_id if keeping_primary else pair.primary_tx_id
    kept_email = primary_email if keeping_primary else dup_email
    discard_email = dup_email if keeping_primary else primary_email

    pair.primary_tx_id = body.primary_tx_id
    await resolve_duplicate(
        pair,
        body.action,
        db,
        user_id=current_user.id,
        primary_email=kept_email,
        duplicate_email=discard_email,
        discard_tx_id=discard_tx_id,
    )
    await db.commit()
    # Don't refresh pair — it may have been deleted as part of confirmed resolution.
    return {"id": pair_id, "status": body.action}
