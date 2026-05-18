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

**M2. `format_transaction` accepts `e: Optional[object]` — no type, no protocol. [DONE 2026-05-18]**
Signature now `format_transaction(t: "Transaction", e: "Email | None" = None) -> dict` via `from __future__ import annotations` + `TYPE_CHECKING` guard. `"email": {...}` block structure preserved (keys always present even when `e=None`) — frontend expects them.

**M3. `format_transaction` silently relies on `t.email` not being lazy-loaded. [DONE 2026-05-18]**
Docstring now spells out the eager-load contract: caller eager-loads via `selectinload(Transaction.email)` and passes the row in as `e`. Formatter never touches `t.email` so async lazy-load traps cannot fire.

**M4. `CategoryService.load_for_llm` defensive None-checks. [WONTFIX]**
Verified callers — `classify_email` (api/transactions reclassify flow with `session=None`) and tests legitimately pass `None`. Guards required. Skip.

**M5. `_CANONICAL_MAP` lives only in `category_service.py`. [DONE 2026-05-18]**
Backend now exposes `GET /api/categories/canonical-map` (no auth, `Cache-Control: public, max-age=3600`) via new public `get_canonical_map()` accessor in `category_service.py`. Frontend `static/src/data.jsx` now keeps the literal as fallback for first render + graceful degradation, then fire-and-forget fetches the live map at module load. Bundle rebuilt (`static/dist/data.js`). Endpoint test in `tests/test_categories_canonical_map.py`.

**CC payment bug NOT fixed in this task** — `"cc payment": "card"` still collapses CC repayments and CC purchases together. Follow-up: split into `"cc repayment"`/`"cc statement"` → distinct canonical key so dashboard analytics stops double-counting. Tracked separately.

### LOW

**L1. `re` imported in `category_service.py:1` but unused. [DONE 2026-05-18]** Dead — removed.

**L2. `classifier_service.py` `merchant_hints: None` placeholder. [DONE 2026-05-18]**
Removed. No caller read the key. Re-add when merchant resolution lands.

**L3. `llm_service.get_user_llm_client` returns `Optional[object]`. [DONE 2026-05-18]**
Now `Optional[MultiLLMClient]`. `MultiLLMClient` re-exported via `app/classifier/llm_client.py` facade.

**L4. Logging context thin. [DONE 2026-05-18]**
Error log now includes `provider=` and `model=` for triage.

**L5. Lazy import in `llm_service.py:36` (`from app.api._account_helpers import _decrypt_secret`).**
Once H1 lands, hoist to top.

**L6. Test coverage minimal. [DONE 2026-05-18]**
`tests/test_services_unit.py` added (13 tests, no DB): 8 for `CategoryService.resolve` (canonical lookup, whitespace/case, `is_income` shortcut, fallback to `"other"`, `"cc payment"` → `"card"` documented), 5 for `format_transaction` (SimpleNamespace mocks, key set guards, `None` propagation). `tests/test_categories_canonical_map.py` added (3 tests: endpoint shape, known keys, cache header, copy-not-reference).

---

## Cross-cutting observations

- **Services dir is shallow.** 235 LOC across 4 files. Most "service-like" logic still lives in `app/api/*.py` (5,701 LOC) and `app/classifier/`, `app/dedup/`, `app/sync/`. The `services/` namespace is currently used as a "small helpers" shelf, not a service layer.
- **No DI / factory pattern.** Every consumer calls `get_user_llm_client(user_id, db)` directly. Fine at this scale.
- **No async transaction boundaries owned by services.** Callers manage `db.commit()`. Consistent.
- **No retry/timeout wrappers** around `build_user_client` — LLM init failures collapse to `None` and the caller silently degrades. Fine for sync path; check `api/transactions.py:464` reclassify flow has a user-visible error path.

---

## Recommended fix order

1. ~~H1~~ **DONE** (commit `01560dc`)
2. ~~H2~~ **DONE** (commit `01560dc`)
3. ~~M1, L1~~ **DONE** (commit `01560dc`); ~~L2, L3, L4~~ **DONE** (commit `dc2078d`)
4. ~~M2, M3, M5, L6~~ **DONE** (this commit)

M4 marked **WONTFIX** — None guards in `load_for_llm` required by reclassify flow + tests.

## Remaining out-of-scope follow-ups

- **CC payment vs CC purchase bucket collapse [RESOLVED — not a bug 2026-05-18].** Investigated. Backend gates CC payments via `Transaction.transaction_type == "cc_payment"`, not via canonical category. Frontend `data.jsx:157` injects `catMap["card"]` from `stats.total_cc_payments`; Sankey filters `cat === "card"` to render as separate flow. `"card"` is the load-bearing canonical for CC repayments. Map was correct. Audit obs 330 misread.

- **Asymmetric canonical card aliases [DONE 2026-05-18].** `"card"`, `"card payment"`, `"credit card payment"` now all canonicalize to `"card"`. Backend + frontend fallback + tests updated; bundle rebuilt.

- **`investment` canonicalized to `"other"` [DONE 2026-05-18 — real bug].** Frontend `flow.jsx:29,255` filters `cat === "investment"` expecting an `"investment"` canonical key. Backend map collapsed `investment → other`, so any user-labelled "Investment" category leaked into "regular expenses" rather than the dedicated investment Sankey node. Now `"investment"`/`"investments"`/`"mutual fund"`/`"mutual funds"`/`"stocks"`/`"sip"` → `"investment"`.

- **`cash` still canonicalized to `"other"`.** Intentional — no dedicated `"cash"` bucket downstream; would need product input + dashboard/Sankey work to split.
