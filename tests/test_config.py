from app.config import settings

def test_defaults_set():
    assert settings.SYNC_INTERVAL_HOURS == 2
    assert settings.LLM_CONFIDENCE_THRESHOLD == 0.85
    assert settings.AUTO_CONFIRM_THRESHOLD == 0.75
    assert settings.LLM_PROVIDER in ("openrouter", "anthropic")
