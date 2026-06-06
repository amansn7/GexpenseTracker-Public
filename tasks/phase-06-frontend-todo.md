# [Frontend] Phase 6 Todo: Accessibility & CSS Infrastructure

**Source:** `tasks/phase-06-frontend.md`
**Progress:** 0/12 items

---

## Frontend

### C6 — Interactive Row ARIA

- [ ] Add `role="button"`, `tabIndex`, keyboard handlers to inbox rows
- [ ] Add `aria-selected` to selected rows
- [ ] Fix checkbox accessibility (remove `pointerEvents: "none"`)
- [ ] Add keyboard support to goal cards, debt cards, date group headers
- [ ] Fix minimized sync badge: `<div>` → `<button>`
- [ ] Fix health.jsx "Set starting balance": `<span>` → `<button>`

### C7 — Convert px to rem

- [ ] Convert `styles.css` font sizes to rem
- [ ] Convert inline style font sizes to rem strings
- [ ] Test browser font size at 200% — all text scales

### H2 — Fix --ink-4 Contrast

- [ ] Darken `--ink-4` in Paper theme to meet 4.5:1
- [ ] Darken `--ink-4` in Cool theme
- [ ] Darken `--ink-4` in Midnight theme
- [ ] Darken `--ink-4` in Observatory theme

### M2 — Fix Font Priority

- [ ] Fix font-family order in `index.html` inline style (Geist first)

### M3 — Fix --bg Alias Inconsistency

- [ ] Paper: `--bg: var(--paper)` (not hardcoded hex)
- [ ] Cool: `--bg: var(--paper)`
- [ ] Midnight: `--bg: var(--paper)`

### M4 — Complete Paper & Cool Themes

- [ ] Add `--accent-hover`, `--accent-active` to Paper
- [ ] Add `--accent-hover`, `--accent-active` to Cool
- [ ] Add shadow tokens to Paper and Cool
- [ ] Add overlay/backdrop tokens to Paper and Cool

### M5 — Add OKLCH to All Themes

- [ ] Add OKLCH progressive enhancement to Paper
- [ ] Add OKLCH to Cool
- [ ] Add OKLCH to Midnight

### M8 — Consistent Scrollbar Styling

- [ ] Move scrollbar styles from `index.html` to `styles.css`
- [ ] Add Firefox `scrollbar-width: thin`
- [ ] Apply to all scrollable regions

### M10 — Add aria-live Regions

- [ ] Add `aria-live="polite"` to loading states
- [ ] Add `role="status"` to all spinners
- [ ] Add `role="alert"` to error banners
- [ ] Add `role="log"` to sync progress

### M12 — Fix Duplicate .anim-row-spring

- [ ] Remove duplicate `.anim-row-spring` at styles.css line 994

## Verification

- [ ] WCAG 2.1 AA contrast passes for all text
- [ ] 200% browser font size scales all text
- [ ] Tab through all interactive elements
- [ ] Screen reader announces dynamic changes
- [ ] All 4 themes have consistent tokens
