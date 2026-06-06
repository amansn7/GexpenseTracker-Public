"""
Pure ASGI middleware implementations for production FastAPI applications.

Usage:
  1. Copy this file into your project (e.g., app/middleware.py).
  2. Register middleware in your FastAPI app in the correct order:

     app.add_middleware(CORSMiddleware, ...)          # 1. CORS (outermost)
     app.add_middleware(SecurityHeadersMiddleware)     # 2. Security headers
     app.add_middleware(RequestIDMiddleware)           # 3. Request ID generation
     app.add_middleware(LoggingMiddleware)             # 4. Request/response logging

  Middleware executes in an onion model — first added is outermost.

CRITICAL:
  NEVER use BaseHTTPMiddleware. It reads the entire request body into
  memory (no streaming), runs the endpoint in a separate anyio task
  (breaking contextvars), and catches exceptions (making error handling
  middleware unreliable). Pure ASGI middleware has zero overhead and
  full control.

Requires: structlog, starlette
"""

from __future__ import annotations

import time
import uuid

import structlog
from starlette.types import ASGIApp, Receive, Scope, Send

logger = structlog.get_logger()

# Path prefixes to exclude from access logging (health checks create noise)
_SILENT_PATHS: set[str] = {"/health/live", "/health/ready", "/health"}


# ---------------------------------------------------------------------------
# RequestIDMiddleware
# ---------------------------------------------------------------------------

class RequestIDMiddleware:
    """Generate a unique request ID for every HTTP/WebSocket request.

    - Stores the ID in ``scope["state"]["request_id"]`` so it is available
      via ``request.state.request_id`` in route handlers.
    - Binds the ID to structlog contextvars so every log line emitted during
      the request automatically includes ``request_id``.
    - Adds an ``X-Request-ID`` response header so callers can correlate
      requests to server-side logs.
    - Respects an incoming ``X-Request-ID`` header from upstream proxies.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] not in ("http", "websocket"):
            await self.app(scope, receive, send)
            return

        # Respect an incoming request ID from a trusted upstream proxy,
        # otherwise generate a new one.
        request_id: str | None = None
        for header_name, header_value in scope.get("headers", []):
            if header_name == b"x-request-id":
                request_id = header_value.decode("latin-1")
                break
        if not request_id:
            request_id = str(uuid.uuid4())

        # Store in scope so request.state.request_id works in handlers
        scope.setdefault("state", {})["request_id"] = request_id

        # Bind to structlog contextvars — every log line in this request
        # context will include request_id automatically.
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(request_id=request_id)

        async def send_with_request_id(message: dict) -> None:
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                headers.append((b"x-request-id", request_id.encode()))
                message["headers"] = headers
            await send(message)

        await self.app(scope, receive, send_with_request_id)


# ---------------------------------------------------------------------------
# LoggingMiddleware
# ---------------------------------------------------------------------------

class LoggingMiddleware:
    """Log every HTTP request with method, path, status code, and duration.

    - Skips health check endpoints to avoid log noise.
    - Captures the status code from the ``http.response.start`` message.
    - Logs at WARNING level for 4xx, ERROR for 5xx, INFO for everything else.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path: str = scope.get("path", "")

        # Skip health checks — they fire every few seconds and drown real logs
        if path in _SILENT_PATHS:
            await self.app(scope, receive, send)
            return

        method: str = scope.get("method", "UNKNOWN")
        start_time = time.perf_counter()
        status_code: int = 0

        async def send_wrapper(message: dict) -> None:
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message.get("status", 0)
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        except Exception:
            status_code = 500
            raise
        finally:
            duration_ms = round((time.perf_counter() - start_time) * 1000, 2)

            log_kwargs = {
                "method": method,
                "path": path,
                "status_code": status_code,
                "duration_ms": duration_ms,
            }

            if status_code >= 500:
                logger.error("http_request", **log_kwargs)
            elif status_code >= 400:
                logger.warning("http_request", **log_kwargs)
            else:
                logger.info("http_request", **log_kwargs)


# ---------------------------------------------------------------------------
# SecurityHeadersMiddleware
# ---------------------------------------------------------------------------

class SecurityHeadersMiddleware:
    """Add standard security headers to every HTTP response.

    Headers applied:
      - Strict-Transport-Security (HSTS with 2-year max-age)
      - X-Content-Type-Options: nosniff
      - X-Frame-Options: DENY
      - X-XSS-Protection: 0 (modern browsers; CSP is preferred)
      - Referrer-Policy: strict-origin-when-cross-origin
      - Permissions-Policy: deny camera, microphone, geolocation
    """

    SECURITY_HEADERS: list[tuple[bytes, bytes]] = [
        (b"strict-transport-security", b"max-age=63072000; includeSubDomains"),
        (b"x-content-type-options", b"nosniff"),
        (b"x-frame-options", b"DENY"),
        (b"x-xss-protection", b"0"),
        (b"referrer-policy", b"strict-origin-when-cross-origin"),
        (b"permissions-policy", b"camera=(), microphone=(), geolocation=()"),
    ]

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_with_headers(message: dict) -> None:
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                headers.extend(self.SECURITY_HEADERS)
                message["headers"] = headers
            await send(message)

        await self.app(scope, receive, send_with_headers)
