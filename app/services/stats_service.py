import json
import uuid
from datetime import date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    PeriodRollup,
    Transaction,
    UserSettings,
)
from app.services.category_service import CategoryService
from app.services.rollup_cache import rollup_cache
from app.services.stats_queries import (
    build_aggregation_query,
    build_category_breakdown_query,
    build_health_aggregation_query,
    build_income_breakdown_query,
    build_top_merchants_query,
)


async def invalidate_user_cache(user_id: str):
    await rollup_cache.invalidate_user(user_id)


# ── Helpers ──────────────────────────────────────────────────────

def _add_months(d: date, n: int) -> date:
    month = d.month - 1 + n
    year = d.year + month // 12
    month = month % 12 + 1
    return d.replace(year=year, month=month, day=1)


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

    # ── Query 1: Combined aggregation (items 1-4, 8) ──
    agg_row = (await db.execute(
        build_aggregation_query(user_id, start, end, inv_aliases, card_aliases)
    )).one()
    total_expenses = float(agg_row.total_expenses or 0)
    total_income = float(agg_row.total_income or 0)
    total_cc = float(agg_row.cc_payments or 0)
    total_inv = float(agg_row.investments or 0)
    txn_count_val = agg_row.txn_count or 0
    unread_val = agg_row.unread_count or 0
    review_val = agg_row.needs_review_count or 0
    flagged_val = agg_row.flagged_count or 0

    net = total_income - total_expenses - total_cc - total_inv
    savings_rate = round(net / total_income * 100, 1) if total_income > 0 else 0.0
    savings_rate = max(-9999.9, min(9999.9, savings_rate))

    # ── Query 2: Category + income breakdown ──
    cat_rows = (await db.execute(
        build_category_breakdown_query(user_id, start, end, inv_aliases, card_aliases)
    )).all()
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

    inc_rows = (await db.execute(
        build_income_breakdown_query(user_id, start, end)
    )).all()
    inc_total = sum(float(r.total or 0) for r in inc_rows)
    income_by_category = [
        {"category": r.category or "Income", "amount": round(float(r.total or 0), 2),
         "pct": round(float(r.total or 0) / inc_total * 100, 1) if inc_total > 0 else 0.0,
         "txn_count": r.txn_count}
        for r in inc_rows
    ]

    # ── Query 3: Top merchants ──
    merch_rows = (await db.execute(
        build_top_merchants_query(user_id, start, end, inv_aliases, card_aliases)
    )).all()
    top_merchants = [
        {"merchant": r.merchant, "amount": round(float(r.total or 0), 2)}
        for r in merch_rows
    ]

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
    await rollup_cache.set(user_id, "monthly", period_key, rollup.id)
    return rollup


# ── Lookup helpers ───────────────────────────────────────────────

async def get_rollup(user_id: str, start: date, end: date, db: AsyncSession) -> PeriodRollup | None:
    if start.replace(day=1) == end.replace(day=1):
        key = start.strftime("%Y-%m")
        marker_id = await rollup_cache.get(user_id, "monthly", key)
        if marker_id:
            r = await db.get(PeriodRollup, marker_id)
            if r and r.period_key == key:
                return r

        r = (await db.execute(
            select(PeriodRollup).where(
                PeriodRollup.user_id == user_id,
                PeriodRollup.period_type == "monthly",
                PeriodRollup.period_key == key,
            )
        )).scalar_one_or_none()

        if r:
            await rollup_cache.set(user_id, "monthly", key, r.id)
            return r

        return await recompute_month(user_id, start.year, start.month, db)

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
    extra_filters = []
    if starting_balance_date:
        extra_filters.append(Transaction.txn_date >= starting_balance_date)

    health_row = (await db.execute(
        build_health_aggregation_query(user_id, inv_aliases, extra_filters)
    )).one()
    exp_total = float(health_row.total_expenses or 0)
    cc_total = float(health_row.total_cc or 0)
    inv_total = float(health_row.total_investments or 0)
    inc_total = float(health_row.total_income or 0)

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
