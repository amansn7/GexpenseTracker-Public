---
name: production-monitoring
description: "Production observability — OpenTelemetry traces, structured logging, metrics, alerting, health endpoints, and SLO definition. Use this skill when the user mentions monitoring, observability, logging, metrics, traces, alerts, SLOs, or says /production monitoring. Triggers on observability discussions, OTEL setup, structured logging configuration, Prometheus/Grafana setup, or alerting rules."
---

# Production Monitoring and Observability

This skill encodes battle-tested observability patterns for production services. Every recommendation comes from real incidents — the ones where you stared at a dashboard that showed nothing useful while users were screaming. Observability is not a feature you bolt on after launch. It is the foundation you build on from day one.

---

## 1. The Three Pillars of Observability

Observability is not "having logs." It is the ability to ask arbitrary questions about your system's behavior without deploying new code. The three pillars work together — none is sufficient alone.

| Pillar | What It Tells You | Example |
|--------|-------------------|---------|
| **Logs** | *What happened* — discrete events with context | "User X login failed: expired token" |
| **Metrics** | *How the system behaves now* — aggregated numbers over time | "p99 latency is 450ms and rising" |
| **Traces** | *Why something is slow* — a request's journey across services | "Postgres query in user-service took 2.3s" |

**How they connect:** An alert fires on a **metric** (error rate > 1%). You filter **logs** by the time window to see what errors occurred. You grab a trace ID from the logs and follow the **trace** to the slow service. You fix it and verify the **metric** recovers. Without all three, you are flying blind.

---

## 2. Structured Logging

Unstructured logs (`print("something went wrong")`) are useless in production. You cannot filter, aggregate, or dashboard them.

### Python: structlog Setup

```python
import structlog, logging

def configure_logging(environment: str) -> None:
    processors: list[structlog.types.Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.StackInfoRenderer(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.format_exc_info,
    ]
    renderer = (structlog.processors.JSONRenderer() if environment == "production"
                else structlog.dev.ConsoleRenderer())

    structlog.configure(
        processors=[*processors, structlog.stdlib.ProcessorFormatter.wrap_for_formatter],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )
    formatter = structlog.stdlib.ProcessorFormatter(
        processors=[structlog.stdlib.ProcessorFormatter.remove_processors_meta, renderer],
    )
    handler = logging.StreamHandler()
    handler.setFormatter(formatter)
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(logging.INFO)

    # Silence noisy libraries
    for lib in ("uvicorn.access", "httpx", "sqlalchemy.engine"):
        logging.getLogger(lib).setLevel(logging.WARNING)
```

### Node.js: pino Setup

```typescript
import pino from "pino";

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport: process.env.NODE_ENV !== "production"
    ? { target: "pino-pretty", options: { colorize: true } } : undefined,
  base: { service: process.env.SERVICE_NAME || "my-service" },
  redact: ["req.headers.authorization", "req.headers.cookie", "*.password", "*.token"],
});
export default logger;
```

### Log Levels Discipline

Log levels are a contract with your on-call engineers, not a suggestion.

| Level | Meaning | Alert? | Example |
|-------|---------|--------|---------|
| **ERROR** | Needs human attention. An alert should fire. | Yes | Database connection failed, payment processing error, unhandled exception |
| **WARNING** | Something unexpected happened but was handled. | No | Rate limit hit, cache miss fallback, deprecated API called |
| **INFO** | Business events. The happy path. | No | User created, order placed, deployment started |
| **DEBUG** | Developer diagnostics. Never in production. | No | SQL query text, request/response bodies, internal state |

**Rules:**
- If nobody will read it, do not log it
- If it is ERROR, there must be a corresponding alert. Otherwise it is WARNING
- DEBUG logs in production are a performance tax with zero value — disable them

### NEVER Log / ALWAYS Include

**NEVER log:** passwords, tokens/authorization headers, credit card numbers, SSNs/PII, raw request bodies (may contain secrets).

**ALWAYS include in every log line:**

```python
logger.info("order_placed",
    request_id="req-abc123",    # Ties to HTTP request
    trace_id="trace-def456",    # Ties to distributed trace
    user_id="user-789",         # Who triggered this
    order_id="order-012",       # What business entity
    amount=99.99, currency="USD",
    service="order-service",    # Which service emitted this
)
```

### Correlation IDs Across Services

Every request gets a unique ID at the edge. Pass it downstream in headers. Include it in every log line.

```python
import uuid, structlog
from starlette.types import ASGIApp, Receive, Scope, Send

class CorrelationIDMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] not in ("http", "websocket"):
            await self.app(scope, receive, send)
            return
        headers = dict(scope.get("headers", []))
        request_id = (headers.get(b"x-request-id", b"").decode()
                      or headers.get(b"x-correlation-id", b"").decode()
                      or str(uuid.uuid4()))
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(request_id=request_id)

        async def send_with_id(message):
            if message["type"] == "http.response.start":
                h = list(message.get("headers", []))
                h.append((b"x-request-id", request_id.encode()))
                message["headers"] = h
            await send(message)
        await self.app(scope, receive, send_with_id)

# Propagate to downstream services
async def call_downstream(client: httpx.AsyncClient, url: str):
    rid = structlog.contextvars.get_contextvars().get("request_id", "unknown")
    return await client.get(url, headers={"X-Request-ID": rid})
```

---

## 3. OpenTelemetry (OTEL) Setup

OpenTelemetry is the vendor-neutral standard. Instrument once, export to Jaeger, Tempo, Datadog, or any OTLP backend.

### Python Dependencies

```
opentelemetry-api, opentelemetry-sdk, opentelemetry-exporter-otlp-proto-grpc
opentelemetry-instrumentation-fastapi, -sqlalchemy, -httpx, -redis
```

### Complete FastAPI Integration

```python
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource, SERVICE_NAME, SERVICE_VERSION
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
from opentelemetry.instrumentation.redis import RedisInstrumentor

def configure_tracing(service_name: str, service_version: str, otlp_endpoint: str) -> None:
    resource = Resource.create({
        SERVICE_NAME: service_name, SERVICE_VERSION: service_version,
        "deployment.environment": os.getenv("ENVIRONMENT", "development"),
    })
    provider = TracerProvider(resource=resource)
    provider.add_span_processor(BatchSpanProcessor(
        OTLPSpanExporter(endpoint=otlp_endpoint, insecure=True)
    ))
    trace.set_tracer_provider(provider)
    # Auto-instrument: creates spans for every request, SQL query, HTTP call, Redis command
    SQLAlchemyInstrumentor().instrument()
    HTTPXClientInstrumentor().instrument()
    RedisInstrumentor().instrument()

@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_tracing("order-service", settings.app_version, settings.otlp_endpoint)
    yield
    trace.get_tracer_provider().shutdown()

app = FastAPI(title="Order Service", lifespan=lifespan)
FastAPIInstrumentor.instrument_app(app)
```

### Manual Spans for Business Logic

Auto-instrumentation covers libraries. The most valuable spans are on your business logic.

```python
tracer = trace.get_tracer(__name__)

async def process_order(order_id: str, user_id: str) -> Order:
    with tracer.start_as_current_span("process_order",
        attributes={"order.id": order_id, "user.id": user_id}) as span:
        with tracer.start_as_current_span("validate_inventory"):
            if not await check_inventory(order_id):
                span.set_status(trace.StatusCode.ERROR, "Insufficient inventory")
                raise InsufficientInventoryError(order_id)
        with tracer.start_as_current_span("charge_payment") as ps:
            payment = await charge_payment(order_id)
            ps.set_attribute("payment.amount", payment.amount)
        span.add_event("order_completed", attributes={"order.total": payment.amount})
        return order
```

### Context Propagation (W3C TraceContext)

Instrumented HTTP clients inject `traceparent` headers automatically. For non-instrumented clients:

```python
from opentelemetry.propagate import inject
headers = {}
inject(headers)  # Adds traceparent + tracestate
response = await some_client.get(url, headers=headers)
```

### Exporter Configuration

```bash
# Jaeger: docker run -d -p 16686:16686 -p 4317:4317 jaegertracing/all-in-one:latest
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317   # Jaeger / Tempo / OTEL Collector
```

---

## 4. Metrics (RED Method)

The RED method gives you the three metrics that matter most for request-driven services. If you measure nothing else, measure these.

- **R**ate — requests per second (throughput)
- **E**rrors — error rate as a percentage (4xx and 5xx)
- **D**uration — latency distribution (p50, p95, p99)

### Prometheus Client Setup (Python)

```python
from prometheus_client import Counter, Histogram, Gauge, generate_latest, CONTENT_TYPE_LATEST
from starlette.types import ASGIApp, Receive, Scope, Send
from starlette.responses import Response
import time, re

REQUEST_COUNT = Counter("http_requests_total", "Total HTTP requests",
                        ["method", "endpoint", "status_code"])
REQUEST_DURATION = Histogram("http_request_duration_seconds", "Request duration",
    ["method", "endpoint"],
    buckets=[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0])
REQUESTS_IN_PROGRESS = Gauge("http_requests_in_progress", "In-flight requests",
                             ["method", "endpoint"])

class PrometheusMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        method, path = scope["method"], scope["path"]
        # Normalize: /users/123 -> /users/{id} to prevent cardinality explosion
        endpoint = re.sub(r"/\d+", "/{id}", re.sub(
            r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", "{id}", path))
        REQUESTS_IN_PROGRESS.labels(method=method, endpoint=endpoint).inc()
        start, status_code = time.perf_counter(), 500

        async def send_wrapper(message):
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
            await send(message)
        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            REQUEST_COUNT.labels(method=method, endpoint=endpoint, status_code=status_code).inc()
            REQUEST_DURATION.labels(method=method, endpoint=endpoint).observe(time.perf_counter() - start)
            REQUESTS_IN_PROGRESS.labels(method=method, endpoint=endpoint).dec()

# Scrape target for Prometheus
async def metrics_endpoint(request):
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)
```

### Custom Business Metrics

Technical metrics tell you the system is healthy. Business metrics tell you the *business* is healthy.

```python
ORDERS_PLACED = Counter("orders_placed_total", "Total orders", ["payment_method", "region"])
ORDER_VALUE = Histogram("order_value_dollars", "Order value",
                        buckets=[10, 25, 50, 100, 250, 500, 1000, 5000])
ACTIVE_USERS = Gauge("active_users_current", "Currently active users")
```

### Cardinality Awareness

High cardinality kills Prometheus. This is the #1 Prometheus misconfiguration.

```python
# DANGEROUS — user_id has millions of values = millions of time series = OOM
Counter("http_requests_total", "...", ["method", "endpoint", "user_id"])  # cardinality bomb

# SAFE — all labels have bounded values
Counter("http_requests_total", "...", ["method", "endpoint", "status_code"])
```

**Rules:** Labels must have bounded values (<100 unique). Never use user IDs, request IDs, or timestamps as labels. If you need per-user data, use logs or traces. Monitor `prometheus_tsdb_head_series` for unbounded growth.

---

## 5. Health Check Endpoints

Health checks are how orchestrators (Kubernetes, ECS, Cloud Run) know if your service can handle traffic. Get these wrong and you get cascading failures or zombie containers.

### The Three Probes

```python
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from datetime import datetime, UTC
import asyncio

health_router = APIRouter(tags=["health"])

@health_router.get("/health/live")
async def liveness() -> dict:
    """Always 200. Never check dependencies — a slow DB must not cause restarts."""
    return {"status": "alive", "timestamp": datetime.now(UTC).isoformat()}

@health_router.get("/health/ready")
async def readiness(request: Request) -> JSONResponse:
    """Check all critical deps. Failing = removed from load balancing (NOT restarted)."""
    checks, healthy = {}, True
    for name, check_fn in [
        ("database", lambda: request.app.state.db_engine.connect()),
        ("redis", lambda: request.app.state.redis.ping()),
    ]:
        try:
            async with asyncio.timeout(2.0):
                if name == "database":
                    async with request.app.state.db_engine.connect() as conn:
                        await conn.execute(text("SELECT 1"))
                else:
                    await request.app.state.redis.ping()
            checks[name] = {"status": "healthy"}
        except Exception as e:
            checks[name] = {"status": "unhealthy", "error": str(e)}
            healthy = False
    return JSONResponse(
        status_code=200 if healthy else 503,
        content={"status": "ready" if healthy else "not_ready", "checks": checks},
    )

@health_router.get("/health/startup")
async def startup_check(request: Request) -> JSONResponse:
    """For slow-starting services (ML models, migrations). K8s waits for this before liveness probes."""
    ready = getattr(request.app.state, "startup_complete", False)
    return JSONResponse(status_code=200 if ready else 503,
                        content={"status": "started" if ready else "starting"})
```

### Kubernetes Probe Configuration

```yaml
livenessProbe:    # 3 failures = restart container
  httpGet: { path: /health/live, port: 8000 }
  initialDelaySeconds: 5, periodSeconds: 15, timeoutSeconds: 3, failureThreshold: 3
readinessProbe:   # 3 failures = remove from Service (no restart)
  httpGet: { path: /health/ready, port: 8000 }
  initialDelaySeconds: 5, periodSeconds: 10, timeoutSeconds: 5, failureThreshold: 3
startupProbe:     # 30 * 5s = 150s max startup time
  httpGet: { path: /health/startup, port: 8000 }
  periodSeconds: 5, failureThreshold: 30
```

**Rules:**
- `/health/live` — NEVER check dependencies. A slow DB must not cause restarts.
- `/health/ready` — Check every critical dep with **2-3s timeout each**. Determines traffic routing.
- `/health/startup` — For services >10s startup (ML models, migrations).
- Exclude health endpoints from access logs and auth middleware.

---

## 6. Alerting Best Practices

Alert fatigue is worse than no alerts — your team learns to ignore pages, and the real incident gets missed.

### Alert on Symptoms, Not Causes

```yaml
# BAD — CPU spikes during deploys, batch jobs. Fires constantly, gets ignored.
- alert: HighCPU
  expr: node_cpu_seconds_total > 80

# GOOD — users are experiencing errors
- alert: HighErrorRate
  expr: sum(rate(http_requests_total{status_code=~"5.."}[5m])) / sum(rate(http_requests_total[5m])) > 0.01
  for: 5m
  labels: { severity: critical }
  annotations:
    summary: "Error rate exceeds 1% for 5 minutes"
    runbook: "https://wiki.internal/runbooks/high-error-rate"
```

### Every Alert Needs a Runbook

The runbook answers: (1) What does this mean? (2) User impact? (3) First three diagnostic steps? (4) Common causes + fixes? (5) Escalation path?

### Severity Levels

| Severity | Criteria | Response Time | Notification |
|----------|----------|---------------|--------------|
| **P1 / Critical** | User-facing outage, data loss risk | Immediate (page on-call) | PagerDuty / phone call |
| **P2 / High** | Degraded service, elevated errors | 30 minutes | Slack alert channel |
| **P3 / Warning** | Non-urgent, no user impact yet | Next business day | Email / ticket |

### Example Alertmanager Rules

```yaml
groups:
  - name: api-alerts
    rules:
      - alert: HighErrorRate  # P1 — page on-call
        expr: |
          sum(rate(http_requests_total{status_code=~"5.."}[5m]))
          / sum(rate(http_requests_total[5m])) > 0.01
        for: 5m
        labels: { severity: critical }
        annotations:
          summary: "Error rate {{ $value | humanizePercentage }} exceeds 1%"
          runbook: "https://wiki.internal/runbooks/high-error-rate"

      - alert: HighLatency  # P1 — p99 above 2s
        expr: |
          histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[5m])) by (le)) > 2.0
        for: 10m
        labels: { severity: critical }
        annotations:
          summary: "p99 latency {{ $value | humanizeDuration }} exceeds 2s"
          runbook: "https://wiki.internal/runbooks/high-latency"

      - alert: NoTraffic  # P2 — routing broken?
        expr: sum(rate(http_requests_total[5m])) == 0
        for: 5m
        labels: { severity: warning }
        annotations:
          summary: "Zero requests for 5 minutes"
          runbook: "https://wiki.internal/runbooks/no-traffic"
```

**Rules:** Every alert has a `runbook` annotation. Use `for: 5m` minimum to avoid transient spike pages. Only P1 pages on-call. Review alert noise monthly — if nobody acts on it, delete it. Test alerts — if you have never seen one fire, it probably does not work.

---

## 7. SLO Definition

SLOs turn vague "the service should be fast" into measurable commitments with explicit consequences.

### The SLO Framework

| Concept | Definition | Example |
|---------|-----------|---------|
| **SLI** | Ratio of good events to total events | % of requests < 200ms |
| **SLO** | Target for the SLI over a time window | 99.9% of requests < 200ms over 30 days |
| **Error Budget** | 100% - SLO = allowed failure | 0.1% = 43.2 min/month of downtime |

### Practical SLO Examples

```yaml
# Availability: 99.95% non-5xx responses (error budget: ~21.6 min/month)
availability_query: |
  1 - (sum(rate(http_requests_total{status_code=~"5.."}[30d]))
       / sum(rate(http_requests_total[30d])))

# Latency: 99% of requests < 200ms (error budget: 1% can be slow)
latency_query: |
  sum(rate(http_request_duration_seconds_bucket{le="0.2"}[30d]))
  / sum(rate(http_request_duration_seconds_count[30d]))
```

### Burn Rate Alerts

Burn rate = how fast you consume error budget. Rate of 1 = budget exhausted exactly at window end. Rate of 14.4 = exhausted in <2 hours.

```yaml
- alert: SLOFastBurn  # Budget gone in < 2 hours — page immediately
  expr: (sum(rate(http_requests_total{status_code=~"5.."}[5m])) / sum(rate(http_requests_total[5m]))) > (14.4 * 0.001)
  for: 2m
  labels: { severity: critical }
  annotations: { summary: "Error budget burning 14.4x", runbook: "https://wiki.internal/runbooks/slo-fast-burn" }

- alert: SLOSlowBurn  # Budget gone in < 3 days — warning
  expr: (sum(rate(http_requests_total{status_code=~"5.."}[1h])) / sum(rate(http_requests_total[1h]))) > (10 * 0.001)
  for: 15m
  labels: { severity: warning }
  annotations: { summary: "Error budget burning 10x", runbook: "https://wiki.internal/runbooks/slo-slow-burn" }
```

**Rules:** Start with two SLOs (availability + latency). Error budget exhausted = freeze features, fix reliability. Review quarterly — never approach budget? Tighten. Constantly breach? Loosen or invest.

---

## 8. Pydantic Logfire Integration

[Pydantic Logfire](https://logfire.pydantic.dev/) provides deep observability for Python + Pydantic apps with near-zero setup. It is OpenTelemetry-native — you are not locked in.

```python
import logfire
from fastapi import FastAPI

app = FastAPI()
logfire.configure()              # Reads LOGFIRE_TOKEN from env
logfire.instrument_fastapi(app)  # Auto-instruments requests, Pydantic validation, SQL, HTTP, Redis

# Manual spans for business logic
with logfire.span("process_payment", amount=99.99, currency="USD"):
    result = await charge_card(...)
    logfire.info("payment_processed", transaction_id=result.id)
```

**Why Logfire fits the VStorm stack:**
- Zero-config for Pydantic + FastAPI — auto-instruments model validation (unique to Logfire)
- Live tail in development — structured trace streaming replaces raw console output
- OpenTelemetry-native — data exports to any OTEL backend if you switch
- Tiny SDK, negligible overhead

---

## 9. Golden Signals Reference

The four golden signals from the Google SRE book. Measure these for every service.

| Signal | What to Measure | Alert When | Dashboard |
|--------|----------------|-----------|-----------|
| **Latency** | Request duration (split by success/error — a fast 500 is not a slow 200) | p99 > threshold for 5m | p50, p95, p99 over time |
| **Traffic** | Requests/second (or messages/second for queues) | Drops to zero, or spikes >3x normal | RPS by endpoint |
| **Errors** | Error rate (explicit 5xx + implicit: wrong data, SLO-violating latency) | >1% for 5m, any 5xx on critical paths | Error rate by type |
| **Saturation** | Connection pool usage, queue depth, memory | Pool >80% for 10m, queue growing for 15m | Pool utilization, queue depth |

```python
# Saturation metrics — the ones people forget
DB_POOL_USAGE = Gauge("db_connection_pool_usage_ratio", "Pool utilization (0-1)")
QUEUE_DEPTH = Gauge("task_queue_depth", "Tasks waiting", ["queue_name"])
```

---

## Detection Patterns

Use these to find missing observability. If you find these, the service is flying blind.

| Gap | What to Look For |
|-----|-----------------|
| **No structured logging** | `print(` for logging, `logging.basicConfig()` with no formatter, bare string log messages, no `structlog`/`pino` in deps |
| **No metrics** | No `prometheus_client`/`opentelemetry.metrics` in deps, no `/metrics` endpoint, no Counter/Histogram/Gauge definitions |
| **No tracing** | No `opentelemetry` packages, no `tracer`/`span` usage, no `traceparent` propagation, no `OTEL_EXPORTER_OTLP_ENDPOINT` |
| **No health checks** | No `/health`/`/healthz`/`/ready` endpoints, no K8s probe config, no `HEALTHCHECK` in Dockerfile |
| **No alerting** | No alert rules in repo, no PagerDuty/OpsGenie/Alertmanager references, no runbook directory |
| **Dangerous logging** | `password`/`token`/`secret`/`authorization` in log strings, `request.body` logged unredacted, `DEBUG` level in prod config |

---

## Anti-Patterns

| Anti-Pattern | Why It Is Bad | Fix |
|---|---|---|
| `print()` for logging | Unstructured, no levels, no context, invisible to log aggregators | Use structlog (Python) or pino (Node.js) |
| Logging request/response bodies | PII leak, secret leak, massive log volume | Log only metadata: method, path, status, duration |
| User IDs as metric labels | Cardinality explosion, Prometheus OOM | Use labels with bounded values only |
| Alerting on CPU/memory directly | Fires on normal operations, causes alert fatigue | Alert on user-facing symptoms (error rate, latency) |
| No `for` duration on alerts | Transient spikes cause false pages at 3 AM | Minimum `for: 5m` on nearly all alerts |
| Health check that checks everything | Slow health checks cause cascading failures | Liveness: no deps. Readiness: critical deps with timeouts |
| SLO of 100% | Impossible target that prevents any deployment | Start at 99.9% and adjust based on reality |
| Logging at DEBUG in production | Massive volume, performance impact, disk fills up | INFO minimum in production, DEBUG only in dev |
| No correlation ID propagation | Cannot trace a request across services | Inject X-Request-ID at the edge, propagate everywhere |
| Metrics endpoint behind auth | Prometheus cannot scrape it | Exclude `/metrics` from auth middleware |

---

## Cross-References

- For structured logging middleware and request ID injection, see **production-fastapi**
- For container health checks in Dockerfiles, see **production-docker**
- For pre-deployment observability validation, see **production-deploy**
- For database query performance metrics, see **production-postgres**
- For production readiness review including observability checks, see **production-check**
- For architecture planning with observability requirements, see **production-planner**
