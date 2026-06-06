# Phase 6: Accessibility & CSS Infrastructure

**Source:** design-audit.md §11.1 (C6, C7), §11.2 (H2), §11.3 (M2, M3, M4, M5, M8, M10, M12)
**Effort:** ~4-5 days
**Dependencies:** Phase 5 (for shared component ARIA)

## Overview

The app has systemic accessibility violations (WCAG 2.1 AA) and CSS infrastructure debt. Every font size is in `px` (no browser scaling), `--ink-4` fails contrast, interactive elements lack ARIA, and themes are inconsistent.

## Items

### C6 — Interactive Row ARIA (1 day)

Audit all interactive `<div>` elements and add proper ARIA:

**Inbox rows** (`inbox-detail.jsx` Row component)
- Add `role="button"`, `tabIndex={0}`
- Add `onKeyDown` for Enter and Space
- Add `aria-selected` when selected
- Make checkbox accessible (remove `pointerEvents: "none"`)

**Goal cards** (`goals.jsx`)
- Add `role="button"`, `tabIndex`, `onKeyDown`

**Debt cards** (`debt.jsx`)
- Same treatment

**Date group headers** (`inbox.jsx`)
- Same treatment

**Sync minimized badge** (`sync-progress.jsx`)
- Change from `<div>` to `<button>`

**Health.jsx "Set starting balance"**
- Change from `<span onClick>` to `<button>` or `<a>`

### C7 — Convert px to rem (1 day)

Convert all hardcoded `px` font sizes to `rem`:

| Current px | rem (base 16) |
|-----------|--------------|
| 10px | 0.625rem |
| 11px | 0.6875rem |
| 12px | 0.75rem |
| 13px | 0.8125rem |
| 14px | 0.875rem |
| 18px | 1.125rem |
| 20px | 1.25rem |
| 22px | 1.375rem |
| 26px | 1.625rem |
| 54px | 3.375rem |

- Focus on `styles.css` first (source of truth)
- Then inline styles in components (use `rem` strings in style objects)
- Keep padding/margins in `px` (they should scale with layout, not user font pref)

### H2 — Fix --ink-4 Contrast (0.5 day)

Darken `--ink-4` in each theme to meet WCAG AA 4.5:1 minimum:

| Theme | Current | Target |
|-------|---------|--------|
| Paper | #a8a297 | #8c877d |
| Cool | #9ca0ac | #7d818f |
| Midnight | #595650 | #6b6760 |
| Observatory | (similar to midnight) | Match |

### M2 — Fix Font Priority (0.25 day)

Remove conflicting font declarations:

- In `templates/index.html` inline style: change `'Inter', 'Geist'` to `'Geist', 'Inter'`
- Or remove the font-family from inline style entirely (let `styles.css` body rule win)

### M3 — Fix --bg Alias Inconsistency (0.5 day)

In `paper`, `cool`, `midnight` themes:
- Change `--bg: #hexvalue` to `--bg: var(--paper)`
- Change `--text: #hexvalue` to `--text: var(--ink)`
- Change `--muted: #hexvalue` to `--muted: var(--ink-3)`
- Change `--dim: #hexvalue` to `--dim: var(--ink-4)`

### M4 — Complete Paper & Cool Themes (1 day)

Add the tokens that only Observatory has:

- `--accent-hover`
- `--accent-active`
- `--shadow-sm`, `--shadow-md`, `--shadow-lg`
- `--overlay`
- `--backdrop`
- `--surface-inverted`, `--on-surface-inverted`

### M5 — Add OKLCH to All Themes (0.5 day)

Add OKLCH progressive enhancement values alongside hex in Paper, Cool, Midnight:

```css
--paper: #f6f3ec;
--paper: oklch(94% 0.015 85);
```

### M8 — Consistent Scrollbar Styling (0.25 day)

- Move scrollbar styles from `index.html` inline style to `styles.css`
- Apply consistently to all scrollable regions (not just WebKit — consider `scrollbar-width: thin` for Firefox)

### M10 — Add aria-live Regions (0.5 day)

- Add `aria-live="polite"` to loading states, error messages, sync status, toast containers
- Add `role="status"` to spinners
- Add `role="alert"` to error banners
- Add `role="log"` to sync progress log

### M12 — Fix Duplicate .anim-row-spring (0.1 day)

Remove the duplicate at `styles.css:994`, keep the version at line 863 (which has the staggered animation-delay).

## Verification

- [ ] WCAG 2.1 AA contrast check passes for all text sizes
- [ ] Browser font size set to 200% — all text scales proportionally
- [ ] Tab through inbox — every interactive element is focusable
- [ ] Screen reader announces loading states, errors, sync progress
- [ ] All 4 themes are consistent in available tokens
- [ ] Scrollbar styling consistent across views
