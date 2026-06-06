"""
OpenTelemetry configuration for FastAPI applications.

Usage:
  1. pip install opentelemetry-api opentelemetry-sdk opentelemetry-exporter-otlp
  2. pip install opentelemetry-instrumentation-fastapi opentelemetry-instrumentation-sqlalchemy
  3. pip install opentelemetry-instrumentation-httpx opentelemetry-instrumentation-redis
  4. Call configure_otel() in your lifespan before creating the app.

Environment variables:
  OTEL_SERVICE_NAME=my-service
  OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
  OTEL_TRACES_SAMPLER=parentbased_traceidratio
  OTEL_TRACES_SAMPLER_ARG=1.0  (1.0 = 100% sampling, 0.1 = 10%)
"""

from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource, SERVICE_NAME, SERVICE_VERSION
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
import os


def configure_otel(
    service_name: str | None = None,
    service_version: str = "0.1.0",
    otlp_endpoint: str | None = None,
) -> TracerProvider:
    """Configure OpenTelemetry tracing with OTLP export.

    Returns the TracerProvider for use in tests or manual instrumentation.
    """
    resource = Resource.create({
        SERVICE_NAME: service_name or os.getenv("OTEL_SERVICE_NAME", "unknown-service"),
        SERVICE_VERSION: service_version,
        "deployment.environment": os.getenv("ENVIRONMENT", "development"),
    })

    provider = TracerProvider(resource=resource)

    # OTLP exporter (Jaeger, Tempo, Datadog, etc.)
    endpoint = otlp_endpoint or os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4317")
    exporter = OTLPSpanExporter(endpoint=endpoint, insecure=True)
    provider.add_span_processor(BatchSpanProcessor(exporter))

    trace.set_tracer_provider(provider)

    return provider


def instrument_fastapi(app) -> None:
    """Auto-instrument FastAPI with OpenTelemetry."""
    FastAPIInstrumentor.instrument_app(
        app,
        excluded_urls="health.*,metrics",  # Don't trace health checks
    )


def instrument_sqlalchemy(engine) -> None:
    """Auto-instrument SQLAlchemy with OpenTelemetry."""
    SQLAlchemyInstrumentor().instrument(engine=engine)


def instrument_httpx() -> None:
    """Auto-instrument httpx HTTP client."""
    HTTPXClientInstrumentor().instrument()


def setup_all(app, engine=None, service_name=None, service_version="0.1.0"):
    """One-call setup for all instrumentation."""
    configure_otel(service_name=service_name, service_version=service_version)
    instrument_fastapi(app)
    instrument_httpx()
    if engine:
        instrument_sqlalchemy(engine)


# Manual span creation for business logic
def get_tracer(name: str = __name__):
    """Get a tracer for manual span creation.

    Usage:
        tracer = get_tracer(__name__)

        async def process_order(order_id: str):
            with tracer.start_as_current_span("process_order") as span:
                span.set_attribute("order.id", order_id)
                # ... business logic ...
    """
    return trace.get_tracer(name)
