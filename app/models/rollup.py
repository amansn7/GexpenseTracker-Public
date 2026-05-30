import json
from datetime import date, datetime

import sqlalchemy as sa
from sqlalchemy import Date, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, _utcnow, _uuid_col


class PeriodRollup(Base):
    __tablename__ = "period_rollups"

    id: Mapped[str] = _uuid_col()
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    period_type: Mapped[str] = mapped_column(String(10), nullable=False)
    period_key: Mapped[str] = mapped_column(String(7), nullable=False)

    total_income: Mapped[float] = mapped_column(Numeric(12, 2), default=0.0)
    total_expenses: Mapped[float] = mapped_column(Numeric(12, 2), default=0.0)
    total_cc_payments: Mapped[float] = mapped_column(Numeric(12, 2), default=0.0)
    total_investments: Mapped[float] = mapped_column(Numeric(12, 2), default=0.0)
    net_savings: Mapped[float] = mapped_column(Numeric(12, 2), default=0.0)
    savings_rate: Mapped[float] = mapped_column(Numeric(5, 1), default=0.0)

    expenses_by_category: Mapped[str | None] = mapped_column(Text, nullable=True)
    income_by_category: Mapped[str | None] = mapped_column(Text, nullable=True)
    top_merchants: Mapped[str | None] = mapped_column(Text, nullable=True)

    txn_count: Mapped[int] = mapped_column(Integer, default=0)
    unread_count: Mapped[int] = mapped_column(Integer, default=0)
    needs_review_count: Mapped[int] = mapped_column(Integer, default=0)
    flagged_count: Mapped[int] = mapped_column(Integer, default=0)
    subscription_total: Mapped[float] = mapped_column(Numeric(12, 2), default=0.0)
    subscription_count: Mapped[int] = mapped_column(Integer, default=0)

    txn_version: Mapped[int] = mapped_column(Integer, default=0)
    computed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    __table_args__ = (sa.UniqueConstraint("user_id", "period_type", "period_key", name="uq_period_rollup_user_period"),)

    def get_expenses_by_category(self) -> list[dict]:
        return json.loads(self.expenses_by_category) if self.expenses_by_category else []

    def get_income_by_category(self) -> list[dict]:
        return json.loads(self.income_by_category) if self.income_by_category else []

    def get_top_merchants(self) -> list[dict]:
        return json.loads(self.top_merchants) if self.top_merchants else []


class DailySnapshot(Base):
    __tablename__ = "daily_snapshots"

    id: Mapped[str] = _uuid_col()
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    date: Mapped[date] = mapped_column(Date, nullable=False)
    income: Mapped[float] = mapped_column(Numeric(12, 2), default=0.0)
    expenses: Mapped[float] = mapped_column(Numeric(12, 2), default=0.0)
    txn_count: Mapped[int] = mapped_column(Integer, default=0)
    running_balance: Mapped[float] = mapped_column(Numeric(12, 2), default=0.0)
    top_categories: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (sa.UniqueConstraint("user_id", "date", name="uq_daily_snapshot_user_date"),)
