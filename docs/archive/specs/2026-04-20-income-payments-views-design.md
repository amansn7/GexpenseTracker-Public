# Income Enhanced View + Payments & Transfers Filter — Design

## Goal

Enhance the existing Income inbox filter with a structured table layout (Paid checkbox, grouping by month). Add a "Payments" sidebar filter showing bill/transfer-category transactions.

## Architecture

Both features are view-only changes — no new backend models or endpoints. They work entirely from existing `GET /api/transactions` data already loaded in `app.jsx`. Changes are isolated to `inbox.jsx` and `shell.jsx`.

---

## Section 1: Income Enhanced View

### Trigger

When `filter === "income"` is active in `InboxView`, render a table layout instead of the standard email-row list.

### Table layout

Columns: Paid · Name/Merchant · Amount · Date · Category · Month

**Paid column**: checkbox. Checked = `status === "confirmed"`. Clicking sends `PATCH /api/transactions/{id}` with `{"status": "confirmed"}` (check) or `{"status": "needs_review"}` (uncheck). Optimistic update.

**Grouping**: rows grouped by calendar month (derived from `txn_date`). Group header shows month label + income total for that month (e.g. "April 2026 · ₹3,200").

**Amount**: green, mono, `+₹{amount}` format.

**Category**: colored badge using `CATEGORIES` map.

**Month**: text label "April 2026" (same as group, kept for scan-ability).

### Empty state

"No income transactions found for this range."

### No new API

Uses `transactions` prop already passed to `InboxView`. Filter: `t.amount > 0` (already the "income" filter logic).

---

## Section 2: Payments & Transfers Filter

### Sidebar

Add "Payments" nav item under Filters section in `shell.jsx`. Icon: `"arrow-swap"` (new icon in `icons.jsx`). Sets `filter = "payments"`.

Count badge: transactions where `category` is in `["rent", "utilities", "subscriptions"]`.

### InboxView filter logic

When `filter === "payments"`:
```js
transactions.filter(t =>
  t.amount < 0 &&
  ["rent", "util", "sub"].includes(t.cat)
)
```

Uses the standard inbox row layout — no special table view needed. Payments look identical to regular expense rows.

### counts update in `app.jsx`

Add to `counts`:
```js
payments: transactions.filter(t => t.amount < 0 && ["rent","util","sub"].includes(t.cat)).length
```

---

## Data flow

```
app.jsx → transactions prop → InboxView
InboxView: filter === "income"  → IncomeTableView (new sub-component in inbox.jsx)
InboxView: filter === "payments" → standard row list, filtered by category
IncomeTableView: PATCH /api/transactions/{id} for Paid toggle (optimistic)
```

---

## Error handling

- Paid toggle failure: revert optimistic update, show inline error on that row

---

## Testing

- No new backend tests needed (no new endpoints)
- Filter logic is pure JS: test via existing transaction fixture data

---

## Files to modify

| File | Change |
|---|---|
| `static/src/inbox.jsx` | Add IncomeTableView sub-component, branch on filter==="income" |
| `static/src/shell.jsx` | Add Payments nav item + count |
| `static/src/icons.jsx` | Add `arrow-swap` icon |
| `static/src/app.jsx` | Add payments count |
