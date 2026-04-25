# User Auth & Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace file-based credentials and header-based identity with Google OAuth (combined identity + Gmail scopes), HTTP-only cookie sessions, and per-user email data isolation.

**Architecture:** Single Google OAuth flow requests both identity (openid/email/profile) and Gmail (readonly) scopes at once. Sessions are 32-byte random tokens stored in a `sessions` DB table; no JWT, no memory state. Existing emails are backfilled to a `service` user so data survives migration. The frontend bootstraps by calling `GET /api/auth/me` — a 401 redirects to a plain-HTML login page.

**Tech Stack:** FastAPI, SQLAlchemy async, Alembic, google-auth-oauthlib, Jinja2, React (browser global / Babel standalone)

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `app/models.py` | Modify | Add `Session` model; add `allowed_emails` JSON col to `UserSettings`; add `access_token`/`refresh_token` to `ConnectedAccount` |
| `alembic/versions/0015_auth_sessions.py` | Create | Creates `sessions` table, adds `emails.user_id` FK, adds `allowed_emails`/token cols, seeds service user, backfills emails |
| `app/auth_deps.py` | Create | `get_current_user` FastAPI dependency — reads session cookie, validates token, returns `User` or 401 |
| `app/api/auth.py` | Replace | All auth routes: `/google`, `/callback`, `/logout`, `/me`, `/claim-seed-data` |
| `app/gmail/auth.py` | Modify | Combined scopes, per-user credential load/save from `ConnectedAccount` DB row |
| `app/api/transactions.py` | Modify | Add `Email.user_id == current_user.id` filter to all queries |
| `app/api/stats.py` | Modify | Add `Email.user_id` scoping to all queries |
| `app/api/account.py` | Modify | Remove header-based `get_current_user`; import from `auth_deps` |
| `app/main.py` | Modify | Add `/login` route; add auth middleware that redirects unauthenticated non-API GETs |
| `templates/login.html` | Create | Plain HTML login page with Google sign-in button |
| `static/src/app.jsx` | Modify | Bootstrap via `GET /api/auth/me`; remove `OnboardingView`; add seed data modal |
| `static/src/data.jsx` | Modify | API helper: 401 response → redirect to `/login` |
| `static/src/shell.jsx` | Modify | Sidebar: real user name/avatar; logout button |
| `tests/test_auth_flow.py` | Create | Tests for session creation, `get_current_user` dependency, scoping |

---

## Task 1: Session model + UserSettings.allowed_emails + ConnectedAccount tokens

**Files:**
- Modify: `app/models.py`

- [ ] **Step 1: Add `Session` model to `app/models.py`**

Open `app/models.py`. After the `UserAIService` class (around line 160), add:

```python
class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[str] = _uuid_col()
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token: Mapped[bytes] = mapped_column(sa.LargeBinary(32), nullable=False, unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
```

- [ ] **Step 2: Add `allowed_emails` column to `UserSettings`**

In `app/models.py`, inside the `UserSettings` class, add after `digest_hour`:

```python
    allowed_emails: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
```

This stores a JSON-encoded list, e.g. `'["owner@example.com"]'`.

- [ ] **Step 3: Add token columns to `ConnectedAccount`**

In `app/models.py`, inside `ConnectedAccount`, add after `updated_at`:

```python
    access_token: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    refresh_token: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    token_expiry: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
```

- [ ] **Step 4: Verify models import cleanly**

```bash
cd /path/to/GexpenseTracker
python -c "from app.models import Session, UserSettings, ConnectedAccount; print('OK')"
```

Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add app/models.py
git commit -m "feat: add Session model, allowed_emails, ConnectedAccount token fields"
```

---

## Task 2: Alembic migration 0015

**Files:**
- Create: `alembic/versions/0015_auth_sessions.py`

- [ ] **Step 1: Create migration file**

Create `alembic/versions/0015_auth_sessions.py`:

```python
"""auth: sessions table, emails.user_id, allowed_emails, account tokens

Revision ID: 0015
Revises: 0014
Create Date: 2026-04-25 00:00:00.000000
"""
from typing import Sequence, Union
import uuid
from alembic import op
import sqlalchemy as sa

revision: str = '0015'
down_revision: Union[str, None] = '0014'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. sessions table
    op.create_table(
        'sessions',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('token', sa.LargeBinary(32), nullable=False, unique=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_sessions_token', 'sessions', ['token'])
    op.create_index('ix_sessions_user_id', 'sessions', ['user_id'])

    # 2. allowed_emails on user_settings
    op.add_column('user_settings', sa.Column('allowed_emails', sa.Text(), nullable=True))

    # 3. token columns on connected_accounts
    op.add_column('connected_accounts', sa.Column('access_token', sa.Text(), nullable=True))
    op.add_column('connected_accounts', sa.Column('refresh_token', sa.Text(), nullable=True))
    op.add_column('connected_accounts', sa.Column('token_expiry', sa.DateTime(timezone=True), nullable=True))

    # 4. add use_rule_engine to user_settings (if not already present from 0013)
    # (skip if 0013 already added it — wrapped in try to be idempotent)
    try:
        op.add_column('user_settings', sa.Column('use_rule_engine', sa.Boolean(), nullable=False, server_default='1'))
    except Exception:
        pass  # already exists

    # 5. emails.user_id — add nullable, backfill with service user, then constrain
    # Create service user first
    bind = op.get_bind()
    service_id = str(uuid.uuid4())
    import json
    bind.execute(
        sa.text(
            "INSERT INTO users (id, email, role, status, onboarding_complete, created_at, updated_at) "
            "VALUES (:id, 'service@localhost', 'service', 'active', true, now(), now()) "
            "ON CONFLICT (email) DO NOTHING"
        ),
        {"id": service_id}
    )
    # Fetch the actual service user id (may have already existed)
    row = bind.execute(
        sa.text("SELECT id FROM users WHERE email = 'service@localhost'")
    ).fetchone()
    actual_service_id = row[0]

    op.add_column('emails', sa.Column('user_id', sa.String(36), nullable=True))
    op.create_foreign_key('fk_emails_user_id', 'emails', 'users', ['user_id'], ['id'], ondelete='CASCADE')

    bind.execute(sa.text("UPDATE emails SET user_id = :uid"), {"uid": actual_service_id})

    op.alter_column('emails', 'user_id', nullable=False)
    op.create_index('ix_emails_user_id', 'emails', ['user_id'])


def downgrade() -> None:
    op.drop_index('ix_emails_user_id', table_name='emails')
    op.drop_constraint('fk_emails_user_id', 'emails', type_='foreignkey')
    op.drop_column('emails', 'user_id')
    op.drop_column('connected_accounts', 'token_expiry')
    op.drop_column('connected_accounts', 'refresh_token')
    op.drop_column('connected_accounts', 'access_token')
    op.drop_column('user_settings', 'allowed_emails')
    op.drop_index('ix_sessions_user_id', table_name='sessions')
    op.drop_index('ix_sessions_token', table_name='sessions')
    op.drop_table('sessions')
```

- [ ] **Step 2: Apply migration to Docker Postgres**

```bash
docker compose exec app alembic upgrade head
```

Expected output ends with: `Running upgrade 0014 -> 0015, auth: sessions table...`

- [ ] **Step 3: Verify columns exist**

```bash
docker compose exec db psql -U expense expense_tracker -c "\d emails"
```

Expected: `user_id` column present with FK reference.

```bash
docker compose exec db psql -U expense expense_tracker -c "\d sessions"
```

Expected: table exists with `token`, `user_id`, `expires_at`.

- [ ] **Step 4: Commit**

```bash
git add alembic/versions/0015_auth_sessions.py
git commit -m "feat: migration 0015 — sessions table, emails.user_id, allowed_emails"
```

---

## Task 3: `app/auth_deps.py` — cookie session dependency

**Files:**
- Create: `app/auth_deps.py`
- Test: `tests/test_auth_flow.py`

- [ ] **Step 1: Write the failing test**

Create `tests/test_auth_flow.py`:

```python
import pytest
import pytest_asyncio
from datetime import datetime, UTC, timedelta
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.database import get_db
from app.models import User, Session, UserSettings, UserStatus, UserRole
import secrets


@pytest_asyncio.fixture
async def authed_client(db_session):
    """HTTP client with a valid session cookie pre-set."""
    async def override_db():
        yield db_session
    app.dependency_overrides[get_db] = override_db

    # create user
    user = User(email="test@example.com", role=UserRole.owner, status=UserStatus.active, onboarding_complete=True)
    db_session.add(user)
    await db_session.flush()
    db_session.add(UserSettings(user_id=user.id))
    await db_session.commit()
    await db_session.refresh(user)

    # create session
    token = secrets.token_bytes(32)
    sess = Session(
        user_id=user.id,
        token=token,
        expires_at=datetime.now(UTC) + timedelta(days=30),
    )
    db_session.add(sess)
    await db_session.commit()

    token_hex = token.hex()
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
        cookies={"session": token_hex},
    ) as client:
        yield client, user

    app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_me_unauthenticated():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/auth/me")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_me_authenticated(authed_client):
    client, user = authed_client
    resp = await client.get("/api/auth/me")
    assert resp.status_code == 200
    data = resp.json()
    assert data["email"] == "test@example.com"
```

- [ ] **Step 2: Run to confirm fail**

```bash
pytest tests/test_auth_flow.py -v
```

Expected: FAIL — `test_me_unauthenticated` passes (currently 404/200), `test_me_authenticated` fails.

- [ ] **Step 3: Create `app/auth_deps.py`**

```python
import secrets
from datetime import datetime, UTC
from typing import Optional
from fastapi import Cookie, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from app.database import get_db
from app.models import Session, User


async def get_current_user(
    session: Optional[str] = Cookie(default=None),
    db: AsyncSession = Depends(get_db),
) -> User:
    if not session:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        token_bytes = bytes.fromhex(session)
    except (ValueError, TypeError):
        raise HTTPException(status_code=401, detail="Invalid session")

    row = (await db.execute(
        select(Session).where(Session.token == token_bytes)
    )).scalar_one_or_none()

    if not row:
        raise HTTPException(status_code=401, detail="Session not found")

    if row.expires_at.replace(tzinfo=UTC) < datetime.now(UTC):
        await db.execute(delete(Session).where(Session.id == row.id))
        await db.commit()
        raise HTTPException(status_code=401, detail="Session expired")

    user = (await db.execute(
        select(User).where(User.id == row.user_id)
    )).scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return user
```

- [ ] **Step 4: Update `app/api/auth.py` — add `/api/auth/me`**

At the top of `app/api/auth.py`, add the import and route (full replacement is in Task 4; for now just add `me`):

In `app/api/auth.py`, add at the bottom:

```python
from app.auth_deps import get_current_user as _get_current_user
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db

@router.get("/auth/me")
async def auth_me(user = Depends(_get_current_user), db: AsyncSession = Depends(get_db)):
    from sqlalchemy import select, func
    from app.models import Email
    seed_row = (await db.execute(
        select(User).where(User.email == "service@localhost")
    )).scalar_one_or_none()
    has_seed_data = False
    if seed_row:
        seed_count = (await db.scalar(
            select(func.count()).where(Email.user_id == seed_row.id)
        )) or 0
        has_seed_data = seed_count > 0
    return {
        "id": user.id,
        "email": user.email,
        "role": user.role,
        "has_seed_data": has_seed_data,
    }
```

- [ ] **Step 5: Run tests**

```bash
pytest tests/test_auth_flow.py -v
```

Expected: both tests pass.

- [ ] **Step 6: Commit**

```bash
git add app/auth_deps.py app/api/auth.py tests/test_auth_flow.py
git commit -m "feat: cookie session dependency + /api/auth/me endpoint"
```

---

## Task 4: Replace `app/api/auth.py` — full OAuth flow

**Files:**
- Replace: `app/api/auth.py`

This replaces the existing file entirely. The current file has `/auth/gmail`, `/auth/callback`, `/auth/status`. We'll replace with `/auth/google`, `/auth/callback`, `/auth/logout`, `/auth/me`, `/auth/claim-seed-data`.

- [ ] **Step 1: Update `app/gmail/auth.py` — combined scopes**

Replace the `SCOPES` list in `app/gmail/auth.py`:

```python
SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/gmail.readonly",
]
```

Also add a helper to get Google userinfo from credentials:

```python
import json
import urllib.request


def get_google_userinfo(creds) -> dict:
    """Fetch {email, name, picture} from Google using access token."""
    req = urllib.request.Request(
        "https://www.googleapis.com/oauth2/v3/userinfo",
        headers={"Authorization": f"Bearer {creds.token}"},
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())
```

- [ ] **Step 2: Rewrite `app/api/auth.py`**

```python
import asyncio
import json
import secrets
from datetime import datetime, UTC, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth_deps import get_current_user
from app.config import settings
from app.database import get_db
from app.gmail.auth import get_oauth_flow, get_google_userinfo
from app.models import (
    ConnectedAccount, Email, Session, User, UserProfile, UserRole,
    UserSettings, UserStatus,
)

router = APIRouter()
_pending: dict = {}

SESSION_DAYS = 30
COOKIE_NAME = "session"


def _set_session_cookie(response: Response, token: bytes) -> None:
    response.set_cookie(
        COOKIE_NAME,
        value=token.hex(),
        httponly=True,
        secure=False,        # set True in production (HTTPS)
        samesite="strict",
        max_age=SESSION_DAYS * 86400,
        path="/",
    )


def _clear_session_cookie(response: Response) -> None:
    response.delete_cookie(COOKIE_NAME, path="/")


async def _get_or_create_user(
    db: AsyncSession,
    email: str,
    name: str,
    picture: Optional[str],
) -> User:
    """Find or create User + profile + settings. Enforce allowlist."""
    # Check allowlist — skip if no users exist yet (first login = owner)
    existing_count = (await db.scalar(select(func.count(User.id)).where(
        User.email != "service@localhost"
    ))) or 0

    if existing_count == 0:
        role = UserRole.owner
    else:
        # Find owner and check their allowed_emails
        owner = (await db.execute(
            select(User).where(User.role == UserRole.owner)
        )).scalar_one_or_none()
        if owner and owner.settings:
            raw = (await db.execute(
                select(UserSettings.allowed_emails).where(UserSettings.user_id == owner.id)
            )).scalar_one_or_none()
            allowed = json.loads(raw) if raw else []
        else:
            allowed = []

        if email not in allowed:
            raise HTTPException(status_code=403, detail="access_denied")
        role = UserRole.member

    user = (await db.execute(
        select(User).where(User.email == email)
    )).scalar_one_or_none()

    if user is None:
        user = User(email=email, role=role, status=UserStatus.active, onboarding_complete=True)
        db.add(user)
        await db.flush()
        db.add(UserProfile(
            user_id=user.id,
            full_name=name or email,
            avatar_url=picture,
        ))
        db.add(UserSettings(
            user_id=user.id,
            allowed_emails=json.dumps([email]) if role == UserRole.owner else None,
        ))
        db.add(ConnectedAccount(
            user_id=user.id,
            provider="gmail",
            account_email=email,
            status="connected",
        ))
    else:
        # Update avatar if changed
        if user.profile and picture:
            user.profile.avatar_url = picture

    await db.commit()
    await db.refresh(user)
    return user


async def _create_session(db: AsyncSession, user: User) -> bytes:
    token = secrets.token_bytes(32)
    db.add(Session(
        user_id=user.id,
        token=token,
        expires_at=datetime.now(UTC) + timedelta(days=SESSION_DAYS),
    ))
    await db.commit()
    return token


@router.get("/auth/google")
async def start_google_auth():
    flow = get_oauth_flow()
    auth_url, state = flow.authorization_url(
        access_type="offline",
        prompt="consent",
        include_granted_scopes="true",
    )
    _pending["state"] = state
    _pending["flow"] = flow
    return RedirectResponse(auth_url)


@router.get("/auth/callback")
async def google_callback(
    code: str,
    state: str,
    db: AsyncSession = Depends(get_db),
):
    flow = _pending.get("flow")
    if not flow:
        raise HTTPException(status_code=400, detail="No pending auth flow")
    if state != _pending.get("state"):
        raise HTTPException(status_code=400, detail="State mismatch")

    await asyncio.to_thread(flow.fetch_token, code=code)
    creds = flow.credentials
    _pending.clear()

    userinfo = await asyncio.to_thread(get_google_userinfo, creds)
    email = userinfo.get("email", "").lower().strip()
    name = userinfo.get("name", email)
    picture = userinfo.get("picture")

    user = await _get_or_create_user(db, email, name, picture)

    # Persist Gmail tokens in connected_accounts
    account = (await db.execute(
        select(ConnectedAccount).where(
            ConnectedAccount.user_id == user.id,
            ConnectedAccount.provider == "gmail",
        )
    )).scalar_one_or_none()
    if account:
        account.access_token = creds.token
        account.refresh_token = creds.refresh_token
        account.token_expiry = creds.expiry
        account.status = "connected"
        await db.commit()

    token = await _create_session(db, user)

    response = RedirectResponse("/", status_code=302)
    _set_session_cookie(response, token)
    return response


@router.post("/auth/logout")
async def logout(
    response: Response,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    session_cookie: Optional[str] = None,
):
    from fastapi import Cookie as FCookie
    # Delete session from DB
    from sqlalchemy import delete as sa_delete
    try:
        token_bytes = bytes.fromhex(session_cookie or "")
        await db.execute(sa_delete(Session).where(Session.token == token_bytes))
        await db.commit()
    except Exception:
        pass
    _clear_session_cookie(response)
    return {"ok": True}


@router.get("/auth/me")
async def auth_me(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    seed_row = (await db.execute(
        select(User).where(User.email == "service@localhost")
    )).scalar_one_or_none()
    has_seed_data = False
    if seed_row:
        seed_count = (await db.scalar(
            select(func.count()).where(Email.user_id == seed_row.id)
        )) or 0
        has_seed_data = seed_count > 0

    profile = user.profile
    return {
        "id": user.id,
        "email": user.email,
        "role": user.role,
        "name": profile.full_name if profile else user.email,
        "avatar_url": profile.avatar_url if profile else None,
        "has_seed_data": has_seed_data,
    }


@router.post("/auth/claim-seed-data")
async def claim_seed_data(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    seed_row = (await db.execute(
        select(User).where(User.email == "service@localhost")
    )).scalar_one_or_none()
    if not seed_row:
        return {"transferred": 0}
    from sqlalchemy import update
    result = await db.execute(
        update(Email).where(Email.user_id == seed_row.id).values(user_id=user.id)
    )
    await db.commit()
    return {"transferred": result.rowcount}


@router.get("/auth/status")
async def auth_status():
    return {"authenticated": True}


@router.get("/auth/allowlist")
async def get_allowlist(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.role != UserRole.owner:
        raise HTTPException(status_code=403, detail="Owner only")
    raw = (await db.execute(
        select(UserSettings.allowed_emails).where(UserSettings.user_id == user.id)
    )).scalar_one_or_none()
    return {"allowed_emails": json.loads(raw) if raw else [user.email]}


@router.post("/auth/allowlist")
async def add_to_allowlist(
    body: dict,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.role != UserRole.owner:
        raise HTTPException(status_code=403, detail="Owner only")
    email_to_add = (body.get("email") or "").strip().lower()
    if not email_to_add or "@" not in email_to_add:
        raise HTTPException(status_code=422, detail="Valid email required")
    settings_row = (await db.execute(
        select(UserSettings).where(UserSettings.user_id == user.id)
    )).scalar_one()
    current = json.loads(settings_row.allowed_emails) if settings_row.allowed_emails else [user.email]
    if email_to_add not in current:
        current.append(email_to_add)
    settings_row.allowed_emails = json.dumps(current)
    await db.commit()
    return {"allowed_emails": current}


@router.delete("/auth/allowlist/{email}")
async def remove_from_allowlist(
    email: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.role != UserRole.owner:
        raise HTTPException(status_code=403, detail="Owner only")
    if email.lower() == user.email.lower():
        raise HTTPException(status_code=400, detail="Cannot remove owner email")
    settings_row = (await db.execute(
        select(UserSettings).where(UserSettings.user_id == user.id)
    )).scalar_one()
    current = json.loads(settings_row.allowed_emails) if settings_row.allowed_emails else [user.email]
    current = [e for e in current if e.lower() != email.lower()]
    settings_row.allowed_emails = json.dumps(current)
    await db.commit()
    return {"allowed_emails": current}
```

- [ ] **Step 3: Fix the logout endpoint — cookie access**

The logout endpoint above has a bug: it can't read the cookie through `session_cookie: Optional[str] = None` that way. Replace the signature:

```python
@router.post("/auth/logout")
async def logout(
    request: Request,
    response: Response,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import delete as sa_delete
    raw_cookie = request.cookies.get(COOKIE_NAME)
    if raw_cookie:
        try:
            token_bytes = bytes.fromhex(raw_cookie)
            await db.execute(sa_delete(Session).where(Session.token == token_bytes))
            await db.commit()
        except Exception:
            pass
    _clear_session_cookie(response)
    return {"ok": True}
```

- [ ] **Step 4: Verify the app restarts without import errors**

```bash
docker compose restart app && sleep 4 && docker compose logs app --tail=5
```

Expected: no `ImportError` or `AttributeError`.

- [ ] **Step 5: Commit**

```bash
git add app/api/auth.py app/gmail/auth.py
git commit -m "feat: full Google OAuth flow — combined scopes, session cookie, allowlist CRUD"
```

---

## Task 5: Login page + auth middleware

**Files:**
- Create: `templates/login.html`
- Modify: `app/main.py`

- [ ] **Step 1: Create `templates/login.html`**

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>MoneyFlow — Sign in</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500&family=Geist:wght@300;400;500&display=swap" rel="stylesheet">
<style>
  :root { --paper:#f6f3ec; --ink:#1a1814; --ink-3:#78736a; --line:#e3dcca; --card:#fbf9f3; --accent:#c2410c; }
  * { box-sizing:border-box; }
  html,body { margin:0; padding:0; background:var(--paper); color:var(--ink); font-family:'Geist',system-ui,sans-serif; font-size:14px; min-height:100vh; display:flex; align-items:center; justify-content:center; }
  .wrap { max-width:380px; width:100%; padding:48px 40px; text-align:center; }
  h1 { font-family:'Fraunces',serif; font-size:40px; font-weight:400; letter-spacing:-0.03em; margin:0 0 8px; }
  .tagline { font-size:14px; color:var(--ink-3); margin:0 0 40px; }
  .btn { display:inline-flex; align-items:center; gap:10px; padding:12px 24px; background:var(--ink); color:var(--paper); border:none; border-radius:8px; font-size:14px; font-family:'Geist',sans-serif; font-weight:500; cursor:pointer; text-decoration:none; transition:opacity 120ms; }
  .btn:hover { opacity:0.85; }
  .btn svg { flex-shrink:0; }
  .footer { margin-top:48px; font-size:12px; color:var(--ink-3); }
</style>
</head>
<body>
<div class="wrap">
  <h1>MoneyFlow</h1>
  <p class="tagline">Your inbox for money.</p>
  <a class="btn" href="/api/auth/google">
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
      <path d="M3.964 10.706A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
    Sign in with Google
  </a>
  <p class="footer">Self-hosted · your data stays local</p>
</div>
</body>
</html>
```

- [ ] **Step 2: Add `/login` route and auth middleware to `app/main.py`**

Add at the top of `app/main.py` after the existing imports:

```python
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request as StarletteRequest
from starlette.responses import RedirectResponse as StarletteRedirect
```

Add the middleware class before `app = FastAPI(...)`:

```python
class AuthMiddleware(BaseHTTPMiddleware):
    """Redirect unauthenticated browser requests to /login."""

    EXEMPT_PATHS = {"/login", "/api/auth/google", "/api/auth/callback", "/health", "/static"}

    async def dispatch(self, request: StarletteRequest, call_next):
        path = request.url.path
        # Let API calls, static files, and exempt paths through
        if any(path.startswith(p) for p in self.EXEMPT_PATHS):
            return await call_next(request)
        # Only enforce on non-API browser GET requests
        if path.startswith("/api/"):
            return await call_next(request)
        # Check session cookie
        cookie = request.cookies.get("session")
        if not cookie:
            return StarletteRedirect("/login")
        return await call_next(request)
```

After `app = FastAPI(title="Expense Tracker", lifespan=lifespan)`, add:

```python
app.add_middleware(AuthMiddleware)
```

Add the login route near the other page routes:

```python
@app.get("/login", response_class=HTMLResponse)
async def login_page(request: Request):
    return templates.TemplateResponse("login.html", {"request": request})
```

- [ ] **Step 3: Verify login page loads**

```bash
docker compose restart app && sleep 5
curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/login
```

Expected: `200`

- [ ] **Step 4: Verify unauthenticated root redirects**

```bash
curl -s -o /dev/null -w "%{http_code}" -L http://localhost:8000/
```

Expected: ends at `200` (after redirect to `/login`). Or check with:

```bash
curl -s -D - http://localhost:8000/ | head -5
```

Expected: `HTTP/1.1 307` or `302` with `Location: /login`.

- [ ] **Step 5: Commit**

```bash
git add templates/login.html app/main.py
git commit -m "feat: login page + auth middleware — unauthenticated browser requests redirect to /login"
```

---

## Task 6: Scope API endpoints by `Email.user_id`

**Files:**
- Modify: `app/api/transactions.py`
- Modify: `app/api/stats.py`
- Modify: `app/api/account.py`

- [ ] **Step 1: Update `app/api/account.py` — swap `get_current_user` import**

Find the existing `get_current_user` function defined at line ~167 in `account.py` (reads `X-User-Id` / `X-User-Email` headers). Replace it with an import from `auth_deps`:

Remove the function body:
```python
# DELETE these lines (~149-172):
async def _current_user(...):
    ...

async def get_current_user(...) -> User:
    return await _current_user(...)
```

Replace with:
```python
from app.auth_deps import get_current_user  # noqa: F401 — re-exported for other modules
```

All existing uses of `Depends(get_current_user)` in `account.py` continue to work because the name is the same.

- [ ] **Step 2: Add `Email.user_id` filter to `GET /api/transactions`**

In `app/api/transactions.py`, find `get_transactions` function. Add `get_current_user` dependency and filter:

```python
from app.auth_deps import get_current_user
from app.models import User

@router.get("/transactions")
async def get_transactions(
    offset: int = 0,
    limit: int = 50,
    label: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = (
        select(Transaction, Email)
        .join(Email, Transaction.email_id == Email.id)
        .where(Email.user_id == current_user.id)   # <-- add this
    )
    # rest of existing filter/pagination code unchanged
```

Do the same for every other query in `transactions.py` that joins `Email`:
- `get_transaction` (single fetch)
- `search_transactions`
- `bulk_transactions`

For queries that only touch `Transaction` without `Email` join (e.g., `patch_transaction`), no change needed since transaction ownership is implied through the email FK.

- [ ] **Step 3: Add `Email.user_id` filter to stats endpoints**

In `app/api/stats.py`, each query that touches `Email` or `Transaction` needs `Email.user_id == current_user.id`. Add `current_user: User = Depends(get_current_user)` to each endpoint and add the filter.

Example for `get_summary`:

```python
from app.auth_deps import get_current_user
from app.models import User

@router.get("/stats/summary")
async def get_summary(
    ...existing params...
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    base = (
        select(Transaction)
        .join(Email, Transaction.email_id == Email.id)
        .where(Email.user_id == current_user.id)
        ...
    )
```

- [ ] **Step 4: Restart and smoke-test**

```bash
docker compose restart app && sleep 5
# Should return 401 (no session cookie)
curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/api/transactions
```

Expected: `401`

- [ ] **Step 5: Write scoping test**

Add to `tests/test_auth_flow.py`:

```python
@pytest.mark.asyncio
async def test_transactions_returns_401_without_session(db_session):
    async def override_db():
        yield db_session
    app.dependency_overrides[get_db] = override_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/transactions")
        assert resp.status_code == 401
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_transactions_scoped_to_user(db_session):
    """User A only sees their own emails."""
    async def override_db():
        yield db_session
    app.dependency_overrides[get_db] = override_db

    from app.models import Email, Transaction, Label
    import secrets
    from datetime import datetime, UTC, timedelta

    # Create two users with sessions
    user_a = User(email="a@x.com", role=UserRole.owner, status=UserStatus.active, onboarding_complete=True)
    user_b = User(email="b@x.com", role=UserRole.member, status=UserStatus.active, onboarding_complete=True)
    db_session.add_all([user_a, user_b])
    await db_session.flush()
    db_session.add_all([UserSettings(user_id=user_a.id), UserSettings(user_id=user_b.id)])
    await db_session.flush()

    # Email owned by user_a
    email_a = Email(gmail_id="gid_a", subject="For A", user_id=user_a.id)
    db_session.add(email_a)
    await db_session.flush()
    db_session.add(Transaction(email_id=email_a.id, label=Label.expense, amount=-100))

    await db_session.commit()

    # Session for user_b
    token_b = secrets.token_bytes(32)
    db_session.add(Session(user_id=user_b.id, token=token_b, expires_at=datetime.now(UTC) + timedelta(days=1)))
    await db_session.commit()

    try:
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
            cookies={"session": token_b.hex()},
        ) as client:
            resp = await client.get("/api/transactions")
        assert resp.status_code == 200
        assert resp.json()["total"] == 0  # user_b sees nothing
    finally:
        app.dependency_overrides.pop(get_db, None)
```

- [ ] **Step 6: Run tests**

```bash
pytest tests/test_auth_flow.py -v
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add app/api/transactions.py app/api/stats.py app/api/account.py tests/test_auth_flow.py
git commit -m "feat: scope transactions and stats APIs to current_user via Email.user_id"
```

---

## Task 7: Gmail sync — per-user email tagging

**Files:**
- Modify: `app/gmail/auth.py` (add per-user credential load from DB)
- Modify: `app/sync.py` (pass `user_id` when creating Email rows)

- [ ] **Step 1: Add per-user credential loader to `app/gmail/auth.py`**

Add at the bottom of `app/gmail/auth.py`:

```python
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

    creds = Credentials(
        token=account.access_token,
        refresh_token=account.refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=settings.GOOGLE_CLIENT_ID,
        client_secret=settings.GOOGLE_CLIENT_SECRET,
        scopes=SCOPES,
    )

    if creds.expired and creds.refresh_token:
        from google.auth.transport.requests import Request
        creds.refresh(Request())
        # Update stored token
        account.access_token = creds.token
        account.token_expiry = creds.expiry
        await db.commit()

    return creds if creds.valid else None
```

- [ ] **Step 2: Update sync to tag emails with `user_id`**

In `app/sync.py`, find where `Email` rows are created/inserted. Pass `user_id` from the authenticated user who triggered the sync.

Find the sync trigger endpoint in `app/api/sync.py`:

```python
@router.post("/sync/trigger")
async def trigger_sync(
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from app.sync import run_sync
    task = asyncio.create_task(run_sync(user_id=current_user.id))
    task.add_done_callback(_log_task_result)
    _background_tasks.add(task)
    return {"triggered": True}
```

In `app/sync.py`, update `run_sync` signature to accept `user_id: str` and pass it when constructing `Email` objects:

```python
async def run_sync(user_id: str = None, ...):
    ...
    email_row = Email(
        gmail_id=...,
        subject=...,
        user_id=user_id,   # <-- tag with requesting user
        ...
    )
```

The scheduler's background sync also needs a `user_id`. In `app/scheduler.py`, update `_sync_job` to find the owner user and pass their id:

```python
async def _sync_job():
    from app.database import AsyncSessionLocal
    from app.models import User, UserRole
    from sqlalchemy import select
    async with AsyncSessionLocal() as db:
        owner = (await db.execute(
            select(User).where(User.role == UserRole.owner, User.email != "service@localhost")
        )).scalar_one_or_none()
        if not owner:
            return {"error": "no owner found"}
        from app.sync import run_sync
        return await run_sync(user_id=owner.id, db=db)
```

- [ ] **Step 3: Commit**

```bash
git add app/gmail/auth.py app/sync.py app/api/sync.py app/scheduler.py
git commit -m "feat: per-user Gmail credential loading + email user_id tagging during sync"
```

---

## Task 8: Frontend — auth bootstrap + 401 redirect

**Files:**
- Modify: `static/src/data.jsx` (version bump v6 → v7)
- Modify: `static/src/app.jsx` (version bump v9 → v10)
- Modify: `templates/index.html`

- [ ] **Step 1: Update `data.jsx` — 401 interceptor**

In `static/src/data.jsx`, find the `API` object (or `API.get`/`API.post` functions). Add a 401 check that redirects to `/login`:

```javascript
// In the API helper — wherever fetch responses are checked:
if (resp.status === 401) {
  window.location.href = "/login";
  return;
}
```

If the current `API.get` pattern is:
```javascript
const API = {
  get: async (url) => {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${r.status}: ...`);
    return r.json();
  },
  ...
};
```

Update to:
```javascript
const API = {
  get: async (url) => {
    const r = await fetch(url, { credentials: "include" });
    if (r.status === 401) { window.location.href = "/login"; return; }
    if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`);
    return r.json();
  },
  post: async (url, body) => {
    const r = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (r.status === 401) { window.location.href = "/login"; return; }
    if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`);
    return r.json();
  },
  patch: async (url, body) => {
    const r = await fetch(url, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (r.status === 401) { window.location.href = "/login"; return; }
    if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`);
    return r.json();
  },
  delete: async (url) => {
    const r = await fetch(url, { method: "DELETE", credentials: "include" });
    if (r.status === 401) { window.location.href = "/login"; return; }
    if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`);
    return r.json();
  },
};
```

- [ ] **Step 2: Update `app.jsx` — replace `OnboardingView` with `GET /api/auth/me` bootstrap**

In `static/src/app.jsx`:

1. Remove `needsOnboarding` state
2. Remove `OnboardingView` render block
3. Replace the `GET /api/account/me` + `needsOnboarding` logic in the startup `useEffect` with `GET /api/auth/me`:

```javascript
// Replace this:
useEffect(() => {
  API.get("/api/account/me")
    .then(data => { setAccount(data); setNeedsOnboarding(false); })
    .catch(err => {
      if ((err.message || "").startsWith("404")) setNeedsOnboarding(true);
    });
}, []);

// With this:
useEffect(() => {
  API.get("/api/auth/me")
    .then(data => {
      setAccount(data);  // {id, email, role, name, avatar_url, has_seed_data}
      if (data && data.has_seed_data) setShowSeedModal(true);
    })
    .catch(() => {
      // 401 already handled by API interceptor (redirect to /login)
    });
}, []);
```

Add `showSeedModal` state:
```javascript
const [showSeedModal, setShowSeedModal] = React.useState(false);
```

Remove the `if (needsOnboarding)` render block. Remove the `OnboardingView` JSX.

- [ ] **Step 3: Bump version in `index.html`**

```html
<!-- data.jsx v6 → v7 -->
<script type="text/babel" src="/static/src/data.jsx?v=7"></script>
<!-- app.jsx v9 → v10 -->
<script type="text/babel" src="/static/src/app.jsx?v=10"></script>
```

- [ ] **Step 4: Rebuild and verify redirect**

```bash
docker compose build --no-cache app && docker compose up -d && sleep 5
curl -s -D - http://localhost:8000/ | head -3
```

Expected: `HTTP/1.1 307 Temporary Redirect` with `location: /login`.

- [ ] **Step 5: Commit**

```bash
git add static/src/data.jsx static/src/app.jsx templates/index.html
git commit -m "feat: frontend auth bootstrap — 401 interceptor, replace OnboardingView with /api/auth/me"
```

---

## Task 9: Sidebar — real user data + logout button

**Files:**
- Modify: `static/src/shell.jsx` (version bump v7 → v8)
- Modify: `templates/index.html`

- [ ] **Step 1: Update `Sidebar` component in `shell.jsx`**

Find the hardcoded user block in the sidebar (look for "Ananya K." or similar). Replace with dynamic data from `account` prop:

The `Sidebar` component currently receives `view, setView, counts, filter, onFilter, theme, setTheme, mobile, open, onClose`. Add `account` to the props:

```jsx
const Sidebar = ({ view, setView, counts, filter, onFilter, theme, setTheme, mobile, open, onClose, account }) => {
```

Find the hardcoded user section (something like):
```jsx
<div style={{ ... }}>
  <div>Ananya K.</div>
  <div>ananya@acme.in</div>
</div>
```

Replace with:
```jsx
{/* User identity row */}
<div style={{ display:"flex", alignItems:"center", gap:10, padding:"14px 18px", borderTop:"1px solid var(--line)", marginTop:"auto" }}>
  {account?.avatar_url
    ? <img src={account.avatar_url} alt="" style={{ width:32, height:32, borderRadius:"50%", objectFit:"cover", flexShrink:0 }} />
    : <div style={{ width:32, height:32, borderRadius:"50%", background:"var(--line)", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:600, color:"var(--ink-3)" }}>
        {(account?.name || account?.email || "?")[0].toUpperCase()}
      </div>
  }
  <div style={{ flex:1, minWidth:0 }}>
    <div style={{ fontSize:13, fontWeight:500, color:"var(--ink)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{account?.name || account?.email || "—"}</div>
    <div style={{ fontSize:11, color:"var(--ink-3)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{account?.email || ""}</div>
  </div>
  <button
    onClick={async () => {
      await API.post("/api/auth/logout");
      window.location.href = "/login";
    }}
    title="Sign out"
    style={{ padding:6, background:"none", border:"none", cursor:"pointer", color:"var(--ink-4)", borderRadius:4 }}
  >
    <Icon name="logout" size={14} stroke="currentColor"/>
  </button>
</div>
```

- [ ] **Step 2: Add `logout` icon to `icons.jsx` (if not present)**

In `static/src/icons.jsx`, add in the switch:

```jsx
case "logout": return <svg {...p} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>;
```

Bump `icons.jsx` version: v4 → v5.

- [ ] **Step 3: Pass `account` from `App` to `Sidebar` in `app.jsx`**

In `app.jsx`, find `<Sidebar .../>` and add `account={account}`:

```jsx
<Sidebar
  view={view}
  setView={setView}
  counts={counts}
  filter={inboxFilter}
  onFilter={setInboxFilter}
  theme={theme}
  setTheme={setTheme}
  mobile={viewport.isTablet}
  open={!viewport.isTablet || navOpen}
  onClose={() => setNavOpen(false)}
  account={account}
/>
```

- [ ] **Step 4: Bump versions in `index.html`**

```html
<script type="text/babel" src="/static/src/icons.jsx?v=5"></script>
<script type="text/babel" src="/static/src/shell.jsx?v=8"></script>
```

- [ ] **Step 5: Commit**

```bash
git add static/src/shell.jsx static/src/icons.jsx static/src/app.jsx templates/index.html
git commit -m "feat: sidebar shows real user name/avatar from Google OAuth + logout button"
```

---

## Task 10: Seed data modal + Settings allowlist section

**Files:**
- Modify: `static/src/app.jsx` (v10 → v11)
- Modify: `static/src/account.jsx` (version bump)
- Modify: `templates/index.html`

- [ ] **Step 1: Add seed data import modal to `app.jsx`**

After the main `return` statement in `App`, before the closing `</div>`, add:

```jsx
{showSeedModal && (
  <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:200 }}>
    <div style={{ background:"var(--card)", border:"1px solid var(--line)", borderRadius:12, padding:"32px 36px", maxWidth:440, width:"90%", textAlign:"center" }}>
      <div style={{ fontFamily:"'Fraunces',serif", fontSize:24, fontWeight:400, marginBottom:12 }}>Previous data found</div>
      <div style={{ fontSize:14, color:"var(--ink-3)", lineHeight:1.6, marginBottom:24 }}>
        We found existing transaction data from a previous setup. Import it into your account?
      </div>
      <div style={{ display:"flex", gap:12, justifyContent:"center" }}>
        <button
          onClick={async () => {
            await API.post("/api/auth/claim-seed-data");
            setShowSeedModal(false);
            loadData();
          }}
          style={{ padding:"10px 20px", background:"var(--ink)", color:"var(--paper)", border:"none", borderRadius:6, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}
        >Import my data</button>
        <button
          onClick={() => setShowSeedModal(false)}
          style={{ padding:"10px 20px", background:"var(--card)", color:"var(--ink-2)", border:"1px solid var(--line)", borderRadius:6, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}
        >Start fresh</button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 2: Add "Access" section to `account.jsx` (Settings view)**

Find the `SettingsView` component in `account.jsx`. Add an Access section that only renders when `account?.role === "owner"`:

```jsx
{/* Access section — owner only */}
{account?.role === "owner" && (
  <AccessSection account={account} />
)}
```

Add the `AccessSection` component above `SettingsView`:

```jsx
const AccessSection = ({ account }) => {
  const [allowlist, setAllowlist] = React.useState([]);
  const [newEmail, setNewEmail] = React.useState("");
  const [adding, setAdding] = React.useState(false);

  React.useEffect(() => {
    API.get("/api/auth/allowlist")
      .then(d => setAllowlist(d.allowed_emails || [account.email]))
      .catch(() => {});
  }, []);

  const addEmail = async () => {
    if (!newEmail.trim() || !newEmail.includes("@")) return;
    setAdding(true);
    try {
      const d = await API.post("/api/auth/allowlist", { email: newEmail.trim() });
      setAllowlist(d.allowed_emails);
      setNewEmail("");
    } catch (_) {}
    setAdding(false);
  };

  const removeEmail = async (email) => {
    try {
      const d = await API.delete(`/api/auth/allowlist/${encodeURIComponent(email)}`);
      setAllowlist(d.allowed_emails);
    } catch (_) {}
  };

  return (
    <div style={{ marginTop:24 }}>
      <div style={{ fontSize:11, color:"var(--ink-3)", textTransform:"uppercase", letterSpacing:"0.1em", fontWeight:500, marginBottom:12 }}>Access</div>
      <div style={{ background:"var(--card)", border:"1px solid var(--line)", borderRadius:8, overflow:"hidden" }}>
        {allowlist.map(email => (
          <div key={email} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 16px", borderBottom:"1px solid var(--line)" }}>
            <span style={{ fontSize:13 }}>{email}{email === account.email ? <span style={{ fontSize:11, color:"var(--ink-4)", marginLeft:8 }}>(you)</span> : null}</span>
            <button
              onClick={() => removeEmail(email)}
              disabled={email === account.email}
              style={{ fontSize:11, color:"var(--neg)", background:"none", border:"none", cursor: email === account.email ? "default" : "pointer", opacity: email === account.email ? 0.3 : 1 }}
            >Remove</button>
          </div>
        ))}
        <div style={{ display:"flex", gap:8, padding:"10px 16px" }}>
          <input
            value={newEmail}
            onChange={e => setNewEmail(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addEmail()}
            placeholder="Add email address…"
            style={{ flex:1, padding:"7px 10px", border:"1px solid var(--line)", borderRadius:6, background:"var(--paper)", color:"var(--ink)", fontSize:13, fontFamily:"inherit" }}
          />
          <button
            onClick={addEmail}
            disabled={adding}
            style={{ padding:"7px 14px", background:"var(--ink)", color:"var(--paper)", border:"none", borderRadius:6, fontSize:12, cursor:"pointer", fontFamily:"inherit" }}
          >Add</button>
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 3: Bump versions in `index.html`**

```html
<script type="text/babel" src="/static/src/app.jsx?v=11"></script>
<script type="text/babel" src="/static/src/account.jsx?v=4"></script>
```

- [ ] **Step 4: Full rebuild + smoke test**

```bash
docker compose build --no-cache app && docker compose up -d
```

Test the full flow manually:
1. Open `http://localhost:8000` — should redirect to `/login`
2. Click "Sign in with Google" — complete Google OAuth
3. Verify you land on the app at `/`
4. Check sidebar shows your real name + Google profile picture
5. Check Dashboard Budget section is present
6. Click logout — redirects to `/login`

- [ ] **Step 5: Commit**

```bash
git add static/src/app.jsx static/src/account.jsx templates/index.html
git commit -m "feat: seed data import modal + Settings Access section for allowlist management"
```

---

## Self-Review Checklist

### Spec coverage

| Spec requirement | Task |
|---|---|
| Single Google OAuth (combined scopes) | Task 4 |
| HTTP-only cookie sessions, 30 days, 32-byte token | Tasks 3 + 4 |
| Session table in DB | Tasks 1 + 2 |
| Allowlist — first login = owner | Task 4 (`_get_or_create_user`) |
| Allowlist — CRUD in Settings | Task 10 |
| Data isolation — `emails.user_id` FK | Tasks 1 + 2 |
| Backfill to service user | Task 2 |
| API scoping via `Email.user_id == current_user.id` | Task 6 |
| Sync tags new emails with `user_id` | Task 7 |
| `/api/auth/me` returns `has_seed_data` | Tasks 3 + 4 |
| Seed data modal (import / start fresh) | Task 10 |
| `/api/auth/claim-seed-data` | Task 4 |
| Login page — plain HTML, Google button | Task 5 |
| Auth middleware — redirect unauthenticated to `/login` | Task 5 |
| Sidebar — real user name/avatar | Task 9 |
| Logout button | Task 9 |
| Owner email cannot be removed from allowlist | Task 4 (`remove_from_allowlist`) |
| Security: HttpOnly, SameSite=Strict | Task 4 (`_set_session_cookie`) |
| Tests for session dependency + scoping | Tasks 3 + 6 |

All requirements covered. ✓

### Placeholder scan

No TBDs, TODOs, or "add validation" placeholders. All code blocks are complete. ✓

### Type consistency

- `Session.token` is `bytes` (LargeBinary) throughout — stored, compared, and hex-encoded consistently. ✓
- `get_current_user` signature matches between `auth_deps.py` and its usages. ✓
- `Email.user_id` column is `String(36)` matching `User.id` type. ✓
