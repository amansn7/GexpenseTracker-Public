# MoneyFlow Design Language — Observatory Ledger

**Version**: 1.0
**Theme**: Observatory Ledger (`data-theme="observatory"`)
**Last Updated**: 2026-05-18
**Status**: Active

---

## 1. Design Philosophy

### Creative North Star
> *"Precision instruments in a dimly lit observatory — warm amber light against dark stone, every number illuminated with clarity."*

MoneyFlow's Observatory Ledger theme treats personal finance as a practice of clarity and precision. Like a well-calibrated instrument, the interface should feel trustworthy, measured, and illuminating. The dark charcoal surfaces provide a calm backdrop; the warm amber accent acts as the "instrument light" that guides attention to what matters.

### Core Principles

1. **Clarity over density** — Financial data is stressful. Every screen answers one question without noise.
2. **Earned familiarity** — Standard patterns (inbox list, sidebar nav, detail panel). Don't reinvent affordances.
3. **Illumination through restraint** — Amber accent appears sparingly. Its rarity is the point. Color serves information, not atmosphere.
4. **Precision in data** — Monospace for financial figures, tabular numbers aligned, consistent decimal places.
5. **Accessibility is not optional** — WCAG AA contrast, keyboard navigation, screen-reader labels throughout.

### Anti-Patterns (Never Do)

- Gradient fills on buttons, progress bars, backgrounds, or text
- Glassmorphism (`backdrop-filter: blur()`) on cards, sidebars, or panels
- Ambient glow orbs or decorative floating background elements
- `#000` or `#fff` directly — always reference tokens
- Bounce or elastic easing — use `cubic-bezier(.4,0,.2,1)`
- Side-stripe borders (`border-left` > 1px as colored accent)
- Display fonts in UI labels, buttons, or data
- Purple gradients, neon accents, or dark-SaaS template
- Inline `onMouseEnter`/`onMouseLeave` handlers — use CSS `:hover`

---

## 2. Color System

### 2.1 Token Architecture

All colors use a two-layer system:
- **Primitive tokens**: Named by role (`--paper`, `--ink`, `--accent`)
- **Semantic tokens**: Map to primitives (`--bg: var(--paper)`, `--text: var(--ink)`)

This allows theme switching by redefining primitives while semantic tokens remain stable.

### 2.2 OKLCH Usage

All colors are defined in OKLCH color space for perceptual uniformity. Hex fallbacks are provided for browser compatibility.

```css
/* Correct: OKLCH with hex fallback */
--accent: #d4922a; /* fallback */
--accent: oklch(72% 0.16 70);

/* Wrong: OKLCH without fallback */
--accent: oklch(72% 0.16 70);
```

### 2.3 Neutral Scale

The neutral scale uses hue 55 (amber direction) with chroma 0.005-0.015. This creates a subtle warmth that feels cohesive with the amber accent without being obviously "tinted."

| Token | Lightness | Chroma | Usage |
|-------|-----------|--------|-------|
| `--paper` | 16% | 0.008 | Page background |
| `--paper-2` | 20% | 0.010 | Secondary surface, hover |
| `--card` | 22% | 0.010 | Card surfaces |
| `--line` | 28% | 0.010 | Borders, dividers |
| `--ink-4` | 48% | 0.012 | Metadata, disabled |
| `--ink-3` | 65% | 0.012 | Tertiary text, labels |
| `--ink-2` | 80% | 0.010 | Secondary text |
| `--ink` | 92% | 0.008 | Primary text |

### 2.4 Accent Usage Rules

**The Amber Rule**: The amber accent (`--accent`) appears on ≤10% of any given screen. Its rarity is the point.

| Usage | Token |
|-------|-------|
| Primary buttons | `--accent` background |
| Links | `--accent` text |
| Focus indicators | `--accent` outline |
| Active navigation | `--accent-soft` background + `--accent` left border |
| Progress bars | `--accent` fill |
| Hover on accent elements | `--accent-hover` |

**Never use amber for**:
- Decorative elements
- Background fills larger than 10% of screen
- Body text (contrast fails at `--accent-active`)
- Category colors

### 2.5 Semantic Colors

| Token | Purpose | Contrast on `--paper` |
|-------|---------|----------------------|
| `--pos` | Income, positive values | 7.2:1 (AAA) |
| `--neg` | Expenses, negative values | 5.8:1 (AA) |
| `--warning` | Warnings, alerts | 8.1:1 (AAA) |

### 2.6 Category Colors

16 category color pairs, each with a muted background and readable text. All pairs maintain ≥4.5:1 contrast ratio.

**Usage**: Category badges, sidebar filter list, transaction row indicators.

**Rule**: Category colors are for visual grouping only. Never use for emphasis or interactive states.

### 2.7 Shadows and Overlays

Dark theme shadows use pure black with alpha, not tinted colors:

| Token | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | `rgba(0,0,0,0.2)` | Subtle depth (hover states) |
| `--shadow-md` | `rgba(0,0,0,0.3)` | Medium depth (dropdowns) |
| `--shadow-lg` | `rgba(0,0,0,0.45)` | Large depth (modals, panels) |
| `--overlay` | `rgba(0,0,0,0.48)` | Backdrop overlays |
| `--backdrop` | `rgba(0,0,0,0.35)` | Mobile nav backdrop |

---

## 3. Typography

### 3.1 Font Families

| Family | Purpose | Weight Range |
|--------|---------|-------------|
| **Fraunces** | Display amounts, brand mark | 400-600 |
| **Inter** | UI text, body, labels, buttons | 400-800 |
| **JetBrains Mono** | Financial data, amounts, currency | 400-600 |
| **Instrument Serif** | Italic accent (subtitles, brand) | 400 italic |

### 3.2 Type Scale

The scale uses fixed sizes (not fluid/clamp) because product UI is viewed at consistent DPI.

```
72px ── display-xl  (Fraunces 400)    Dashboard hero
54px ── display-lg  (Fraunces 400)    Inbox panel amount
48px ── display     (Fraunces 400)    Large figures
28px ── h1          (Fraunces 600)    Page titles
26px ── h2          (Fraunces 500)    Brand mark
22px ── h3          (Inter 600)       Section titles
18px ── h4          (Inter 600)       Subsection titles
13.5px ── body      (Inter 400)       Body text
12px ── small       (Inter 400)       Labels, badges
11px ── label       (Inter 500)       Column headers (uppercase)
```

### 3.3 Data Typography

All financial data uses JetBrains Mono with `font-variant-numeric: tabular-nums`:

```css
.amount {
  font-family: 'JetBrains Mono', monospace;
  font-variant-numeric: tabular-nums;
}
```

This ensures decimal points align vertically in lists and tables.

### 3.4 Line Length

- Body text: max 65-75ch
- Data tables: can exceed 75ch (density is a feature)
- Labels: no max (short by nature)

---

## 4. Component Library

### 4.1 Buttons

```css
.btn-primary {
  background: var(--accent);
  color: var(--on-accent);
  border: none;
  border-radius: 6px;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 500;
  transition: filter 150ms;
}
.btn-primary:hover { filter: brightness(1.15); }
.btn-primary:disabled { opacity: 0.4; cursor: not-allowed; filter: none; }

.btn-ghost {
  background: transparent;
  color: var(--accent);
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 8px 16px;
  font-size: 13px;
  transition: background 150ms;
}
.btn-ghost:hover { background: var(--accent-soft); }
```

**States**: default, hover, active, disabled, loading, focus

### 4.2 Cards

```css
.card {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 16px;
}
```

**Rule**: Cards are flat at rest. No box-shadows. Depth comes from tonal layering.

### 4.3 Inputs

```css
.input {
  background: var(--card);
  color: var(--ink);
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 13px;
  transition: border-color 150ms;
}
.input:focus {
  outline: none;
  border-color: var(--accent);
}
.input::placeholder { color: var(--ink-3); }
```

**States**: default, focus, disabled, error

### 4.4 Navigation Items

```css
.nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 6px;
  color: var(--ink-3);
  font-size: 13px;
  font-weight: 500;
  transition: background 120ms, color 120ms;
}
.nav-item:hover {
  background: rgba(255,255,255,0.03);
  color: var(--ink);
}
.nav-item.active {
  background: var(--accent-soft);
  border-left: 2px solid var(--accent);
  color: var(--ink);
}
```

### 4.5 Badges

```css
.badge {
  display: inline-block;
  border-radius: 20px;
  padding: 2px 9px;
  font-size: 11px;
  font-weight: 600;
}
.badge.expense { background: var(--neg-soft); color: var(--neg); }
.badge.income  { background: var(--pos-soft); color: var(--pos); }
.badge.ignore  { background: rgba(255,255,255,0.04); color: var(--ink-3); }
.badge.review  { background: var(--accent-soft); color: var(--accent); }
```

### 4.6 Section Headers (Inverted Pattern)

```css
.section-header {
  background: var(--surface-inverted); /* = --ink */
  color: var(--on-surface-inverted);   /* = --paper */
  border-radius: 8px 8px 0 0;
  padding: 11px 20px;
}
.section-body {
  background: var(--card);
  border: 1px solid var(--line);
  border-top: none;
  border-radius: 0 0 8px 8px;
  padding: 20px;
}
```

**Rule**: This pattern inverts the theme for section headers. Always pair with `.section-body`.

### 4.7 Toasts

```css
.toast {
  padding: 10px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  border: 1px solid var(--line);
}
.toast-success { background: oklch(68% 0.14 145 / 0.85); }
.toast-error   { background: oklch(62% 0.18 25 / 0.85); }
.toast-info    { background: oklch(72% 0.16 70 / 0.85); }
```

---

## 5. Layout

### 5.1 Page Structure

```
┌─────────────────────────────────────────┐
│  Sidebar (232px)  │  Main Content       │
│                   │  ┌───────────────┐  │
│  Brand            │  │  Topbar (72px)│  │
│  Navigation       │  ├───────────────┤  │
│  Sync Button      │  │  Content      │  │
│  User Avatar      │  │  Area         │  │
│                   │  │               │  │
└───────────────────┴──┴───────────────┴──┘
```

### 5.2 Spacing Scale

| Token | Value | Usage |
|-------|-------|-------|
| `--space-xs` | 4px | Tight gaps, icon padding |
| `--space-sm` | 8px | Small gaps, button padding |
| `--space-md` | 16px | Standard gaps, card padding |
| `--space-lg` | 24px | Section gaps |
| `--space-xl` | 32px | Container padding |
| `--space-2xl` | 48px | Large section gaps |

### 5.3 Border Radii

| Token | Value | Usage |
|-------|-------|-------|
| `--r-sm` | 6px | Buttons, inputs, badges |
| `--r` | 8px | Cards, panels, modals |

### 5.4 Responsive Breakpoints

| Breakpoint | Width | Behavior |
|------------|-------|----------|
| Mobile | < 720px | Sidebar becomes overlay, single column |
| Tablet | < 980px | Compact sidebar, adjusted grids |
| Desktop | ≥ 980px | Full sidebar, multi-column grids |

---

## 6. Motion

### 6.1 Timing

| Duration | Usage |
|----------|-------|
| 120ms | Hover states, micro-interactions |
| 150ms | Button transitions, focus states |
| 200ms | Row animations, panel transitions |
| 250ms | Toast animations |
| 300ms | Progress bar animations |
| 350ms | Modal/panel open/close |

### 6.2 Easing

```css
/* Standard ease-out for most transitions */
transition: all 150ms cubic-bezier(.4, 0, .2, 1);

/* Progress bars use transform, not width */
.progress-fill {
  transition: transform 300ms ease;
  transform-origin: left;
}
```

**Rules**:
- Never animate CSS layout properties (width, height, top, left)
- Use `transform: scaleX()` for progress bars
- Use `transform: translateY()` for slide animations
- No bounce or elastic easing
- No orchestrated page-load sequences

### 6.3 Keyframe Animations

| Name | Duration | Usage |
|------|----------|-------|
| `fadeSlideUp` | 200ms | Row entrance |
| `modalIn` | 250ms | Modal entrance |
| `backdropIn` | 200ms | Backdrop fade |
| `barGrow` | 600ms | Progress bar entrance |
| `toastIn` | 250ms | Toast entrance |
| `toastOut` | 280ms | Toast exit |
| `shimmer` | 1.4s | Skeleton loading |

---

## 7. Accessibility

### 7.1 Contrast Requirements

All text must meet WCAG AA minimums:

| Content Type | Minimum | Target |
|--------------|---------|--------|
| Body text | 4.5:1 | 7:1 |
| Large text (18px+ or 14px bold) | 3:1 | 4.5:1 |
| UI components, icons | 3:1 | 4.5:1 |

### 7.2 Focus Indicators

All interactive elements must have visible focus:

```css
*:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
```

### 7.3 Keyboard Navigation

- Tab order follows visual order
- All interactive elements are keyboard accessible
- Escape closes modals and overlays
- Arrow keys navigate lists where appropriate

### 7.4 Screen Reader Labels

- All icons have `aria-label` or `aria-hidden="true"`
- Dynamic content uses `aria-live` regions
- Form inputs have associated labels
- Navigation has `role="navigation"` landmark

### 7.5 Reduced Motion

Respect `prefers-reduced-motion`:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 8. Theme Switching

### 8.1 Available Themes

| Key | Name | Type |
|-----|------|------|
| `paper` | Warm Paper | Light (default) |
| `midnight` | Midnight | Dark warm |
| `cool` | Cool | Light cool |
| `observatory` | Observatory Ledger | Dark charcoal |

### 8.2 Switching Mechanism

```javascript
// Set theme
document.documentElement.setAttribute('data-theme', theme);
localStorage.setItem('mf_theme', theme);

// Get current theme
const theme = document.documentElement.getAttribute('data-theme') || 'paper';
```

### 8.3 Theme Transition

```css
body {
  transition: background 200ms ease, color 200ms ease;
}
```

---

## 9. Development Guidelines

### 9.1 Adding New Components

1. Check if an existing component pattern applies
2. Use CSS custom properties for all colors
3. Define all states: default, hover, focus, active, disabled, loading, error
4. Test with keyboard navigation
5. Verify WCAG AA contrast
6. Add to this document

### 9.2 Modifying Existing Components

1. Update the component spec in this document first
2. Make changes in `styles.css`
3. Test across all themes
4. Verify no hardcoded colors remain
5. Update this document with changes

### 9.3 Code Review Checklist

- [ ] All colors use CSS custom properties
- [ ] No hardcoded `#hex` or `rgb()` values (except fallbacks)
- [ ] All interactive elements have focus states
- [ ] Keyboard navigation works
- [ ] WCAG AA contrast verified
- [ ] Responsive behavior tested
- [ ] Theme switching works
- [ ] No layout shift from font loading

---

## 10. Token Reference

### 10.1 Complete Token List

| Token | Type | Description |
|-------|------|-------------|
| `--paper` | Color | Page background |
| `--paper-2` | Color | Secondary surface |
| `--ink` | Color | Primary text |
| `--ink-2` | Color | Secondary text |
| `--ink-3` | Color | Tertiary text |
| `--ink-4` | Color | Metadata, disabled |
| `--line` | Color | Borders, dividers |
| `--card` | Color | Card surfaces |
| `--accent` | Color | Primary accent |
| `--accent-hover` | Color | Accent hover |
| `--accent-active` | Color | Accent active |
| `--accent-soft` | Color | Soft accent bg |
| `--on-accent` | Color | Text on accent |
| `--pos` | Color | Income, positive |
| `--pos-soft` | Color | Soft positive bg |
| `--neg` | Color | Expense, negative |
| `--neg-soft` | Color | Soft negative bg |
| `--bg` | Color | Alias for `--paper` |
| `--bg-card` | Color | Card bg (alpha) |
| `--bg-sidebar` | Color | Sidebar bg (alpha) |
| `--border` | Color | Alias for `--line` |
| `--border-act` | Color | Active border |
| `--text` | Color | Alias for `--ink` |
| `--muted` | Color | Alias for `--ink-3` |
| `--dim` | Color | Alias for `--ink-4` |
| `--red` | Color | Alias for `--neg` |
| `--green` | Color | Alias for `--pos` |
| `--amber` | Color | Alias for `--accent` |
| `--shadow-sm` | Color | Small shadow |
| `--shadow-md` | Color | Medium shadow |
| `--shadow-lg` | Color | Large shadow |
| `--overlay` | Color | Overlay bg |
| `--backdrop` | Color | Backdrop bg |
| `--surface-inverted` | Color | Inverted surface |
| `--on-surface-inverted` | Color | Text on inverted |
| `--r` | Size | Standard radius (8px) |
| `--r-sm` | Size | Small radius (6px) |
| `--space-xs` | Size | 4px |
| `--space-sm` | Size | 8px |
| `--space-md` | Size | 16px |
| `--space-lg` | Size | 24px |
| `--space-xl` | Size | 32px |
| `--space-2xl` | Size | 48px |

### 10.2 Category Tokens

| Token | Description |
|-------|-------------|
| `--cat-food` | Food category bg |
| `--cat-food-ink` | Food category text |
| `--cat-groceries` | Groceries category bg |
| `--cat-groceries-ink` | Groceries category text |
| `--cat-rent` | Rent category bg |
| `--cat-rent-ink` | Rent category text |
| `--cat-transport` | Transport category bg |
| `--cat-transport-ink` | Transport category text |
| `--cat-travel` | Travel category bg |
| `--cat-travel-ink` | Travel category text |
| `--cat-shop` | Shopping category bg |
| `--cat-shop-ink` | Shopping category text |
| `--cat-entertainment` | Entertainment category bg |
| `--cat-entertainment-ink` | Entertainment category text |
| `--cat-health` | Health category bg |
| `--cat-health-ink` | Health category text |
| `--cat-edu` | Education category bg |
| `--cat-edu-ink` | Education category text |
| `--cat-sub` | Subscriptions category bg |
| `--cat-sub-ink` | Subscriptions category text |
| `--cat-util` | Utilities category bg |
| `--cat-util-ink` | Utilities category text |
| `--cat-card` | Credit card category bg |
| `--cat-card-ink` | Credit card category text |
| `--cat-investment` | Investment category bg |
| `--cat-investment-ink` | Investment category text |
| `--cat-transfer` | Transfer category bg |
| `--cat-transfer-ink` | Transfer category text |
| `--cat-inc` | Income category bg |
| `--cat-inc-ink` | Income category text |
| `--cat-other` | Other category bg |
| `--cat-other-ink` | Other category text |

---

## 11. Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-05-18 | Initial Observatory Ledger theme documentation |
