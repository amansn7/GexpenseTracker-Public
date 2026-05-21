"""CSRF protection using double-submit cookie pattern."""
import secrets

from fastapi import HTTPException, Request


def generate_csrf_token() -> str:
    """Generate a cryptographically secure CSRF token."""
    return secrets.token_hex(32)


async def validate_csrf(request: Request) -> None:
    """Validate CSRF token from header matches cookie token."""
    cookie_token = request.cookies.get("csrf_token")
    header_token = request.headers.get("X-CSRF-Token")

    if not cookie_token or not header_token:
        raise HTTPException(status_code=403, detail="CSRF token missing")

    if not secrets.compare_digest(cookie_token, header_token):
        raise HTTPException(status_code=403, detail="CSRF token mismatch")
