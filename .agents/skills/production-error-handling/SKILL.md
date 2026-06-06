---
name: production-error-handling
description: "Production error handling patterns — error taxonomy, retry with exponential backoff, circuit breakers, graceful degradation, dead-letter queues, and structured error logging. Use this skill when the user writes error-prone code (external API calls, database operations, file I/O, network calls), implements retry logic, or asks about resilience patterns. Also trigger when user says /production errors."
---

# Production Error Handling

This skill encodes battle-tested error handling patterns for systems that must stay up when everything around them is falling apart. Every pattern here comes from real production incidents: the retry storm that turned a blip into a 4-hour outage, the bare `except: pass` that silently ate data for three weeks, the missing timeout that let a dead service hold open 200 connections until the pool starved. Follow this guide and none of that happens on your watch.

---

## 1. Error Taxonomy

**Classify every error BEFORE writing handling code.** Different errors demand different responses. Treating them the same is how you turn a recoverable hiccup into a cascading outage.

### The Four Categories

| Category | Response | Retry? | Alert? | Examples |
|----------|----------|--------|--------|----------|
| **Transient** | Retry with backoff | Yes | After N failures | Network timeout, 503, connection reset, rate limited (429) |
| **Permanent** | Fail immediately | Never | On unexpected frequency | 400, 401, 404, validation error, malformed input |
| **Partial** | Degrade gracefully | Optional | Low priority | Cache miss, analytics down, email service down |
| **Fatal** | Crash fast | Never | Immediate (PagerDuty) | Missing config, corrupt state, OOM, disk full |

### Exception Hierarchy for a Service

Define your exception hierarchy up front. This is not optional -- without it, every developer invents their own error handling and nothing is consistent.

```python
class ServiceError(Exception):
    """Base for all service errors. Every custom exception inherits from this."""

    def __init__(self, message: str, *, error_code: str = "INTERNAL_ERROR"):
        self.message = message
        self.error_code = error_code
        super().__init__(message)


# --- Transient: safe to retry ---

class TransientError(ServiceError):
    """Temporary failure. Retry with backoff."""

class NetworkTimeoutError(TransientError):
    def __init__(self, service: str, timeout_seconds: float):
        super().__init__(
            f"{service} timed out after {timeout_seconds}s",
            error_code="NETWORK_TIMEOUT",
        )

class ServiceUnavailableError(TransientError):
    def __init__(self, service: str):
        super().__init__(f"{service} returned 503", error_code="SERVICE_UNAVAILABLE")

class RateLimitedError(TransientError):
    def __init__(self, service: str, retry_after: int | None = None):
        self.retry_after = retry_after
        super().__init__(f"{service} rate limited", error_code="RATE_LIMITED")


# --- Permanent: do NOT retry ---

class PermanentError(ServiceError):
    """Unrecoverable failure. Do not retry."""

class ValidationError(PermanentError):
    def __init__(self, field: str, reason: str):
        super().__init__(
            f"Validation failed on {field}: {reason}",
            error_code="VALIDATION_ERROR",
        )

class NotFoundError(PermanentError):
    def __init__(self, resource: str, identifier: str):
        super().__init__(
            f"{resource} {identifier} not found",
            error_code="NOT_FOUND",
        )

class AuthenticationError(PermanentError):
    def __init__(self):
        super().__init__("Authentication failed", error_code="AUTH_FAILED")


# --- Partial: degrade gracefully ---

class PartialError(ServiceError):
    """Non-critical failure. Continue with degraded functionality."""

class CacheMissError(PartialError):
    def __init__(self, key: str):
        super().__init__(f"Cache miss for {key}", error_code="CACHE_MISS")

class NonCriticalServiceError(PartialError):
    def __init__(self, service: str, reason: str):
        super().__init__(
            f"Non-critical service {service} failed: {reason}",
            error_code="NON_CRITICAL_FAILURE",
        )


# --- Fatal: crash immediately ---

class FatalError(ServiceError):
    """Unrecoverable system failure. Crash the process."""

class MissingConfigError(FatalError):
    def __init__(self, config_key: str):
        super().__init__(
            f"Required config missing: {config_key}",
            error_code="MISSING_CONFIG",
        )

class CorruptStateError(FatalError):
    def __init__(self, detail: str):
        super().__init__(f"Corrupt state detected: {detail}", error_code="CORRUPT_STATE")
```

**Rules:**
- Every exception carries a machine-readable `error_code` for structured logging and API responses
- `TransientError` is the ONLY base class that retry logic should catch
- Catching `ServiceError` in a handler tells you "something from our domain went wrong" without mixing in random library exceptions
- Fatal errors crash the process. Do not try to recover from corrupt state -- you will make it worse

---

## 2. Retry with Exponential Backoff and Jitter

### Why Linear Retry Kills You

Linear retry (sleep 1s, try again, sleep 1s, try again) causes **thundering herd**: when a service recovers, all waiting clients slam it simultaneously at the exact same interval. The service goes down again. Repeat until someone pages the on-call.

**The correct formula:**

```
delay = min(base * 2^attempt + random(0, jitter), max_delay)
```

- `base`: starting delay (0.5s-1s)
- `attempt`: 0-indexed retry count
- `jitter`: random component (0 to base) that desynchronizes clients
- `max_delay`: cap to prevent absurd waits (30s-60s)

### Python: tenacity

tenacity is the standard Python retry library. It handles backoff, jitter, and conditional retry in a composable way.

```python
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential_jitter,
    retry_if_exception_type,
    before_sleep_log,
    after_log,
)
import structlog

logger = structlog.get_logger()


# Basic: retry transient errors with exponential backoff + jitter
@retry(
    retry=retry_if_exception_type(TransientError),
    wait=wait_exponential_jitter(initial=0.5, max=30, jitter=2),
    stop=stop_after_attempt(4),  # 1 initial + 3 retries
    before_sleep=before_sleep_log(logger, structlog.stdlib.INFO),
)
async def call_payment_service(payment_id: str) -> dict:
    async with httpx.AsyncClient(timeout=5.0) as client:
        response = await client.post(
            f"https://payments.internal/charge/{payment_id}"
        )
        if response.status_code == 429:
            raise RateLimitedError("payment-service")
        if response.status_code == 503:
            raise ServiceUnavailableError("payment-service")
        if response.status_code >= 400:
            raise PermanentError(f"Payment API returned {response.status_code}")
        return response.json()


# Advanced: custom retry condition with context logging
@retry(
    retry=retry_if_exception_type((TransientError, ConnectionError, TimeoutError)),
    wait=wait_exponential_jitter(initial=1, max=60, jitter=5),
    stop=stop_after_attempt(5),
    before_sleep=before_sleep_log(logger, structlog.stdlib.WARNING),
    reraise=True,  # Re-raise the last exception if all retries fail
)
async def fetch_user_profile(user_id: str) -> dict:
    """Fetch user profile with full retry protection."""
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(10.0, connect=3.0)) as client:
            response = await client.get(f"https://users.internal/profiles/{user_id}")
    except httpx.ConnectTimeout:
        raise NetworkTimeoutError("user-service", timeout_seconds=3.0)
    except httpx.ReadTimeout:
        raise NetworkTimeoutError("user-service", timeout_seconds=10.0)
    except httpx.ConnectError:
        raise TransientError("user-service connection failed", error_code="CONNECT_FAILED")

    if response.status_code == 404:
        raise NotFoundError("user", user_id)  # Permanent -- do not retry
    if response.status_code >= 500:
        raise ServiceUnavailableError("user-service")  # Transient -- retry
    response.raise_for_status()
    return response.json()
```

### Node.js: p-retry

```typescript
import pRetry, { AbortError } from "p-retry";

async function callPaymentService(paymentId: string): Promise<PaymentResult> {
  return pRetry(
    async () => {
      const response = await fetch(
        `https://payments.internal/charge/${paymentId}`,
        { signal: AbortSignal.timeout(5000) }
      );

      // Permanent errors: abort immediately, do not retry
      if (response.status === 400 || response.status === 401 || response.status === 404) {
        throw new AbortError(`Permanent failure: ${response.status}`);
      }

      // Transient errors: throw normally, p-retry will retry
      if (response.status === 429 || response.status >= 500) {
        throw new Error(`Transient failure: ${response.status}`);
      }

      return response.json();
    },
    {
      retries: 4,
      minTimeout: 500,   // First retry after ~500ms
      maxTimeout: 30000,  // Cap at 30s
      factor: 2,          // Exponential: 500ms, 1s, 2s, 4s
      randomize: true,    // Adds jitter
      onFailedAttempt: (error) => {
        console.warn(
          `Payment call attempt ${error.attemptNumber} failed. ` +
          `${error.retriesLeft} retries left.`,
        );
      },
    },
  );
}
```

### Retry Rules -- Non-Negotiable

- **NEVER retry non-idempotent requests** without an idempotency key. Retrying a `POST /charge` without one can double-charge a customer.
- **NEVER retry 4xx errors** (except 429). A 400 Bad Request will still be 400 on the next attempt.
- **Always set `max_retries`** (3-5 is typical). Without a cap, a persistent failure retries forever.
- **Always set `max_delay`** (30s-60s). Without a cap, exponential backoff reaches absurd delays.
- **Always set a timeout on the underlying call.** Retry logic without a timeout just stacks up hanging connections.

---

## 3. Circuit Breaker Pattern

A circuit breaker stops calling a failing service. Without it, every request to your service blocks for the timeout duration waiting for a dead dependency.

### State Machine

```
      success              failure_threshold reached
  +-----------+          +----------------------+
  |           |          |                      |
  v    OK     |          v     FAILING          |
CLOSED -------+-----> OPEN ---------> HALF-OPEN
  ^                     |                |
  |                     | recovery_timeout
  |                     | expires        |
  |                     +-----> probe ----+
  |                               |
  +---------- success ------------+
              (close circuit)
```

- **Closed**: Normal operation. Failures are counted.
- **Open**: Circuit is tripped. All calls fail immediately with a fallback. No requests reach the downstream service.
- **Half-Open**: After `recovery_timeout`, one probe request is allowed through. If it succeeds, circuit closes. If it fails, circuit re-opens.

### Python: pybreaker

```python
import pybreaker
import structlog

logger = structlog.get_logger()


class CircuitBreakerListener(pybreaker.CircuitBreakerListener):
    def state_change(self, cb, old_state, new_state):
        logger.warning(
            "circuit_breaker_state_change",
            breaker=cb.name,
            old_state=old_state.name,
            new_state=new_state.name,
        )

    def failure(self, cb, exc):
        logger.warning("circuit_breaker_failure", breaker=cb.name, error=str(exc))


payment_breaker = pybreaker.CircuitBreaker(
    name="payment-service",
    fail_max=5,              # Open after 5 failures
    reset_timeout=30,        # Try again after 30 seconds
    exclude=[PermanentError],  # Don't count permanent errors as failures
    listeners=[CircuitBreakerListener()],
)


@payment_breaker
async def call_payment_service(payment_id: str) -> dict:
    """Wrapped by circuit breaker. Raises CircuitBreakerError when open."""
    async with httpx.AsyncClient(timeout=5.0) as client:
        response = await client.post(f"https://payments.internal/charge/{payment_id}")
        if response.status_code >= 500:
            raise ServiceUnavailableError("payment-service")
        if response.status_code == 404:
            raise NotFoundError("payment", payment_id)
        return response.json()


# Calling code with fallback
async def process_payment(payment_id: str) -> dict:
    try:
        return await call_payment_service(payment_id)
    except pybreaker.CircuitBreakerError:
        logger.error("circuit_open", service="payment-service", payment_id=payment_id)
        # Fallback: queue for later processing
        await enqueue_for_retry("payment", payment_id)
        return {"status": "queued", "message": "Payment will be processed shortly"}
```

### Node.js: opossum

```typescript
import CircuitBreaker from "opossum";

const paymentBreaker = new CircuitBreaker(callPaymentService, {
  timeout: 5000,            // If function takes longer than 5s, trip
  errorThresholdPercentage: 50,  // Open at 50% failure rate
  resetTimeout: 30000,      // Try again after 30s
  volumeThreshold: 5,       // Minimum calls before tripping
});

paymentBreaker.on("open", () =>
  console.error("Circuit OPEN: payment-service is down"),
);
paymentBreaker.on("halfOpen", () =>
  console.warn("Circuit HALF-OPEN: probing payment-service"),
);
paymentBreaker.on("close", () =>
  console.info("Circuit CLOSED: payment-service recovered"),
);

// Fallback when circuit is open
paymentBreaker.fallback(async (paymentId: string) => {
  await enqueueForRetry("payment", paymentId);
  return { status: "queued", message: "Payment will be processed shortly" };
});

// Usage
const result = await paymentBreaker.fire(paymentId);
```

### Circuit Breaker Rules

- Use circuit breakers for **every external service call** -- APIs, databases, caches, message brokers
- **Exclude permanent errors** from the failure count. A 404 is not a service failure.
- Set `fail_max` / `errorThresholdPercentage` based on your traffic. High-traffic services can use percentage-based thresholds. Low-traffic services should use absolute counts.
- `recovery_timeout` should be long enough for the downstream to actually recover (15s-60s)
- **Always implement a fallback** -- returning a cached value, queuing for later, or returning a degraded response
- Log every state change. Circuit breaker events are your early warning system.

---

## 4. Graceful Degradation

Non-critical features must not take down critical ones. If your analytics service is down, users should still be able to place orders. If email is down, the signup should still succeed.

### The Pattern

```python
import structlog
from functools import wraps
from typing import TypeVar, Callable, Any

logger = structlog.get_logger()
T = TypeVar("T")


def graceful_degradation(
    fallback_value: T,
    service_name: str,
    alert: bool = False,
) -> Callable:
    """Decorator: catch failures in non-critical operations, return fallback."""

    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @wraps(func)
        async def wrapper(*args: Any, **kwargs: Any) -> T:
            try:
                return await func(*args, **kwargs)
            except Exception as exc:
                logger.warning(
                    "graceful_degradation_activated",
                    service=service_name,
                    error_type=type(exc).__name__,
                    error=str(exc),
                    fallback=str(fallback_value),
                )
                if alert:
                    await send_alert(f"{service_name} degraded: {exc}")
                return fallback_value

        return wrapper

    return decorator


# --- Usage ---

@graceful_degradation(fallback_value=[], service_name="recommendations")
async def get_recommendations(user_id: str) -> list[dict]:
    """If recommendation engine is down, return empty list."""
    async with httpx.AsyncClient(timeout=3.0) as client:
        resp = await client.get(f"https://recs.internal/users/{user_id}")
        resp.raise_for_status()
        return resp.json()


@graceful_degradation(fallback_value=None, service_name="analytics")
async def track_page_view(user_id: str, page: str) -> None:
    """If analytics is down, skip tracking. User flow continues."""
    async with httpx.AsyncClient(timeout=2.0) as client:
        await client.post("https://analytics.internal/events", json={
            "user_id": user_id, "page": page, "event": "page_view",
        })


@graceful_degradation(fallback_value=True, service_name="email")
async def send_welcome_email(email: str) -> bool:
    """If email fails, queue for later. Return True so signup continues."""
    await email_client.send(to=email, template="welcome")
    return True


# In the request handler -- critical path is protected
async def handle_signup(request: SignupRequest) -> SignupResponse:
    # CRITICAL: Must succeed for the request to succeed
    user = await create_user(request.email, request.password)

    # NON-CRITICAL: Failures are logged and swallowed
    await track_page_view(user.id, "signup")
    await send_welcome_email(user.email)
    recommendations = await get_recommendations(user.id)

    return SignupResponse(user_id=user.id, recommendations=recommendations)
```

### Feature Flags as Kill Switches

When a non-critical service is causing cascading problems, you need a kill switch -- not a code deploy.

```python
import structlog

logger = structlog.get_logger()

# Simple feature flag store (use LaunchDarkly, Unleash, or similar in production)
FEATURE_FLAGS: dict[str, bool] = {
    "recommendations_enabled": True,
    "analytics_enabled": True,
    "email_enabled": True,
}


def is_enabled(flag: str) -> bool:
    return FEATURE_FLAGS.get(flag, False)


async def handle_signup(request: SignupRequest) -> SignupResponse:
    user = await create_user(request.email, request.password)

    if is_enabled("analytics_enabled"):
        await track_page_view(user.id, "signup")

    if is_enabled("email_enabled"):
        await send_welcome_email(user.email)

    recommendations = []
    if is_enabled("recommendations_enabled"):
        recommendations = await get_recommendations(user.id)

    return SignupResponse(user_id=user.id, recommendations=recommendations)
```

**Rules:**
- Every non-critical service call is wrapped in a try/except with logging
- The critical path (user creation, payment processing, data writes) is never wrapped in a blanket try/except
- Feature flags let you disable broken integrations without deploying code
- Short timeouts on non-critical calls (2-3s). Do not let a slow recommendation engine add 30 seconds to your signup flow.
- Graceful degradation is not an excuse to ignore failures. Log every activation and alert if frequency exceeds a threshold.

---

## 5. Structured Error Logging

Every error log must answer five questions: **what** happened, **where**, **when**, **who** was affected, and **how bad** is it. Unstructured error logs (`logger.error(f"Error: {e}")`) are useless in production.

### The Structured Error Pattern

```python
import structlog
import traceback
from enum import Enum

logger = structlog.get_logger()


class ErrorSeverity(str, Enum):
    EXPECTED = "expected"      # Business logic: user not found, invalid input
    UNEXPECTED = "unexpected"  # Bugs: null pointer, type error, assertion
    CRITICAL = "critical"      # Infrastructure: DB down, OOM, disk full


def log_error(
    exc: Exception,
    *,
    severity: ErrorSeverity,
    request_id: str | None = None,
    user_id: str | None = None,
    operation: str | None = None,
    context: dict | None = None,
) -> None:
    """Structured error logging with full context.

    Every error log produced by this function can be queried in your
    log aggregator by error_type, severity, request_id, or user_id.
    """
    error_data = {
        "error_type": type(exc).__name__,
        "error_message": str(exc),
        "severity": severity.value,
        "operation": operation,
        "request_id": request_id,
        "user_id": user_id,
        **(context or {}),
    }

    if severity == ErrorSeverity.EXPECTED:
        # Business logic errors: warning level, no stack trace
        logger.warning("expected_error", **error_data)
    elif severity == ErrorSeverity.UNEXPECTED:
        # Bugs: error level with full stack trace
        error_data["stack_trace"] = traceback.format_exc()
        logger.error("unexpected_error", **error_data)
    elif severity == ErrorSeverity.CRITICAL:
        # Infrastructure failures: critical level, alert immediately
        error_data["stack_trace"] = traceback.format_exc()
        logger.critical("critical_error", **error_data)


# --- Usage in handlers ---

async def get_user(user_id: str, request_id: str) -> dict:
    try:
        return await user_repo.find(user_id)
    except NotFoundError as exc:
        log_error(
            exc,
            severity=ErrorSeverity.EXPECTED,
            request_id=request_id,
            user_id=user_id,
            operation="get_user",
        )
        raise
    except DatabaseError as exc:
        log_error(
            exc,
            severity=ErrorSeverity.CRITICAL,
            request_id=request_id,
            user_id=user_id,
            operation="get_user",
            context={"db_host": settings.db_host},
        )
        raise ServiceUnavailableError("database")
    except Exception as exc:
        log_error(
            exc,
            severity=ErrorSeverity.UNEXPECTED,
            request_id=request_id,
            user_id=user_id,
            operation="get_user",
        )
        raise
```

**Rules:**
- **Stack traces go in the log, never in the API response.** The log is for developers. The response is for users.
- **Categorize every error** as expected (business logic) or unexpected (bugs). This is how you filter dashboards: unexpected errors are action items; expected errors are metrics.
- **Every error log includes `request_id`.** Without it, correlating a user's bug report to your logs is impossible.
- **Log the operation name.** "Error in get_user" is searchable. "Error" is not.

---

## 6. Error Propagation Strategy

Where you catch an error matters as much as how you handle it. Catching too early hides problems. Catching too late produces garbage error messages.

### Catch at Boundaries, Not Everywhere

```python
# BAD: Catching too early -- hides the error from the caller
async def get_user(user_id: str) -> dict | None:
    try:
        return await db.fetch_user(user_id)
    except Exception:
        return None  # Caller has no idea what went wrong


# GOOD: Let it propagate, catch at the boundary (request handler)
async def get_user(user_id: str) -> dict:
    return await db.fetch_user(user_id)  # Raises if something is wrong


# The request handler is the boundary -- catch and transform here
@app.get("/users/{user_id}")
async def handle_get_user(user_id: str, request: Request):
    try:
        user = await get_user(user_id)
    except NotFoundError:
        raise HTTPException(status_code=404, detail="User not found")
    except DatabaseError:
        raise HTTPException(status_code=503, detail="Service temporarily unavailable")
    return user
```

### Transform Errors at Boundaries

Internal errors should not leak to external consumers. Transform them at every boundary: service-to-handler, service-to-service, service-to-client.

```python
# Re-raise with context -- Python's exception chaining
try:
    result = await payment_gateway.charge(amount, card_token)
except PaymentGatewayTimeout as exc:
    raise ServiceUnavailableError("payment processing timed out") from exc
    # The original exception is preserved in __cause__ for debugging
    # but the caller sees a domain-specific error


# Transform at API boundary
async def api_error_handler(request: Request, exc: ServiceError) -> JSONResponse:
    """Map internal errors to HTTP responses. Never leak internal details."""
    status_map = {
        "NOT_FOUND": 404,
        "VALIDATION_ERROR": 422,
        "AUTH_FAILED": 401,
        "RATE_LIMITED": 429,
        "SERVICE_UNAVAILABLE": 503,
    }
    status_code = status_map.get(exc.error_code, 500)

    # User-facing message: safe, generic
    # Developer-facing log: full context, stack trace
    return JSONResponse(
        status_code=status_code,
        content={
            "error": exc.error_code,
            "message": exc.message if status_code < 500 else "An internal error occurred",
            "request_id": getattr(request.state, "request_id", None),
        },
    )
```

### Rules

- **Catch at boundaries** (request handlers, queue consumers, CLI entry points), not in utility functions
- **Re-raise with context**: `raise NewError("context") from original` preserves the chain
- **Transform at every boundary**: internal errors become domain errors become HTTP errors
- **Never return `None` to signal an error.** Use exceptions. `None` is ambiguous -- is it "not found" or "something crashed"?
- **User-facing messages** must be safe and helpful. **Developer-facing logs** must be detailed and complete. These are different things.

---

## 7. Dead-Letter Queues (DLQ)

For queue-based systems, failed messages must go somewhere. If you silently drop them, you lose data. If you retry forever, you block the queue.

### The Pattern

```
Message arrives
    |
    v
Process message
    |
    +-- Success --> Acknowledge
    |
    +-- Transient failure --> Retry (up to N times)
    |                            |
    |                            +-- All retries exhausted
    |                            |
    v                            v
    Permanent failure -----> Dead-Letter Queue
                                |
                                v
                          Alert on-call
                                |
                                v
                          Manual review & replay
```

### Python Implementation

```python
import structlog
import json
from datetime import datetime, UTC
from dataclasses import dataclass, field

logger = structlog.get_logger()


@dataclass
class DeadLetter:
    original_message: dict
    error: str
    error_type: str
    attempts: int
    first_failure: str
    last_failure: str
    queue_name: str
    metadata: dict = field(default_factory=dict)


class DeadLetterQueue:
    """Simple DLQ backed by a database table.

    In production, use your message broker's native DLQ support
    (SQS DLQ, RabbitMQ dead-letter exchange, Kafka DLT topic).
    This pattern works when you need custom DLQ logic.
    """

    def __init__(self, db_pool, table_name: str = "dead_letters"):
        self.db_pool = db_pool
        self.table_name = table_name

    async def send(self, dead_letter: DeadLetter) -> None:
        async with self.db_pool.acquire() as conn:
            await conn.execute(
                f"""
                INSERT INTO {self.table_name}
                    (queue_name, original_message, error, error_type,
                     attempts, first_failure, last_failure, metadata)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                """,
                dead_letter.queue_name,
                json.dumps(dead_letter.original_message),
                dead_letter.error,
                dead_letter.error_type,
                dead_letter.attempts,
                dead_letter.first_failure,
                dead_letter.last_failure,
                json.dumps(dead_letter.metadata),
            )
        logger.error(
            "message_sent_to_dlq",
            queue=dead_letter.queue_name,
            error_type=dead_letter.error_type,
            attempts=dead_letter.attempts,
        )

    async def replay(self, dead_letter_id: int, processor) -> bool:
        """Replay a dead letter. Returns True if reprocessing succeeded."""
        async with self.db_pool.acquire() as conn:
            row = await conn.fetchrow(
                f"SELECT * FROM {self.table_name} WHERE id = $1", dead_letter_id
            )
            if not row:
                return False
            message = json.loads(row["original_message"])
            await processor(message)
            await conn.execute(
                f"DELETE FROM {self.table_name} WHERE id = $1", dead_letter_id
            )
            return True


# --- Queue consumer with DLQ ---

MAX_RETRIES = 3

async def consume_message(message: dict, dlq: DeadLetterQueue) -> None:
    attempts = 0
    first_failure = None

    while attempts <= MAX_RETRIES:
        try:
            await process_order(message)
            return  # Success
        except PermanentError as exc:
            # Permanent failure: skip retries, go straight to DLQ
            await dlq.send(DeadLetter(
                original_message=message,
                error=str(exc),
                error_type=type(exc).__name__,
                attempts=1,
                first_failure=datetime.now(UTC).isoformat(),
                last_failure=datetime.now(UTC).isoformat(),
                queue_name="orders",
            ))
            return
        except TransientError as exc:
            attempts += 1
            if first_failure is None:
                first_failure = datetime.now(UTC).isoformat()

            if attempts > MAX_RETRIES:
                await dlq.send(DeadLetter(
                    original_message=message,
                    error=str(exc),
                    error_type=type(exc).__name__,
                    attempts=attempts,
                    first_failure=first_failure,
                    last_failure=datetime.now(UTC).isoformat(),
                    queue_name="orders",
                ))
                return

            delay = min(0.5 * (2 ** attempts), 30)
            logger.warning(
                "message_retry",
                attempt=attempts,
                max_retries=MAX_RETRIES,
                delay=delay,
                error=str(exc),
            )
            await asyncio.sleep(delay)
```

### DLQ Table Schema

```sql
CREATE TABLE dead_letters (
    id BIGSERIAL PRIMARY KEY,
    queue_name TEXT NOT NULL,
    original_message JSONB NOT NULL,
    error TEXT NOT NULL,
    error_type TEXT NOT NULL,
    attempts INTEGER NOT NULL,
    first_failure TIMESTAMPTZ NOT NULL,
    last_failure TIMESTAMPTZ NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    replayed_at TIMESTAMPTZ
);

CREATE INDEX ix_dead_letters_queue ON dead_letters (queue_name, created_at);
CREATE INDEX ix_dead_letters_not_replayed ON dead_letters (queue_name)
  WHERE replayed_at IS NULL;
```

**Rules:**
- Every queue consumer MUST have a DLQ. No exceptions.
- Permanent errors go to DLQ immediately -- retrying will not help.
- Transient errors get N retries with backoff, then DLQ.
- Alert on DLQ message count. A growing DLQ means something is systematically broken.
- Build a replay mechanism from day one. You will need it.

---

## 8. Database Error Handling

Database errors are not generic exceptions. Each type has a specific correct response.

```python
from sqlalchemy.exc import (
    OperationalError,
    IntegrityError,
    TimeoutError as SATimeoutError,
)
from asyncpg.exceptions import (
    DeadlockDetectedError,
    UniqueViolationError,
    TooManyConnectionsError,
)
import structlog

logger = structlog.get_logger()


async def execute_with_db_error_handling(
    operation: str,
    func,
    *args,
    request_id: str | None = None,
    **kwargs,
):
    """Wraps database operations with correct error classification."""
    try:
        return await func(*args, **kwargs)

    except TooManyConnectionsError:
        # Connection pool exhausted: 503, back off
        logger.error(
            "db_pool_exhausted",
            operation=operation,
            request_id=request_id,
        )
        raise ServiceUnavailableError("database connection pool exhausted")

    except DeadlockDetectedError:
        # Deadlock: retry once, then fail
        logger.warning(
            "db_deadlock",
            operation=operation,
            request_id=request_id,
        )
        try:
            return await func(*args, **kwargs)  # Single retry
        except DeadlockDetectedError:
            logger.error("db_deadlock_persistent", operation=operation)
            raise ServiceUnavailableError("database deadlock")

    except UniqueViolationError as exc:
        # Unique constraint: 409 Conflict
        logger.info(
            "db_unique_violation",
            operation=operation,
            detail=str(exc),
            request_id=request_id,
        )
        raise PermanentError(
            "Resource already exists",
            error_code="CONFLICT",
        )

    except SATimeoutError:
        # Query timeout: log slow query, return 504
        logger.error(
            "db_query_timeout",
            operation=operation,
            request_id=request_id,
        )
        raise ServiceUnavailableError("database query timed out")

    except OperationalError as exc:
        # Connection errors, server gone, etc.
        logger.error(
            "db_operational_error",
            operation=operation,
            error=str(exc),
            request_id=request_id,
        )
        raise ServiceUnavailableError("database unavailable")


# Usage
user = await execute_with_db_error_handling(
    "get_user",
    user_repo.find_by_id,
    user_id,
    request_id=request.state.request_id,
)
```

**Database error response cheat sheet:**

| Error | HTTP Status | Retry? | Action |
|-------|-------------|--------|--------|
| Connection pool exhausted | 503 | Yes (after delay) | Log, alert if sustained |
| Deadlock detected | 503 | Once | Log warning, retry once |
| Unique constraint violation | 409 | No | Return conflict to client |
| Query timeout | 504 | No | Log slow query, investigate |
| Connection refused | 503 | Yes (with backoff) | Alert immediately |
| Foreign key violation | 422 | No | Return validation error |
| Check constraint violation | 422 | No | Return validation error |

---

## 9. External API Call Pattern -- The Complete Picture

This is the complete pattern for calling an external service in production. It combines timeout, retry, circuit breaker, graceful degradation, and structured logging.

```python
import httpx
import pybreaker
import structlog
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential_jitter,
    retry_if_exception_type,
    before_sleep_log,
)

logger = structlog.get_logger()

# --- Layer 1: Circuit Breaker ---
inventory_breaker = pybreaker.CircuitBreaker(
    name="inventory-service",
    fail_max=5,
    reset_timeout=30,
    exclude=[PermanentError],
    listeners=[CircuitBreakerListener()],
)

# --- Layer 2: Retry with backoff ---
@retry(
    retry=retry_if_exception_type(TransientError),
    wait=wait_exponential_jitter(initial=0.5, max=15, jitter=2),
    stop=stop_after_attempt(3),
    before_sleep=before_sleep_log(logger, structlog.stdlib.WARNING),
    reraise=True,
)
@inventory_breaker  # Layer 1 wraps layer 2
async def _call_inventory_service(sku: str) -> dict | None:
    """Raw call with timeout, retry, and circuit breaker."""
    try:
        # Layer 3: Timeout on every call
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(5.0, connect=2.0)
        ) as client:
            response = await client.get(
                f"https://inventory.internal/stock/{sku}",
                headers={"X-Request-ID": structlog.contextvars.get_contextvars().get("request_id", "")},
            )
    except httpx.ConnectTimeout:
        raise NetworkTimeoutError("inventory-service", timeout_seconds=2.0)
    except httpx.ReadTimeout:
        raise NetworkTimeoutError("inventory-service", timeout_seconds=5.0)
    except httpx.ConnectError:
        raise TransientError("inventory-service connection failed", error_code="CONNECT_FAILED")

    if response.status_code == 404:
        return None  # SKU not found is a valid business outcome, not an error
    if response.status_code == 429:
        raise RateLimitedError("inventory-service")
    if response.status_code >= 500:
        raise ServiceUnavailableError("inventory-service")
    if response.status_code >= 400:
        raise PermanentError(
            f"inventory-service returned {response.status_code}",
            error_code="UPSTREAM_CLIENT_ERROR",
        )

    return response.json()


# --- Layer 4: Graceful degradation ---
async def get_stock_level(sku: str, request_id: str) -> dict:
    """Public interface. Never raises -- always returns a usable response."""
    try:
        result = await _call_inventory_service(sku)
        if result is None:
            return {"sku": sku, "in_stock": False, "source": "live"}
        return {**result, "source": "live"}

    except pybreaker.CircuitBreakerError:
        logger.warning("inventory_circuit_open", sku=sku, request_id=request_id)
        # Fallback: serve from cache
        cached = await cache.get(f"stock:{sku}")
        if cached:
            return {**cached, "source": "cache", "stale": True}
        return {"sku": sku, "in_stock": True, "source": "default", "stale": True}

    except TransientError as exc:
        # All retries exhausted
        logger.error(
            "inventory_call_failed",
            sku=sku,
            error=str(exc),
            request_id=request_id,
        )
        cached = await cache.get(f"stock:{sku}")
        if cached:
            return {**cached, "source": "cache", "stale": True}
        return {"sku": sku, "in_stock": True, "source": "default", "stale": True}

    except PermanentError as exc:
        logger.error(
            "inventory_permanent_failure",
            sku=sku,
            error=str(exc),
            request_id=request_id,
        )
        raise  # Permanent errors propagate -- something is wrong with our request
```

### The Call Flow

```
Request arrives
    |
    v
get_stock_level()  -- public interface, handles degradation
    |
    v
_call_inventory_service()  -- wrapped with retry + circuit breaker
    |
    +-- Circuit breaker check: is circuit open?
    |       |
    |       +-- Yes: raise CircuitBreakerError --> fallback to cache
    |       +-- No: proceed
    |
    +-- HTTP call with 5s timeout
    |       |
    |       +-- Timeout: raise TransientError --> retry with backoff
    |       +-- 503/429: raise TransientError --> retry with backoff
    |       +-- 4xx: raise PermanentError --> fail immediately
    |       +-- 200: return result --> cache it
    |
    +-- All retries exhausted: TransientError propagates --> fallback to cache
    |
    +-- Circuit breaker records failure, may trip open
```

---

## Detection Patterns

Use these to find error handling problems in existing code.

**Bare except clauses (swallows ALL errors including KeyboardInterrupt):**

```bash
grep -rn "except:" --include="*.py" | grep -v "except:$\|# noqa"
```

**Silently swallowed errors:**

```bash
grep -rn -A2 "except" --include="*.py" | grep -E "pass$|continue$"
```

**Missing timeouts on HTTP calls:**

```bash
grep -rn "httpx\.\|requests\.\|aiohttp\." --include="*.py" | grep -v "timeout"
```

**Missing retry logic on external calls:**

```bash
grep -rn "async with httpx\|await.*\.get(\|await.*\.post(" --include="*.py" | grep -v "@retry\|tenacity\|backoff"
```

**Bare string exceptions in logs (not structured):**

```bash
grep -rn 'logger\.\(error\|warning\|critical\)(f"' --include="*.py"
```

**Stack traces returned to users:**

```bash
grep -rn "traceback\.\|format_exc\|exc_info" --include="*.py" | grep -v "logger\.\|log\.\|logging\."
```

---

## Anti-Patterns

| Anti-Pattern | Why It Is Bad | Fix |
|---|---|---|
| `except: pass` | Swallows ALL errors including OOM, keyboard interrupt | Catch specific exceptions, always log |
| `except Exception as e: return None` | Hides failures from callers, impossible to debug | Raise domain exceptions, catch at boundaries |
| Linear retry (fixed delay) | Thundering herd on recovery | Exponential backoff with jitter |
| Retry without max attempts | Infinite loop on persistent failures | `stop_after_attempt(3-5)` |
| Retry on 4xx errors | Wastes resources, will never succeed | Only retry `TransientError` |
| No timeout on HTTP calls | Dead service holds connections forever | Explicit timeout on every call |
| Stack trace in API response | Leaks internals (file paths, SQL, versions) | Log the trace, return generic message |
| Catching too broadly in utils | Hides bugs, returns garbage | Catch at boundaries, let utils raise |
| No circuit breaker on external calls | Every request waits for timeout when service is down | Circuit breaker with fallback |
| `raise Exception("something")` | Uncategorized, cannot be handled specifically | Use domain exception hierarchy |

---

## Cross-References

- For FastAPI error handler registration and RFC 7807 responses, see **production-fastapi**
- For database connection pool exhaustion and query timeouts, see **production-postgres**
- For health check endpoints that detect when dependencies are failing, see **production-fastapi**
- For monitoring, alerting, and error rate dashboards, see **production-monitoring**
- For security review of error handling (information leakage), see **production-security**
- For deployment rollback when error rates spike, see **production-deploy**
- For architecture planning with failure mode analysis, see **production-planner**
