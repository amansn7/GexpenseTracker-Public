from datetime import date, datetime
from enum import Enum as PyEnum
from enum import StrEnum
from typing import Optional

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Index, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, _utcnow, _uuid_col


class Label(StrEnum):
    expense = "expense"
    income = "income"
    ignore = "ignore"
    self_transfer = "self_transfer"


class TransactionType(StrEnum):
    purchase = "purchase"
    cc_payment = "cc_payment"
    transfer = "transfer"
    investment = "investment"
    income = "income"


class TransactionStatus(StrEnum):
    auto = "auto"
    confirmed = "confirmed"
    corrected = "corrected"
    needs_review = "needs_review"


class ClassifierMethod(StrEnum):
    rule = "rule"
    llm = "llm"


class Transaction(Base):
    __tablename__ = "transactions"
    __table_args__ = (
        UniqueConstraint("email_id", name="uq_transactions_email_id"),
        Index("ix_transactions_email_id_txn_date", "email_id", "txn_date"),
        Index("ix_transactions_email_id_created_at", "email_id", "created_at"),
        Index("ix_transactions_txn_date_id", "txn_date", "id"),
    )

    id: Mapped[str] = _uuid_col()
    email_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("emails.id", ondelete="CASCADE"), nullable=True, index=True)
    label: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    transaction_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    payment_mode: Mapped[str | None] = mapped_column(String(20), nullable=True)
    amount: Mapped[float | None] = mapped_column(Numeric(12, 2))
    currency: Mapped[str] = mapped_column(String(3), default="INR")
    merchant: Mapped[str | None] = mapped_column(String(255))
    category: Mapped[str | None] = mapped_column(String(100))
    txn_date: Mapped[date | None] = mapped_column(Date, index=True)
    confidence: Mapped[float | None] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(20), default=TransactionStatus.needs_review, index=True)
    classifier_method: Mapped[str | None] = mapped_column(String(10))
    user_notes: Mapped[str | None] = mapped_column(Text)
    read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, server_default="0")
    flagged: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    email: Mapped[Optional["Email"]] = relationship(back_populates="transaction")


class ClassificationLog(Base):
    # Audit log — always queried directly, no ORM relationship needed
    __tablename__ = "classification_log"
    __table_args__ = (
        Index("ix_classification_log_email_id", "email_id"),
        Index("ix_classification_log_created_at", "created_at"),
    )

    id: Mapped[str] = _uuid_col()
    email_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("emails.id"), nullable=True)
    sender_domain: Mapped[str | None] = mapped_column(String(255))
    subject: Mapped[str | None] = mapped_column(Text)
    body_snippet: Mapped[str | None] = mapped_column(Text)
    provider: Mapped[str | None] = mapped_column(String(50))
    model: Mapped[str | None] = mapped_column(String(100))
    latency_ms: Mapped[int | None] = mapped_column(Integer)
    llm_label: Mapped[str | None] = mapped_column(String(20))
    llm_amount: Mapped[float | None] = mapped_column(Numeric(12, 2))
    llm_merchant: Mapped[str | None] = mapped_column(String(255))
    llm_category: Mapped[str | None] = mapped_column(String(100))
    llm_confidence: Mapped[float | None] = mapped_column(Float)
    llm_txn_date: Mapped[date | None] = mapped_column(Date)
    raw_response: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
