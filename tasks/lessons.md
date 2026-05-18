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
