# SP5: Codebase Improvement Roadmap

## Goal

Stabilize the current Gmail sync and classification pipeline, reduce operational risk in the highest-churn modules, and create a realistic implementation plan for making the codebase easier to extend without breaking classification accuracy or the UI.

This spec is based on direct inspection of the current repo state on 2026-04-13, including runtime modules, API routers, tests, and current local test execution.

## Current State Summary

The application already has a solid vertical slice:

- FastAPI app with clear route separation by feature
- Async SQLAlchemy models and Alembic migrations
- Gmail sync pipeline with incremental fetch and concurrent classification
- Rule-first classifier with multi-provider LLM fallback
- UI for dashboard, transactions, review, settings, and email inspection

The main issues are not missing features. The main issues are reliability, module boundaries, and data-path consistency.

## Key Findings

### 1. Active regression: test suite does not collect

`pytest -q` currently fails during collection because `tests/test_llm_client.py` imports `LLMClient`, while [app/classifier/llm_client.py](/Users/amansaini/Desktop/Vibe/GexpenseTracker/app/classifier/llm_client.py) now exposes `MultiLLMClient` only.

Impact:

- The branch is not in a shippable state
- The test suite cannot be used as a safety net for follow-up work
- Existing callers are vulnerable to the same import break

### 2. Active regression: merchant data is dropped on the high-confidence rule path

In [app/classifier/classifier.py](/Users/amansaini/Desktop/Vibe/GexpenseTracker/app/classifier/classifier.py), the high-confidence rule path sets `merchant = None` even though `apply_rules()` now returns merchant information through `rule_result.merchant`.

Impact:

- Common sync-path transactions lose extracted merchant data
- Merchant normalization work is partially bypassed in production behavior
- Analytics and merchant views degrade on the fastest path

### 3. Classification pipeline has mixed responsibilities

The classifier currently combines:

- label selection
- optional extraction
- fallback policy
- status assignment
- exception swallowing

This lives mostly in [app/classifier/classifier.py](/Users/amansaini/Desktop/Vibe/GexpenseTracker/app/classifier/classifier.py), while rule logic sits in [app/classifier/rules.py](/Users/amansaini/Desktop/Vibe/GexpenseTracker/app/classifier/rules.py) at 529 lines and LLM orchestration in [app/classifier/llm_client.py](/Users/amansaini/Desktop/Vibe/GexpenseTracker/app/classifier/llm_client.py) at 426 lines.

Impact:

- Small behavior changes are easy to ship incorrectly
- The same concepts exist in multiple places with slightly different fallback behavior
- Debugging label vs extraction mistakes requires reading across several large modules

### 4. API layer has oversized handlers and duplicated data access logic

[app/api/emails.py](/Users/amansaini/Desktop/Vibe/GexpenseTracker/app/api/emails.py) is 441 lines and mixes:

- list/read APIs
- retraining
- reclassification
- SSE formatting
- LLM verbose tracing
- transaction persistence

[app/api/review.py](/Users/amansaini/Desktop/Vibe/GexpenseTracker/app/api/review.py) contains background processing, queue aggregation, and batch rule training in one file.

Impact:

- Endpoint behavior is hard to test in isolation
- Changes to one email workflow can affect unrelated endpoints
- Business logic sits in routers rather than reusable services

### 5. Query efficiency issues exist on hot or user-facing paths

Examples:

- [app/sync.py](/Users/amansaini/Desktop/Vibe/GexpenseTracker/app/sync.py) checks for duplicate Gmail IDs one message at a time
- [app/api/review.py](/Users/amansaini/Desktop/Vibe/GexpenseTracker/app/api/review.py) issues additional queries per review item to compute `domain_count`
- [app/api/emails.py](/Users/amansaini/Desktop/Vibe/GexpenseTracker/app/api/emails.py) returns the full email list with body text and transaction joins, with no pagination

Impact:

- Sync time and page load time will degrade as data volume grows
- Gmail review and inbox views will become progressively more expensive
- The system is paying database round-trips for work that should be batched

### 6. Error handling is too broad around external and classification flows

There are many `except Exception` branches across sync, classifier, LLM client, rules, and API flows.

Impact:

- Failures are frequently converted into silent behavior changes
- Root cause analysis is harder than it should be
- Some recoverable errors and true bugs are treated the same way

### 7. Type and validation boundaries are weaker than they should be

The ORM has enums, but many API inputs and outputs still move raw strings around. Example: [app/api/transactions.py](/Users/amansaini/Desktop/Vibe/GexpenseTracker/app/api/transactions.py) accepts arbitrary strings for `label` and status logic depends on convention.

Impact:

- Invalid state can enter through patch endpoints
- Refactors are harder because response contracts are implicit
- Tests mostly check dicts rather than typed response models

### 8. Test coverage is present but misses the highest-risk recent changes

The repo has a decent baseline test suite, but current gaps include:

- backward-compatibility import coverage for LLM client exports
- merchant propagation on rule-only auto-classification
- pagination and query-shape coverage for large list endpoints
- explicit regression tests around background reprocess flows

Impact:

- The test suite exists, but it is not aligned tightly enough with the most fragile areas

## Improvement Strategy

The roadmap is split into four phases. Phase 1 is mandatory before any larger refactor.

## Phase 1: Restore Shipping Safety

### Scope

- Restore exported `LLMClient` compatibility in [app/classifier/llm_client.py](/Users/amansaini/Desktop/Vibe/GexpenseTracker/app/classifier/llm_client.py)
- Preserve `rule_result.merchant` in the high-confidence branch of [app/classifier/classifier.py](/Users/amansaini/Desktop/Vibe/GexpenseTracker/app/classifier/classifier.py)
- Add regression tests for both behaviors
- Get `pytest` collecting and green again

### Acceptance Criteria

- `from app.classifier.llm_client import LLMClient` works
- High-confidence rule classifications persist merchant/category when available
- `pytest -q` runs to completion locally

### Notes

This phase is small, high-priority, and should be merged before broader refactoring. It removes current blockers without changing architecture.

## Phase 2: Extract Classification Services

### Scope

Split classification into explicit layers:

- `rule_evaluator`
- `extraction_service`
- `classification_orchestrator`
- `llm_provider_client`

Recommended target structure:

```text
app/classifier/
  classifier.py          # thin orchestration entrypoint
  rules.py               # pure rule engine only
  merchant.py            # merchant normalization
  llm_client.py          # provider transport only
  extraction.py          # extraction-only workflow
  policy.py              # threshold + fallback decisions
```

### Changes

- Keep `classify_email()` as the public orchestration entrypoint for compatibility
- Move status assignment and threshold policy into one dedicated place
- Ensure rule-only, extraction-only, and full-LLM flows share one result-normalization path
- Replace bare `except Exception` where possible with narrower exception handling and structured logging

### Acceptance Criteria

- No behavior change in public API shape
- Existing tests still pass
- New unit tests cover:
  - rule-only classification
  - rule + extraction flow
  - full LLM fallback
  - LLM failure fallback

## Phase 3: Move Business Logic Out of Routers

### Scope

Create service modules for inbox/review flows and reduce router files to request parsing plus response formatting.

Recommended target structure:

```text
app/services/
  email_reclassification.py
  review_queue.py
  sync_service.py
  sender_rule_training.py
```

### Changes

- Move SSE event construction behind a small serializer/helper layer
- Move review reprocess orchestration out of [app/api/review.py](/Users/amansaini/Desktop/Vibe/GexpenseTracker/app/api/review.py)
- Move retraining and batch rule updates out of router functions
- Introduce typed request/response schemas for the most-used endpoints

### Acceptance Criteria

- [app/api/emails.py](/Users/amansaini/Desktop/Vibe/GexpenseTracker/app/api/emails.py) and [app/api/review.py](/Users/amansaini/Desktop/Vibe/GexpenseTracker/app/api/review.py) are materially smaller
- Core workflows can be unit-tested without spinning up the ASGI app
- Endpoint tests focus on HTTP contracts rather than internal branching

## Phase 4: Performance and Data Contract Hardening

### Scope

- Add pagination to `/api/emails` and optionally `/api/transactions`
- Batch duplicate Gmail ID lookup in sync
- Replace per-row `domain_count` review queries with one grouped aggregate
- Add request validation for label/status/category inputs
- Add response models for the most-used read endpoints

### Recommended Query Changes

- In sync, fetch existing Gmail IDs with one `IN (...)` query before inserts
- In review queue, precompute domain counts with grouped SQL and join in memory
- In email list, avoid returning full `body_text` by default; expose it via detail endpoint or opt-in flag

### Acceptance Criteria

- Large inbox and review pages no longer scale linearly in query count
- API payloads are smaller and more explicit
- Invalid enum-like inputs are rejected at request-validation time

## Implementation Plan

### Sprint 1

- Fix `LLMClient` compatibility alias
- Fix merchant propagation on rule fast-path
- Add regression tests
- Run full test suite

### Sprint 2

- Extract classification policy and extraction flow from `classifier.py`
- Make `llm_client.py` transport-focused
- Replace broad exception swallowing with logged typed failures

### Sprint 3

- Extract review and reclassification services from routers
- Introduce shared DTOs or Pydantic response models
- Add unit tests for service modules

### Sprint 4

- Add pagination to large list endpoints
- Batch hot-path queries in sync and review
- Add endpoint validation hardening
- Benchmark or at least measure response/query improvements on seeded data

## Testing Plan

Minimum required additions:

- `tests/test_llm_client.py`
  - verifies `LLMClient` import compatibility
- `tests/test_classifier.py`
  - verifies merchant survives high-confidence rule result
  - verifies category survives high-confidence rule result
- `tests/test_sync.py`
  - verifies merchant/category from rule path are persisted into `Transaction`
- `tests/test_api.py`
  - verifies invalid transaction patch labels are rejected once validation is added
  - verifies email list pagination contract once introduced

## Risks

### 1. Refactor can change classification semantics accidentally

Mitigation:

- Lock down current intended behavior with regression tests before moving code

### 2. Router extraction can break UI event contracts

Mitigation:

- Keep SSE payload shape stable
- Add snapshot-like tests for emitted event types where practical

### 3. Pagination can break current frontend assumptions

Mitigation:

- Introduce pagination in a backward-compatible way first, for example `limit` and `offset` defaults that preserve current behavior for small datasets

## Non-Goals

- Replacing FastAPI, SQLAlchemy, or the current frontend stack
- Rewriting the rule engine from scratch
- Changing the LLM provider strategy beyond compatibility and reliability improvements

## Recommended First Merge

The next change should be a narrow stabilization patch:

1. Restore `LLMClient` export compatibility
2. Preserve merchant/category on the high-confidence rule path
3. Add the missing regression tests
4. Confirm `pytest -q` is green

That gives the codebase a working baseline before any structural work starts.
