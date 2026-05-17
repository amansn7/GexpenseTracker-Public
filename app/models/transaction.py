from datetime import datetime, date
from enum import Enum as PyEnum
from typing import Optional
from sqlalchemy import String, Text, Numeric, Float, DateTime, Date, Integer, Boolean, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, _uuid_col, _utcnow


class Label(str, PyEnum):
    expense = "expense"
    income = "income"
    ignore = "ignore"


class TransactionType(str, PyEnum):
    purchase = "purchase"
    cc_payment = "cc_payment"
    transfer = "transfer"
    investment = "investment"
    income = "income"


class TransactionStatus(str, PyEnum):
    auto = "auto"
    confirmed = "confirmed"
    corrected = "corrected"
    needs_review = "needs_review"


class ClassifierMethod(str, PyEnum):
    rule = "rule"
    llm = "llm"


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[str] = _uuid_col()
    email_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("emails.id"), nullable=True)
    label: Mapped[str] = mapped_column(String(20), nullable=False)
    transaction_type: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    payment_mode: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    amount: Mapped[Optional[float]] = mapped_column(Numeric(12, 2))
    currency: Mapped[str] = mapped_column(String(3), default="INR")
    merchant: Mapped[Optional[str]] = mapped_column(String(255))
    category: Mapped[Optional[str]] = mapped_column(String(100))
    txn_date: Mapped[Optional[date]] = mapped_column(Date)
    confidence: Mapped[Optional[float]] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(20), default=TransactionStatus.needs_review)
    classifier_method: Mapped[Optional[str]] = mapped_column(String(10))
    user_notes: Mapped[Optional[str]] = mapped_column(Text)
    read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, server_default="0")
    flagged: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    email: Mapped[Optional["Email"]] = relationship(back_populates="transaction")


class ClassificationLog(Base):
    # Audit log — always queried directly, no ORM relationship needed
    __tablename__ = "classification_log"

    id: Mapped[str] = _uuid_col()
    email_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("emails.id"), nullable=True)
    sender_domain: Mapped[Optional[str]] = mapped_column(String(255))
    subject: Mapped[Optional[str]] = mapped_column(Text)
    body_snippet: Mapped[Optional[str]] = mapped_column(Text)
    provider: Mapped[Optional[str]] = mapped_column(String(50))
    model: Mapped[Optional[str]] = mapped_column(String(100))
    latency_ms: Mapped[Optional[int]] = mapped_column(Integer)
    llm_label: Mapped[Optional[str]] = mapped_column(String(20))
    llm_amount: Mapped[Optional[float]] = mapped_column(Numeric(12, 2))
    llm_merchant: Mapped[Optional[str]] = mapped_column(String(255))
    llm_category: Mapped[Optional[str]] = mapped_column(String(100))
    llm_confidence: Mapped[Optional[float]] = mapped_column(Float)
    llm_txn_date: Mapped[Optional[date]] = mapped_column(Date)
    raw_response: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

