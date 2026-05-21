from datetime import datetime
from typing import Optional

import sqlalchemy as sa
from sqlalchemy import DateTime, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, _utcnow, _uuid_col


class MerchantAlias(Base):
    """User-defined or global alias mapping a raw name to a canonical merchant."""

    __tablename__ = "merchant_entity_aliases"

    id: Mapped[str] = _uuid_col()
    canonical_name: Mapped[str] = mapped_column(String(255), nullable=False)
    alias_name: Mapped[str] = mapped_column(String(255), nullable=False)
    user_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    __table_args__ = (
        sa.UniqueConstraint("alias_name", "user_id", name="uq_merchant_alias_name_user"),
        Index("ix_merchant_alias_canonical", "canonical_name"),
    )


class MerchantEntity(Base):
    """Canonical merchant entity with optional parent grouping."""

    __tablename__ = "merchant_entities"

    id: Mapped[str] = _uuid_col()
    canonical_name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    parent_entity: Mapped[str | None] = mapped_column(String(255), nullable=True)
    category_hint: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
