"""Insights & AI-pattern endpoints — rule-based v1, LLM only for /explain."""

import ast
import json
import re
import uuid
from collections import defaultdict
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


async def _fetch_expense_txns(user_id: str, start: date, end: date, db: AsyncSession) -> list[Transaction]:
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
            insights.append(
                {
                    "id": str(uuid.uuid4()),
                    "type": "spending_spike",
                    "title": f"Spending up {pct:.0f}% this month",
                    "body": (
                        f"You spent {_fmt(current_spend, currency)} in the last 30 days "
                        f"vs {_fmt(prev_spend, currency)} the 30 days before that."
                    ),
                    "generated_at": _utcnow_iso(),
                }
            )
        elif pct < -10:
            insights.append(
                {
                    "id": str(uuid.uuid4()),
                    "type": "saving_win",
                    "title": f"Great job — down {abs(pct):.0f}% this month",
                    "body": (
                        f"You spent {_fmt(current_spend, currency)} in the last 30 days "
                        f"vs {_fmt(prev_spend, currency)} the 30 days before. Keep it up!"
                    ),
                    "generated_at": _utcnow_iso(),
                }
            )

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
        patterns.append(
            {
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
            }
        )

    # Subscription total
    sub_txns = [t for t in txns if t.category and "subscription" in t.category.lower()]
    if sub_txns:
        sub_total = sum(float(t.amount or 0) for t in sub_txns)
        currency = sub_txns[0].currency if sub_txns else "INR"
        patterns.append(
            {
                "id": "subscription_total",
                "label": f"{_fmt(sub_total, currency)}/mo on subscriptions",
                "description": (
                    f"{len(sub_txns)} subscription charge(s) totalling {_fmt(sub_total, currency)} in the last 30 days."
                ),
                "delta_pct": 0.0,
                "supporting_data": {"count": len(sub_txns), "total": round(sub_total, 2)},
            }
        )

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
        f"Insight: {payload.title}\nDetails: {payload.body}\n\nExplain why this matters and what the user could do."
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


# ---------------------------------------------------------------------------
# Helpers — monthly comparison
# ---------------------------------------------------------------------------


class CompareRequest(BaseModel):
    months: int = 3


def _month_from_key(key: str) -> date:
    return date(int(key[:4]), int(key[5:7]), 1)


def _month_end(key: str) -> date:
    y, m = int(key[:4]), int(key[5:7])
    if m == 12:
        return date(y + 1, 1, 1) - timedelta(days=1)
    return date(y, m + 1, 1) - timedelta(days=1)


async def _fetch_spending_txns(user_id: str, start: date, end: date, db: AsyncSession) -> list[Transaction]:
    stmt = (
        select(Transaction)
        .join(Email, Transaction.email_id == Email.id)
        .where(
            Email.user_id == user_id,
            Transaction.amount < 0,
            Transaction.txn_date >= start,
            Transaction.txn_date <= end,
        )
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


# ---------------------------------------------------------------------------
# POST /insights/compare
# ---------------------------------------------------------------------------


@router.post("/insights/compare")
async def compare_insights(
    payload: CompareRequest = CompareRequest(),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from app.services.stats_service import get_category_breakdown, get_monthly_summary

    monthly = await get_monthly_summary(current_user.id, payload.months, db)
    months_data = monthly.get("months", [])

    cats_current = {"categories": []}
    cats_previous = {"categories": []}

    if len(months_data) >= 2:
        cur = months_data[-1]
        prev = months_data[-2]
        cur_start = _month_from_key(cur["month"])
        cur_end = _month_end(cur["month"])
        cats_current = await get_category_breakdown(current_user.id, cur_start, cur_end, db)
        prev_start = _month_from_key(prev["month"])
        prev_end = _month_end(prev["month"])
        cats_previous = await get_category_breakdown(current_user.id, prev_start, prev_end, db)
    elif len(months_data) == 1:
        cur = months_data[-1]
        cur_start = _month_from_key(cur["month"])
        cur_end = _month_end(cur["month"])
        cats_current = await get_category_breakdown(current_user.id, cur_start, cur_end, db)

    today = date.today()
    week_start = today - timedelta(days=today.weekday())
    week_txns = await _fetch_spending_txns(current_user.id, week_start, today, db)
    week_total = sum(abs(float(t.amount or 0)) for t in week_txns)
    week_count = len(week_txns)

    day_totals: dict[str, float] = defaultdict(float)
    for t in week_txns:
        day_totals[t.txn_date.isoformat()] += abs(float(t.amount or 0))

    biggest_day_str = ""
    biggest_day_amt = 0
    if day_totals:
        bd = max(day_totals, key=day_totals.get)
        biggest_day_dt = date.fromisoformat(bd)
        week_day_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
        biggest_day_str = week_day_names[biggest_day_dt.weekday()]
        biggest_day_amt = round(day_totals[bd])

    weekly = {
        "total": round(week_total),
        "count": week_count,
        "biggest_day": biggest_day_str,
        "biggest_day_amount": biggest_day_amt,
    }

    # LLM path
    from app.services.llm_service import get_effective_llm_client

    llm = await get_effective_llm_client(current_user.id, db)
    if llm:
        try:
            result = await _llm_compare(llm, months_data, cats_current, cats_previous, weekly)
            if result:
                return result
        except Exception:
            pass

    # Rule-based fallback
    return await _rule_based_compare(months_data, cats_current, cats_previous, weekly)


async def _llm_compare(
    llm, months_data: list, cats_current: dict, cats_previous: dict, weekly: dict
) -> dict | None:
    data = {
        "monthly_data": months_data,
        "current_month_categories": cats_current.get("categories", []),
        "previous_month_categories": cats_previous.get("categories", []),
        "weekly": weekly,
    }

    system = (
        "You are a personal finance analyst. "
        "Return ONLY valid JSON. No markdown, no code fences, no extra text."
    )

    prompt = (
        "Analyze this spending data and return a JSON object with this exact structure:\n"
        '{"insights":[{"type":"spending_increase|spending_decrease|saving_win|subscription_alert",'
        '"category":"string","title":"string","description":"string",'
        '"percent_change":number,"amount_change":number,"positive":boolean}],'
        '"weekly_summary":"string or null","savings_suggestion":"string or null"}\n\n'
        f"Data:\n{json.dumps(data, indent=2, default=str)}\n\n"
        "Rules:\n"
        "- insights: max 4 items, sorted by significance\n"
        "- type spending_increase → spending went up (red)\n"
        "- type spending_decrease or saving_win → spending went down (green)\n"
        "- type subscription_alert → subscription cost increased (amber)\n"
        "- percent_change: positive for increases, negative for decreases\n"
        "- amount_change: in INR, positive for increases, negative for decreases\n"
        "- positive: true if the change is financially beneficial\n"
        "- weekly_summary: 1-2 sentence summary of the week's spending or null\n"
        "- savings_suggestion: one actionable suggestion or null\n"
        "Return ONLY valid JSON."
    )

    response = await llm.chat(
        system_prompt=system,
        user_prompt=prompt,
        max_tokens=2000,
        timeout=30.0,
    )

    json_match = re.search(r"\{[\s\S]*\}", response)
    if not json_match:
        return None

    try:
        return json.loads(json_match.group())
    except json.JSONDecodeError:
        pass

    try:
        return ast.literal_eval(json_match.group())
    except Exception:
        pass

    return None


async def _rule_based_compare(
    months_data: list, cats_current: dict, cats_previous: dict, weekly: dict
) -> dict:
    insights = []

    curr_by_cat: dict[str, dict] = {}
    for c in cats_current.get("categories", []):
        curr_by_cat[c["category"].lower()] = c

    prev_by_cat: dict[str, dict] = {}
    for c in cats_previous.get("categories", []):
        prev_by_cat[c["category"].lower()] = c

    for cat_lower, curr in curr_by_cat.items():
        if cat_lower not in prev_by_cat:
            continue
        prev_amt = float(prev_by_cat[cat_lower]["amount"])
        curr_amt = float(curr["amount"])
        if prev_amt <= 0:
            continue
        pct = round((curr_amt - prev_amt) / prev_amt * 100)
        chg = round(curr_amt - prev_amt)
        is_sub = "subscription" in cat_lower

        if pct > 10:
            insights.append({
                "type": "subscription_alert" if is_sub else "spending_increase",
                "category": curr["category"],
                "title": f"You spent {pct}% more on {curr['category']} this month",
                "description": (
                    f"Your {curr['category']} spending went from "
                    f"\u20b9{prev_amt:,.0f} to \u20b9{curr_amt:,.0f}, "
                    f"an increase of \u20b9{chg:,.0f}."
                ),
                "percent_change": pct,
                "amount_change": chg,
                "positive": False,
            })
        elif pct < -10:
            insights.append({
                "type": "saving_win",
                "category": curr["category"],
                "title": f"You spent {abs(pct)}% less on {curr['category']} \u2014 great saving!",
                "description": (
                    f"Your {curr['category']} spending dropped from "
                    f"\u20b9{prev_amt:,.0f} to \u20b9{curr_amt:,.0f}, "
                    f"saving \u20b9{abs(chg):,.0f}."
                ),
                "percent_change": pct,
                "amount_change": chg,
                "positive": True,
            })

    if len(months_data) >= 2:
        latest_sr = months_data[-1].get("savings_rate", 0) or 0
        prev_sr = months_data[-2].get("savings_rate", 0) or 0
        sr_chg = round(float(latest_sr) - float(prev_sr), 1)
        if abs(sr_chg) >= 5:
            is_pos = sr_chg > 0
            insights.append({
                "type": "saving_win" if is_pos else "spending_increase",
                "category": "Savings Rate",
                "title": (
                    f"Savings rate {'improved' if is_pos else 'dropped'} by "
                    f"{abs(sr_chg)} percentage points"
                ),
                "description": (
                    f"Your savings rate changed from {prev_sr}% to {latest_sr}%."
                ),
                "percent_change": round(sr_chg / prev_sr * 100) if prev_sr > 0 else 0,
                "amount_change": round(sr_chg, 1),
                "positive": is_pos,
            })

    insights.sort(key=lambda x: abs(x["percent_change"]), reverse=True)
    insights = insights[:4]

    # Weekly summary (rule-based)
    w = weekly
    weekly_summary = (
        f"This week you spent \u20b9{w['total']:,.0f} across {w['count']} transactions."
    )
    if w["biggest_day"] and w["biggest_day_amount"]:
        weekly_summary += (
            f" Your biggest spending day was {w['biggest_day']} "
            f"(\u20b9{w['biggest_day_amount']:,.0f})."
        )

    # Savings suggestion (rule-based)
    savings_suggestion = None
    increased = [i for i in insights if not i["positive"]]
    if increased:
        top = max(increased, key=lambda i: abs(i["amount_change"]))
        savings_suggestion = (
            f"You could save \u20b9{abs(top['amount_change']):,.0f}/month "
            f"by reducing {top['category'].lower()}."
        )

    return {
        "insights": insights,
        "weekly_summary": weekly_summary,
        "savings_suggestion": savings_suggestion,
    }
