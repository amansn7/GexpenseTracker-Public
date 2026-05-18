# MoneyFlow — App Spec (Redesign)

## North Star

**Users don't want to manage finances. They want to know they're okay.**

Every screen answers one question in under 5 seconds. If the user has to scan, compare, or calculate, the screen has failed.

---

## Architecture: 4 Modes

| Mode | Question Answered | Replaces |
|---|---|---|
| **Today** | "What's my situation right now?" | Dashboard hero, Health stats, unread counts |
| **Review** | "What needs my decision?" | Inbox list+detail, duplicates, review queue |
| **Picture** | "Where did my money go?" | Flow, Dashboard full, Health, Reports |
| **Settings** | "How do I configure MoneyFlow?" | Settings, Profile, admin tools |

---

## Today (Default Landing)

Three bands, top to bottom:

**1. Answer Band** — one number, one sentence
- `"₹47,200 ahead this month"` or `"₹3,100 over budget — subscriptions ran high"`
- 30-day sparkline below (no axes, no labels, just shape)
- Only thing above the fold on a 13-inch screen

**2. Attention Band** — what needs action, ranked (max 4 items)
- `"3 transactions need review"` → tap enters Review
- `"Amazon charge 2.3x your usual"` → tap sees detail
- `"Netflix increased to ₹649"` → tap acknowledges
- Empty: `"All caught up."` with a subtle mark

**3. Context Band** — the numbers behind the answer
- Income | Spent | Remaining as three mono figures
- Tap any figure opens a drill-down overlay (not a new view)

**No date range picker.** Defaults to "this month." Deep analysis happens in Picture.

---

## Review (Transaction Processing)

Two states:

### Queue Mode (default when items exist)
- Single card, one transaction at a time
- Shows: merchant, amount, auto-assigned category, confidence
- Three actions: **Approve** (largest), **Edit**, **Skip**
- Keyboard: `A` approve, `E` edit, `S` skip
- Progress: `"12 of 47 reviewed"`
- High-confidence auto-approve with flash animation
- Low-confidence pause for explicit decision with email excerpt

### Browse Mode (search and lookup)
- Dense table: Date, Merchant, Category, Amount, Confidence, Notes
- Sortable columns, filter chips at top
- Inline expand on row click (accordion, not side panel)
- For looking things up, not processing

---

## Picture (Financial Understanding)

Three tabs:

**Flow tab** — Sankey diagram
- Income sources → Pool → Categories
- Hover any flow for amount
- Date range picker (This Month, Last 3, This Year)

**Trend tab** — Monthly net bar chart
- 12 bars, green above zero, red below
- Net figure below each bar
- 3-month moving average line overlay
- Footer: `"Runway: 4.2 months · Savings rate: 18%"`

**Breakdown tab** — Category treemap
- Rectangles sized by spend, colored by category
- Hover for amount and % of total
- Click to see transactions in overlay
- Below: top 5 merchants as ranked list

---

## Settings (Configuration)

Grouped by frequency:

**Connected** (always visible)
- Gmail sync: last synced, next sync, trigger button
- AI provider: name, model, status
- One-line health: `"Synced 2h ago · AI responding normally"`

**Categories** (expandable)
- Editable category grid
- "Generate from data" button
- Auto-assigned colors from palette

**Preferences** (expandable)
- Starting balance + date
- Currency, timezone
- Budget per category (inline)

**Advanced** (collapsed by default)
- AI services, connected accounts, 2FA, access control, deletion

Admin tools move to separate `/admin` route.

---

## Navigation

```
Moneyflow

  Today
  Review    (12)    ← count only when items exist
  Picture
  Recurring
  Debt

  Search     ⌘K

[Account menu]
```

**Removed from sidebar:**
- Filters → Review view chips
- Categories → Picture > Breakdown tab
- Theme swatches → Settings > Preferences
- Profile → Settings account section
- Admin tools → `/admin` route

**7 items instead of 25+.**

---

## Key Interaction Changes

### Progressive Disclosure
Show the answer → tap for details → tap for raw data. Never show everything at once.

### Natural Language Summaries
Charts still exist, but a sentence comes first:
- `"Food and transport were 60% of spending this month"`
- `"Spending is down 12% from last month"`
- `"You're saving ₹18 of every ₹100 earned"`

### Auto-Processing Tiers
| Confidence | Behavior |
|---|---|
| >90% | Auto-approved, appears in processed log with undo |
| 70-90% | Review queue, one tap to approve |
| <70% | Pauses queue, requires explicit decision |

### Command Palette (⌘K)
Unified: search transactions, navigate views, trigger actions, open settings.

### Peace-of-Mind Indicators
- Review badge disappears when zero (not "0", just absent)
- Sync shows a check, not a timestamp, when current
- Absence of alerts IS the alert

---

## What Gets Removed

| Current | Why |
|---|---|
| Separate Dashboard view | Redundant with Today + Picture |
| Separate Flow view | Sankey is one tab in Picture |
| Separate Health view | Runway + savings rate are footer info |
| Separate Reports view | Monthly table is one tab in Picture |
| Inbox filters as nav items | Belong on Review view, not as destinations |
| Categories as nav items | For understanding, not navigating |
| Theme swatches in sidebar | Not a daily decision |
| Profile as separate view | Belongs in Settings |
| Admin tools in Settings | Debugging mixed with user config |

---

## Design System (Unchanged Core)

**Palette:** Warm cream, charcoal, terra-cotta accent. "The Warm Ledger" stays.

**Color strategy per mode:**
- Today: Restrained (accent ≤10%)
- Review: Committed (accent 30-40% for action surface)
- Picture: Full palette (category colors as data viz)
- Settings: Restrained (semantic color only)

**Typography:** Fraunces reserved for money amounts only. Page titles switch to Geist uppercase labels.

**Elevation:** Tonal layering (paper → paper-2 → card), no shadows at rest.

---

## Implementation Order

1. Today view (highest impact, new landing)
2. Review queue mode (reduces inbox processing load)
3. Picture view (consolidates 4 existing views)
4. Settings reorganization (important but not daily)
5. Command palette (nice to have)
6. Natural language summaries (layer on existing stats APIs)
