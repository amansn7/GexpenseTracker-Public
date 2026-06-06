# Error Handling Patterns -- Quick Reference

Lookup tables and cheat sheets extracted from the production-error-handling skill.

---

## Error Taxonomy

| Category | Response | Retry? | Alert? | Examples |
|------------|----------------------|--------|-------------------------|-------------------------------------------------------------|
| **Transient** | Retry with backoff | Yes | After N failures | Network timeout, 503, connection reset, rate limited (429) |
| **Permanent** | Fail immediately | Never | On unexpected frequency | 400, 401, 404, validation error, malformed input |
| **Partial** | Degrade gracefully | Optional | Low priority | Cache miss, analytics down, email service down |
| **Fatal** | Crash fast | Never | Immediate (PagerDuty) | Missing config, corrupt state, OOM, disk full |

---

## Retry Pattern Quick Reference

### Python -- tenacity

```python
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential_jitter,
    retry_if_exception_type,
    before_sleep_log,
)

@retry(
    retry=retry_if_exception_type(TransientError),
    wait=wait_exponential_jitter(initial=0.5, max=30, jitter=2),
    stop=stop_after_attempt(4),          # 1 initial + 3 retries
    before_sleep=before_sleep_log(logger, structlog.stdlib.INFO),
    reraise=True,                        # Re-raise last exception if all retries fail
)
```

| Parameter | Typical value | Purpose |
|-----------|---------------|---------|
| `initial` | 0.5 -- 1 | Base delay in seconds |
| `max` | 30 -- 60 | Cap to prevent absurd waits |
| `jitter` | 2 -- 5 | Random component to desynchronize clients |
| `stop_after_attempt` | 3 -- 5 | Total tries including the initial call |
| `reraise` | `True` | Propagate the last exception to the caller |

### Node.js -- p-retry

```typescript
import pRetry, { AbortError } from "p-retry";

const result = await pRetry(fn, {
  retries: 4,
  minTimeout: 500,      // First retry after ~500ms
  maxTimeout: 30000,    // Cap at 30s
  factor: 2,            // Exponential: 500ms, 1s, 2s, 4s
  randomize: true,      // Adds jitter
});
```

| Parameter | Typical value | Purpose |
|-----------|---------------|---------|
| `retries` | 3 -- 5 | Maximum retry attempts |
| `minTimeout` | 500 | Initial delay (ms) |
| `maxTimeout` | 30000 | Delay cap (ms) |
| `factor` | 2 | Exponential multiplier |
| `randomize` | `true` | Jitter to avoid thundering herd |

### Retry Rules -- Non-Negotiable

- NEVER retry non-idempotent requests without an idempotency key.
- NEVER retry 4xx errors (except 429).
- Always set `max_retries` (3-5 is typical).
- Always set `max_delay` (30s-60s).
- Always set a timeout on the underlying call.

---

## Circuit Breaker Quick Reference

### Python -- pybreaker

```python
import pybreaker

payment_breaker = pybreaker.CircuitBreaker(
    name="payment-service",
    fail_max=5,                     # Open after 5 failures
    reset_timeout=30,               # Try again after 30 seconds
    exclude=[PermanentError],       # Don't count permanent errors
    listeners=[CircuitBreakerListener()],
)
```

| Parameter | Typical value | Purpose |
|-----------|---------------|---------|
| `fail_max` | 5 | Absolute failure count before opening |
| `reset_timeout` | 15 -- 60 | Seconds before half-open probe |
| `exclude` | `[PermanentError]` | Errors that do NOT count as failures |

### Node.js -- opossum

```typescript
import CircuitBreaker from "opossum";

const breaker = new CircuitBreaker(fn, {
  timeout: 5000,                    // Trip if function takes longer than 5s
  errorThresholdPercentage: 50,     // Open at 50% failure rate
  resetTimeout: 30000,              // Try again after 30s
  volumeThreshold: 5,               // Minimum calls before tripping
});
```

| Parameter | Typical value | Purpose |
|-----------|---------------|---------|
| `timeout` | 5000 | Per-call timeout (ms) |
| `errorThresholdPercentage` | 50 | Failure rate to trip open |
| `resetTimeout` | 30000 | Delay before half-open probe (ms) |
| `volumeThreshold` | 5 | Minimum call count before percentage applies |

### Circuit Breaker State Machine

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

### Circuit Breaker Rules

- Use circuit breakers for every external service call (APIs, databases, caches, message brokers).
- Exclude permanent errors from the failure count.
- Always implement a fallback (cached value, queue for later, degraded response).
- Log every state change.

---

## Database Error Response Cheat Sheet

| Error | HTTP Status | Retry? | Action |
|-------------------------------|-------------|----------------------|--------------------------------------|
| Connection pool exhausted | 503 | Yes (after delay) | Log, alert if sustained |
| Deadlock detected | 503 | Once | Log warning, retry once |
| Unique constraint violation | 409 | No | Return conflict to client |
| Query timeout | 504 | No | Log slow query, investigate |
| Connection refused | 503 | Yes (with backoff) | Alert immediately |
| Foreign key violation | 422 | No | Return validation error |
| Check constraint violation | 422 | No | Return validation error |

---

## External API Call Flow

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

## Anti-Patterns

| Anti-Pattern | Why It Is Bad | Fix |
|----------------------------------------------|---------------------------------------------------------------|------------------------------------------------------|
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

## Detection Commands

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
