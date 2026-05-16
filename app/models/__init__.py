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

from .filter_rule import (
    FilterRule,
)

from .transaction import (
    Label,
    TransactionType,
    TransactionStatus,
    ClassifierMethod,
    Transaction,
    ClassificationLog,
)

from .correction import (
    TransactionCorrection,
)

from .financial import (
    RuleSource,
    Budget,
    Debt,
    RecurringExpense,
    SenderRule,
    MerchantAlias,
    UserMerchantOverride,
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
    # filter_rule
    "FilterRule",
    # transaction
    "Label",
    "TransactionType",
    "TransactionStatus",
    "ClassifierMethod",
    "Transaction",
    "ClassificationLog",
    # correction
    "TransactionCorrection",
    # financial
    "RuleSource",
    "Budget",
    "Debt",
    "RecurringExpense",
    "SenderRule",
    "MerchantAlias",
    "UserMerchantOverride",
    "PatternRule",
    "DomainPairRule",
    "DuplicatePair",
]
