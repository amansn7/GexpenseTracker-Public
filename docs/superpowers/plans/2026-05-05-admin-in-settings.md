# Admin-in-Settings + Email Date-Range Fetch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Admin panel into Settings as an owner-only tab with a dark terminal aesthetic, and add a `POST /sync/fetch-range` endpoint + UI for fetching+backfilling Gmail emails in a user-specified date range.

**Architecture:** Backend first (testable in isolation): extend `fetch_new_messages` with date params, add `run_sync_range`, add the endpoint. Then frontend: refactor `admin.jsx` to export individual section components + new `FetchRangeSection`, add admin tab to `account.jsx`, remove admin from nav. The codebase uses window globals (all JSX assigns to `window`, loaded as `<script>` tags — no ES module imports).

**Tech Stack:** FastAPI, SQLAlchemy async, Pydantic, pytest-asyncio; React 18 via CDN (no build step), window globals pattern

---

## File Map

| File | Change |
|------|--------|
| `app/gmail/client.py` | Add `after_date`/`before_date` params to `fetch_new_messages` |
| `app/sync.py` | Add `run_sync_range(user_id, after_date, before_date)` |
| `app/api/sync.py` | Add `FetchRangeBody` + `POST /sync/fetch-range` (owner-only) |
| `tests/test_sync.py` | Tests for `run_sync_range` + endpoint |
| `static/src/admin.jsx` | Add `FetchRangeSection`; change final export from `AdminView` to individual sections |
| `static/src/account.jsx` | Add admin tab (owner-only, terminal-styled) to `SettingsView` |
| `static/src/shell.jsx` | Remove Admin `NavItem` |
| `static/src/app.jsx` | Remove `view === "admin"` routing case |

---

### Task 1: Extend `fetch_new_messages` with date range params

**Files:**
- Modify: `app/gmail/client.py` (lines 111–146, the `fetch_new_messages` function)

Context: `fetch_new_messages` has two paths — query-based list API (when `last_history_id is None`) and history API (when `last_history_id` is set). For date-range fetches we always want the query-based path with `after:YYYY/MM/DD before:YYYY/MM/DD` Gmail syntax. When date params are given, `new_history_id` must NOT be advanced (preserve caller's state).

- [ ] **Step 1: Read the current function signature**

```bash
sed -n '111,170p' /Users/amansaini/GexpenseTracker/app/gmail/client.py
```

Confirm the signature is `def fetch_new_messages(last_history_id, email_filter: str = "all", creds: Credentials | None = None):` and the `if last_history_id is None:` block builds the query string starting at line ~128.

- [ ] **Step 2: Edit `fetch_new_messages` to accept date params**

Replace the function signature and the `if last_history_id is None:` block's query-building section. The full change:

**Old signature:**
```python
def fetch_new_messages(
    last_history_id,
    email_filter: str = "all",
    creds: Credentials | None = None,
):
```

**New signature:**
```python
def fetch_new_messages(
    last_history_id,
    email_filter: str = "all",
    creds: Credentials | None = None,
    after_date: str | None = None,
    before_date: str | None = None,
):
```

Then change the condition that gates the query-based path. **Old:**
```python
    if last_history_id is None:
        query = "newer_than:90d"
        if email_filter == "unread":
            query += " is:unread"
        elif email_filter == "read":
            query += " is:read"
```

**New:**
```python
    if last_history_id is None or after_date is not None:
        if after_date is not None:
            query = f"after:{after_date}"
            if before_date:
                query += f" before:{before_date}"
        else:
            query = "newer_than:90d"
            if email_filter == "unread":
                query += " is:unread"
            elif email_filter == "read":
                query += " is:read"
```

Then, after the pagination loop (after `break`), add logic so date-range fetches don't advance history_id. Find the line `profile = service.users().getProfile(userId="me").execute()` and `new_history_id = str(profile["historyId"])`. Wrap them:

**Old:**
```python
        profile = service.users().getProfile(userId="me").execute()
        new_history_id = str(profile["historyId"])
```

**New:**
```python
        if after_date is not None:
            new_history_id = last_history_id
        else:
            profile = service.users().getProfile(userId="me").execute()
            new_history_id = str(profile["historyId"])
```

- [ ] **Step 3: Write a unit test for the date-range query building**

Add to `tests/test_sync.py`:

```python
def test_fetch_new_messages_date_range_query():
    """fetch_new_messages with after_date builds correct Gmail query and preserves history_id."""
    from unittest.mock import patch, MagicMock
    from app.gmail.client import fetch_new_messages

    mock_service = MagicMock()
    mock_service.users().messages().list().execute.return_value = {"messages": []}

    with patch("app.gmail.client._build_service", return_value=mock_service):
        messages, returned_history_id = fetch_new_messages(
            last_history_id="abc123",
            after_date="2024/01/01",
            before_date="2024/03/31",
        )

    assert messages == []
    assert returned_history_id == "abc123"  # preserved, not advanced

    call_kwargs = mock_service.users().messages().list.call_args[1]
    assert "after:2024/01/01" in call_kwargs["q"]
    assert "before:2024/03/31" in call_kwargs["q"]
```

- [ ] **Step 4: Run the test to verify it fails first**

```bash
cd /Users/amansaini/GexpenseTracker && python -m pytest tests/test_sync.py::test_fetch_new_messages_date_range_query -v 2>&1 | tail -20
```

Expected: FAIL (function doesn't accept date params yet).

- [ ] **Step 5: Run again after the edit to verify it passes**

```bash
cd /Users/amansaini/GexpenseTracker && python -m pytest tests/test_sync.py::test_fetch_new_messages_date_range_query -v 2>&1 | tail -20
```

Expected: PASS.

- [ ] **Step 6: Run full test suite to check nothing regressed**

```bash
cd /Users/amansaini/GexpenseTracker && python -m pytest tests/ --ignore=tests/test_llm_client.py -v 2>&1 | tail -30
```

Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add app/gmail/client.py tests/test_sync.py
git commit -m "feat: extend fetch_new_messages with after_date/before_date date-range params"
```

---

### Task 2: Add `run_sync_range` + `POST /sync/fetch-range` endpoint

**Files:**
- Modify: `app/sync.py` (add `run_sync_range` after `run_sync`)
- Modify: `app/api/sync.py` (add `FetchRangeBody` model + endpoint)
- Test: `tests/test_sync.py`

Context: `_run_sync_inner` runs in its own `AsyncSessionLocal()` session, updates SyncState at the end. `run_sync_range` must NOT update SyncState (it's a one-off backfill). It also runs a backfill pass after classification to fill missing email bodies in the date range. The endpoint is owner-only (403 for non-owners).

- [ ] **Step 1: Write the failing test for the endpoint**

Add to `tests/test_sync.py`:

```python
@pytest.mark.asyncio
async def test_fetch_range_endpoint_owner_only(db_session):
    """Non-owner gets 403 from /sync/fetch-range."""
    from httpx import AsyncClient, ASGITransport
    from app.main import app
    from app.database import get_db
    from app.auth_deps import get_current_user
    from app.models import User, UserRole, UserStatus

    member = User(email="member@test.com", role=UserRole.member, status=UserStatus.active, onboarding_complete=True)
    db_session.add(member)
    await db_session.commit()

    async def _override_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[get_current_user] = lambda: member

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/api/sync/fetch-range", json={"after_date": "2024-01-01", "before_date": "2024-03-31"})
        assert resp.status_code == 403
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_fetch_range_endpoint_owner_succeeds(db_session):
    """Owner gets 200 from /sync/fetch-range with mocked Gmail."""
    from httpx import AsyncClient, ASGITransport
    from unittest.mock import patch
    from app.main import app
    from app.database import get_db
    from app.auth_deps import get_current_user
    from app.models import User, UserRole, UserStatus

    owner = User(email="owner@test.com", role=UserRole.owner, status=UserStatus.active, onboarding_complete=True)
    db_session.add(owner)
    await db_session.commit()

    async def _override_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[get_current_user] = lambda: owner

    try:
        with patch("app.sync.run_sync_range", return_value={"fetched": 0, "inserted": 0, "backfilled": 0, "errors": 0}):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.post("/api/sync/fetch-range", json={"after_date": "2024-01-01", "before_date": "2024-03-31"})
        assert resp.status_code == 200
        data = resp.json()
        assert "fetched" in data and "backfilled" in data
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/amansaini/GexpenseTracker && python -m pytest tests/test_sync.py::test_fetch_range_endpoint_owner_only tests/test_sync.py::test_fetch_range_endpoint_owner_succeeds -v 2>&1 | tail -20
```

Expected: FAIL (endpoint doesn't exist yet).

- [ ] **Step 3: Add `run_sync_range` to `app/sync.py`**

Read the top of `app/sync.py` to confirm imports. After the `run_sync` function (around line 78), add:

```python
async def run_sync_range(user_id: str, after_date: str, before_date: str) -> dict:
    """
    Fetch + classify emails in a specific date range, then backfill missing bodies.
    Does NOT update SyncState (history_id or last_synced_at).
    after_date / before_date: "YYYY/MM/DD" (Gmail query format).
    """
    from sqlalchemy import or_
    from app.gmail.auth import get_credentials_for_user
    from app.gmail.client import _build_service, _extract_body_text

    async with AsyncSessionLocal() as session:
        try:
            creds = await get_credentials_for_user(session, user_id)
            if not creds:
                raise RuntimeError("Gmail not authenticated")

            messages, _ = await asyncio.to_thread(
                fetch_new_messages, None, "all", creds, after_date, before_date
            )
        except Exception as exc:
            logger.error("fetch-range: Gmail fetch failed: %s", exc)
            return {"fetched": 0, "inserted": 0, "backfilled": 0, "errors": 1}

        fetched = len(messages)
        incoming_ids = [m["gmail_id"] for m in messages]
        existing = {row[0] for row in (await session.execute(
            select(Email.gmail_id).where(Email.gmail_id.in_(incoming_ids))
        )).all()} if incoming_ids else set()

        new_pairs = []
        for msg in messages:
            if msg["gmail_id"] in existing:
                continue
            email = Email(**msg)
            email.user_id = user_id
            session.add(email)
            new_pairs.append((email, msg))

        await session.flush()

        user_settings = (await session.execute(
            select(UserSettings).where(UserSettings.user_id == user_id)
        )).scalar_one_or_none()
        rule_engine_enabled = user_settings.use_rule_engine if user_settings else True
        db_rules: dict = {}
        if rule_engine_enabled:
            from app.classifier.rules import build_domain_rules
            db_rules = await build_domain_rules(session)

        user_llm_client = None
        if user_settings and user_settings.active_ai_service_id:
            from app.models.user import UserAIService
            from app.api._account_helpers import _decrypt_secret
            from app.classifier.llm_client import build_user_client
            ai_svc = (await session.execute(
                select(UserAIService).where(UserAIService.id == user_settings.active_ai_service_id)
            )).scalar_one_or_none()
            if ai_svc and ai_svc.enabled and ai_svc.encrypted_api_key:
                try:
                    user_llm_client = build_user_client(
                        provider=ai_svc.provider,
                        base_url=ai_svc.base_url,
                        api_key=_decrypt_secret(ai_svc.encrypted_api_key),
                        model_id=ai_svc.model_id,
                    )
                except Exception as exc:
                    logger.error("fetch-range: failed to build user LLM client: %s", exc)

        sem = asyncio.Semaphore(_LLM_CONCURRENCY)

        async def _classify_one(email: Email, msg: dict):
            async with sem:
                return await classify_email(
                    email_id=email.id,
                    sender=msg["sender"],
                    sender_domain=msg["sender_domain"],
                    subject=msg["subject"] or "",
                    body_text=msg.get("body_text") or msg.get("body_snippet") or "",
                    session=session,
                    rule_engine_enabled=rule_engine_enabled,
                    db_rules=db_rules,
                    llm_client_override=user_llm_client,
                )

        classifications = await asyncio.gather(
            *[_classify_one(e, m) for e, m in new_pairs],
            return_exceptions=True,
        )

        inserted = 0
        for (email, _), cls in zip(new_pairs, classifications):
            if isinstance(cls, Exception):
                t = Transaction(
                    email_id=email.id,
                    label=Label.ignore.value,
                    currency="INR",
                    status="needs_review",
                    classifier_method="llm",
                    confidence=0.0,
                )
            else:
                t = Transaction(
                    email_id=email.id,
                    label=cls.label.value,
                    amount=cls.amount,
                    currency="INR",
                    merchant=cls.merchant,
                    category=cls.category,
                    txn_date=cls.txn_date,
                    confidence=cls.confidence,
                    status=cls.status.value,
                    classifier_method=cls.classifier_method.value,
                )
                inserted += 1
            session.add(t)

        await session.flush()

        # ── Backfill missing bodies for emails in this date range ─────────────
        from datetime import datetime as _dt
        try:
            after_dt = _dt.strptime(after_date, "%Y/%m/%d")
            before_dt = _dt.strptime(before_date, "%Y/%m/%d")
        except ValueError:
            after_dt = before_dt = None

        backfilled = 0
        errors = 0
        if after_dt and before_dt:
            missing_q = select(Email).where(
                Email.user_id == user_id,
                Email.received_at >= after_dt,
                Email.received_at <= before_dt,
                or_(Email.body_text.is_(None), Email.body_text == ""),
            )
            missing_emails = (await session.execute(missing_q)).scalars().all()
            if missing_emails:
                service = await asyncio.to_thread(_build_service, creds)
                for email in missing_emails:
                    try:
                        msg = await asyncio.to_thread(
                            lambda eid=email.gmail_id: service.users().messages().get(
                                userId="me", id=eid, format="full"
                            ).execute()
                        )
                        body = _extract_body_text(msg.get("payload", {}))
                        if body:
                            email.body_text = body
                            backfilled += 1
                    except Exception as exc:
                        logger.warning("fetch-range backfill: failed for %s: %s", email.gmail_id, exc)
                        errors += 1

        await session.commit()

    logger.info("fetch-range: fetched=%d inserted=%d backfilled=%d errors=%d", fetched, inserted, backfilled, errors)
    return {"fetched": fetched, "inserted": inserted, "backfilled": backfilled, "errors": errors}
```

Check imports at top of `app/sync.py` — make sure `UserSettings`, `Label`, `Transaction`, `Email` are all already imported. Read the top of the file to confirm.

- [ ] **Step 4: Add endpoint to `app/api/sync.py`**

Read `app/api/sync.py` lines 1–30 to confirm existing imports include `HTTPException`, `date`, `User`. Then add after the existing `BackfillBody` class:

```python
from datetime import date as _date

class FetchRangeBody(BaseModel):
    after_date: _date
    before_date: _date

    @model_validator(mode="after")
    def _check_range(self):
        if self.after_date >= self.before_date:
            raise ValueError("after_date must be before before_date")
        from datetime import date as d
        if (self.before_date - self.after_date).days > 365:
            raise ValueError("Date range cannot exceed 365 days")
        return self


@router.post("/sync/fetch-range")
async def fetch_range(
    body: FetchRangeBody,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role not in ("owner",):
        raise HTTPException(status_code=403, detail="Owner only")
    from app.sync import run_sync_range
    result = await run_sync_range(
        user_id=current_user.id,
        after_date=body.after_date.strftime("%Y/%m/%d"),
        before_date=body.before_date.strftime("%Y/%m/%d"),
    )
    return result
```

Also add `model_validator` to imports at top of `app/api/sync.py` — find the `from pydantic import BaseModel` line and add `model_validator`:
```python
from pydantic import BaseModel, model_validator
```

Also add `User` to the models import if not present, and `HTTPException` to the fastapi import if not present.

- [ ] **Step 5: Run the tests**

```bash
cd /Users/amansaini/GexpenseTracker && python -m pytest tests/test_sync.py::test_fetch_range_endpoint_owner_only tests/test_sync.py::test_fetch_range_endpoint_owner_succeeds tests/test_sync.py::test_fetch_new_messages_date_range_query -v 2>&1 | tail -30
```

Expected: all 3 PASS.

- [ ] **Step 6: Run full test suite**

```bash
cd /Users/amansaini/GexpenseTracker && python -m pytest tests/ --ignore=tests/test_llm_client.py 2>&1 | tail -20
```

Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add app/sync.py app/api/sync.py tests/test_sync.py
git commit -m "feat: add run_sync_range + POST /sync/fetch-range (owner-only, date-range Gmail fetch+backfill)"
```

---

### Task 3: Refactor `admin.jsx` — add `FetchRangeSection`, export individual sections

**Files:**
- Modify: `static/src/admin.jsx`

Context: Currently `admin.jsx` exports only `AdminView` via `Object.assign(window, { AdminView })`. We need to:
1. Add a new `FetchRangeSection` component (dark terminal styled, calls `POST /api/sync/fetch-range`)
2. Change the final line to export all individual section components instead of `AdminView`
3. `AdminView` itself can be kept for now (it won't be referenced after Task 5), but the individual sections must be on `window`

The `FetchRangeSection` must be dark-terminal styled to match the mockup: dark bg (`#0d0d0d`), monospace font, green headers. However, since it's a self-contained component, it controls its own internal styling via inline styles.

- [ ] **Step 1: Add `FetchRangeSection` component**

In `admin.jsx`, add the following component **before** the `AdminView` component (around line 442):

```jsx
// ── Section: Fetch Email Range ─────────────────────────────────────────────────

const FetchRangeSection = () => {
  const [afterDate,  setAfterDate]  = React.useState("");
  const [beforeDate, setBeforeDate] = React.useState("");
  const [loading,    setLoading]    = React.useState(false);
  const [result,     setResult]     = React.useState(null);
  const [error,      setError]      = React.useState(null);

  const T = {
    section: { border: "1px solid rgba(16,185,129,0.25)", borderRadius: 6, padding: 14, marginBottom: 16 },
    header:  { color: "#10b981", fontSize: 11, fontWeight: 700, letterSpacing: "0.8px", marginBottom: 10, fontFamily: "'Geist Mono', monospace" },
    label:   { color: "#6b7280", fontSize: 9, letterSpacing: "0.5px", marginBottom: 4, textTransform: "uppercase", display: "block", fontFamily: "'Geist Mono', monospace" },
    input:   { background: "#1a1a1a", border: "1px solid #333", borderRadius: 4, padding: "6px 10px", color: "#e5e5e5", fontSize: 11, fontFamily: "'Geist Mono', monospace", outline: "none", width: "100%", boxSizing: "border-box" },
    btn:     { background: "#10b981", color: "#0d0d0d", border: "none", borderRadius: 4, padding: "7px 14px", fontSize: 11, fontFamily: "'Geist Mono', monospace", fontWeight: 700, cursor: "pointer", letterSpacing: "0.5px" },
    btnDis:  { background: "#1a3a2a", color: "#4b7a62", cursor: "default" },
    hint:    { color: "#4b5563", fontSize: 10, fontFamily: "'Geist Mono', monospace", marginTop: 6 },
    result:  { marginTop: 10, color: "#10b981", fontSize: 11, fontFamily: "'Geist Mono', monospace" },
    err:     { marginTop: 10, color: "#ef4444", fontSize: 11, fontFamily: "'Geist Mono', monospace" },
  };

  const run = async () => {
    if (!afterDate || !beforeDate || loading) return;
    setLoading(true); setError(null); setResult(null);
    try {
      const r = await API.post("/api/sync/fetch-range", { after_date: afterDate, before_date: beforeDate });
      setResult(r);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const disabled = !afterDate || !beforeDate || loading;

  return (
    <div style={T.section}>
      <div style={T.header}>▶ FETCH EMAIL RANGE</div>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 8 }}>
        <div style={{ flex: 1, minWidth: 120 }}>
          <label style={T.label}>From</label>
          <input type="date" value={afterDate} onChange={e => setAfterDate(e.target.value)} style={T.input} />
        </div>
        <div style={{ flex: 1, minWidth: 120 }}>
          <label style={T.label}>To</label>
          <input type="date" value={beforeDate} onChange={e => setBeforeDate(e.target.value)} style={T.input} />
        </div>
        <button style={{ ...T.btn, ...(disabled ? T.btnDis : {}) }} onClick={run} disabled={disabled}>
          {loading ? "FETCHING…" : "FETCH + BACKFILL"}
        </button>
      </div>
      <div style={T.hint}>Fetches new emails from Gmail in range, then backfills missing bodies. Owner only.</div>
      {result && (
        <div style={T.result}>
          ✓ fetched: {result.fetched} · inserted: {result.inserted} · backfilled: {result.backfilled} · errors: {result.errors}
        </div>
      )}
      {error && <div style={T.err}>✗ {error}</div>}
    </div>
  );
};
```

- [ ] **Step 2: Change the window export at the bottom of `admin.jsx`**

Find the last line of the file (line 459):
```javascript
Object.assign(window, { AdminView });
```

Replace with:
```javascript
Object.assign(window, { AdminView, SyncSection, FetchPreviewSection, ClassifyTestSection, LLMStatusSection, AlertsSection, FetchRangeSection });
```

- [ ] **Step 3: Verify the file parses correctly**

```bash
node --input-type=module < /dev/null; cd /Users/amansaini/GexpenseTracker && python -c "
import subprocess, sys
r = subprocess.run(['node', '-e', 'const fs=require(\"fs\"); const c=fs.readFileSync(\"static/src/admin.jsx\",\"utf8\"); console.log(\"lines:\", c.split(\"\\n\").length)'], capture_output=True, text=True)
print(r.stdout or r.stderr)
"
```

Or simply check the file was saved correctly:
```bash
tail -5 /Users/amansaini/GexpenseTracker/static/src/admin.jsx
```

Expected output shows `Object.assign(window, { AdminView, SyncSection, FetchPreviewSection, ClassifyTestSection, LLMStatusSection, AlertsSection, FetchRangeSection });` on the last line.

- [ ] **Step 4: Commit**

```bash
git add static/src/admin.jsx
git commit -m "feat: add FetchRangeSection to admin.jsx, export all sections via window globals"
```

---

### Task 4: Add Admin tab to `account.jsx`

**Files:**
- Modify: `static/src/account.jsx`

Context: `SettingsView` in `account.jsx` is the main settings component. It currently renders a page of sections without tabs. We're adding a tab bar at the top with tabs: Sync, Parsing & AI, Categories, Danger Zone, and a new owner-only **⚡ Admin** tab with dashed red border. When Admin tab is active, render a dark terminal panel (`background: #0d0d0d`) containing `FetchRangeSection`, `SyncSection`, `FetchPreviewSection`, `ClassifyTestSection`, `LLMStatusSection`, `AlertsSection` — all from `window` globals set in `admin.jsx`.

The current `SettingsView` renders sections directly — there is no existing tab navigation within it. We need to add tab state and render conditionally.

Also: `AccessSection` is currently always rendered at the bottom inside `SettingsView` (line 1031: `{account?.role === "owner" && <AccessSection account={account} />}`). Move it so it's visible only when NOT in admin tab (or always show it — it's already owner-gated). Keep it where it is.

- [ ] **Step 1: Read `SettingsView` to understand structure**

```bash
sed -n '493,620p' /Users/amansaini/GexpenseTracker/static/src/account.jsx
```

Identify the `return (` statement and the outer `<div>` wrapping everything.

- [ ] **Step 2: Add tab state to `SettingsView`**

Inside `SettingsView`, after existing state declarations (after line ~532, before `syncMeta`), add:

```jsx
  const [adminTab, setAdminTab] = React.useState(false);
```

- [ ] **Step 3: Add tab bar markup at the top of the SettingsView return**

Find the `return (` of `SettingsView` and the first rendered `<div style={accountStyles.section}>`. Before the first section, insert:

```jsx
      {/* Tab bar */}
      <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 20, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => setAdminTab(false)}
          style={{
            padding: "6px 14px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 12,
            background: !adminTab ? "var(--ink)" : "transparent",
            color: !adminTab ? "var(--paper)" : "var(--ink-3)",
            fontFamily: "inherit",
          }}
        >
          Settings
        </button>
        {account?.role === "owner" && (
          <button
            type="button"
            onClick={() => setAdminTab(true)}
            style={{
              padding: "5px 13px", borderRadius: 20, cursor: "pointer", fontSize: 12, fontWeight: 700,
              border: "1.5px dashed #ef4444",
              background: adminTab ? "rgba(239,68,68,0.08)" : "transparent",
              color: "#ef4444",
              fontFamily: "inherit",
              letterSpacing: "0.3px",
            }}
          >
            ⚡ Admin
          </button>
        )}
      </div>
```

- [ ] **Step 4: Wrap existing sections with `{!adminTab && (...)}` and add admin panel**

After the tab bar, wrap all existing section content in `{!adminTab && ( ... )}` and add the admin panel below. The structure should be:

```jsx
      {/* Tab bar */}
      { ... tab bar from Step 3 ... }

      {/* Normal settings content */}
      {!adminTab && (
        <>
          { ... all existing sections ... }
        </>
      )}

      {/* Admin panel (owner-only, terminal-styled) */}
      {adminTab && account?.role === "owner" && (
        <div style={{ background: "#0d0d0d", borderRadius: 8, padding: 20, fontFamily: "'Geist Mono', monospace" }}>
          <div style={{ color: "#ef4444", fontSize: 10, fontWeight: 700, letterSpacing: "1.5px", marginBottom: 18 }}>
            // ADMIN — OWNER ONLY
          </div>
          <FetchRangeSection />
          <div style={{ border: "1px solid #1f1f1f", borderRadius: 6, padding: 14, marginBottom: 10 }}>
            <div style={{ color: "#10b981", fontSize: 11, fontWeight: 700, letterSpacing: "0.8px", marginBottom: 10 }}>▶ GMAIL SYNC</div>
            <SyncSection />
          </div>
          <div style={{ border: "1px solid #1f1f1f", borderRadius: 6, padding: 14, marginBottom: 10 }}>
            <div style={{ color: "#10b981", fontSize: 11, fontWeight: 700, letterSpacing: "0.8px", marginBottom: 10 }}>▶ FETCH PREVIEW</div>
            <FetchPreviewSection />
          </div>
          <div style={{ border: "1px solid #1f1f1f", borderRadius: 6, padding: 14, marginBottom: 10 }}>
            <div style={{ color: "#10b981", fontSize: 11, fontWeight: 700, letterSpacing: "0.8px", marginBottom: 10 }}>▶ CLASSIFY TEST</div>
            <ClassifyTestSection />
          </div>
          <div style={{ border: "1px solid #1f1f1f", borderRadius: 6, padding: 14, marginBottom: 10 }}>
            <div style={{ color: "#10b981", fontSize: 11, fontWeight: 700, letterSpacing: "0.8px", marginBottom: 10 }}>▶ LLM STATUS</div>
            <LLMStatusSection />
          </div>
          <div style={{ border: "1px solid #1f1f1f", borderRadius: 6, padding: 14 }}>
            <div style={{ color: "#10b981", fontSize: 11, fontWeight: 700, letterSpacing: "0.8px", marginBottom: 10 }}>▶ ALERTS</div>
            <AlertsSection />
          </div>
        </div>
      )}
```

Note: `SyncSection`, `FetchPreviewSection`, `ClassifyTestSection`, `LLMStatusSection`, `AlertsSection`, `FetchRangeSection` are all window globals set by `admin.jsx`. They are available as global names in JSX because `admin.jsx` is loaded as a `<script>` tag before `account.jsx` in `base.html`. Verify the script order in `base.html` — `admin.jsx` must be loaded before or alongside `account.jsx`.

- [ ] **Step 5: Check script load order in base.html**

```bash
grep -n "admin\|account\|script" /Users/amansaini/GexpenseTracker/templates/base.html | head -20
```

Ensure `admin.jsx` compiled bundle is loaded before `account.jsx` compiled bundle. If they are bundled together into `app.js`, there's no issue. If they're separate scripts, verify order.

- [ ] **Step 6: Verify no syntax errors in the file**

```bash
grep -c "useState\|useEffect\|return" /Users/amansaini/GexpenseTracker/static/src/account.jsx
```

Also check that the closing tags balance by looking at the end of the file:
```bash
tail -10 /Users/amansaini/GexpenseTracker/static/src/account.jsx
```

- [ ] **Step 7: Commit**

```bash
git add static/src/account.jsx
git commit -m "feat: add owner-only Admin tab to Settings with dark terminal panel"
```

---

### Task 5: Remove Admin from sidebar nav and app routing

**Files:**
- Modify: `static/src/shell.jsx` (line ~102)
- Modify: `static/src/app.jsx` (line ~280)

- [ ] **Step 1: Remove Admin NavItem from `shell.jsx`**

Find line ~102 in `shell.jsx`:
```jsx
    <NavItem icon="gear" label="Admin" active={view==="admin"} onClick={()=>navigate(()=>setView("admin"))} />
```

Delete that line entirely.

- [ ] **Step 2: Remove `view === "admin"` case from `app.jsx`**

Find line ~280 in `app.jsx`:
```jsx
        {view === "admin"     && <AdminView />}
```

Delete that line entirely.

- [ ] **Step 3: Run the full backend test suite to confirm nothing broke**

```bash
cd /Users/amansaini/GexpenseTracker && python -m pytest tests/ --ignore=tests/test_llm_client.py 2>&1 | tail -20
```

Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add static/src/shell.jsx static/src/app.jsx
git commit -m "refactor: remove Admin sidebar nav item and standalone admin view routing"
```

---

## Self-Review

**Spec coverage:**
- ✅ Admin tab in Settings — dashed red border, owner-only → Task 4
- ✅ Dark terminal panel (`#0d0d0d`, monospace, green headers) → Task 4
- ✅ All existing admin sections present in terminal panel → Task 4
- ✅ Admin nav item removed from sidebar → Task 5
- ✅ `view === "admin"` routing removed → Task 5
- ✅ `FetchRangeSection` — date pickers + FETCH+BACKFILL button → Task 3
- ✅ `POST /sync/fetch-range` endpoint (owner-only, 403 for non-owners) → Task 2
- ✅ `run_sync_range` — fetch+classify+backfill, does NOT update SyncState → Task 2
- ✅ `fetch_new_messages` extended with date params → Task 1
- ✅ `new_history_id` preserved (not advanced) for date-range fetches → Task 1
- ✅ Max range 365 days validated → Task 2 (`FetchRangeBody` validator)
- ✅ `after_date < before_date` validated → Task 2

**Placeholder scan:** None found.

**Type consistency:**
- `run_sync_range` returns `{"fetched": int, "inserted": int, "backfilled": int, "errors": int}` — matches what endpoint returns and what `FetchRangeSection` reads (`result.fetched`, `result.inserted`, `result.backfilled`, `result.errors`)
- `fetch_new_messages` new params `after_date: str | None`, `before_date: str | None` match how `run_sync_range` calls it: `fetch_new_messages(None, "all", creds, after_date, before_date)`
- `FetchRangeBody.after_date` is `_date` → `.strftime("%Y/%m/%d")` produces correct Gmail format → `fetch_new_messages` builds `after:2024/01/01` query → correct
