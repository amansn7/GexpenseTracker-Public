# Phase 7: Monolith Decomposition

**Source:** design-audit.md §11.2 (H3, H4, H5)
**Effort:** ~5 days
**Dependencies:** Phase 5 (shared component lib should be available for refactored code to use)

## Overview

Three components exceed 1,000 lines (one exceeds 2,800). These are the highest-risk files in the codebase. This phase splits each into smaller, focused modules.

## Items

### H3 — Split account.jsx (2,820 lines → 4 files) — 2 days

Current file contains: ProfileView, SettingsView, Admin sections, Rules system, Category editor, Invitations, AI services.

Extract into:

| New File | Lines | Contains |
|----------|-------|----------|
| `account.jsx` | <500 | ProfileView (basic info, financial snapshot, categories) |
| `settings-view.jsx` | <600 | SettingsView (prefs, AI services, export, security, delete account) |
| `admin-view.jsx` | <500 | AdminView (sync, LLM status, alerts, backfill, fetch-preview) |
| `rules-section.jsx` | <500 | All rule sections (sender, pattern, merchant aliases, filters, builtin) |
| `rule-modal.jsx` | <200 | RuleModal component (extracted from rules-section.jsx) |

Keep `window.*` exports for the build system, but use `export` statements for internal imports.

### H4 — Split budgets.jsx (1,150 lines → 3 files) — 1 day

| New File | Lines | Contains |
|----------|-------|----------|
| `budgets.jsx` | <400 | BudgetsView shell, budget list, budget cards |
| `budget-modal.jsx` | <400 | BudgetModal (create/edit, adaptive suggestions, anomaly adjust) |
| `budget-llm-sections.jsx` | <400 | HealthCheckSection, GoalOptimizationSection, SuggestAllModal |

### H5 — Split inbox.jsx (2,257 lines → 5 files) — 2 days

| New File | Lines | Contains |
|----------|-------|----------|
| `inbox.jsx` | <600 | InboxView shell, rendering, filter tabs, infinite scroll |
| `search-view.jsx` | <400 | SearchView (separated from inbox.jsx bottom) |
| `review-tab.jsx` | <400 | Review tab, ReviewEmailRow, GroupSection, ReviewDetailPanel |
| `duplicate-tab.jsx` | <300 | Duplicate tab (duplicate pairs, resolution) |
| `bulk-reclass-wizard.jsx` | <400 | Bulk reclass modal, preview, apply flow |

### Refactoring Approach

For each split:
1. Create new file with `export` declarations
2. Copy extracted code, remove from original
3. Import in original file
4. Assign to `window.*` in the new file
5. Update esbuild `build-frontend.mjs` to include new files
6. Test that the view renders identically

## Verification

- [ ] No file exceeds 800 lines
- [ ] All views render identically to pre-split
- [ ] Build succeeds (`npm run build`)
- [ ] No circular dependencies between extracted modules
- [ ] Each extracted module has a single responsibility
