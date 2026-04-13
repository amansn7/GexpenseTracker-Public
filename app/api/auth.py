import asyncio
from fastapi import APIRouter
from fastapi.responses import RedirectResponse
from app.gmail.auth import get_oauth_flow, save_credentials, is_authenticated

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
