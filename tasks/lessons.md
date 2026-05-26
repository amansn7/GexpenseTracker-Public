# Lessons

## 2026-05-26 — `merchant_aliases.user_id` Column Not Materializing (4 Failed Migrations)

1. **Alembic's `transactional_ddl` wraps ALL migrations in a single transaction.** When `transactional_ddl = True` (default for PostgreSQL), all DDL across all migrations is committed together at the very end. Any failure ANYWHERE in the chain rolls back EVERYTHING. This means you cannot rely on a DDL change being visible to the rest of the same migration run until the very end.

2. **PostgreSQL's `DO $$ ... EXCEPTION WHEN duplicate_column THEN NULL` rolls back the ADD COLUMN.** Inside a PL/pgSQL DO block, when an EXCEPTION is caught, ALL changes within that BEGIN block are rolled back (subtransaction rollback). So if `ALTER TABLE ADD COLUMN user_id` raises `duplicate_column`, the column creation is reverted even though the exception is handled. The migration "succeeds" but the column never materializes. **Do not use DO blocks with EXCEPTION for DDL operations that must persist.**

3. **`ADD COLUMN IF NOT EXISTS` trusts `pg_catalog` metadata which can be stale after `batch_alter_table`.** Migration 0039 used Alembic's `batch_alter_table` which copies the table. This can leave `pg_catalog` in a state where the column name exists (with `attisdropped=true` or similar) but the column isn't actually live. `IF NOT EXISTS` sees the name is taken and skips — but the column was never usable.

4. **`information_schema.columns` is a VIEW over `pg_attribute` and can be equally stale.** Migrations 0041 and 0042 both checked `information_schema.columns` to decide whether to add the column. Like `IF NOT EXISTS`, they trust stale metadata.

5. **The only way to bypass Alembic's transaction is a SEPARATE connection in AUTOCOMMIT mode.** Creating a second `sqlalchemy.create_engine(url, isolation_level="AUTOCOMMIT")` connection outside Alembic's transaction allows DDL to commit immediately and be visible to all connections. This is the nuclear option for fixing migration bugs where transactional DDL prevents changes from materializing.

6. **Use `pg_attribute` (not `information_schema.columns`) to check actual column state.** `SELECT attname, attisdropped FROM pg_attribute WHERE attrelid = 'tablename'::regclass AND attname = 'colname' AND attnum > 0 AND NOT attisdropped` definitively checks whether a column is LIVE in the table's storage. `information_schema.columns` can show columns that don't physically exist on the table.

## 2026-05-24 — Sankey Diagram Visual Audit & Toggle Feature

1. **SVG text contrast must account for both themes**: Category fill colors (`--cat-food-ink`, `--cat-rent-ink`, etc.) in light theme are light pastels (`#e8d5b7`, `#cdd8d1`). Hardcoded `fill="white"` on these bars fails WCAG contrast (~1.4:1). Use `var(--ink)` for text on light category fills, keep `white` only on semantically dark fills (`var(--pos)`, `var(--neg)`, `var(--cat-card-ink)` in dark theme).

2. **A toggle between two framings of the same metric is cleaner than picking one**: The "Remaining" vs "Overspend" view lets the user decide whether to see a surplus or deficit framing of the same negative savings number. Both views show exactly the same data (₹-59K deficit) — only the label, color, and emotional framing change. This avoids opinionated UX that hides the truth.

3. **`CategoryService.colorInk()` returns category identity colors, not text-on-bg colors**: Despite the "ink" suffix, these values (e.g., `#e8d5b7` for food) are used as bar fills in the sankey. They're background colors, not text colors. Never assume semantic naming matches actual usage — always check the CSS variable values and where they're applied.

4. **Precompute totals before SVG render maps**: Packing flows at the bottom of the hub requires knowing all right-node heights before the `rightNodes.map()` render. Compute `totalRightHeight` as `sum of heights + (n-1) * gap` BEFORE the map that generates flow paths.

5. **Reuse computed values in FlowView for consistency**: The KPI card and the Sankey both need `savings`. Compute it once in `FlowView` and pass it down rather than recalculating in `SankeyDiagram`. The `savings` calculation is repeated across both components — extract to a shared helper or pass as prop.

## 2026-05-18 — Dedup `_is_dedup_candidate` silently drops selected items

1. **`_is_dedup_candidate` was too restrictive**: It only accepted `label == "expense"` or `label == "ignore"` with `transaction_type in ("cc_payment", "investment")`. This silently dropped:
   - Auto-resolved duplicates (label="ignore", non-cc_payment/investment types) when user explicitly selected them for recheck
   - Older data with empty/unset labels
   - Fix: accept anything with an amount that isn't explicitly `"income"`

2. **Errors must be visible**: The bulk detect catch block used `setBulkDetectError` which rendered inside the floating bar — but `clearSelect()` already hides that bar before the API call completes. Errors were invisible. Always use `showToast()` for post-clearSelect errors.

3. **Navigate even on zero results**: When totalDups is 0, still navigate to the duplicates tab so the user sees the empty state in context rather than wondering why nothing happened.

## 2026-05-14 — UI Polish Commit Regressions

1. **Count parentheses when wrapping in higher-order functions**: Adding `React.memo()` to an existing component function adds one `(` but the closing `);` stays the same — need `));` to close both the HOC call and the implicit return.

2. **Don't assume external CSS is loaded**: `index.html` had all CSS variable definitions inline in `<style>`. Moving them to `styles.css` requires also adding `<link rel="stylesheet">` to `index.html`. `base.html` is a separate template — check the actual page's head section.

3. **Removing inline `background` from style objects**: When removing inline hover handlers and their companion default styles, check if the CSS class provides the default. `.nav-btn` lost `background: transparent` when it was stripped from the inline `navItem` style object — browser default button backgrounds are opaque.

## 2026-05-24 — Pending Tab Deep Audit

1. **Always check the full constructor call when passing through fastAPI endpoint data**: The `review_email` endpoint dropped `status` and `txn_date` from `classify_email`'s `ClassificationResult` in the `Transaction(...)` constructor. When wiring up a new code path that creates records from existing pipeline output, verify every field is mapped — silent defaults hide data loss.

2. **Two separate review queues with one hidden is an architecture smell**: The pre-filter pending tab (`Email.pre_filter_status = "review_pending"`) and the low-confidence legacy queue (`Transaction.status = "needs_review"`) serve different semantic stages. Don't merge them, but DO surface both to the UI. Hidden queues rot.

3. **Client-side "undo" by reverse API call is inherently fragile**: The current undo sends `action="discard"` to reverse `action="keep"`, but the original Transaction is never deleted. The undo mechanism should be a server endpoint that knows exactly what to revert. Client-side simulation of server operations is a race condition factory.

4. **Shared-domain side effects break naive undo**: When two emails from the same domain are kept, undoing one can't blindly delete the allowlist rule — the other email depends on it. FilterRule's `hit_count` isn't a proper refcount. Any undo system must handle shared-domain cases by decrementing instead of deleting.

5. **Missing user_id filters in endpoints are authorization vulnerabilities**: The `reclassify_emails` SSE endpoint didn't scope queries to `current_user`. Always grep for new query patterns that use `select(Model).where(Model.id == ...)` without user scoping — these are latent security bugs.

## 2026-05-24 — Railway Deployment: Alembic Duplicate Revision IDs

1. **Every Alembic migration must have a unique `revision` string — never reuse revision IDs**. Two files with `revision = "0039"` cause Alembic to silently overwrite one in its internal index at boot time. When a downstream merge migration (0040) references them by their full descriptive names, Alembic fails with a `KeyError` because no revision with that exact string exists.

2. **Always match a migration's `revision` string to its filename's descriptive suffix.** This project's convention is `"{number}_{descriptive_name}"` (e.g., `"0039_encrypt_totp_secrets"`, `"0034_reencrypt_ai_keys"`). Never use a bare number like `"0039"` — it creates ambiguity when two heads branch from the same parent.

3. **Alembic crash at startup is not a DB migration failure — it's a script-load failure.** The app never starts because Python crashes while importing migrations. This happens before any database connection. Always run `uv run alembic heads` as a pre-deploy check to verify the migration tree is loadable without errors.

4. **Always check revision IDs are unique when creating sibling migrations off the same parent.** When two migrations branch from the same `down_revision`, assign them unique `revision` IDs that match their filenames — otherwise the merge migration that depends on both will fail to resolve its parent chain.

## 2026-05-24 — Railway Deployment: Boolean Default in Alembic Migration

1. **PostgreSQL rejects `DEFAULT 1` for `BOOLEAN` columns.** Use `DEFAULT TRUE` instead. SQLAlchemy ORM `server_default="1"` goes through type-aware compilation and generates the correct dialect-specific literal, but raw `sa.text("1")` in an `op.create_table()` produces invalid SQL for PostgreSQL.

2. **Alembic `op.create_table()` DDL does not benefit from ORM type-aware default compilation.** When you pass `sa.text("1")` as `server_default` on a `sa.Boolean` column, it generates `DEFAULT 1` verbatim — no dialect adaptation. Use `sa.text("TRUE")` for PostgreSQL-compatible boolean defaults in raw DDL migrations.

3. **Tests use ORM `metadata.create_all()`, NOT Alembic migrations.** Boolean default bugs in Alembic migration files are invisible to the test suite. Always validate migrations against a real PostgreSQL instance (or at minimum run `alembic upgrade head` with a PG connection string) before deploying.

4. **A multi-head migration chain masks pre-existing migration bugs.** The previous 0039 KeyError blocked all migrations from running, silently concealing the 0038 boolean default issue. When fixing a migration-load crash, always inspect all pending migrations in the chain — the first error hides subsequent ones.

## 2026-05-24 — Railway Deployment: VARCHAR(32) Limit on alembic_version.version_num

1. **Alembic's `alembic_version.version_num` column defaults to `VARCHAR(32)`.** Revision IDs longer than 32 characters cause `StringDataRightTruncation` when Alembic tries to `INSERT` the version row after running a migration. This applies even though the migration itself succeeds — the crash happens during the post-migration version stamp.

2. **Descriptive revision IDs must fit in 32 characters.** If the descriptive name pushes the revision ID past 32 chars, shorten it (e.g., `0039_add_user_id_to_merchant_aliases` → `0039_merchant_aliases_user_id`). Always check total length — including the numeric prefix — against VARCHAR(32).

3. **When renaming a revision ID, update all downstream references.** This includes:
   - The `revision` string in the migration file itself
   - The `Revises:` header comment docstring
   - Any merge migration's `down_revision` tuple that references the old ID
   - Any `depends_on` tuples

4. **`alembic_version.version_num` width is set when the first migration creates the table.** It cannot be changed without a migration that `ALTER TABLE`s it. The safest fix is to keep all revision IDs ≤ 32 characters rather than widening the column, since widening would require a migration that itself needs to fit in the existing column.

## 2026-05-24 — Railway Deployment: CREATE INDEX CONCURRENTLY in Alembic Transaction

1. **`CREATE INDEX CONCURRENTLY` cannot run inside a PostgreSQL transaction block.** Alembic wraps each migration's `upgrade()` function in a transaction by default. Any `create_index(..., postgresql_concurrently=True)` call crashes with `psycopg2.errors.ActiveSqlTransaction`.

2. **The simplest fix is to remove `postgresql_concurrently=True`.** Use a regular `CREATE INDEX` instead. The concurrent variant is an optimization to avoid table locking — removing it is safe for single-deploy migrations on non-production-critical tables.

3. **To properly use `CONCURRENTLY` with Alembic**, wrap the `create_index` call in `with op.get_context().autocommit_block():`. This emits a `COMMIT` before the statement and prevents Alembic from issuing another `COMMIT` after it, satisfying PostgreSQL's "no active transaction" requirement.

## 2026-05-24 — MoneyFlow Income Missing After Pagination

1. **Always cross-reference which data sources feed which chart elements**: The Sankey's income nodes are built solely from the `transactions` prop (merchant-level data), while expense nodes come from the aggregate `catBreakdown` API response. These are two different data pipelines with different pagination characteristics. A fix that appears correct in one view (expenses show up) can silently break another (income disappears).

2. **A `limit: 50` on the parent's `loadData` is invisible to child components**: `FlowView` assumes `transactions` contains all relevant data for the period, but the parent fetches only the 50 most recent items. When total transactions exceed 50, older income transactions get paginated out. Child components should not assume completeness of a paginated data source — always provide a fallback from aggregate APIs.

3. **`buildFlowSummary` should merge data from all available sources**: Income can come from merchant-level transactions (when available) or from the `summary` aggregate API (`summary.total_income`). The function now checks: if `transactions` has income entries, use merchant names; if not but `summary.total_income > 0`, synthesize a single "Income" entry from the total. Don't let one incomplete data source create a false negative.

4. **Verify the data source actually contains what you think it contains**: The `category-breakdown` API filters to `Transaction.label == "expense"` — it explicitly excludes income. The first fix attempted to read income from `catBreakdown.categories`, which can never contain an income entry. When writing a fallback, check the backend endpoint's query filter to confirm the data exists in that response. The `summary` endpoint (`/api/stats/summary`) is the correct source for aggregate income numbers.

5. **Use `esbuild` with `write: false` to inspect compiled output without hitting disk**: When debugging whether a fix survived minification, use `node -e` with the esbuild API and `write: false` to stream the output to stdout. This is faster than rebuilding to disk and avoids polluting the dist directory during investigation.

6. **Use Playwright to isolate the bug to data vs rendering**: When diagnosing a disappearing UI element, first unit-test the data-processing function (`buildFlowSummary`) with mock data, then render-test the component (`FlowView`) with mock data. If both pass, the issue is upstream in the data pipeline — not in the frontend code you changed.

7. **Don't trust that a committed dist file contains the source changes**: The first fix was committed with `git add static/dist/data.js` but the dist file hadn't been rebuilt after the source change. Always rebuild before committing dist files, or use a CI step that fails if dist is stale.

## 2026-05-25/26 — Railway Deployment Deepscan & Public Launch Hardening

### Migration & SQL Compatibility
1. **PostgreSQL rejects `DEFAULT 1` for `BOOLEAN` columns.** Use `sa.text("TRUE")` in Alembic migrations. SQLite silently accepts both; only PostgreSQL catches this at runtime. Always test migrations against a real PG instance.
2. **Every Alembic migration must have a unique `revision` string.** Two files with revision `"0039"` cause Alembic to silently overwrite one. Use descriptive suffixes like `"0039_encrypt_totp_secrets"`. Match the revision string to the filename suffix.
3. **Revision IDs must be ≤ 32 characters.** `alembic_version.version_num` is `VARCHAR(32)` by default. Longer IDs cause `StringDataRightTruncation` after the migration succeeds.
4. **Always match `revision` string to filename's descriptive suffix.** This project's convention is `"{number}_{descriptive_name}"`. Bare numbers create ambiguity with sibling branches.
5. **Never delete a migration file applied to production.** Restore it with `CREATE TABLE IF NOT EXISTS` guards to make it idempotent.
6. **PostgreSQL DDL must be guarded with `if dialect == "postgresql":`.** SQLite tests cannot run `ALTER COLUMN SET NOT NULL`, `DROP CONSTRAINT IF EXISTS`, or `CREATE INDEX CONCURRENTLY`.
7. **`batch_alter_table` behavior differs between PG and SQLite.** On PG it issues direct DDL; on SQLite it recreates the table. Operations that work on one may behave differently on the other.

### Config & Startup
8. **Config validators that raise at module level crash before migrations run.** Railway may not set every env var. Demote length validators to warnings, or gate with environment checks.
9. **JWT_SECRET is optional when using session-based auth.** Don't treat missing JWT_SECRET as fatal.
10. **`datetime.timezone.UTC` never exists in any Python version.** The correct form is `timezone.utc` (lowercase). `datetime.UTC` (module-level constant) was added in Python 3.11, but `timezone.UTC` is never correct.

### ORM & Schema Drift
11. **ORM model emits SELECT for every mapped column — missing column = hard crash.** No graceful fallback. Always ensure DB schema matches model before deploying.
12. **Migration "Running upgrade" log != success.** Errors inside `upgrade()` can be silent. Verify column existence via `information_schema.columns` rather than trusting migration logs.
13. **`InFailedSQLTransactionError` cascading kills all DB ops.** One schema error poisons the entire transaction. Catch early and rollback, or fix the schema.
14. **Dead code hides bugs.** `MerchantStore.record()` took `user_id` param but never used it. When adding required fields to a model, audit ALL code paths that instantiate it.

### Deployment Verification
15. **`/health` 200 does not mean app is fully functional.** Smoke-test key flows (inbox, transaction edit, settings) after every deploy.
16. **JSON Railway logs contain severity + structured tags.** Use `severity` field to distinguish migration messages from runtime errors. Cross-reference `deployment` tag with commit SHA.
17. **NULL-row guards prevent deployment failures.** Before `ALTER COLUMN SET NOT NULL`, count NULLs and skip with warning. Don't crash.
18. **Multi-head migration chains mask pre-existing bugs.** Fix migration-load errors first, then check ALL pending migrations in the resolved chain.

## 2026-05-26 — USD Amount Extraction, LLM Crash, HTML Body Fixes

### timezone.UTC Bug
1. **`datetime.timezone.UTC` does not exist.** The correct attribute is `timezone.utc` (lowercase). `datetime.UTC` (module-level) exists in Python 3.11+ but `timezone.UTC` (class-level) never has. This crashes every import/call that hits it with `"type object 'datetime.timezone' has no attribute 'UTC'"`.

### Currency & Amount Extraction
2. **Prefer foreign currency over INR in pre-extraction when both are detected.** Indian bank emails often contain both (e.g., "USD5.90 spent" in the transaction detail and "₹200 and above" in marketing footers). The regex picks up both; foreign is the more specific signal and should win.
3. **LLM amounts are unreliable — override with regex pre-extraction.** The LLM sometimes returns wrong amounts (e.g., 500 instead of 5000) even when the pre-extraction regex correctly extracts it from the email body. Always use the regex amount when available; the LLM handles label/merchant/category/date.
4. **Rules fallback path must extract amount too.** When the LLM fails, the inline rules fallback in `classify_email()` hardcoded `amount = None`. Must use `pre_extraction.get("amount")` and run currency conversion, same as the LLM path.

### Gmail Body Extraction
5. **Many HTML emails have truncated text/plain fallback parts.** Gmail stores a brief text/plain alternative (often just the first 2 lines) alongside full HTML. `_extract_body_text` must prefer HTML when text/plain is under 100 chars or lacks transaction indicator keywords.
6. **Boilerplate/footer patterns must be carefully vetted against real content.** Pattern `r"thank you for (?:being|choosing)"` matched "Thank you for choosing to invest in Parag Parikh Flexi Cap Fund" — real transaction content, not boilerplate. Stripping from this line removed the amount. Test new boilerplate patterns against known email samples.

### Reclassify Flow
7. **Reclassify always fetches body before calling the API.** `handlePreview()` and `handleConfirm()` both call `handleFetchBody()` internally. The manual "Fetch body" button is optional — just for viewing in the excerpt section. The reclassify works fine without it.
