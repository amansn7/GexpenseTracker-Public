# Backward-compatible re-exports — all symbols previously in app/models.py
# are re-exported here so that existing `from app.models import X` imports
# continue to work without modification.

from .audit_log import (
    AuditLog,
)
from .base import Base, _utcnow, _uuid_col
from .correction import (
    TransactionCorrection,
)
from .device_token import (
    DeviceToken,
    RefreshTokenBlacklist,
)
from .email import (
    Email,
    SyncState,
)
from .filter_rule import (
    FilterRule,
)
from .financial import (
    Budget,
    BudgetLink,
    Debt,
    DomainPairRule,
    DuplicatePair,
    Goal,
    GoalContribution,
    LLMSpendTracker,
    MerchantAlias,
    PatternRule,
    RecurringExpense,
    RuleSource,
    SenderRule,
    UserMerchantOverride,
)
from .merchant import MerchantEntityAlias
from .merchant import (
    MerchantEntity,
)
from .rollup import (
    DailySnapshot,
    PeriodRollup,
)
from .sync_progress import (
    SyncProgress,
)
from .transaction import (
    ClassificationLog,
    ClassifierMethod,
    Label,
    Transaction,
    TransactionStatus,
    TransactionType,
)
from .user import (
    ConnectedAccount,
    OAuthState,
    Session,
    User,
    UserAIService,
    UserCategory,
    UserProfile,
    UserRole,
    UserSettings,
    UserStatus,
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
    "BudgetLink",
    "Debt",
    "RecurringExpense",
    "SenderRule",
    "MerchantAlias",
    "UserMerchantOverride",
    "PatternRule",
    "DomainPairRule",
    "DuplicatePair",
    "LLMSpendTracker",
    "Goal",
    "GoalContribution",
    # merchant entity resolution
    "MerchantEntityAlias",
    "MerchantEntity",
    # sync progress
    "SyncProgress",
    # rollup
    "DailySnapshot",
    "PeriodRollup",
    # audit log
    "AuditLog",
    # device / JWT
    "DeviceToken",
    "RefreshTokenBlacklist",
]
