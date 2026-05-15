# Transactions Page Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the transactions page with a refined table (left-border label coding), a proper edit modal (label/amount/category/notes), and a 3-second hover preview that lazy-loads the full email body stored at sync time.

**Architecture:** Add a `body_text` column to `emails`, populate it during Gmail sync by decoding the `text/plain` MIME part, expose it in the transaction detail endpoint, then update the frontend with a new table layout, modal, and hover tooltip — all in `transactions.html` + `app.js`.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2.0 async, Alembic, SQLite (tests), Vanilla JS, existing pytest-asyncio test suite.

---

## File Map

| File | Change |
|------|--------|
| `alembic/versions/0005_email_body_text.py` | New — add `body_text` column to `emails` |
| `app/models.py` | Add `body_text: Mapped[Optional[str]]` to `Email` |
| `app/gmail/client.py` | Add `_extract_body_text()`, switch fetch to `format="full"`, populate `body_text` |
| `app/api/transactions.py` | Return `body_text` in `GET /transactions/{id}` detail response |
| `templates/transactions.html` | Full rewrite: refined table, `data-*` attrs, category filter |
| `static/app.js` | Replace `openCorrect` with modal + add hover preview |
| `tests/test_gmail_client.py` | Tests for `_extract_body_text` |
| `tests/test_api.py` | Test `GET /transactions/{id}` returns `body_text` |

---

## Task 1: Migration + Model

**Files:**
- Create: `alembic/versions/0005_email_body_text.py`
- Modify: `app/models.py`

- [ ] **Step 1: Write the migration**

Create `alembic/versions/0005_email_body_text.py`:

```python
"""add body_text to emails

Revision ID: 0005
Revises: 0004
Create Date: 2026-04-12 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '0005'
down_revision: Union[str, None] = '0004'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('emails', sa.Column('body_text', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('emails', 'body_text')
```

- [ ] **Step 2: Add `body_text` to the Email model**

In `app/models.py`, find the `Email` class. After the `body_snippet` line, add:

```python
body_text: Mapped[Optional[str]] = mapped_column(Text)
```

The `Text` type and `Optional` are already imported (same as `body_snippet`).

- [ ] **Step 3: Verify tests still pass**

```bash
pytest tests/test_models.py tests/test_api.py -v
```

Expected: all existing tests pass (new nullable column doesn't break anything).

- [ ] **Step 4: Commit**

```bash
git add alembic/versions/0005_email_body_text.py app/models.py
git commit -m "feat: add body_text column to emails"
```

---

## Task 2: Gmail Client — Fetch and Store Full Body

**Files:**
- Modify: `app/gmail/client.py`
- Test: `tests/test_gmail_client.py`

- [ ] **Step 1: Write failing tests for `_extract_body_text`**

Add to `tests/test_gmail_client.py`:

```python
import base64
from app.gmail.client import _extract_body_text

def _b64(text: str) -> str:
    return base64.urlsafe_b64encode(text.encode()).decode()

def test_extract_body_simple_payload():
    """Simple email: body directly on payload, no parts."""
    payload = {
        "mimeType": "text/plain",
        "body": {"data": _b64("Hello world")},
        "parts": [],
    }
    assert _extract_body_text(payload) == "Hello world"

def test_extract_body_multipart():
    """Multipart email: plain text is in parts."""
    payload = {
        "mimeType": "multipart/alternative",
        "body": {},
        "parts": [
            {
                "mimeType": "text/plain",
                "body": {"data": _b64("Plain text body")},
            },
            {
                "mimeType": "text/html",
                "body": {"data": _b64("<p>HTML body</p>")},
            },
        ],
    }
    assert _extract_body_text(payload) == "Plain text body"

def test_extract_body_nested_multipart():
    """Nested multipart — walks recursively."""
    inner = {
        "mimeType": "text/plain",
        "body": {"data": _b64("Nested plain")},
    }
    payload = {
        "mimeType": "multipart/mixed",
        "body": {},
        "parts": [
            {"mimeType": "multipart/alternative", "body": {}, "parts": [inner]},
        ],
    }
    assert _extract_body_text(payload) == "Nested plain"

def test_extract_body_no_plain_falls_back_empty():
    """HTML-only email returns empty string."""
    payload = {
        "mimeType": "text/html",
        "body": {"data": _b64("<p>HTML only</p>")},
        "parts": [],
    }
    assert _extract_body_text(payload) == ""

def test_extract_body_collapses_whitespace():
    """Excessive blank lines collapsed to double newline."""
    raw = "Line 1\n\n\n\n\nLine 2"
    payload = {
        "mimeType": "text/plain",
        "body": {"data": _b64(raw)},
        "parts": [],
    }
    result = _extract_body_text(payload)
    assert "\n\n\n" not in result
    assert "Line 1" in result
    assert "Line 2" in result

def test_extract_body_caps_at_4000():
    """Output capped at 4000 chars."""
    long_text = "x" * 5000
    payload = {
        "mimeType": "text/plain",
        "body": {"data": _b64(long_text)},
        "parts": [],
    }
    assert len(_extract_body_text(payload)) == 4000
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
pytest tests/test_gmail_client.py -v -k "extract_body"
```

Expected: `ImportError: cannot import name '_extract_body_text'`

- [ ] **Step 3: Implement `_extract_body_text` in `app/gmail/client.py`**

Add these imports at the top of `app/gmail/client.py`:

```python
import base64
import re
```

Add the function (before `fetch_new_messages`):

```python
def _extract_body_text(payload: dict) -> str:
    """Extract plain text from a Gmail message payload. Walks MIME parts recursively."""
    def _find_plain(part: dict) -> str:
        if part.get("mimeType") == "text/plain":
            data = part.get("body", {}).get("data", "")
            if data:
                # Gmail uses URL-safe base64; pad to multiple of 4
                return base64.urlsafe_b64decode(data + "==").decode("utf-8", errors="replace")
        for subpart in part.get("parts", []):
            result = _find_plain(subpart)
            if result:
                return result
        return ""

    text = _find_plain(payload)
    text = re.sub(r'\n{3,}', '\n\n', text)   # collapse blank lines
    text = re.sub(r'[ \t]+', ' ', text)        # collapse horizontal whitespace
    return text.strip()[:4000]
```

- [ ] **Step 4: Update `fetch_new_messages` to use `format="full"` and populate `body_text`**

In `fetch_new_messages`, find the message fetch inside the `for msg_id in message_ids:` loop. Replace:

```python
            msg = service.users().messages().get(
                userId="me", id=msg_id, format="metadata",
                metadataHeaders=["From", "Subject", "Date"],
            ).execute()
```

With:

```python
            msg = service.users().messages().get(
                userId="me", id=msg_id, format="full",
            ).execute()
```

Then find the `messages.append({...})` block and add `body_text` to it:

```python
        messages.append({
            "gmail_id": msg_id,
            "subject": headers.get("Subject", ""),
            "sender": sender,
            "sender_domain": extract_domain(sender),
            "received_at": datetime.fromtimestamp(
                int(msg["internalDate"]) / 1000, tz=timezone.utc
            ),
            "body_snippet": msg.get("snippet", "")[:500],
            "body_text": _extract_body_text(msg.get("payload", {})),
            "gmail_link": get_gmail_link(msg_id),
        })
```

Also update the docstring for `fetch_new_messages` — add `body_text` to the listed keys:

```python
        gmail_id, subject, sender, sender_domain, received_at, body_snippet, body_text, gmail_link
```

- [ ] **Step 5: Run all gmail client tests**

```bash
pytest tests/test_gmail_client.py -v
```

Expected: all pass. (The live-fetch tests mock the service so `format` change doesn't affect them.)

- [ ] **Step 6: Commit**

```bash
git add app/gmail/client.py tests/test_gmail_client.py
git commit -m "feat: extract and store full email body text at sync time"
```

---

## Task 3: Transactions API — Expose `body_text` in Detail Endpoint

**Files:**
- Modify: `app/api/transactions.py`
- Test: `tests/test_api.py`

- [ ] **Step 1: Write failing test**

Add to `tests/test_api.py`:

```python
@pytest.mark.asyncio
async def test_get_transaction_detail_includes_body_text(db_session):
    from app.models import Email, Transaction
    import uuid
    from datetime import datetime, timezone

    # Insert an Email + Transaction directly
    email = Email(
        gmail_id="test_gmail_id_body",
        subject="Test Subject",
        sender="test@example.com",
        sender_domain="example.com",
        received_at=datetime.now(timezone.utc),
        body_snippet="short snippet",
        body_text="Full body text here.",
        gmail_link="https://mail.google.com/mail/u/0/#inbox/test_gmail_id_body",
    )
    db_session.add(email)
    await db_session.flush()

    txn = Transaction(
        email_id=email.id,
        label="expense",
        amount=100.0,
        currency="INR",
        status="auto",
        classifier_method="rule",
        confidence=0.9,
    )
    db_session.add(txn)
    await db_session.commit()
    await db_session.refresh(txn)

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get(f"/api/transactions/{txn.id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["email"]["body_text"] == "Full body text here."
    finally:
        app.dependency_overrides.pop(get_db, None)
```

- [ ] **Step 2: Run test — verify it fails**

```bash
pytest tests/test_api.py::test_get_transaction_detail_includes_body_text -v
```

Expected: FAIL — `body_text` key missing from response.

- [ ] **Step 3: Update detail endpoint to return `body_text`**

In `app/api/transactions.py`, find `get_transaction` (the `GET /transactions/{id}` handler). After the existing extras (lines that add `sender_domain` and `body_snippet`), add:

```python
    result["email"]["body_text"] = e.body_text
```

The full extras block should now read:

```python
    result["email"]["sender_domain"] = e.sender_domain
    result["email"]["body_snippet"] = e.body_snippet
    result["email"]["body_text"] = e.body_text
```

- [ ] **Step 4: Run test — verify it passes**

```bash
pytest tests/test_api.py::test_get_transaction_detail_includes_body_text -v
```

Expected: PASS.

- [ ] **Step 5: Run full test suite**

```bash
pytest -v
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add app/api/transactions.py tests/test_api.py
git commit -m "feat: expose body_text in transaction detail endpoint"
```

---

## Task 4: Transactions Template — Refined Table

**Files:**
- Modify: `templates/transactions.html`

This task rewrites the template only. No JS changes yet — `openEditModal` is declared in the next task; the `data-*` attributes and `✎` buttons are wired up here.

- [ ] **Step 1: Rewrite `templates/transactions.html`**

Replace the entire file content with:

```html
{% extends "base.html" %}
{% block content %}
<div style="display:flex;gap:10px;margin-bottom:20px;align-items:center;flex-wrap:wrap">
  <select id="filter-label" onchange="loadTxns()">
    <option value="">All labels</option>
    <option value="expense">Expense</option>
    <option value="income">Income</option>
    <option value="ignore">Ignore</option>
  </select>
  <select id="filter-category" onchange="loadTxns()">
    <option value="">All categories</option>
    <option>Food</option><option>Groceries</option><option>Shopping</option>
    <option>Travel</option><option>Transport</option><option>Utilities</option>
    <option>Entertainment</option><option>Healthcare</option><option>Education</option>
    <option>UPI Payment</option><option>Bank Transfer</option><option>Income</option><option>Other</option>
  </select>
  <select id="filter-status" onchange="loadTxns()">
    <option value="">All statuses</option>
    <option value="auto">Auto</option>
    <option value="corrected">Corrected</option>
    <option value="needs_review">Needs Review</option>
  </select>
  <input type="date" id="filter-from" onchange="loadTxns()">
  <input type="date" id="filter-to" onchange="loadTxns()">
  <span id="txn-count" style="margin-left:auto;font-size:13px;color:#555"></span>
</div>

<div class="card" style="padding:0;overflow:hidden">
  <table>
    <thead>
      <tr>
        <th style="width:80px">Date</th>
        <th>Merchant</th>
        <th>Category</th>
        <th style="text-align:right">Amount</th>
        <th style="width:90px">Label</th>
        <th style="width:28px"></th>
      </tr>
    </thead>
    <tbody id="txn-body"></tbody>
  </table>
</div>

<style>
  /* Left border label coding */
  tr.lbl-expense  { border-left: 3px solid #e07070; }
  tr.lbl-income   { border-left: 3px solid #5db87d; }
  tr.lbl-ignore   { border-left: 3px solid #2a2a3a; }
  tr.lbl-needs_review { border-left: 3px solid #7c83fd; }

  .edit-btn {
    background: none;
    border: none;
    color: #3a3a5a;
    cursor: pointer;
    font-size: 14px;
    padding: 2px 6px;
    border-radius: 4px;
    transition: color .15s;
  }
  .edit-btn:hover { color: #7c83fd; }

  /* Hover tooltip */
  #email-tooltip {
    position: fixed;
    z-index: 9999;
    background: #0e0e1a;
    border: 1px solid #2a2a4a;
    border-radius: 8px;
    padding: 14px 16px;
    max-width: 420px;
    min-width: 280px;
    box-shadow: 0 8px 32px rgba(0,0,0,.6);
    pointer-events: auto;
  }
  #email-tooltip .tip-subject {
    font-size: 13px;
    font-weight: 600;
    color: #ccc;
    margin-bottom: 3px;
  }
  #email-tooltip .tip-meta {
    font-size: 11px;
    color: #555;
    margin-bottom: 10px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  #email-tooltip .tip-body {
    font-size: 12px;
    color: #888;
    line-height: 1.6;
    max-height: 160px;
    overflow-y: auto;
    border-top: 1px solid #1a1a2a;
    padding-top: 10px;
    white-space: pre-wrap;
    word-break: break-word;
  }
</style>

<script>
const CATEGORIES = ['Food','Groceries','Shopping','Travel','Transport','Utilities','Entertainment','Healthcare','Education','UPI Payment','Bank Transfer','Income','Other'];

const LABEL_BORDER = { expense:'#e07070', income:'#5db87d', ignore:'#2a2a3a', needs_review:'#7c83fd' };
const LABEL_COLOR  = { expense:'#e07070', income:'#5db87d', ignore:'#555',    needs_review:'#7c83fd' };
const LABEL_BG     = { expense:'#2a1a1a', income:'#1a2a1a', ignore:'#1a1a1a', needs_review:'#1a1a2a' };

function _esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function loadTxns() {
  const params = new URLSearchParams();
  const label    = document.getElementById('filter-label').value;
  const category = document.getElementById('filter-category').value;
  const status   = document.getElementById('filter-status').value;
  const from     = document.getElementById('filter-from').value;
  const to       = document.getElementById('filter-to').value;
  if (label)    params.set('label', label);
  if (category) params.set('category', category);
  if (status)   params.set('status', status);
  if (from)     params.set('date_from', from);
  if (to)       params.set('date_to', to);

  const txns = await fetch('/api/transactions?' + params).then(r => r.json());
  document.getElementById('txn-count').textContent = txns.length + ' transaction' + (txns.length !== 1 ? 's' : '');

  const lbl = (t) => t.status === 'needs_review' ? 'needs_review' : (t.label || 'ignore');
  const tbody = document.getElementById('txn-body');
  tbody.innerHTML = txns.map(t => {
    const l = lbl(t);
    const amtColor = LABEL_COLOR[l] || '#888';
    const badgeBg  = LABEL_BG[l]   || '#1a1a1a';
    const badgeLabel = l === 'needs_review' ? 'review' : l;
    return `<tr class="lbl-${l}"
      data-id="${_esc(t.id)}"
      data-label="${_esc(t.label)}"
      data-category="${_esc(t.category||'')}"
      data-amount="${t.amount ?? ''}"
      data-notes="${_esc(t.user_notes||'')}"
      data-subject="${_esc(t.email?.subject||'')}"
      data-sender="${_esc(t.email?.sender||'')}"
      data-date="${_esc(t.txn_date || (t.email?.received_at ? t.email.received_at.slice(0,10) : ''))}"
    >
      <td>${_esc(t.txn_date || (t.email?.received_at ? t.email.received_at.slice(0,10) : '\u2014'))}</td>
      <td style="font-weight:500">${_esc(t.merchant || '\u2014')}</td>
      <td style="color:#666">${_esc(t.category || '\u2014')}</td>
      <td style="text-align:right;color:${amtColor};font-weight:${t.amount != null ? '600' : '400'}">${t.amount != null ? '\u20B9' + Number(t.amount).toLocaleString('en-IN') : '\u2014'}</td>
      <td><span style="background:${badgeBg};color:${amtColor};padding:2px 8px;border-radius:4px;font-size:10px;letter-spacing:.3px">${badgeLabel}</span></td>
      <td><button class="edit-btn" onclick="openEditModal(this)" title="Edit">\u270E</button></td>
    </tr>`;
  }).join('') || '<tr><td colspan="6" style="color:#555;padding:20px;text-align:center">No transactions</td></tr>';

  _attachHoverListeners();
}

loadTxns();
</script>
{% endblock %}
```

- [ ] **Step 2: Manually verify the page loads**

Start the app (`docker compose up` or `uvicorn app.main:app --reload`) and open `http://localhost:8000/transactions`. Confirm:
- Table renders with correct columns
- Left border colors show per label
- Category dropdown appears
- Count updates

- [ ] **Step 3: Commit**

```bash
git add templates/transactions.html
git commit -m "feat: refined transactions table with label border coding and category filter"
```

---

## Task 5: Edit Modal

**Files:**
- Modify: `static/app.js`

- [ ] **Step 1: Find and remove `openCorrect` from `app.js`**

In `static/app.js`, delete the entire `openCorrect` function (lines ~218–228):

```js
// ── Inline correction ─────────────────────────────────────────────────────────

async function openCorrect(id, currentLabel, currentCategory) {
  const label = prompt('New label (expense, income, ignore):', currentLabel);
  if (!label) return;
  const category = prompt('Category (leave blank to keep current):', currentCategory) || currentCategory;
  await fetch('/api/transactions/' + id, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label, category }),
  });
  window.location.reload();
}
```

- [ ] **Step 2: Add modal HTML + `openEditModal` + `_attachHoverListeners` placeholder to `app.js`**

At the end of `static/app.js` (before the closing self-invoking async function, or after all existing code), add:

```js
// ── Edit Modal ────────────────────────────────────────────────────────────────

(function _initEditModal() {
  const CATS = ['Food','Groceries','Shopping','Travel','Transport','Utilities',
                'Entertainment','Healthcare','Education','UPI Payment','Bank Transfer','Income','Other'];

  const LABEL_COLORS = { expense: '#e07070', income: '#5db87d', ignore: '#888' };

  const modalHTML = `
  <div id="edit-modal-backdrop" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:1000;align-items:center;justify-content:center">
    <div id="edit-modal" style="background:#0e0e1a;border:1px solid #2a2a4a;border-radius:10px;padding:20px;width:340px;max-width:95vw;font-size:13px;position:relative">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">
        <div>
          <div id="em-merchant" style="font-weight:600;color:#ccc"></div>
          <div id="em-meta" style="font-size:11px;color:#555;margin-top:2px"></div>
        </div>
        <button onclick="closeEditModal()" style="background:none;border:none;color:#444;font-size:18px;cursor:pointer;line-height:1">✕</button>
      </div>

      <div style="font-size:10px;color:#444;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Label</div>
      <div style="display:flex;gap:8px;margin-bottom:14px">
        <button class="em-lbl-btn" data-label="expense" onclick="_emSelectLabel('expense')" style="flex:1;padding:7px 0;border:2px solid #2a2a4a;background:transparent;color:#555;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer">Expense</button>
        <button class="em-lbl-btn" data-label="income"  onclick="_emSelectLabel('income')"  style="flex:1;padding:7px 0;border:2px solid #2a2a4a;background:transparent;color:#555;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer">Income</button>
        <button class="em-lbl-btn" data-label="ignore"  onclick="_emSelectLabel('ignore')"  style="flex:1;padding:7px 0;border:2px solid #2a2a4a;background:transparent;color:#555;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer">Ignore</button>
      </div>

      <div id="em-amount-wrap" style="margin-bottom:14px">
        <div style="font-size:10px;color:#444;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Amount (₹)</div>
        <input id="em-amount" type="number" step="0.01" min="0" style="width:100%;background:#111;border:1px solid #2a2a4a;color:#ccc;padding:7px 10px;border-radius:6px;font-size:13px;box-sizing:border-box">
      </div>

      <div style="font-size:10px;color:#444;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Category</div>
      <div id="em-chips" style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:14px"></div>

      <div style="font-size:10px;color:#444;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Notes</div>
      <textarea id="em-notes" placeholder="Optional note…" style="width:100%;background:#111;border:1px solid #2a2a4a;color:#888;padding:7px 10px;border-radius:6px;font-size:12px;resize:none;height:56px;box-sizing:border-box;margin-bottom:16px"></textarea>

      <div style="display:flex;gap:8px">
        <button onclick="closeEditModal()" style="flex:1;padding:8px;background:transparent;border:1px solid #2a2a4a;color:#555;border-radius:7px;font-size:12px;cursor:pointer">Cancel</button>
        <button id="em-save-btn" onclick="_emSave()" style="flex:2;padding:8px;background:#7c83fd;border:none;color:#fff;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer">Save Changes</button>
      </div>
      <div id="em-error" style="color:#e07070;font-size:11px;margin-top:8px;display:none"></div>
    </div>
  </div>`;

  document.body.insertAdjacentHTML('beforeend', modalHTML);

  // Dismiss on backdrop click
  document.getElementById('edit-modal-backdrop').addEventListener('click', function(e) {
    if (e.target === this) closeEditModal();
  });

  // Dismiss on Escape
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeEditModal();
  });
})();

let _emCurrentId = null;
let _emCurrentLabel = null;
let _emCurrentCategory = null;

function openEditModal(btn) {
  const row = btn.closest('tr');
  const { id, label, category, amount, notes } = row.dataset;
  _emCurrentId = id;
  _emCurrentCategory = category;

  // Header
  document.getElementById('em-merchant').textContent = row.cells[1].textContent.trim();
  const date = row.cells[0].textContent.trim();
  const amtText = row.cells[3].textContent.trim();
  document.getElementById('em-meta').textContent = [date, amtText].filter(Boolean).join(' · ');

  // Amount
  document.getElementById('em-amount').value = amount || '';

  // Notes
  document.getElementById('em-notes').value = notes || '';

  // Category chips
  const cats = ['Food','Groceries','Shopping','Travel','Transport','Utilities',
                 'Entertainment','Healthcare','Education','UPI Payment','Bank Transfer','Income','Other'];
  const chipsEl = document.getElementById('em-chips');
  chipsEl.innerHTML = cats.map(c =>
    `<button type="button" onclick="_emSelectCat('${c}')"
      style="padding:3px 9px;border-radius:20px;border:1px solid #2a2a4a;background:transparent;color:#555;font-size:11px;cursor:pointer"
      data-cat="${c}">${c}</button>`
  ).join('') + `<input id="em-custom-cat" placeholder="Custom…" oninput="_emSelectCat(this.value)"
      style="width:80px;padding:3px 8px;background:#111;border:1px solid #1a1a2a;color:#888;border-radius:20px;font-size:11px">`;

  // Pre-select label (normalise needs_review → expense for editing purposes)
  const editLabel = (label === 'needs_review' ? 'expense' : label) || 'expense';
  _emSelectLabel(editLabel);

  // Pre-select category
  if (category) _emSelectCat(category);

  document.getElementById('em-error').style.display = 'none';
  const backdrop = document.getElementById('edit-modal-backdrop');
  backdrop.style.display = 'flex';
}

function closeEditModal() {
  document.getElementById('edit-modal-backdrop').style.display = 'none';
  _emCurrentId = null;
}

function _emSelectLabel(label) {
  _emCurrentLabel = label;
  const color = { expense: '#e07070', income: '#5db87d', ignore: '#888' };
  const bg    = { expense: '#2a1a1a', income: '#1a2a1a', ignore: '#1a1a1a' };
  document.querySelectorAll('.em-lbl-btn').forEach(btn => {
    const l = btn.dataset.label;
    const active = l === label;
    btn.style.borderColor = active ? (color[l] || '#7c83fd') : '#2a2a4a';
    btn.style.background  = active ? (bg[l]    || '#1a1a2a') : 'transparent';
    btn.style.color       = active ? (color[l] || '#ccc')    : '#555';
  });
  document.getElementById('em-amount-wrap').style.display = label === 'ignore' ? 'none' : 'block';
}

function _emSelectCat(cat) {
  _emCurrentCategory = cat;
  document.querySelectorAll('#em-chips [data-cat]').forEach(btn => {
    const active = btn.dataset.cat === cat;
    btn.style.borderColor = active ? '#7c83fd' : '#2a2a4a';
    btn.style.background  = active ? '#1a1a3a' : 'transparent';
    btn.style.color       = active ? '#7c83fd' : '#555';
  });
}

async function _emSave() {
  if (!_emCurrentId) return;
  const saveBtn = document.getElementById('em-save-btn');
  saveBtn.textContent = 'Saving…'; saveBtn.disabled = true;

  const body = { label: _emCurrentLabel };
  const amtVal = document.getElementById('em-amount').value;
  if (amtVal && _emCurrentLabel !== 'ignore') body.amount = parseFloat(amtVal);
  if (_emCurrentCategory) body.category = _emCurrentCategory;
  const notes = document.getElementById('em-notes').value.trim();
  if (notes) body.user_notes = notes;

  try {
    const resp = await fetch('/api/transactions/' + _emCurrentId, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) throw new Error((await resp.json()).detail || 'Save failed');

    // Update the row in-place
    const row = document.querySelector(`tr[data-id="${_emCurrentId}"]`);
    if (row) {
      const l = _emCurrentLabel;
      const amtColor = { expense:'#e07070', income:'#5db87d', ignore:'#555', needs_review:'#7c83fd' }[l] || '#888';
      const badgeBg  = { expense:'#2a1a1a', income:'#1a2a1a', ignore:'#1a1a1a', needs_review:'#1a1a2a' }[l] || '#1a1a1a';

      // Update data attrs
      row.dataset.label    = l;
      row.dataset.category = _emCurrentCategory || '';
      row.dataset.amount   = amtVal || '';
      row.dataset.notes    = notes;

      // Update border class
      row.className = `lbl-${l}`;

      // Update badge cell (index 4)
      row.cells[4].innerHTML = `<span style="background:${badgeBg};color:${amtColor};padding:2px 8px;border-radius:4px;font-size:10px;letter-spacing:.3px">${l}</span>`;

      // Update amount cell (index 3)
      row.cells[3].style.color = amtColor;
      if (body.amount != null) {
        row.cells[3].textContent = '₹' + Number(body.amount).toLocaleString('en-IN');
        row.cells[3].style.fontWeight = '600';
      }

      // Update category cell (index 2)
      if (_emCurrentCategory) row.cells[2].textContent = _emCurrentCategory;
    }
    closeEditModal();
  } catch (e) {
    const errEl = document.getElementById('em-error');
    errEl.textContent = e.message;
    errEl.style.display = 'block';
  } finally {
    saveBtn.textContent = 'Save Changes'; saveBtn.disabled = false;
  }
}

// Placeholder — implemented in Task 6
function _attachHoverListeners() {}
```

- [ ] **Step 3: Test the modal manually**

Open `http://localhost:8000/transactions`. Click `✎` on any row. Verify:
- Modal opens with correct merchant/date/amount pre-filled
- Label toggle highlights correctly, hides amount on "Ignore"
- Category chip pre-selected
- Save calls PATCH and updates row without reload
- Escape and backdrop click close the modal

- [ ] **Step 4: Commit**

```bash
git add static/app.js
git commit -m "feat: replace prompt-based edit with modal supporting label/amount/category/notes"
```

---

## Task 6: Hover Email Preview

**Files:**
- Modify: `static/app.js`

- [ ] **Step 1: Replace the `_attachHoverListeners` placeholder with the real implementation**

In `static/app.js`, find the line:

```js
// Placeholder — implemented in Task 6
function _attachHoverListeners() {}
```

Replace it with:

```js
// ── Hover email preview ───────────────────────────────────────────────────────

let _hoverTimer = null;
let _tooltipDismissTimer = null;
const _HOVER_DELAY = 3000;   // ms before tooltip fires
const _GRACE_MS    = 200;    // ms grace when moving cursor from row to tooltip

function _attachHoverListeners() {
  document.querySelectorAll('#txn-body tr[data-id]').forEach(row => {
    row.addEventListener('mouseenter', _onRowEnter);
    row.addEventListener('mouseleave', _onRowLeave);
  });
}

function _onRowEnter(e) {
  const row = e.currentTarget;
  clearTimeout(_hoverTimer);
  _hoverTimer = setTimeout(() => _showTooltip(row), _HOVER_DELAY);
}

function _onRowLeave() {
  clearTimeout(_hoverTimer);
  // Start grace timer — cancelled if cursor enters tooltip
  _tooltipDismissTimer = setTimeout(_removeTooltip, _GRACE_MS);
}

async function _showTooltip(row) {
  const id = row.dataset.id;
  _removeTooltip();

  // Fetch detail (includes body_text)
  let data;
  try {
    const resp = await fetch('/api/transactions/' + id);
    if (!resp.ok) return;
    data = await resp.json();
  } catch (_) { return; }

  const email = data.email || {};
  const bodyRaw = email.body_text || email.body_snippet || '';
  // Strip any residual HTML tags
  const bodyClean = bodyRaw.replace(/<[^>]*>/g, '').trim();

  const subject  = email.subject  || '(no subject)';
  const sender   = email.sender   || '';
  const dateStr  = (email.received_at || '').slice(0, 10);
  const gmailLink = email.gmail_link || '#';

  const tip = document.createElement('div');
  tip.id = 'email-tooltip';
  tip.innerHTML = `
    <div class="tip-subject">${_escTip(subject)}</div>
    <div class="tip-meta">
      <span>${_escTip(sender)}${dateStr ? ' · ' + dateStr : ''}</span>
      <a href="${_escTip(gmailLink)}" target="_blank" style="color:#7c83fd;font-size:11px;white-space:nowrap;margin-left:10px">Gmail ↗</a>
    </div>
    <div class="tip-body">${_escTip(bodyClean) || '<span style="color:#444">No body text available.</span>'}</div>`;

  tip.addEventListener('mouseenter', () => clearTimeout(_tooltipDismissTimer));
  tip.addEventListener('mouseleave', _removeTooltip);

  document.body.appendChild(tip);

  // Position: below row, clamped to viewport
  const rect = row.getBoundingClientRect();
  const tipW = 420;
  const tipH = tip.offsetHeight || 200;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let left = rect.left + window.scrollX;
  let top  = rect.bottom + window.scrollY + 6;

  if (left + tipW > vw - 10) left = vw - tipW - 10;
  if (left < 10) left = 10;
  if (top + tipH > vh + window.scrollY - 10) {
    top = rect.top + window.scrollY - tipH - 6;
  }
  tip.style.left = left + 'px';
  tip.style.top  = top  + 'px';
}

function _removeTooltip() {
  const existing = document.getElementById('email-tooltip');
  if (existing) existing.remove();
}

function _escTip(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// Dismiss on Escape (supplement to modal handler)
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') _removeTooltip();
});
```

- [ ] **Step 2: Test hover preview manually**

Open `http://localhost:8000/transactions`. Hover over a row for 3 seconds. Verify:
- Tooltip appears below the row with subject, sender, date, body text, Gmail link
- Moving cursor off row within 3s cancels the timer (no tooltip)
- Moving cursor from row directly into tooltip keeps it visible
- Moving cursor off tooltip dismisses it
- Pressing Escape dismisses the tooltip
- Tooltip clamps to viewport on rows near the bottom or right edge

- [ ] **Step 3: Run full test suite**

```bash
pytest -v
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add static/app.js
git commit -m "feat: add 3-second hover email preview with lazy body fetch"
```

---

## Self-Review

**Spec coverage:**
- [x] Migration + model (`body_text` column) — Task 1
- [x] Gmail client fetches + stores full body — Task 2
- [x] Detail endpoint exposes `body_text` — Task 3
- [x] Refined table: left-border coding, columns, category filter — Task 4
- [x] Edit modal: label/amount/category/notes, in-place row update — Task 5
- [x] Hover preview: 3s delay, grace timer, tooltip with body text — Task 6

**Placeholder scan:** None found.

**Type consistency:**
- `_attachHoverListeners` defined in Task 6, called in template's `loadTxns()` (Task 4) — both match.
- `openEditModal(btn)` called in template `onclick` (Task 4), defined in Task 5 — signature matches.
- `_emSelectLabel`, `_emSelectCat`, `_emSave`, `closeEditModal` defined in Task 5, referenced only within Task 5 — consistent.
- `_escTip` defined in Task 6; `_esc` defined in template Task 4 — no cross-use confusion.
