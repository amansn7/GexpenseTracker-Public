from datetime import datetime, date
from enum import Enum as PyEnum
from typing import Optional
from sqlalchemy import String, Text, Numeric, Float, DateTime, Date, Integer, Boolean, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
import sqlalchemy as sa

from .base import Base, _uuid_col, _utcnow


class RuleSource(str, PyEnum):
    builtin = "builtin"
    user_trained = "user_trained"


class Budget(Base):
    __tablename__ = "budgets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    category: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    monthly_limit: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class Debt(Base):
    __tablename__ = "debts"

    id: Mapped[str] = _uuid_col()
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    total_amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    paid_amount: Mapped[float] = mapped_column(Numeric(12, 2), default=0.0, nullable=False)
    interest_rate: Mapped[Optional[float]] = mapped_column(Float)
    target_date: Mapped[Optional[date]] = mapped_column(Date)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class RecurringExpense(Base):
    __tablename__ = "recurring_expenses"

    id: Mapped[str] = _uuid_col()
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    amount: Mapped[Optional[float]] = mapped_column(Numeric(12, 2))
    category: Mapped[Optional[str]] = mapped_column(String(100))
    # monthly | weekly | yearly
    frequency: Mapped[str] = mapped_column(String(20), default="monthly")
    day_of_month: Mapped[Optional[int]] = mapped_column(Integer)   # 1-31, for monthly
    notes: Mapped[Optional[str]] = mapped_column(Text)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class SenderRule(Base):
    __tablename__ = "sender_rules"

    id: Mapped[str] = _uuid_col()
    sender_domain: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    label: Mapped[str] = mapped_column(String(20), nullable=False)
    category: Mapped[Optional[str]] = mapped_column(String(100))
    source: Mapped[str] = mapped_column(String(20), default=RuleSource.builtin)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class MerchantAlias(Base):
    __tablename__ = "merchant_aliases"

    id: Mapped[str] = _uuid_col()
    raw: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    canonical: Mapped[str] = mapped_column(String(255), nullable=False)
    confidence: Mapped[float] = mapped_column(Float, default=1.0)
    source: Mapped[str] = mapped_column(String(20), default="fuzzy_learned")  # seed | fuzzy_learned | user
    hit_count: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class PatternRule(Base):
    __tablename__ = "pattern_rules"

    id: Mapped[str] = _uuid_col()
    regex_pattern: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    label: Mapped[str] = mapped_column(String(20), nullable=False)      # expense | income
    merchant: Mapped[Optional[str]] = mapped_column(String(255))
    category: Mapped[Optional[str]] = mapped_column(String(100))
    confidence: Mapped[float] = mapped_column(Float, default=0.88)
    hit_count: Mapped[int] = mapped_column(Integer, default=0)
    source: Mapped[str] = mapped_column(String(20), default="llm_generated")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class DomainPairRule(Base):
    __tablename__ = "domain_pair_rules"

    id: Mapped[str] = _uuid_col()
    domain_a: Mapped[str] = mapped_column(String(255), nullable=False)
    domain_b: Mapped[str] = mapped_column(String(255), nullable=False)
    confirmed_count: Mapped[int] = mapped_column(Integer, default=0)
    dismissed_count: Mapped[int] = mapped_column(Integer, default=0)
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    auto_resolve: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    __table_args__ = (
        sa.UniqueConstraint("domain_a", "domain_b", name="uq_domain_pair"),
    )


class DuplicatePair(Base):
    __tablename__ = "duplicate_pairs"

    id: Mapped[str] = _uuid_col()
    primary_tx_id: Mapped[str] = mapped_column(String(36), ForeignKey("transactions.id"), nullable=False)
    duplicate_tx_id: Mapped[str] = mapped_column(String(36), ForeignKey("transactions.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    rule_source: Mapped[str] = mapped_column(String(20), nullable=False, default="amount_date")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        sa.UniqueConstraint("primary_tx_id", "duplicate_tx_id", name="uq_duplicate_pair"),
    )
