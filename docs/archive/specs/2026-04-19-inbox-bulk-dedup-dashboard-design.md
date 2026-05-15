# Design: Bulk Select, Duplicate Detection, Dashboard Range Slider

Date: 2026-04-19
Status: Approved

---

## Feature 1 — Inbox Bulk Select + Actions

### Goal
Allow multi-select of inbox transactions and apply batch actions: mark read, mark unread, LLM re-classify, manual re-classify.

### State Model (frontend)
- `selectedIds: Set<string>` in `InboxView`
- `selectMode: bool` — false by default; enters true on first checkbox click
- In select mode: row grid first column shows checkbox instead of unread dot
- Header row shows select-all checkbox + `N selected` count badge

### Row Behavior
- Normal mode: row click → open detail panel (unchanged)
- Select mode: row click → toggle selection; Esc or clicking outside list exits select mode
- Checkbox click always toggles selection without opening detail panel

### Bulk Action Bar
Visible only when `selectedIds.size > 0`. Fixed strip at bottom of inbox.

Actions:
- **Mark Read** — PATCH status=confirmed for each selected
- **Mark Unread** — PATCH status=auto for each selected
- **Re-classify (LLM)** — fires `POST /transactions/{id}/reclassify` sequentially; shows `3/12 done` progress; optimistic-updates each row on completion
- **Re-classify (Manual)** — modal with label dropdown + category dropdown; PATCH all selected on confirm
- **✕ Clear** — exits select mode, clears selection

### API
No new endpoints. Reuses:
- `PATCH /transactions/{id}` for read/unread/manual reclassify
- `POST /transactions/{id}/reclassify` for LLM reclassify

Sequential calls are acceptable for typical inbox sizes (<100 items). No bulk endpoint needed for MVP.

---

## Feature 2 — Duplicate Expense Detection Service

### Goal
Detect Indian expense duplicate pairs (e.g. Swiggy email + HDFC Credit Card email for same transaction), auto-resolve known pairs, surface unknown pairs for user review, and feed decisions back into a learning loop.

### New DB Models

**`DuplicatePair`**
| Column | Type | Notes |
|---|---|---|
| id | String(36) PK | UUID |
| primary_tx_id | FK → transactions.id | Transaction to keep |
| duplicate_tx_id | FK → transactions.id | Transaction to suppress |
| status | String(20) | `pending \| confirmed \| dismissed \| auto_resolved` |
| confidence | Float | Detection confidence |
| rule_source | String(20) | `amount_date \| domain_pair \| auto` |
| created_at | DateTime | |
| resolved_at | DateTime | Nullable |

**`DomainPairRule`**
| Column | Type | Notes |
|---|---|---|
| id | String(36) PK | UUID |
| domain_a | String(255) | Alphabetically first of the pair |
| domain_b | String(255) | Alphabetically second |
| confirmed_count | Integer | User confirmed as duplicate |
| dismissed_count | Integer | User dismissed |
| confidence | Float | confirmed / (confirmed + dismissed) |
| auto_resolve | Boolean | True when confidence > 0.85 and confirmed_count ≥ 3 |
| created_at | DateTime | |

Domain pair stored sorted (domain_a < domain_b alphabetically) so `(hdfc, swiggy)` and `(swiggy, hdfc)` map to same row.

### Detection Service (`app/dedup/service.py`)

Runs immediately after `classify_email` in the sync pipeline (`app/sync.py`).

Algorithm:
1. Load all expense transactions within ±1 day of new transaction with same amount
2. For each candidate pair, lookup `DomainPairRule(domain_a, domain_b)`:
   - **Rule exists + `auto_resolve=true`** → create `DuplicatePair(status=auto_resolved)`, set duplicate transaction `label=ignore`, store `duplicate_of` reference
   - **Rule exists + `confidence > 0.6`** → create `DuplicatePair(status=pending)` with pre-selected resolution suggestion
   - **No rule, exact amount+date match** → create `DuplicatePair(status=pending)`, no suggestion

### Review UI
- "Duplicates" badge on inbox filter bar showing count of pending pairs
- Clicking → filtered view showing pending pairs grouped as side-by-side cards
- Each card: "Keep this" button; dismiss button = "Not a duplicate"
- On resolve: `PATCH /duplicates/{pair_id}` with `{action: confirmed | dismissed, primary_tx_id}`

### Learning Loop
On every user confirm or dismiss:
1. Upsert `DomainPairRule(domain_a, domain_b)` — increment `confirmed_count` or `dismissed_count`
2. Recompute `confidence = confirmed_count / (confirmed_count + dismissed_count)`
3. If `confidence > 0.85` and `confirmed_count ≥ 3` → set `auto_resolve = true`

Future auto-resolutions for this domain pair happen silently (no user prompt).

### New API Endpoints
- `GET /duplicates?status=pending` — list pending pairs with both transactions expanded
- `PATCH /duplicates/{id}` — resolve: `{action: confirmed | dismissed, primary_tx_id: str}`
- Detection runs internally; no public trigger endpoint

---

## Feature 3 — Dashboard Date Range Slider

### Goal
Replace fixed `period` presets (1m/3m/6m/1y) with a flexible range control: quick presets + dual-handle date range slider. All stats charts update to the selected range.

### API Changes (`app/api/stats.py`)

Add optional `date_from: Optional[date]` and `date_to: Optional[date]` to all 5 stat endpoints:
- `GET /stats/summary`
- `GET /stats/category-breakdown`
- `GET /stats/monthly-trend`
- `GET /stats/top-merchants`
- `GET /stats/income-vs-expense`

Resolution order:
1. If `date_from` and `date_to` provided → use directly, ignore `period`
2. Else → existing `_period_start(period)` logic unchanged

**No breaking changes.** Existing `?period=1m` calls continue to work. Axis Bank income attribution logic (`_effective_month`) unchanged.

### Frontend Range Control

**Presets row:** `7d | 30d | 90d | 1y` — clicking sets `date_from`/`date_to` state and highlights active preset.

**Dual-handle slider:**
- Timeline spans from earliest transaction date to today
- Left handle = `date_from`, right handle = `date_to`
- Dragging either handle deselects active preset, fires debounced API refetch (300ms debounce)
- Selecting a preset snaps both handles to match

**State:** `rangeFrom: date, rangeTo: date` lifted to stats view parent component. All 5 stat fetches pass these values as `date_from`/`date_to` query params.

### No New DB Models
Pure API param extension + frontend state. No migrations beyond Feature 2.

---

## Implementation Order

1. **Feature 2 DB migrations** — `DuplicatePair` + `DomainPairRule` tables (Alembic)
2. **Feature 2 service + API** — detection service, `/duplicates` endpoints
3. **Feature 1 frontend** — bulk select UI + action bar
4. **Feature 2 UI** — duplicates filter view + resolution cards
5. **Feature 3 API** — add `date_from`/`date_to` params to stat endpoints
6. **Feature 3 frontend** — preset buttons + dual-handle slider
