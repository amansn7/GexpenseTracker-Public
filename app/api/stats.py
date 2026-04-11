from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc

from app.database import get_db
from app.models import Transaction, Email

router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _add_months(d: date, n: int) -> date:
    """Add n months to date d, returning the 1st of that month."""
    month = d.month - 1 + n
    year = d.year + month // 12
    month = month % 12 + 1
    return d.replace(year=year, month=month, day=1)


def _effective_month(txn_date: date, label: str, sender: Optional[str]) -> date:
    """Return the month this transaction is attributed to.

    Axis Bank income on day >= 25 shifts to the 1st of the following month.
    All other transactions: 1st of their own month.
    """
    if (
        label == "income"
        and txn_date.day >= 25
        and sender
        and "axis" in sender.lower()
    ):
        return _add_months(txn_date, 1)
    return txn_date.replace(day=1)


def _period_start(period: str) -> date:
    """Return first day of the earliest month in the requested period."""
    today = date.today()
    if period == "3m":
        return _add_months(today, -2)
    if period == "6m":
        return _add_months(today, -5)
    if period == "1y":
        return _add_months(today, -11)
    # default: 1m — this month only
    return today.replace(day=1)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/stats/summary")
async def stats_summary(period: str = "1m", db: AsyncSession = Depends(get_db)):
    today = date.today()
    start = _period_start(period)
    this_month = today.replace(day=1)

    expense_rows = (await db.execute(
        select(Transaction.amount)
        .where(
            Transaction.label == "expense",
            Transaction.txn_date >= start,
            Transaction.txn_date <= today,
            Transaction.txn_date.isnot(None),
            Transaction.status != "needs_review",
        )
    )).scalars().all()

    income_rows = (await db.execute(
        select(Transaction.txn_date, Transaction.amount, Email.sender)
        .join(Email, Transaction.email_id == Email.id)
        .where(
            Transaction.label == "income",
            Transaction.txn_date >= _add_months(start, -1),
            Transaction.txn_date.isnot(None),
            Transaction.status != "needs_review",
        )
    )).all()

    total_income = sum(
        float(r.amount or 0)
        for r in income_rows
        if start <= _effective_month(r.txn_date, "income", r.sender) <= this_month
    )
    total_expenses = sum(float(a or 0) for a in expense_rows)
    saved = total_income - total_expenses
    savings_rate = round(saved / total_income * 100, 1) if total_income > 0 else 0.0

    needs_review_count = (await db.execute(
        select(func.count()).select_from(Transaction)
        .where(Transaction.status == "needs_review")
    )).scalar_one()

    return {
        "total_expenses": round(total_expenses, 2),
        "total_income": round(total_income, 2),
        "saved": round(saved, 2),
        "savings_rate": savings_rate,
        "needs_review_count": needs_review_count,
    }


@router.get("/stats/category-breakdown")
async def stats_category_breakdown(period: str = "1m", db: AsyncSession = Depends(get_db)):
    today = date.today()
    start = _period_start(period)

    rows = (await db.execute(
        select(Transaction.category, func.sum(Transaction.amount).label("total"))
        .where(
            Transaction.label == "expense",
            Transaction.txn_date >= start,
            Transaction.txn_date <= today,
            Transaction.txn_date.isnot(None),
            Transaction.status != "needs_review",
        )
        .group_by(Transaction.category)
        .order_by(desc("total"))
    )).all()

    total = sum(float(r.total or 0) for r in rows)
    categories = [
        {
            "category": r.category or "Uncategorized",
            "amount": round(float(r.total or 0), 2),
            "pct": round(float(r.total or 0) / total * 100, 1) if total > 0 else 0.0,
        }
        for r in rows
    ]

    if len(categories) > 6:
        other_amount = sum(c["amount"] for c in categories[6:])
        categories = categories[:6]
        categories.append({
            "category": "Other",
            "amount": round(other_amount, 2),
            "pct": round(other_amount / total * 100, 1) if total > 0 else 0.0,
        })

    return {"categories": categories, "total": round(total, 2)}


@router.get("/stats/monthly-trend")
async def stats_monthly_trend(period: str = "1m", db: AsyncSession = Depends(get_db)):
    today = date.today()
    start = _period_start(period)
    this_month = today.replace(day=1)

    months: dict = {}
    m = start
    while m <= this_month:
        key = m.strftime("%Y-%m")
        months[key] = {"month": key, "expenses": 0.0, "income": 0.0}
        m = _add_months(m, 1)

    expense_rows = (await db.execute(
        select(Transaction.txn_date, Transaction.amount)
        .where(
            Transaction.label == "expense",
            Transaction.txn_date >= start,
            Transaction.txn_date <= today,
            Transaction.txn_date.isnot(None),
            Transaction.status != "needs_review",
        )
    )).all()

    for r in expense_rows:
        key = r.txn_date.strftime("%Y-%m")
        if key in months:
            months[key]["expenses"] += float(r.amount or 0)

    income_rows = (await db.execute(
        select(Transaction.txn_date, Transaction.amount, Email.sender)
        .join(Email, Transaction.email_id == Email.id)
        .where(
            Transaction.label == "income",
            Transaction.txn_date >= _add_months(start, -1),
            Transaction.txn_date.isnot(None),
            Transaction.status != "needs_review",
        )
    )).all()

    for r in income_rows:
        em = _effective_month(r.txn_date, "income", r.sender)
        key = em.strftime("%Y-%m")
        if key in months:
            months[key]["income"] += float(r.amount or 0)

    result = sorted(months.values(), key=lambda x: x["month"])
    for entry in result:
        entry["expenses"] = round(entry["expenses"], 2)
        entry["income"] = round(entry["income"], 2)

    return {"months": result}


@router.get("/stats/top-merchants")
async def stats_top_merchants(period: str = "1m", db: AsyncSession = Depends(get_db)):
    today = date.today()
    start = _period_start(period)

    rows = (await db.execute(
        select(Transaction.merchant, func.sum(Transaction.amount).label("total"))
        .where(
            Transaction.label == "expense",
            Transaction.txn_date >= start,
            Transaction.txn_date <= today,
            Transaction.txn_date.isnot(None),
            Transaction.status != "needs_review",
            Transaction.merchant.isnot(None),
        )
        .group_by(Transaction.merchant)
        .order_by(desc("total"))
        .limit(8)
    )).all()

    return {
        "merchants": [
            {"merchant": r.merchant, "amount": round(float(r.total or 0), 2)}
            for r in rows
        ]
    }


@router.get("/stats/income-vs-expense")
async def stats_income_vs_expense(period: str = "1m", db: AsyncSession = Depends(get_db)):
    today = date.today()
    start = _period_start(period)
    this_month = today.replace(day=1)

    months: dict = {}
    m = start
    while m <= this_month:
        key = m.strftime("%Y-%m")
        months[key] = {"month": key, "expenses": 0.0, "income": 0.0}
        m = _add_months(m, 1)

    expense_rows = (await db.execute(
        select(Transaction.txn_date, Transaction.amount)
        .where(
            Transaction.label == "expense",
            Transaction.txn_date >= start,
            Transaction.txn_date <= today,
            Transaction.txn_date.isnot(None),
            Transaction.status != "needs_review",
        )
    )).all()

    for r in expense_rows:
        key = r.txn_date.strftime("%Y-%m")
        if key in months:
            months[key]["expenses"] += float(r.amount or 0)

    income_rows = (await db.execute(
        select(Transaction.txn_date, Transaction.amount, Email.sender)
        .join(Email, Transaction.email_id == Email.id)
        .where(
            Transaction.label == "income",
            Transaction.txn_date >= _add_months(start, -1),
            Transaction.txn_date.isnot(None),
            Transaction.status != "needs_review",
        )
    )).all()

    for r in income_rows:
        em = _effective_month(r.txn_date, "income", r.sender)
        key = em.strftime("%Y-%m")
        if key in months:
            months[key]["income"] += float(r.amount or 0)

    result = sorted(months.values(), key=lambda x: x["month"])
    for entry in result:
        entry["expenses"] = round(entry["expenses"], 2)
        entry["income"] = round(entry["income"], 2)

    return {"months": result}
