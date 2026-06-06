# [Frontend] Phase 7 Todo: Monolith Decomposition

**Source:** `tasks/phase-07-frontend.md`
**Progress:** 0/7 items

---

## Frontend

### H3 — Split account.jsx (2,820 lines)

- [ ] Extract `settings-view.jsx` (< 600 lines)
- [ ] Extract `admin-view.jsx` (< 500 lines)
- [ ] Extract `rules-section.jsx` (< 500 lines)
- [ ] Extract `rule-modal.jsx` (< 200 lines)
- [ ] Trim `account.jsx` to < 500 lines (ProfileView only)
- [ ] Update esbuild config, verify build and render

### H4 — Split budgets.jsx (1,150 lines)

- [ ] Extract `budget-modal.jsx` (< 400 lines)
- [ ] Extract `budget-llm-sections.jsx` (< 400 lines)
- [ ] Trim `budgets.jsx` to < 400 lines
- [ ] Update esbuild config, verify build and render

### H5 — Split inbox.jsx (2,257 lines)

- [ ] Extract `search-view.jsx` (< 400 lines)
- [ ] Extract `review-tab.jsx` (< 400 lines)
- [ ] Extract `duplicate-tab.jsx` (< 300 lines)
- [ ] Extract `bulk-reclass-wizard.jsx` (< 400 lines)
- [ ] Trim `inbox.jsx` to < 600 lines
- [ ] Update esbuild config, verify build and render

## Verification

- [ ] No file exceeds 800 lines
- [ ] All views render identically to pre-split
- [ ] `npm run build` succeeds
- [ ] No circular dependencies
