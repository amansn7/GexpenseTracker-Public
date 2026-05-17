# Backend Services Review — `app/services/`

Scope: 5 files, 235 LOC. Reviewed against callers in `app/api/`, `app/classifier/`, `app/sync/`.

| File | LOC | Role |
|------|-----|------|
| `__init__.py` | 0 | empty |
| `transaction_formatter.py` | 30 | `format_transaction(t, e)` → API dict |
| `classifier_service.py` | 40 | `get_classifier_context(user_id, db)` |
| `llm_service.py` | 49 | `get_user_llm_client(user_id, db)` |
| `category_service.py` | 116 | `CategoryService` (resolve/list/load_for_llm) |

---

## Findings (severity → fix)

### HIGH

**H1. Service → API layer dependency (architectural inversion). [DONE 2026-05-18]**
~~`app/services/llm_service.py:36` does `from app.api._account_helpers import _decrypt_secret` inside the function.~~
Resolved: `encrypt_ai_secret`/`decrypt_ai_secret` now live in `app/crypto.py`. All callers (`llm_service`, `classifier/llm/client.py`, `admin.py`, `settings.py`, `_account_helpers.py`) migrated. Service→API dependency eliminated.

**H2. Local-scope `from app.services.X import Y` repeated everywhere. [DONE 2026-05-18]**
~~13 callsites use function-body imports.~~
Resolved: all deferred `from app.services.…` imports hoisted to module top across `transactions.py`, `recurring.py`, `emails.py`, `filter.py`, `settings.py`, `_account_helpers.py`, `sync/classify.py`, `classifier/classifier.py`. Verified: `grep "    from app.services" app/` returns nothing; full-module import smoke test passes.

### MEDIUM

**M1. Inconsistent SQLAlchemy boolean predicate.**
`app/services/category_service.py:80` uses `UserCategory.active.is_(True)` but `:111` uses `UserCategory.active == True`. Same semantics, but `== True` trips linters (E712) and is non-idiomatic.
Fix: replace `:111` with `.is_(True)`.

**M2. `format_transaction` accepts `e: Optional[object]` — no type, no protocol.**
Email is positional, untyped. Callers (`api/transactions.py:150,202,221,312,561,626`, `api/duplicates.py:21`) all pass a concrete `Email` ORM row, but signature loses safety and the `email: {...}` block always emits keys even when `e=None`.
Fix: type-annotate `t: Transaction, e: Email | None`. Consider `email=None` when `e is None` instead of dict-with-all-Nones — saves bytes and matches frontend expectations only if checked.

**M3. `format_transaction` silently relies on `t.email` not being lazy-loaded.**
Memory obs 278/279 confirm `Transaction.email` uses default lazy loading. Callers must `selectinload(Transaction.email)` upstream. No assertion or comment in formatter.
Fix: 1-line module docstring noting "caller must eager-load email" OR accept `email` kwarg required when relationship not loaded.

**M4. `CategoryService.load_for_llm` defensive None-checks are dead weight.**
`if not session or not user_id: return None` (`:73`). Every caller already has both. Reduces type clarity (Optional in signature).
Fix: drop the None guards; make `session: AsyncSession, user_id: str`.

**M5. `_CANONICAL_MAP` lives only in `category_service.py`.**
Comment says "mirrors frontend `_CAT_ALIAS`". Two sources of truth. Drift risk (audit obs 330 flags CC payment analytics distortion — likely related: `"cc payment": "card"` collapses both repayments and CC purchases).
Fix: export a JSON file or `/api/categories/canonical-map` endpoint; frontend consumes once.

### LOW

**L1. `re` imported in `category_service.py:1` but unused.** Dead.

**L2. `classifier_service.py` `merchant_hints: None` placeholder.**
Comment says "for future". YAGNI — drop the key. Add it when merchant resolution lands.

**L3. `llm_service.get_user_llm_client` returns `Optional[object]`.**
Loses type info. `MultiLLMClient` is the actual type (verified in `app/classifier/llm_client.py`).
Fix: `Optional[MultiLLMClient]`. Forward-ref or TYPE_CHECKING guard if needed.

**L4. Logging context thin.**
`logger.error("Failed to build user LLM client for %s: %s", user_id, exc)` — no provider/model in log. Hard to triage which provider config broke.
Fix: include `ai_svc.provider` and `ai_svc.model_id` in error message.

**L5. Lazy import in `llm_service.py:36` (`from app.api._account_helpers import _decrypt_secret`).**
Once H1 lands, hoist to top.

**L6. Test coverage minimal.**
Only `tests/test_admin.py` and `tests/test_account_onboarding.py` even string-match "services". No unit test for `format_transaction`, `get_classifier_context`, `get_user_llm_client`, or `CategoryService.resolve`.
Fix: add `tests/test_services_unit.py` — pure unit tests, no DB needed for `format_transaction` + `CategoryService.resolve`.

---

## Cross-cutting observations

- **Services dir is shallow.** 235 LOC across 4 files. Most "service-like" logic still lives in `app/api/*.py` (5,701 LOC) and `app/classifier/`, `app/dedup/`, `app/sync/`. The `services/` namespace is currently used as a "small helpers" shelf, not a service layer.
- **No DI / factory pattern.** Every consumer calls `get_user_llm_client(user_id, db)` directly. Fine at this scale.
- **No async transaction boundaries owned by services.** Callers manage `db.commit()`. Consistent.
- **No retry/timeout wrappers** around `build_user_client` — LLM init failures collapse to `None` and the caller silently degrades. Fine for sync path; check `api/transactions.py:464` reclassify flow has a user-visible error path.

---

## Recommended fix order

1. ~~H1 (move `_decrypt_secret` to `app/crypto.py`) — unblocks H2.~~ **DONE**
2. ~~H2 (hoist top-level imports) — cleanup.~~ **DONE**
3. M1, L1, L2 — trivial. **NEXT**
4. L3, L4 — type/log polish.
5. M5 — canonical-map endpoint (largest change, real bug-fix candidate).
6. L6 — unit tests last so they cover the refactor.

Total: ~1 day of work. No behavior changes except M5 (which is the only one worth a separate commit).
