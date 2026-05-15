# Settings Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign SettingsView from a 9-section flat scroll into a 4-section sidebar-nav layout with real 2FA, wired digest_hour, inline AI service form gating, and a CSV export endpoint.

**Architecture:** Backend adds 3 TOTP columns to User + 4 new endpoints (2FA setup/verify/disable, CSV export). Frontend rewrites SettingsView into sidebar-nav shell with 4 sub-components (InboxSection, AISection, PreferencesSection, AccountSection) defined in account.jsx.

**Tech Stack:** FastAPI async, SQLAlchemy, Alembic, pyotp, qrcode[pil], React (no build step, global window exports)

**Option A in effect:** No password field exists in User model. 2FA disable uses session auth only (no password check). Password card dropped entirely.

---

## File Map

| Operation | File | Change |
|---|---|---|
| Modify | `requirements.txt` | add pyotp, qrcode[pil] |
| Modify | `app/models/user.py` | add totp_secret, totp_secret_pending, totp_enabled to User |
| Create | `alembic/versions/0019_add_totp_to_users.py` | migration for 3 TOTP columns |
| Modify | `app/api/_account_helpers.py` | expose totp_enabled in _load_user_bundle |
| Modify | `app/api/settings.py` | POST /2fa/setup, POST /2fa/verify, DELETE /2fa |
| Modify | `app/api/transactions.py` | GET /transactions/export CSV stream |
| Create | `tests/test_settings_2fa.py` | tests for 2FA endpoints |
| Modify | `static/src/account.jsx` | SettingsView ~70% rewrite (shell + 4 section components) |

---

## Task 1: Add TOTP dependencies

**Files:**
- Modify: `requirements.txt`

- [ ] **Step 1: Add dependencies**

In `requirements.txt`, append after the `httpx` line:
```
pyotp>=2.9.0
qrcode[pil]>=7.4.2
```

- [ ] **Step 2: Install and verify**

```bash
cd /Users/amansaini/GexpenseTracker
source .venv/bin/activate
pip install -r requirements.txt
python -c "import pyotp, qrcode; print('OK')"
```
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add requirements.txt
git commit -m "feat: add pyotp and qrcode dependencies for TOTP 2FA"
```

---

## Task 2: User model — TOTP columns + migration

**Files:**
- Modify: `app/models/user.py:22-38` (User class)
- Create: `alembic/versions/0019_add_totp_to_users.py`

- [ ] **Step 1: Add 3 columns to User class**

In `app/models/user.py`, add after the `onboarding_complete` field (line 29):

```python
    totp_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, server_default="0")
    totp_secret: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    totp_secret_pending: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
```

- [ ] **Step 2: Write migration**

Create `alembic/versions/0019_add_totp_to_users.py`:

```python
"""add totp columns to users

Revision ID: 0019
Revises: 0018
Create Date: 2026-05-04
"""
from alembic import op
import sqlalchemy as sa

revision = "0019"
down_revision = "0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("totp_enabled", sa.Boolean(), nullable=False, server_default="0"))
    op.add_column("users", sa.Column("totp_secret", sa.String(64), nullable=True))
    op.add_column("users", sa.Column("totp_secret_pending", sa.String(64), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "totp_secret_pending")
    op.drop_column("users", "totp_secret")
    op.drop_column("users", "totp_enabled")
```

- [ ] **Step 3: Run migration**

```bash
cd /Users/amansaini/GexpenseTracker
source .venv/bin/activate
alembic upgrade head
```
Expected: no errors, migration applies.

- [ ] **Step 4: Commit**

```bash
git add app/models/user.py alembic/versions/0019_add_totp_to_users.py
git commit -m "feat: add totp_enabled, totp_secret, totp_secret_pending to User model"
```

---

## Task 3: Expose totp_enabled in user bundle

**Files:**
- Modify: `app/api/_account_helpers.py:134-148` (_load_user_bundle return dict)

- [ ] **Step 1: Add totp_enabled to user dict in _load_user_bundle**

In `_account_helpers.py`, find the `"user"` dict in `_load_user_bundle` (around line 135). Add `totp_enabled` field:

```python
        "user": {
            "id": user.id,
            "email": user.email,
            "role": user.role,
            "status": user.status,
            "onboarding_complete": user.onboarding_complete,
            "totp_enabled": user.totp_enabled,
            "created_at": user.created_at.isoformat() if user.created_at else None,
        },
```

- [ ] **Step 2: Verify syntax**

```bash
cd /Users/amansaini/GexpenseTracker
source .venv/bin/activate
python -c "from app.api._account_helpers import _load_user_bundle; print('OK')"
```
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add app/api/_account_helpers.py
git commit -m "feat: expose totp_enabled in user bundle response"
```

---

## Task 4: 2FA backend endpoints + tests

**Files:**
- Modify: `app/api/settings.py`
- Create: `tests/test_settings_2fa.py`

- [ ] **Step 1: Write failing tests**

Create `tests/test_settings_2fa.py`:

```python
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport


@pytest.mark.asyncio
async def test_2fa_setup_returns_secret_and_qr(mock_user, db_session):
    from app.main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/account/2fa/setup")
    assert resp.status_code == 200
    data = resp.json()
    assert "secret" in data
    assert len(data["secret"]) >= 16
    assert data["qr_url"].startswith("data:image/png;base64,")


@pytest.mark.asyncio
async def test_2fa_verify_valid_code_enables_totp(mock_user, db_session):
    import pyotp
    from app.main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        setup = await client.post("/api/account/2fa/setup")
        secret = setup.json()["secret"]
        code = pyotp.TOTP(secret).now()
        resp = await client.post("/api/account/2fa/verify", json={"code": code})
    assert resp.status_code == 200
    assert resp.json()["ok"] is True
    await db_session.refresh(mock_user)
    assert mock_user.totp_enabled is True
    assert mock_user.totp_secret == secret
    assert mock_user.totp_secret_pending is None


@pytest.mark.asyncio
async def test_2fa_verify_wrong_code_returns_ok_false(mock_user, db_session):
    from app.main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        await client.post("/api/account/2fa/setup")
        resp = await client.post("/api/account/2fa/verify", json={"code": "000000"})
    assert resp.status_code == 200
    assert resp.json()["ok"] is False
    await db_session.refresh(mock_user)
    assert mock_user.totp_enabled is False


@pytest.mark.asyncio
async def test_2fa_disable_clears_totp(mock_user, db_session):
    import pyotp
    from app.main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        setup = await client.post("/api/account/2fa/setup")
        secret = setup.json()["secret"]
        code = pyotp.TOTP(secret).now()
        await client.post("/api/account/2fa/verify", json={"code": code})
        resp = await client.delete("/api/account/2fa")
    assert resp.status_code == 200
    assert resp.json()["ok"] is True
    await db_session.refresh(mock_user)
    assert mock_user.totp_enabled is False
    assert mock_user.totp_secret is None
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/amansaini/GexpenseTracker
source .venv/bin/activate
pytest tests/test_settings_2fa.py -v
```
Expected: 4 FAILED (endpoints not implemented yet)

- [ ] **Step 3: Implement 3 TOTP endpoints in settings.py**

Add these imports at the top of `app/api/settings.py` (after existing imports):

```python
from sqlalchemy import select as _select
```

Then add a new `TotpVerifyBody` model alongside existing models at the top of `settings.py`:

```python
class TotpVerifyBody(BaseModel):
    code: str
```

Then add the 3 endpoints at the end of `app/api/settings.py`:

```python
@router.post("/account/2fa/setup")
async def setup_2fa(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    import io, base64, qrcode, pyotp
    secret = pyotp.random_base32()
    user_row = (await db.execute(_select(User).where(User.id == user.id))).scalar_one()
    user_row.totp_secret_pending = secret
    await db.commit()
    uri = pyotp.TOTP(secret).provisioning_uri(user.email, issuer_name="GexpenseTracker")
    img = qrcode.make(uri)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    qr_url = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()
    return {"secret": secret, "qr_url": qr_url}


@router.post("/account/2fa/verify")
async def verify_2fa(
    body: TotpVerifyBody,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    import pyotp
    user_row = (await db.execute(_select(User).where(User.id == user.id))).scalar_one()
    if not user_row.totp_secret_pending:
        raise HTTPException(status_code=400, detail="No pending 2FA setup")
    valid = pyotp.TOTP(user_row.totp_secret_pending).verify(body.code, valid_window=1)
    if not valid:
        return {"ok": False, "error": "Invalid code"}
    user_row.totp_secret = user_row.totp_secret_pending
    user_row.totp_secret_pending = None
    user_row.totp_enabled = True
    await db.commit()
    return {"ok": True}


@router.delete("/account/2fa")
async def disable_2fa(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_row = (await db.execute(_select(User).where(User.id == user.id))).scalar_one()
    user_row.totp_enabled = False
    user_row.totp_secret = None
    user_row.totp_secret_pending = None
    await db.commit()
    return {"ok": True}
```

Also add `import base64` at the top of `settings.py` (it's used inside `setup_2fa`).

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/test_settings_2fa.py -v
```
Expected: 4 PASSED

- [ ] **Step 5: Commit**

```bash
git add app/api/settings.py tests/test_settings_2fa.py
git commit -m "feat: add 2FA setup/verify/disable endpoints with TOTP"
```

---

## Task 5: Transactions CSV export endpoint

**Files:**
- Modify: `app/api/transactions.py`

- [ ] **Step 1: Write failing test**

Add to a new file `tests/test_transactions_export.py`:

```python
import pytest
from httpx import AsyncClient, ASGITransport


@pytest.mark.asyncio
async def test_export_returns_csv_with_header(mock_user, db_session):
    from app.main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/transactions/export")
    assert resp.status_code == 200
    assert "text/csv" in resp.headers["content-type"]
    assert "attachment" in resp.headers.get("content-disposition", "")
    lines = resp.text.strip().split("\n")
    assert lines[0] == "date,merchant,amount,currency,category,label,confidence,notes"


@pytest.mark.asyncio
async def test_export_empty_when_no_transactions(mock_user, db_session):
    from app.main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/transactions/export")
    lines = [l for l in resp.text.strip().split("\n") if l]
    assert len(lines) == 1  # only header
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest tests/test_transactions_export.py -v
```
Expected: 2 FAILED

- [ ] **Step 3: Implement export endpoint in transactions.py**

Add this import at the top of `app/api/transactions.py` (after existing imports):

```python
import csv, io
from fastapi.responses import StreamingResponse
```

Then add at the end of `app/api/transactions.py`:

```python
@router.get("/transactions/export")
async def export_transactions(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(Transaction)
        .join(Email, Transaction.email_id == Email.id)
        .where(Email.user_id == user.id)
        .order_by(Transaction.txn_date.desc().nullslast(), Transaction.created_at.desc())
    )).scalars().all()

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["date", "merchant", "amount", "currency", "category", "label", "confidence", "notes"])
    for t in rows:
        writer.writerow([
            t.txn_date.isoformat() if t.txn_date else "",
            t.merchant or "",
            float(t.amount) if t.amount is not None else "",
            t.currency or "INR",
            t.category or "",
            t.label or "",
            round(float(t.confidence), 3) if t.confidence is not None else "",
            t.user_notes or "",
        ])
    buf.seek(0)

    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=transactions.csv"},
    )
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/test_transactions_export.py -v
```
Expected: 2 PASSED

- [ ] **Step 5: Run full test suite**

```bash
pytest --ignore=tests/test_llm_client.py -v
```
Expected: all pass (pre-existing test_llm_client.py excluded)

- [ ] **Step 6: Commit**

```bash
git add app/api/transactions.py tests/test_transactions_export.py
git commit -m "feat: add GET /api/transactions/export CSV download endpoint"
```

---

## Task 6: SettingsView shell — sidebar nav + mobile pills

**Files:**
- Modify: `static/src/account.jsx` (top of file, SettingsView function signature and outer JSX)

This task builds the nav shell only. All 4 sections render placeholders. Sections are filled in Tasks 7–10.

- [ ] **Step 1: Add settingsStyles object**

In `account.jsx`, directly after the `accountStyles` object (after line 21), add:

```javascript
const settingsStyles = {
  wrap: { display: "flex", height: "calc(100dvh - 72px)", overflow: "hidden" },
  sidebar: {
    width: 180, flexShrink: 0,
    borderRight: "1px solid var(--line)",
    padding: "24px 0",
    display: "flex", flexDirection: "column", gap: 2,
    overflowY: "auto",
  },
  sidebarLabel: {
    fontSize: 10, color: "var(--ink-4)",
    textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 600,
    padding: "0 20px 12px",
  },
  navItem: {
    display: "flex", alignItems: "center", gap: 10,
    padding: "9px 20px",
    background: "transparent", border: "none",
    borderLeft: "2px solid transparent",
    fontSize: 13, color: "var(--ink-3)",
    cursor: "pointer", fontFamily: "inherit",
    textAlign: "left", width: "100%", fontWeight: 400,
  },
  navItemActive: {
    borderLeft: "2px solid #1a1814",
    color: "#1a1814", fontWeight: 600,
    background: "var(--paper-2)",
  },
  sidebarDivider: { height: 1, background: "var(--line)", margin: "8px 20px" },
  content: {
    flex: 1, overflowY: "auto",
    padding: "clamp(18px, 4vw, 32px) clamp(14px, 5vw, 40px) 80px",
  },
  pillStrip: {
    display: "flex", gap: 6,
    overflowX: "auto", scrollbarWidth: "none",
    marginBottom: 20, paddingBottom: 2,
  },
  pill: {
    flexShrink: 0, padding: "6px 14px",
    borderRadius: 999,
    border: "1px solid var(--line)",
    background: "var(--paper)", color: "var(--ink-3)",
    fontSize: 12, fontWeight: 500,
    cursor: "pointer", fontFamily: "inherit",
  },
  pillActive: { background: "#1a1814", color: "#fbf9f3", border: "1px solid #1a1814" },
};
```

- [ ] **Step 2: Replace SettingsView outer JSX with sidebar shell**

Find the `return (` block inside SettingsView (around line 673 in the current file). Replace the entire return statement with:

```jsx
  const { isMobile } = useViewport();

  const NAV = [
    { id: "inbox",       icon: "inbox",   label: "Inbox" },
    { id: "ai",          icon: "sparkle", label: "AI" },
    { id: "preferences", icon: "sliders", label: "Preferences" },
    { id: "account",     icon: "lock",    label: "Account" },
  ];
  const [activeSection, setActiveSection] = React.useState("inbox");

  return (
    <div style={settingsStyles.wrap}>
      {!isMobile && (
        <div style={settingsStyles.sidebar}>
          <div style={settingsStyles.sidebarLabel}>SETTINGS</div>
          {NAV.map((item, i) => (
            <React.Fragment key={item.id}>
              {i === 3 && <div style={settingsStyles.sidebarDivider}/>}
              <button
                onClick={() => setActiveSection(item.id)}
                style={{ ...settingsStyles.navItem, ...(activeSection === item.id ? settingsStyles.navItemActive : {}) }}
              >
                <Icon name={item.icon} size={14}/>
                {item.label}
              </button>
            </React.Fragment>
          ))}
        </div>
      )}
      <div style={settingsStyles.content}>
        {isMobile && (
          <div style={settingsStyles.pillStrip}>
            {NAV.map(item => (
              <button key={item.id} onClick={() => setActiveSection(item.id)}
                style={{ ...settingsStyles.pill, ...(activeSection === item.id ? settingsStyles.pillActive : {}) }}>
                {item.label}
              </button>
            ))}
          </div>
        )}
        <div style={{ marginBottom: 24 }}>
          <div style={accountStyles.kicker}>Settings</div>
          <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 400, letterSpacing: "-0.02em", margin: "4px 0 0" }}>
            {NAV.find(n => n.id === activeSection)?.label}
          </h1>
        </div>
        {activeSection === "inbox" && <div style={{ color: "var(--ink-3)", fontSize: 13 }}>Inbox — coming next</div>}
        {activeSection === "ai" && <div style={{ color: "var(--ink-3)", fontSize: 13 }}>AI — coming next</div>}
        {activeSection === "preferences" && <div style={{ color: "var(--ink-3)", fontSize: 13 }}>Preferences — coming next</div>}
        {activeSection === "account" && <div style={{ color: "var(--ink-3)", fontSize: 13 }}>Account — coming next</div>}
      </div>
    </div>
  );
```

Also add `const [activeSection, setActiveSection] = React.useState("inbox");` and the `NAV` constant — place them just before the `return` statement.

Note: the existing state declarations and handlers (lines 494–672) remain unchanged at this step. Only the return statement is replaced.

- [ ] **Step 3: Verify syntax — check browser renders without crash**

Open the app and navigate to Settings. Sidebar should appear on desktop; pill strip on mobile. Each nav item switches the placeholder text.

- [ ] **Step 4: Commit**

```bash
git add static/src/account.jsx
git commit -m "feat: settings sidebar nav shell with desktop sidebar and mobile pill strip"
```

---

## Task 7: InboxSection component

**Files:**
- Modify: `static/src/account.jsx` (add InboxSection before SettingsView, wire in Task 6 placeholder)

- [ ] **Step 1: Define InboxSection component**

Add this component directly before `const SettingsView = ` (around line 493). It receives the same props the old inline Gmail block used:

```jsx
const InboxSection = ({ syncStatus, onRescan, syncing, gmailAccount, gmailConnected, updateEmailFilter, filterSaving }) => {
  const syncMeta = () => {
    if (!syncStatus?.last_synced_at) return "Never synced";
    const diff = Math.floor((Date.now() - new Date(syncStatus.last_synced_at)) / 60000);
    const when = diff < 1 ? "just now" : diff < 60 ? `${diff}m ago` : `${Math.floor(diff/60)}h ago`;
    const interval = `every ${syncStatus.sync_interval_hours}h`;
    if (!syncStatus.next_sync_at) return `Last synced ${when} · ${interval}`;
    const nextDiff = Math.max(0, Math.floor((new Date(syncStatus.next_sync_at) - Date.now()) / 60000));
    const next = nextDiff < 1 ? "next now" : nextDiff < 60 ? `next in ${nextDiff}m` : `next in ${Math.floor(nextDiff/60)}h`;
    return `Last synced ${when} · ${next} · ${interval}`;
  };

  return (
    <div>
      <div style={accountStyles.section}>
        <h3 style={accountStyles.sectionTitle}>Gmail</h3>
        <div style={accountStyles.sectionSub}>— the source of truth for your transactions</div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 18px", background: "var(--paper-2)", borderRadius: 6, marginTop: 6, flexWrap: "wrap" }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: "var(--card)", border: "1px solid var(--line)", display: "grid", placeItems: "center" }}>
            <Icon name="gmail" size={18} stroke="var(--accent)"/>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              Gmail
              <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 3, background: gmailConnected ? "var(--pos-soft)" : "var(--neg-soft)", color: gmailConnected ? "var(--pos)" : "var(--neg)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", display: "inline-flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 6, height: 6, borderRadius: 999, background: gmailConnected ? "var(--pos)" : "var(--neg)", display: "inline-block" }}/>
                {gmailConnected ? "Connected" : "Disconnected"}
              </span>
            </div>
            <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>{syncMeta()}</div>
            {gmailAccount?.account_email && (
              <div style={{ fontSize: 10, color: "var(--ink-4)", marginTop: 3, fontFamily: "'Geist Mono', monospace" }}>{gmailAccount.account_email}</div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {gmailConnected ? (
              <>
                <button onClick={onRescan} disabled={syncing} style={{ ...accountStyles.btn, opacity: syncing ? 0.6 : 1 }}>{syncing ? "Syncing…" : "Re-sync"}</button>
                <button onClick={() => window.location.href = "/api/auth/google"} style={{ ...accountStyles.btn, ...accountStyles.btnDanger }}>Reconnect</button>
              </>
            ) : (
              <button onClick={() => window.location.href = "/api/auth/google"} style={{ ...accountStyles.btn, ...accountStyles.btnPrimary }}>Connect Gmail</button>
            )}
          </div>
        </div>
      </div>

      <div style={accountStyles.section}>
        <h3 style={accountStyles.sectionTitle}>Messages to scan</h3>
        <div style={accountStyles.sectionSub}>— which emails are checked for transactions</div>
        <div style={{ marginTop: 10 }}>
          <div style={{ display: "inline-flex", padding: 3, border: "1px solid var(--line)", borderRadius: 6, background: "var(--paper)", opacity: filterSaving ? 0.65 : 1 }}>
            {[["all","All"],["unread","Unread"],["read","Read"]].map(([value, label]) => {
              const active = (syncStatus?.email_filter || "all") === value;
              return (
                <button key={value} type="button" disabled={filterSaving} onClick={() => updateEmailFilter(value)}
                  style={{ padding: "6px 12px", border: "none", borderRadius: 4, background: active ? "var(--ink)" : "transparent", color: active ? "var(--paper)" : "var(--ink-3)", fontSize: 11, fontWeight: 600, cursor: filterSaving ? "default" : "pointer", fontFamily: "inherit" }}>
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Wire InboxSection in SettingsView return**

In SettingsView, replace the inbox placeholder with the real component. Find:
```jsx
        {activeSection === "inbox" && <div style={{ color: "var(--ink-3)", fontSize: 13 }}>Inbox — coming next</div>}
```
Replace with:
```jsx
        {activeSection === "inbox" && (
          <InboxSection
            syncStatus={syncStatus}
            onRescan={onRescan}
            syncing={syncing}
            gmailAccount={gmailAccount}
            gmailConnected={gmailConnected}
            updateEmailFilter={updateEmailFilter}
            filterSaving={filterSaving}
          />
        )}
```

- [ ] **Step 3: Remove syncMeta from SettingsView body (it moved to InboxSection)**

Delete the `const syncMeta = () => { ... };` block from SettingsView (it's now defined inside InboxSection). Lines ~540-549 in original file.

- [ ] **Step 4: Verify in browser — navigate to Inbox section**

Gmail card should show real connection status, sync meta, email, and filter pills.

- [ ] **Step 5: Commit**

```bash
git add static/src/account.jsx
git commit -m "feat: InboxSection — Gmail connection card and email filter pills"
```

---

## Task 8: AISection component

**Files:**
- Modify: `static/src/account.jsx`

- [ ] **Step 1: Add showAiForm + validateResult state to SettingsView**

Inside SettingsView, alongside existing state declarations (around line 530), add:

```javascript
  const [showAiForm, setShowAiForm] = React.useState(false);
  const [validating, setValidating] = React.useState(false);
  const [validateResult, setValidateResult] = React.useState(null);
```

- [ ] **Step 2: Add validateAiService handler to SettingsView**

After `saveAiBudget` (around line 668), add:

```javascript
  const validateAiService = async () => {
    if (!aiForm.api_key.trim() || !aiForm.model_id.trim() || !aiForm.base_url.trim()) {
      setAiError("API key, model ID, and base URL required to validate.");
      return;
    }
    setValidating(true);
    setValidateResult(null);
    try {
      const result = await API.post("/api/account/ai-services/validate", {
        provider: aiForm.provider,
        api_key: aiForm.api_key,
        model_id: aiForm.model_id,
        base_url: aiForm.base_url,
      });
      setValidateResult(result);
    } catch (err) {
      setValidateResult({ ok: false, error: err.message });
    } finally {
      setValidating(false);
    }
  };
```

Also update `resetAiForm` to clear validate state:
```javascript
  const resetAiForm = () => {
    setEditingAiId(null);
    setAiForm(emptyAiForm);
    setAiError(null);
    setValidateResult(null);
    setShowAiForm(false);
  };
```

- [ ] **Step 3: Define AISection component before SettingsView**

```jsx
const AISection = ({
  settings, updateSetting,
  aiServices, aiForm, editingAiId, aiSaving, aiError, budgetValue,
  providerPresets, showAiForm, validating, validateResult,
  setBudgetValue,
  patchAiForm, chooseAiPreset, editAiService, resetAiForm,
  saveAiService, toggleAiService, deleteAiService, saveAiBudget,
  validateAiService, setShowAiForm,
}) => (
  <div>
    {/* Card 1: Parsing */}
    <div style={accountStyles.section}>
      <h3 style={accountStyles.sectionTitle}>Parsing</h3>
      <div style={accountStyles.sectionSub}>— how smart the inbox should be</div>
      <div style={accountStyles.row}>
        <div><div style={accountStyles.label}>Auto-categorize new transactions</div><div style={accountStyles.sub}>use the model to guess Food, Rent, etc.</div></div>
        <div/><Toggle on={!!settings.auto_categorize} onChange={v => updateSetting("auto_categorize", v)}/>
      </div>
      <div style={accountStyles.row}>
        <div><div style={accountStyles.label}>Show AI confidence on cards</div><div style={accountStyles.sub}>small bar next to each transaction</div></div>
        <div/><Toggle on={!!settings.show_confidence} onChange={v => updateSetting("show_confidence", v)}/>
      </div>
      <div style={accountStyles.row}>
        <div><div style={accountStyles.label}>Low-confidence alerts</div><div style={accountStyles.sub}>ping when a new merchant isn't recognized</div></div>
        <div/><Toggle on={!!settings.low_confidence_alerts} onChange={v => updateSetting("low_confidence_alerts", v)}/>
      </div>
      <div style={accountStyles.row}>
        <div><div style={accountStyles.label}>Rule-based pre-filter</div><div style={accountStyles.sub}>skip LLM for known senders — saves tokens</div></div>
        <div/><Toggle on={settings.use_rule_engine !== false} onChange={v => updateSetting("use_rule_engine", v)}/>
      </div>
      <div style={{ ...accountStyles.row, ...accountStyles.rowLast }}>
        <div><div style={accountStyles.label}>Confidence threshold</div><div style={accountStyles.sub}>flag transactions below this certainty</div></div>
        <input type="range" min="50" max="95" value={settings.confidence_threshold ?? 70} onChange={e => updateSetting("confidence_threshold", Number(e.target.value))} style={{ width: "100%" }}/>
        <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: 12, color: "var(--ink-2)", minWidth: 40, textAlign: "right" }}>{settings.confidence_threshold ?? 70}%</span>
      </div>
    </div>

    {/* Card 2: API services */}
    <div style={accountStyles.section}>
      <h3 style={accountStyles.sectionTitle}>Your API services</h3>
      <div style={accountStyles.sectionSub}>— bring your own model subscription</div>

      {aiServices.length === 0 && !showAiForm ? (
        <div style={{ padding: "14px 16px", background: "var(--paper-2)", borderRadius: 6, fontSize: 12, color: "var(--ink-3)", marginTop: 6 }}>
          No custom AI services saved.
        </div>
      ) : aiServices.map((service, idx) => {
        const active = settings.active_ai_service_id === service.id;
        return (
          <div key={service.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 0", borderBottom: idx === aiServices.length - 1 ? "none" : "1px dashed var(--line)", flexWrap: "wrap" }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--card)", border: "1px solid var(--line)", display: "grid", placeItems: "center", fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 13, color: "var(--ink-2)", textTransform: "uppercase" }}>
              {(service.display_name || service.provider || "AI").split(" ").map(w => w[0]).join("").slice(0,2)}
            </div>
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{service.display_name}</span>
                {active && <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 3, background: "var(--accent-soft)", color: "var(--accent)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Active</span>}
                <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 3, background: service.enabled ? "var(--pos-soft)" : "var(--paper-2)", color: service.enabled ? "var(--pos)" : "var(--ink-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>{service.enabled ? "On" : "Off"}</span>
              </div>
              <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>{service.model_id}</div>
              <div style={{ fontSize: 10, color: "var(--ink-4)", marginTop: 3, fontFamily: "'Geist Mono', monospace" }}>
                {service.provider}{service.base_url ? ` · ${service.base_url.slice(0, 40)}` : ""}{service.api_key_hint ? ` · key ${service.api_key_hint}` : ""}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {!active && <button onClick={() => updateSetting("active_ai_service_id", service.id)} style={accountStyles.btn}>Make active</button>}
              <button onClick={() => toggleAiService(service)} style={accountStyles.btn}>{service.enabled ? "Disable" : "Enable"}</button>
              <button onClick={() => { editAiService(service); setShowAiForm(true); }} style={accountStyles.btn}>Edit</button>
              <button onClick={() => deleteAiService(service)} style={{ ...accountStyles.btn, ...accountStyles.btnDanger }}>Delete</button>
            </div>
          </div>
        );
      })}

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14, marginBottom: 14, flexWrap: "wrap" }}>
        {!showAiForm && (
          <button onClick={() => setShowAiForm(true)} style={{ ...accountStyles.btn, ...accountStyles.btnPrimary }}>+ Add service</button>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8, flex: 1 }}>
          <div>
            <div style={{ fontSize: 10, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, marginBottom: 4 }}>Active service</div>
            <select style={accountStyles.input} value={settings.active_ai_service_id || "default"} onChange={e => updateSetting("active_ai_service_id", e.target.value === "default" ? null : e.target.value)}>
              <option value="default">Moneyflow default providers</option>
              {aiServices.filter(s => s.enabled !== false || s.id === settings.active_ai_service_id).map(s => (
                <option key={s.id} value={s.id}>{s.display_name} — {s.model_id}{s.enabled === false ? " (disabled)" : ""}</option>
              ))}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 10, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, marginBottom: 4 }}>Monthly AI budget</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input type="number" min="0" step="1" style={{ ...accountStyles.input, fontFamily: "'Geist Mono', monospace" }} value={budgetValue} onChange={e => setBudgetValue(e.target.value)} placeholder="No cap"/>
              <button onClick={saveAiBudget} style={accountStyles.btn}>Save</button>
            </div>
          </div>
        </div>
      </div>

      {showAiForm && (
        <div style={{ padding: "16px 18px", border: "1px dashed var(--line)", borderRadius: 6, background: "var(--paper)", marginTop: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{editingAiId ? "Edit service" : "Add service"}</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
            {providerPresets.map(p => (
              <button key={p.provider} onClick={() => chooseAiPreset(p.provider)}
                style={{ ...accountStyles.btn, background: aiForm.provider === p.provider ? "var(--ink)" : "var(--paper)", color: aiForm.provider === p.provider ? "var(--paper)" : "var(--ink-2)" }}>
                {p.display_name}
              </button>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
            <div>
              <div style={{ fontSize: 10, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, marginBottom: 4 }}>Display name</div>
              <input style={accountStyles.input} value={aiForm.display_name} onChange={e => patchAiForm("display_name", e.target.value)} placeholder="e.g. OpenAI"/>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, marginBottom: 4 }}>Model ID</div>
              <input style={accountStyles.input} value={aiForm.model_id} onChange={e => patchAiForm("model_id", e.target.value)} placeholder="gpt-4o-mini"/>
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 10, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, marginBottom: 4 }}>Base URL</div>
            <input style={accountStyles.input} value={aiForm.base_url} onChange={e => patchAiForm("base_url", e.target.value)} placeholder="https://api.openai.com/v1"/>
          </div>
          <div style={{ marginTop: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <div style={{ fontSize: 10, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500 }}>API key</div>
              <span style={{ fontSize: 10, color: "var(--ink-4)", fontFamily: "'Geist Mono', monospace" }}>{editingAiId ? "leave blank to keep current" : "stored encrypted"}</span>
            </div>
            <input type="password" style={{ ...accountStyles.input, fontFamily: "'Geist Mono', monospace" }} value={aiForm.api_key} onChange={e => patchAiForm("api_key", e.target.value)} placeholder="sk-..."/>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginTop: 10 }}>
            <div>
              <div style={{ fontSize: 10, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, marginBottom: 4 }}>Auth header</div>
              <select style={accountStyles.input} value={aiForm.auth_header} onChange={e => patchAiForm("auth_header", e.target.value)}>
                <option value="bearer">Authorization: Bearer</option>
                <option value="x-api-key">x-api-key</option>
              </select>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, marginBottom: 4 }}>Enabled</div>
              <div style={{ height: 35, display: "flex", alignItems: "center" }}>
                <Toggle on={!!aiForm.enabled} onChange={v => patchAiForm("enabled", v)}/>
              </div>
            </div>
          </div>
          {aiError && <div style={{ marginTop: 10, padding: "8px 10px", borderRadius: 6, background: "var(--neg-soft)", color: "var(--neg)", fontSize: 12 }}>{aiError}</div>}
          {validateResult && (
            <div style={{ marginTop: 10, padding: "8px 10px", borderRadius: 6, background: validateResult.ok ? "var(--pos-soft)" : "var(--neg-soft)", color: validateResult.ok ? "var(--pos)" : "var(--neg)", fontSize: 12 }}>
              {validateResult.ok ? "Connection OK" : `Failed: ${validateResult.error}`}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
            <button onClick={validateAiService} disabled={validating} style={accountStyles.btn}>{validating ? "Testing…" : "Validate"}</button>
            <div style={{ flex: 1 }}/>
            <button onClick={resetAiForm} style={accountStyles.btn}>Cancel</button>
            <button onClick={saveAiService} disabled={aiSaving} style={{ ...accountStyles.btn, ...accountStyles.btnPrimary, opacity: aiSaving ? 0.65 : 1 }}>
              {aiSaving ? "Saving..." : editingAiId ? "Save changes" : "Save service"}
            </button>
          </div>
        </div>
      )}
    </div>
  </div>
);
```

- [ ] **Step 4: Wire AISection in SettingsView return**

Replace:
```jsx
        {activeSection === "ai" && <div style={{ color: "var(--ink-3)", fontSize: 13 }}>AI — coming next</div>}
```
With:
```jsx
        {activeSection === "ai" && (
          <AISection
            settings={settings} updateSetting={updateSetting}
            aiServices={aiServices} aiForm={aiForm} editingAiId={editingAiId}
            aiSaving={aiSaving} aiError={aiError} budgetValue={budgetValue}
            providerPresets={providerPresets} showAiForm={showAiForm}
            validating={validating} validateResult={validateResult}
            setBudgetValue={setBudgetValue}
            patchAiForm={patchAiForm} chooseAiPreset={chooseAiPreset}
            editAiService={editAiService} resetAiForm={resetAiForm}
            saveAiService={saveAiService} toggleAiService={toggleAiService}
            deleteAiService={deleteAiService} saveAiBudget={saveAiBudget}
            validateAiService={validateAiService} setShowAiForm={setShowAiForm}
          />
        )}
```

- [ ] **Step 5: Verify in browser — AI tab**

Click AI tab: Parsing card shows 5 rows with toggles/slider. Services list shows saved services. "+ Add service" reveals inline form. Validate button calls backend (needs valid key to show success).

- [ ] **Step 6: Commit**

```bash
git add static/src/account.jsx
git commit -m "feat: AISection — parsing toggles, API services list, inline add form, validate button"
```

---

## Task 9: PreferencesSection component

**Files:**
- Modify: `static/src/account.jsx`

- [ ] **Step 1: Define PreferencesSection before SettingsView**

```jsx
const PreferencesSection = ({ settings, updateSetting, categories, account, setAccount }) => (
  <div>
    {/* Card 1: Notifications */}
    <div style={accountStyles.section}>
      <h3 style={accountStyles.sectionTitle}>Notifications</h3>
      <div style={accountStyles.sectionSub}>— what we tell you, and when</div>
      <div style={accountStyles.row}>
        <div><div style={accountStyles.label}>Daily digest email</div><div style={accountStyles.sub}>one summary per day</div></div>
        <div/><Toggle on={!!settings.daily_digest} onChange={v => updateSetting("daily_digest", v)}/>
      </div>
      <div style={accountStyles.row}>
        <div><div style={accountStyles.label}>Digest hour</div><div style={accountStyles.sub}>hour of day to send (0–23, UTC+5:30)</div></div>
        <input
          type="number" min="0" max="23"
          value={settings.digest_hour ?? 9}
          onChange={e => {
            const v = Math.min(23, Math.max(0, parseInt(e.target.value) || 0));
            updateSetting("digest_hour", v);
          }}
          style={{ ...accountStyles.input, maxWidth: 80, fontFamily: "'Geist Mono', monospace" }}
        />
        <div/>
      </div>
      <div style={{ ...accountStyles.row, ...accountStyles.rowLast }}>
        <div><div style={accountStyles.label}>Sound effects</div><div style={accountStyles.sub}>subtle click on transaction confirm</div></div>
        <div/><Toggle on={!!settings.sound_effects} onChange={v => updateSetting("sound_effects", v)}/>
      </div>
    </div>

    {/* Card 2: Categories — embed existing component */}
    <CategoriesSection categories={categories} onRefresh={async () => {
      const d = await API.get("/api/account/me");
      if (d?.categories) setAccount(prev => ({ ...prev, categories: d.categories }));
    }}/>

    {/* Card 3: Financial health — embed existing component */}
    <FinancialHealthSection settings={settings} onRefresh={async () => {
      const d = await API.get("/api/account/me");
      if (d?.settings) setAccount(prev => ({ ...prev, settings: d.settings }));
    }}/>
  </div>
);
```

- [ ] **Step 2: Wire PreferencesSection in SettingsView return**

Replace:
```jsx
        {activeSection === "preferences" && <div style={{ color: "var(--ink-3)", fontSize: 13 }}>Preferences — coming next</div>}
```
With:
```jsx
        {activeSection === "preferences" && (
          <PreferencesSection
            settings={settings}
            updateSetting={updateSetting}
            categories={categories}
            account={account}
            setAccount={setAccount}
          />
        )}
```

- [ ] **Step 3: Verify in browser — Preferences tab**

Notifications card shows 3 rows. Digest hour input is wired (changes save to settings). Categories and Financial health embedded as before.

- [ ] **Step 4: Commit**

```bash
git add static/src/account.jsx
git commit -m "feat: PreferencesSection — notifications with wired digest_hour, categories, financial health"
```

---

## Task 10: AccountSection — 2FA, data, danger zone

**Files:**
- Modify: `static/src/account.jsx`

- [ ] **Step 1: Define AccountSection before SettingsView**

```jsx
const AccountSection = ({ account, setAccount, gmailAccount }) => {
  const totpInitial = account?.user?.totp_enabled ? "enabled" : "idle";
  const [totpStatus, setTotpStatus] = React.useState(totpInitial);
  const [totpSetupData, setTotpSetupData] = React.useState(null);
  const [totpCode, setTotpCode] = React.useState("");
  const [totpError, setTotpError] = React.useState(null);
  const [totpLoading, setTotpLoading] = React.useState(false);

  const startTotpSetup = async () => {
    setTotpLoading(true);
    setTotpError(null);
    try {
      const data = await API.post("/api/account/2fa/setup");
      setTotpSetupData(data);
      setTotpStatus("setup");
    } catch (err) {
      setTotpError(err.message || "Setup failed");
    } finally {
      setTotpLoading(false);
    }
  };

  const verifyTotp = async () => {
    if (totpCode.length !== 6) return;
    setTotpStatus("verifying");
    setTotpError(null);
    try {
      const result = await API.post("/api/account/2fa/verify", { code: totpCode });
      if (result.ok) {
        setTotpStatus("enabled");
        setTotpSetupData(null);
        setTotpCode("");
        setAccount(a => ({ ...a, user: { ...a.user, totp_enabled: true } }));
      } else {
        setTotpStatus("setup");
        setTotpError("Invalid code — try again.");
      }
    } catch (err) {
      setTotpStatus("setup");
      setTotpError(err.message || "Verification failed");
    }
  };

  const disableTotp = async () => {
    if (!window.confirm("Disable 2FA? Your account will be less secure.")) return;
    try {
      await API.delete("/api/account/2fa");
      setTotpStatus("idle");
      setTotpSetupData(null);
      setAccount(a => ({ ...a, user: { ...a.user, totp_enabled: false } }));
    } catch (err) {
      alert(err.message || "Could not disable 2FA");
    }
  };

  const disconnectGmail = async () => {
    if (!gmailAccount?.id) return;
    if (!window.confirm("Disconnect Gmail? This removes OAuth access and stops email sync.")) return;
    try {
      await API.delete(`/api/account/connected-accounts/${gmailAccount.id}`);
      setAccount(a => ({ ...a, connected_accounts: (a.connected_accounts || []).filter(c => c.id !== gmailAccount.id) }));
    } catch (err) {
      alert(err.message || "Could not disconnect Gmail");
    }
  };

  return (
    <div>
      {/* Card 1: Two-factor authentication */}
      <div style={accountStyles.section}>
        <h3 style={accountStyles.sectionTitle}>Two-factor authentication</h3>
        <div style={accountStyles.sectionSub}>— TOTP via authenticator app</div>

        {totpStatus === "idle" && (
          <div style={{ ...accountStyles.row, ...accountStyles.rowLast }}>
            <div><div style={accountStyles.label}>TOTP authenticator</div><div style={accountStyles.sub}>Scan QR code in your authenticator app</div></div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 3, background: "var(--paper-2)", color: "var(--ink-3)", fontWeight: 600, textTransform: "uppercase" }}>Off</span>
              <button onClick={startTotpSetup} disabled={totpLoading} style={accountStyles.btn}>{totpLoading ? "Loading…" : "Enable…"}</button>
            </div>
            {totpError && <div style={{ fontSize: 12, color: "var(--neg)", marginTop: 8 }}>{totpError}</div>}
          </div>
        )}

        {(totpStatus === "setup" || totpStatus === "verifying") && totpSetupData && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "12px 0" }}>
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
              <img src={totpSetupData.qr_url} alt="QR code" style={{ width: 160, height: 160, border: "1px solid var(--line)", borderRadius: 8 }}/>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>1. Scan with your authenticator app</div>
                <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 14 }}>Google Authenticator, Authy, 1Password, etc.</div>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>2. Or enter key manually</div>
                <div style={{ fontFamily: "'Geist Mono', monospace", fontSize: 12, letterSpacing: "0.12em", color: "var(--ink-2)", background: "var(--paper-2)", padding: "6px 10px", borderRadius: 4, wordBreak: "break-all" }}>
                  {totpSetupData.secret.match(/.{1,4}/g)?.join(" ")}
                </div>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>3. Enter 6-digit code to verify</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                  type="text" inputMode="numeric" maxLength={6} pattern="[0-9]{6}" placeholder="000000"
                  value={totpCode}
                  onChange={e => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  style={{ ...accountStyles.input, maxWidth: 140, fontFamily: "'Geist Mono', monospace", letterSpacing: "0.2em", fontSize: 18, textAlign: "center" }}
                />
                <button
                  onClick={verifyTotp}
                  disabled={totpCode.length !== 6 || totpStatus === "verifying"}
                  style={{ ...accountStyles.btn, ...accountStyles.btnPrimary, opacity: totpCode.length !== 6 ? 0.5 : 1 }}
                >
                  {totpStatus === "verifying" ? "Verifying…" : "Verify & enable"}
                </button>
                <button onClick={() => { setTotpStatus("idle"); setTotpSetupData(null); setTotpCode(""); setTotpError(null); }} style={accountStyles.btn}>Cancel</button>
              </div>
              {totpError && <div style={{ fontSize: 12, color: "var(--neg)", marginTop: 8 }}>{totpError}</div>}
            </div>
          </div>
        )}

        {totpStatus === "enabled" && (
          <div style={{ ...accountStyles.row, ...accountStyles.rowLast }}>
            <div><div style={accountStyles.label}>TOTP authenticator</div><div style={accountStyles.sub}>Active — codes required on next login</div></div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 3, background: "var(--pos-soft)", color: "var(--pos)", fontWeight: 600, textTransform: "uppercase" }}>On</span>
              <button onClick={disableTotp} style={{ ...accountStyles.btn, ...accountStyles.btnDanger }}>Disable</button>
            </div>
          </div>
        )}
      </div>

      {/* Card 2: Data */}
      <div style={accountStyles.section}>
        <h3 style={accountStyles.sectionTitle}>Data</h3>
        <div style={accountStyles.sectionSub}>— your numbers, portable and controlled</div>
        <div style={accountStyles.row}>
          <div><div style={accountStyles.label}>Export transactions</div><div style={accountStyles.sub}>CSV of every parsed transaction</div></div>
          <div/>
          <button onClick={() => { window.location.href = "/api/transactions/export"; }} style={accountStyles.btn}>
            <Icon name="arrow-u-r" size={12}/> Export CSV
          </button>
        </div>
        <div style={{ ...accountStyles.row, ...accountStyles.rowLast }}>
          <div><div style={accountStyles.label}>Allowed sign-ins</div><div style={accountStyles.sub}>manage who can log in</div></div>
          <div/>
        </div>
        <AccessSection account={account?.user}/>
      </div>

      {/* Card 3: Danger zone */}
      <div style={{ ...accountStyles.section, border: "1px solid #f1d9d2" }}>
        <h3 style={{ ...accountStyles.sectionTitle, color: "var(--neg)" }}>Danger zone</h3>
        <div style={accountStyles.sectionSub}>— irreversible things</div>
        {gmailAccount && (
          <div style={accountStyles.row}>
            <div><div style={accountStyles.label}>Disconnect Gmail</div><div style={accountStyles.sub}>revokes OAuth access, stops email sync</div></div>
            <div/>
            <button onClick={disconnectGmail} style={{ ...accountStyles.btn, ...accountStyles.btnDanger }}>Revoke</button>
          </div>
        )}
        <div style={{ ...accountStyles.row, ...accountStyles.rowLast, borderBottom: "none" }}>
          <div><div style={accountStyles.label}>Delete account</div><div style={accountStyles.sub}>removes all parsed data, forever</div></div>
          <div/>
          <button style={{ ...accountStyles.btn, ...accountStyles.btnDanger }}>Delete…</button>
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Wire AccountSection in SettingsView return**

Replace:
```jsx
        {activeSection === "account" && <div style={{ color: "var(--ink-3)", fontSize: 13 }}>Account — coming next</div>}
```
With:
```jsx
        {activeSection === "account" && (
          <AccountSection
            account={account}
            setAccount={setAccount}
            gmailAccount={gmailAccount}
          />
        )}
```

- [ ] **Step 3: Remove old Security and Danger sections from SettingsView**

In SettingsView, the original return statement contained inline `{/* Security */}` and `{/* Danger */}` sections and the `AccessSection` call. These no longer exist in the new return (we already replaced the full return in Task 6). Verify the old sections are gone — the return should only have the sidebar/pill nav shell and 4 section dispatchers.

Also remove from SettingsView body: the old `CategoriesSection`, `FinancialHealthSection`, and `AccessSection` calls that were in the original return (they are now called from sub-components).

- [ ] **Step 4: Verify in browser — Account tab**

2FA card: idle state shows Off badge + Enable button. Clicking Enable calls setup endpoint, shows QR + key + 6-digit input. Entering valid code enables (On badge appears). Disable button calls DELETE and reverts to Off.

Data card: Export CSV opens download. Access section shows allowlist.

Danger zone: Revoke button (only shows if Gmail connected). Delete button visible but non-functional (no backend endpoint).

- [ ] **Step 5: Run full test suite**

```bash
cd /Users/amansaini/GexpenseTracker
source .venv/bin/activate
pytest --ignore=tests/test_llm_client.py -v
```
Expected: all pass

- [ ] **Step 6: Commit**

```bash
git add static/src/account.jsx
git commit -m "feat: AccountSection — 2FA state machine, CSV export, Gmail disconnect, danger zone"
```

---

## Task 11: Cleanup — remove stale code from SettingsView

**Files:**
- Modify: `static/src/account.jsx`

By this point, the original flat-scroll sections inside SettingsView's return are fully replaced. This task removes any dead state/handler code in SettingsView that is now only used by the sub-components (they receive the handlers as props so the handlers stay) and removes the stale comment.

- [ ] **Step 1: Remove stale "Connection Testing Not Wired" comment**

Search for this string in `account.jsx`:
```
Connection testing is not wired yet
```
Remove the entire `<div>` containing that text. It was in the old AI form — the new form has a real Validate button.

- [ ] **Step 2: Verify SettingsView body contains no dead code**

Check that `syncMeta` is removed from SettingsView (it was moved to InboxSection in Task 7). All other handlers (`updateSetting`, `updateEmailFilter`, AI service handlers) remain because they are passed as props to sub-components.

- [ ] **Step 3: Final browser smoke test**

Navigate through all 4 tabs:
- **Inbox**: Gmail status, filter pills work
- **AI**: Parsing toggles, service list, add form with Validate
- **Preferences**: Notifications (digest_hour wired), Categories, Financial health
- **Account**: 2FA state machine, Export CSV download, Danger zone

- [ ] **Step 4: Run full test suite one final time**

```bash
pytest --ignore=tests/test_llm_client.py -v
```
Expected: all pass

- [ ] **Step 5: Final commit**

```bash
git add static/src/account.jsx
git commit -m "chore: remove stale comment and dead syncMeta from SettingsView"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| Sidebar nav 180px desktop | Task 6 |
| Mobile pill strip | Task 6 |
| 4 nav items with divider before Account | Task 6 |
| Inbox: Gmail card with real status | Task 7 |
| Inbox: email filter segmented pill | Task 7 |
| AI: 5-row Parsing card | Task 8 |
| AI: services list + Active/On badges | Task 8 |
| AI: inline form behind + Add button | Task 8 |
| AI: Validate button → POST /validate | Task 8 |
| AI: monthly budget select | Task 8 |
| Preferences: Notifications 3 rows | Task 9 |
| Preferences: digest_hour wired (was hardcoded) | Task 9 |
| Preferences: Categories embed | Task 9 |
| Preferences: Financial health embed | Task 9 |
| Account: 2FA state machine idle/setup/verifying/enabled | Task 10 |
| Account: QR code + manual key + 6-digit input | Task 10 |
| Account: Export CSV | Tasks 5 + 10 |
| Account: Allowed sign-ins section | Task 10 |
| Account: Danger zone red border | Task 10 |
| Account: Disconnect Gmail | Task 10 |
| 3 TOTP User columns + migration | Task 2 |
| POST /2fa/setup | Task 4 |
| POST /2fa/verify | Task 4 |
| DELETE /2fa | Task 4 |
| GET /transactions/export | Task 5 |
| totp_enabled in user bundle | Task 3 |
| Remove hardcoded "42 days ago", "9:00 IST" | Tasks 8, 9 |
| Remove stale "Connection Testing Not Wired" | Task 11 |

**Dropped (Option A):** Password card, `DELETE /api/account/2fa` password verification.

**Not in scope (per spec):** Push notifications, billing, Slack, multi-user. Delete account backend endpoint (no existing endpoint; button rendered non-functional).
