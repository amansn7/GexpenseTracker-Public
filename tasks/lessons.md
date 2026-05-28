# Agent Instructions: Lessons & Patterns

## Alembic Migrations

### PostgreSQL DDL Compatibility
1. PostgreSQL rejects `DEFAULT 1` for BOOLEAN columns. Use `sa.text("TRUE")`. Raw `op.create_table()` DDL does not benefit from ORM type-aware default compilation — `sa.text("1")` generates `DEFAULT 1` verbatim.
2. `CREATE INDEX CONCURRENTLY` cannot run inside a PostgreSQL transaction. Wrap in `with op.get_context().autocommit_block():`, or remove `postgresql_concurrently=True` for non-production tables.
3. `batch_alter_table` differs between PG (direct DDL) and SQLite (table recreation). Guard PG-only operations with `if dialect == "postgresql":`.

### Revision ID Management
4. Every migration must have a unique `revision` string matching its filename suffix. Never use bare numbers — sibling branches cause silent overwrite. Convention: `"{number}_{descriptive_name}"`.
5. Revision IDs must fit the target DB's column width (commonly VARCHAR(32)). Longer IDs cause truncation errors after the migration succeeds.
6. When renaming a revision ID, update: the `revision` string, the docstring, any merge migration's `down_revision` tuple, and any `depends_on` tuples.
7. Never delete a migration file applied to production. Restore it with guards to make it idempotent.

### Transaction & Schema Drift
8. Alembic's `transactional_ddl` wraps all migrations in a single transaction. Any failure rolls back everything. DDL changes are NOT visible to other migrations in the same run until commit.
9. PostgreSQL DO blocks with EXCEPTION roll back DDL inside the block (subtransaction rollback). Do not use EXCEPTION blocks for DDL that must persist.
10. `ADD COLUMN IF NOT EXISTS` and `information_schema.columns` can trust stale metadata after table recreation. Use `pg_attribute` for definitive column existence checks.
11. To bypass Alembic's transaction, create a separate engine with `isolation_level="AUTOCOMMIT"`.
12. ORM models emit SELECT for every mapped column — missing column = hard crash. Verify schema matches model before deploying.
13. `InFailedSQLTransactionError` cascading kills all DB ops. One schema error poisons the entire transaction.
14. Migration "Running upgrade" log ≠ successful upgrade. Verify independently.
15. Multi-head migration chains mask pre-existing bugs. Fix load errors first, then inspect all pending migrations.
16. Test suites often use ORM `metadata.create_all()`, not Alembic migrations. Migration bugs are invisible to tests — validate against a production-like DB.
17. Before running `ALTER COLUMN SET NOT NULL`, count NULLs first. Skip with warning instead of crashing.

## Frontend Build & JSX

### Global Component Registration
1. Two things needed to expose a module-level view component globally: (a) `window.ComponentName = ComponentName` in the source file, AND (b) a `<script>` tag in the HTML template before the consumer script. Build tools typically only update content hashes for existing script tags — they do not add new ones.
2. A "can't find variable" error with correct compiled output means the file is not loaded. Check HTML script tags before debugging component code.
3. Minifiers rename local variables, so `window.ExportedName=A;` is correct output. Search for `window.ExportedName=` not `=OriginalName`.

### Build Tool Pitfalls
4. Some JSX transformers double-escape unicode escapes in JSX text content (between tags, not in `{}`). Prefer literal characters over `\uXXXX` in JSX text. Inside JS expressions (`{}`), template literals, and string literals, unicode escapes work normally.
5. Always verify compiled output before committing: check file size is meaningful (not an empty shell), or inspect compiled output with `write: false`.
6. Rebuild dist files before committing — committed stale dist files silently break deployments.
7. Count parentheses when wrapping in higher-order functions: `React.memo()` adds one `(` — close with `));`.
8. When moving inline CSS to external files, verify the stylesheet is loaded in the correct template. Check the actual page head, not just your working file.
9. When removing inline style properties, verify CSS classes provide the same defaults. Browser default values differ from removed inline values.

## Data Pipeline & API Patterns

### Classification & Extraction
1. When multiple currencies are detected in input, prefer the more specific signal (e.g., foreign currency over local marketing text).
2. Don't trust ML-generated amounts — override with regex pre-extraction when available. Use ML for label/merchant/category/date.
3. Fallback code paths must implement the same extraction logic as primary paths. Hardcoded nulls in fallbacks silently lose data.
4. When wiring new code paths from existing pipeline output, verify every field is mapped in the target constructor. Silent defaults hide data loss.
5. Filter predicates must not silently drop valid items. Accept anything matching the broadest reasonable criteria — narrow only when necessary.
6. Cross-reference which data sources feed which downstream consumers. Different pipelines have different pagination, filtering, and completeness characteristics.
7. Child components must not assume completeness of a paginated parent datasource. Provide fallback from aggregate APIs.
8. Merge data from all available sources rather than letting one incomplete datasource create false negatives.
9. Synthetic catch-all buckets are not real filter values. When a category filter has catch-all semantics, the query must match NULLs and anything NOT IN known values — not just the explicit bucket name.

### Idempotency & Error Handling
10. Add `ondelete="CASCADE"` to all FK constraints where children should not outlive parents. Missing cascade causes hard-to-reproduce production crashes.
11. Service code should defensively clean up children before deleting parents, even when the DB model has CASCADE. The cascade handles DB-level constraints; the service handles identity-map edge cases.
12. Errors after UI elements are removed from the DOM must use persistent notification mechanisms (toasts), not state-driven alerts rendered inside the removed element.
13. Client-side "undo" via reverse API calls is fragile. Use a server endpoint that knows exactly what to revert.
14. Shared-domain side effects break naive undo. When shared resources are involved (e.g., allowlist with hit counts), implement true reference counting, not blind deletion.

## UI/UX

1. Use `null` (not `[]` + loading flag) for "not yet loaded" state. The first render shows "Loading"; API response sets the real value, avoiding a flash of empty state.
2. Offer toggles between two framings of the same metric rather than picking one opinionated view. Both show the same data — only the label/color/framing changes.
3. Never assume CSS variable naming matches actual usage. A variable named `*-ink` may return background/fill colors, not text colors. Verify where it's applied.
4. Precompute layout values before entering rendering loops (e.g., SVG path generation).
5. Reuse computed values across sibling components. Compute once in the parent and pass down.

## Deployment & Observability

1. Health check endpoints returning 200 do not mean the app is fully functional. Smoke-test key user flows after every deploy.
2. Config validators that raise at module level crash the process before dependencies are ready. Demote to warnings or gate with environment checks.
3. Optional config values should not be treated as fatal when missing. Only fail hard for truly required values.
4. Log severity labels may be unreliable (e.g., "error" for info-level messages). Filter real errors by looking for traceback patterns, not severity fields.
5. Log ingestion systems have rate limits. Excessive log volume (e.g., crash loops) can hit these limits and drop debugging data.
6. Structured logs contain searchable fields. Cross-reference deployment IDs with commit SHAs.
7. Dead code in data-layer classes hides bugs. When adding required fields to models, audit ALL code paths that instantiate them.
8. Navigate to empty results rather than leaving the user on the previous view. Seeing an empty state is better than wondering if the action did anything.

## Language-Specific Gotchas

1. `datetime.timezone.UTC` does not exist in Python. Use `timezone.utc` (lowercase). `datetime.UTC` (module-level) exists in Python 3.11+, but the class-level attribute never has.

## Security

1. Every endpoint that queries by record ID must also scope by the authenticated user. Any `select(Model).where(Model.id == ...)` without a user filter is a latent authorization vulnerability.

## External Data Extraction (Email/HTML)

1. When extracting text from multipart messages, prefer HTML over text/plain when the text/plain part is unusually short or lacks domain-specific keywords. Text/plain parts are often truncated summaries.
2. Test new boilerplate/footer strip patterns against known real content before applying. Aggressive patterns can strip meaningful data that shares phrasing with boilerplate.
3. Two separate processing queues for the same conceptual stage is an architecture smell. Surface both to the UI or merge them — hidden queues rot.
4. When a preprocessing pipeline calls an external API, check whether it already calls the necessary data-fetch internally. Manual fetch buttons may be optional.

## Visual & CSS

1. SVG text contrast must account for all themes. Light theme fills are often too light for hardcoded `fill="white"`. Use theme-aware variables on light fills, white only on semantically dark fills.
2. When removing inline hover handlers, verify CSS classes provide the default styles. Browser defaults for button backgrounds differ from explicit `background: transparent`.

## CSP & Security

1. React/SPA apps that use `style={{...}}` props generate inline `style` attributes on DOM elements. These require `'unsafe-inline'` in `style-src`. The nonce mechanism only protects `<style>` blocks, not `style` attributes. Removing `'unsafe-inline'` breaks all component styling in modern browsers.
2. CSP `'unsafe-inline'` in `style-src` is standard for React SPAs — the security tradeoff accepts inline style attributes in exchange for the app being functional. If stricter CSP is desired, the entire app must be refactored to use CSS classes exclusively. Apply this knowledge before ever modifying the CSP policy.

## Data Display Mismatches

1. When a filter tab's count and its actual content mismatch, the root cause is usually different data sources: the count comes from a server query (e.g., `/api/review?count=true`) while the content is derived from a locally loaded data set (e.g., first 50 transactions from `/api/transactions`). Fix by either:
   - Using the same data source for both count and content (e.g., count from `transactions.filter(...)`)
   - Making the tab self-contained with its own fetch + internal state (preferred for special-purpose tabs like needs_review)
2. Merging API results into the main `transactions` array via `setTransactions(prev => [...prev, ...items])` is fragile — it can race with other state updates (loadMore, loadData). Self-contained state inside the component (`needsReviewItems`) avoids this entirely.
3. For minified frontend builds, always verify the dist file contains the expected logic by grepping for key strings. esbuild's minifier preserves string literals so `"needs_review"` remains searchable.
