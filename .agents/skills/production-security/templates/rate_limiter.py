"""
Rate Limiting Setup for FastAPI using slowapi.

Provides:
  - General API limiter (60 requests/minute per IP)
  - Strict auth limiter (5 requests/minute per IP)
  - Per-user limiter (keyed by authenticated user ID)
  - RateLimitExceeded handler returning RFC 7807 problem detail with Retry-After

Reference: production-security SKILL.md, Section 5 — Rate Limiting.
"""

from fastapi import FastAPI, Request, Depends
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address


# =============================================================================
# Key Functions
# =============================================================================

def _get_remote_address(request: Request) -> str:
    """Default key: client IP address.

    If you are behind a reverse proxy (nginx, Cloud Run, ALB), make sure the
    proxy sets X-Forwarded-For and that slowapi / uvicorn is configured to
    trust it.  Otherwise every request looks like it comes from the proxy IP.
    """
    return get_remote_address(request)


def _get_user_id(request: Request) -> str:
    """Per-user key: extract user ID from the request state.

    This assumes your authentication middleware sets ``request.state.user_id``
    after validating the access token.  Adjust the attribute name to match
    your auth setup.
    """
    user_id = getattr(request.state, "user_id", None)
    if user_id is not None:
        return str(user_id)
    # Fall back to IP if the user is not authenticated.
    return get_remote_address(request)


# =============================================================================
# Limiter Instances
# =============================================================================

# General-purpose limiter keyed by IP address.
limiter = Limiter(key_func=_get_remote_address)

# Per-user limiter — apply to endpoints where authenticated users should each
# get their own quota (e.g., expensive compute, file exports).
user_limiter = Limiter(key_func=_get_user_id)


# =============================================================================
# Application Setup
# =============================================================================

app = FastAPI()

# Attach the default limiter to app state (required by slowapi).
app.state.limiter = limiter


# =============================================================================
# Exception Handler — RFC 7807 Problem Detail
# =============================================================================

@app.exception_handler(RateLimitExceeded)
async def rate_limit_exceeded_handler(
    request: Request,
    exc: RateLimitExceeded,
) -> JSONResponse:
    """Return a 429 response that follows RFC 7807 (Problem Details for HTTP APIs).

    Includes a ``Retry-After`` header so well-behaved clients know when to
    retry instead of hammering the endpoint.
    """
    retry_after = str(exc.retry_after)

    return JSONResponse(
        status_code=429,
        content={
            "type": "https://api.example.com/errors/rate_limited",
            "title": "Rate Limit Exceeded",
            "status": 429,
            "detail": "Too many requests. Slow down.",
            "retry_after": retry_after,
        },
        headers={
            "Retry-After": retry_after,
        },
    )


# =============================================================================
# Endpoint Examples
# =============================================================================

# --- General API: 60 requests/minute per IP ---

@app.get("/api/items")
@limiter.limit("60/minute")
async def list_items(request: Request):
    """Public listing endpoint with standard rate limit."""
    return {"items": []}


@app.get("/api/items/{item_id}")
@limiter.limit("60/minute")
async def get_item(request: Request, item_id: int):
    return {"item_id": item_id}


# --- Auth endpoints: MUCH stricter — 5 attempts/minute per IP ---

@app.post("/auth/login")
@limiter.limit("5/minute")
async def login(request: Request):
    """Brute-force protection: only 5 login attempts per minute per IP."""
    return {"message": "login"}


@app.post("/auth/register")
@limiter.limit("3/minute")
async def register(request: Request):
    return {"message": "registered"}


@app.post("/auth/password-reset")
@limiter.limit("3/minute")
async def password_reset(request: Request):
    return {"message": "reset email sent"}


# --- Per-user limiter: expensive operations ---

@app.post("/api/reports/export")
@user_limiter.limit("10/hour")
async def export_report(request: Request):
    """Expensive report generation — throttled per authenticated user."""
    return {"message": "export started"}


# =============================================================================
# Rate Limiting Rules — Quick Reference
# =============================================================================
#
# 1. Apply to ALL public endpoints, not just auth.
#
# 2. Auth endpoints (login, register, password-reset) get 10-12x stricter
#    limits than general endpoints.
#
# 3. Always return 429 Too Many Requests with a Retry-After header.
#    Well-behaved clients need this to back off correctly.
#
# 4. Log rate limit hits — a spike indicates an attack or a misbehaving client.
#
# 5. Prefer sliding window over fixed window.  Fixed window allows burst at
#    window boundaries (e.g., 60 requests at :59 and 60 more at :00).
#
# 6. For distributed systems, use Redis-backed rate limiting:
#        limiter = Limiter(
#            key_func=get_remote_address,
#            storage_uri="redis://localhost:6379/0",
#        )
#    In-memory storage is per-process and does not work behind a load balancer.
