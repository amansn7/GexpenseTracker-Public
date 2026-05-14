from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import Optional
from datetime import date
from collections import defaultdict
import re, json
from app.auth_deps import get_current_user
from app.database import get_db
from app.models import RecurringExpense, User, Transaction, Email

router = APIRouter()


class RecurringBody(BaseModel):
    name: str
    amount: Optional[float] = None
    category: Optional[str] = None
    frequency: str = "monthly"   # monthly | weekly | yearly
    day_of_month: Optional[int] = None
    notes: Optional[str] = None
    active: bool = True


def _fmt(r: RecurringExpense) -> dict:
    return {
        "id": r.id,
        "name": r.name,
        "amount": float(r.amount) if r.amount is not None else None,
        "category": r.category,
        "frequency": r.frequency,
        "day_of_month": r.day_of_month,
        "notes": r.notes,
        "active": r.active,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


@router.get("/recurring")
async def list_recurring(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    rows = (await db.execute(
        select(RecurringExpense).where(RecurringExpense.user_id == current_user.id).order_by(RecurringExpense.name)
    )).scalars().all()
    items = [_fmt(r) for r in rows]

    # Monthly total = sum of all active monthly items + weekly*4.33 + yearly/12
    monthly_total = 0.0
    for r in rows:
        if not r.active or r.amount is None:
            continue
        if r.frequency == "monthly":
            monthly_total += float(r.amount)
        elif r.frequency == "weekly":
            monthly_total += float(r.amount) * 4.33
        elif r.frequency == "yearly":
            monthly_total += float(r.amount) / 12

    return {"items": items, "monthly_total": round(monthly_total, 2)}


@router.post("/recurring", status_code=201)
async def create_recurring(body: RecurringBody, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not body.name.strip():
        raise HTTPException(status_code=422, detail="name is required")
    if body.frequency not in ("monthly", "weekly", "yearly"):
        raise HTTPException(status_code=422, detail="frequency must be monthly, weekly, or yearly")
    r = RecurringExpense(
        user_id=current_user.id,
        name=body.name.strip(),
        amount=body.amount,
        category=body.category,
        frequency=body.frequency,
        day_of_month=body.day_of_month,
        notes=body.notes,
        active=body.active,
    )
    db.add(r)
    await db.commit()
    await db.refresh(r)
    return _fmt(r)


@router.patch("/recurring/{id}")
async def update_recurring(id: str, body: RecurringBody, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    r = (await db.execute(
        select(RecurringExpense).where(RecurringExpense.id == id, RecurringExpense.user_id == current_user.id)
    )).scalar_one_or_none()
    if not r:
        raise HTTPException(status_code=404, detail="Not found")
    r.name = body.name.strip()
    r.amount = body.amount
    r.category = body.category
    r.frequency = body.frequency
    r.day_of_month = body.day_of_month
    r.notes = body.notes
    r.active = body.active
    await db.commit()
    await db.refresh(r)
    return _fmt(r)


@router.delete("/recurring/{id}")
async def delete_recurring(id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    r = (await db.execute(
        select(RecurringExpense).where(RecurringExpense.id == id, RecurringExpense.user_id == current_user.id)
    )).scalar_one_or_none()
    if not r:
        raise HTTPException(status_code=404, detail="Not found")
    await db.delete(r)
    await db.commit()
    return {"deleted": id}


_FIND_RECURRING_SYSTEM = (
    "You are a financial analyst. Identify recurring subscriptions, memberships, and regular bills "
    "from a list of merchants and their transaction history. "
    "Respond ONLY with valid JSON. No explanation, no markdown, no code blocks."
)

_FIND_RECURRING_PROMPT = """Analyze these merchants and their transaction patterns. Identify which ones look like recurring expenses (subscriptions, memberships, regular bills).

For each merchant, check:
- Same or similar amount across transactions (small variations OK)
- Regular intervals between dates (monthly ~28-31 days, yearly ~360-370 days, weekly ~6-8 days)
- At least 3 transactions for high confidence; 2 transactions can still be recurring if amounts match

{data}

Return a JSON array of identified recurring expenses, each:
{{
  "name": "readable merchant name",
  "merchant": "merchant field from data",
  "amount": typical recurring amount (number),
  "frequency": "monthly" or "yearly" or "weekly",
  "category": "best category match",
  "confidence": 0.0-1.0,
  "reasoning": "one-line explanation"
}}

Return [] if none look recurring."""


@router.post("/recurring/find-from-transactions")
async def find_recurring_from_transactions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Fetch all expense transactions
    rows = (await db.execute(
        select(Transaction, Email)
        .join(Email, Transaction.email_id == Email.id)
        .where(
            Email.user_id == current_user.id,
            Transaction.label == "expense",
            Transaction.merchant.isnot(None),
        )
        .order_by(Transaction.txn_date)
    )).all()

    if not rows:
        return {"suggestions": []}

    # Group by merchant
    by_merchant: dict[str, list[dict]] = defaultdict(list)
    for t, e in rows:
        m = (t.merchant or "").strip().lower()
        if m:
            by_merchant[m].append({
                "merchant": t.merchant,
                "amount": float(t.amount) if t.amount else 0,
                "txn_date": str(t.txn_date) if t.txn_date else "",
                "category": t.category,
            })

    # Skip merchants already tracked as recurring
    existing = (await db.execute(
        select(RecurringExpense).where(RecurringExpense.user_id == current_user.id)
    )).scalars().all()
    existing_names = {r.name.lower().strip() for r in existing}

    # Build summary for LLM
    lines = []
    for merchant_key, txns in sorted(by_merchant.items()):
        name = txns[0]["merchant"]
        display = txns[0]["merchant"] or merchant_key
        if display.lower().strip() in existing_names:
            continue
        if len(txns) < 2:
            continue

        amounts = [t["amount"] for t in txns if t["amount"]]
        dates = [t["txn_date"] for t in txns if t["txn_date"]]

        if not amounts:
            continue

        avg_amt = sum(amounts) / len(amounts)
        min_amt = min(amounts)
        max_amt = max(amounts)
        amt_variance = max_amt - min_amt
        amt_stable = amt_variance == 0 or (avg_amt > 0 and amt_variance / avg_amt < 0.15)

        # Compute intervals between consecutive dates
        intervals = []
        for i in range(1, len(dates)):
            try:
                d1 = date.fromisoformat(dates[i - 1])
                d2 = date.fromisoformat(dates[i])
                intervals.append((d2 - d1).days)
            except (ValueError, TypeError):
                pass

        line = f"Merchant: {display}"
        line += f"\n  Count: {len(txns)} transactions"
        line += f"\n  Amounts: {', '.join(f'₹{a:.0f}' for a in amounts[:10])}" + (f" ... and {len(amounts)-10} more" if len(amounts) > 10 else "")
        line += f"\n  Amount range: ₹{min_amt:.0f} - ₹{max_amt:.0f}" + (" (stable)" if amt_stable else " (varies)")
        if intervals:
            avg_interval = sum(intervals) / len(intervals)
            line += f"\n  Avg interval: {avg_interval:.0f} days"
            line += f"\n  Dates: {', '.join(dates[:8])}" + (f" ... and {len(dates)-8} more" if len(dates) > 8 else "")
        else:
            line += f"\n  Dates: {', '.join(dates[:8])}"
        lines.append(line)

    if not lines:
        return {"suggestions": []}

    data_block = "\n".join(lines)
    prompt = _FIND_RECURRING_PROMPT.format(data=data_block)

    # Build user-specific LLM client
    from app.models.user import UserAIService, UserSettings
    from app.api._account_helpers import _decrypt_secret
    from app.classifier.llm_client import build_user_client

    user_settings = (await db.execute(
        select(UserSettings).where(UserSettings.user_id == current_user.id)
    )).scalar_one_or_none()
    client = None
    if user_settings and user_settings.active_ai_service_id:
        ai_svc = (await db.execute(
            select(UserAIService).where(UserAIService.id == user_settings.active_ai_service_id)
        )).scalar_one_or_none()
        if ai_svc and ai_svc.enabled and ai_svc.encrypted_api_key:
            client = build_user_client(
                user_id=current_user.id,
                provider=ai_svc.provider,
                base_url=ai_svc.base_url,
                api_key=_decrypt_secret(ai_svc.encrypted_api_key),
                model_id=ai_svc.model_id,
            )

    if not client:
        from app.classifier.llm_client import llm_client
        client = llm_client

    try:
        raw = await client.chat(_FIND_RECURRING_SYSTEM, prompt, max_tokens=2000, timeout=60.0)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LLM analysis failed: {str(e)[:200]}")

    # Parse JSON from response
    json_match = re.search(r'\{.*\}|\[.*\]', raw, re.DOTALL)
    if not json_match:
        return {"suggestions": []}
    parsed = json_match.group(0)
    try:
        suggestions = json.loads(parsed)
        if isinstance(suggestions, dict):
            suggestions = [suggestions]
    except (json.JSONDecodeError, TypeError):
        suggestions = []

    # Deduplicate against existing recurring items
    filtered = []
    for s in suggestions:
        if not isinstance(s, dict):
            continue
        name = (s.get("name") or s.get("merchant") or "").strip().lower()
        if name and name not in existing_names:
            filtered.append({
                "name": s.get("name") or s.get("merchant") or "Unknown",
                "merchant": s.get("merchant") or "",
                "amount": s.get("amount"),
                "frequency": s.get("frequency", "monthly"),
                "category": s.get("category", ""),
                "confidence": s.get("confidence", 0.5),
                "reasoning": s.get("reasoning", ""),
            })

    return {"suggestions": filtered}
