"""Financial reconciliation endpoint.

Validates tracked transactions against expected balances and flags anomalies.
"""
import re
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth_deps import get_current_user
from app.database import get_db
from app.models import Email, Transaction, User, UserSettings

router = APIRouter()

_CC_MERCHANT_PATTERNS = [
    re.compile(r"hdfc.*credit.*card", re.I),
    re.compile(r"icici.*credit.*card", re.I),
    re.compile(r"sbi.*card", re.I),
    re.compile(r"axis.*credit.*card", re.I),
    re.compile(r"kotak.*credit.*card", re.I),
    re.compile(r"american.?express", re.I),
    re.compile(r"amex", re.I),
    re.compile(r"au.?small.?finance.*credit", re.I),
    re.compile(r"idfc.*credit.*card", re.I),
    re.compile(r"yes.?bank.*credit.*card", re.I),
    re.compile(r"indusind.*credit.*card", re.I),
    re.compile(r"rbl.*credit.*card", re.I),
    re.compile(r"cc.?payment", re.I),
    re.compile(r"credit.?card.?payment", re.I),
    re.compile(r"citi.*credit.*card", re.I),
]

_CC_NAME_MAP = {
    "hdfc": "HDFC Bank Credit Card",
    "icici": "ICICI Bank Credit Card",
    "sbi": "SBI Card",
    "axis": "Axis Bank Credit Card",
    "kotak": "Kotak Credit Card",
    "american express": "American Express",
    "amex": "American Express",
    "au small finance": "AU Small Finance Credit Card",
    "idfc": "IDFC First Credit Card",
    "yes bank": "Yes Bank Credit Card",
    "indusind": "IndusInd Credit Card",
    "rbl": "RBL Credit Card",
    "citi": "Citi Credit Card",
}


def _detect_cc_account(merchant: str | None) -> str | None:
    """Return a canonical CC account name from a merchant string, or None."""
    if not merchant:
        return None
    for pat in _CC_MERCHANT_PATTERNS:
        m = pat.search(merchant)
        if m:
            key = m.group(0).lower().strip()
            for alias, canonical in _CC_NAME_MAP.items():
                if alias in key:
                    return canonical
            return m.group(0).title()
    return None


class CCStatementRequest(BaseModel):
    month: str
    statement_total: float
    currency: str = "INR"


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

    expected_balance = round((starting_balance or 0.0) + income_total - expense_total - cc_payment_total - investment_total, 2)
    cash_outflow = round(expense_total + cc_payment_total + investment_total, 2)

    anomalies = []

    if starting_balance is not None:
        net_flow = round(income_total - expense_total - cc_payment_total - investment_total, 2)
        balance_discrepancy = abs(net_flow)
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
    month: str | None = None,
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


@router.post("/reconciliation/cc-statement")
async def cc_statement_reconciliation(
    body: CCStatementRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Compare tracked CC purchases against a monthly statement total."""
    try:
        target_date = date.fromisoformat(f"{body.month}-01")
    except ValueError:
        raise HTTPException(status_code=422, detail="month must be YYYY-MM")

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
        Transaction.transaction_type == "purchase",
        Transaction.payment_mode == "credit_card",
    ]

    txn_rows = (await db.execute(
        select(Transaction)
        .join(Email, Transaction.email_id == Email.id)
        .where(*base_filter)
        .order_by(Transaction.amount.desc())
    )).scalars().all()

    tracked_total = sum(float(t.amount or 0) for t in txn_rows)
    tracked_total = round(tracked_total, 2)
    statement_total = round(body.statement_total, 2)
    discrepancy = round(tracked_total - statement_total, 2)
    discrepancy_pct = round((discrepancy / statement_total * 100) if statement_total else 0, 2)
    matched = abs(discrepancy) <= 1.0 or abs(discrepancy_pct) <= 1.0

    flagged = []
    for t in txn_rows:
        reasons = []
        if t.confidence is not None and t.confidence < 0.7:
            reasons.append("low_confidence")
        if t.flagged:
            reasons.append("user_flagged")
        if t.status == "corrected":
            reasons.append("manually_corrected")
        if t.amount is not None and float(t.amount) > statement_total * 0.25 and statement_total > 0:
            reasons.append("large_amount")
        if reasons:
            flagged.append({
                "id": t.id,
                "merchant": t.merchant,
                "amount": float(t.amount) if t.amount else 0,
                "date": t.txn_date.isoformat() if t.txn_date else None,
                "category": t.category,
                "reasons": reasons,
            })

    return {
        "matched": matched,
        "tracked_total": tracked_total,
        "statement_total": statement_total,
        "discrepancy": discrepancy,
        "discrepancy_pct": discrepancy_pct,
        "transaction_count": len(txn_rows),
        "flagged_transactions": flagged,
        "currency": body.currency,
        "month": body.month,
    }


@router.get("/reconciliation/cc-accounts")
async def cc_accounts(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List detected CC accounts from transaction merchant patterns."""
    base_filter = [
        Email.user_id == current_user.id,
        Transaction.merchant.isnot(None),
    ]

    all_txns = (await db.execute(
        select(Transaction)
        .join(Email, Transaction.email_id == Email.id)
        .where(*base_filter)
    )).scalars().all()

    cc_groups: dict[str, dict] = {}

    for t in all_txns:
        acct = _detect_cc_account(t.merchant)
        if not acct:
            continue

        if acct not in cc_groups:
            cc_groups[acct] = {
                "account": acct,
                "last_4": None,
                "total_purchases": 0.0,
                "total_payments": 0.0,
            }

        m = re.search(r"(\d{4})\b", t.merchant)
        if m and not cc_groups[acct]["last_4"]:
            cc_groups[acct]["last_4"] = m.group(1)

        amt = float(t.amount or 0)
        if t.transaction_type == "purchase":
            cc_groups[acct]["total_purchases"] += amt
        elif t.transaction_type == "cc_payment":
            cc_groups[acct]["total_payments"] += amt

    result = []
    for acct in sorted(cc_groups.keys()):
        g = cc_groups[acct]
        result.append({
            "account": g["account"],
            "last_4": g["last_4"],
            "total_purchases": round(g["total_purchases"], 2),
            "total_payments": round(g["total_payments"], 2),
            "net_balance": round(g["total_purchases"] - g["total_payments"], 2),
        })

    return result
