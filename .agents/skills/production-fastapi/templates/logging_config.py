"""
Production-ready structlog configuration for FastAPI applications.

Usage:
  1. Copy this file into your project (e.g., app/logging_config.py).
  2. Call configure_logging("production") during application startup
     (inside your lifespan context manager).
  3. Use structlog.get_logger() everywhere — never use print() or
     logging.basicConfig().

Features:
  - JSON output in production, pretty console output in development.
  - Full stdlib logging integration (third-party libraries that use
    stdlib logging are captured and formatted identically).
  - Noisy libraries silenced by default.
  - contextvars-based context propagation (request_id, user_id, etc.)
    works correctly with pure ASGI middleware.

Requires: structlog
"""

from __future__ import annotations

import logging
import sys

import structlog


def configure_logging(
    environment: str,
    log_level: str = "INFO",
    *,
    silence_noisy_libraries: bool = True,
) -> None:
    """Configure structlog with JSON (production) or console (development) output.

    Args:
        environment: "production" for JSON, anything else for pretty console.
        log_level: Root log level (DEBUG, INFO, WARNING, ERROR, CRITICAL).
        silence_noisy_libraries: If True, set noisy libraries to WARNING.
    """

    # ------------------------------------------------------------------
    # Shared processors — applied to every log event regardless of renderer
    # ------------------------------------------------------------------
    shared_processors: list[structlog.types.Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.StackInfoRenderer(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.format_exc_info,
    ]

    # ------------------------------------------------------------------
    # Renderer — JSON in production, human-readable in development
    # ------------------------------------------------------------------
    if environment == "production":
        renderer: structlog.types.Processor = structlog.processors.JSONRenderer()
    else:
        renderer = structlog.dev.ConsoleRenderer()

    # ------------------------------------------------------------------
    # Configure structlog itself
    # ------------------------------------------------------------------
    structlog.configure(
        processors=[
            *shared_processors,
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    # ------------------------------------------------------------------
    # Bridge stdlib logging through structlog's ProcessorFormatter so
    # that third-party libraries (SQLAlchemy, httpx, uvicorn, etc.)
    # emit identically-formatted output.
    # ------------------------------------------------------------------
    formatter = structlog.stdlib.ProcessorFormatter(
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            renderer,
        ],
    )

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)

    root_logger = logging.getLogger()
    root_logger.handlers.clear()
    root_logger.addHandler(handler)
    root_logger.setLevel(getattr(logging, log_level.upper(), logging.INFO))

    # ------------------------------------------------------------------
    # Silence noisy libraries — these flood logs with per-request noise
    # that drowns real signals.
    # ------------------------------------------------------------------
    if silence_noisy_libraries:
        noisy_loggers = [
            "uvicorn.access",
            "uvicorn.error",
            "httpx",
            "httpcore",
            "sqlalchemy.engine",
            "sqlalchemy.pool",
            "asyncio",
            "multipart",
        ]
        for name in noisy_loggers:
            logging.getLogger(name).setLevel(logging.WARNING)


def get_logger(**initial_bindings: object) -> structlog.stdlib.BoundLogger:
    """Convenience wrapper around structlog.get_logger() with optional initial bindings.

    Usage:
        logger = get_logger(service="auth")
        logger.info("token_issued", user_id=user_id)
    """
    log: structlog.stdlib.BoundLogger = structlog.get_logger(**initial_bindings)
    return log
