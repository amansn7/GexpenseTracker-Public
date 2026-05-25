# Taste Skill Frontend Review — MoneyFlow

**Date**: 2026-05-24  
**Skill**: [Taste Skill](https://github.com/Leonxlnx/taste-skill) — `design-taste-frontend`  
**Config**: `DESIGN_VARIANCE: 8 | MOTION_INTENSITY: 6 | VISUAL_DENSITY: 4`

---

## Executive Summary

The MoneyFlow frontend is a custom React SPA with 13 JSX source files, pure CSS with 4 themes, and no build framework in dev (Babel standalone). It already avoids many common AI slop patterns (no glassmorphism, no gradient text, no glows) but has 5 critical violations and 7 moderate issues against Taste Skill standards.

---

## Baseline Alignment

| Dial | Target | Actual | Gap |
|------|--------|--------|-----|
| DESIGN_VARIANCE | 8 (asymmetric) | ~3 (standard layout) | Large |
| MOTION_INTENSITY | 6 (fluid CSS + spring) | ~3 (basic transitions) | Large |
| VISUAL_DENSITY | 4 (spacious) | ~5 (reasonable) | Small |

---

## 🔴 Critical Violations

### C1: Inter font is BANNED but listed first
**File**: `static/styles.css:312`
```css
font-family: 'Inter', 'Geist', system-ui, ...
```
**Taste Rule**: *"NO Inter Font: Banned. Use Geist, Outfit, Cabinet Grotesk, or Satoshi."*
**Fix**: Move `'Geist'` before `'Inter'`

### C2: Pure black/white used for print styles and on-accent
**File**: `static/styles.css:85,146,690,693`
```css
--on-accent:   #ffffff;
background: #fff !important; color: #000 !important;
```
**Taste Rule**: *"NO Pure Black: Never use #000000."*
**Fix**: Use tinted values (`var(--paper)`, warm off-white/off-black)

### C3: Side-stripe border on active nav items
**File**: `static/src/shell.jsx:64`
```js
navItemActive: { boxShadow: "inset 2px 0 0 0 var(--accent)" }
```
**Taste Rule**: *"Side-stripe borders (border-left > 1px as colored accent on cards, list items, callouts, or alerts) — never intentional."*
**Fix**: Replace with full background highlight or top/bottom border

### C4: Inline hover handlers instead of CSS
**File**: `static/src/shell.jsx:128,134,146,163` (6 instances)
```js
onMouseEnter={e => e.currentTarget.style.background = "var(--paper-2)"}
```
**Taste Rule**: *"Use CSS :hover — never inline onMouseEnter handlers"*
**Fix**: Replace with existing `.hover-bg` CSS class (`styles.css:420-423`)

### C5: Emojis used as UI indicators
**Files**: `static/src/inbox.jsx`, `account.jsx`, `admin.jsx`, `debt.jsx`, `onboarding.jsx` (33 instances)
```js
✓ ✗ ✦ 🎉 ⚡ ✕
```
**Taste Rule**: *"ANTI-EMOJI POLICY [CRITICAL]: NEVER use emojis in code."*
**Fix**: Replace with project's existing `<Icon>` component (78 SVG icons available)

---

## 🟡 Moderate Issues

### M1: 100vh still used in 14+ places while 100dvh in 8 newer files
**Files**: `styles.css:317,322,333`, `app.jsx` (5x), `flow.jsx`, `dashboard.jsx`, `health.jsx`
**Fix**: Migrate all `100vh` → `100dvh` for mobile Safari safety. CSS variables can help.

### M2: Midnight theme uses purple accent (#7c83fd)
**File**: `styles.css:11`
**Taste Rule**: *"THE LILA BAN: The 'AI Purple/Blue' aesthetic is strictly BANNED."*
**Fix**: Switch to amber, warm orange, or teal accent that matches the project's warm brand

### M3: Low design variance (standard layout only)
- No split-screen, no asymmetry, no masonry, no overlapping elements
- All views use sidebar + topbar + content template
- **Fix**: Introduce bento grid on dashboard, asymmetric hero on flow view

### M4: Low motion intensity (CSS transitions only)
- No Framer Motion, spring physics, stagger animations, or micro-interactions
- No scroll-triggered animations or layout transitions
- **Fix**: Add Framer Motion (already may not be installed — check package.json), spring-based interactions

### M5: No Tailwind CSS — pure custom properties
- Taste Skill mandates Tailwind for 90% of styling
- The existing CSS custom property system works but lacks Tailwind's design constraint benefits
- **Fix**: Optional — consider Tailwind migration; low priority given working system

### M6: Inline styles dominate (no CSS modules or MUI)
**Fix**: Extract repeated inline style objects to CSS classes for maintainability and theme consistency

### M7: 3-column stat grids via `.stat-grid`
**File**: `styles.css:393`
**Taste Rule**: *"NO 3-Column Card Layouts: BANNED"*
**Fix**: Use 2-column zigzag, asymmetric grid, or horizontal scrolling instead

---

## ✅ Strengths

| Aspect | Details |
|--------|---------|
| Theme system | 4 themes with full design tokens, category colors, semantic colors |
| States | Loading skeletons, empty states, error boundaries on every view |
| Anti-glass | `.glass` class is just named — no actual backdrop-blur |
| Anti-gradient | No gradient text or gradient buttons anywhere |
| Transform animations | Progress bars use `scaleX()` not `width` — perf safe |
| Staggered rows | `animation-delay: calc(var(--i) * 30ms)` on row animations |
| Reduced motion | `prefers-reduced-motion` media query honored |
| Typography | Fraunces (display) + Geist (body) + Geist Mono (data) — good hierarchy |
| Search | ⌘K keyboard shortcut, debounced search, result dropdown |
| A11y | focus-ring class, aria labels, semantic landmarks |
| Icons | 78 custom SVG icons via `<Icon>` component — no icon library dependency |
| Responsive | Sidebar collapses to overlay, views handle narrow viewports |

---

## Fix Plan — Waves

### Wave 1: Anti-Slop Hygiene (C1-C5)
Low risk, high taste impact. Can be done in parallel.

| Item | Files | Complexity |
|------|-------|------------|
| C1: Drop Inter | `styles.css` | 🔵 1 line |
| C2: Replace #fff/#000 | `styles.css` | 🔵 3 lines |
| C3: Remove side-stripe | `shell.jsx`, `styles.css` | 🟢 2 lines |
| C4: Inline → CSS hover | `shell.jsx` | 🟢 6 replacements |
| C5: Emojis → Icons | `inbox.jsx`, `account.jsx`, `admin.jsx`, `debt.jsx`, `onboarding.jsx` | 🟡 33 replacements |

### Wave 2: Viewport Safety (M1)
| Item | Files | Complexity |
|------|-------|------------|
| M1: 100vh → 100dvh | `styles.css`, `app.jsx`, `flow.jsx`, `dashboard.jsx`, `health.jsx` | 🟢 14 replacements |

### Wave 3: Midnight Theme Accent (M2)
| Item | Files | Complexity |
|------|-------|------------|
| M2: Purple → warm accent | `styles.css` (midnight tokens) | 🟢 Color swap |

### Wave 4: Design Variance (M3)
| Item | Files | Complexity |
|------|-------|------------|
| M3: Dashboard bento grid | `dashboard.jsx`, `styles.css` | 🟡 Layout rethink |
| M3: Asymmetric flow view | `flow.jsx` | 🟡 Layout rethink |

### Wave 5: Motion (M4)
| Item | Files | Complexity |
|------|-------|------------|
| M4: Framer Motion install | `package.json` | 🔵 npm install |
| M4: Spring interactions | `shell.jsx`, `inbox.jsx`, `dashboard.jsx` | 🟡 Add motion |
| M4: Stagger reveals | views | 🟢 Animation |

### Wave 6: Layout Polish (M6, M7)
| Item | Files | Complexity |
|------|-------|------------|
| M6: Extract inline styles → CSS | all `.jsx` files | 🟡 Refactor |
| M7: 3-col stat grids | `styles.css`, views | 🟢 Layout change |

---

## File Map

| Wave | Files Touched |
|------|---------------|
| Wave 1 | `styles.css`, `shell.jsx`, `inbox.jsx`, `account.jsx`, `admin.jsx`, `debt.jsx`, `onboarding.jsx` |
| Wave 2 | `styles.css`, `app.jsx`, `flow.jsx`, `dashboard.jsx`, `health.jsx` |
| Wave 3 | `styles.css` |
| Wave 4 | `dashboard.jsx`, `flow.jsx` |
| Wave 5 | `package.json`, `shell.jsx`, `inbox.jsx`, `dashboard.jsx` |
| Wave 6 | All `.jsx` files, `styles.css` |
