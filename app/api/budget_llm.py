import ast
import json
import logging
from datetime import date, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.stats import (
    _compute_budgets,
    _compute_category_breakdown,
    _compute_monthly_summary,
    _compute_summary,
    _compute_top_merchants,
)
from app.auth_deps import get_current_user
from app.classifier.classifier import record_llm_spend, _compute_cost
from app.classifier.llm import llm_client
from app.classifier.llm.budget_prompts import (
    SYSTEM_ADAPTIVE_PLAN,
    SYSTEM_ANOMALY_ADJUST,
    SYSTEM_BUDGET_PLAN,
    SYSTEM_GOAL_OPTIMIZE,
    SYSTEM_HEALTH_CHECK,
    SYSTEM_MERCHANT_SPLIT,
    USER_ADAPTIVE_PLAN_TEMPLATE,
    USER_ANOMALY_TRANSACTION_TEMPLATE,
    USER_BUDGET_PLAN_TEMPLATE,
    USER_GOAL_OPTIMIZE_TEMPLATE,
    USER_HEALTH_CHECK_TEMPLATE,
    USER_MERCHANT_SPLIT_TEMPLATE,
)
from app.classifier.llm.parsing import _REPAIRERS, extract_json
from app.database import get_db
from app.models import Email, Goal, GoalContribution, RecurringExpense, Transaction, User

logger = logging.getLogger(__name__)
router = APIRouter()


def _maybe_parse_json(text: str) -> dict | None:
    """Try to extract and parse JSON from LLM response. Return None on failure."""
    try:
        cleaned = extract_json(text)
        if not cleaned:
            return None
        # Try standard JSON repair strategies first
        for _, fix in _REPAIRERS:
            try:
                return json.loads(fix(cleaned))
            except (json.JSONDecodeError, ValueError):
                continue
        # Fallback: try ast.literal_eval for Python dict syntax
        try:
            result = ast.literal_eval(cleaned)
            if isinstance(result, dict):
                return result
        except (SyntaxError, ValueError):
            pass
        logger.warning("Failed to parse LLM response as JSON after all repair strategies")
        return None
    except (json.JSONDecodeError, ValueError):
        logger.warning("Failed to parse LLM response as JSON")
        return None


def _category_rows(breakdown: dict | None) -> str:
    """Format category breakdown as a readable table."""
    if not breakdown or not breakdown.get("categories"):
        return "No spending data available."
    rows = []
    for c in breakdown["categories"]:
        rows.append(f"  {c['category']:25s} ₹{c['amount']:<8.0f}  {c['pct']:5.1f}%  {c['txn_count']} txns")
    return "\n".join(rows)


def _budget_rows(budgets: dict | None) -> str:
    """Format budgets list as a readable table."""
    if not budgets or not budgets.get("budgets"):
        return "No budgets set."
    rows = []
    for b in budgets["budgets"]:
        flag = " ⚠️ OVER" if b["over_budget"] else ""
        rows.append(
            f"  {b['category']:25s} limit ₹{b['monthly_limit']:<8.0f} spent ₹{b['spent_this_month']:<8.0f} {b['pct']:5.1f}%{flag}"
        )
    return "\n".join(rows)


def _goal_rows(goals_data: list) -> str:
    """Format goals as a readable table."""
    if not goals_data:
        return "No goals set."
    rows = []
    for g in goals_data:
        remaining = g["target_amount"] - g["current_amount"]
        month_gap = ""
        if g.get("target_date") and remaining > 0:
            from datetime import datetime

            remaining_months = max(1, (datetime.strptime(g["target_date"], "%Y-%m-%d").date() - date.today()).days / 30)
            month_gap = f" (need ₹{remaining / remaining_months:.0f}/mo)"
        label = "✅" if g.get("pct", 0) >= 100 else "⏳"
        rows.append(
            f"  {label} {g['name']:30s} ₹{g['current_amount']:<8.0f} / ₹{g['target_amount']:<8.0f} ({g['pct']:.0f}%){month_gap}"
        )
    return "\n".join(rows)


# ── Endpoint 1: Suggest Complete Budget Plan ────────────────
@router.post("/budgets/llm/suggest-plan")
async def suggest_budget_plan(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    today = date.today()
    three_ago = today.replace(day=1) - timedelta(days=90)

    summary = await _compute_summary(three_ago, today, None, current_user.id, db)
    breakdown = await _compute_category_breakdown(three_ago, today, None, current_user.id, db)
    merchants = await _compute_top_merchants(three_ago, today, current_user.id, db)
    budgets_data = await _compute_budgets(current_user.id, db)

    # Fetch goals
    goals_rows = (await db.execute(select(Goal).where(Goal.user_id == current_user.id, Goal.active))).scalars().all()
    goals_list = []
    for g in goals_rows:
        contrib_sum = (
            await db.execute(select(func.sum(GoalContribution.amount)).where(GoalContribution.goal_id == g.id))
        ).scalar_one() or 0
        goals_list.append(
            {
                "name": g.name,
                "target_amount": float(g.target_amount),
                "current_amount": float(contrib_sum),
                "pct": min(100, round(float(contrib_sum) / float(g.target_amount) * 100, 1))
                if float(g.target_amount) > 0
                else 0,
                "target_date": g.target_date.isoformat() if g.target_date else None,
            }
        )

    # Recurring
    recurring_rows = (
        (
            await db.execute(
                select(RecurringExpense).where(RecurringExpense.user_id == current_user.id, RecurringExpense.active)
            )
        )
        .scalars()
        .all()
    )
    recurring_lines = []
    for r in recurring_rows:
        mult = {"monthly": 1, "weekly": 4.33, "bi-weekly": 2.17, "yearly": 1 / 12}.get(r.frequency, 1)
        monthly_eq = float(r.amount or 0) * mult
        recurring_lines.append(f"  {r.name:25s} ₹{float(r.amount or 0):<8.0f} {r.frequency:12s} → ₹{monthly_eq:.0f}/mo")
    recurring_str = "\n".join(recurring_lines) if recurring_lines else "No recurring expenses."

    user_prompt = USER_BUDGET_PLAN_TEMPLATE.format(
        income=summary.get("total_income", 0),
        category_breakdown=_category_rows(breakdown),
        top_merchants="\n".join(
            f"  {m['merchant']:30s} ₹{m['amount']:<.0f}" for m in (merchants.get("merchants") or [])
        ),
        existing_budgets=_budget_rows(budgets_data),
        goals=_goal_rows(goals_list),
        recurring=recurring_str,
    )

    client = await llm_client.get_user_client(current_user.id) or llm_client
    raw, provider, model_name, tokens_in, tokens_out = await client.chat(system_prompt=SYSTEM_BUDGET_PLAN, user_prompt=user_prompt, max_tokens=1500, timeout=30.0)
    try:
        await record_llm_spend(
            db, current_user.id, provider, model_name,
            tokens_in=tokens_in, tokens_out=tokens_out,
            estimated_cost=_compute_cost(provider, model_name, tokens_in, tokens_out),
        )
        await db.flush()
    except Exception:
        logger.warning("Failed to record LLM spend for budget endpoint", exc_info=True)
    parsed = _maybe_parse_json(raw)
    if parsed:
        for b in parsed.get("budgets") or []:
            b["suggested_limit"] = max(0, b.get("suggested_limit", 0))
        return parsed
    return {"error": "Could not parse LLM response", "raw": raw}


# ── Endpoint 2: Anomaly-Adjust Category ──────────────────────
@router.post("/budgets/llm/anomaly-adjust")
async def anomaly_adjust(
    category: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Given a category, return adjusted baseline excluding one-time purchases."""
    today = date.today()
    three_ago = today - timedelta(days=90)

    # Fetch top transactions for this category
    rows = (
        await db.execute(
            select(Transaction.merchant, Transaction.amount, Transaction.txn_date)
            .join(Email, Transaction.email_id == Email.id)
            .where(
                Email.user_id == current_user.id,
                Transaction.txn_date >= three_ago,
                Transaction.txn_date <= today,
                Transaction.txn_date.isnot(None),
                Transaction.status != "needs_review",
                func.lower(Transaction.category) == category.lower(),
            )
            .order_by(Transaction.amount.desc())
            .limit(20)
        )
    ).all()

    if not rows:
        return {"adjusted_baseline": 0, "rationale": "No transactions found for this category", "anomaly_months": []}

    txns_text = "\n".join(
        f"  {i + 1}. {r.merchant or 'Unknown'} — ₹{float(r.amount or 0):.0f} — {r.txn_date}" for i, r in enumerate(rows)
    )
    user_prompt = USER_ANOMALY_TRANSACTION_TEMPLATE.format(category=category, transactions=txns_text)

    client = await llm_client.get_user_client(current_user.id) or llm_client
    raw, provider, model_name, tokens_in, tokens_out = await client.chat(system_prompt=SYSTEM_ANOMALY_ADJUST, user_prompt=user_prompt, max_tokens=800, timeout=20.0)
    try:
        await record_llm_spend(
            db, current_user.id, provider, model_name,
            tokens_in=tokens_in, tokens_out=tokens_out,
            estimated_cost=_compute_cost(provider, model_name, tokens_in, tokens_out),
        )
        await db.flush()
    except Exception:
        logger.warning("Failed to record LLM spend for budget endpoint", exc_info=True)
    parsed = _maybe_parse_json(raw)

    # Compute adjusted baseline: exclude flagged indices, average the rest
    excluded = set(parsed.get("one_time_indices", [])) if parsed else set()
    valid = [float(r.amount or 0) for i, r in enumerate(rows) if (i + 1) not in excluded and float(r.amount or 0) > 0]
    baseline = round(sum(valid) / len(valid)) if valid else 0

    # Fall back to median of all if no valid non-excluded transactions
    if not valid and rows:
        all_amt = [float(r.amount or 0) for r in rows if float(r.amount or 0) > 0]
        if all_amt:
            all_amt.sort()
            baseline = round(all_amt[len(all_amt) // 2])

    return {
        "adjusted_baseline": baseline,
        "rationale": parsed.get("rationale", "Baseline computed from available transactions")
        if parsed
        else f"Baseline ₹{baseline} from {len(rows)} transactions; LLM analysis unavailable",
        "anomaly_months": parsed.get("anomaly_months", []) if parsed else [],
    }


# ── Endpoint 3: Merchant-Category Split ──────────────────────
@router.post("/budgets/llm/merchant-split")
async def merchant_split(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    today = date.today()
    three_ago = today - timedelta(days=90)

    rows = (
        await db.execute(
            select(
                Transaction.merchant,
                Transaction.category,
                func.sum(Transaction.amount).label("total"),
                func.count(Transaction.id).label("cnt"),
            )
            .join(Email, Transaction.email_id == Email.id)
            .where(
                Email.user_id == current_user.id,
                Transaction.txn_date >= three_ago,
                Transaction.txn_date <= today,
                Transaction.txn_date.isnot(None),
                Transaction.status != "needs_review",
                Transaction.merchant.isnot(None),
            )
            .group_by(Transaction.merchant, Transaction.category)
            .order_by(Transaction.merchant)
        )
    ).all()

    matrix = {}
    for r in rows:
        if r.merchant not in matrix:
            matrix[r.merchant] = {}
        matrix[r.merchant][r.category or "Uncategorized"] = {"amount": round(float(r.total or 0), 2), "count": r.cnt}

    user_prompt = USER_MERCHANT_SPLIT_TEMPLATE.format(merchant_category_matrix=json.dumps(matrix, indent=2))

    client = await llm_client.get_user_client(current_user.id) or llm_client
    raw, provider, model_name, tokens_in, tokens_out = await client.chat(system_prompt=SYSTEM_MERCHANT_SPLIT, user_prompt=user_prompt, max_tokens=1000, timeout=25.0)
    try:
        await record_llm_spend(
            db, current_user.id, provider, model_name,
            tokens_in=tokens_in, tokens_out=tokens_out,
            estimated_cost=_compute_cost(provider, model_name, tokens_in, tokens_out),
        )
        await db.flush()
    except Exception:
        logger.warning("Failed to record LLM spend for budget endpoint", exc_info=True)
    parsed = _maybe_parse_json(raw)
    return parsed or {"reallocations": [], "error": "Could not parse LLM response"}


# ── Endpoint 4: Goal-Aware Optimization ──────────────────────
@router.post("/budgets/llm/goal-optimize")
async def goal_optimize(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    today = date.today()
    three_ago = today - timedelta(days=90)

    summary = await _compute_summary(three_ago, today, None, current_user.id, db)
    budgets_data = await _compute_budgets(current_user.id, db)

    goals_rows = (await db.execute(select(Goal).where(Goal.user_id == current_user.id, Goal.active))).scalars().all()
    goals_list = []
    for g in goals_rows:
        contrib_sum = (
            await db.execute(select(func.sum(GoalContribution.amount)).where(GoalContribution.goal_id == g.id))
        ).scalar_one() or 0
        remaining = float(g.target_amount) - float(contrib_sum)
        months_left = 0
        if g.target_date:
            months_left = max(0, (g.target_date - today).days / 30)
        goals_list.append(
            {
                "name": g.name,
                "target_amount": float(g.target_amount),
                "current_amount": float(contrib_sum),
                "remaining": round(remaining, 2),
                "target_date": g.target_date.isoformat() if g.target_date else None,
                "months_remaining": round(months_left, 1),
                "required_monthly": round(remaining / months_left, 2) if months_left > 0 and remaining > 0 else 0,
            }
        )

    total_budget = sum(b["monthly_limit"] for b in (budgets_data.get("budgets") or []))
    income = summary.get("total_income", 0)
    total_expense = summary.get("total_expenses", 0)
    current_savings_rate = round((income - total_expense) / income * 100, 1) if income > 0 else 0

    user_prompt = USER_GOAL_OPTIMIZE_TEMPLATE.format(
        goals=json.dumps(goals_list, indent=2) if goals_list else "No active goals",
        income=income,
        current_budgets=_budget_rows(budgets_data),
        total_budget=total_budget,
        current_savings_rate=current_savings_rate,
    )

    client = await llm_client.get_user_client(current_user.id) or llm_client
    raw, provider, model_name, tokens_in, tokens_out = await client.chat(system_prompt=SYSTEM_GOAL_OPTIMIZE, user_prompt=user_prompt, max_tokens=1500, timeout=30.0)
    try:
        await record_llm_spend(
            db, current_user.id, provider, model_name,
            tokens_in=tokens_in, tokens_out=tokens_out,
            estimated_cost=_compute_cost(provider, model_name, tokens_in, tokens_out),
        )
        await db.flush()
    except Exception:
        logger.warning("Failed to record LLM spend for budget endpoint", exc_info=True)
    parsed = _maybe_parse_json(raw)
    if parsed:
        # Clamp negative suggested_limit values
        for adj in parsed.get("adjustments") or []:
            adj["suggested_limit"] = max(0, adj.get("suggested_limit", 0))
        return parsed
    return {"error": "Could not parse LLM response", "raw": raw}


# ── Endpoint 5: Adaptive Plan (Irregular Income) ─────────────
@router.post("/budgets/llm/adaptive-plan")
async def adaptive_plan(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    monthly = await _compute_monthly_summary(current_user.id, db)

    incomes = [m["income"] for m in monthly.get("months", []) if m["income"] > 0]
    income_profile = {"mean": 0, "min": 0, "max": 0, "cv": 0, "low_months": 0}
    if incomes:
        import statistics

        mean = statistics.mean(incomes)
        stdev = statistics.stdev(incomes) if len(incomes) > 1 else 0
        income_profile = {
            "mean": round(mean, 0),
            "min": round(min(incomes), 0),
            "max": round(max(incomes), 0),
            "cv": round(stdev / mean, 2) if mean > 0 else 0,
            "low_months": sum(1 for i in incomes if i < mean * 0.7),
        }

    today = date.today()
    three_ago = today - timedelta(days=90)
    breakdown = await _compute_category_breakdown(three_ago, today, None, current_user.id, db)
    budgets_data = await _compute_budgets(current_user.id, db)

    goals_rows = (await db.execute(select(Goal).where(Goal.user_id == current_user.id, Goal.active))).scalars().all()
    goals_list = [{"name": g.name, "target_amount": float(g.target_amount)} for g in goals_rows]

    recurring_rows = (
        (
            await db.execute(
                select(RecurringExpense).where(RecurringExpense.user_id == current_user.id, RecurringExpense.active)
            )
        )
        .scalars()
        .all()
    )
    recurring_lines = []
    for r in recurring_rows:
        mult = {"monthly": 1, "weekly": 4.33, "bi-weekly": 2.17, "yearly": 1 / 12}.get(r.frequency, 1)
        monthly_eq = float(r.amount or 0) * mult
        recurring_lines.append(f"  {r.name:25s} ₹{float(r.amount or 0):<8.0f} {r.frequency:12s} → ₹{monthly_eq:.0f}/mo")
    recurring_str = "\n".join(recurring_lines) if recurring_lines else "No recurring expenses."

    user_prompt = USER_ADAPTIVE_PLAN_TEMPLATE.format(
        income_profile=json.dumps(income_profile, indent=2),
        category_breakdown=_category_rows(breakdown),
        existing_budgets=_budget_rows(budgets_data),
        goals=json.dumps(goals_list, indent=2) if goals_list else "No active goals",
        recurring=recurring_str,
    )

    client = await llm_client.get_user_client(current_user.id) or llm_client
    raw, provider, model_name, tokens_in, tokens_out = await client.chat(system_prompt=SYSTEM_ADAPTIVE_PLAN, user_prompt=user_prompt, max_tokens=1500, timeout=30.0)
    try:
        await record_llm_spend(
            db, current_user.id, provider, model_name,
            tokens_in=tokens_in, tokens_out=tokens_out,
            estimated_cost=_compute_cost(provider, model_name, tokens_in, tokens_out),
        )
        await db.flush()
    except Exception:
        logger.warning("Failed to record LLM spend for budget endpoint", exc_info=True)
    parsed = _maybe_parse_json(raw)
    return parsed or {"error": "Could not parse LLM response", "raw": raw}


# ── Endpoint 6: Budget Health Check ──────────────────────────
@router.post("/budgets/llm/health-check")
async def budget_health_check(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    today = date.today()
    start_of_month = today.replace(day=1)
    days_elapsed = today.day

    summary = await _compute_summary(start_of_month, today, None, current_user.id, db)
    budgets_data = await _compute_budgets(current_user.id, db)

    # Previous month for comparison
    prev_start = (start_of_month - timedelta(days=1)).replace(day=1)
    prev_end = start_of_month - timedelta(days=1)
    prev_summary = await _compute_summary(prev_start, prev_end, None, current_user.id, db)

    # Goals
    goals_rows = (await db.execute(select(Goal).where(Goal.user_id == current_user.id, Goal.active))).scalars().all()
    goals_list = []
    for g in goals_rows:
        contrib_sum = (
            await db.execute(select(func.sum(GoalContribution.amount)).where(GoalContribution.goal_id == g.id))
        ).scalar_one() or 0
        goals_list.append(
            {
                "name": g.name,
                "target_amount": float(g.target_amount),
                "current_amount": float(contrib_sum),
                "pct": min(100, round(float(contrib_sum) / float(g.target_amount) * 100, 1))
                if float(g.target_amount) > 0
                else 0,
                "target_date": g.target_date.isoformat() if g.target_date else None,
            }
        )

    table_header = "| Category | Limit | Spent | % Used | Status |"
    table_sep = "|---------|-------|-------|--------|--------|"
    table_rows = []
    for b in budgets_data.get("budgets") or []:
        status = "Over budget" if b["over_budget"] else "On track" if b["pct"] < 80 else "Near limit"
        table_rows.append(
            f"| {b['category']:15s} | ₹{b['monthly_limit']:<6.0f} | ₹{b['spent_this_month']:<6.0f} | {b['pct']:5.1f}% | {status:11s} |"
        )
    budgets_table = "\n".join([table_header, table_sep] + table_rows) if table_rows else "No budgets set."

    previous_comparison = {}
    for b in budgets_data.get("budgets") or []:
        cat = b["category"]
        # naive month-over-month — not exact but good enough for the LLM
        previous_comparison[cat] = {"current": b["spent_this_month"], "previous": "N/A"}

    total_budgeted = sum(b["monthly_limit"] for b in (budgets_data.get("budgets") or []))
    income = summary.get("total_income", 0)
    total_spent = summary.get("total_expenses", 0)
    projected = round(total_spent / max(days_elapsed, 1) * 30)

    user_prompt = USER_HEALTH_CHECK_TEMPLATE.format(
        current_month=today.strftime("%B %Y"),
        days_elapsed=days_elapsed,
        budgets_table=budgets_table,
        income_this_month=income,
        last_month_income=prev_summary.get("total_income", 0),
        total_spent=total_spent,
        projected_month_end=projected,
        total_budgeted=total_budgeted,
        previous_comparison=json.dumps(previous_comparison, indent=2),
        goals=_goal_rows(goals_list) if goals_list else "No active goals",
    )

    client = await llm_client.get_user_client(current_user.id) or llm_client
    raw, provider, model_name, tokens_in, tokens_out = await client.chat(system_prompt=SYSTEM_HEALTH_CHECK, user_prompt=user_prompt, max_tokens=1200, timeout=25.0)
    try:
        await record_llm_spend(
            db, current_user.id, provider, model_name,
            tokens_in=tokens_in, tokens_out=tokens_out,
            estimated_cost=_compute_cost(provider, model_name, tokens_in, tokens_out),
        )
        await db.flush()
    except Exception:
        logger.warning("Failed to record LLM spend for budget endpoint", exc_info=True)
    parsed = _maybe_parse_json(raw)
    if parsed:
        if parsed.get("projection"):
            parsed["projection"]["month_end_spend"] = max(0, parsed["projection"].get("month_end_spend", 0))
        return parsed
    return {"error": "Could not parse LLM response", "raw": raw}
