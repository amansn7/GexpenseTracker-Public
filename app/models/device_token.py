"""DeviceToken — push notification tokens for mobile clients.
RefreshTokenBlacklist — invalidated refresh JWTs (by jti claim).
"""
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, _utcnow, _uuid_col


class DeviceToken(Base):
    """Push-notification device token registered by a mobile client."""

    __tablename__ = "device_tokens"

    id: Mapped[str] = _uuid_col()
    user_id: Mapped[str] = mapped_column(
        sa.String(36),
        sa.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    token: Mapped[str] = mapped_column(sa.String(512), nullable=False, unique=True)
    platform: Mapped[str] = mapped_column(sa.String(20), nullable=False)  # "ios" | "android"
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True), default=_utcnow, nullable=False
    )


class RefreshTokenBlacklist(Base):
    """Blacklisted refresh token JTIs (set on logout with Bearer auth)."""

    __tablename__ = "refresh_token_blacklist"

    id: Mapped[str] = _uuid_col()
    user_id: Mapped[str] = mapped_column(
        sa.String(36),
        sa.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    jti: Mapped[str] = mapped_column(sa.String(64), nullable=False, unique=True, index=True)
    blacklisted_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True), default=_utcnow, nullable=False
    )
