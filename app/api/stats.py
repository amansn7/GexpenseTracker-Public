from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import ColumnElement, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.ext.compiler import compiles

from app.auth_deps import get_current_user
from app.config import settings
from app.database import get_db
from app.models import ClassifierMethod, Email, Transaction, TransactionStatus, User, UserSettings

router = APIRouter()


class MonthKey(ColumnElement):
    """Cross-dialect SQL expression: returns 'YYYY-MM' from a date column."""
    inherit_cache = True

    def __init__(self, col):
        self.col = col


@compiles(MonthKey, "postgresql")
def _pg_month_key(element, compiler, **kw):
    return f"to_char(date_trunc('month', {compiler.process(element.col, **kw)}), 'YYYY-MM')"


@compiles(MonthKey, "sqlite")
def _sqlite_month_key(element, compiler, **kw):
    return f"strftime('%Y-%m', {compiler.process(element.col, **kw)})"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _add_months(d: date, n: int) -> date:
    """Add n months to date d, returning the 1st of that month."""
    month = d.month - 1 + n
    year = d.year + month // 12
    month = month % 12 + 1
    return d.replace(year=year, month=month, day=1)


def _effective_month(txn_date: date, label: str, sender: str | None) -> date:
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
        return _add_months(txn_date, settings.INCOME_MONTH_SHIFT)
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
async def stats_summary(
    period: str = "1m",
    date_from: date | None = None,
    date_to: date | None = None,
    category: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if date_from and date_to:
        start = date_from
        end = date_to
    else:
        if period not in ("1m", "3m", "6m", "1y"):
            raise HTTPException(status_code=422, detail="period must be one of: 1m, 3m, 6m, 1y")
        start = _period_start(period)
        end = date.today()
    this_month = end.replace(day=1)

    expense_where = [
        Email.user_id == current_user.id,
        Transaction.label == "expense",
        or_(Transaction.transaction_type == "purchase", Transaction.transaction_type.is_(None)),
        Transaction.txn_date >= start,
        Transaction.txn_date <= end,
        Transaction.txn_date.isnot(None),
        Transaction.status != "needs_review",
    ]
    if category:
        expense_where.append(Transaction.category == category)

    total_expenses = float((await db.execute(
        select(func.sum(Transaction.amount))
        .join(Email, Transaction.email_id == Email.id)
        .where(*expense_where)
    )).scalar_one() or 0)

    # Intentional: income that shifts to next month via effective_month is excluded
    # from the current period (e.g., Axis salary on Apr 28 counts as May income).
    income_rows = (await db.execute(
        select(Transaction.txn_date, Transaction.amount, Email.sender)
        .join(Email, Transaction.email_id == Email.id)
        .where(
            Email.user_id == current_user.id,
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

    total_cc_payments = float((await db.execute(
        select(func.sum(Transaction.amount))
        .join(Email, Transaction.email_id == Email.id)
        .where(
            Email.user_id == current_user.id,
            Transaction.transaction_type == "cc_payment",
            Transaction.txn_date >= start,
            Transaction.txn_date <= end,
            Transaction.txn_date.isnot(None),
            Transaction.status != "needs_review",
        )
    )).scalar_one() or 0)

    total_investments = float((await db.execute(
        select(func.sum(Transaction.amount))
        .join(Email, Transaction.email_id == Email.id)
        .where(
            Email.user_id == current_user.id,
            Transaction.transaction_type == "investment",
            Transaction.txn_date >= start,
            Transaction.txn_date <= end,
            Transaction.txn_date.isnot(None),
            Transaction.status != "needs_review",
        )
    )).scalar_one() or 0)

    saved = total_income - total_expenses - total_cc_payments - total_investments
    savings_rate = round(saved / total_income * 100, 1) if total_income > 0 else 0.0

    needs_review_count = (await db.execute(
        select(func.count()).select_from(Transaction)
        .join(Email, Transaction.email_id == Email.id)
        .where(Email.user_id == current_user.id, Transaction.status == "needs_review")
    )).scalar_one()

    unread_count = (await db.execute(
        select(func.count()).select_from(Transaction)
        .join(Email, Transaction.email_id == Email.id)
        .where(Email.user_id == current_user.id, not Transaction.read)
    )).scalar_one()

    return {
        "total_expenses": round(total_expenses, 2),
        "total_income": round(total_income, 2),
        "total_cc_payments": round(total_cc_payments, 2),
        "total_investments": round(total_investments, 2),
        "saved": round(saved, 2),
        "savings_rate": savings_rate,
        "needs_review_count": needs_review_count,
        "unread_count": unread_count,
    }


@router.get("/stats/category-breakdown")
async def stats_category_breakdown(
    period: str = "1m",
    date_from: date | None = None,
    date_to: date | None = None,
    category: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if date_from and date_to:
        start = date_from
        end = date_to
    else:
        if period not in ("1m", "3m", "6m", "1y"):
            raise HTTPException(status_code=422, detail="period must be one of: 1m, 3m, 6m, 1y")
        start = _period_start(period)
        end = date.today()

    where = [
        Email.user_id == current_user.id,
        Transaction.label == "expense",
        or_(Transaction.transaction_type == "purchase", Transaction.transaction_type.is_(None)),
        Transaction.txn_date >= start,
        Transaction.txn_date <= end,
        Transaction.txn_date.isnot(None),
        Transaction.status != "needs_review",
    ]
    if category:
        where.append(Transaction.category == category)

    rows = (await db.execute(
        select(Transaction.category, func.sum(Transaction.amount).label("total"))
        .join(Email, Transaction.email_id == Email.id)
        .where(*where)
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

    if len(categories) > settings.CATEGORY_BREAKDOWN_LIMIT:
        other_amount = sum(c["amount"] for c in categories[settings.CATEGORY_BREAKDOWN_LIMIT:])
        categories = categories[:settings.CATEGORY_BREAKDOWN_LIMIT]
        categories.append({
            "category": "Other",
            "amount": round(other_amount, 2),
            "pct": round(other_amount / total * 100, 1) if total > 0 else 0.0,
        })

    return {"categories": categories, "total": round(total, 2)}


async def _monthly_data(period: str, db: AsyncSession, date_from: date | None = None, date_to: date | None = None, user_id: str = "") -> list:
    """Shared logic for monthly-trend and income-vs-expense endpoints."""
    today = date.today()
    if date_from and date_to:
        start = date_from
        end = date_to
    else:
        start = _period_start(period)
        end = today
    this_month = end.replace(day=1)

    months: dict = {}
    m = start.replace(day=1)
    while m <= this_month:
        key = m.strftime("%Y-%m")
        months[key] = {"month": key, "expenses": 0.0, "income": 0.0}
        m = _add_months(m, 1)

    expense_where = [
        Transaction.label == "expense",
        or_(Transaction.transaction_type == "purchase", Transaction.transaction_type.is_(None)),
        Transaction.txn_date >= start,
        Transaction.txn_date <= end,
        Transaction.txn_date.isnot(None),
        Transaction.status != "needs_review",
    ]
    income_where = [
        Transaction.label == "income",
        Transaction.txn_date >= _add_months(start, -1),
        Transaction.txn_date.isnot(None),
        Transaction.status != "needs_review",
    ]
    expense_where.insert(0, Email.user_id == user_id)
    income_where.insert(0, Email.user_id == user_id)

    expense_rows = (await db.execute(
        select(
            MonthKey(Transaction.txn_date).label('month_key'),
            func.sum(Transaction.amount).label('total'),
        )
        .join(Email, Transaction.email_id == Email.id)
        .where(*expense_where)
        .group_by(MonthKey(Transaction.txn_date))
    )).all()

    for r in expense_rows:
        key = r.month_key
        if key in months:
            months[key]["expenses"] += float(r.total or 0)

    income_rows = (await db.execute(
        select(Transaction.txn_date, Transaction.amount, Email.sender)
        .join(Email, Transaction.email_id == Email.id)
        .where(*income_where)
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
    return result


@router.get("/stats/monthly-trend")
async def stats_monthly_trend(
    period: str = "1m",
    date_from: date | None = None,
    date_to: date | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not (date_from and date_to) and period not in ("1m", "3m", "6m", "1y"):
        raise HTTPException(status_code=422, detail="period must be one of: 1m, 3m, 6m, 1y")
    return {"months": await _monthly_data(period, db, date_from, date_to, user_id=current_user.id)}


@router.get("/stats/top-merchants")
async def stats_top_merchants(
    period: str = "1m",
    date_from: date | None = None,
    date_to: date | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if date_from and date_to:
        start = date_from
        end = date_to
    else:
        if period not in ("1m", "3m", "6m", "1y"):
            raise HTTPException(status_code=422, detail="period must be one of: 1m, 3m, 6m, 1y")
        start = _period_start(period)
        end = date.today()

    rows = (await db.execute(
        select(Transaction.merchant, func.sum(Transaction.amount).label("total"))
        .join(Email, Transaction.email_id == Email.id)
        .where(
            Email.user_id == current_user.id,
            Transaction.label == "expense",
            or_(Transaction.transaction_type == "purchase", Transaction.transaction_type.is_(None)),
            Transaction.txn_date >= start,
            Transaction.txn_date <= end,
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


@router.get("/stats/monthly-summary")
async def stats_monthly_summary(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    months_data = await _monthly_data("1y", db, user_id=current_user.id)
    result = []
    for m in reversed(months_data):
        income = m["income"]
        expenses = m["expenses"]
        net = round(income - expenses, 2)
        savings_rate = round(net / income * 100, 1) if income > 0 else 0.0
        from datetime import datetime as _dt
        label = _dt.strptime(m["month"], "%Y-%m").strftime("%B %Y")
        result.append({
            "month": m["month"],
            "label": label,
            "income": income,
            "expenses": expenses,
            "net": net,
            "savings_rate": savings_rate,
        })
    return {"months": result}


@router.get("/stats/income-vs-expense")
async def stats_income_vs_expense(
    period: str = "1m",
    date_from: date | None = None,
    date_to: date | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not (date_from and date_to) and period not in ("1m", "3m", "6m", "1y"):
        raise HTTPException(status_code=422, detail="period must be one of: 1m, 3m, 6m, 1y")
    return {"months": await _monthly_data(period, db, date_from, date_to, user_id=current_user.id)}


@router.get("/stats/health")
async def stats_health(
    months: int = 6,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if months not in (3, 6, 12):
        raise HTTPException(status_code=422, detail="months must be 3, 6, or 12")

    period_map = {3: "3m", 6: "6m", 12: "1y"}
    monthly = await _monthly_data(period_map[months], db, user_id=current_user.id)

    monthly_net = [
        {
            "month": m["month"],
            "income": m["income"],
            "expenses": m["expenses"],
            "net": round(m["income"] - m["expenses"], 2),
        }
        for m in monthly
    ]

    # Savings rate and runway use last 3 months for a stable baseline
    last3 = monthly[-3:] if len(monthly) >= 3 else monthly
    avg_income = sum(m["income"] for m in last3) / max(len(last3), 1)
    avg_expense = sum(m["expenses"] for m in last3) / max(len(last3), 1)
    avg_net = avg_income - avg_expense

    savings_rate = round(avg_net / avg_income * 100, 1) if avg_income > 0 else 0.0

    # Starting balance from user_settings scoped to current_user
    settings_row = (await db.execute(
        select(UserSettings).where(UserSettings.user_id == current_user.id)
    )).scalar_one_or_none()
    starting_balance = (
        float(settings_row.starting_balance)
        if settings_row and settings_row.starting_balance is not None
        else None
    )
    starting_balance_date = settings_row.starting_balance_date if settings_row else None

    # Net transactions from starting_balance_date (or all-time if no anchor), scoped to current_user
    base_filter = [
        Email.user_id == current_user.id,
        Transaction.txn_date.isnot(None),
        Transaction.status != "needs_review",
    ]
    if starting_balance_date:
        base_filter.append(Transaction.txn_date >= starting_balance_date)

    expense_total = (await db.execute(
        select(func.sum(Transaction.amount))
        .join(Email, Transaction.email_id == Email.id)
        .where(Transaction.label == "expense", or_(Transaction.transaction_type == "purchase", Transaction.transaction_type.is_(None)), *base_filter)
    )).scalar_one() or 0

    cc_payment_total = (await db.execute(
        select(func.sum(Transaction.amount))
        .join(Email, Transaction.email_id == Email.id)
        .where(Transaction.transaction_type == "cc_payment", *base_filter)
    )).scalar_one() or 0

    investment_total = (await db.execute(
        select(func.sum(Transaction.amount))
        .join(Email, Transaction.email_id == Email.id)
        .where(Transaction.transaction_type == "investment", *base_filter)
    )).scalar_one() or 0

    income_total = float((await db.execute(
        select(func.sum(Transaction.amount))
        .join(Email, Transaction.email_id == Email.id)
        .where(Transaction.label == "income", *base_filter)
    )).scalar_one() or 0)

    net_since = income_total - float(expense_total) - float(cc_payment_total or 0) - float(investment_total or 0)
    current_balance = round((starting_balance or 0.0) + net_since, 2)
    balance_mode = "anchored" if starting_balance is not None else "computed"

    runway_months = max(round(current_balance / avg_expense, 1), 0.0) if avg_expense > 0 else None

    return {
        "current_balance": current_balance,
        "savings_rate": savings_rate,
        "runway_months": runway_months,
        "starting_balance": starting_balance,
        "starting_balance_date": starting_balance_date.isoformat() if starting_balance_date else None,
        "balance_mode": balance_mode,
        "monthly_net": monthly_net,
        "total_cc_payments": round(float(cc_payment_total or 0), 2),
        "total_investments": round(float(investment_total or 0), 2),
    }


@router.get("/stats/confidence")
async def stats_confidence(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    base_where = [
        Email.user_id == current_user.id,
        Transaction.confidence.isnot(None),
    ]

    total = (await db.execute(
        select(func.count()).select_from(Transaction)
        .join(Email, Transaction.email_id == Email.id)
        .where(*base_where)
    )).scalar_one()

    auto_confirmed = (await db.execute(
        select(func.count()).select_from(Transaction)
        .join(Email, Transaction.email_id == Email.id)
        .where(*base_where, Transaction.status == TransactionStatus.confirmed.value)
    )).scalar_one()

    corrected = (await db.execute(
        select(func.count()).select_from(Transaction)
        .join(Email, Transaction.email_id == Email.id)
        .where(*base_where, Transaction.status == TransactionStatus.corrected.value)
    )).scalar_one()

    needs_review = (await db.execute(
        select(func.count()).select_from(Transaction)
        .join(Email, Transaction.email_id == Email.id)
        .where(*base_where, Transaction.status == TransactionStatus.needs_review.value)
    )).scalar_one()

    high_count = (await db.execute(
        select(func.count()).select_from(Transaction)
        .join(Email, Transaction.email_id == Email.id)
        .where(*base_where, Transaction.confidence >= settings.HIGH_CONFIDENCE_THRESHOLD)
    )).scalar_one()

    medium_count = (await db.execute(
        select(func.count()).select_from(Transaction)
        .join(Email, Transaction.email_id == Email.id)
        .where(*base_where, Transaction.confidence >= settings.MEDIUM_CONFIDENCE_THRESHOLD, Transaction.confidence < settings.HIGH_CONFIDENCE_THRESHOLD)
    )).scalar_one()

    low_count = (await db.execute(
        select(func.count()).select_from(Transaction)
        .join(Email, Transaction.email_id == Email.id)
        .where(*base_where, Transaction.confidence < settings.LOW_CONFIDENCE_THRESHOLD)
    )).scalar_one()

    rule_count = (await db.execute(
        select(func.count()).select_from(Transaction)
        .join(Email, Transaction.email_id == Email.id)
        .where(*base_where, Transaction.classifier_method == ClassifierMethod.rule.value)
    )).scalar_one()

    llm_count = (await db.execute(
        select(func.count()).select_from(Transaction)
        .join(Email, Transaction.email_id == Email.id)
        .where(*base_where, Transaction.classifier_method == ClassifierMethod.llm.value)
    )).scalar_one()

    correction_rate = round(corrected / total, 4) if total > 0 else 0.0

    return {
        "total": total,
        "auto_confirmed": auto_confirmed,
        "corrected": corrected,
        "needs_review": needs_review,
        "confidence_distribution": {
            "high": high_count,
            "medium": medium_count,
            "low": low_count,
        },
        "method_breakdown": {
            "rule": rule_count,
            "llm": llm_count,
        },
        "correction_rate": correction_rate,
    }
