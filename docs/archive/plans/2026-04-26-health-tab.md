# Health Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Health" tab to MoneyFlow showing savings rate, runway months, current balance, and monthly net trend bars, with a starting balance anchor in Account settings.

**Architecture:** New `/api/stats/health?months=N` endpoint in the existing stats router computes all metrics server-side. Two new DB columns (`starting_balance`, `starting_balance_date`) on `user_settings` anchor the balance calculation. New `health.jsx` frontend component wired into shell nav and app.jsx view router.

**Tech Stack:** FastAPI async SQLAlchemy (backend), React browser-global + Babel standalone (frontend), Alembic (migration), pytest + httpx AsyncClient (tests)

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `alembic/versions/0016_user_settings_starting_balance.py` | Create | Migration: add `starting_balance` + `starting_balance_date` to `user_settings` |
| `app/models.py` | Modify | Add 2 fields to `UserSettings` class |
| `app/api/account.py` | Modify | Add fields to `SettingsPatch` + `_settings_dict()` |
| `app/api/stats.py` | Modify | Add `GET /stats/health` endpoint |
| `tests/test_stats_health.py` | Create | Tests for health endpoint |
| `static/src/health.jsx` | Create | `HealthView` component |
| `static/src/shell.jsx` | Modify | Add Health nav item |
| `static/src/app.jsx` | Modify | Register `health` view title + render |
| `static/src/account.jsx` | Modify | Add `FinancialHealthSection` component + wire into `SettingsView` |
| `templates/index.html` | Modify | Add `health.jsx?v=1` script tag |

---

## Task 1: Alembic migration 0016

**Files:**
- Create: `alembic/versions/0016_user_settings_starting_balance.py`

- [ ] **Step 1: Write the migration file**

```python
"""user_settings: add starting_balance and starting_balance_date

Revision ID: 0016
Revises: 0015
Create Date: 2026-04-26 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = '0016'
down_revision = '0015'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('user_settings', sa.Column('starting_balance', sa.Numeric(12, 2), nullable=True))
    op.add_column('user_settings', sa.Column('starting_balance_date', sa.Date(), nullable=True))


def downgrade():
    op.drop_column('user_settings', 'starting_balance_date')
    op.drop_column('user_settings', 'starting_balance')
```

- [ ] **Step 2: Apply the migration**

```bash
docker compose exec app alembic upgrade head
```

Expected output ends with: `Running upgrade 0015 -> 0016, user_settings: add starting_balance and starting_balance_date`

- [ ] **Step 3: Verify columns exist**

```bash
docker compose exec db psql -U postgres -d moneyflow -c "\d user_settings" | grep starting
```

Expected: two rows containing `starting_balance` and `starting_balance_date`

- [ ] **Step 4: Commit**

```bash
git add alembic/versions/0016_user_settings_starting_balance.py
git commit -m "feat: migration 0016 — starting_balance fields on user_settings"
```

---

## Task 2: Model + Settings API changes

**Files:**
- Modify: `app/models.py` (UserSettings class, ~line 83)
- Modify: `app/api/account.py` (SettingsPatch ~line 61, _settings_dict ~line 187)

- [ ] **Step 1: Write the failing test**

Create `tests/test_stats_health.py` with a settings PATCH test first:

```python
import pytest
import os
os.environ["TESTING"] = "1"
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.database import get_db


@pytest.mark.asyncio
async def test_settings_patch_accepts_starting_balance(db_session):
    async def override_get_db():
        yield db_session
    app.dependency_overrides[get_db] = override_get_db
    try:
        # First create a user + settings via onboarding
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            await client.post("/api/account/onboarding", json={
                "email": "test@example.com",
                "full_name": "Test User",
            })
            r = await client.patch("/api/account/settings", json={
                "starting_balance": 100000,
                "starting_balance_date": "2026-01-01",
            })
        assert r.status_code == 200
        data = r.json()
        assert data["settings"]["starting_balance"] == 100000.0
        assert data["settings"]["starting_balance_date"] == "2026-01-01"
    finally:
        app.dependency_overrides.pop(get_db, None)
```

- [ ] **Step 2: Run test to verify it fails**

```bash
docker compose exec app pytest tests/test_stats_health.py::test_settings_patch_accepts_starting_balance -v
```

Expected: FAIL — either `422 Unprocessable Entity` (field not in SettingsPatch) or `KeyError` in assertion

- [ ] **Step 3: Add fields to UserSettings in app/models.py**

In `app/models.py`, find the `UserSettings` class (line ~83). Add two new fields after `allowed_emails`:

```python
    allowed_emails: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    starting_balance: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    starting_balance_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)
```

(`date` and `Date` are already imported at the top of models.py — no new import needed.)

- [ ] **Step 4: Add fields to SettingsPatch in app/api/account.py**

Change the `from datetime import datetime` line to:
```python
from datetime import datetime, date
```

In `SettingsPatch` class (~line 61), add after `use_rule_engine`:
```python
    use_rule_engine: Optional[bool] = None
    starting_balance: Optional[float] = Field(default=None, ge=0)
    starting_balance_date: Optional[date] = None
```

- [ ] **Step 5: Add fields to _settings_dict in app/api/account.py**

In `_settings_dict` function (~line 187), add after `use_rule_engine`:
```python
        "use_rule_engine": settings.use_rule_engine,
        "starting_balance": float(settings.starting_balance) if settings.starting_balance is not None else None,
        "starting_balance_date": settings.starting_balance_date.isoformat() if settings.starting_balance_date else None,
```

- [ ] **Step 6: Run test to verify it passes**

```bash
docker compose exec app pytest tests/test_stats_health.py::test_settings_patch_accepts_starting_balance -v
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add app/models.py app/api/account.py tests/test_stats_health.py
git commit -m "feat: starting_balance fields on UserSettings + SettingsPatch"
```

---

## Task 3: /api/stats/health endpoint

**Files:**
- Modify: `app/api/stats.py` (add endpoint after existing routes)
- Modify: `tests/test_stats_health.py` (add more tests)

- [ ] **Step 1: Write failing tests**

Append to `tests/test_stats_health.py`:

```python
@pytest.mark.asyncio
async def test_health_returns_expected_fields(db_session):
    async def override_get_db():
        yield db_session
    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.get("/api/stats/health?months=6")
        assert r.status_code == 200
        data = r.json()
        assert "current_balance" in data
        assert "savings_rate" in data
        assert "runway_months" in data
        assert "monthly_net" in data
        assert "balance_mode" in data
        assert data["balance_mode"] == "computed"
        assert isinstance(data["monthly_net"], list)
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_health_rejects_invalid_months(db_session):
    async def override_get_db():
        yield db_session
    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.get("/api/stats/health?months=7")
        assert r.status_code == 422
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_health_accepts_months_3_and_12(db_session):
    async def override_get_db():
        yield db_session
    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r3 = await client.get("/api/stats/health?months=3")
            r12 = await client.get("/api/stats/health?months=12")
        assert r3.status_code == 200
        assert r12.status_code == 200
        for r in [r3, r12]:
            data = r.json()
            assert "monthly_net" in data
            for entry in data["monthly_net"]:
                assert "month" in entry
                assert "income" in entry
                assert "expenses" in entry
                assert "net" in entry
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_health_anchored_balance_mode(db_session):
    async def override_get_db():
        yield db_session
    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            # Create user + settings, set starting_balance
            await client.post("/api/account/onboarding", json={
                "email": "test2@example.com",
                "full_name": "Test User 2",
            })
            await client.patch("/api/account/settings", json={
                "starting_balance": 50000,
                "starting_balance_date": "2026-01-01",
            })
            r = await client.get("/api/stats/health?months=6")
        assert r.status_code == 200
        data = r.json()
        assert data["balance_mode"] == "anchored"
        assert data["starting_balance"] == 50000.0
    finally:
        app.dependency_overrides.pop(get_db, None)
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
docker compose exec app pytest tests/test_stats_health.py -v -k "health_returns or health_rejects or health_accepts or anchored"
```

Expected: FAIL — `404 Not Found` for `/api/stats/health`

- [ ] **Step 3: Implement the endpoint in app/api/stats.py**

Add these imports at the top of `app/api/stats.py` (after existing imports):

```python
from app.models import UserSettings
```

Add the endpoint at the end of `app/api/stats.py`:

```python
@router.get("/stats/health")
async def stats_health(
    months: int = 6,
    db: AsyncSession = Depends(get_db),
):
    if months not in (3, 6, 12):
        raise HTTPException(status_code=422, detail="months must be 3, 6, or 12")

    period_map = {3: "3m", 6: "6m", 12: "1y"}
    monthly = await _monthly_data(period_map[months], db)

    monthly_net = [
        {
            "month": m["month"],
            "income": m["income"],
            "expenses": m["expenses"],
            "net": round(m["income"] - m["expenses"], 2),
        }
        for m in monthly
    ]

    # Savings rate and runway use last 3 months for a stable baseline
    last3 = monthly[-3:] if len(monthly) >= 3 else monthly
    avg_income = sum(m["income"] for m in last3) / max(len(last3), 1)
    avg_expense = sum(m["expenses"] for m in last3) / max(len(last3), 1)
    avg_net = avg_income - avg_expense

    savings_rate = round(avg_net / avg_income * 100, 1) if avg_income > 0 else 0.0
    runway_months = round(avg_expense and (0 / avg_expense) or 0, 1)  # placeholder — replaced below

    # Starting balance from user_settings (first row; scoped per-user after auth lands)
    settings_row = (await db.execute(select(UserSettings).limit(1))).scalar_one_or_none()
    starting_balance = (
        float(settings_row.starting_balance)
        if settings_row and settings_row.starting_balance is not None
        else None
    )
    starting_balance_date = settings_row.starting_balance_date if settings_row else None

    # Net transactions from starting_balance_date (or all-time if no anchor)
    base_filter = [
        Transaction.txn_date.isnot(None),
        Transaction.status != "needs_review",
    ]
    if starting_balance_date:
        base_filter.append(Transaction.txn_date >= starting_balance_date)

    expense_total = (await db.execute(
        select(func.sum(Transaction.amount))
        .where(Transaction.label == "expense", *base_filter)
    )).scalar_one() or 0

    income_txn_rows = (await db.execute(
        select(Transaction.txn_date, Transaction.amount, Email.sender)
        .join(Email, Transaction.email_id == Email.id)
        .where(Transaction.label == "income", *base_filter)
    )).all()
    income_total = sum(float(r.amount or 0) for r in income_txn_rows)

    net_since = income_total - float(expense_total)
    current_balance = round((starting_balance or 0.0) + net_since, 2)
    balance_mode = "anchored" if starting_balance is not None else "computed"

    runway_months = round(current_balance / avg_expense, 1) if avg_expense > 0 else None

    return {
        "current_balance": current_balance,
        "savings_rate": savings_rate,
        "runway_months": runway_months,
        "starting_balance": starting_balance,
        "starting_balance_date": starting_balance_date.isoformat() if starting_balance_date else None,
        "balance_mode": balance_mode,
        "monthly_net": monthly_net,
    }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
docker compose exec app pytest tests/test_stats_health.py -v
```

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/stats.py tests/test_stats_health.py
git commit -m "feat: GET /api/stats/health endpoint — runway, savings rate, monthly net"
```

---

## Task 4: health.jsx — HealthView component

**Files:**
- Create: `static/src/health.jsx`

- [ ] **Step 1: Create the file**

Create `static/src/health.jsx` with the full component:

```jsx
// Health — runway, savings rate, monthly net

const HealthView = () => {
  const [months, setMonths] = React.useState(6);
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    API.get(`/api/stats/health?months=${months}`)
      .then(d => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [months]);

  const fmt = (n) => {
    if (n == null) return "—";
    const abs = Math.abs(n);
    if (abs >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
    if (abs >= 1000) return `₹${(n / 1000).toFixed(1)}k`;
    return `₹${Math.round(n)}`;
  };

  const hasAnchor = data?.balance_mode === "anchored";
  const bars = data?.monthly_net || [];
  const maxAbs = bars.length ? Math.max(...bars.map(b => Math.abs(b.net)), 1) : 1;

  const skeleton = (h, w) => (
    <div style={{ height: h, width: w || "100%", background: "var(--paper-2)", borderRadius: 4, animation: "pulse 1.2s infinite" }}/>
  );

  return (
    <div style={{ padding: "28px 32px 80px", overflowY: "auto", overflowX: "hidden", height: "calc(100vh - 72px)", maxWidth: 900, margin: "0 auto" }}>

      {/* Stat cards row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>

        {/* Savings Rate */}
        <div style={{ padding: "22px 24px", background: "var(--card)", border: "1px solid var(--line)", borderRadius: 8 }}>
          <div style={{ fontSize: 12, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, marginBottom: 14 }}>Savings Rate</div>
          {loading ? skeleton(40) : (
            <>
              <div style={{ fontFamily: "'Fraunces', serif", fontSize: 40, fontWeight: 400, letterSpacing: "-0.025em", lineHeight: 1, color: (data?.savings_rate || 0) >= 0 ? "var(--pos)" : "var(--neg)" }}>
                {data != null ? `${data.savings_rate}%` : "—"}
              </div>
              <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 6 }}>
                {(data?.savings_rate || 0) >= 0 ? "of income saved" : "of income over-spent"}
              </div>
            </>
          )}
        </div>

        {/* Runway */}
        <div style={{ padding: "22px 24px", background: "var(--card)", border: "1px solid var(--line)", borderRadius: 8 }}>
          <div style={{ fontSize: 12, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, marginBottom: 14 }}>Runway</div>
          {loading ? skeleton(40) : (
            <>
              <div style={{ fontFamily: "'Fraunces', serif", fontSize: 40, fontWeight: 400, letterSpacing: "-0.025em", lineHeight: 1 }}>
                {data?.runway_months != null
                  ? <>{data.runway_months}<span style={{ fontSize: 16, fontFamily: "'Geist', sans-serif", color: "var(--ink-3)", fontWeight: 400 }}> mo</span></>
                  : "—"}
              </div>
              <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 6 }}>
                {data?.runway_months != null ? "at current burn rate" : "No expenses tracked"}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Current balance */}
      <div style={{ padding: "18px 24px", background: "var(--card)", border: "1px solid var(--line)", borderRadius: 8, marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, marginBottom: 10 }}>Current Balance</div>
        {loading ? skeleton(28, "50%") : (
          <>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 400, letterSpacing: "-0.02em" }}>
              {fmt(data?.current_balance)}
            </div>
            <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 4 }}>
              {hasAnchor
                ? `${fmt(data.starting_balance)} starting · ${fmt(data.current_balance - data.starting_balance)} from transactions`
                : <span>Based on all tracked history · <span style={{ color: "var(--accent)", cursor: "pointer", textDecoration: "underline" }} onClick={() => window._goSettings && window._goSettings()}>Set a starting balance in Settings</span></span>
              }
            </div>
          </>
        )}
      </div>

      {/* Monthly net bars */}
      <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 8 }}>
        <div style={{ borderRadius: "8px 8px 0 0", background: "var(--ink)", padding: "11px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--paper)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Monthly Net</span>
          <div style={{ display: "flex", gap: 4 }}>
            {[3, 6, 12].map(n => (
              <button key={n} onClick={() => setMonths(n)}
                style={{ padding: "3px 10px", borderRadius: 4, border: "none", background: months === n ? "var(--paper)" : "transparent", color: months === n ? "var(--ink)" : "var(--paper)", fontSize: 11, cursor: "pointer", fontFamily: "inherit", opacity: months === n ? 1 : 0.5, fontWeight: 500 }}>
                {n}mo
              </button>
            ))}
          </div>
        </div>
        <div style={{ padding: "20px 24px" }}>
          {loading ? skeleton(80) : bars.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "var(--ink-4)", fontSize: 13 }}>
              Not enough history yet. Come back after a full month.
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 80 }}>
              {bars.map(b => {
                const h = Math.max(4, Math.round((Math.abs(b.net) / maxAbs) * 72));
                const pos = b.net >= 0;
                return (
                  <div key={b.month} title={`${b.month}: ${fmt(b.net)} net (${fmt(b.income)} in, ${fmt(b.expenses)} out)`}
                    style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                    <div style={{ width: "100%", height: h, borderRadius: "2px 2px 0 0", background: pos ? "var(--pos)" : "var(--neg)", opacity: 0.75 }}/>
                    <div style={{ fontSize: 9, color: "var(--ink-4)", fontFamily: "'Geist Mono', monospace" }}>
                      {b.month.slice(2).replace("-", "/")}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

window.HealthView = HealthView;
```

- [ ] **Step 2: Commit**

```bash
git add static/src/health.jsx
git commit -m "feat: HealthView component — savings rate, runway, monthly net bars"
```

---

## Task 5: Wire Health tab into nav, app, and HTML

**Files:**
- Modify: `static/src/shell.jsx` (line ~75)
- Modify: `static/src/app.jsx` (lines ~194-278)
- Modify: `templates/index.html` (line ~103)

- [ ] **Step 1: Add Health nav item to shell.jsx**

In `static/src/shell.jsx`, find the nav items block (~line 74). The current order is:

```jsx
    <NavItem icon="inbox"   label="Inbox"       count={counts.unread}  active={view==="inbox"}     onClick={()=>navigate(()=>setView("inbox"))} />
    <NavItem icon="flow"    label="Money Flow"                          active={view==="flow"}      onClick={()=>navigate(()=>setView("flow"))} />
    <NavItem icon="dash"    label="Dashboard"                           active={view==="dashboard"} onClick={()=>navigate(()=>setView("dashboard"))} />
```

Insert the Health item between Dashboard and Reports:

```jsx
    <NavItem icon="inbox"   label="Inbox"       count={counts.unread}  active={view==="inbox"}     onClick={()=>navigate(()=>setView("inbox"))} />
    <NavItem icon="flow"    label="Money Flow"                          active={view==="flow"}      onClick={()=>navigate(()=>setView("flow"))} />
    <NavItem icon="dash"    label="Dashboard"                           active={view==="dashboard"} onClick={()=>navigate(()=>setView("dashboard"))} />
    <NavItem icon="heart"   label="Health"                              active={view==="health"}    onClick={()=>navigate(()=>setView("health"))} />
```

- [ ] **Step 2: Register view in app.jsx titles dict**

In `static/src/app.jsx`, find the `titles` object (~line 194):

```jsx
  const titles = {
    reports:   { title: "Reports",        sub: "month-by-month" },
    recurring: { title: "Recurring",      sub: "subscriptions & fixed expenses" },
    debt:      { title: "Debt Reduction", sub: "track payoff progress" },
```

Add the health entry:

```jsx
  const titles = {
    health:    { title: "Financial Health", sub: "runway · savings rate · monthly net" },
    reports:   { title: "Reports",        sub: "month-by-month" },
    recurring: { title: "Recurring",      sub: "subscriptions & fixed expenses" },
    debt:      { title: "Debt Reduction", sub: "track payoff progress" },
```

- [ ] **Step 3: Add view render in app.jsx**

Find the view render block (~line 272):

```jsx
        {view === "reports"   && <ReportsView />}
```

Add before it:

```jsx
        {view === "health"    && <HealthView />}
        {view === "reports"   && <ReportsView />}
```

- [ ] **Step 4: Wire _goSettings helper for the balance nudge**

In `app.jsx`, find where `setView` is defined (line ~6) and add a global helper after the state declarations:

Find the block near the top of the App component that has `const [view, setView]`. After the state declarations, add:

```jsx
  React.useEffect(() => {
    window._goSettings = () => setView("settings");
    return () => { delete window._goSettings; };
  }, [setView]);
```

- [ ] **Step 5: Add script tag to index.html**

In `templates/index.html`, find the script block (~line 104):

```html
  <script type="text/babel" src="/static/src/flow.jsx?v=4"></script>
```

Add health.jsx after flow.jsx:

```html
  <script type="text/babel" src="/static/src/flow.jsx?v=4"></script>
  <script type="text/babel" src="/static/src/health.jsx?v=1"></script>
```

- [ ] **Step 6: Rebuild and test**

```bash
docker compose build app && docker compose up -d
```

Open the app in a browser. Verify:
- "Health" appears in the left nav with a heart icon
- Clicking Health loads the HealthView without errors
- Topbar shows "Financial Health" title

- [ ] **Step 7: Commit**

```bash
git add static/src/shell.jsx static/src/app.jsx templates/index.html
git commit -m "feat: wire Health tab into nav, app router, and HTML"
```

---

## Task 6: Account settings — Financial Health section

**Files:**
- Modify: `static/src/account.jsx` (add FinancialHealthSection ~line 253, wire into SettingsView ~line 477)

- [ ] **Step 1: Add FinancialHealthSection component**

In `static/src/account.jsx`, find the line just before `const CategoriesSection` (~line 255). Insert the new component before it:

```jsx
const FinancialHealthSection = ({ settings, onRefresh }) => {
  const [balance, setBalance] = React.useState(
    settings?.starting_balance != null ? String(Math.round(settings.starting_balance)) : ""
  );
  const [balanceDate, setBalanceDate] = React.useState(settings?.starting_balance_date || "");
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    await API.patch("/api/account/settings", {
      starting_balance: balance !== "" ? parseFloat(balance) : null,
      starting_balance_date: balanceDate || null,
    });
    await onRefresh();
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div style={accountStyles.section}>
      <h3 style={accountStyles.sectionTitle}>Financial Health</h3>
      <div style={accountStyles.sectionSub}>— anchor your balance for runway & savings rate tracking</div>
      <div style={{ ...accountStyles.row, ...accountStyles.rowLast, flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={accountStyles.label}>Starting balance</div>
          <div style={accountStyles.sub}>leave blank to use all tracked transaction history</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "var(--ink-3)" }}>₹</span>
          <input
            type="number"
            min="0"
            placeholder="0"
            value={balance}
            onChange={e => setBalance(e.target.value)}
            style={{ width: 110, padding: "6px 10px", border: "1px solid var(--line)", borderRadius: 6, background: "var(--card)", fontSize: 13, fontFamily: "inherit" }}
          />
          <span style={{ fontSize: 12, color: "var(--ink-3)" }}>as of</span>
          <input
            type="date"
            max={today}
            value={balanceDate}
            onChange={e => setBalanceDate(e.target.value)}
            style={{ padding: "6px 10px", border: "1px solid var(--line)", borderRadius: 6, background: "var(--card)", fontSize: 13, fontFamily: "inherit" }}
          />
          <button onClick={save} disabled={saving} style={{ ...accountStyles.btn, ...accountStyles.btnPrimary }}>
            {saving ? "…" : saved ? "Saved ✓" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Wire FinancialHealthSection into SettingsView**

In `SettingsView` (~line 477), find where CategoriesSection is rendered:

```jsx
      {/* Categories */}
      <CategoriesSection categories={categories} onRefresh={async () => {
        const d = await API.get("/api/account/me");
        if (d?.categories) setAccount(prev => ({ ...prev, categories: d.categories }));
      }} />
```

Add FinancialHealthSection directly after it:

```jsx
      {/* Categories */}
      <CategoriesSection categories={categories} onRefresh={async () => {
        const d = await API.get("/api/account/me");
        if (d?.categories) setAccount(prev => ({ ...prev, categories: d.categories }));
      }} />

      {/* Financial Health */}
      <FinancialHealthSection settings={settings} onRefresh={async () => {
        const d = await API.get("/api/account/me");
        if (d?.settings) setAccount(prev => ({ ...prev, settings: d.settings }));
      }} />
```

- [ ] **Step 3: Add FinancialHealthSection to window exports**

Find the last line of `account.jsx` (~line 769):

```jsx
Object.assign(window, { OnboardingView, ProfileView, SettingsView, CategoriesSection })
```

Add `FinancialHealthSection`:

```jsx
Object.assign(window, { OnboardingView, ProfileView, SettingsView, CategoriesSection, FinancialHealthSection })
```

- [ ] **Step 4: Bump account.jsx version in index.html**

In `templates/index.html`, find:

```html
  <script type="text/babel" src="/static/src/account.jsx?v=4"></script>
```

Change to:

```html
  <script type="text/babel" src="/static/src/account.jsx?v=5"></script>
```

- [ ] **Step 5: Rebuild and test**

```bash
docker compose build app && docker compose up -d
```

In the browser:
- Go to Settings
- Scroll down to "Financial Health" section (should appear after Categories)
- Enter a balance (e.g., 100000) and date (e.g., 2026-01-01)
- Click Save — button should briefly show "Saved ✓"
- Go to Health tab — `balance_mode` should now show `"anchored"`, balance row should show breakdown

- [ ] **Step 6: Commit**

```bash
git add static/src/account.jsx templates/index.html
git commit -m "feat: Financial Health section in Settings — starting balance anchor"
```

---

## Self-Review

**Spec coverage check:**
- ✅ New DB fields on `user_settings` → Task 1 (migration) + Task 2 (model/API)
- ✅ `GET /api/stats/health?months=N` endpoint → Task 3
- ✅ `current_balance`, `savings_rate`, `runway_months`, `monthly_net`, `balance_mode` in response → Task 3
- ✅ `starting_balance` in settings PATCH → Task 2
- ✅ Financial Health section in Settings UI → Task 6
- ✅ Health tab in nav → Task 5 (shell.jsx)
- ✅ Two stat cards (Savings Rate, Runway) → Task 4
- ✅ Monthly net bars with 3mo/6mo/12mo toggle → Task 4
- ✅ Current balance row with anchored/computed mode text → Task 4
- ✅ Empty state for < 1 month data → Task 4
- ✅ Loading skeleton → Task 4
- ✅ Nudge to Settings if no starting_balance → Task 4 + Task 5 (_goSettings)
- ✅ date validation (max=today) on date input → Task 6
