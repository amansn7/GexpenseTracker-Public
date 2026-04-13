import uuid
from datetime import UTC, datetime, date
from enum import Enum as PyEnum
from typing import Optional
from sqlalchemy import String, Text, Numeric, Float, DateTime, Date, Integer, Boolean, ForeignKey
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
import sqlalchemy as sa

class Base(DeclarativeBase):
    pass

class Label(str, PyEnum):
    expense = "expense"
    income = "income"
    ignore = "ignore"

class TransactionStatus(str, PyEnum):
    auto = "auto"
    confirmed = "confirmed"
    corrected = "corrected"
    needs_review = "needs_review"

class ClassifierMethod(str, PyEnum):
    rule = "rule"
    llm = "llm"

class RuleSource(str, PyEnum):
    builtin = "builtin"
    user_trained = "user_trained"

def _uuid_col():
    # SQLite-compatible UUID: store as String(36)
    return mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))


def _utcnow() -> datetime:
    return datetime.now(UTC)

class Email(Base):
    __tablename__ = "emails"

    id: Mapped[str] = _uuid_col()
    gmail_id: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    subject: Mapped[Optional[str]] = mapped_column(Text)
    sender: Mapped[Optional[str]] = mapped_column(String(500))
    sender_domain: Mapped[Optional[str]] = mapped_column(String(255))
    received_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    body_snippet: Mapped[Optional[str]] = mapped_column(Text)
    body_text: Mapped[Optional[str]] = mapped_column(Text)
    gmail_link: Mapped[Optional[str]] = mapped_column(String(500))
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    transaction: Mapped[Optional["Transaction"]] = relationship(back_populates="email", uselist=False)

class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[str] = _uuid_col()
    email_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("emails.id"), nullable=True)
    label: Mapped[str] = mapped_column(String(20), nullable=False)
    amount: Mapped[Optional[float]] = mapped_column(Numeric(12, 2))
    currency: Mapped[str] = mapped_column(String(3), default="INR")
    merchant: Mapped[Optional[str]] = mapped_column(String(255))
    category: Mapped[Optional[str]] = mapped_column(String(100))
    txn_date: Mapped[Optional[date]] = mapped_column(Date)
    confidence: Mapped[Optional[float]] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(20), default=TransactionStatus.needs_review)
    classifier_method: Mapped[Optional[str]] = mapped_column(String(10))
    user_notes: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    email: Mapped[Optional["Email"]] = relationship(back_populates="transaction")

class SyncState(Base):
    __tablename__ = "sync_state"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    last_synced_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    last_history_id: Mapped[Optional[str]] = mapped_column(String(255))
    # all | unread | read
    email_filter: Mapped[str] = mapped_column(String(10), default="all", server_default="all")

class SenderRule(Base):
    __tablename__ = "sender_rules"

    id: Mapped[str] = _uuid_col()
    sender_domain: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    label: Mapped[str] = mapped_column(String(20), nullable=False)
    category: Mapped[Optional[str]] = mapped_column(String(100))
    source: Mapped[str] = mapped_column(String(20), default=RuleSource.builtin)
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

class Budget(Base):
    __tablename__ = "budgets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    category: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    monthly_limit: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
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
