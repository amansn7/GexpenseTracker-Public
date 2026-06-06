"""
Production health check endpoints for FastAPI applications.

Usage:
  1. Copy this file into your project (e.g., app/health_checks.py).
  2. Include the router in your FastAPI app:

     from app.health_checks import health_router
     app.include_router(health_router)

  3. Configure Kubernetes probes to point at these endpoints:

     livenessProbe:
       httpGet:
         path: /health/live
         port: 8000
       initialDelaySeconds: 5
       periodSeconds: 10
       failureThreshold: 3

     readinessProbe:
       httpGet:
         path: /health/ready
         port: 8000
       initialDelaySeconds: 10
       periodSeconds: 5
       failureThreshold: 3

     startupProbe:
       httpGet:
         path: /health/startup
         port: 8000
       initialDelaySeconds: 3
       periodSeconds: 5
       failureThreshold: 10

Endpoints:
  /health/live    - Liveness: is the process alive? Always 200.
  /health/ready   - Readiness: can we serve traffic? Checks dependencies.
  /health/startup - Startup: has initial bootstrap completed?

Rules:
  - /health/live NEVER checks dependencies. If the process runs, return 200.
  - /health/ready checks every dependency with a 2-second timeout each.
  - Exclude health endpoints from access logs and auth middleware.
  - Return structured JSON so operators can see which dependency is down.

Requires: fastapi, sqlalchemy (async), redis (optional)
"""

from __future__ import annotations

import asyncio
import time
from datetime import UTC, datetime

import structlog
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text

logger = structlog.get_logger()

health_router = APIRouter(tags=["health"])

# ---------------------------------------------------------------------------
# Module-level flag for startup probe
# ---------------------------------------------------------------------------
_startup_complete: bool = False


def mark_startup_complete() -> None:
    """Call this at the end of your lifespan startup block.

    Example:
        @asynccontextmanager
        async def lifespan(app: FastAPI):
            # ... initialize resources ...
            mark_startup_complete()
            yield
            # ... cleanup ...
    """
    global _startup_complete
    _startup_complete = True


def mark_startup_incomplete() -> None:
    """Call this during shutdown to reset the flag (optional, for testing)."""
    global _startup_complete
    _startup_complete = False


# ---------------------------------------------------------------------------
# Helper: run a dependency check with a timeout and measure latency
# ---------------------------------------------------------------------------

async def _check_dependency(
    name: str,
    check_coro,
    timeout_seconds: float = 2.0,
) -> dict:
    """Run a single dependency check with a timeout.

    Returns a dict with status, latency_ms, and optionally error.
    """
    start = time.perf_counter()
    try:
        async with asyncio.timeout(timeout_seconds):
            await check_coro
        elapsed_ms = round((time.perf_counter() - start) * 1000, 2)
        return {"status": "healthy", "latency_ms": elapsed_ms}
    except TimeoutError:
        elapsed_ms = round((time.perf_counter() - start) * 1000, 2)
        return {"status": "unhealthy", "error": "timeout", "latency_ms": elapsed_ms}
    except Exception as exc:
        elapsed_ms = round((time.perf_counter() - start) * 1000, 2)
        return {"status": "unhealthy", "error": str(exc), "latency_ms": elapsed_ms}


# ---------------------------------------------------------------------------
# Liveness — is the process alive?
# ---------------------------------------------------------------------------

@health_router.get("/health/live")
async def liveness() -> dict:
    """Liveness probe. Always returns 200 if the process is running.

    Used by load balancers and Kubernetes liveness probes to detect
    crashed processes. NEVER check dependencies here — a slow database
    should not cause the process to be killed and restarted.
    """
    return {"status": "alive", "timestamp": datetime.now(UTC).isoformat()}


# ---------------------------------------------------------------------------
# Readiness — can we handle requests?
# ---------------------------------------------------------------------------

@health_router.get("/health/ready")
async def readiness(request: Request) -> JSONResponse:
    """Readiness probe. Checks all dependencies with a 2-second timeout each.

    Used by Kubernetes readiness probes and load balancers. When this
    returns 503, the service is removed from the load balancer pool
    until dependencies recover.

    Checks (add or remove as needed):
      - Database: SELECT 1 via the async engine
      - Redis: PING command
    """
    checks: dict[str, dict] = {}
    all_healthy = True

    # ------------------------------------------------------------------
    # Database check
    # ------------------------------------------------------------------
    db_engine = getattr(request.app.state, "db_engine", None)
    if db_engine is not None:
        async def _db_check():
            async with db_engine.connect() as conn:
                await conn.execute(text("SELECT 1"))

        result = await _check_dependency("database", _db_check())
        checks["database"] = result
        if result["status"] != "healthy":
            all_healthy = False
    else:
        checks["database"] = {"status": "not_configured"}

    # ------------------------------------------------------------------
    # Redis check
    # ------------------------------------------------------------------
    redis_client = getattr(request.app.state, "redis", None)
    if redis_client is not None:
        result = await _check_dependency("redis", redis_client.ping())
        checks["redis"] = result
        if result["status"] != "healthy":
            all_healthy = False

    # ------------------------------------------------------------------
    # Add more dependency checks here following the same pattern:
    #
    #   result = await _check_dependency("name", some_async_call())
    #   checks["name"] = result
    #   if result["status"] != "healthy":
    #       all_healthy = False
    # ------------------------------------------------------------------

    status_code = 200 if all_healthy else 503
    return JSONResponse(
        status_code=status_code,
        content={
            "status": "ready" if all_healthy else "not_ready",
            "checks": checks,
            "timestamp": datetime.now(UTC).isoformat(),
        },
    )


# ---------------------------------------------------------------------------
# Startup — has the application finished bootstrapping?
# ---------------------------------------------------------------------------

@health_router.get("/health/startup")
async def startup_check() -> JSONResponse:
    """Startup probe. Returns 200 only after the lifespan startup block
    has completed and mark_startup_complete() has been called.

    Kubernetes startup probes use this to avoid killing slow-starting
    containers. The startup probe runs first; liveness and readiness
    probes only begin after the startup probe succeeds.
    """
    if _startup_complete:
        return JSONResponse(
            status_code=200,
            content={
                "status": "started",
                "timestamp": datetime.now(UTC).isoformat(),
            },
        )
    return JSONResponse(
        status_code=503,
        content={
            "status": "starting",
            "timestamp": datetime.now(UTC).isoformat(),
        },
    )
