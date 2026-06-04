"""Consolidated SQL query builders for stats service.

Replaces 8+ separate sequential queries with at most 3 combined queries
using CASE expressions. Used by recompute_month in stats_service.py and
the summary/confidence/health helpers in api/stats.py.
"""

from sqlalchemy import case, desc, func, or_, select
from sqlalchemy.sql.selectable import Select

from app.models import Email, Transaction


def _expense_conditions(inv_aliases: set[str], card_aliases: set[str],
                        extra=None):
    """SQLAlchemy boolean expression for expense filtering."""
    cond = (
        (Transaction.label == "expense")
        & or_(Transaction.transaction_type == "purchase",
              Transaction.transaction_type.is_(None))
        & (Transaction.status != "needs_review")
    )
    if inv_aliases:
        cond = (
            cond
            & or_(Transaction.category.is_(None),
                  ~func.lower(Transaction.category).in_(inv_aliases))
        )
    if card_aliases:
        cond = (
            cond
            & or_(Transaction.category.is_(None),
                  ~func.lower(Transaction.category).in_(card_aliases))
        )
    if extra:
        cond = cond & extra
    return cond


def _income_conditions():
    return (
        (Transaction.label == "income")
        & (Transaction.status != "needs_review")
    )


def _cc_conditions(card_aliases: set[str]):
    cond = or_(
        Transaction.transaction_type == "cc_payment",
    )
    if card_aliases:
        cond = or_(
            cond,
            func.lower(Transaction.category).in_(card_aliases),
        )
    return cond & (Transaction.status != "needs_review")


def _investment_conditions(inv_aliases: set[str]):
    cond = or_(
        Transaction.transaction_type == "investment",
    )
    if inv_aliases:
        cond = or_(
            cond,
            func.lower(Transaction.category).in_(inv_aliases),
        )
    return cond & (Transaction.status != "needs_review")


# ── Query builders ────────────────────────────────────────────────


def build_aggregation_query(user_id: str, start, end,
                            inv_aliases: set[str] | None = None,
                            card_aliases: set[str] | None = None) -> Select:
    """Single combined query for rollup month aggregation.

    Returns columns: txn_count, total_expenses, total_income, cc_payments,
    cc_count, investments, inv_count, flagged_count, unread_count,
    needs_review_count.
    """
    if inv_aliases is None:
        inv_aliases = set()
    if card_aliases is None:
        card_aliases = set()

    base = [
        Email.user_id == user_id,
        Transaction.txn_date >= start,
        Transaction.txn_date <= end,
        Transaction.txn_date.isnot(None),
    ]

    return (
        select(
            func.count(Transaction.id).label("txn_count"),
            func.sum(case(
                (_expense_conditions(inv_aliases, card_aliases),
                 Transaction.amount),
                else_=0,
            )).label("total_expenses"),
            func.sum(case(
                (_income_conditions(), Transaction.amount),
                else_=0,
            )).label("total_income"),
            func.sum(case(
                (_cc_conditions(card_aliases), Transaction.amount),
                else_=0,
            )).label("cc_payments"),
            func.sum(case(
                (_cc_conditions(card_aliases), 1),
                else_=0,
            )).label("cc_count"),
            func.sum(case(
                (_investment_conditions(inv_aliases), Transaction.amount),
                else_=0,
            )).label("investments"),
            func.sum(case(
                (_investment_conditions(inv_aliases), 1),
                else_=0,
            )).label("inv_count"),
            func.sum(case(
                (Transaction.flagged, 1), else_=0,
            )).label("flagged_count"),
            func.sum(case(
                (~Transaction.read, 1), else_=0,
            )).label("unread_count"),
            func.sum(case(
                (Transaction.status == "needs_review", 1), else_=0,
            )).label("needs_review_count"),
        )
        .join(Email, Transaction.email_id == Email.id)
        .where(*base)
    )


def build_summary_aggregation_query(user_id: str, start, end,
                                    category: str | None = None,
                                    inv_aliases: set[str] | None = None,
                                    card_aliases: set[str] | None = None
                                    ) -> Select:
    """Combined aggregation query for the summary API endpoint.

    Like build_aggregation_query but supports an optional category filter on
    expenses.  Returns the same financial columns (excluding flagged / unread /
    needs_review which are computed globally for the summary endpoint).
    """
    if inv_aliases is None:
        inv_aliases = set()
    if card_aliases is None:
        card_aliases = set()

    base = [
        Email.user_id == user_id,
        Transaction.txn_date >= start,
        Transaction.txn_date <= end,
        Transaction.txn_date.isnot(None),
    ]

    # Build expense condition with optional category filter
    extra_cond = None
    if category:
        from app.services.category_service import CategoryService
        if category == "other":
            other_aliases = CategoryService.filter_aliases("other")
            all_known = CategoryService.all_known_values()
            extra_cond = or_(
                Transaction.category.is_(None),
                func.lower(Transaction.category).in_(other_aliases),
                ~func.lower(Transaction.category).in_(all_known),
            )
        else:
            aliases = CategoryService.filter_aliases(category)
            extra_cond = func.lower(Transaction.category).in_(aliases)

    return (
        select(
            func.sum(case(
                (_expense_conditions(inv_aliases, card_aliases, extra_cond),
                 Transaction.amount),
                else_=0,
            )).label("total_expenses"),
            func.sum(case(
                (_income_conditions(), Transaction.amount),
                else_=0,
            )).label("total_income"),
            func.sum(case(
                (_cc_conditions(card_aliases), Transaction.amount),
                else_=0,
            )).label("cc_payments"),
            func.sum(case(
                (_cc_conditions(card_aliases), 1),
                else_=0,
            )).label("cc_count"),
            func.sum(case(
                (_investment_conditions(inv_aliases), Transaction.amount),
                else_=0,
            )).label("investments"),
            func.sum(case(
                (_investment_conditions(inv_aliases), 1),
                else_=0,
            )).label("inv_count"),
        )
        .join(Email, Transaction.email_id == Email.id)
        .where(*base)
    )


def build_category_breakdown_query(user_id: str, start, end,
                                   inv_aliases: set[str] | None = None,
                                   card_aliases: set[str] | None = None
                                   ) -> Select:
    """Expense category breakdown."""
    if inv_aliases is None:
        inv_aliases = set()
    if card_aliases is None:
        card_aliases = set()

    base = [
        Email.user_id == user_id,
        Transaction.txn_date >= start,
        Transaction.txn_date <= end,
        Transaction.txn_date.isnot(None),
        Transaction.label == "expense",
        or_(Transaction.transaction_type == "purchase",
            Transaction.transaction_type.is_(None)),
        Transaction.status != "needs_review",
    ]
    if inv_aliases:
        base.append(
            or_(Transaction.category.is_(None),
                ~func.lower(Transaction.category).in_(inv_aliases))
        )
    if card_aliases:
        base.append(
            or_(Transaction.category.is_(None),
                ~func.lower(Transaction.category).in_(card_aliases))
        )

    return (
        select(
            Transaction.category,
            func.sum(Transaction.amount).label("total"),
            func.count(Transaction.id).label("txn_count"),
        )
        .join(Email, Transaction.email_id == Email.id)
        .where(*base)
        .group_by(Transaction.category)
        .order_by(desc("total"))
    )


def build_income_breakdown_query(user_id: str, start, end) -> Select:
    """Income category breakdown."""
    return (
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


def build_top_merchants_query(user_id: str, start, end,
                              inv_aliases: set[str] | None = None,
                              card_aliases: set[str] | None = None
                              ) -> Select:
    """Top merchants query (limit 8)."""
    if inv_aliases is None:
        inv_aliases = set()
    if card_aliases is None:
        card_aliases = set()

    base = [
        Email.user_id == user_id,
        Transaction.txn_date >= start,
        Transaction.txn_date <= end,
        Transaction.txn_date.isnot(None),
        Transaction.label == "expense",
        or_(Transaction.transaction_type == "purchase",
            Transaction.transaction_type.is_(None)),
        Transaction.status != "needs_review",
        Transaction.merchant.isnot(None),
    ]
    if inv_aliases:
        base.append(
            or_(Transaction.category.is_(None),
                ~func.lower(Transaction.category).in_(inv_aliases))
        )
    if card_aliases:
        base.append(
            or_(Transaction.category.is_(None),
                ~func.lower(Transaction.category).in_(card_aliases))
        )

    return (
        select(Transaction.merchant, func.sum(Transaction.amount).label("total"))
        .join(Email, Transaction.email_id == Email.id)
        .where(*base)
        .group_by(Transaction.merchant)
        .order_by(desc("total"))
        .limit(8)
    )


def build_confidence_query(user_id: str,
                           high_threshold: float = 0.9) -> Select:
    """Single query computing all confidence aggregates.

    Columns: total, auto_confirmed, corrected, needs_review, high_confidence.
    """
    return (
        select(
            func.count(Transaction.id).label("total"),
            func.sum(case(
                (Transaction.status == "confirmed", 1), else_=0,
            )).label("auto_confirmed"),
            func.sum(case(
                (Transaction.status == "corrected", 1), else_=0,
            )).label("corrected"),
            func.sum(case(
                (Transaction.status == "needs_review", 1), else_=0,
            )).label("needs_review"),
            func.sum(case(
                (Transaction.confidence >= high_threshold, 1), else_=0,
            )).label("high_confidence"),
        )
        .select_from(Transaction)
        .join(Email, Transaction.email_id == Email.id)
        .where(
            Email.user_id == user_id,
            Transaction.confidence.isnot(None),
        )
    )


def build_health_aggregation_query(user_id: str,
                                   inv_aliases: set[str] | None = None,
                                   extra_filters: list | None = None
                                   ) -> Select:
    """Combined aggregation query for health endpoint (all-time sums).

    Columns: total_expenses, total_cc, total_investments, total_income.
    """
    if inv_aliases is None:
        inv_aliases = set()

    base = [
        Email.user_id == user_id,
        Transaction.txn_date.isnot(None),
        Transaction.status != "needs_review",
    ]
    if extra_filters:
        base.extend(extra_filters)

    expense_cond = (
        (Transaction.label == "expense")
        & or_(Transaction.transaction_type == "purchase",
              Transaction.transaction_type.is_(None))
    )
    if inv_aliases:
        expense_cond = expense_cond & or_(
            Transaction.category.is_(None),
            ~func.lower(Transaction.category).in_(inv_aliases),
        )

    inv_cond = Transaction.transaction_type == "investment"
    if inv_aliases:
        inv_cond = or_(inv_cond, func.lower(Transaction.category).in_(inv_aliases))

    return (
        select(
            func.sum(case(
                (expense_cond, Transaction.amount), else_=0,
            )).label("total_expenses"),
            func.sum(case(
                (Transaction.transaction_type == "cc_payment",
                 Transaction.amount), else_=0,
            )).label("total_cc"),
            func.sum(case(
                (inv_cond, Transaction.amount), else_=0,
            )).label("total_investments"),
            func.sum(case(
                (Transaction.label == "income", Transaction.amount), else_=0,
            )).label("total_income"),
        )
        .join(Email, Transaction.email_id == Email.id)
        .where(*base)
    )
