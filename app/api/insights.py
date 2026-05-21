"""Insights & AI-pattern endpoints — rule-based v1, LLM only for /explain."""
import uuid
from datetime import UTC, date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth_deps import get_current_user
from app.database import get_db
from app.models import Email, Transaction, User

router = APIRouter()

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _utcnow_iso() -> str:
    return datetime.now(UTC).isoformat()


def _fmt(amount: float, currency: str = "INR") -> str:
    symbol = "₹" if currency == "INR" else currency + " "
    return f"{symbol}{amount:,.0f}"


async def _fetch_expense_txns(
    user_id: str, start: date, end: date, db: AsyncSession
) -> list[Transaction]:
    """Fetch expense transactions for the user in [start, end] via Email join."""
    stmt = (
        select(Transaction)
        .join(Email, Transaction.email_id == Email.id)
        .where(
            Email.user_id == user_id,
            Transaction.label == "expense",
            Transaction.txn_date >= start,
            Transaction.txn_date <= end,
        )
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


# ---------------------------------------------------------------------------
# GET /insights
# ---------------------------------------------------------------------------

@router.get("/insights")
async def get_insights(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    today = date.today()
    current_start = today - timedelta(days=30)
    prev_start = today - timedelta(days=60)
    prev_end = today - timedelta(days=31)

    current_txns = await _fetch_expense_txns(current_user.id, current_start, today, db)
    prev_txns = await _fetch_expense_txns(current_user.id, prev_start, prev_end, db)

    current_spend = sum(float(t.amount or 0) for t in current_txns)
    prev_spend = sum(float(t.amount or 0) for t in prev_txns)

    insights = []

    if prev_spend > 0:
        pct = (current_spend - prev_spend) / prev_spend * 100
        currency = current_txns[0].currency if current_txns else "INR"
        if pct > 20:
            insights.append({
                "id": str(uuid.uuid4()),
                "type": "spending_spike",
                "title": f"Spending up {pct:.0f}% this month",
                "body": (
                    f"You spent {_fmt(current_spend, currency)} in the last 30 days "
                    f"vs {_fmt(prev_spend, currency)} the 30 days before that."
                ),
                "generated_at": _utcnow_iso(),
            })
        elif pct < -10:
            insights.append({
                "id": str(uuid.uuid4()),
                "type": "saving_win",
                "title": f"Great job — down {abs(pct):.0f}% this month",
                "body": (
                    f"You spent {_fmt(current_spend, currency)} in the last 30 days "
                    f"vs {_fmt(prev_spend, currency)} the 30 days before. Keep it up!"
                ),
                "generated_at": _utcnow_iso(),
            })

    return {"insights": insights[:3]}


# ---------------------------------------------------------------------------
# GET /insights/patterns
# ---------------------------------------------------------------------------

@router.get("/insights/patterns")
async def get_insights_patterns(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    today = date.today()
    start = today - timedelta(days=30)
    txns = await _fetch_expense_txns(current_user.id, start, today, db)

    patterns = []

    # Weekend spender
    weekend_amounts = [float(t.amount or 0) for t in txns if t.txn_date and t.txn_date.weekday() >= 5]
    weekday_amounts = [float(t.amount or 0) for t in txns if t.txn_date and t.txn_date.weekday() < 5]

    weekend_days = sum(1 for i in range(30) if (today - timedelta(days=i)).weekday() >= 5)
    weekday_days = 30 - weekend_days

    avg_weekend = sum(weekend_amounts) / weekend_days if weekend_days else 0
    avg_weekday = sum(weekday_amounts) / weekday_days if weekday_days else 0

    if avg_weekday > 0 and avg_weekend > avg_weekday * 1.5 and len(weekend_amounts) >= 3:
        ratio = avg_weekend / avg_weekday
        delta_pct = round((ratio - 1) * 100, 1)
        patterns.append({
            "id": "weekend_spender",
            "label": "Weekend Spender",
            "description": (
                f"You spend ~{ratio:.1f}× more on Sat/Sun than on weekdays. "
                f"Avg ₹{avg_weekend:,.0f}/day vs ₹{avg_weekday:,.0f}/day."
            ),
            "delta_pct": delta_pct,
            "supporting_data": {
                "avg_weekend_daily": round(avg_weekend, 2),
                "avg_weekday_daily": round(avg_weekday, 2),
            },
        })

    # Subscription total
    sub_txns = [t for t in txns if t.category and "subscription" in t.category.lower()]
    if sub_txns:
        sub_total = sum(float(t.amount or 0) for t in sub_txns)
        currency = sub_txns[0].currency if sub_txns else "INR"
        patterns.append({
            "id": "subscription_total",
            "label": f"{_fmt(sub_total, currency)}/mo on subscriptions",
            "description": (
                f"{len(sub_txns)} subscription charge(s) totalling "
                f"{_fmt(sub_total, currency)} in the last 30 days."
            ),
            "delta_pct": 0.0,
            "supporting_data": {"count": len(sub_txns), "total": round(sub_total, 2)},
        })

    return {"patterns": patterns}


# ---------------------------------------------------------------------------
# POST /insights/explain
# ---------------------------------------------------------------------------

class ExplainRequest(BaseModel):
    insight_id: str
    title: str
    body: str


@router.post("/insights/explain")
async def explain_insight(
    payload: ExplainRequest,
    current_user: User = Depends(get_current_user),
):
    from app.classifier.llm.client import llm_client

    system = (
        "You are a friendly personal finance assistant. "
        "Explain the insight in plain language in 2–3 sentences. "
        "Be encouraging and specific. Do not repeat the numbers verbatim."
    )
    user_prompt = (
        f"Insight: {payload.title}\nDetails: {payload.body}\n\n"
        "Explain why this matters and what the user could do."
    )

    try:
        client = await llm_client.get_user_client(current_user.id) or llm_client
        explanation = await client.chat(
            system_prompt=system,
            user_prompt=user_prompt,
            max_tokens=200,
            timeout=20.0,
        )
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"LLM unavailable: {exc}") from exc

    return {"explanation": explanation}
