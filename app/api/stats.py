from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from app.services.stats_service import (
    get_summary,
    get_category_breakdown,
    get_top_merchants,
    get_monthly_summary,
    get_health,
    get_rollup,
    recompute_month,
    invalidate_user_cache,
    _add_months,
    _period_start,
)
from sqlalchemy import ColumnElement, case, cast, desc, func, or_, select
from sqlalchemy.types import Date
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.ext.compiler import compiles

from app.auth_deps import get_current_user
from app.config import settings
from app.database import get_db
from app.models import Budget, BudgetLink, ClassifierMethod, Email, Transaction, TransactionStatus, User, UserSettings

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
# Extracted helpers
# ---------------------------------------------------------------------------


async def _compute_summary(start: date, end: date, category: str | None, user_id: str, db: AsyncSession) -> dict:
    """Reusable summary computation."""
    from app.services.category_service import CategoryService

    this_month = end.replace(day=1)

    # Exclude investment- and card-categorized transactions from expenses so
    # they're only counted in their own buckets (handles classifiers that set
    # category but leave transaction_type=NULL, and manual re-tags).
    inv_cat_aliases = CategoryService.filter_aliases("investment")
    card_cat_aliases = CategoryService.filter_aliases("card")

    expense_where = [
        Email.user_id == user_id,
        Transaction.label == "expense",
        or_(Transaction.transaction_type == "purchase", Transaction.transaction_type.is_(None)),
        or_(Transaction.category.is_(None), ~func.lower(Transaction.category).in_(inv_cat_aliases)),
        or_(Transaction.category.is_(None), ~func.lower(Transaction.category).in_(card_cat_aliases)),
        Transaction.txn_date >= start,
        Transaction.txn_date <= end,
        Transaction.txn_date.isnot(None),
        Transaction.status != "needs_review",
    ]
    if category:
        if category == "other":
            other_aliases = CategoryService.filter_aliases("other")
            all_known = CategoryService.all_known_values()
            expense_where.append(
                or_(
                    Transaction.category.is_(None),
                    func.lower(Transaction.category).in_(other_aliases),
                    ~func.lower(Transaction.category).in_(all_known),
                )
            )
        else:
            aliases = CategoryService.filter_aliases(category)
            expense_where.append(func.lower(Transaction.category).in_(aliases))

    total_expenses = float(
        (
            await db.execute(
                select(func.sum(Transaction.amount)).join(Email, Transaction.email_id == Email.id).where(*expense_where)
            )
        ).scalar_one()
        or 0
    )

    total_income = float(
        (
            await db.execute(
                select(func.sum(Transaction.amount))
                .join(Email, Transaction.email_id == Email.id)
                .where(
                    Email.user_id == user_id,
                    Transaction.label == "income",
                    Transaction.txn_date >= start,
                    Transaction.txn_date <= end,
                    Transaction.txn_date.isnot(None),
                    Transaction.status != "needs_review",
                )
            )
        ).scalar_one()
        or 0
    )

    cc_row = (
        await db.execute(
            select(
                func.sum(Transaction.amount).label("total"),
                func.count(Transaction.id).label("count"),
            )
            .join(Email, Transaction.email_id == Email.id)
            .where(
                Email.user_id == user_id,
                or_(
                    Transaction.transaction_type == "cc_payment",
                    func.lower(Transaction.category).in_(card_cat_aliases),
                ),
                Transaction.txn_date >= start,
                Transaction.txn_date <= end,
                Transaction.txn_date.isnot(None),
                Transaction.status != "needs_review",
            )
        )
    ).one()
    total_cc_payments = float(cc_row.total or 0)
    total_cc_payments_count = cc_row.count

    inv_row = (
        await db.execute(
            select(
                func.sum(Transaction.amount).label("total"),
                func.count(Transaction.id).label("count"),
            )
            .join(Email, Transaction.email_id == Email.id)
            .where(
                Email.user_id == user_id,
                or_(
                    Transaction.transaction_type == "investment",
                    func.lower(Transaction.category).in_(inv_cat_aliases),
                ),
                Transaction.txn_date >= start,
                Transaction.txn_date <= end,
                Transaction.txn_date.isnot(None),
                Transaction.status != "needs_review",
            )
        )
    ).one()
    total_investments = float(inv_row.total or 0)
    total_investments_count = inv_row.count

    saved = total_income - total_expenses - total_cc_payments - total_investments
    savings_rate = round(saved / total_income * 100, 1) if total_income > 0 else 0.0

    needs_review_count = (
        await db.execute(
            select(func.count())
            .select_from(Transaction)
            .join(Email, Transaction.email_id == Email.id)
            .where(Email.user_id == user_id, Transaction.status == "needs_review")
        )
    ).scalar_one()

    unread_count = (
        await db.execute(
            select(func.count())
            .select_from(Transaction)
            .join(Email, Transaction.email_id == Email.id)
            .where(Email.user_id == user_id, not Transaction.read)
        )
    ).scalar_one()

    return {
        "total_expenses": round(total_expenses, 2),
        "total_income": round(total_income, 2),
        "total_cc_payments": round(total_cc_payments, 2),
        "total_cc_payments_count": total_cc_payments_count,
        "total_investments": round(total_investments, 2),
        "total_investments_count": total_investments_count,
        "saved": round(saved, 2),
        "savings_rate": savings_rate,
        "needs_review_count": needs_review_count,
        "unread_count": unread_count,
    }


async def _compute_category_breakdown(start: date, end: date, category: str | None, user_id: str, db: AsyncSession) -> dict:
    from app.services.category_service import CategoryService as _CBD_CS
    _cbd_inv_aliases = _CBD_CS.filter_aliases("investment")
    _cbd_card_aliases = _CBD_CS.filter_aliases("card")
    where = [
        Email.user_id == user_id,
        Transaction.txn_date >= start,
        Transaction.txn_date <= end,
        Transaction.txn_date.isnot(None),
        Transaction.status != "needs_review",
        Transaction.label == "expense",
        or_(Transaction.transaction_type == "purchase", Transaction.transaction_type.is_(None)),
        or_(Transaction.category.is_(None), ~func.lower(Transaction.category).in_(_cbd_inv_aliases)),
        or_(Transaction.category.is_(None), ~func.lower(Transaction.category).in_(_cbd_card_aliases)),
    ]
    if category:
        from app.services.category_service import CategoryService
        if category == "other":
            other_aliases = CategoryService.filter_aliases("other")
            all_known = CategoryService.all_known_values()
            where.append(
                or_(
                    Transaction.category.is_(None),
                    func.lower(Transaction.category).in_(other_aliases),
                    ~func.lower(Transaction.category).in_(all_known),
                )
            )
        else:
            aliases = CategoryService.filter_aliases(category)
            where.append(func.lower(Transaction.category).in_(aliases))

    rows = (
        await db.execute(
            select(
                Transaction.category,
                func.sum(Transaction.amount).label("total"),
                func.count(Transaction.id).label("txn_count"),
            )
            .join(Email, Transaction.email_id == Email.id)
            .where(*where)
            .group_by(Transaction.category)
            .order_by(desc("total"))
        )
    ).all()

    total = sum(float(r.total or 0) for r in rows)
    categories = [
        {
            "category": r.category or "Uncategorized",
            "amount": round(float(r.total or 0), 2),
            "pct": round(float(r.total or 0) / total * 100, 1) if total > 0 else 0.0,
            "txn_count": r.txn_count,
        }
        for r in rows
    ]

    if len(categories) > settings.CATEGORY_BREAKDOWN_LIMIT:
        other_amount = sum(c["amount"] for c in categories[settings.CATEGORY_BREAKDOWN_LIMIT:])
        other_count = sum(c["txn_count"] for c in categories[settings.CATEGORY_BREAKDOWN_LIMIT:])
        categories = categories[: settings.CATEGORY_BREAKDOWN_LIMIT]
        categories.append(
            {
                "category": "Other",
                "amount": round(other_amount, 2),
                "pct": round(other_amount / total * 100, 1) if total > 0 else 0.0,
                "txn_count": other_count,
            }
        )

    return {"categories": categories, "total": round(total, 2)}


async def _compute_top_merchants(start: date, end: date, user_id: str, db: AsyncSession) -> dict:
    from app.services.category_service import CategoryService as _CS
    _merch_inv_aliases = _CS.filter_aliases("investment")
    _merch_card_aliases = _CS.filter_aliases("card")
    rows = (
        await db.execute(
            select(Transaction.merchant, func.sum(Transaction.amount).label("total"))
            .join(Email, Transaction.email_id == Email.id)
            .where(
                Email.user_id == user_id,
                Transaction.label == "expense",
                or_(Transaction.transaction_type == "purchase", Transaction.transaction_type.is_(None)),
                or_(Transaction.category.is_(None), ~func.lower(Transaction.category).in_(_merch_inv_aliases)),
                or_(Transaction.category.is_(None), ~func.lower(Transaction.category).in_(_merch_card_aliases)),
                Transaction.txn_date >= start,
                Transaction.txn_date <= end,
                Transaction.txn_date.isnot(None),
                Transaction.status != "needs_review",
                Transaction.merchant.isnot(None),
            )
            .group_by(Transaction.merchant)
            .order_by(desc("total"))
            .limit(8)
        )
    ).all()

    return {"merchants": [{"merchant": r.merchant, "amount": round(float(r.total or 0), 2)} for r in rows]}


async def _compute_monthly_trend(period: str, date_from: date | None, date_to: date | None, user_id: str, db: AsyncSession) -> dict:
    return {"months": await _monthly_data(period, db, date_from, date_to, user_id=user_id)}


async def _compute_monthly_summary(user_id: str, db: AsyncSession) -> dict:
    months_data = await _monthly_data("1y", db, user_id=user_id)
    result = []
    for m in reversed(months_data):
        income = m["income"]
        expenses = m["expenses"]
        net = round(income - expenses, 2)
        savings_rate = round(net / income * 100, 1) if income > 0 else 0.0
        from datetime import datetime as _dt
        label = _dt.strptime(m["month"], "%Y-%m").strftime("%B %Y")
        result.append(
            {
                "month": m["month"],
                "label": label,
                "income": income,
                "expenses": expenses,
                "net": net,
                "savings_rate": savings_rate,
            }
        )
    return {"months": result}


async def _compute_health(months: int, user_id: str, db: AsyncSession) -> dict:
    period_map = {3: "3m", 6: "6m", 12: "1y"}
    monthly = await _monthly_data(period_map[months], db, user_id=user_id)

    monthly_net = [
        {
            "month": m["month"],
            "income": m["income"],
            "expenses": m["expenses"],
            "net": round(m["income"] - m["expenses"], 2),
        }
        for m in monthly
    ]

    last3 = monthly[-3:] if len(monthly) >= 3 else monthly
    avg_income = sum(m["income"] for m in last3) / max(len(last3), 1)
    avg_expense = sum(m["expenses"] for m in last3) / max(len(last3), 1)
    avg_net = avg_income - avg_expense

    savings_rate = round(avg_net / avg_income * 100, 1) if avg_income > 0 else 0.0

    settings_row = (
        await db.execute(select(UserSettings).where(UserSettings.user_id == user_id))
    ).scalar_one_or_none()
    starting_balance = (
        float(settings_row.starting_balance) if settings_row and settings_row.starting_balance is not None else None
    )
    starting_balance_date = settings_row.starting_balance_date if settings_row else None

    base_filter = [
        Email.user_id == user_id,
        Transaction.txn_date.isnot(None),
        Transaction.status != "needs_review",
    ]
    if starting_balance_date:
        base_filter.append(Transaction.txn_date >= starting_balance_date)

    from app.services.category_service import CategoryService as _CS
    _health_inv_aliases = _CS.filter_aliases("investment")

    expense_total = (
        await db.execute(
            select(func.sum(Transaction.amount))
            .join(Email, Transaction.email_id == Email.id)
            .where(
                Transaction.label == "expense",
                or_(Transaction.transaction_type == "purchase", Transaction.transaction_type.is_(None)),
                or_(Transaction.category.is_(None), ~func.lower(Transaction.category).in_(_health_inv_aliases)),
                *base_filter,
            )
        )
    ).scalar_one() or 0

    cc_payment_total = (
        await db.execute(
            select(func.sum(Transaction.amount))
            .join(Email, Transaction.email_id == Email.id)
            .where(Transaction.transaction_type == "cc_payment", *base_filter)
        )
    ).scalar_one() or 0

    investment_total = (
        await db.execute(
            select(func.sum(Transaction.amount))
            .join(Email, Transaction.email_id == Email.id)
            .where(
                or_(
                    Transaction.transaction_type == "investment",
                    func.lower(Transaction.category).in_(_health_inv_aliases),
                ),
                *base_filter,
            )
        )
    ).scalar_one() or 0

    income_filter = [Email.user_id == user_id, Transaction.txn_date.isnot(None), Transaction.status != "needs_review"]
    if starting_balance_date:
        income_filter.append(Transaction.txn_date >= starting_balance_date)
    income_total = float(
        (
            await db.execute(
                select(func.sum(Transaction.amount))
                .join(Email, Transaction.email_id == Email.id)
                .where(Transaction.label == "income", *income_filter)
            )
        ).scalar_one()
        or 0
    )

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


async def _compute_budgets(user_id: str, db: AsyncSession) -> dict:
    today = date.today()
    first_of_month = today.replace(day=1)

    budgets = (
        (await db.execute(select(Budget).where(Budget.user_id == user_id).order_by(Budget.category)))
        .scalars()
        .all()
    )

    spend_rows = (
        await db.execute(
            select(Transaction.category, func.sum(Transaction.amount).label("spent"))
            .join(Email, Transaction.email_id == Email.id)
            .where(
                Transaction.label == "expense",
                Transaction.txn_date >= first_of_month,
                Transaction.txn_date <= today,
                Transaction.txn_date.isnot(None),
                Transaction.status != "needs_review",
                Email.user_id == user_id,
            )
            .group_by(Transaction.category)
        )
    ).all()

    spend_map: dict[str, float] = {}
    for r in spend_rows:
        key = r.category.lower() if r.category else ""
        if key:
            spend_map[key] = spend_map.get(key, 0.0) + float(r.spent or 0)

    linked_rows = (
        await db.execute(
            select(
                BudgetLink.target_category,
                func.sum(
                    case(
                        (Transaction.amount < BudgetLink.split_amount, Transaction.amount),
                        else_=BudgetLink.split_amount,
                    )
                ).label("linked_spent"),
            )
            .join(Transaction, Transaction.category == BudgetLink.source_category)
            .join(Email, Transaction.email_id == Email.id)
            .where(
                BudgetLink.user_id == user_id,
                Email.user_id == user_id,
                Transaction.label == "expense",
                Transaction.txn_date >= first_of_month,
                Transaction.txn_date <= today,
                Transaction.txn_date.isnot(None),
                Transaction.status != "needs_review",
            )
            .group_by(BudgetLink.target_category)
        )
    ).all()

    linked_map: dict[str, float] = {}
    for r in linked_rows:
        key = r.target_category.lower() if r.target_category else ""
        if key:
            linked_map[key] = linked_map.get(key, 0.0) + float(r.linked_spent or 0)

    result = []
    for b in budgets:
        direct = spend_map.get(b.category.lower(), 0.0)
        linked = linked_map.get(b.category.lower(), 0.0)
        spent = direct + linked
        limit = float(b.monthly_limit)
        pct = round(spent / limit * 100, 1) if limit > 0 else 0.0
        result.append(
            {
                "id": b.id,
                "category": b.category,
                "monthly_limit": limit,
                "spent_this_month": round(spent, 2),
                "pct": pct,
                "over_budget": spent > limit,
            }
        )

    return {"budgets": result}


async def _monthly_data(
    period: str, db: AsyncSession, date_from: date | None = None, date_to: date | None = None, user_id: str = ""
) -> list:
    """Shared logic for monthly-trend and income-vs-expense endpoints."""
    from app.services.category_service import CategoryService

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

    _inv_aliases = CategoryService.filter_aliases("investment")
    _card_aliases = CategoryService.filter_aliases("card")

    expense_where = [
        Email.user_id == user_id,
        Transaction.label == "expense",
        or_(Transaction.transaction_type == "purchase", Transaction.transaction_type.is_(None)),
        or_(Transaction.category.is_(None), ~func.lower(Transaction.category).in_(_inv_aliases)),
        or_(Transaction.category.is_(None), ~func.lower(Transaction.category).in_(_card_aliases)),
        Transaction.txn_date >= start,
        Transaction.txn_date <= end,
        Transaction.txn_date.isnot(None),
        Transaction.status != "needs_review",
    ]

    expense_rows = (
        await db.execute(
            select(
                MonthKey(Transaction.txn_date).label("month_key"),
                func.sum(Transaction.amount).label("total"),
            )
            .join(Email, Transaction.email_id == Email.id)
            .where(*expense_where)
            .group_by(MonthKey(Transaction.txn_date))
        )
    ).all()

    for r in expense_rows:
        key = r.month_key
        if key in months:
            months[key]["expenses"] += float(r.total or 0)

    income_rows = (
        await db.execute(
            select(
                MonthKey(Transaction.txn_date).label("month_key"),
                func.sum(Transaction.amount).label("total"),
            )
            .join(Email, Transaction.email_id == Email.id)
            .where(
                Email.user_id == user_id,
                Transaction.label == "income",
                Transaction.txn_date >= start,
                Transaction.txn_date <= end,
                Transaction.txn_date.isnot(None),
                Transaction.status != "needs_review",
            )
            .group_by(MonthKey(Transaction.txn_date))
        )
    ).all()

    for r in income_rows:
        key = r.month_key
        if key in months:
            months[key]["income"] += float(r.total or 0)

    result = sorted(months.values(), key=lambda x: x["month"])
    for entry in result:
        entry["expenses"] = round(entry["expenses"], 2)
        entry["income"] = round(entry["income"], 2)
    return result


async def _compute_confidence(user_id: str, db: AsyncSession) -> dict:
    """Reusable confidence stats computation."""
    base_where = [
        Email.user_id == user_id,
        Transaction.confidence.isnot(None),
    ]

    total = (
        await db.execute(
            select(func.count())
            .select_from(Transaction)
            .join(Email, Transaction.email_id == Email.id)
            .where(*base_where)
        )
    ).scalar_one()

    auto_confirmed = (
        await db.execute(
            select(func.count())
            .select_from(Transaction)
            .join(Email, Transaction.email_id == Email.id)
            .where(*base_where, Transaction.status == TransactionStatus.confirmed.value)
        )
    ).scalar_one()

    corrected = (
        await db.execute(
            select(func.count())
            .select_from(Transaction)
            .join(Email, Transaction.email_id == Email.id)
            .where(*base_where, Transaction.status == TransactionStatus.corrected.value)
        )
    ).scalar_one()

    needs_review = (
        await db.execute(
            select(func.count())
            .select_from(Transaction)
            .join(Email, Transaction.email_id == Email.id)
            .where(*base_where, Transaction.status == TransactionStatus.needs_review.value)
        )
    ).scalar_one()

    high_count = (
        await db.execute(
            select(func.count())
            .select_from(Transaction)
            .join(Email, Transaction.email_id == Email.id)
            .where(*base_where, Transaction.confidence >= settings.HIGH_CONFIDENCE_THRESHOLD)
        )
    ).scalar_one()

    return {
        "total": total,
        "auto_confirmed": auto_confirmed,
        "corrected": corrected,
        "needs_review": needs_review,
        "high_confidence": high_count,
        "overall_score": round(auto_confirmed / total * 100, 1) if total > 0 else 0.0,
    }


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
    return await get_summary(current_user.id, start, end, db)


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
    return await get_category_breakdown(current_user.id, start, end, db)


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
    return await get_top_merchants(current_user.id, start, end, db)


@router.get("/stats/monthly-summary")
async def stats_monthly_summary(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_monthly_summary(current_user.id, 12, db)


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
    return await get_health(current_user.id, months, db)


@router.get("/stats/confidence")
async def stats_confidence(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await _compute_confidence(current_user.id, db)


@router.get("/stats")
async def get_stats(
    sections: str = "summary",
    date_from: date | None = None,
    date_to: date | None = None,
    category: str | None = None,
    period: str = "1m",
    months: int = 6,
    compare: bool = False,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    section_set = {s.strip() for s in sections.split(",")}
    user_id = current_user.id

    if date_from and date_to:
        start = date_from
        end = date_to
    elif date_from or date_to:
        start = _period_start(period)
        end = date.today()
    else:
        start = date(2000, 1, 1)
        end = date(2099, 12, 31)

    result: dict = {}

    for section in section_set:
        if section == "summary":
            result["summary"] = await get_summary(user_id, start, end, db)
        elif section == "categoryBreakdown":
            result["categoryBreakdown"] = await get_category_breakdown(user_id, start, end, db)
        elif section == "topMerchants":
            result["topMerchants"] = await get_top_merchants(user_id, start, end, db)
        elif section == "health":
            result["health"] = await get_health(user_id, months, db)
        elif section == "monthlySummary":
            result["monthlySummary"] = await get_monthly_summary(user_id, 12, db)
        elif section == "monthlyTrend":
            result["monthlyTrend"] = await _compute_monthly_trend(period, date_from, date_to, user_id, db)
        elif section == "budgets":
            result["budgets"] = await _compute_budgets(user_id, db)
        elif section == "confidence":
            result["confidence"] = await _compute_confidence(user_id, db)

    if compare and date_from and date_to:
        range_days = (date_to - date_from).days
        prev_from = date_from - timedelta(days=range_days + 1)
        prev_to = date_from - timedelta(days=1)
        result["previousPeriod"] = {
            "date_from": prev_from.isoformat(),
            "date_to": prev_to.isoformat(),
            "summary": await get_summary(user_id, prev_from, prev_to, db),
        }

    return {k: v for k, v in result.items() if v is not None}
