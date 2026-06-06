"""
Pydantic Logfire setup for FastAPI applications.

Logfire provides auto-instrumentation for Pydantic models, FastAPI,
SQLAlchemy, httpx, and more — with a hosted dashboard for live tail,
traces, and metrics.

Usage:
  1. pip install logfire[fastapi]
  2. logfire auth  (one-time setup)
  3. Call configure_logfire() in your app startup.

Environment variables:
  LOGFIRE_TOKEN=your-project-token
"""

import logfire


def configure_logfire(
    service_name: str = "my-service",
    environment: str = "development",
) -> None:
    """Configure Logfire with sensible defaults."""
    logfire.configure(
        service_name=service_name,
        environment=environment,
        # Pydantic plugin: auto-log model validation
        pydantic_plugin=logfire.PydanticPlugin(record="failure"),
    )


def instrument_fastapi(app) -> None:
    """Auto-instrument FastAPI with Logfire."""
    logfire.instrument_fastapi(app)


def instrument_sqlalchemy(engine) -> None:
    """Auto-instrument SQLAlchemy with Logfire."""
    logfire.instrument_sqlalchemy(engine=engine)


def instrument_httpx(client=None) -> None:
    """Auto-instrument httpx with Logfire."""
    logfire.instrument_httpx(client)


def setup_all(app, engine=None, service_name="my-service", environment="development"):
    """One-call setup for all Logfire instrumentation."""
    configure_logfire(service_name=service_name, environment=environment)
    instrument_fastapi(app)
    if engine:
        instrument_sqlalchemy(engine)
    instrument_httpx()
