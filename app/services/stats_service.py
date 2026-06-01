from datetime import date, datetime, timedelta
import json
import uuid

from sqlalchemy import case, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Email, PeriodRollup,
    Transaction, UserSettings,
)
from app.services.category_service import CategoryService


# ── In-memory cache ──────────────────────────────────────────────
_cache: dict[str, tuple[PeriodRollup, datetime]] = {}
_CACHE_TTL = timedelta(minutes=5)


def _cache_key(user_id: str, period_type: str, period_key: str) -> str:
    return f"rollup:{user_id}:{period_type}:{period_key}"


def _cache_get(key: str) -> PeriodRollup | None:
    if key in _cache:
        val, ts = _cache[key]
        if datetime.now() - ts < _CACHE_TTL:
            return val
        del _cache[key]
    return None


def _cache_set(key: str, val: PeriodRollup):
    _cache[key] = (val, datetime.now())


def invalidate_user_cache(user_id: str):
    global _cache
    _cache = {k: v for k, v in _cache.items() if user_id not in k}


# ── Helpers ──────────────────────────────────────────────────────

def _add_months(d: date, n: int) -> date:
    month = d.month - 1 + n
    year = d.year + month // 12
    month = month % 12 + 1
    return d.replace(year=year, month=month, day=1)


def _effective_month(txn_date: date, label: str, sender: str | None) -> date:
    return txn_date.replace(day=1)


def _period_start(period: str) -> date:
    today = date.today()
    return {
        "3m": _add_months(today, -2),
        "6m": _add_months(today, -5),
        "1y": _add_months(today, -11),
    }.get(period, today.replace(day=1))


# ── Rollup recompute kernel ──────────────────────────────────────

async def recompute_month(user_id: str, year: int, month: int, db: AsyncSession) -> PeriodRollup:
    """Recompute the monthly rollup for (user, year, month). Upserts and caches."""
    period_key = f"{year:04d}-{month:02d}"
    start = date(year, month, 1)
    if month == 12:
        end = date(year + 1, 1, 1) - timedelta(days=1)
    else:
        end = date(year, month + 1, 1) - timedelta(days=1)

    inv_aliases = CategoryService.filter_aliases("investment")
    card_aliases = CategoryService.filter_aliases("card")

    base_where = [
        Email.user_id == user_id,
        Transaction.txn_date >= start,
        Transaction.txn_date <= end,
        Transaction.txn_date.isnot(None),
        Transaction.status != "needs_review",
    ]

    # ── Expenses (excl. investment/card categories) ──
    exp_where = [
        *base_where,
        Transaction.label == "expense",
        or_(Transaction.transaction_type == "purchase", Transaction.transaction_type.is_(None)),
        or_(Transaction.category.is_(None), ~func.lower(Transaction.category).in_(inv_aliases)),
        or_(Transaction.category.is_(None), ~func.lower(Transaction.category).in_(card_aliases)),
    ]
    total_expenses = float(
        (await db.execute(
            select(func.sum(Transaction.amount))
            .join(Email, Transaction.email_id == Email.id)
            .where(*exp_where)
        )).scalar_one() or 0
    )

    # ── Income ──
    total_income = float(
        (await db.execute(
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
        )).scalar_one() or 0
    )

    # ── CC payments ──
    cc_row = (
        await db.execute(
            select(func.sum(Transaction.amount), func.count(Transaction.id))
            .join(Email, Transaction.email_id == Email.id)
            .where(
                *base_where,
                or_(
                    Transaction.transaction_type == "cc_payment",
                    func.lower(Transaction.category).in_(card_aliases),
                ),
            )
        )
    ).one()
    total_cc = float(cc_row[0] or 0)

    # ── Investments ──
    inv_row = (
        await db.execute(
            select(func.sum(Transaction.amount), func.count(Transaction.id))
            .join(Email, Transaction.email_id == Email.id)
            .where(
                *base_where,
                or_(
                    Transaction.transaction_type == "investment",
                    func.lower(Transaction.category).in_(inv_aliases),
                ),
            )
        )
    ).one()
    total_inv = float(inv_row[0] or 0)

    net = total_income - total_expenses - total_cc - total_inv
    savings_rate = round(net / total_income * 100, 1) if total_income > 0 else 0.0

    # ── Category breakdown ──
    cat_rows = (
        await db.execute(
            select(
                Transaction.category,
                func.sum(Transaction.amount).label("total"),
                func.count(Transaction.id).label("txn_count"),
            )
            .join(Email, Transaction.email_id == Email.id)
            .where(*exp_where)
            .group_by(Transaction.category)
            .order_by(desc("total"))
        )
    ).all()
    cat_total = sum(float(r.total or 0) for r in cat_rows)
    expenses_by_category = [
        {
            "category": r.category or "Uncategorized",
            "amount": round(float(r.total or 0), 2),
            "pct": round(float(r.total or 0) / cat_total * 100, 1) if cat_total > 0 else 0.0,
            "txn_count": r.txn_count,
        }
        for r in cat_rows
    ]

    # ── Income breakdown ──
    inc_rows = (
        await db.execute(
            select(
                Transaction.category,
                func.sum(Transaction.amount).label("total"),
                func.count(Transaction.id).label("txn_count"),
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
            .group_by(Transaction.category)
            .order_by(desc("total"))
        )
    ).all()
    inc_total = sum(float(r.total or 0) for r in inc_rows)
    income_by_category = [
        {
            "category": r.category or "Income",
            "amount": round(float(r.total or 0), 2),
            "pct": round(float(r.total or 0) / inc_total * 100, 1) if inc_total > 0 else 0.0,
            "txn_count": r.txn_count,
        }
        for r in inc_rows
    ]

    # ── Top merchants ──
    merch_rows = (
        await db.execute(
            select(Transaction.merchant, func.sum(Transaction.amount).label("total"))
            .join(Email, Transaction.email_id == Email.id)
            .where(*exp_where, Transaction.merchant.isnot(None))
            .group_by(Transaction.merchant)
            .order_by(desc("total"))
            .limit(8)
        )
    ).all()
    top_merchants = [
        {"merchant": r.merchant, "amount": round(float(r.total or 0), 2)}
        for r in merch_rows
    ]

    # ── Counts ──
    counts = (
        await db.execute(
            select(
                func.count(Transaction.id),
                func.sum(case((Transaction.read == False, 1), else_=0)),
                func.sum(case((Transaction.status == "needs_review", 1), else_=0)),
                func.sum(case((Transaction.flagged == True, 1), else_=0)),
            )
            .join(Email, Transaction.email_id == Email.id)
            .where(
                Email.user_id == user_id,
                Transaction.txn_date >= start,
                Transaction.txn_date <= end,
            )
        )
    ).one()
    txn_count_val = counts[0] or 0
    unread_val = counts[1] or 0
    review_val = counts[2] or 0
    flagged_val = counts[3] or 0

    # ── Upsert rollup ──
    existing = (
        await db.execute(
            select(PeriodRollup).where(
                PeriodRollup.user_id == user_id,
                PeriodRollup.period_type == "monthly",
                PeriodRollup.period_key == period_key,
            )
        )
    ).scalar_one_or_none()

    if existing:
        existing.total_income = round(total_income, 2)
        existing.total_expenses = round(total_expenses, 2)
        existing.total_cc_payments = round(total_cc, 2)
        existing.total_investments = round(total_inv, 2)
        existing.net_savings = round(net, 2)
        existing.savings_rate = savings_rate
        existing.expenses_by_category = json.dumps(expenses_by_category)
        existing.income_by_category = json.dumps(income_by_category)
        existing.top_merchants = json.dumps(top_merchants)
        existing.txn_count = txn_count_val
        existing.unread_count = unread_val
        existing.needs_review_count = review_val
        existing.flagged_count = flagged_val
        existing.subscription_total = 0  # placeholder
        existing.subscription_count = 0
        existing.txn_version = 0
        existing.computed_at = datetime.utcnow()
        rollup = existing
    else:
        rollup = PeriodRollup(
            id=str(uuid.uuid4()),
            user_id=user_id,
            period_type="monthly",
            period_key=period_key,
            total_income=round(total_income, 2),
            total_expenses=round(total_expenses, 2),
            total_cc_payments=round(total_cc, 2),
            total_investments=round(total_inv, 2),
            net_savings=round(net, 2),
            savings_rate=savings_rate,
            expenses_by_category=json.dumps(expenses_by_category),
            income_by_category=json.dumps(income_by_category),
            top_merchants=json.dumps(top_merchants),
            txn_count=txn_count_val,
            unread_count=unread_val,
            needs_review_count=review_val,
            flagged_count=flagged_val,
            subscription_total=0,
            subscription_count=0,
            txn_version=0,
            computed_at=datetime.utcnow(),
        )
        db.add(rollup)

    await db.flush()
    _cache_set(_cache_key(user_id, "monthly", period_key), rollup)
    return rollup


# ── Lookup helpers ───────────────────────────────────────────────

async def get_rollup(user_id: str, start: date, end: date, db: AsyncSession) -> PeriodRollup | None:
    """Get or recompute a rollup for a date range. For single-month ranges
    this is a direct lookup; multi-month ranges return None (not yet supported)."""
    if start.replace(day=1) == end.replace(day=1):
        key = start.strftime("%Y-%m")
        cached = _cache_get(_cache_key(user_id, "monthly", key))
        if cached:
            return cached

        r = (
            await db.execute(
                select(PeriodRollup).where(
                    PeriodRollup.user_id == user_id,
                    PeriodRollup.period_type == "monthly",
                    PeriodRollup.period_key == key,
                )
            )
        ).scalar_one_or_none()

        if r:
            _cache_set(_cache_key(user_id, "monthly", key), r)
            return r

        return await recompute_month(user_id, start.year, start.month, db)

    # Multi-month: not pre-computed, caller falls back to live aggregation
    return None


async def get_summary(user_id: str, start: date, end: date, db: AsyncSession) -> dict:
    r = await get_rollup(user_id, start, end, db)
    if r:
        return {
            "total_expenses": float(r.total_expenses),
            "total_income": float(r.total_income),
            "total_cc_payments": float(r.total_cc_payments),
            "total_cc_payments_count": 0,
            "total_investments": float(r.total_investments),
            "total_investments_count": 0,
            "saved": float(r.net_savings),
            "savings_rate": float(r.savings_rate),
            "needs_review_count": r.needs_review_count,
            "unread_count": r.unread_count,
        }
    # Fallback: delegate to current live computation (imported inline)
    from app.api.stats import _compute_summary
    return await _compute_summary(start, end, None, user_id, db)


async def get_category_breakdown(user_id: str, start: date, end: date, db: AsyncSession) -> dict:
    r = await get_rollup(user_id, start, end, db)
    if r:
        cats = r.get_expenses_by_category()
        total = sum(c["amount"] for c in cats)
        return {"categories": cats, "total": round(total, 2)}
    from app.api.stats import _compute_category_breakdown
    return await _compute_category_breakdown(start, end, None, user_id, db)


async def get_top_merchants(user_id: str, start: date, end: date, db: AsyncSession) -> dict:
    r = await get_rollup(user_id, start, end, db)
    if r:
        return {"merchants": r.get_top_merchants()}
    from app.api.stats import _compute_top_merchants
    return await _compute_top_merchants(start, end, user_id, db)


async def get_monthly_summary(user_id: str, num_months: int, db: AsyncSession) -> dict:
    """Return monthly summary for the last N months, using rollups."""
    today = date.today()
    start = _add_months(today.replace(day=1), -(num_months - 1))
    results = []
    m = start
    while m <= today:
        key = m.strftime("%Y-%m")
        if m.month == 12:
            end = date(m.year + 1, 1, 1) - timedelta(days=1)
        else:
            end = date(m.year, m.month + 1, 1) - timedelta(days=1)
        r = await get_rollup(user_id, m, end, db)
        if r and r.period_key == key:
            inc = float(r.total_income)
            exp = float(r.total_expenses)
            net = round(float(r.net_savings), 2)
            sr = float(r.savings_rate)
            label = m.strftime("%B %Y")
            results.append({
                "month": key,
                "label": label,
                "income": inc,
                "expenses": exp,
                "net": net,
                "savings_rate": sr,
            })
        else:
            from app.api.stats import _compute_summary
            live = await _compute_summary(m, end, None, user_id, db)
            inc = live["total_income"]
            exp = live["total_expenses"]
            net = round(live["saved"], 2)
            sr = live["savings_rate"]
            results.append({
                "month": key,
                "label": m.strftime("%B %Y"),
                "income": inc,
                "expenses": exp,
                "net": net,
                "savings_rate": sr,
            })
        m = _add_months(m, 1)
    return {"months": results}


async def get_health(user_id: str, months: int, db: AsyncSession) -> dict:
    """Compute financial health. Balance queries are still live (starting_balance
    makes rollup tricky), but monthly_net comes from rollups."""
    monthly = await get_monthly_summary(user_id, months, db)
    months_data = monthly["months"]

    monthly_net = [
        {"month": m["month"], "income": m["income"],
         "expenses": m["expenses"], "net": m["net"]}
        for m in months_data
    ]

    last3 = months_data[-3:] if len(months_data) >= 3 else months_data
    avg_income = sum(m["income"] for m in last3) / max(len(last3), 1)
    avg_expense = sum(m["expenses"] for m in last3) / max(len(last3), 1)
    avg_net = sum(m["net"] for m in last3) / max(len(last3), 1)
    savings_rate = round(avg_net / avg_income * 100, 1) if avg_income > 0 else 0.0

    settings = (
        await db.execute(select(UserSettings).where(UserSettings.user_id == user_id))
    ).scalar_one_or_none()
    starting_balance = (
        float(settings.starting_balance) if settings and settings.starting_balance else None
    )
    starting_balance_date = settings.starting_balance_date if settings else None

    inv_aliases = CategoryService.filter_aliases("investment")
    base_filter = [Email.user_id == user_id, Transaction.txn_date.isnot(None),
                   Transaction.status != "needs_review"]
    if starting_balance_date:
        base_filter.append(Transaction.txn_date >= starting_balance_date)

    exp_total = float(
        (await db.execute(
            select(func.sum(Transaction.amount))
            .join(Email, Transaction.email_id == Email.id)
            .where(Transaction.label == "expense",
                   or_(Transaction.transaction_type == "purchase", Transaction.transaction_type.is_(None)),
                   or_(Transaction.category.is_(None), ~func.lower(Transaction.category).in_(inv_aliases)),
                   *base_filter)
        )).scalar_one() or 0
    )
    cc_total = float(
        (await db.execute(
            select(func.sum(Transaction.amount))
            .join(Email, Transaction.email_id == Email.id)
            .where(Transaction.transaction_type == "cc_payment", *base_filter)
        )).scalar_one() or 0
    )
    inv_total = float(
        (await db.execute(
            select(func.sum(Transaction.amount))
            .join(Email, Transaction.email_id == Email.id)
            .where(or_(Transaction.transaction_type == "investment",
                       func.lower(Transaction.category).in_(inv_aliases)),
                   *base_filter)
        )).scalar_one() or 0
    )
    inc_total = float(
        (await db.execute(
            select(func.sum(Transaction.amount))
            .join(Email, Transaction.email_id == Email.id)
            .where(Transaction.label == "income", *base_filter)
        )).scalar_one() or 0
    )

    net_since = inc_total - exp_total - cc_total - inv_total
    current_balance = round((starting_balance or 0.0) + net_since, 2)
    balance_mode = "anchored" if starting_balance is not None else "computed"
    runway = max(round(current_balance / avg_expense, 1), 0.0) if avg_expense > 0 else None

    return {
        "current_balance": current_balance,
        "savings_rate": savings_rate,
        "runway_months": runway,
        "starting_balance": starting_balance,
        "starting_balance_date": starting_balance_date.isoformat() if starting_balance_date else None,
        "balance_mode": balance_mode,
        "monthly_net": monthly_net,
        "total_cc_payments": round(cc_total, 2),
        "total_investments": round(inv_total, 2),
    }
