from datetime import date, datetime
from enum import Enum as PyEnum
from enum import StrEnum
from typing import Optional

import sqlalchemy as sa
from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, _utcnow, _uuid_col


class UserRole(StrEnum):
    owner = "owner"
    member = "member"


class UserStatus(StrEnum):
    invited = "invited"
    active = "active"
    disabled = "disabled"


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = _uuid_col()
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    role: Mapped[str] = mapped_column(
        String(20), default=UserRole.member, nullable=False, server_default=UserRole.member.value
    )
    status: Mapped[str] = mapped_column(
        String(20), default=UserStatus.invited, nullable=False, server_default=UserStatus.invited.value
    )
    onboarding_complete: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, server_default="0")
    totp_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, server_default="0")
    totp_secret: Mapped[str | None] = mapped_column(String(256), nullable=True)
    totp_secret_pending: Mapped[str | None] = mapped_column(String(256), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)
    scheduled_deletion_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    trial_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    trial_ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    profile: Mapped[Optional["UserProfile"]] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    settings: Mapped[Optional["UserSettings"]] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    connected_accounts: Mapped[list["ConnectedAccount"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    categories: Mapped[list["UserCategory"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    ai_services: Mapped[list["UserAIService"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class UserProfile(Base):
    __tablename__ = "user_profiles"

    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[str | None] = mapped_column(String(120))
    phone: Mapped[str | None] = mapped_column(String(40))
    location: Mapped[str | None] = mapped_column(String(120))
    avatar_url: Mapped[str | None] = mapped_column(String(500))
    default_currency: Mapped[str] = mapped_column(String(3), default="INR", nullable=False, server_default="INR")
    timezone: Mapped[str] = mapped_column(
        String(80), default="Asia/Kolkata", nullable=False, server_default="Asia/Kolkata"
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    user: Mapped["User"] = relationship(back_populates="profile")


class UserSettings(Base):
    __tablename__ = "user_settings"

    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    daily_digest: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, server_default="1")
    low_confidence_alerts: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, server_default="1")
    auto_categorize: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, server_default="1")
    show_confidence: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, server_default="1")
    sound_effects: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, server_default="0")
    two_factor_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, server_default="0")
    confidence_threshold: Mapped[int] = mapped_column(Integer, default=70, nullable=False, server_default="70")
    use_rule_engine: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, server_default="1")
    monthly_ai_budget: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    active_ai_service_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    digest_hour: Mapped[int] = mapped_column(Integer, default=9, nullable=False, server_default="9")
    allowed_emails: Mapped[str | None] = mapped_column(Text, nullable=True)
    starting_balance: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    starting_balance_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    salary_shift_enabled: Mapped[bool] = mapped_column(sa.Boolean, default=False, nullable=False, server_default="0")
    salary_shift_window: Mapped[int] = mapped_column(sa.Integer, default=3, nullable=False, server_default="3")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    user: Mapped["User"] = relationship(back_populates="settings")


class ConnectedAccount(Base):
    __tablename__ = "connected_accounts"

    id: Mapped[str] = _uuid_col()
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    provider: Mapped[str] = mapped_column(String(40), nullable=False)
    account_email: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), default="disconnected", nullable=False, server_default="disconnected"
    )
    external_id: Mapped[str | None] = mapped_column(String(255))
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)
    access_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    refresh_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    token_expiry: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped["User"] = relationship(back_populates="connected_accounts")

    __table_args__ = (
        sa.UniqueConstraint("user_id", "provider", "account_email", name="uq_connected_account_user_provider_email"),
    )


class UserCategory(Base):
    __tablename__ = "user_categories"

    id: Mapped[str] = _uuid_col()
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    color: Mapped[str] = mapped_column(String(20), default="#dcd5c3", nullable=False, server_default="#dcd5c3")
    icon: Mapped[str | None] = mapped_column(String(40))
    kind: Mapped[str] = mapped_column(String(20), default="expense", nullable=False, server_default="expense")
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, server_default="1")
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    user: Mapped["User"] = relationship(back_populates="categories")

    __table_args__ = (sa.UniqueConstraint("user_id", "name", name="uq_user_category_name"),)


class UserAIService(Base):
    __tablename__ = "user_ai_services"

    id: Mapped[str] = _uuid_col()
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    provider: Mapped[str] = mapped_column(String(60), nullable=False)
    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    model_id: Mapped[str] = mapped_column(String(160), nullable=False)
    base_url: Mapped[str | None] = mapped_column(String(500))
    auth_header: Mapped[str] = mapped_column(String(40), default="bearer", nullable=False, server_default="bearer")
    api_key_hint: Mapped[str | None] = mapped_column(String(40))
    encrypted_api_key: Mapped[str | None] = mapped_column(Text)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, server_default="1")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)
    last_rotated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    key_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rotation_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, server_default="0")

    user: Mapped["User"] = relationship(back_populates="ai_services")


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[str] = _uuid_col()
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token: Mapped[bytes] = mapped_column(sa.LargeBinary(32), nullable=False, unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_rotated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class OAuthState(Base):
    __tablename__ = "oauth_states"

    id: Mapped[str] = _uuid_col()
    state: Mapped[str] = mapped_column(String(256), nullable=False, unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
