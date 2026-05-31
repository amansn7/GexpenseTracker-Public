# Agent Instructions: Lessons & Patterns

## Frontend CSS Consistency

### Batch Pattern for Form Element Styling Fixes
1. When fixing form element CSS app-wide, fix **shared style objects first** (`accountStyles.input`, `S.input`, `S.textarea`) — they cascade to the most elements with fewest edits. Then fix inline input/select/textarea elements using `var(--paper)` → `var(--card)`, and finally add missing properties (`outline: "none"`, `boxSizing: "border-box"`, `fontFamily: "inherit"`).
2. Design spec for form elements: `background: var(--card)`, `border: 1px solid var(--line)`, `border-radius: 6px`, `padding: 8px 10px`, `color: var(--ink)`, `font-family: inherit`, `outline: none`, `box-sizing: border-box`.
3. Inline editors (merchant, balance) and compact preview rows may use reduced padding (e.g., `6px 10px` or `5px 8px`) — but keep background/border/radius/font/outline/boxSizing consistent.
4. **Grep tip for CSS variable patterns:** Use `background:\s*"var\(--paper\)"` — the parentheses must be escaped for regex. Without proper escaping, searches miss matches.

## Row Rerender Pattern

### React.memo Object Identity for List Items
1. When using `React.memo` on transaction rows, compare by **object identity** (`prev.tx === next.tx`) rather than shallow prop diff on sub-properties. This ensures edits to category/amount/merchant on the same object trigger immediate re-render without relying on new object creation or deep comparison.
2. `RowMemo` with `prev.tx === next.tx` + `prev.selected === next.selected` is sufficient — the tx reference changes when any field is edited via PATCH response, and the selected flag changes on check.

## Edit Flow Pattern

### User-Edited Reclassification
1. When adding reclassify-as-you-go UX, **decouple AI suggestion from user edit**. Instead of calling the reclassify-commit API (which re-runs AI extraction), use PATCH endpoints with user-edited fields directly. Users can override label/amount/merchant/category independently of the AI.
2. For bulk operations, offer optional amount + merchant override fields alongside label/category in the modal. Pre-fill from the most recent selection, leave blank = keep current value.

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

## Modal & Fixed Positioning

1. `animation-fill-mode: both` on a keyframe that includes `transform` (even `translateY(0)`) creates a new containing block for `position: fixed` children. If the element scrolls, the "fixed" child scrolls with it — the top gets cut off. Fix: remove `transform` from all keyframes on ancestor elements that contain modals, or render modals outside any transforming ancestor.

2. Body scroll lock (`document.body.style.overflow = "hidden"`) is essential when opening modals. Without it, background scrolling can misalign `position: fixed` overlays on some browsers (especially Safari with grid layouts and overscroll behavior).

3. Always add `maxHeight: "90vh"; overflowY: "auto"` to modal cards. Without it, tall modal content overflows the viewport on small screens, and the centered flex layout clips the top.

4. `styles.css` uses a manual cache buster (`?v=N` in templates/index.html). The build script only auto-hashes JS dist files, not CSS. Always bump `styles.css` version when modifying it.

5. The inline `<style>` block in `templates/index.html` comes after the `<link>` to `styles.css`, so same-specificity rules in the inline block win the cascade.

6. `.view-enter` wraps ALL views in `app.jsx`. Its `@keyframes viewEnter` had `transform: translateY(4px)` in the `from` state with `animation-fill-mode: both`. This creates a containing block for `position: fixed` descendants during the 200ms animation window — any modal opened within that window is cut off at the top. Fix: remove `transform` from the keyframe entirely. The opacity-only `fadeIn` approach is safer for wrappers that contain `position: fixed` children.

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

## LLM JSON Parsing

## React Error #31 — Object as Child

1. **Never render an API/LLM response field directly as a React child** without checking its type. LLM-generated JSON is unpredictable — a field expected to be a string may be an object, array, or null. Always guard with `typeof val === "object" ? ... : val`.
2. **Check every `{field}` in JSX for potential object values.** Common culprits: LLM-returned fields like `goal_impact` values, `savings_plan`, `projection`, `description` — anything from a `suggest-plan`, `health-check`, or `adaptive-plan` response. One missed check = production crash.
3. **Pattern for safe rendering:**
   `{typeof val === "object" ? (val.message || val.description || JSON.stringify(val)) : val}`
4. **History:** Previously fixed `healthCheck.goal_impact` with `Object.entries()` to avoid direct access, but `{msg}` still crashed when LLM returned objects `{message, threat}` instead of strings. The `savings_plan` field (`{description, target_rate_pct, ...}`) was also rendered as a raw object in `BudgetModal`.
5. **Lesson: LLM API responses can change shape.** Never assume the LLM follows the format spec. Every field rendered in JSX needs a defensive type check.

1. LLMs often return Python dict syntax (`{'key': 'value'}` with `True`/`False`) instead of valid JSON (`{"key": "value"}` with `true`/`false`). The `_REPAIRERS` from `parsing.py` handle this for simple cases, but `.replace("'", '"')` breaks on apostrophes within string values (e.g., `"Maids's Salary"`). Always include `ast.literal_eval` as a fallback for complex LLM responses with natural language.
2. Each `.format()` placeholder in a prompt template MUST have a corresponding keyword argument. Missing placeholders cause hard `KeyError` at runtime — test against production data before shipping.
3. Post-process LLM outputs that include numeric limit/savings values. LLMs can produce negative `suggested_limit` values when trying to express "reduce by X amount" as `current - X`. Clamp to `max(0, value)`.
4. The anomaly-adjust endpoint should compute a useful baseline even when LLM analysis fails — use median of all available transactions as fallback rather than returning 0.

## Stats Pipeline

### Case-Insensitive Category Matching
1. Budget vs expense category matching must normalize case. `dict.get()` with mixed-case keys returns Rs0. Use `.lower()` on both sides and **accumulate** with `dict[key] = dict.get(key, 0) + amount` — last-write-wins silently drops duplicate categories ("food" + "Food" → only one survives).
2. Apply `.lower()` at the same stage for both budget lookup keys and spend_map accumulation keys, not just one.
3. The canonical categories in `categories.py` use lowercase (e.g., `rent`, `food`). DB stores mixed case from LLM extraction. Every comparison path must normalize.

### Income Attribution
4. Late-month income (last 2 working days) should not be shifted to next month. When removing a business rule, verify all downstream consumers (monthly summary, 90-day, health) get the expected data.
5. Simplify income computation with direct `func.sum()` + `txn_date` range instead of fetching all rows + Python-side filtering — avoids filter drift between income and expense paths.

### Survivorship of Referenced Functions
6. When replacing old endpoint implementations with a service layer, ensure every referenced helper function (`_monthly_data`, `_compute_confidence`, etc.) still exists or is properly redirected. A deleted function breaks its entire section silently (zeros or 500).

### Fallback Code Must Actually Work
7. A fallback path that returns all zeros is worse than no fallback. Test fallback code too — `return {"income": 0, "expense": 0}` placeholder is indistinguishable from "no data" errors.

### Verify Against the Database
8. When numbers don't make sense, query the database directly. Tracing through layers of service code, filter chains, and SQLAlchemy queries is slower than one `SELECT * FROM transactions WHERE category ILIKE '%rent%'`. The case mismatch was sitting in the DB the whole time.

### Production DB Multi-User Awareness
9. `SELECT LIMIT 1` may return a service/bot user (e.g., `service@localhost`), not the real human user. Always explicitly filter by the target user email in production ad-hoc queries.
