from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, _utcnow, _uuid_col


class Email(Base):
    __tablename__ = "emails"
    __table_args__ = (Index("ix_emails_user_id_pre_filter_status", "user_id", "pre_filter_status"),)

    id: Mapped[str] = _uuid_col()
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    gmail_id: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    subject: Mapped[str | None] = mapped_column(Text)
    sender: Mapped[str | None] = mapped_column(String(500))
    sender_domain: Mapped[str | None] = mapped_column(String(255), index=True)
    received_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    body_snippet: Mapped[str | None] = mapped_column(Text)
    body_text: Mapped[str | None] = mapped_column(Text)
    gmail_link: Mapped[str | None] = mapped_column(String(500))
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    pre_filter_status: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="passed", default="passed"
    )

    transaction: Mapped[Optional["Transaction"]] = relationship(back_populates="email")


class SyncState(Base):
    __tablename__ = "sync_state"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_history_id: Mapped[str | None] = mapped_column(String(255))
    # all | unread | read
    email_filter: Mapped[str] = mapped_column(String(10), default="all", server_default="all")
