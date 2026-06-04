from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    DATABASE_URL: str = "postgresql+asyncpg://expense:expense@localhost:5432/expense_tracker"

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def force_asyncpg(cls, v: str) -> str:
        for sync_scheme in ("postgresql://", "postgresql+psycopg2://", "postgres://"):
            if v.startswith(sync_scheme):
                return "postgresql+asyncpg://" + v[len(sync_scheme) :]
        return v

    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = "http://localhost:8000/api/auth/callback"

    # BYOK Cloudflare — account ID needed for base URL construction when a user
    # brings their own Cloudflare Workers AI key (without specifying a custom URL).
    CLOUDFLARE_ACCOUNT_ID: str = ""

    # FreeLLMAPI proxy — trial-tier LLM provider (bring-your-own-key after trial)
    FREELLMAPI_BASE_URL: str = "https://humble-wholeness-production.up.railway.app"
    FREELLMAPI_API_KEY: str = ""
    FREELLMAPI_MODEL: str = ""  # empty = let proxy auto-select
    TRIAL_DURATION_DAYS: int = 7
    ENABLE_LLM_TRIAL: bool = False
    OWNER_EMAIL: str = ""  # email of app owner — gets permanent FreeLLMAPI fallback

    LLM_CONFIDENCE_THRESHOLD: float = 0.85
    AUTO_CONFIRM_THRESHOLD: float = 0.75
    ML_CONFIDENCE_THRESHOLD: float = 0.55
    ML_MARGIN_THRESHOLD: float = 0.03
    ML_AUTO_LEARN_THRESHOLD: float = 0.90
    ML_MIN_SAMPLES: int = 3
    ML_MODEL_PATH: str = "data/ml_classifier.json"
    LEARNING_STATS_PATH: str = "data/learning_stats.json"

    LLM_BATCH_SIZE: int = 5
    SYNC_INTERVAL_HOURS: int = 2
    SECRET_KEY: str = "change-me-in-production"
    JWT_PRIVATE_KEY: str = ""  # RSA private key (PEM) for JWT signing — set in .env
    JWT_PUBLIC_KEY: str = ""  # RSA public key (PEM) for JWT verification — set in .env
    JWT_PUBLIC_KEY_OLD: str = ""  # Previous public key (PEM) for rotation transition

    @field_validator("SECRET_KEY", mode="after")
    @classmethod
    def validate_secret_key(cls, v: str) -> str:
        if not v:
            raise ValueError("SECRET_KEY must not be empty")
        if v == "change-me-in-production":
            raise ValueError("SECRET_KEY must not be the default value")
        return v

    FERNET_KEY: str = ""  # base64 Fernet key; if empty, tokens stored plaintext
    INVITE_CODE: str = ""
    DEV_MODE: bool = False

    # Database connection pool
    DB_POOL_SIZE: int = 20
    DB_MAX_OVERFLOW: int = 30
    DB_POOL_TIMEOUT: int = 30
    DB_POOL_RECYCLE: int = 1800  # 30 minutes
    DB_POOL_PRE_PING: bool = True

    # Dedup
    AUTO_RESOLVE_THRESHOLD: float = 0.85
    DEDUP_BATCH_SIZE: int = 100

    # Sync
    FETCH_CONCURRENCY: int = 5
    SYNC_PAGE_SIZE: int = 50

    # Confidence governance
    LOW_CONFIDENCE_THRESHOLD: float = 0.7
    HIGH_CONFIDENCE_THRESHOLD: float = 0.9
    MEDIUM_CONFIDENCE_THRESHOLD: float = 0.7

    # Income classification
    INCOME_MONTH_SHIFT: int = 1

    # LLM cost controls
    DAILY_LLM_BUDGET: float = 10.0  # Global daily LLM budget in USD

    # Stats
    CATEGORY_BREAKDOWN_LIMIT: int = 30

    # Reclassify
    RECLASSIFY_METHODS: list = ["llm", "rules"]

    LOG_LEVEL: str = "INFO"


settings = Settings()
