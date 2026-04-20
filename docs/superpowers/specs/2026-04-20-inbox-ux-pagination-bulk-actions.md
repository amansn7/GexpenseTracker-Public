# Design: Inbox UX — Read/Flag Persistence, Pagination, Bulk Actions

Date: 2026-04-20
Status: Approved

---

## Problem

1. `read` and `flag` are derived fields in `data.jsx` — `read = status in ["confirmed","corrected"]`, `flag = conf < 0.7 || status === "needs_review"`. Both reset on every page load; no user action persists them.
2. `GET /api/transactions` fetches all rows with no limit — slow as data grows.
3. No bulk actions on selected rows (mark read/unread, flag/unflag, reclassify, delete).

---

## Backend

### 1. New columns on `Transaction`

```python
read:    Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, server_default="false")
flagged: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, server_default="false")
```

Alembic migration adds both columns with `server_default="false"`.

### 2. `PATCH /api/transactions/{id}` — extend existing endpoint

Add `read` and `flagged` to the patch payload (both optional). Only update fields that are explicitly present in the request body.

```python
class TransactionPatch(BaseModel):
    label: Optional[str] = None
    amount: Optional[float] = None
    merchant: Optional[str] = None
    category: Optional[str] = None
    read: Optional[bool] = None
    flagged: Optional[bool] = None
```

### 3. `POST /api/transactions/bulk` — new endpoint

```python
class BulkAction(BaseModel):
    ids: List[str]
    action: Literal["mark_read", "mark_unread", "flag", "unflag", "delete"]
```

Action semantics:
- `mark_read` → set `txn.read = True` for all matched transactions
- `mark_unread` → set `txn.read = False`
- `flag` → set `txn.flagged = True`
- `unflag` → set `txn.flagged = False`
- `delete` → for each transaction: delete its `Email` row if `email_id` is set, then set `txn.email_id = NULL`

Returns `{ "updated": N }`.

### 4. `GET /api/transactions` — add pagination

Add `offset: int = 0` and `limit: int = 50` query params.

Response shape changes from `List[...]` to:

```json
{
  "items": [...],
  "total": 342,
  "offset": 0,
  "limit": 50
}
```

`total` is a separate `COUNT(*)` query (same filters, no offset/limit).

`GET /api/transactions` response items must include `read` and `flagged` fields.

---

## Frontend

### `data.jsx` — `transformTransaction`

Replace derived fields:

```javascript
read:  t.read ?? false,
flag:  t.flagged ?? false,
```

Remove the `status`/`confidence` derivation for these two fields.

### `app.jsx` — paginated load

`loadData` fetches `/api/transactions?offset=0&limit=50`, stores `items` into `transactions` and `total` into a new `totalTransactions` state.

Add `loadMore` function: fetches next page (`offset = transactions.length`), appends items to `transactions`.

Sidebar unread count (`transactions.filter(t => !t.read).length`) works automatically once `read` is real.

### `inbox.jsx` — three additions

**1. Auto-mark read on open**

When detail panel opens for a row, immediately:
- Update local state: `setTransactions(txs => txs.map(t => t.id === id ? { ...t, read: true } : t))`
- Fire `PATCH /api/transactions/{id}` with `{ read: true }` in background (no await, no spinner)

**2. Bulk action toolbar**

Appears when `selectedIds.size > 0`. Positioned in the sticky toolbar above the list.

Buttons and their actions:

| Button | Bulk action |
|--------|-------------|
| Mark Read | `mark_read` |
| Mark Unread | `mark_unread` |
| Flag | `flag` |
| Unflag | `unflag` |
| Reclassify | `POST /emails/reclassify` with `email_ids` (existing endpoint) |
| Delete | `delete` — confirm dialog before firing |

After each bulk action: update local state optimistically, fire `POST /api/transactions/bulk`, clear selection.

Delete confirmation: simple `window.confirm("Delete N email(s)? Classification data is kept.")` before firing.

**3. Infinite scroll**

Attach `onScroll` to the list div. When `scrollTop + clientHeight >= scrollHeight - 100px` and `transactions.length < totalTransactions` and not already loading: call `loadMore`.

Show a small centered spinner row at the bottom of the list while `loadingMore` is true.

---

## Testing

- Unit: `test_bulk_actions.py` — test each action (`mark_read`, `mark_unread`, `flag`, `unflag`, `delete`) with mocked DB
- Unit: `test_transactions_pagination.py` — assert `GET /api/transactions?offset=0&limit=2` returns correct shape, `total` is accurate, `items` length ≤ `limit`
- For `delete`: assert Email row is removed, Transaction row survives with `email_id = NULL`

---

## Non-goals

- Undo for delete (out of scope)
- Cursor-based pagination (offset/limit sufficient at this scale)
- Keyboard shortcuts for bulk actions
