# New Era UI Redesign

**Date:** 2026-04-12
**Status:** Approved

---

## Overview

Full frontend redesign of the expense tracker. Zero backend changes — all APIs and data models stay untouched. The goal is a glassmorphism-styled, left-sidebar layout with purposeful animations and excellent UX across all six pages.

**Design choices locked in:**
| Decision | Choice |
|----------|--------|
| Visual style | Glassmorphism |
| Navigation | Left sidebar (200px) |
| Animation intensity | Purposeful Mix |
| Dashboard hero | Activity-led (recent feed + compact stats) |

---

## Design System

### New file: `static/styles.css`

Extracts all CSS from `base.html` inline `<style>` into a single external stylesheet. Adds CSS custom properties (design tokens) used by every page.

**Color tokens:**
```css
:root {
  --bg:        #060610;
  --bg-card:   rgba(255,255,255,0.04);
  --bg-sidebar: rgba(255,255,255,0.02);
  --border:    rgba(255,255,255,0.07);
  --border-active: rgba(124,131,253,0.25);
  --text:      #e0e0e0;
  --text-muted: #555;
  --text-dim:  #333;
  --accent:    #7c83fd;
  --accent-soft: rgba(124,131,253,0.12);
  --red:       #e07070;
  --green:     #5db87d;
  --amber:     #f0a500;
  --purple:    #a78bfa;
  --blur-card: blur(8px);
  --blur-sidebar: blur(16px);
  --blur-modal: blur(24px);
  --radius:    12px;
  --radius-sm: 8px;
  --transition: 150ms ease;
}
```

**Glassmorphism card mixin** (applied via `.glass` class):
```css
.glass {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  backdrop-filter: var(--blur-card);
}
```

**Ambient glow orbs** — each page has 2 fixed blurred blobs in page background. They are `position: fixed`, `pointer-events: none`, `z-index: -1`, and use `filter: blur(80px)`. Colors vary per page:
- Dashboard: red orb top-right, purple orb bottom-left
- Transactions: purple top-right, blue bottom-left
- Review: amber top-right, purple bottom-left
- Budgets: green top-right, purple bottom-left

---

## Layout

### `templates/base.html` — full rewrite

**Structure:**
```
body
  .glow-orb (×2, page-specific colors)
  .layout
    .sidebar
      .sidebar-brand
      .sidebar-nav
        .nav-item (×5 pages)
      .sidebar-bottom
        .nav-item (Settings)
        button.sync-btn
    .main
      .container (replaces current .container)
        {% block content %}
  #sync-panel (unchanged)
  #toast-container (new)
```

**Sidebar spec:**
- Width: 200px, never collapses (out of scope for mobile)
- Background: `var(--bg-sidebar)` + `backdrop-filter: var(--blur-sidebar)`
- Border-right: `1px solid var(--border)`
- Brand: `#7c83fd`, 15px, weight 800, letter-spacing -0.4px
- Nav items: 36px tall, 8px border-radius, gap 2px between items
- Active item: `var(--accent-soft)` background, `1px solid var(--border-active)` border, white text
- Hover: `rgba(255,255,255,0.04)` background, `var(--text)` color, transition 150ms
- Icon column: 18px wide, centered
- Review badge: red pill `#e07070`, always visible when count > 0, updated by existing `review-count` logic
- Settings pinned at bottom via `margin-top: auto`
- Sync button: full-width, `linear-gradient(135deg, var(--accent), var(--purple))`, 8px border-radius, 150ms hover brightness

**Animation — sidebar:** No transition on nav item clicks. Active state changes instantly.

---

## Animation System

All animations defined as CSS keyframes in `styles.css`. JavaScript triggers via class addition.

### Skeleton shimmer (loading state)
```css
@keyframes shimmer {
  from { background-position: -200% 0; }
  to   { background-position: 200% 0; }
}
.skeleton {
  background: linear-gradient(90deg, #111 25%, #1a1a2e 50%, #111 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
  border-radius: var(--radius-sm);
}
```

Used on: stat card values, feed items, chart areas, budget bars — all while API calls are in flight.

### Count-up numbers
`static/app.js` — `countUp(el, targetValue, duration=600)` function:
- Uses `requestAnimationFrame`
- Eases with `t * (2 - t)` (ease-out quad)
- Formats with `toLocaleString('en-IN')`
- Triggered once per page load on stat card `.val` elements
- Not triggered on period change (instant update there)

### Staggered list entry
```css
@keyframes fadeSlideUp {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
.anim-row { animation: fadeSlideUp 200ms ease both; }
```
Applied to `.feed-item` rows with `animation-delay: calc(var(--i) * 30ms)` set via `style` attribute (e.g. `style="--i:0"`, `--i:1`, etc).

### Modal entrance
```css
@keyframes modalIn {
  from { opacity: 0; transform: scale(0.96) translateY(6px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}
.modal-box { animation: modalIn 200ms ease-out; }
```

Modal backdrop: `background: rgba(0,0,0,0.6)`, `backdrop-filter: blur(4px)`, fade in 150ms.

### Row hover
```css
tbody tr { transition: background 100ms, transform 100ms, box-shadow 100ms; }
tbody tr:hover {
  background: rgba(255,255,255,0.03);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
}
```

### Budget bar entrance
```css
@keyframes barGrow {
  from { width: 0; }
  to   { width: var(--pct); }
}
.budget-fill { animation: barGrow 600ms ease-out both; }
```
Width set via `style="--pct: 72%"`. Triggered on page load.

### Toast notifications (new, replaces no feedback)
```css
@keyframes toastIn  { from { opacity:0; transform:translateX(100%); } to { opacity:1; transform:translateX(0); } }
@keyframes toastOut { from { opacity:1; transform:translateX(0); } to { opacity:0; transform:translateX(100%); } }
```

`static/app.js` — `showToast(message, type='success')`:
- `type`: `'success'` (green), `'error'` (red), `'info'` (purple)
- Auto-dismisses after 3s
- Stacks vertically from bottom-right (above sync panel)
- Called after: edit modal save, sync complete, cashbook import

---

## Pages

### Dashboard (`templates/dashboard.html`)

**Layout:**
```
.dashboard-header          — greeting + period picker
.stat-row (4 cards)        — Spent, Income, Net, Needs Review
.dashboard-body (2-col)
  .activity-feed           — Recent 8 transactions
  .dashboard-sidebar
    .budget-summary        — Budget progress bars (top 5)
    .chart-card            — Donut (category breakdown)
.chart-row (full width)    — Monthly trend line chart
.merchants-row (2-col)     — Top Merchants | Income vs Expense
```

**Greeting:** "Good morning / afternoon / evening" based on hour. Subline: "{period} · {n} transactions need review" (links to `/review`).

**Period picker:** Pill tabs (This month / 3 months / 6 months / This year). Styled as glass pills, not bordered buttons. Active: accent background.

**Stat cards (4, not 5):** Spent · Income · Net · Needs Review. Each has skeleton while loading. Numbers count up once on initial load.

**Activity feed:**
- Pulls from `GET /api/transactions?label=expense&label=income` — last 8 confirmed transactions
- Each row: category emoji icon (mapped from category string) + name + date / amount
- "View all →" links to `/transactions`
- Staggered fade-in on load

**Budget sidebar:** Same data as existing budget section, restyled as glass cards with animated bars. "Manage →" links to `/budgets`.

**Charts:** All existing chart logic preserved (`renderTrend`, `renderDonut`, `renderMerchants`, `renderIncomeVsExpense`). Only visual styling changes (colors, fonts, grid lines updated to use design tokens).

---

### Transactions (`templates/transactions.html`)

Structure unchanged. Restyled:
- Table wrapped in `.glass` card
- `thead` uses `--text-muted`, `border-bottom: 1px solid var(--border)`
- Row hover animation (translateY + glow)
- Label badge restyled: pill shape, `border-radius: 20px`
- Edit modal (existing) gets new glass backdrop + `modalIn` animation
- Hover tooltip (existing) gets glass styling

Filter bar: same dropdowns, restyled with glass inputs.

---

### Needs Review (`templates/review.html`)

Current: table layout.
New: card stack — each email becomes a standalone `.glass` card with:
- Subject line (bold), sender + date (muted)
- Body snippet (collapsible, max 3 lines, "Show more" toggle)
- Inline label picker (Expense / Income / Ignore chips)
- Amount input (shows when label ≠ ignore)
- Category chips (same 12 as edit modal)
- Confirm button per card

Cards stagger in (30ms each). No page reload on confirm — card slides out (`translateX(100%) + opacity: 0`, 200ms) and next card takes its place.

Keyboard: `E` = expense, `I` = income, `S` = skip (ignore), `Enter` = confirm focused card.

---

### Recurring (`templates/recurring.html`)

Current inline styles → glass cards. Each recurring item: one `.glass` row with name, frequency badge, amount, next-due date, active toggle, edit/delete buttons. No structural change.

---

### Budgets (`templates/budgets.html`)

Current grid → glass cards. Each budget card:
- Category name + monthly limit
- Spent amount (color-coded: green < 70%, amber 70–99%, red ≥ 100%)
- Animated progress bar (barGrow on mount)
- Edit inline (click pencil → input replaces text, save on Enter or blur)

---

### Settings (`templates/settings.html`)

Sections wrapped in `.glass` cards with section headers. Form inputs get glass styling (`background: rgba(255,255,255,0.04)`). Save feedback via toast (not page reload message).

---

## Files Changed

| File | Change |
|------|--------|
| `static/styles.css` | **New** — design tokens, glassmorphism, all shared CSS |
| `templates/base.html` | Rewrite — sidebar layout, import styles.css, toast container, ambient orbs |
| `templates/dashboard.html` | Rewrite — activity-led hero, 4-card stats, 2-col body |
| `templates/transactions.html` | Restyle — glass table, same features |
| `templates/review.html` | Restyle — card stack, keyboard shortcuts, slide-out on confirm |
| `templates/recurring.html` | Restyle — glass list cards |
| `templates/budgets.html` | Restyle — animated progress bars, inline edit |
| `templates/settings.html` | Restyle — glass form sections, toast feedback |
| `static/app.js` | Extend — countUp(), showToast(), skeleton helpers, review card keyboard nav |

---

## What Is NOT Changing

- All backend APIs, routes, and models
- Sync panel (already glass-adjacent, will get minor token updates)
- Edit modal logic (existing `openEditModal`, `_emSave`) — styling only
- Hover tooltip logic — styling only
- Chart rendering functions (`renderTrend`, `renderDonut`, etc.) — styling only
- Cashbook import script
- Any Python code
