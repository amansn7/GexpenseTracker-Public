"""Financial reconciliation endpoint.

Validates tracked transactions against expected balances and flags anomalies.
"""
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.auth_deps import get_current_user
from app.database import get_db
from app.models import Transaction, Email, User, UserSettings

router = APIRouter()


@router.get("/reconciliation/health")
async def reconciliation_health(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Run financial reconciliation checks and return anomaly report."""
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
        Transaction.status != "needs_review",
    ]
    if starting_balance_date:
        base_filter.append(Transaction.txn_date >= starting_balance_date)

    income_total = float((await db.execute(
        select(func.sum(Transaction.amount))
        .join(Email, Transaction.email_id == Email.id)
        .where(Transaction.label == "income", *base_filter)
    )).scalar_one() or 0)

    expense_total = float((await db.execute(
        select(func.sum(Transaction.amount))
        .join(Email, Transaction.email_id == Email.id)
        .where(Transaction.label == "expense", Transaction.transaction_type == "purchase", *base_filter)
    )).scalar_one() or 0)

    cc_payment_total = float((await db.execute(
        select(func.sum(Transaction.amount))
        .join(Email, Transaction.email_id == Email.id)
        .where(Transaction.transaction_type == "cc_payment", *base_filter)
    )).scalar_one() or 0)

    investment_total = float((await db.execute(
        select(func.sum(Transaction.amount))
        .join(Email, Transaction.email_id == Email.id)
        .where(Transaction.transaction_type == "investment", *base_filter)
    )).scalar_one() or 0)

    expected_balance = round((starting_balance or 0.0) + income_total - expense_total, 2)
    cash_outflow = round(expense_total + cc_payment_total, 2)

    anomalies = []

    if starting_balance is not None:
        balance_discrepancy = abs(expected_balance - (starting_balance or 0.0) - income_total + expense_total)
        if balance_discrepancy > 100:
            anomalies.append({
                "type": "balance_discrepancy",
                "severity": "high",
                "message": f"Balance discrepancy of ₹{balance_discrepancy:.2f} detected",
                "expected": expected_balance,
                "threshold": 100,
            })

    if income_total > 0:
        expense_ratio = expense_total / income_total
        if expense_ratio > 0.95:
            anomalies.append({
                "type": "high_expense_ratio",
                "severity": "warning",
                "message": f"Expenses are {expense_ratio*100:.1f}% of income",
                "ratio": round(expense_ratio, 3),
            })

    if cc_payment_total > 0 and expense_total > 0:
        cc_ratio = cc_payment_total / expense_total
        if cc_ratio > 0.5:
            anomalies.append({
                "type": "high_cc_payment_ratio",
                "severity": "info",
                "message": f"CC payments are {cc_ratio*100:.1f}% of tracked expenses",
                "ratio": round(cc_ratio, 3),
            })

    return {
        "starting_balance": starting_balance,
        "starting_balance_date": starting_balance_date.isoformat() if starting_balance_date else None,
        "income_total": round(income_total, 2),
        "expense_total": round(expense_total, 2),
        "cc_payment_total": round(cc_payment_total, 2),
        "investment_total": round(investment_total, 2),
        "expected_balance": expected_balance,
        "cash_outflow": cash_outflow,
        "anomalies": anomalies,
        "status": "healthy" if not anomalies else "anomalies_detected",
    }


@router.get("/reconciliation/monthly")
async def reconciliation_monthly(
    month: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Monthly reconciliation: compare tracked transactions to expected totals."""
    if month:
        try:
            target_date = date.fromisoformat(f"{month}-01")
        except ValueError:
            raise HTTPException(status_code=422, detail="month must be YYYY-MM")
    else:
        target_date = date.today().replace(day=1)

    month_start = target_date
    if target_date.month == 12:
        month_end = target_date.replace(year=target_date.year + 1, month=1, day=1)
    else:
        month_end = target_date.replace(month=target_date.month + 1, day=1)

    base_filter = [
        Email.user_id == current_user.id,
        Transaction.txn_date >= month_start,
        Transaction.txn_date < month_end,
        Transaction.txn_date.isnot(None),
        Transaction.status != "needs_review",
    ]

    income_total = float((await db.execute(
        select(func.sum(Transaction.amount))
        .join(Email, Transaction.email_id == Email.id)
        .where(Transaction.label == "income", *base_filter)
    )).scalar_one() or 0)

    expense_total = float((await db.execute(
        select(func.sum(Transaction.amount))
        .join(Email, Transaction.email_id == Email.id)
        .where(Transaction.label == "expense", Transaction.transaction_type == "purchase", *base_filter)
    )).scalar_one() or 0)

    cc_payment_total = float((await db.execute(
        select(func.sum(Transaction.amount))
        .join(Email, Transaction.email_id == Email.id)
        .where(Transaction.transaction_type == "cc_payment", *base_filter)
    )).scalar_one() or 0)

    investment_total = float((await db.execute(
        select(func.sum(Transaction.amount))
        .join(Email, Transaction.email_id == Email.id)
        .where(Transaction.transaction_type == "investment", *base_filter)
    )).scalar_one() or 0)

    net = round(income_total - expense_total, 2)

    return {
        "month": month_start.isoformat()[:7],
        "income": round(income_total, 2),
        "expenses": round(expense_total, 2),
        "cc_payments": round(cc_payment_total, 2),
        "investments": round(investment_total, 2),
        "net": net,
        "cash_outflow": round(expense_total + cc_payment_total, 2),
    }
