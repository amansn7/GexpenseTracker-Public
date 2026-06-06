"""
RFC 7807 Problem Details error handling for production FastAPI applications.

Usage:
  1. Copy this file into your project (e.g., app/error_handlers.py).
  2. Import and register handlers in your FastAPI app:

     from app.error_handlers import register_error_handlers, AppError
     register_error_handlers(app)

  3. Raise AppError subclasses in route handlers:

     raise NotFoundError("User not found")
     raise ValidationError("Email format is invalid")
     raise AuthenticationError("Token expired")

  4. Unhandled exceptions automatically return a safe 500 response
     (no tracebacks or internal details exposed) and are sent to
     Sentry if configured.

Requires: fastapi, structlog
"""

from __future__ import annotations

import structlog
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

logger = structlog.get_logger()


# ---------------------------------------------------------------------------
# Error type URI prefix — change this to your API's domain
# ---------------------------------------------------------------------------
ERROR_TYPE_BASE_URI = "https://api.example.com/errors"


# ---------------------------------------------------------------------------
# AppError hierarchy
# ---------------------------------------------------------------------------

class AppError(Exception):
    """Base class for all application-level errors.

    Every AppError subclass produces an RFC 7807 Problem Details response
    with a stable ``type`` URI, human-readable ``title``, and the
    ``request_id`` for cross-referencing with server logs.
    """

    def __init__(
        self,
        detail: str,
        status_code: int = 500,
        error_type: str = "internal_error",
    ) -> None:
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code
        self.error_type = error_type


class NotFoundError(AppError):
    """Resource not found (404)."""

    def __init__(self, detail: str = "The requested resource was not found.") -> None:
        super().__init__(detail=detail, status_code=404, error_type="not_found")


class ValidationError(AppError):
    """Request validation failed (422)."""

    def __init__(self, detail: str = "Request validation failed.") -> None:
        super().__init__(detail=detail, status_code=422, error_type="validation_error")


class AuthenticationError(AppError):
    """Authentication required or failed (401)."""

    def __init__(self, detail: str = "Authentication required.") -> None:
        super().__init__(detail=detail, status_code=401, error_type="authentication_error")


class AuthorizationError(AppError):
    """Insufficient permissions (403)."""

    def __init__(self, detail: str = "You do not have permission to perform this action.") -> None:
        super().__init__(detail=detail, status_code=403, error_type="authorization_error")


class ConflictError(AppError):
    """Resource conflict (409) — e.g., duplicate email, version mismatch."""

    def __init__(self, detail: str = "The request conflicts with the current state of the resource.") -> None:
        super().__init__(detail=detail, status_code=409, error_type="conflict")


class RateLimitedError(AppError):
    """Rate limit exceeded (429)."""

    def __init__(self, detail: str = "Too many requests. Please retry later.") -> None:
        super().__init__(detail=detail, status_code=429, error_type="rate_limited")


class ServiceUnavailableError(AppError):
    """Dependency is down (503)."""

    def __init__(self, detail: str = "Service temporarily unavailable. Please retry later.") -> None:
        super().__init__(detail=detail, status_code=503, error_type="service_unavailable")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_request_id(request: Request) -> str | None:
    """Safely extract request_id from request state."""
    return getattr(request.state, "request_id", None)


def _problem_details(
    *,
    error_type: str,
    status_code: int,
    detail: str,
    instance: str,
    request_id: str | None,
) -> dict:
    """Build an RFC 7807 Problem Details dict."""
    return {
        "type": f"{ERROR_TYPE_BASE_URI}/{error_type}",
        "title": error_type.replace("_", " ").title(),
        "status": status_code,
        "detail": detail,
        "instance": instance,
        "request_id": request_id,
    }


# ---------------------------------------------------------------------------
# Exception handlers
# ---------------------------------------------------------------------------

async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    """Handle known application errors.

    Logs at WARNING level (these are expected conditions, not bugs)
    and returns an RFC 7807 response with the specific error details.
    """
    request_id = _get_request_id(request)

    logger.warning(
        "handled_error",
        error_type=exc.error_type,
        status_code=exc.status_code,
        detail=exc.detail,
        path=str(request.url),
    )

    return JSONResponse(
        status_code=exc.status_code,
        content=_problem_details(
            error_type=exc.error_type,
            status_code=exc.status_code,
            detail=exc.detail,
            instance=str(request.url),
            request_id=request_id,
        ),
    )


async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
    """Handle unexpected/unhandled exceptions.

    - Logs the full traceback at ERROR level (operators see it in logs).
    - Sends the exception to Sentry if the SDK is installed.
    - Returns a safe 500 response that NEVER exposes tracebacks,
      SQL queries, or internal paths to the client.
    """
    request_id = _get_request_id(request)

    logger.exception(
        "unhandled_error",
        request_id=request_id,
        path=str(request.url),
        method=request.method,
    )

    # Sentry integration — capture if available, fail silently if not
    try:
        import sentry_sdk
        sentry_sdk.capture_exception(exc)
    except ImportError:
        pass

    return JSONResponse(
        status_code=500,
        content=_problem_details(
            error_type="internal_error",
            status_code=500,
            detail="An unexpected error occurred. Please contact support.",
            instance=str(request.url),
            request_id=request_id,
        ),
    )


# ---------------------------------------------------------------------------
# Registration
# ---------------------------------------------------------------------------

def register_error_handlers(app: FastAPI) -> None:
    """Register all error handlers on the FastAPI application.

    Call this once during app creation:

        app = FastAPI(...)
        register_error_handlers(app)
    """
    app.add_exception_handler(AppError, app_error_handler)
    app.add_exception_handler(Exception, unhandled_error_handler)
