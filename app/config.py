from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    DATABASE_URL: str = "postgresql+asyncpg://expense:expense@localhost:5432/expense_tracker"

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def force_asyncpg(cls, v: str) -> str:
        for sync_scheme in ("postgresql://", "postgresql+psycopg2://", "postgres://"):
            if v.startswith(sync_scheme):
                return "postgresql+asyncpg://" + v[len(sync_scheme):]
        return v

    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = "http://localhost:8000/api/auth/callback"

    LLM_PROVIDER: str = "openrouter"
    LLM_MODEL: str = "google/gemini-2.0-flash-exp:free"
    OPENROUTER_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""

    # Additional free-tier LLM providers (OpenAI-compatible)
    GROK_API_KEY: str = ""          # xAI Grok  — https://api.x.ai/v1
    GROQ_API_KEY: str = ""         # Groq    — https://api.groq.com/openai/v1
    GOOGLE_AI_API_KEY: str = ""     # Gemini  — https://generativelanguage.googleapis.com/v1beta/openai
    SCALEWAY_API_KEY: str = ""      # Scaleway   — https://api.scaleway.ai/v1

    LLM_CONFIDENCE_THRESHOLD: float = 0.85
    AUTO_CONFIRM_THRESHOLD: float = 0.75
    ML_CONFIDENCE_THRESHOLD: float = 0.55
    ML_MARGIN_THRESHOLD: float = 0.03
    ML_AUTO_LEARN_THRESHOLD: float = 0.90
    ML_MIN_SAMPLES: int = 3
    ML_MODEL_PATH: str = "data/ml_classifier.json"
    LEARNING_STATS_PATH: str = "data/learning_stats.json"

    SYNC_INTERVAL_HOURS: int = 2
    SECRET_KEY: str = "change-me-in-production"
    FERNET_KEY: str = ""   # base64 Fernet key; if empty, tokens stored plaintext
    INVITE_CODE: str = ""
    DEV_MODE: bool = False

settings = Settings()
