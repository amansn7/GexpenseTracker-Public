# Lessons

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
