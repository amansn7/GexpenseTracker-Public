import asyncio
from fastapi import APIRouter, Depends
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.gmail.auth import get_oauth_flow, save_credentials, is_authenticated
from app.database import get_db
from app.auth_deps import get_current_user as _get_current_user

router = APIRouter()
_pending: dict = {}


@router.get("/auth/gmail")
async def start_auth():
    flow = get_oauth_flow()
    auth_url, state = flow.authorization_url(access_type="offline", prompt="consent")
    _pending["state"] = state
    _pending["flow"] = flow
    return RedirectResponse(auth_url)


@router.get("/auth/callback")
async def auth_callback(code: str, state: str):
    flow = _pending.get("flow")
    if not flow:
        return {"error": "No pending auth flow. Visit /api/auth/gmail first."}
    if state != _pending.get("state"):
        return {"error": "State mismatch. Possible CSRF attack."}
    await asyncio.to_thread(flow.fetch_token, code=code)
    save_credentials(flow.credentials)
    _pending.clear()
    return RedirectResponse("/", status_code=302)


@router.get("/auth/status")
async def auth_status():
    return {"authenticated": is_authenticated()}


@router.get("/auth/me")
async def auth_me(user=Depends(_get_current_user), db: AsyncSession = Depends(get_db)):
    from app.models import Email, User as UserModel
    has_seed_data = False
    try:
        seed_row = (await db.execute(
            select(UserModel).where(UserModel.email == "service@localhost")
        )).scalar_one_or_none()
        if seed_row:
            seed_count = (await db.scalar(
                select(func.count()).where(Email.user_id == seed_row.id)
            )) or 0
            has_seed_data = seed_count > 0
    except Exception:
        has_seed_data = False
    return {
        "id": user.id,
        "email": user.email,
        "role": user.role,
        "has_seed_data": has_seed_data,
    }
