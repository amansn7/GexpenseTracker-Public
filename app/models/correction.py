from sqlalchemy import DateTime, Float, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, _utcnow, _uuid_col


class TransactionCorrection(Base):
    __tablename__ = "transaction_corrections"

    id: Mapped[str] = _uuid_col()
    transaction_id: Mapped[str] = mapped_column(String(36), ForeignKey("transactions.id"), nullable=False)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    old_label: Mapped[str | None] = mapped_column(String(20))
    new_label: Mapped[str | None] = mapped_column(String(20))
    old_category: Mapped[str | None] = mapped_column(String(100))
    new_category: Mapped[str | None] = mapped_column(String(100))
    old_merchant: Mapped[str | None] = mapped_column(String(255))
    new_merchant: Mapped[str | None] = mapped_column(String(255))
    old_amount: Mapped[float | None] = mapped_column(Numeric(12, 2))
    new_amount: Mapped[float | None] = mapped_column(Numeric(12, 2))
    corrected_at: Mapped[object] = mapped_column(DateTime(timezone=True), default=_utcnow)
