---
name: sync-debug
description: Use when working on Gmail sync, incremental history fetch, duplicate handling, progress tracking, scheduling, or any bug where emails are missed, repeated, or processed in the wrong order. Covers `app/sync.py`, `app/gmail/`, `app/dedup/`, sync APIs, and their tests.
---

# Sync Debug

Use this skill for work in:

- `app/sync.py`
- `app/gmail/auth.py`
- `app/gmail/client.py`
- `app/dedup/service.py`
- `app/scheduler.py`
- `app/api/sync.py`, `app/api/duplicates.py`, `app/api/emails.py`
- sync and dedup tests

## Workflow

1. Start from the observed symptom:
   - messages missing
   - messages duplicated
   - wrong progress/state
   - auth failure
   - scheduler/run-range inconsistency
2. Trace the full path:
   - Gmail fetch
   - state/history tracking
   - email insert
   - dedup
   - classification trigger
   - transaction write
3. Check whether the bug is:
   - fetch-layer
   - state/history-layer
   - dedup-layer
   - classification handoff
   - API/reporting only
4. Verify the nearest tests before editing. Prioritize:
   - `tests/test_sync.py`
   - `tests/test_dedup.py`
   - `tests/test_gmail_client.py`
   - `tests/test_gmail_auth.py`
5. For range or backfill logic, confirm behavior for both normal sync and historical replay paths.

## Project-specific rules

- Dedup is product-critical. Any change touching dedup, sync state, or replay logic should be treated as high risk.
- Distinguish “email row duplicated” from “transaction duplicated”; they are related but not identical failures.
- Be explicit about persistence boundaries. In-memory progress state and persisted sync state have different failure modes.
- If a fix touches replay or batch paths, inspect whether the same behavior exists in both `run_sync` and range/backfill flows.

## Useful files

- `app/sync.py`
- `app/dedup/service.py`
- `app/gmail/client.py`
- `app/gmail/auth.py`
- `app/api/sync.py`
- `tests/test_sync.py`
- `tests/test_dedup.py`
- `tests/test_gmail_client.py`

## Output expectations

- State the failing sync stage.
- Note whether the issue affects fetch, dedup, classification handoff, or reporting only.
- List tests run and any untested blast radius.
