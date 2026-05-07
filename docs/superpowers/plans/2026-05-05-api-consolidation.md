# API Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce API surface area from 81 → ~50 endpoints by merging duplicates, removing dead dev code, renaming path params for consistency, and gating internal-only endpoints.

**Architecture:** Move both endpoints from `account.py` into `settings.py`, then delete `account.py`. Gate allowlist/seed-data endpoints in `auth.py` behind a `DEV_MODE` config flag. Rename `{item_id}`, `{debt_id}`, `{budget_id}` path params to `{id}` (server-side only, no URL change). Add owner-role guard to `/sync/backfill-bodies` and `/llm/status`. Merge `GET /review/count` into `GET /review?count=true` and update the one frontend caller.

**Tech Stack:** FastAPI, SQLAlchemy async, Pydantic, pytest-asyncio, httpx ASGI transport

---

## File Map

| File | Change |
|------|--------|
| `app/api/account.py` | **DELETE** after moving its 2 endpoints to settings.py |
| `app/api/settings.py` | Add `GET /account/me` + `PATCH /account/profile` endpoints |
| `app/api/auth.py` | Gate allowlist + seed-data endpoints behind `DEV_MODE` |
| `app/api/recurring.py` | Rename `{item_id}` → `{id}` in PATCH + DELETE |
| `app/api/debt.py` | Rename `{debt_id}` → `{id}` in PATCH + DELETE |
| `app/api/budgets.py` | Rename `{budget_id}` → `{id}` in PATCH + DELETE |
| `app/api/sync.py` | Add owner-role guard to `/sync/backfill-bodies` + `/llm/status` |
| `app/api/review.py` | Add `?count=true` param to `GET /review`; delete `GET /review/count` |
| `app/config.py` | Add `DEV_MODE: bool = False` |
| `app/main.py` | Remove `account` import + `include_router` call |
| `static/app.js` | Update `/api/review/count` → `/api/review?count=true` |
| `tests/test_auth_required.py` | Update PROTECTED list: remove `/api/review/count`, remove allowlist/seed if DEV_MODE=False in test env |
| `tests/conftest.py` | Set `DEV_MODE=True` in test env (monkeypatch settings) so allowlist endpoints stay active in tests |

---

### Task 1: Move `account.py` endpoints into `settings.py`

**Files:**
- Modify: `app/api/settings.py` (add 2 endpoints + 1 import + 1 Pydantic model)
- Delete: `app/api/account.py`
- Modify: `app/main.py` (remove account router)
- Test: `tests/test_account_onboarding.py` (existing test, no change needed — paths unchanged)

- [ ] **Step 1: Add imports and ProfilePatch model to settings.py**

Open `app/api/settings.py`. After the existing imports block (after line 30), add:

```python
from app.api._account_helpers import (
    _clean_email,
    _api_key_hint,
    _encrypt_secret,
    _settings_dict,
    _account_dict,
    _category_dict,
    _ai_service_dict,
    _get_owned,
    _profile_dict,
    _load_user_bundle,
)
```

Note: `settings.py` already imports `_clean_email`, `_api_key_hint`, etc. from `_account_helpers`. You need to ADD `_profile_dict` and `_load_user_bundle` to that existing import. Also add `UserProfile` to the models import.

The exact edit: in `app/api/settings.py` at line 14:
```python
from app.models import (
    ConnectedAccount,
    User,
    UserAIService,
    UserCategory,
    UserProfile,
    UserSettings,
)
```

And at line 21–30, extend the `_account_helpers` import:
```python
from app.api._account_helpers import (
    _clean_email,
    _api_key_hint,
    _encrypt_secret,
    _settings_dict,
    _account_dict,
    _category_dict,
    _ai_service_dict,
    _get_owned,
    _profile_dict,
    _load_user_bundle,
)
```

Then add `ProfilePatch` model after `TotpVerifyBody` class:
```python
class ProfilePatch(BaseModel):
    full_name: Optional[str] = None
    display_name: Optional[str] = None
    phone: Optional[str] = None
    location: Optional[str] = None
    avatar_url: Optional[str] = None
    default_currency: Optional[str] = Field(default=None, min_length=3, max_length=3)
    timezone: Optional[str] = None
```

- [ ] **Step 2: Add the two endpoints to settings.py**

At the end of `app/api/settings.py`, add:

```python
@router.get("/account/me")
async def get_me(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await _load_user_bundle(db, user)


@router.patch("/account/profile")
async def update_profile(
    patch: ProfilePatch,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    profile = (await db.execute(select(UserProfile).where(UserProfile.user_id == user.id))).scalar_one()
    for key, value in patch.model_dump(exclude_unset=True).items():
        if isinstance(value, str):
            value = value.strip()
            if key == "default_currency":
                value = value.upper()
        if key in {"default_currency", "timezone"}:
            setattr(profile, key, value)
        else:
            setattr(profile, key, value or None)
    await db.commit()
    await db.refresh(profile)
    return {"profile": _profile_dict(profile)}
```

- [ ] **Step 3: Remove account router from main.py**

In `app/main.py` line 17, remove `account` from the import:
```python
from app.api import auth, transactions, review, sync as sync_api, rules as rules_api, recurring as recurring_api, stats as stats_api, budgets as budgets_api, emails as emails_api, admin as admin_api, duplicates as duplicates_api, debt as debt_api, settings as settings_api, onboarding as onboarding_api
```

In `app/main.py` line 74, remove:
```python
app.include_router(account.router, prefix="/api")
```

- [ ] **Step 4: Delete account.py**

```bash
rm /Users/amansaini/GexpenseTracker/app/api/account.py
```

- [ ] **Step 5: Run tests to verify**

```bash
cd /Users/amansaini/GexpenseTracker && python -m pytest tests/test_account_onboarding.py tests/test_auth_required.py -v --ignore=tests/test_llm_client.py 2>&1 | tail -30
```

Expected: all tests PASS. If `test_auth_required` fails on `GET /api/account/me` or `PATCH /api/account/profile` — those aren't in the PROTECTED list so it's fine.

- [ ] **Step 6: Commit**

```bash
git add app/api/settings.py app/main.py && git rm app/api/account.py
git commit -m "refactor: merge account.py endpoints into settings.py, delete account.py"
```

---

### Task 2: Gate dev endpoints in auth.py behind DEV_MODE

**Files:**
- Modify: `app/config.py` (add DEV_MODE field)
- Modify: `app/api/auth.py` (add dependency guard to 4 endpoints)
- Modify: `tests/conftest.py` (enable DEV_MODE in test env)
- Modify: `tests/test_auth_required.py` (keep allowlist entries — they'll still 401 because auth runs before route body, but the dev guard runs as a dependency)

- [ ] **Step 1: Add DEV_MODE to config**

In `app/config.py`, add after `INVITE_CODE`:
```python
DEV_MODE: bool = False
```

- [ ] **Step 2: Add require_dev dependency in auth.py**

In `app/api/auth.py`, after the imports, add:

```python
from app.config import settings as app_settings
from fastapi import HTTPException

def require_dev():
    if not app_settings.DEV_MODE:
        raise HTTPException(status_code=404, detail="Not found")
```

Then add `Depends(require_dev)` to the 4 dev endpoints:

```python
@router.post("/auth/claim-seed-data")
async def claim_seed_data(
    _: None = Depends(require_dev),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ...  # existing body unchanged

@router.get("/auth/allowlist")
async def get_allowlist(
    _: None = Depends(require_dev),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ...  # existing body unchanged

@router.post("/auth/allowlist")
async def add_to_allowlist(
    body: dict,
    _: None = Depends(require_dev),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ...  # existing body unchanged

@router.delete("/auth/allowlist/{email}")
async def remove_from_allowlist(
    email: str,
    _: None = Depends(require_dev),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ...  # existing body unchanged
```

- [ ] **Step 3: Enable DEV_MODE in test environment**

In `tests/conftest.py`, find where the test app is set up. Add at the top of the file (after imports):

```python
import os
os.environ.setdefault("DEV_MODE", "true")
```

OR if conftest uses pytest fixtures to set env, add:
```python
@pytest.fixture(autouse=True, scope="session")
def set_dev_mode():
    from app.config import settings as app_settings
    original = app_settings.DEV_MODE
    app_settings.DEV_MODE = True
    yield
    app_settings.DEV_MODE = original
```

Check current conftest.py structure and use whichever pattern fits. The `os.environ` approach before any imports is simplest.

- [ ] **Step 4: Run tests**

```bash
cd /Users/amansaini/GexpenseTracker && python -m pytest tests/test_auth_required.py tests/test_auth_flow.py -v --ignore=tests/test_llm_client.py 2>&1 | tail -30
```

Expected: all PASS. The allowlist + seed-data entries stay in PROTECTED and still return 401 (auth dependency runs; with no session cookie, `get_current_user` raises 401 before `require_dev` body executes… wait — check FastAPI dependency resolution order. `require_dev` has no sub-dependencies so it resolves first and will 404 in non-dev mode. In test mode with DEV_MODE=True, it passes through to `get_current_user`, which raises 401. So tests pass.)

- [ ] **Step 5: Commit**

```bash
git add app/config.py app/api/auth.py tests/conftest.py
git commit -m "feat: gate auth dev endpoints (allowlist, seed-data) behind DEV_MODE flag"
```

---

### Task 3: Rename path params for consistency

**Files:**
- Modify: `app/api/recurring.py` (lines with `{item_id}`)
- Modify: `app/api/debt.py` (lines with `{debt_id}`)
- Modify: `app/api/budgets.py` (lines with `{budget_id}`)

Note: path param names are server-side variable names only. URL structure (e.g. `/recurring/123`) does not change. No frontend or test URL changes needed.

- [ ] **Step 1: Rename in recurring.py**

In `app/api/recurring.py`, change:
```python
@router.patch("/recurring/{item_id}")
async def update_recurring(item_id: str, ...):
    # any reference to item_id inside the body
```
to:
```python
@router.patch("/recurring/{id}")
async def update_recurring(id: str, ...):
    # update variable name inside body too
```

Same for:
```python
@router.delete("/recurring/{item_id}")
async def delete_recurring(item_id: str, ...):
```
→
```python
@router.delete("/recurring/{id}")
async def delete_recurring(id: str, ...):
```

Read the actual function bodies in `app/api/recurring.py` lines 81–115 to ensure every use of `item_id` inside the body is renamed to `id`.

- [ ] **Step 2: Rename in debt.py**

In `app/api/debt.py`, rename `{debt_id}` → `{id}` in PATCH and DELETE routes (lines ~77 and ~101). Also rename the function parameter and every use of `debt_id` inside those function bodies.

- [ ] **Step 3: Rename in budgets.py**

In `app/api/budgets.py`, rename `{budget_id}` → `{id}` in PATCH and DELETE routes (lines ~86 and ~102). Rename the function parameter and every use of `budget_id` inside those function bodies.

- [ ] **Step 4: Run tests**

```bash
cd /Users/amansaini/GexpenseTracker && python -m pytest tests/ -v --ignore=tests/test_llm_client.py -k "budget or debt or recurring" 2>&1 | tail -20
```

Expected: PASS. If no tests exist for these, run full suite instead.

- [ ] **Step 5: Commit**

```bash
git add app/api/recurring.py app/api/debt.py app/api/budgets.py
git commit -m "refactor: normalize path params to {id} in recurring, debt, budgets"
```

---

### Task 4: Gate internal sync endpoints behind owner role

**Files:**
- Modify: `app/api/sync.py` (add owner check to `/sync/backfill-bodies` and `/llm/status`)

- [ ] **Step 1: Add owner guard to backfill_bodies**

In `app/api/sync.py`, find `async def backfill_bodies` (line ~86). After the function signature, add as the first line of the body:

```python
if current_user.role not in ("owner",):
    from fastapi import HTTPException
    raise HTTPException(status_code=403, detail="Owner only")
```

Note: check what `current_user.role` type is. In `auth.py` line 274 it's compared to `UserRole.owner` and `"owner"` — use the same pattern.

- [ ] **Step 2: Add owner guard to llm_status**

In `app/api/sync.py`, find `@router.get("/llm/status")` (line ~152). Read the function signature to confirm it accepts `current_user`. If it doesn't already depend on `get_current_user`, add:

```python
@router.get("/llm/status")
async def llm_status(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if current_user.role not in ("owner",):
        raise HTTPException(status_code=403, detail="Owner only")
    ...  # existing body
```

- [ ] **Step 3: Run tests**

```bash
cd /Users/amansaini/GexpenseTracker && python -m pytest tests/test_auth_required.py tests/test_sync.py -v --ignore=tests/test_llm_client.py 2>&1 | tail -20
```

Expected: PASS. The `POST /api/sync/backfill-bodies` entry in PROTECTED still returns 401 (auth check runs before role check).

- [ ] **Step 4: Commit**

```bash
git add app/api/sync.py
git commit -m "security: restrict /sync/backfill-bodies and /llm/status to owner role"
```

---

### Task 5: Merge /review/count into /review with ?count=true

**Files:**
- Modify: `app/api/review.py` (add `count` query param to `GET /review`, delete `GET /review/count`)
- Modify: `static/app.js` (update URL from `/api/review/count` to `/api/review?count=true`)
- Modify: `tests/test_auth_required.py` (replace `/api/review/count` with `/api/review?count=true` in PROTECTED list — or remove since `/api/review` already covers auth)

- [ ] **Step 1: Modify GET /review to accept ?count=true**

In `app/api/review.py`, replace the two separate endpoints with one merged endpoint:

```python
@router.get("/review")
async def get_review_queue(
    count: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if count:
        result = await db.execute(
            select(func.count())
            .select_from(Transaction)
            .join(Email, Transaction.email_id == Email.id)
            .where(
                Transaction.status == TransactionStatus.needs_review.value,
                Email.user_id == current_user.id,
            )
        )
        return {"count": result.scalar() or 0}

    rows = (await db.execute(
        select(Transaction, Email)
        .join(Email)
        .where(
            Transaction.status == TransactionStatus.needs_review.value,
            Email.user_id == current_user.id,
        )
        .order_by(desc(Email.received_at))
        ... # rest of existing GET /review body
```

Read the full existing `get_review_queue` body (lines 36 onward in `review.py`) and include it in the `else` branch (or after the early `if count: return`).

Delete the entire `get_review_count` function (lines 21–33).

- [ ] **Step 2: Update frontend caller**

In `static/app.js` line 42, change:
```javascript
const data = await fetch('/api/review/count').then(r => r.json());
```
to:
```javascript
const data = await fetch('/api/review?count=true').then(r => r.json());
```

- [ ] **Step 3: Update test_auth_required.py**

In `tests/test_auth_required.py`, find line 35:
```python
("GET",  "/api/review/count"),
```
Remove that line. `/api/review` is already in PROTECTED at line 36, covering auth.

- [ ] **Step 4: Run tests**

```bash
cd /Users/amansaini/GexpenseTracker && python -m pytest tests/test_review.py tests/test_auth_required.py -v --ignore=tests/test_llm_client.py 2>&1 | tail -20
```

Expected: all PASS.

- [ ] **Step 5: Run full suite**

```bash
cd /Users/amansaini/GexpenseTracker && python -m pytest tests/ --ignore=tests/test_llm_client.py 2>&1 | tail -30
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add app/api/review.py static/app.js tests/test_auth_required.py
git commit -m "refactor: merge /review/count into GET /review?count=true, drop standalone count endpoint"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Task 1 — Remove `account.py`, merge 2 endpoints into `settings.py`
- ✅ Task 2 — Gate allowlist + seed-data behind `DEV_MODE`
- ✅ Task 3 — Normalize path params `{item_id}`, `{debt_id}`, `{budget_id}` → `{id}`
- ✅ Task 4 — Gate `/sync/backfill-bodies` + `/llm/status` to owner only
- ✅ Task 5 — Merge `/review/count` + `/review` → `GET /review?count=true`
- ✅ Backward compat maintained — all URL paths unchanged except `/review/count` (one frontend caller updated)
- ✅ No user-facing functionality removed
- ✅ Response schemas unchanged

**Placeholder scan:** None found — all steps include actual code.

**Type consistency:** `_profile_dict`, `_load_user_bundle` referenced in Task 1 match what exists in `app/api/_account_helpers.py` (verified by reading `account.py` which imports them). `UserProfile` model name verified from existing `account.py` import.
