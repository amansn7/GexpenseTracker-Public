from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    DATABASE_URL: str = "postgresql+asyncpg://expense:expense@localhost:5432/expense_tracker"

    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = "http://localhost:8000/api/auth/callback"

    LLM_PROVIDER: str = "openrouter"
    LLM_MODEL: str = "google/gemini-2.0-flash-exp:free"
    OPENROUTER_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""

    LLM_CONFIDENCE_THRESHOLD: float = 0.85
    AUTO_CONFIRM_THRESHOLD: float = 0.75

    SYNC_INTERVAL_HOURS: int = 2
    SECRET_KEY: str = "change-me-in-production"

settings = Settings()
