# Transactions Page Redesign

**Date:** 2026-04-12  
**Status:** Approved

## Problem

1. **Income invisible** — income transactions don't appear (stuck in `needs_review`, never confirmed; no easy way to relabel)
2. **Edit is broken** — `openCorrect()` uses browser `prompt()` dialogs, only patches `label` + `category`, ignores `amount` and `user_notes`
3. **Email preview missing** — "Email" link opens Gmail in a new tab; the email body is not surfaced inline
4. **Table is cluttered** — Source and Status columns take space without adding scannable value

## Decisions

| Topic | Decision |
|-------|----------|
| Edit fields | label, amount, category, user_notes (backend already supports all four) |
| Merchant / date editing | Out of scope — no backend changes needed |
| Email preview trigger | 3-second hover on any table row |
| Body storage | Fetch full `text/plain` body at sync time (path B), store in new `body_text` column |
| Table style | Refined table with left-border label coding (not cards) |

---

## Backend Changes

### 1. Alembic migration `0004_email_body_text.py`

```python
op.add_column('emails', sa.Column('body_text', sa.Text(), nullable=True))
```

### 2. `app/models.py` — Email model

Add field:
```python
body_text: Mapped[Optional[str]] = mapped_column(Text)
```

### 3. `app/gmail/client.py` — fetch full body at sync

During message fetch, decode the `text/plain` MIME part from the message payload.  
Logic:
- Walk `payload.parts` looking for `mimeType == "text/plain"`
- Base64-url decode the `data` field
- Strip excessive whitespace; cap at 4000 chars to keep DB rows reasonable
- Fall back to `msg.get("snippet", "")` if no plain-text part found

The returned message dict gains `body_text` key; `Email(**msg)` stores it automatically.

### 4. `app/api/transactions.py` — detail endpoint

`GET /transactions/{id}` already calls `_fmt` then adds extras. Add:
```python
result["email"]["body_text"] = e.body_text
```

List endpoint (`GET /transactions`) stays lean — no `body_text` in `_fmt`.

---

## Frontend Changes

### 5. `templates/transactions.html` — refined table

**Column layout:** Date · Merchant · Category · Amount · Label · ✎  
(Source column removed; Status communicated via left border color)

**Left border color per label:**
| Label | Border color |
|-------|-------------|
| expense | `#e07070` (red) |
| income | `#5db87d` (green) |
| ignore | `#2a2a3a` (dark grey) |
| needs_review | `#7c83fd` (purple) |

**Amount:** right-aligned; color matches label (red for expense, green for income, grey for ignore/review)

**Edit button:** `✎` icon button (`btn-ghost`, small), replaces "Edit" text button. Calls `openEditModal(this)` where `this` is the button element.

**Filter bar:** add category `<select>` (maps to existing `?category=` API param); move transaction count to right side of filter bar inline.

**Row data** stored in `data-*` attributes on the `<tr>` — avoids inline string interpolation bugs with special characters in `user_notes`:
```html
<tr data-id="${t.id}" data-label="${t.label}" data-category="${t.category||''}"
    data-amount="${t.amount??''}" data-notes="${_esc(t.user_notes||'')}">
```
`openEditModal(btn)` reads values via `btn.closest('tr').dataset`.

### 6. `static/app.js` — edit modal

Replace `openCorrect()` with `openEditModal(id, label, category, amount, notes)`.

**Modal DOM:** injected once into `<body>` on page load, reused for all rows.

**Fields:**
- **Label** — 3-button toggle (Expense / Income / Ignore). Active state styled per label color.
- **Amount (₹)** — number input, pre-filled. Hidden (display:none) when label = "ignore".
- **Category** — chip picker (same 12 categories as review page) + custom text input.
- **Notes** — textarea, pre-filled from `user_notes`.

**Behavior:**
- Label toggle switching to "Ignore" hides amount field; switching to expense/income shows it.
- Save: single `PATCH /api/transactions/{id}` with `{label, amount, category, user_notes}`.
- On success: update the table row in-place (label badge, amount cell, border color) — no page reload.
- Dismiss: Cancel button, backdrop click, or Escape key.

### 7. `static/app.js` — hover email preview

**Trigger:** `mouseenter` on a `<tr>` starts a 3-second `setTimeout`. `mouseleave` cancels it.

**On fire:**
1. Call `GET /api/transactions/{id}` (detail endpoint).
2. Build tooltip HTML with: subject, sender + date, `body_text` (or `body_snippet` fallback), Gmail link.
3. Position tooltip: fixed, near the hovered row (use `getBoundingClientRect()` + scroll offset). Clamp to viewport edges.
4. Append to `<body>`.

**Dismiss:** `mouseleave` from the row starts a short 200ms grace timer. If the cursor enters the tooltip before the timer fires, the timer is cancelled and the tooltip stays visible. `mouseleave` from the tooltip removes it. `Escape` keydown also removes it.

**Tooltip structure:**
```
┌─ Subject line ─────────────────────── Gmail ↗ ─┐
│ sender@domain.com · Apr 10, 2026               │
├────────────────────────────────────────────────┤
│ Body text (scrollable, max-height 160px)       │
│ ...                                            │
└────────────────────────────────────────────────┘
```

Body text display: strip any residual HTML tags client-side before rendering. Max-height 160px with `overflow-y: auto`.

---

## What Is Not Changing

- Review page (`templates/review.html`) — untouched
- Transaction PATCH model — no new fields
- Classifier, sync pipeline, rules — untouched
- Pagination — not added (out of scope)

---

## Files Changed

| File | Change |
|------|--------|
| `alembic/versions/0004_email_body_text.py` | New migration |
| `app/models.py` | Add `body_text` to `Email` |
| `app/gmail/client.py` | Decode + store `body_text` |
| `app/api/transactions.py` | Expose `body_text` in detail endpoint |
| `templates/transactions.html` | Refined table, new column layout, filter bar |
| `static/app.js` | Replace `openCorrect` with modal + hover preview |
