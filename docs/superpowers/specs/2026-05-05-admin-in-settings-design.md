# Admin-in-Settings + Email Date-Range Fetch — Design Spec

## Summary

Two related changes:
1. **Admin tab in Settings** — move the Admin panel from a standalone sidebar nav item into a dedicated owner-only tab inside the Settings page, styled as a dark terminal panel.
2. **Email date-range fetch** — new UI control (and backing API endpoint) that lets the owner pull emails from Gmail for a specific date range, then backfill any missing email bodies in that range.

---

## 1. Admin Tab in Settings

### Tab placement

The Settings page (`account.jsx`) already has tab navigation (Profile, Preferences, AI, Categories, Access). A new **⚡ Admin** tab is appended after a visual separator (`|`), but only rendered when `account.role === "owner"`.

Tab appearance:
- Dashed red border: `border: 1.5px dashed #ef4444`
- Red text + faint red background
- No active-fill style — the dashed border itself signals "different territory"

The existing `AdminView` nav item is removed from `shell.jsx`. The `"admin"` view case in the router is also removed.

### Panel appearance

When the Admin tab is active, the panel renders with a dark terminal aesthetic:
- Background: `#0d0d0d`
- Font: `'Geist Mono', monospace`
- Section headers: `color: #10b981` (green), all-caps, `▶` prefix
- Section borders: `1px solid` dark gray (`#1f1f1f`) or faint green (`rgba(16,185,129,0.25)`) for the primary section
- Comment header at top: `// ADMIN — OWNER ONLY` in `#ef4444`

### Sections (in order)

1. **FETCH EMAIL RANGE** ← new, see §2
2. **SYNC** — trigger sync button + backfill bodies button + last-synced timestamp
3. **FETCH PREVIEW** — existing FetchPreviewSection, restyled
4. **CLASSIFY TEST** — existing ClassifyTestSection, restyled
5. **LLM STATUS** — existing LLMStatusSection, restyled
6. **ALERTS** — existing AlertsSection, restyled

All existing section logic is preserved; only visual styles change to match the terminal theme.

### Navigation cleanup

- `shell.jsx`: remove `<NavItem icon="gear" label="Admin" ...>` (line ~102)
- `app.jsx` line 280: remove `{view === "admin" && <AdminView />}` case
- `admin.jsx`: stop exporting `AdminView`; instead export individual section components via `Object.assign(window, { SyncSection, FetchPreviewSection, ClassifyTestSection, LLMStatusSection, AlertsSection, FetchRangeSection })`. The codebase uses window globals (no ES module imports) — all JSX files assign to `window` and are loaded as `<script>` tags in `base.html`.
- `account.jsx`: consume the window-global section components inside the new Admin tab render.

---

## 2. Email Date-Range Fetch

### User flow

1. Owner opens Settings → ⚡ Admin tab
2. Sees "FETCH EMAIL RANGE" section at top
3. Enters **From** date and **To** date (HTML date inputs, styled dark)
4. Clicks **FETCH + BACKFILL**
5. Button shows loading state; result displays inline: `fetched: 42 · backfilled: 17 · errors: 0`

### Backend

**New endpoint:** `POST /sync/fetch-range`

```
Body: { after_date: "YYYY-MM-DD", before_date: "YYYY-MM-DD" }
Response: { fetched: int, inserted: int, backfilled: int, errors: int }
```

**Implementation steps:**

1. Extend `fetch_new_messages` in `app/gmail/client.py` to accept `after_date: str | None` and `before_date: str | None`. When provided, build query `after:YYYY/MM/DD before:YYYY/MM/DD` (Gmail search syntax) instead of `newer_than:90d`. History-ID path is bypassed (always uses list API).

2. Add `run_sync_range(user_id, after_date, before_date)` in `app/sync.py` — mirrors `_run_sync_inner` but calls `fetch_new_messages` with date params and skips history-ID update at the end (date-range fetch must not overwrite `last_history_id`).

3. Add endpoint in `app/api/sync.py`:
   ```python
   class FetchRangeBody(BaseModel):
       after_date: date
       before_date: date

   @router.post("/sync/fetch-range")
   async def fetch_range(
       body: FetchRangeBody,
       current_user: User = Depends(get_current_user),
       db: AsyncSession = Depends(get_db),
   ):
       if current_user.role not in ("owner",):
           raise HTTPException(403, "Owner only")
       result = await run_sync_range(
           user_id=current_user.id,
           after_date=body.after_date.strftime("%Y/%m/%d"),
           before_date=body.before_date.strftime("%Y/%m/%d"),
       )
       return result
   ```

4. `run_sync_range` returns `{ fetched, inserted, backfilled, errors }`. After inserting new emails it runs the same backfill logic as `backfill_bodies` but scoped to the date range's newly inserted email IDs.

### Constraints

- Does **not** update `last_history_id` or `last_synced_at` on SyncState — it's a one-off backfill, not a state-advancing sync.
- Owner-only at API level (403 for non-owners).
- `after_date` must be before `before_date`; validated by Pydantic (add `@model_validator`).
- Max range: 365 days (enforced server-side to avoid runaway Gmail API calls).

---

## Files Changed

| File | Change |
|------|--------|
| `static/src/account.jsx` | Add Admin tab (owner-only), render terminal-styled admin sections from window globals |
| `static/src/admin.jsx` | Export individual section components via window instead of `AdminView`; add new `FetchRangeSection` |
| `static/src/shell.jsx` | Remove Admin nav item |
| `static/src/app.jsx` | Remove `view === "admin"` routing case |
| `app/api/sync.py` | Add `POST /sync/fetch-range` endpoint |
| `app/sync.py` | Add `run_sync_range()` function |
| `app/gmail/client.py` | Extend `fetch_new_messages` with optional `after_date`/`before_date` params |
| `tests/test_sync.py` | Add tests for fetch-range endpoint and `run_sync_range` |

---

## Out of Scope

- Pagination or progress streaming for the date-range fetch (show result after completion)
- Non-owner access to admin tab
- Changing any existing API response schemas
