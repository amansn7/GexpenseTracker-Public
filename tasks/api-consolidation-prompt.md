# Improve & Consolidate Expense Tracker API

## Goal
Reduce API surface area from 81 → ~50 endpoints while maintaining all functionality.

## Current Issues (from audit)

### 1. Remove Dead/Dev Code
- `POST /auth/claim-seed-data` - dev-only seed data endpoint
- `GET /auth/allowlist` - dev allowlist endpoint
- `POST /auth/allowlist` - dev allowlist endpoint
- `DELETE /auth/allowlist/{email}` - dev allowlist endpoint

### 2. Merge Duplicates
- `account.py` (2 endpoints) merges INTO `settings.py`:
  - `GET /account/me` → use existing `GET /account/settings`
  - `PATCH /account/profile` → use existing `PATCH /account/settings`

### 3. Collapse Nested Resources
Move endpoints under cleaner RESTful paths:
- `PATCH /recurring/{item_id}` → `PATCH /recurring/{id}`
- `PATCH /debt/{debt_id}` → `PATCH /debt/{id}`
- `PATCH /budgets/{budget_id}` → `PATCH /budgets/{id}`

### 4. Consolidate Sync Internals
Private/internal endpoints should NOT be exposed:
- `/sync/backfill-bodies` → move to internal-only or admin middleware
- `/llm/status` → move to internal-only

### 5. Simplify Review Flow
- `/review/count` + `/review` → single endpoint with `?count=true` param
- `/review/reprocess-all` → batch endpoint already exists

## Tasks

1. Delete `app/api/account.py` after merging its endpoints into `settings.py`
2. Remove allowlist + seed-data endpoints from `auth.py` (gate behind DEV_MODE)
3. Simplify path parameters (remove redundant prefixes)
4. Mark internal sync endpoints with internal middleware or separate router
5. Verify all changes pass existing tests
6. Run `pytest` to confirm nothing broke

## Constraints
- Must maintain backward compatibility OR provide deprecation headers
- Do NOT remove any user-facing functionality
- Keep the same response schemas