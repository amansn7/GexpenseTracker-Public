# Self Transfer Label Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `self_transfer` label so bank-to-bank transfers between the user's own accounts are excluded from all income/expense stats automatically.

**Architecture:** `tag` in frontend maps 1:1 to `label` in the DB (`inbox.jsx` line 651: `apiPatch.label = patch.tag`). Add `self_transfer` to the Python `Label` StrEnum (no migration needed — stored as `String(20)`), add it to `TAGS` in `data.jsx`, and expose it in the inbox cycle button and label select. Stats/budgets require zero changes — they already filter explicitly for `expense` or `income`.

**Tech Stack:** Python StrEnum (backend), React/JSX + esbuild (frontend), pytest.

---

### Task 1: Backend — add `self_transfer` to Label enum + test

**Files:**
- Modify: `app/models/transaction.py:12-15`
- Test: `tests/test_api.py` (append)

- [ ] **Step 1: Write failing test**

Append to `tests/test_api.py`:

```python
@pytest.mark.asyncio
async def test_patch_transaction_label_self_transfer(db_session, mock_user):
    """self_transfer is a valid label value — PATCH must accept it."""
    from app.models import Email, Transaction
    from app.models.transaction import Label, TransactionStatus
    from datetime import datetime, timezone

    email = Email(
        id="test-email-st-1",
        user_id=mock_user.id,
        message_id="msg-st-1",
        subject="Bank transfer",
        sender="bank@example.com",
        received_at=datetime.now(timezone.utc),
        body_text="Transfer 5000",
    )
    db_session.add(email)
    txn = Transaction(
        id="test-txn-st-1",
        email_id=email.id,
        amount=5000.0,
        category="transfer",
        label=Label.expense,
        status=TransactionStatus.confirmed,
        txn_date=None,
        description="Bank transfer",
    )
    db_session.add(txn)
    await db_session.commit()

    async def override():
        yield db_session
    app.dependency_overrides[get_db] = override
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.patch(
                "/api/transactions/test-txn-st-1",
                json={"label": "self_transfer"},
            )
        assert resp.status_code == 200
    finally:
        app.dependency_overrides.pop(get_db, None)
```

- [ ] **Step 2: Run to confirm FAIL**

```bash
cd /Users/amansaini/GexpenseTracker && .venv/bin/pytest tests/test_api.py::test_patch_transaction_label_self_transfer -v 2>&1 | tail -10
```

Expected: FAIL — `self_transfer` is not a valid `Label` value, endpoint returns 422 or 400.

- [ ] **Step 3: Add `self_transfer` to Label enum**

In `app/models/transaction.py`, update the `Label` class:

```python
class Label(StrEnum):
    expense = "expense"
    income = "income"
    ignore = "ignore"
    self_transfer = "self_transfer"
```

- [ ] **Step 4: Run test to confirm PASS**

```bash
cd /Users/amansaini/GexpenseTracker && .venv/bin/pytest tests/test_api.py::test_patch_transaction_label_self_transfer -v 2>&1 | tail -10
```

Expected: PASS.

- [ ] **Step 5: Run existing label-related tests to confirm no regressions**

```bash
cd /Users/amansaini/GexpenseTracker && .venv/bin/pytest tests/test_api.py -v --tb=short 2>&1 | tail -20
```

Expected: all passing.

- [ ] **Step 6: Commit**

```bash
git add app/models/transaction.py tests/test_api.py
git commit -m "feat: add self_transfer to Label enum"
```

---

### Task 2: Frontend — TAGS entry + cycle + select + badge

**Files:**
- Modify: `static/src/data.jsx:22-28` — add `self_transfer` to TAGS
- Modify: `static/src/inbox-detail.jsx:170-178` — handle `self_transfer` in reclassify tag derivation
- Modify: `static/src/inbox-detail.jsx:277-282` — add to cycle order
- Modify: `static/src/inbox-detail.jsx:383-387` — add to label select dropdown

- [ ] **Step 1: Add `self_transfer` to TAGS in `static/src/data.jsx`**

The current TAGS object (lines 22–28):
```javascript
const TAGS = {
  expense:      { label: "Expense",      dot: "var(--neg)"    },
  income:       { label: "Income",       dot: "var(--pos)"    },
  subscription: { label: "Subscription", dot: "var(--accent)" },
  transfer:     { label: "Transfer",     dot: "var(--ink-3)"  },
  ignore:       { label: "Ignored",     dot: "var(--ink-4)"  },
};
```

Replace with:
```javascript
const TAGS = {
  expense:       { label: "Expense",       dot: "var(--neg)"    },
  income:        { label: "Income",        dot: "var(--pos)"    },
  subscription:  { label: "Subscription",  dot: "var(--accent)" },
  transfer:      { label: "Transfer",      dot: "var(--ink-3)"  },
  self_transfer: { label: "Self Transfer", dot: "var(--ink-3)"  },
  ignore:        { label: "Ignored",       dot: "var(--ink-4)"  },
};
```

- [ ] **Step 2: Handle `self_transfer` in reclassify tag derivation (`inbox-detail.jsx` line 170–178)**

Current code:
```javascript
const isIgnore = draft.label === "ignore";
const isIncome = draft.label === "income";
const cat = normCat(draft.category, isIncome);
const isSub = cat === "sub";
onUpdate({
  _skipApi: true,
  amount:   isIgnore ? 0 : isIncome ? (draft.amount || 0) : -(draft.amount || 0),
  cat,
  tag:      isIgnore ? "ignore" : isIncome ? "income" : isSub ? "subscription" : "expense",
  conf:     draft.confidence ?? tx.conf,
  merchant: draft.merchant || tx.merchant,
});
```

Replace with:
```javascript
const isIgnore = draft.label === "ignore";
const isIncome = draft.label === "income";
const isSelfTransfer = draft.label === "self_transfer";
const cat = normCat(draft.category, isIncome);
const isSub = cat === "sub";
onUpdate({
  _skipApi: true,
  amount:   isIgnore || isSelfTransfer ? 0 : isIncome ? (draft.amount || 0) : -(draft.amount || 0),
  cat,
  tag:      isIgnore ? "ignore" : isSelfTransfer ? "self_transfer" : isIncome ? "income" : isSub ? "subscription" : "expense",
  conf:     draft.confidence ?? tx.conf,
  merchant: draft.merchant || tx.merchant,
});
```

Note: `self_transfer` amount is set to `0` (like `ignore`) since it's neither a debit nor a credit in the user's net flow.

- [ ] **Step 3: Add `self_transfer` to the cycle button (`inbox-detail.jsx` lines 277–282)**

Current code:
```javascript
const order = ["expense", "income", "ignore"];
const idx = order.indexOf(tx.tag);
onUpdate({ tag: order[(idx + 1) % order.length] });
```

Replace with:
```javascript
const order = ["expense", "income", "self_transfer", "ignore"];
const idx = order.indexOf(tx.tag);
onUpdate({ tag: order[(idx + 1) % order.length] });
```

Also update the tooltip on the same `<span>` element:
```
title="Click to cycle: expense → income → self transfer → ignore"
```

- [ ] **Step 4: Add `self_transfer` to the label select dropdown (`inbox-detail.jsx` line 384–386)**

Current options:
```jsx
<option value="expense">Expense</option>
<option value="income">Income</option>
<option value="ignore">Ignore</option>
```

Replace with:
```jsx
<option value="expense">Expense</option>
<option value="income">Income</option>
<option value="self_transfer">Self Transfer</option>
<option value="ignore">Ignore</option>
```

- [ ] **Step 5: Build frontend**

```bash
cd /Users/amansaini/GexpenseTracker && npm run build 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 6: Commit — ONLY the two source files and compiled output**

```bash
git add static/src/data.jsx static/src/inbox-detail.jsx static/dist/budgets.js
git commit -m "feat: add Self Transfer label to inbox UI (cycle, select, badge)"
```

**IMPORTANT:** Do NOT `git add` any other files — unrelated changes exist in the working tree from other agents.

---

## Self-Review

**Spec coverage:**
- ✅ `self_transfer` added to `Label` StrEnum → Task 1
- ✅ No stats/budget changes needed (already filter expense/income) → confirmed in architecture
- ✅ Cycle button updated → Task 2 Step 3
- ✅ Label select updated → Task 2 Step 4
- ✅ Badge/tag display → Task 2 Step 1 (TAGS entry) + Step 2 (tag derivation)

**Placeholder scan:** None found.

**Type consistency:**
- `"self_transfer"` string used consistently: Label enum value, TAGS key, cycle array, select option value, tag derivation → all match ✓
- `tag → apiPatch.label` mapping in `inbox.jsx` line 651 means `tag: "self_transfer"` → `label: "self_transfer"` in DB ✓
- `String(20)` column: `"self_transfer"` is 13 chars, fits ✓
