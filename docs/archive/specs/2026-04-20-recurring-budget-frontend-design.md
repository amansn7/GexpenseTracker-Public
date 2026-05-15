# Recurring + Budget Frontend — Design

## Goal

Build frontend for the already-complete Recurring and Budget backend APIs. Extend the `RecurringExpense` model with extra fields shown in the Notion Money Flow template.

## Architecture

The app uses React with browser globals (no build step), Babel standalone transform, and semantic CSS tokens. New views follow the existing pattern: a `.jsx` file exports a component assigned to `window`, wired into `app.jsx` + `shell.jsx`.

Backend APIs already exist: `GET/POST/PATCH/DELETE /api/recurring` and `GET/POST/PATCH/DELETE /api/budgets`. Both need no new logic — only the model extension and frontend.

---

## Section 1: Recurring

### Model extension (Alembic migration)

Add to `recurring_expenses` table:
- `next_payment_date DATE` — nullable
- `source_account VARCHAR(255)` — nullable (e.g. "Checking", "Savings")
- `target_account VARCHAR(255)` — nullable (for transfers)
- `type VARCHAR(30)` — nullable, values: `expense | income | transfer | debt_payment`

Extend frequency validation to accept `bi-weekly` in addition to `monthly | weekly | yearly`. Update monthly_total calculation in `list_recurring`: bi-weekly → `amount * 2.17`.

Update `RecurringBody` pydantic model in `app/api/recurring.py` and `_fmt()` serializer to include new fields.

### Frontend: `static/src/recurring.jsx`

**RecurringView** component:

- **Topbar**: title "Recurring", subtitle showing count + monthly total (already computed by API)
- **Filter tabs**: `Active` (default) | `All` — client-side filter on `r.active`
- **Add button**: opens add/edit modal
- **Table** (styled like inbox rows, not a raw `<table>`):
  - Columns: Name, Type badge, Amount (mono), Frequency badge, Next Payment Date, Source Account, Target Account, Category swatch, Active toggle, Edit/Delete actions
  - Type badge colors: expense=`--neg-soft/--neg`, income=`--pos-soft/--pos`, transfer=`--cat-travel`/ink, debt_payment=`--cat-sub`/ink
  - Frequency badge: small pill (monthly=gray, weekly=blue, bi-weekly=teal, yearly=purple)
  - Active toggle: clicking sends `PATCH /api/recurring/{id}` with `active: !current`
  - Empty state: "No recurring items yet. Add one to track subscriptions, rent, and regular payments."

**Add/Edit modal**:
- Fields: Name (text, required), Amount (number), Type (select), Frequency (select: monthly/weekly/bi-weekly/yearly), Next Payment Date (date input), Source Account (text), Target Account (text), Category (select from CATEGORIES), Notes (textarea), Active (checkbox)
- Save → POST (create) or PATCH (edit)
- Delete → DELETE with confirm dialog

### Sidebar nav

Add "Recurring" nav item under "Views" section in `shell.jsx`, between Money Flow and Dashboard. Icon: `"repeat"` (new icon needed in `icons.jsx`).

---

## Section 2: Budget in Dashboard

### Frontend changes to `static/src/dashboard.jsx`

Add a "Budget" section band **below** the existing "Where money went" + "Top merchants" sections.

**Budget section band**:
- Header: "Budget · this month" title + "Manage" button (opens modal)
- Body: card grid (same `catGrid` style as category cards)
- Each budget card shows:
  - Category color swatch + label
  - `₹{spent} / ₹{limit}` in mono
  - Progress bar: green `< 80%`, amber `80–100%`, red `> 100%`
  - `{pct}% used` caption
  - Delete (×) button top-right
- Empty state: "No budgets set. Click Manage to add limits."

**Manage modal**:
- List of existing budgets with inline edit for `monthly_limit`
- "Add category limit" row: category select + amount input + Add button
- Changes call POST/PATCH/DELETE `/api/budgets`

### Data loading in `app.jsx`

Add `budgets` state, load via `GET /api/budgets` alongside other initial loads. Pass as prop to `DashboardView`.

---

## Data flow

```
app.jsx: loadData() → GET /api/budgets → budgets state → DashboardView prop
app.jsx: (new) → GET /api/recurring → recurring state → RecurringView prop

RecurringView: local state for modal open/form fields
RecurringView: PATCH /api/recurring/{id} for active toggle (optimistic)

DashboardView: renders BudgetSection with budgets prop
BudgetSection: modal for add/edit/delete calls API, refetches on success
```

---

## Error handling

- API errors show inline error text in modal, not toast (user can retry)
- Active toggle failure: revert optimistic update
- Budget over-limit: visual only (red bar), no block on data entry

---

## Testing

- `tests/test_recurring_extended.py`: test PATCH with new fields, test bi-weekly frequency accepted, test `next_payment_date` serialized correctly
- `tests/test_budgets_existing.py`: verify `pct` + `over_budget` flags calculate correctly with real spend data

---

## Files to modify

| File | Change |
|---|---|
| `app/models.py` | Add 4 columns + bi-weekly to RecurringExpense |
| `app/api/recurring.py` | Update RecurringBody, _fmt, frequency validation |
| `alembic/versions/XXXX_recurring_extra_fields.py` | Migration |
| `static/src/recurring.jsx` | New file — RecurringView component |
| `static/src/icons.jsx` | Add `repeat` icon |
| `static/src/shell.jsx` | Add Recurring nav item |
| `static/src/app.jsx` | Load budgets + recurring data, add RecurringView route |
| `static/src/dashboard.jsx` | Add Budget section band |
| `templates/index.html` | Add recurring.jsx script tag, bump dashboard.jsx v= |
