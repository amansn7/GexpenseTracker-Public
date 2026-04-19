from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models import DuplicatePair, Transaction, Email
from app.dedup.service import resolve_duplicate

router = APIRouter()


def _fmt_tx(t: Transaction, e: Optional[Email]) -> dict:
    return {
        "id": t.id,
        "label": t.label,
        "amount": float(t.amount) if t.amount is not None else None,
        "merchant": t.merchant,
        "category": t.category,
        "txn_date": t.txn_date.isoformat() if t.txn_date else None,
        "confidence": t.confidence,
        "status": t.status,
        "email": {
            "subject": e.subject if e else None,
            "sender": e.sender if e else None,
            "sender_domain": e.sender_domain if e else None,
            "received_at": e.received_at.isoformat() if e and e.received_at else None,
        },
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


async def _load_pair_with_txs(pair_id: str, db: AsyncSession):
    pair = (await db.execute(
        select(DuplicatePair).where(DuplicatePair.id == pair_id)
    )).scalar_one_or_none()
    if not pair:
        raise HTTPException(status_code=404, detail="Duplicate pair not found")
    primary_row = (await db.execute(
        select(Transaction, Email).outerjoin(Email).where(Transaction.id == pair.primary_tx_id)
    )).one_or_none()
    dup_row = (await db.execute(
        select(Transaction, Email).outerjoin(Email).where(Transaction.id == pair.duplicate_tx_id)
    )).one_or_none()
    if not primary_row or not dup_row:
        raise HTTPException(status_code=422, detail="Pair references missing transactions")
    return pair, primary_row[0], primary_row[1], dup_row[0], dup_row[1]


@router.get("/duplicates")
async def list_duplicates(status: Optional[str] = None, db: AsyncSession = Depends(get_db)):
    q = select(DuplicatePair).order_by(DuplicatePair.created_at.desc())
    if status:
        q = q.where(DuplicatePair.status == status)
    pairs = (await db.execute(q)).scalars().all()

    result = []
    for pair in pairs:
        primary_row = (await db.execute(
            select(Transaction, Email).outerjoin(Email).where(Transaction.id == pair.primary_tx_id)
        )).one_or_none()
        dup_row = (await db.execute(
            select(Transaction, Email).outerjoin(Email).where(Transaction.id == pair.duplicate_tx_id)
        )).one_or_none()
        if primary_row and dup_row:
            result.append(_fmt_pair(pair, primary_row[0], primary_row[1], dup_row[0], dup_row[1]))
    return result


class ResolvePatch(BaseModel):
    action: str  # "confirmed" | "dismissed"
    primary_tx_id: str


@router.patch("/duplicates/{pair_id}")
async def resolve_pair(pair_id: str, body: ResolvePatch, db: AsyncSession = Depends(get_db)):
    if body.action not in ("confirmed", "dismissed"):
        raise HTTPException(status_code=422, detail="action must be 'confirmed' or 'dismissed'")
    pair, primary_tx, primary_email, dup_tx, dup_email = await _load_pair_with_txs(pair_id, db)
    if pair.status not in ("pending",):
        raise HTTPException(status_code=409, detail=f"Pair already resolved: {pair.status}")
    pair.primary_tx_id = body.primary_tx_id
    await resolve_duplicate(pair, body.action, body.primary_tx_id, db)
    await db.commit()
    await db.refresh(pair)
    return {"id": pair.id, "status": pair.status}
