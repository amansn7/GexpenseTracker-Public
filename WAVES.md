# MoneyFlow — Wave Implementation Plan

> Generated from comprehensive audit findings. All waves are sequenced by priority and dependency.

---

## Wave 1: Financial Integrity
**Status**: ✅ Complete  
**Dependencies**: None  
**Risk**: Low (data migration needed)

### 1.1 Transaction Type Enum
- [x] Add `TransactionType` enum: `purchase | cc_payment | transfer | investment | income`
- [x] Add `transaction_type` column to `Transaction` model (nullable, backfilled)
- [x] Alembic migration `0026_add_transaction_type.py`
- [x] Backfill logic: `label=expense` → `purchase`, `label=ignore+CC Payment` → `cc_payment`, `label=income` → `income`

### 1.2 CC Payment Analytics
- [x] Stats API: `total_expenses` filters on `transaction_type='purchase'` (excludes CC payments)
- [x] Stats API: Add `total_cc_payments` field to summary response
- [x] Frontend: `data.jsx` category mapping includes `cc_payment`
- [x] Frontend: `dashboard.jsx` displays CC payments separately
- [x] Frontend: Sankey diagram (`flow.jsx`) shows CC payments as cash outflow
- [x] Frontend: Dashboard "Remaining" calculation accounts for CC payments

### 1.3 Investment Classification
- [x] LLM prompt updated: investments classified as `type=investment` (not expense)
- [x] Classifier: sets `transaction_type='investment'` for investment results
- [x] Stats API: Add `total_investments` field to summary response
- [x] Frontend: `data.jsx` category mapping includes `investment`
- [x] Frontend: Separate "Investments & CC" panel in dashboard
- [x] Frontend: Net worth tracking UI (via `/api/stats/health`)

### 1.4 Reconciliation Endpoint
- [x] `/api/reconciliation/health` — flags discrepancies > threshold
- [x] `/api/reconciliation/monthly` — monthly balance validation
- [x] Monthly CC statement reconciliation (sum CC purchases vs statement total)
- [ ] Bank balance tracking with manual reconciliation prompts

---

## Wave 2: Security Hardening
**Status**: ✅ Complete  
**Dependencies**: None  
**Risk**: Medium (security changes)

### 2.1 Fernet Enforcement
- [x] `crypto.py`: Fails if `FERNET_KEY` missing
- [x] `main.py`: Startup validation for Fernet key
- [x] Removed plaintext fallback

### 2.2 CSRF Protection
- [x] `app/csrf.py`: Double-submit cookie pattern
- [x] `AuthMiddleware`: Validates CSRF token on POST/PUT/PATCH/DELETE
- [x] `/api/auth/csrf-token` endpoint
- [x] Frontend: CSRF token attached to all state-changing requests

### 2.3 Session Token Rotation
- [x] `Session` model: Added `last_rotated_at` column
- [x] Alembic migration `0027_add_session_rotation.py`
- [x] `auth_deps.py`: Rotation logic (every 7 days)
- [x] Old tokens invalidated on rotation

### 2.4 Input Validation & Rate Limiting
- [x] `app/rate_limiter.py`: Token bucket rate limiter
- [x] Rate limits on `/api/sync/trigger`, auth, bulk endpoints
- [x] `TransactionPatch`: Length limits, character sanitization
- [x] Content-Security-Policy headers
- [x] X-Frame-Options header
- [x] Stack trace suppression in production

---

## Wave 3: Pipeline Improvements
**Status**: ✅ Complete  
**Dependencies**: Wave 1 (transaction_type)  
**Risk**: Medium (pipeline changes)

### 3.1 Per-User Sync State
- [x] Move `_sync_progress` from module-level dict to per-user dict keyed by user_id
- [x] Allow concurrent syncs for different users
- [x] Sync progress tracking per user

### 3.2 Batch Dedup
- [x] Replace per-transaction dedup loop with single windowed query
- [x] Multi-layer scoring: amount proximity + time proximity + merchant similarity + domain relationship
- [x] Currency format normalization before comparison (₹1,299 vs 1299.00 vs Rs. 1,299.00)
- [x] Receipt-vs-debit dedup (merchant receipt + bank debit alert pairing)
- [x] Merchant-name-based dedup across domains (Swiggy + Bundl)

### 3.3 Duplicate Resolution UI
- [x] Frontend view to review and resolve duplicates
- [x] Confidence score display for each potential duplicate
- [x] Bulk resolve actions
- [x] Audit trail for resolved duplicates

### 3.4 Async Workers
- [x] Replace synchronous sync with queue (in-memory asyncio.Queue)
- [x] Worker loop processes tasks: fetch, classify, dedup, persist
- [x] Transaction rollback on failure (sync_worker.py wraps sync_emails in session)
- [x] Idempotency key for re-running sync (payload hash in TaskQueue)
- [x] `/api/tasks` endpoint to list user tasks
- [x] `/api/tasks/{task_id}` endpoint to check task status

---

## Wave 4: Intelligence Layer
**Status**: ✅ Complete (4.1-4.2 complete)  
**Dependencies**: None (can run in parallel with Wave 3)  
**Risk**: Low (additive changes)

### 4.1 Merchant Entity Resolution
- [x] UPI handle extraction (@paytm, @ybl, @ibl)
- [x] Regex cleaning (strip suffixes, parent company names)
- [x] Exact alias lookup (seed + DB cache)
- [x] Fuzzy match (rapidfuzz WRatio ≥ 85)
- [x] Parent entity resolution (Swiggy Instamart → Swiggy)
- [x] Canonical merchant ID for analytics rollup
- [x] Merchant graph (Amazon → Amazon Prime → Amazon Fresh)

### 4.2 Confidence Governance
- [x] System-level confidence tracking
- [x] Dashboard: classification health (% auto-confirmed vs needs_review vs corrected)
- [x] Low-confidence transactions queue for review
- [x] Confidence score display on individual transactions
- [x] Edit trail for user corrections

### 4.3 Multi-Stage Pipeline
- [ ] Stage 0: Gmail Fetch + body cleaning
- [ ] Stage 1: Cheap Deterministic Filter (regex amount, date, merchant, domain rules)
  - Auto-confirm if confidence > 0.95 AND amount < ₹5000
- [ ] Stage 2: Lightweight Classifier (expanded rule engine with 100+ domain rules)
  - Auto-confirm if confidence > 0.90
- [ ] Stage 3: Premium LLM Extraction (batch, with pre-extraction hints)
  - Amount > ₹10,000 → higher-quality model or multi-model vote
- [ ] Stage 4: Confidence Governance
  - confidence < 0.75 → needs_review queue
  - confidence 0.75-0.90 → auto but flaggable
  - confidence > 0.90 → auto-confirm
- [ ] Stage 5: Financial Reconciliation
  - Cross-check: income - expenses ≈ balance change
  - Flag anomalies for review

---

## Wave 5: Code Quality
**Status**: ✅ Complete  
**Dependencies**: None (lowest priority)  
**Risk**: Low (refactoring)

### 5.1 Frontend Build
- [ ] Replace in-browser Babel with pre-build step (esbuild/vite)
- [ ] Add TypeScript for type safety
- [ ] State management (context/reducers/caching)
- [ ] Pagination for dashboard charts

### 5.2 Deduplicate Code
- [x] Consolidate user LLM client building (6 places → `app/services/llm_service.py`)
- [x] Consolidate pre-filter loading (`app/services/classifier_service.py`)
- [x] Consolidate transaction formatting (`_fmt` in transactions.py + duplicates.py → `app/services/transaction_formatter.py`)
- [x] Consolidate date range logic across frontend views (`static/src/date-utils.js`)

### 5.3 Modularize Files
- [x] Split `sync.py` (658 lines) → fetch, classify, persist, dedup modules
- [x] Split `llm_client.py` (980 lines) → provider management, prompt building, parsing, batch logic
- [x] Remove inline imports

### 5.4 Type Hints & Configuration
- [ ] Add type hints to all functions (especially frontend data layer)
- [x] Make magic numbers configurable: `_AUTO_RESOLVE_THRESHOLD`, `_FETCH_CONCURRENCY`, `batch_size`
- [x] Configurable income month shifting (currently hardcoded for Axis Bank)
- [x] Configurable category breakdown limit (currently capped at 6)

---

## Wave 6: Audit Fixes (P0 + P1)
**Status**: planning  
**Dependencies**: None  
**Risk**: Medium (schema changes for #8, #16)

### 6.1 Data Integrity (P0)
- [ ] Fix savings rate to include CC payments (`app/api/stats.py:147`, `static/src/dashboard.jsx:84`)
- [ ] Fix balance reconciliation to include CC payments + investments (`app/api/reconciliation.py:124`)
- [ ] Fix self-canceling balance discrepancy formula — always evaluates to 0 (`app/api/reconciliation.py:130`)
- [ ] Fix `classifier_method` logic bug — reports `llm` when rules returned nothing (`app/classifier/classifier.py:184`)
- [ ] Fix batch dedup O(N×M) query pattern — load paired IDs once (`app/dedup/service.py:489`)
- [ ] Encrypt `access_token` in connected_accounts (`app/models/user.py:96`)
- [ ] Fix cc-statement endpoint — sums ALL purchases, needs `payment_mode` filter (`app/api/reconciliation.py:258-265`)
- [ ] Add `user_id` to SyncState — scope per user, not global (`app/models/email.py:28`)
- [ ] Fix `datetime_now_utc()` imports — add `from datetime import datetime, timezone` to `fetch.py`

### 6.2 Classification Quality (P1)
- [ ] Integrate `merchant_entity.py` into classifier pipeline (`app/classifier/classifier.py:10,134`)
- [ ] Wire `merchant_entity.load_db_aliases()` at startup + refresh on alias creation (`app/main.py:44`)
- [ ] Enable Pre-filter Tier 3 LLM — pass `user_llm_client` (`app/sync/classify.py:43`)
- [ ] Extend dedup to CC payments and investments (`app/dedup/service.py:144`)
- [ ] Add amount validation (range check on LLM output)
- [ ] Fix body truncation mismatch — 600 → 3000 chars in batch (`app/classifier/classifier.py:321`)

### 6.3 Tenant Isolation (P1)
- [ ] Add `user_id` to FilterRule — scope rules per user (`app/models/filter_rule.py:7`)

---

## UX Improvements (Cross-Wave)
**Status**: ✅ Complete

### Complete
- [x] Duplicate resolution UI (Wave 3.3) — pending
- [x] Confidence indicator on transactions (Wave 4.2)
- [x] Edit trail for corrections (Wave 4.2)
- [x] Dashboard "Remaining" accounts for CC payments, transfers, investments (Wave 1.2)
- [x] Sankey diagram shows CC payments (Wave 1.2)
- [x] Income vs expense sparkline on Daily burn card
- [x] Net worth section on dashboard
- [x] Per-source income % on Sankey nodes
- [x] Month-over-month delta badges on stat cards

### Pending
- [x] Duplicate resolution UI (Wave 3.3)
- [x] Bulk category operations
- [x] Onboarding for CC payments explanation
- [x] Search by amount range

### Medium
- [ ] Multi-account support (long-term)
- [ ] Investment portfolio tracking (long-term)
- [ ] Net worth dashboard (long-term)
- [ ] Predictive analytics (long-term)
- [ ] Export to accounting formats (OFX, QIF, CSV) (long-term)

---

## Security Fixes (Cross-Wave)
**Status**: ✅ Complete

### Complete
- [x] Fernet key enforcement (Wave 2.1)
- [x] CSRF protection (Wave 2.2)
- [x] Session token rotation (Wave 2.3)
- [x] Rate limiting (Wave 2.4)
- [x] Input validation (Wave 2.4)
- [x] Content-Security-Policy headers (Wave 2.4)
- [x] X-Frame-Options header (Wave 2.4)
- [x] Stack trace suppression in production (Wave 2.4)

### Pending
- [x] LLM API key rotation/expiry
- [x] ReDoS protection for filter API regex patterns
- [x] Audit log for admin actions
- [x] DEV_MODE check hardening for `/api/auth/claim-seed-data`

---

## Effort Estimates

| Wave | Complexity | Risk | Time |
|------|------------|------|------|
| Wave 1 | Medium | Low (data migration) | 2-3 days |
| Wave 2 | Medium | Medium (security) | 1-2 days |
| Wave 3 | High | Medium (pipeline) | 3-4 days |
| Wave 4 | High | Low (additive) | 2-3 days |
| Wave 5 | Low | Low (refactoring) | 1-2 days |
| **Total** | | | **~9-14 days** |

---

## Quick Reference: File Map

| Wave | Files Modified |
|------|----------------|
| 1.1 | `app/models/transaction.py`, `alembic/versions/0026_*.py` |
| 1.2 | `app/api/stats.py`, `static/src/data.jsx`, `static/src/dashboard.jsx`, `static/src/flow.jsx` |
| 1.3 | `app/classifier/llm_client.py`, `app/classifier/classifier.py`, `app/api/stats.py` |
| 1.4 | `app/api/reconciliation.py`, `app/main.py` |
| 2.1 | `app/crypto.py`, `app/main.py` |
| 2.2 | `app/csrf.py`, `app/main.py`, `app/api/auth.py` |
| 2.3 | `app/models/user.py`, `alembic/versions/0027_*.py`, `app/auth_deps.py` |
| 2.4 | `app/rate_limiter.py`, `app/main.py`, `app/api/transactions.py` |
| 3.1 | `app/sync.py` |
| 3.2 | `app/dedup/service.py`, `app/sync.py` |
| 3.3 | `static/src/` (new duplicate view) |
| 3.4 | `app/workers/` (new), `app/sync.py` |
| 4.1 | `app/classifier/merchant.py`, `app/models/merchant.py` |
| 4.2 | `app/api/stats.py`, `app/api/transactions.py`, `app/models/correction.py` |
| 4.3 | `app/pipeline/` (new multi-stage modules) |
| 5.1 | `static/` (build config), `static/src/` (TypeScript migration) |
| 5.2 | Multiple (consolidation) |
| 5.3 | `app/sync.py`, `app/classifier/llm_client.py` |
| 5.4 | All Python files (type hints), `app/config.py` |
