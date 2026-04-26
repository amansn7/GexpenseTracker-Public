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

class UserRole(str, PyEnum):
    owner = "owner"
    member = "member"

class UserStatus(str, PyEnum):
    invited = "invited"
    active = "active"
    disabled = "disabled"

def _uuid_col():
    # SQLite-compatible UUID: store as String(36)
    return mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))


def _utcnow() -> datetime:
    return datetime.now(UTC)

class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = _uuid_col()
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(20), default=UserRole.member, nullable=False, server_default=UserRole.member.value)
    status: Mapped[str] = mapped_column(String(20), default=UserStatus.invited, nullable=False, server_default=UserStatus.invited.value)
    onboarding_complete: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    profile: Mapped[Optional["UserProfile"]] = relationship(back_populates="user", uselist=False, cascade="all, delete-orphan")
    settings: Mapped[Optional["UserSettings"]] = relationship(back_populates="user", uselist=False, cascade="all, delete-orphan")
    connected_accounts: Mapped[list["ConnectedAccount"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    categories: Mapped[list["UserCategory"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    ai_services: Mapped[list["UserAIService"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class UserProfile(Base):
    __tablename__ = "user_profiles"

    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[Optional[str]] = mapped_column(String(120))
    phone: Mapped[Optional[str]] = mapped_column(String(40))
    location: Mapped[Optional[str]] = mapped_column(String(120))
    avatar_url: Mapped[Optional[str]] = mapped_column(String(500))
    default_currency: Mapped[str] = mapped_column(String(3), default="INR", nullable=False, server_default="INR")
    timezone: Mapped[str] = mapped_column(String(80), default="Asia/Kolkata", nullable=False, server_default="Asia/Kolkata")
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
    monthly_ai_budget: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    active_ai_service_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    digest_hour: Mapped[int] = mapped_column(Integer, default=9, nullable=False, server_default="9")
    allowed_emails: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    starting_balance: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    starting_balance_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    user: Mapped["User"] = relationship(back_populates="settings")


class ConnectedAccount(Base):
    __tablename__ = "connected_accounts"

    id: Mapped[str] = _uuid_col()
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    provider: Mapped[str] = mapped_column(String(40), nullable=False)
    account_email: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="disconnected", nullable=False, server_default="disconnected")
    external_id: Mapped[Optional[str]] = mapped_column(String(255))
    last_synced_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)
    access_token: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    refresh_token: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    token_expiry: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped["User"] = relationship(back_populates="connected_accounts")

    __table_args__ = (
        sa.UniqueConstraint("user_id", "provider", "account_email", name="uq_connected_account_user_provider_email"),
    )


class UserCategory(Base):
    __tablename__ = "user_categories"

    id: Mapped[str] = _uuid_col()
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    color: Mapped[str] = mapped_column(String(20), default="#dcd5c3", nullable=False, server_default="#dcd5c3")
    icon: Mapped[Optional[str]] = mapped_column(String(40))
    kind: Mapped[str] = mapped_column(String(20), default="expense", nullable=False, server_default="expense")
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, server_default="1")
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    user: Mapped["User"] = relationship(back_populates="categories")

    __table_args__ = (
        sa.UniqueConstraint("user_id", "name", name="uq_user_category_name"),
    )


class UserAIService(Base):
    __tablename__ = "user_ai_services"

    id: Mapped[str] = _uuid_col()
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    provider: Mapped[str] = mapped_column(String(60), nullable=False)
    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    model_id: Mapped[str] = mapped_column(String(160), nullable=False)
    base_url: Mapped[Optional[str]] = mapped_column(String(500))
    auth_header: Mapped[str] = mapped_column(String(40), default="bearer", nullable=False, server_default="bearer")
    api_key_hint: Mapped[Optional[str]] = mapped_column(String(40))
    encrypted_api_key: Mapped[Optional[str]] = mapped_column(Text)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, server_default="1")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    user: Mapped["User"] = relationship(back_populates="ai_services")

class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[str] = _uuid_col()
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token: Mapped[bytes] = mapped_column(sa.LargeBinary(32), nullable=False, unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

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
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

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
    read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, server_default="0")
    flagged: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, server_default="0")
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
