"""Today view API — aggregates data for the redesigned Today mode."""
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, desc

from app.auth_deps import get_current_user
from app.database import get_db
from app.models import (
    Transaction, Email, User, UserSettings,
    TransactionStatus, Budget,
)
from app.config import settings

router = APIRouter()


def _add_months(d: date, n: int) -> date:
    month = d.month - 1 + n
    year = d.year + month // 12
    month = month % 12 + 1
    return d.replace(year=year, month=month, day=1)


@router.get("/today")
async def today_view(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return all data needed for the Today view in one call."""
    today = date.today()
    month_start = today.replace(day=1)
    prev_month_start = _add_months(month_start, -1)

    # ── Context Band: Income | Spent | Remaining ──
    expense_where = [
        Email.user_id == current_user.id,
        Transaction.label == "expense",
        or_(Transaction.transaction_type == "purchase", Transaction.transaction_type.is_(None)),
        Transaction.txn_date >= month_start,
        Transaction.txn_date <= today,
        Transaction.txn_date.isnot(None),
        Transaction.status != TransactionStatus.needs_review.value,
    ]
    expense_rows = (await db.execute(
        select(func.sum(Transaction.amount))
        .join(Email, Transaction.email_id == Email.id)
        .where(*expense_where)
    )).scalar_one() or 0
    total_expenses = round(float(expense_rows), 2)

    income_where = [
        Email.user_id == current_user.id,
        Transaction.label == "income",
        Transaction.txn_date >= prev_month_start,
        Transaction.txn_date <= today,
        Transaction.txn_date.isnot(None),
        Transaction.status != TransactionStatus.needs_review.value,
    ]
    income_rows = (await db.execute(
        select(Transaction.txn_date, Transaction.amount, Email.sender)
        .join(Email, Transaction.email_id == Email.id)
        .where(*income_where)
    )).all()

    total_income = 0.0
    for r in income_rows:
        em = r.txn_date.replace(day=1)
        if r.sender and "axis" in (r.sender or "").lower() and r.txn_date.day >= 25:
            em = _add_months(r.txn_date, settings.INCOME_MONTH_SHIFT)
        if prev_month_start <= em <= month_start:
            total_income += float(r.amount or 0)
    total_income = round(total_income, 2)

    remaining = round(total_income - total_expenses, 2)

    # Previous month expenses for comparison
    prev_month_end = month_start - timedelta(days=1)
    prev_expense_where = [
        Email.user_id == current_user.id,
        Transaction.label == "expense",
        or_(Transaction.transaction_type == "purchase", Transaction.transaction_type.is_(None)),
        Transaction.txn_date >= prev_month_start,
        Transaction.txn_date <= prev_month_end,
        Transaction.txn_date.isnot(None),
        Transaction.status != TransactionStatus.needs_review.value,
    ]
    prev_expense_rows = (await db.execute(
        select(func.sum(Transaction.amount))
        .join(Email, Transaction.email_id == Email.id)
        .where(*prev_expense_where)
    )).scalar_one() or 0
    prev_expenses = round(float(prev_expense_rows), 2)

    expense_change_pct = 0.0
    if prev_expenses > 0:
        expense_change_pct = round((total_expenses - prev_expenses) / prev_expenses * 100, 0)

    # ── Sparkline: daily spend for current month ──
    daily_spend_rows = (await db.execute(
        select(Transaction.txn_date, func.sum(Transaction.amount).label("daily_total"))
        .join(Email, Transaction.email_id == Email.id)
        .where(
            Email.user_id == current_user.id,
            Transaction.label == "expense",
            or_(Transaction.transaction_type == "purchase", Transaction.transaction_type.is_(None)),
            Transaction.txn_date >= month_start,
            Transaction.txn_date <= today,
            Transaction.txn_date.isnot(None),
            Transaction.status != TransactionStatus.needs_review.value,
        )
        .group_by(Transaction.txn_date)
        .order_by(Transaction.txn_date)
    )).all()

    day_of_month = today.day
    sparkline = [0.0] * day_of_month
    for r in daily_spend_rows:
        idx = r.txn_date.day - 1
        if 0 <= idx < day_of_month:
            sparkline[idx] = round(float(r.daily_total or 0), 2)

    # ── Attention Band: items needing action ──
    attention = []

    # 1. Review queue count
    review_count = (await db.execute(
        select(func.count()).select_from(Transaction)
        .join(Email, Transaction.email_id == Email.id)
        .where(
            Email.user_id == current_user.id,
            Transaction.status == TransactionStatus.needs_review.value,
        )
    )).scalar_one() or 0
    if review_count > 0:
        attention.append({
            "type": "review",
            "label": f"{review_count} transaction{'s' if review_count != 1 else ''} need{'s' if review_count == 1 else ''} review",
            "count": review_count,
        })

    # 2. Unusual charges: merchant with amount > 2x their average
    merchant_avg_rows = (await db.execute(
        select(Transaction.merchant, func.avg(Transaction.amount).label("avg_amt"))
        .join(Email, Transaction.email_id == Email.id)
        .where(
            Email.user_id == current_user.id,
            Transaction.label == "expense",
            Transaction.merchant.isnot(None),
            Transaction.txn_date.isnot(None),
            Transaction.status != TransactionStatus.needs_review.value,
        )
        .group_by(Transaction.merchant)
        .having(func.count(Transaction.id) >= 2)
    )).all()

    merchant_averages = {r.merchant: float(r.avg_amt) for r in merchant_avg_rows if r.avg_amt and r.avg_amt > 0}

    if merchant_averages:
        unusual_txns = (await db.execute(
            select(Transaction.merchant, Transaction.amount, Transaction.txn_date)
            .join(Email, Transaction.email_id == Email.id)
            .where(
                Email.user_id == current_user.id,
                Transaction.label == "expense",
                Transaction.merchant.in_(list(merchant_averages.keys())),
                Transaction.txn_date >= month_start,
                Transaction.txn_date <= today,
                Transaction.txn_date.isnot(None),
                Transaction.status != TransactionStatus.needs_review.value,
            )
            .order_by(desc(Transaction.amount))
            .limit(2)
        )).all()

        for t in unusual_txns:
            avg = merchant_averages.get(t.merchant, 0)
            if avg > 0 and float(t.amount or 0) > avg * 2:
                attention.append({
                    "type": "unusual",
                    "label": f"{t.merchant} charge {round(float(t.amount or 0) / avg, 1)}x your usual",
                    "merchant": t.merchant,
                    "amount": round(float(t.amount or 0), 2),
                })

    # 3. Budget alerts
    budget_rows = (await db.execute(
        select(Budget.category, Budget.monthly_limit)
        .where(Budget.user_id == current_user.id)
    )).all()

    cat_breakdown_rows = (await db.execute(
        select(Transaction.category, func.sum(Transaction.amount).label("total"))
        .join(Email, Transaction.email_id == Email.id)
        .where(
            Email.user_id == current_user.id,
            Transaction.label == "expense",
            Transaction.txn_date >= month_start,
            Transaction.txn_date <= today,
            Transaction.txn_date.isnot(None),
            Transaction.status != TransactionStatus.needs_review.value,
        )
        .group_by(Transaction.category)
    )).all()

    cat_spent = {r.category: float(r.total or 0) for r in cat_breakdown_rows}

    for b in budget_rows:
        spent = cat_spent.get(b.category, 0)
        if b.monthly_limit and spent > float(b.monthly_limit) * 0.8:
            pct = round(spent / float(b.monthly_limit) * 100, 0) if b.monthly_limit else 0
            over = spent > float(b.monthly_limit)
            attention.append({
                "type": "budget",
                "label": f"{b.category} {'over' if over else 'near'} budget ({pct}%)",
                "category": b.category,
                "spent": round(spent, 2),
                "limit": round(float(b.monthly_limit), 2),
                "over": over,
            })

    # Limit attention items to 4
    attention = attention[:4]

    # ── Category breakdown for Context Band drill-down ──
    cat_rows = (await db.execute(
        select(Transaction.category, func.sum(Transaction.amount).label("total"))
        .join(Email, Transaction.email_id == Email.id)
        .where(*expense_where)
        .group_by(Transaction.category)
        .order_by(desc("total"))
    )).all()

    categories = [
        {
            "category": r.category or "Uncategorized",
            "amount": round(float(r.total or 0), 2),
            "pct": round(float(r.total or 0) / total_expenses * 100, 1) if total_expenses > 0 else 0.0,
        }
        for r in cat_rows
    ]

    # ── Health summary ──
    settings_row = (await db.execute(
        select(UserSettings).where(UserSettings.user_id == current_user.id)
    )).scalar_one_or_none()
    starting_balance = (
        float(settings_row.starting_balance)
        if settings_row and settings_row.starting_balance is not None
        else None
    )
    starting_balance_date = settings_row.starting_balance_date if settings_row else None

    base_filter = [
        Email.user_id == current_user.id,
        Transaction.txn_date.isnot(None),
        Transaction.status != TransactionStatus.needs_review.value,
    ]
    if starting_balance_date:
        base_filter.append(Transaction.txn_date >= starting_balance_date)

    all_expense = (await db.execute(
        select(func.sum(Transaction.amount))
        .join(Email, Transaction.email_id == Email.id)
        .where(Transaction.label == "expense", or_(Transaction.transaction_type == "purchase", Transaction.transaction_type.is_(None)), *base_filter)
    )).scalar_one() or 0
    all_income = (await db.execute(
        select(func.sum(Transaction.amount))
        .join(Email, Transaction.email_id == Email.id)
        .where(Transaction.label == "income", *base_filter)
    )).scalar_one() or 0
    current_balance = round((starting_balance or 0.0) + float(all_income) - float(all_expense), 2)

    # Last 3 months avg expense for runway
    three_months_ago = _add_months(month_start, -2)
    monthly_exp_rows = (await db.execute(
        select(Transaction.txn_date, func.sum(Transaction.amount).label("monthly_total"))
        .join(Email, Transaction.email_id == Email.id)
        .where(
            Email.user_id == current_user.id,
            Transaction.label == "expense",
            or_(Transaction.transaction_type == "purchase", Transaction.transaction_type.is_(None)),
            Transaction.txn_date >= three_months_ago,
            Transaction.txn_date.isnot(None),
            Transaction.status != TransactionStatus.needs_review.value,
        )
        .group_by(Transaction.txn_date)
    )).all()

    # Group by month manually for SQLite compatibility
    monthly_totals = {}
    for r in monthly_exp_rows:
        month_key = r.txn_date.strftime("%Y-%m")
        monthly_totals[month_key] = monthly_totals.get(month_key, 0) + float(r.monthly_total or 0)

    avg_monthly_expense = sum(monthly_totals.values()) / max(len(monthly_totals), 1) if monthly_totals else 0
    runway = round(current_balance / avg_monthly_expense, 1) if avg_monthly_expense > 0 else None

    savings_rate = round((total_income - total_expenses) / total_income * 100, 1) if total_income > 0 else 0.0

    return {
        "answer": {
            "income": total_income,
            "spent": total_expenses,
            "remaining": remaining,
            "prev_expenses": prev_expenses,
            "expense_change_pct": expense_change_pct,
            "sparkline": sparkline,
            "month_label": today.strftime("%B %Y"),
        },
        "attention": attention,
        "context": {
            "income": total_income,
            "spent": total_expenses,
            "remaining": remaining,
            "categories": categories,
            "current_balance": current_balance,
            "runway_months": runway,
            "savings_rate": savings_rate,
        },
    }


@router.get("/today/review-queue")
async def today_review_queue(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return review queue items for the Review mode queue view."""
    rows = (await db.execute(
        select(Transaction, Email)
        .join(Email, Transaction.email_id == Email.id)
        .where(
            Transaction.status == TransactionStatus.needs_review.value,
            Email.user_id == current_user.id,
        )
        .order_by(desc(Email.received_at))
    )).all()

    result = []
    for t, e in rows:
        result.append({
            "id": t.id,
            "merchant": t.merchant or "Unknown",
            "amount": round(float(t.amount or 0), 2),
            "category": t.category or "Uncategorized",
            "confidence": round(t.confidence or 0, 2),
            "date": e.received_at.isoformat() if e.received_at else None,
            "subject": e.subject or "",
            "body_snippet": e.body_snippet or "",
            "sender": e.sender or "",
        })

    return result


@router.post("/today/review/{transaction_id}/approve")
async def approve_review_item(
    transaction_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark a review item as confirmed."""
    row = (await db.execute(
        select(Transaction)
        .join(Email, Transaction.email_id == Email.id)
        .where(Transaction.id == transaction_id, Email.user_id == current_user.id)
    )).scalar_one_or_none()

    if not row:
        raise HTTPException(status_code=404, detail="Transaction not found")

    row.status = TransactionStatus.confirmed.value
    row.read = True
    await db.commit()

    return {"id": transaction_id, "status": "confirmed"}


@router.post("/today/review/{transaction_id}/skip")
async def skip_review_item(
    transaction_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Skip a review item (keep in queue, mark read)."""
    row = (await db.execute(
        select(Transaction)
        .join(Email, Transaction.email_id == Email.id)
        .where(Transaction.id == transaction_id, Email.user_id == current_user.id)
    )).scalar_one_or_none()

    if not row:
        raise HTTPException(status_code=404, detail="Transaction not found")

    row.read = True
    await db.commit()

    return {"id": transaction_id, "status": "skipped"}
