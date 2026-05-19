import json
import urllib.request
from pathlib import Path
from typing import Optional
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from google.auth.transport.requests import Request
from app.config import settings

TOKEN_FILE = Path("data/gmail_token.json")
SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/gmail.readonly",
]


def get_oauth_flow() -> Flow:
    client_config = {
        "web": {
            "client_id": settings.GOOGLE_CLIENT_ID,
            "client_secret": settings.GOOGLE_CLIENT_SECRET,
            "redirect_uris": [settings.GOOGLE_REDIRECT_URI],
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
        }
    }
    flow = Flow.from_client_config(client_config, scopes=SCOPES)
    flow.redirect_uri = settings.GOOGLE_REDIRECT_URI
    return flow


def get_credentials() -> Optional[Credentials]:
    if not TOKEN_FILE.exists():
        return None
    creds = Credentials.from_authorized_user_file(str(TOKEN_FILE), SCOPES)
    if creds and creds.expired and creds.refresh_token:
        creds.refresh(Request())
        save_credentials(creds)
    return creds if creds and creds.valid else None


def save_credentials(creds: Credentials) -> None:
    TOKEN_FILE.parent.mkdir(parents=True, exist_ok=True)
    TOKEN_FILE.write_text(creds.to_json())


def is_authenticated() -> bool:
    return get_credentials() is not None


def get_google_userinfo(creds) -> dict:
    """Fetch {email, name, picture} from Google using access token."""
    req = urllib.request.Request(
        "https://www.googleapis.com/oauth2/v3/userinfo",
        headers={"Authorization": f"Bearer {creds.token}"},
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


async def get_credentials_for_user(db, user_id: str):
    """Load Gmail credentials from connected_accounts DB row."""
    from sqlalchemy import select
    from app.models import ConnectedAccount

    account = (await db.execute(
        select(ConnectedAccount).where(
            ConnectedAccount.user_id == user_id,
            ConnectedAccount.provider == "gmail",
            ConnectedAccount.status == "connected",
        )
    )).scalar_one_or_none()

    if not account or not account.refresh_token:
        return None

    from app.crypto import decrypt_secret, encrypt_secret

    # Backfill: if access_token is not encrypted, re-encrypt it
    raw_access = account.access_token
    try:
        # Try to decrypt — if it succeeds, it's already encrypted
        decrypt_secret(raw_access)
        access_token = raw_access
    except Exception:
        # Plaintext token — encrypt it and save back
        access_token = encrypt_secret(raw_access)
        account.access_token = access_token
        await db.commit()

    creds = Credentials(
        token=decrypt_secret(access_token),
        refresh_token=decrypt_secret(account.refresh_token),
        token_uri="https://oauth2.googleapis.com/token",
        client_id=settings.GOOGLE_CLIENT_ID,
        client_secret=settings.GOOGLE_CLIENT_SECRET,
        scopes=SCOPES,
    )

    if creds.expired and creds.refresh_token:
        import asyncio
        from google.auth.transport.requests import Request as GRequest
        from google.auth.exceptions import RefreshError

        try:
            loop = asyncio.get_running_loop()
            await asyncio.wait_for(
                loop.run_in_executor(None, lambda: creds.refresh(GRequest())),
                timeout=30,
            )
        except asyncio.TimeoutError:
            raise RuntimeError("Gmail token refresh timed out — please reconnect Gmail")
        except RefreshError as exc:
            raise RuntimeError(f"Gmail token refresh failed: {exc}. Please reconnect Gmail")

        account.access_token = encrypt_secret(creds.token)
        account.token_expiry = creds.expiry
        await db.commit()

    return creds if creds.valid else None
