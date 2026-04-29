# Backward-compatible re-exports — all symbols previously in app/models.py
# are re-exported here so that existing `from app.models import X` imports
# continue to work without modification.

from .base import Base, _uuid_col, _utcnow

from .user import (
    UserRole,
    UserStatus,
    User,
    UserProfile,
    UserSettings,
    ConnectedAccount,
    UserCategory,
    UserAIService,
    Session,
    OAuthState,
)

from .email import (
    Email,
    SyncState,
)

from .transaction import (
    Label,
    TransactionStatus,
    ClassifierMethod,
    Transaction,
    ClassificationLog,
)

from .financial import (
    RuleSource,
    Budget,
    Debt,
    RecurringExpense,
    SenderRule,
    MerchantAlias,
    PatternRule,
    DomainPairRule,
    DuplicatePair,
)

__all__ = [
    # base
    "Base",
    "_uuid_col",
    "_utcnow",
    # user
    "UserRole",
    "UserStatus",
    "User",
    "UserProfile",
    "UserSettings",
    "ConnectedAccount",
    "UserCategory",
    "UserAIService",
    "Session",
    "OAuthState",
    # email
    "Email",
    "SyncState",
    # transaction
    "Label",
    "TransactionStatus",
    "ClassifierMethod",
    "Transaction",
    "ClassificationLog",
    # financial
    "RuleSource",
    "Budget",
    "Debt",
    "RecurringExpense",
    "SenderRule",
    "MerchantAlias",
    "PatternRule",
    "DomainPairRule",
    "DuplicatePair",
]
