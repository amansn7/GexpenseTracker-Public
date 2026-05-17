# Observatory Ledger — Theme Implementation Plan

## Overview

**Theme Name**: Observatory Ledger
**Theme Key**: `observatory`
**Creative North Star**: "Precision instruments in a dimly lit observatory — warm amber light against dark stone, every number illuminated with clarity."
**Color Strategy**: Committed — dark charcoal surfaces (60-70% visual weight), warm amber accent for interactive states and data emphasis.
**Anchor References**: Braun SK series instruments, Leica camera viewfinders, Nixie tube displays (modernized)

---

## 1. Color System

### 1.1 Neutral Scale (Cool Charcoal, Amber-Tinted)

All neutrals use OKLCH with hue ~55 (amber direction) and chroma 0.005-0.015. Hex fallbacks provided for browser compatibility.

| Token | OKLCH | Hex Fallback | Usage |
|-------|-------|--------------|-------|
| `--paper` | `oklch(16% 0.008 55)` | `#1e1915` | Page background |
| `--paper-2` | `oklch(20% 0.01 55)` | `#262019` | Secondary surface, hover |
| `--ink` | `oklch(92% 0.008 55)` | `#e8e4df` | Primary text |
| `--ink-2` | `oklch(80% 0.01 55)` | `#c5bfb6` | Secondary text |
| `--ink-3` | `oklch(65% 0.012 55)` | `#9e9589` | Tertiary text, labels |
| `--ink-4` | `oklch(48% 0.012 55)` | `#756c61` | Metadata, disabled |
| `--line` | `oklch(28% 0.01 55)` | `#362f28` | Borders, dividers |
| `--card` | `oklch(22% 0.01 55)` | `#2a2420` | Card surfaces |

### 1.2 Amber Accent Scale

| Token | OKLCH | Hex Fallback | Usage |
|-------|-------|--------------|-------|
| `--accent` | `oklch(72% 0.16 70)` | `#d4922a` | Primary accent, CTAs, focus |
| `--accent-hover` | `oklch(78% 0.16 70)` | `#e8a840` | Hover states |
| `--accent-active` | `oklch(62% 0.15 70)` | `#b87a1e` | Active/pressed |
| `--accent-soft` | `oklch(72% 0.16 70 / 0.12)` | `rgba(212,146,42,0.12)` | Soft backgrounds |
| `--on-accent` | `oklch(16% 0.008 55)` | `#1e1915` | Text on accent bg |

### 1.3 Semantic Colors

| Token | OKLCH | Hex Fallback | Usage | Contrast on `--paper` |
|-------|-------|--------------|-------|----------------------|
| `--pos` | `oklch(68% 0.14 145)` | `#6bc48a` | Income, positive | 7.2:1 (AAA) |
| `--pos-soft` | `oklch(68% 0.14 145 / 0.12)` | `rgba(107,196,138,0.12)` | Income backgrounds | - |
| `--neg` | `oklch(62% 0.18 25)` | `#d46a5a` | Expenses, negative | 5.8:1 (AA) |
| `--neg-soft` | `oklch(62% 0.18 25 / 0.12)` | `rgba(212,106,90,0.12)` | Expense backgrounds | - |
| `--warning` | `oklch(72% 0.16 70)` | `#d4922a` | Warnings | 8.1:1 (AAA) |

### 1.4 Category Colors (16 Pairs)

| Category | Background OKLCH | Background Hex | Text OKLCH | Text Hex |
|----------|-----------------|----------------|------------|----------|
| food | `oklch(26% 0.04 70)` | `#3a3020` | `oklch(78% 0.08 70)` | `#d4b87a` |
| groceries | `oklch(26% 0.04 120)` | `#2a3520` | `oklch(78% 0.08 120)` | `#b8d49a` |
| rent | `oklch(26% 0.04 160)` | `#203530` | `oklch(78% 0.08 160)` | `#9ad4c4` |
| transport | `oklch(26% 0.04 220)` | `#202a35` | `oklch(78% 0.08 220)` | `#9ab8d4` |
| travel | `oklch(26% 0.04 220)` | `#202a35` | `oklch(78% 0.08 220)` | `#9ab8d4` |
| shop | `oklch(26% 0.04 340)` | `#352028` | `oklch(78% 0.08 340)` | `#d49ab0` |
| entertainment | `oklch(26% 0.04 290)` | `#2e2035` | `oklch(78% 0.08 290)` | `#b89ad4` |
| health | `oklch(26% 0.04 15)` | `#352020` | `oklch(78% 0.08 15)` | `#d49a9a` |
| edu | `oklch(26% 0.04 240)` | `#202535` | `oklch(78% 0.08 240)` | `#9aa8d4` |
| sub | `oklch(26% 0.04 290)` | `#2e2035` | `oklch(78% 0.08 290)` | `#b89ad4` |
| util | `oklch(26% 0.04 120)` | `#2a3520` | `oklch(78% 0.08 120)` | `#b8d49a` |
| card | `oklch(26% 0.04 60)` | `#353020` | `oklch(78% 0.08 60)` | `#d4c49a` |
| investment | `oklch(26% 0.04 180)` | `#203535` | `oklch(78% 0.08 180)` | `#9ad4d4` |
| transfer | `oklch(26% 0.04 100)` | `#303520` | `oklch(78% 0.08 100)` | `#c4d49a` |
| inc | `oklch(26% 0.04 145)` | `#203525` | `oklch(78% 0.08 145)` | `#a8d4b0` |
| other | `oklch(26% 0.04 55)` | `#353025` | `oklch(78% 0.08 55)` | `#d4c8a8` |

### 1.5 Utility Tokens (Redundant Token Aliases)

These map to primary tokens for backward compatibility with existing inline styles:

```css
--bg: var(--paper);
--bg-card: rgba(255, 255, 255, 0.03);
--bg-sidebar: rgba(255, 255, 255, 0.015);
--border: var(--line);
--border-act: oklch(72% 0.16 70 / 0.2);
--text: var(--ink);
--muted: var(--ink-3);
--dim: var(--ink-4);
--red: var(--neg);
--green: var(--pos);
--amber: var(--accent);
```

### 1.6 Shadow and Overlay Tokens

```css
--shadow-sm: rgba(0, 0, 0, 0.2);
--shadow-md: rgba(0, 0, 0, 0.3);
--shadow-lg: rgba(0, 0, 0, 0.45);
--overlay: rgba(0, 0, 0, 0.48);
--backdrop: rgba(0, 0, 0, 0.35);
```

### 1.7 Inverted Surface Token

For section headers that invert the theme (dark bg, light text):

```css
--surface-inverted: var(--ink);
--on-surface-inverted: var(--paper);
```

---

## 2. Typography System

### 2.1 Font Families

| Role | Font Stack | Purpose |
|------|-----------|---------|
| Display | `'Fraunces', Georgia, serif` | Hero amounts, brand mark |
| UI | `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif` | Body, labels, buttons, nav |
| Data | `'JetBrains Mono', 'Geist Mono', monospace` | Amounts, currency, tabular data |
| Italic Accent | `'Instrument Serif', serif` (italic only) | Section subtitles, brand flourish |

### 2.2 Type Scale

| Role | Font | Size | Weight | Letter-spacing | Line-height | Usage |
|------|------|------|--------|----------------|-------------|-------|
| display-xl | Fraunces | 72px | 400 | -0.035em | 1 | Dashboard hero amount |
| display-lg | Fraunces | 54px | 400 | -0.03em | 1 | Inbox panel amount |
| display | Fraunces | 48px | 400 | -0.03em | 1 | Large financial figures |
| h1 | Fraunces | 28px | 600 | -0.02em | 1.2 | Page titles |
| h2 | Fraunces | 26px | 500 | -0.03em | 1.2 | Brand mark |
| h3 | Inter | 22px | 600 | -0.015em | 1.3 | Section titles |
| h4 | Inter | 18px | 600 | -0.01em | 1.3 | Subsection titles |
| body | Inter | 13.5px | 400 | 0 | 1.55 | Body text, transaction rows |
| small | Inter | 12px | 400 | 0 | 1.4 | Labels, badges |
| label | Inter | 11px | 500 | 0.06em (uppercase) | 1.4 | Column headers, metadata |
| amount | JetBrains Mono | 14px | 400 | 0 | 1.4 | Amounts in lists (tabular-nums) |
| amount-lg | JetBrains Mono | 24px | 400 | -0.02em | 1 | Card big numbers (tabular-nums) |
| amount-xl | JetBrains Mono | 40px | 400 | -0.025em | 1 | Dashboard card amounts (tabular-nums) |

### 2.3 Font Loading

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,100..900;1,9..144,100..900&family=Instrument+Serif:ital@0;1&family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@300;400;500;600;700&display=swap" rel="stylesheet">
```

All fonts use `display=swap` to prevent render blocking.

---

## 3. Component Specifications

### 3.1 Buttons

| State | Primary | Ghost |
|-------|---------|-------|
| Default | `--accent` bg, `--on-accent` text | transparent bg, `--accent` text, 1px `--line` border |
| Hover | `filter: brightness(1.15)` | `background: var(--accent-soft)` |
| Active | `--accent-active` bg | `background: var(--accent-soft)` |
| Disabled | 0.4 opacity, cursor not-allowed | 0.4 opacity, cursor not-allowed |
| Focus | 2px `--accent` outline, 2px offset | 2px `--accent` outline, 2px offset |

**Shape**: 6px radius, 8px 16px padding, 13px font size

### 3.2 Cards

| Property | Value |
|----------|-------|
| Background | `--card` |
| Border | 1px `--line` |
| Radius | 8px |
| Padding | 16px |
| Shadow | None at rest |

### 3.3 Inputs

| State | Value |
|-------|-------|
| Default | `--card` bg, `--ink` text, 1px `--line` border |
| Focus | border `--accent`, outline none |
| Placeholder | `--ink-3` |
| Radius | 6px |
| Padding | 8px 12px |

### 3.4 Navigation

| State | Value |
|-------|-------|
| Default | `--ink-3` text, transparent bg |
| Hover | `background: rgba(255,255,255,0.03)`, `--ink` text |
| Active | `background: var(--accent-soft)`, `--ink` text, `border-left: 2px solid --accent` |
| Badge | `--accent` bg, `--on-accent` text, 8px radius |

### 3.5 Badges

| Type | Background | Text |
|------|-----------|------|
| Expense | `var(--neg-soft)` | `--neg` |
| Income | `var(--pos-soft)` | `--pos` |
| Ignore | `rgba(255,255,255,0.04)` | `--ink-3` |
| Review | `var(--accent-soft)` | `--accent` |

**Shape**: Pill (20px radius), 11px font, 600 weight

### 3.6 Toasts

| Type | Background |
|------|-----------|
| Success | `oklch(68% 0.14 145 / 0.85)` |
| Error | `oklch(62% 0.18 25 / 0.85)` |
| Info | `oklch(72% 0.16 70 / 0.85)` |

### 3.7 Section Headers (Inverted Pattern)

| Property | Value |
|----------|-------|
| Background | `--surface-inverted` (which is `--ink`) |
| Text | `--on-surface-inverted` (which is `--paper`) |
| Padding | 11px 20px |
| Radius | 8px 8px 0 0 |

---

## 4. Implementation Phases

### Phase 1: CSS Tokens and Base Styles
**Files**: `static/styles.css`
**Tasks**:
- Add `[data-theme="observatory"]` block with all tokens
- Include hex fallbacks for OKLCH values
- Define all 16 category color pairs
- Map redundant token aliases
- Add shadow/overlay tokens
- Add inverted surface tokens
- Update noise texture handling for dark mode
- Add theme transition on body

**Verification**:
- All existing `var(--*)` references resolve
- Theme switcher shows new option
- No console errors from undefined tokens

### Phase 2: Shell Components
**Files**: `static/src/shell.jsx`
**Tasks**:
- Update sidebar styles for dark theme
- Update topbar styles
- Update navigation active/hover states
- Update brand mark styling
- Update sync button styling
- Update mobile nav toggle and backdrop

**Verification**:
- Sidebar renders correctly
- Navigation active state visible
- Mobile nav works
- Theme transition smooth

### Phase 3: Dashboard
**Files**: `static/src/dashboard.jsx`
**Tasks**:
- Update hero section (72px Fraunces amount)
- Update stat cards
- Update section headers (inverted pattern)
- Update category breakdown grid
- Update budget bars
- Update merchant list
- Update period tabs
- Update health section

**Verification**:
- Hero amount displays at 72px
- All stat cards readable
- Section headers inverted correctly
- Category colors visible
- Budget bars use amber accent

### Phase 4: Inbox and Detail Panel
**Files**: `static/src/inbox.jsx`
**Tasks**:
- Update transaction list rows
- Update detail panel (54px amount)
- Update filter dropdown
- Update search results
- Update duplicate detection UI
- Update bulk action buttons
- Update empty states

**Verification**:
- Transaction rows readable
- Detail panel amount at 54px
- Filters work visually
- Search results hover states correct

### Phase 5: Remaining Views
**Files**: `static/src/onboarding.jsx`, `static/src/account.jsx`, `static/src/admin.jsx`, `static/src/recurring.jsx`, `static/src/debt.jsx`, `static/src/reports.jsx`, `static/src/health.jsx`, `static/src/flow.jsx`, `static/src/sync-progress.jsx`
**Tasks**:
- Update each view's component styles
- Ensure consistent token usage
- Update Three.js onboarding background for dark mode
- Update sync panel for dark theme

**Verification**:
- Each view renders correctly
- No hardcoded colors visible
- Consistent spacing and typography

### Phase 6: Polish and Accessibility
**Files**: All
**Tasks**:
- WCAG AA contrast audit for all text combinations
- Focus ring verification on all interactive elements
- Keyboard navigation test
- Screen reader label audit
- Mobile responsive test
- Theme transition animation
- Print stylesheet considerations

**Verification**:
- All text passes WCAG AA
- All interactive elements have focus indicators
- Keyboard navigation works end-to-end
- Mobile views functional

---

## 5. Risk Mitigation

### High Risks
| Risk | Mitigation |
|------|-----------|
| OKLCH browser support | Hex fallbacks on every token |
| Token redundancy breakage | Explicit alias mapping for all redundant tokens |
| Category color count mismatch | Define all 16 pairs, not 8 |
| Hardcoded rgba values | Tokenize all shadows, overlays, backdrops |
| Font swap flash | `display=swap` on all fonts, preconnect hints |

### Medium Risks
| Risk | Mitigation |
|------|-----------|
| Section header inversion | Dedicated `--surface-inverted` / `--on-surface-inverted` tokens |
| Toast colors not adapting | Use OKLCH with alpha for toast backgrounds |
| Noise texture on dark | Disable or use `mix-blend-mode: screen` with inverted SVG |
| Mobile backdrop invisible | Use `--overlay` token instead of hardcoded rgba |

### Testing Strategy
- Each phase: implement → verify → fix → proceed
- Final phase: comprehensive accessibility and responsive audit
- Manual smoke test across all views
- Browser compatibility check (Chrome, Safari, Firefox)

---

## 6. Success Criteria

1. **Visual**: Theme renders as "precision instrument" aesthetic — dark charcoal surfaces, warm amber accents, clear data hierarchy
2. **Functional**: All existing features work identically, only visual layer changes
3. **Accessible**: All text passes WCAG AA, all interactive elements have focus indicators
4. **Compatible**: Works on Chrome 119+, Safari 15.4+, Firefox 113+ (with fallbacks for older)
5. **Performant**: No layout shift from font loading, smooth theme transitions (<200ms)
6. **Complete**: All 15 JSX views render correctly, all 16 category colors defined
