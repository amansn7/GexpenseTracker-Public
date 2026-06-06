# Agent Instructions: Lessons & Patterns

## Git: Prevent unintended changes in commits

1. `git add -A` stages ALL changes in the working tree, including unrelated dirty files from previous sessions. Always run `git diff --cached --stat` before committing to verify only intended files are staged.
2. If unintended files are present, use `git reset HEAD <file>` to unstage them, or `git checkout HEAD -- <file>` to revert the working tree version.
3. This is especially important when switching contexts between feature work.

## React: useEffect dependency arrays referencing render-time `const` variables

A `useEffect` dependency array is evaluated **during render**. If it references a `const` or `let` that's declared later in the function body, you'll hit a **Temporal Dead Zone** error.

**Fix**: Move the `useEffect` call to **after** the variable declaration in the function body. React only requires consistent hook **order**, not that hooks be at the top of the function.

## Frontend CSS Consistency

1. When fixing form element CSS app-wide, fix **shared style objects first** — they cascade to the most elements with fewest edits.
2. Design spec for form elements: `background: var(--card)`, `border: 1px solid var(--line)`, `border-radius: 6px`, `padding: 8px 10px`, `color: var(--ink)`, `font-family: inherit`, `outline: none`, `box-sizing: border-box`.
3. Grep tip for CSS variable patterns: Use `background:\s*"var\(--paper\)"` — the parentheses must be escaped for regex.

## Row Rerender Pattern: React.memo Object Identity

When using `React.memo` on list rows, compare by **object identity** (`prev.tx === next.tx`) rather than shallow prop diff. This ensures edits trigger immediate re-render without relying on new object creation or deep comparison.

## Edit Flow Pattern: Decouple AI Suggestion from User Edit

Instead of calling reclassify-commit APIs (which re-run AI extraction), use PATCH endpoints with user-edited fields directly. Users can override label/amount/merchant/category independently of the AI.

## Database Query Patterns

1. Always verify schema matches model before deploying. ORM models emit SELECT for every mapped column — missing column = hard crash.
2. When querying production: always filter by the correct user. Multi-tenant data requires explicit user scoping.
3. Use proper JOINs for indirect relationships instead of assuming direct FK access.
4. `InFailedSQLTransactionError` cascading kills all DB ops. One schema error poisons the entire transaction.
5. Test suites often use ORM `metadata.create_all()`, not Alembic migrations. Migration bugs are invisible to tests — validate against a production-like DB.
6. Before running `ALTER COLUMN SET NOT NULL`, count NULLs first. Skip with warning instead of crashing.

## Alembic Migrations

1. PostgreSQL rejects `DEFAULT 1` for BOOLEAN columns. Use `sa.text("TRUE")`.
2. `CREATE INDEX CONCURRENTLY` cannot run inside a PostgreSQL transaction. Wrap in `autocommit_block()`.
3. Every migration must have a unique `revision` string matching its filename suffix. Convention: `"{number}_{descriptive_name}"`.
4. Revision IDs must fit the target DB's column width (commonly VARCHAR(32)).
5. Never delete a migration file applied to production. Restore it with guards to make it idempotent.
6. Alembic's `transactional_ddl` wraps all migrations in a single transaction. Any failure rolls back everything.
7. To bypass Alembic's transaction, create a separate engine with `isolation_level="AUTOCOMMIT"`.
8. Migration "Running upgrade" log ≠ successful upgrade. Verify independently.
9. Multi-head migration chains mask pre-existing bugs. Fix load errors first, then inspect all pending migrations.

## Frontend Build & JSX

1. Two things needed to expose a module-level view component globally: (a) `window.ComponentName = ComponentName` in the source file, AND (b) a `<script>` tag in the HTML template before the consumer script.
2. A "can't find variable" error with correct compiled output means the file is not loaded. Check HTML script tags before debugging component code.
3. Minifiers rename local variables. Search for `window.ExportedName=` not `=OriginalName`.
4. Some JSX transformers double-escape unicode escapes in JSX text content. Prefer literal characters over `\uXXXX` in JSX text.
5. Always verify compiled output before committing: check file size is meaningful.
6. Rebuild dist files before committing — committed stale dist files silently break deployments.
7. When moving inline CSS to external files, verify the stylesheet is loaded in the correct template. Check the actual page head.

## Data Pipeline & API Patterns

1. Don't trust ML-generated amounts — override with regex pre-extraction when available. Use ML for label/merchant/category/date.
2. Fallback code paths must implement the same extraction logic as primary paths. Hardcoded nulls in fallbacks silently lose data.
3. Filter predicates must not silently drop valid items. Accept anything matching the broadest reasonable criteria.
4. Child components must not assume completeness of a paginated parent datasource. Provide fallback from aggregate APIs.
5. Merge data from all available sources rather than letting one incomplete datasource create false negatives.
6. Synthetic catch-all buckets are not real filter values. The query must match NULLs and anything NOT IN known values.

### Idempotency & Error Handling

1. Add `ondelete="CASCADE"` to all FK constraints where children should not outlive parents.
2. Service code should defensively clean up children before deleting parents, even when the DB model has CASCADE.
3. Errors after UI elements are removed from the DOM must use persistent notification mechanisms (toasts), not state-driven alerts.
4. Client-side "undo" via reverse API calls is fragile. Use a server endpoint that knows exactly what to revert.
5. Shared-domain side effects break naive undo. Implement true reference counting, not blind deletion.

## UI/UX Patterns

1. When spreading two style objects where one sets `border` shorthand and another sets `borderColor` longhand, React resolves the mixed approach incorrectly. Always use full `border` shorthand in override objects.
2. Container `role="radiogroup"` + `aria-label`. Each option: `role="radio"` + `aria-checked={active}`.
3. When setting `outline: "none"`, always provide a focus indicator replacement via `onFocus`/`onBlur` handlers with `boxShadow`.
4. All interactive state changes should use `transition: "background 120ms ease, color 120ms ease"` for consistency.
5. Use `null` (not `[]` + loading flag) for "not yet loaded" state. Avoids flash of empty state.
6. Never assume CSS variable naming matches actual usage. Verify where it's applied.
7. Precompute layout values before entering rendering loops (e.g., SVG path generation).
8. Reuse computed values across sibling components. Compute once in the parent and pass down.

## Deployment & Observability

1. Health check endpoints returning 200 do not mean the app is fully functional. Smoke-test key user flows after every deploy.
2. Config validators that raise at module level crash the process before dependencies are ready. Demote to warnings or gate with environment checks.
3. Optional config values should not be treated as fatal when missing. Only fail hard for truly required values.
4. Log severity labels may be unreliable. Filter real errors by looking for traceback patterns, not severity fields.
5. Log ingestion systems have rate limits. Excessive log volume can drop debugging data.
6. Dead code in data-layer classes hides bugs. When adding required fields to models, audit ALL code paths that instantiate them.
7. Navigate to empty results rather than leaving the user on the previous view.

## Security

Every endpoint that queries by record ID must also scope by the authenticated user. Any `select(Model).where(Model.id == ...)` without a user filter is a latent authorization vulnerability.

## Modal & Fixed Positioning

1. `animation-fill-mode: both` on a keyframe that includes `transform` creates a new containing block for `position: fixed` children. Remove `transform` from all keyframes on ancestor elements that contain modals, or render modals outside any transforming ancestor.
2. Body scroll lock (`document.body.style.overflow = "hidden"`) is essential when opening modals.
3. Always add `maxHeight: "90vh"; overflowY: "auto"` to modal cards.
4. If using a manual CSS cache buster (`?v=N`), always bump version when modifying CSS.
5. The inline `<style>` block in HTML templates comes after `<link>` to external CSS, so same-specificity rules in the inline block win the cascade.

## Visual & CSS

1. SVG text contrast must account for all themes. Use theme-aware variables.
2. When removing inline hover handlers, verify CSS classes provide the default styles.

## CSP & Security

React/SPA apps that use `style={{...}}` props generate inline `style` attributes. These require `'unsafe-inline'` in `style-src`. The nonce mechanism only protects `<style>` blocks, not `style` attributes. Removing `'unsafe-inline'` breaks all component styling.

## Data Display Mismatches

1. When a filter tab's count and content mismatch, the root cause is usually different data sources. Fix by using the same data source for both or making the tab self-contained.
2. Merging API results into a main array via `setState(prev => [...prev, ...items])` is fragile — it can race with other state updates. Self-contained state avoids this.
3. For minified frontend builds, always verify the dist file contains the expected logic by grepping for key strings.

## LLM JSON Parsing & React Error #31

1. **Never render an API/LLM response field directly as a React child** without checking its type. LLM-generated JSON is unpredictable.
2. **Check every `{field}` in JSX for potential object values.** Common culprits: `goal_impact`, `savings_plan`, `projection`, `description`.
3. **Pattern for safe rendering:** `{typeof val === "object" ? (val.message || val.description || JSON.stringify(val)) : val}`
4. **Lesson: LLM API responses can change shape.** Never assume the LLM follows the format spec.
5. LLMs often return Python dict syntax instead of valid JSON. Include `ast.literal_eval` as a fallback for complex responses.
6. Each `.format()` placeholder in a prompt template MUST have a corresponding keyword argument.
7. Post-process LLM outputs that include numeric limit/savings values. Clamp to `max(0, value)`.

## Stats Pipeline

1. Budget vs expense category matching must normalize case. Use `.lower()` on both sides and **accumulate** values — last-write-wins silently drops duplicate categories.
2. The canonical categories use lowercase. DB stores mixed case from LLM extraction. Every comparison path must normalize.
3. Simplify computations with direct `func.sum()` + date range instead of fetching all rows + Python-side filtering.
4. When replacing old endpoint implementations with a service layer, ensure every referenced helper function still exists.
5. A fallback path that returns all zeros is worse than no fallback. Test fallback code.
6. When numbers don't make sense, query the database directly.
7. Production DB queries must explicitly filter by target user.

## Sync & Background Processing

1. Rollups must be recomputed after data creation events (sync, PATCH, bulk actions).
2. If a service function uses `flush()` not `commit()`, callers must commit afterward.
3. Accessing ORM model fields after `session.commit()` crashes with `MissingGreenlet` because `expire_on_commit=True` expires all objects. Read needed fields BEFORE commit.
4. Classifier pipelines can have multiple stages — be aware that retry stages may return different results than initial stages.
5. Global rule tables (no user_id) affect all users — last-write-wins for multiple rules on same key.

## Language-Specific Gotchas

1. `datetime.timezone.UTC` does not exist in Python. Use `timezone.utc` (lowercase).

## WebAuthn

1. `webauthn>=2.0.0` switched from Pydantic to dataclasses. No `model_validate()`, `.json()`, or `.model_dump_json()`. Use `options_to_json()` for serialization.
2. Pass credential dicts directly to verify functions — both accept `Dict[str, Any]`.
3. `credential_id` and `credential_public_key` are `bytes`. Convert with `bytes_to_base64url()` and `base64url_to_bytes()`.
4. `PublicKeyCredential.toJSON()` is not available in all browsers. Always provide fallback serialization.
5. `atob()` only handles standard base64 (`+`, `/`), not base64url (`-`, `_`). Always replace before decoding.
