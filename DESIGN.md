---
name: MoneyFlow
description: Inbox for your money — personal expense tracking from Gmail
colors:
  accent: "#c2410c"
  paper: "#f6f3ec"
  paper-2: "#efeadf"
  ink: "#1a1814"
  ink-2: "#3d3a33"
  ink-3: "#78736a"
  ink-4: "#a8a297"
  line: "#e3dcca"
  card: "#fbf9f3"
  pos: "#3d6b42"
  neg: "#8b2a1f"
  cat-food: "#e8d5b7"
  cat-rent: "#cdd8d1"
  cat-shop: "#e5d1d9"
  cat-travel: "#d4dde5"
  cat-sub: "#dccfe0"
  cat-util: "#d9dbc9"
  cat-inc: "#c9dcc8"
  cat-other: "#dcd5c3"
typography:
  display:
    fontFamily: "'Fraunces', Georgia, serif"
    fontSize: "22px"
    fontWeight: 500
    letterSpacing: "-0.015em"
  title:
    fontFamily: "'Fraunces', Georgia, serif"
    fontSize: "54px"
    fontWeight: 400
    letterSpacing: "-0.03em"
  body:
    fontFamily: "'Geist', system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
  label:
    fontFamily: "'Geist', system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 500
    textTransform: uppercase
    letterSpacing: "0.08em"
  mono:
    fontFamily: "'Geist Mono', monospace"
    fontSize: "12px"
    fontWeight: 400
rounded:
  sm: "6px"
  md: "12px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "28px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.sm}"
    padding: "10px 20px"
    fontSize: "13px"
  button-ghost:
    backgroundColor: transparent
    textColor: "{colors.ink-2}"
    rounded: "{rounded.sm}"
    padding: "10px 20px"
    border: "1px solid {colors.line}"
  card-default:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.md}"
    border: "1px solid {colors.line}"
  input-default:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    border: "1px solid {colors.line}"
    padding: "7px 10px"
---

# Design System: MoneyFlow

## 1. Overview

**Creative North Star: "The Warm Ledger"**

MoneyFlow's design sits between a personal notebook and a professional finance tool — warm enough to feel approachable, structured enough to feel trustworthy. The system uses restrained, warm-toned neutrals with a single orange accent that appears sparingly (labels, links, progress indicators), never as decoration. Surfaces are flat by default; depth is communicated through tonal layering (paper → paper-2 → card) rather than shadows or backdrop blur.

This system explicitly rejects the dark-SaaS template: no purple gradients, no glassmorphism, no ambient glow orbs. Every pixel serves information.

**Key Characteristics:**
- Warm neutral base with restrained accent usage
- Flat surfaces with tonal depth, no shadows at rest
- Serif display for titles (character), sans for body (readability)
- Monospace for financial data, code, and tabular numbers
- Standard layout patterns (sidebar + topbar + content) — users should feel immediately oriented

## 2. Colors

The palette centers on warm earth tones: cream backgrounds, warm charcoal text, and a single terra-cotta accent.

### Primary
- **Terra-Cotta** (`#c2410c`): Primary accent — used for active states, links, focus indicators, and progress bars only. Not decorative. Never gradients.

### Neutral
- **Warm Cream** (`var(--paper)`, `#f6f3ec`): Primary surface background.
- **Warm Cream Deep** (`var(--paper-2)`, `#efeadf`): Secondary surface, hover states, alternating rows.
- **Charcoal** (`var(--ink)`, `#1a1814`): Primary text.
- **Warm Ash** (`var(--ink-2)`, `#3d3a33`): Secondary text, nav items.
- **Warm Ash Muted** (`var(--ink-3)`, `#78736a`): Tertiary text, metadata.
- **Warm Ash Faint** (`var(--ink-4)`, `#a8a297`): Placeholder, disabled, borders secondary.
- **Warm Border** (`var(--line)`, `#e3dcca`): Divider lines, borders.
- **White Cream** (`var(--card)`, `#fbf9f3`): Card elevation surface, inputs.

### Semantic
- **Pine** (`var(--pos)`, `#3d6b42`): Positive amounts, income, success states.
- **Brick** (`var(--neg)`, `#8b2a1f`): Negative amounts, expense amounts, errors.

### Category Colors (muted pastels for visual grouping)
- Food (`#e8d5b7`), Rent (`#cdd8d1`), Shopping (`#e5d1d9`), Travel (`#d4dde5`), Subscriptions (`#dccfe0`), Utilities (`#d9dbc9`), Income (`#c9dcc8`), Other (`#dcd5c3`)

### Named Rules
**The One Accent Rule.** The terra-cotta accent appears on ≤10% of any given screen. Its rarity is the point. If an element needs emphasis but doesn't signal interaction, use `--ink-2` or `--ink-3` instead.

**The No-Gradient Rule.** Accent color is always a solid fill. No linear gradients on buttons, bars, backgrounds, or text.

## 3. Typography

**Display Font:** Fraunces (with Georgia, serif fallback)
**Body Font:** Geist (with system-ui, -apple-system fallback)
**Label/Mono Font:** Geist Mono (with monospace fallback)
**Italic Accent Font:** Instrument Serif (italic only — used for brand mark flourish)

**Character:** The pairing is warm editorial meets tool clarity. Fraunces brings a subtle literary quality to headings and amounts. Geist is clean and neutral — it does the work without personality. Together they signal: this is a considered tool, not a spreadsheet.

### Hierarchy
- **Display** (Fraunces 500, 22px, -0.015em): Page titles in the topbar. Only one per view.
- **Title** (Fraunces 400, 54px, -0.03em): Big amount display in the detail panel. Reserved for financial figures.
- **Body** (Geist 400, 13px): Transaction rows, table content, descriptions, detail fields. The workhorse.
- **Label** (Geist 500, 11px, 0.08em uppercase): Section labels, column headers, badge text, date groups.
- **Mono** (Geist Mono, 12px): Amounts in lists, confidence percentages, currency figures, tabular data, keyboard shortcuts. Always uses `font-variant-numeric: tabular-nums`.

## 4. Elevation

MoneyFlow uses **tonal layering** rather than shadows. Depth is communicated by shifting the neutral value: surfaces stack as paper → paper-2 → card. There are no box-shadows at rest. The only shadow use is on floating UI (modals, popovers, the sync progress panel) where a subtle `0 8px 32px rgba(0,0,0,0.15)` separates the overlay from content.

### Named Rules
**The Flat-by-Default Rule.** Surfaces are flat at rest. Shadows appear only as a response to state (hover on table rows lifts 1px) or to separate floating UI from content.

## 5. Components

### Buttons
- **Shape:** Gently rounded corners (6px radius).
- **Primary** (`--ink` background, `--paper` text, 10px 20px padding): The one call-to-action per view. Reserved for primary actions (Sync, Save, Import).
- **Hover:** `filter: brightness(1.1)` — no background color change, just a lift in perceived lightness.
- **Ghost** (`transparent` background, `--ink-2` text, 1px `--line` border): Secondary actions, cancel buttons, filter toggles.
- **Disabled:** 0.5 opacity, cursor not-allowed. No hover effect.
- **There are no gradient buttons.** No multi-color backgrounds.

### Chips / Badges
- **Shape:** Pill-shaped (20px radius).
- **Labels:** Expense (red bg), Income (green bg), Ignore (muted bg), Review (accent bg). Small type at 11px, 600 weight.
- **Category:** Square corners (4px), colored background with matching ink. Used in sidebar filter list and transaction rows.

### Cards / Containers
- **Corner Style:** Gentle radius (12px).
- **Background:** White cream (`--card`), one step lighter than the page surface.
- **Shadow:** None at rest. No backdrop-filter blur. Card is defined by its lighter background and 1px `--line` border.
- **Internal Padding:** 16px standard.

### Inputs / Fields
- **Style:** 1px `--line` stroke, transparent background (`--card`), 6px radius.
- **Focus:** Border shifts to `--accent` color. No glow, no outline (outline set to `none` on focus, relying on border color change plus the `focus-ring` class outline).
- **Placeholder:** `--ink-3` color.

### Navigation (Sidebar)
- **Style:** Vertical list of text buttons with 10px horizontal padding. Active state gets a `--paper-2` background with `--ink` text color. Inactive items use `--ink-2`.
- **Hover:** Background shifts to `--paper-2` (same as active, no separate hover state).
- **Mobile:** Fixed overlay with backdrop, 86vw max width, slides in from left with `transform: translateX()`.

## 6. Do's and Don'ts

### Do:
- **Do** use the terra-cotta accent sparingly — ≤10% of any surface.
- **Do** use Fraunces for page titles and large amounts only. Body copy stays in Geist.
- **Do** use tonal layering (paper → paper-2 → card) for depth instead of shadows.
- **Do** use `transform: scaleX()` on progress bars instead of animating `width`.
- **Do** keep buttons solid, flat, and single-color. No gradients.
- **Do** use CSS `:hover` or the `hover-bg` class for hover states — never inline `onMouseEnter` handlers.

### Don't:
- **Don't** use gradient fills on buttons, progress bars, backgrounds, or text.
- **Don't** use glassmorphism (`backdrop-filter: blur()`) on cards, sidebars, or panels.
- **Don't** use ambient glow orbs or decorative floating background elements.
- **Don't** animate `width` or `height` — use `transform: scaleX()` / `scaleY()` instead.
- **Don't** use `#fff` or `#000` directly — always reference `--paper` and `--ink` tokens.
- **Don't** use purple gradients, neon accents, or the dark-SaaS template.
- **Don't** use bounce or elastic easing — prefer `cubic-bezier(.4,0,.2,1)`.
- **Don't** use side-stripe borders (border-left > 1px as colored accent).
- **Don't** use display fonts in UI labels, buttons, or data.
