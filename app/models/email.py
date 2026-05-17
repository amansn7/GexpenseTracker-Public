from datetime import datetime
from typing import Optional
from sqlalchemy import String, Text, DateTime, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base, _uuid_col, _utcnow


class Email(Base):
    __tablename__ = "emails"

    id: Mapped[str] = _uuid_col()
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    gmail_id: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    subject: Mapped[Optional[str]] = mapped_column(Text)
    sender: Mapped[Optional[str]] = mapped_column(String(500))
    sender_domain: Mapped[Optional[str]] = mapped_column(String(255))
    received_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    body_snippet: Mapped[Optional[str]] = mapped_column(Text)
    body_text: Mapped[Optional[str]] = mapped_column(Text)
    gmail_link: Mapped[Optional[str]] = mapped_column(String(500))
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    pre_filter_status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="passed", default="passed")

    transaction: Mapped[Optional["Transaction"]] = relationship(back_populates="email")


class SyncState(Base):
    __tablename__ = "sync_state"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    user_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    last_synced_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    last_history_id: Mapped[Optional[str]] = mapped_column(String(255))
    # all | unread | read
    email_filter: Mapped[str] = mapped_column(String(10), default="all", server_default="all")
