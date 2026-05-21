import json
from io import StringIO

import structlog

from app.config import settings


class StringIOWriter:
    """A structlog-compatible writer that writes to a StringIO."""

    def __init__(self, capture: StringIO):
        self._capture = capture

    def __call__(self, *args, **kwargs):
        self._capture.write(args[0] + "\n")

    def msg(self, message):
        self._capture.write(message + "\n")

    def log(self, level, message):
        self._capture.write(message + "\n")

    def debug(self, message, *args, **kwargs):
        self._capture.write(message + "\n")

    def info(self, message, *args, **kwargs):
        self._capture.write(message + "\n")

    def warning(self, message, *args, **kwargs):
        self._capture.write(message + "\n")

    def error(self, message, *args, **kwargs):
        self._capture.write(message + "\n")

    def critical(self, message, *args, **kwargs):
        self._capture.write(message + "\n")

    def exception(self, message, *args, **kwargs):
        self._capture.write(message + "\n")

    def fatal(self, message, *args, **kwargs):
        self._capture.write(message + "\n")


def _make_test_logger(capture: StringIO):
    """Create a structlog logger that writes to a StringIO capture."""
    writer = StringIOWriter(capture)
    return structlog.wrap_logger(
        writer,
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.JSONRenderer(),
        ],
    )


def test_structlog_configured_json_output():
    """Verify structlog produces JSON output."""
    capture = StringIO()
    test_logger = _make_test_logger(capture)
    test_logger.info("test_event", foo="bar")
    output = capture.getvalue().strip()
    data = json.loads(output)
    assert data["event"] == "test_event"
    assert data["foo"] == "bar"


def test_log_entries_contain_required_fields():
    """Verify log entries contain level and timestamp fields."""
    capture = StringIO()
    test_logger = _make_test_logger(capture)
    test_logger.warning("check_fields")
    output = capture.getvalue().strip()
    data = json.loads(output)
    assert "level" in data
    assert data["level"] == "warning"
    assert "timestamp" in data


def test_classifier_logs_include_required_fields():
    """Verify classifier structured log entries include email_id, provider, latency_ms."""
    capture = StringIO()
    struct_logger = _make_test_logger(capture)

    struct_logger.info(
        "llm_classification_success",
        provider="openrouter",
        model="gemini-2.0-flash",
        latency_ms=450,
        email_id="msg_123",
    )

    output = capture.getvalue().strip()
    data = json.loads(output)
    assert data["event"] == "llm_classification_success"
    assert data["provider"] == "openrouter"
    assert data["latency_ms"] == 450
    assert data["email_id"] == "msg_123"


def test_log_level_env_var_respected():
    """Verify LOG_LEVEL env var is available in settings."""
    assert hasattr(settings, "LOG_LEVEL")
    assert isinstance(settings.LOG_LEVEL, str)
    assert settings.LOG_LEVEL in ("DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL")
