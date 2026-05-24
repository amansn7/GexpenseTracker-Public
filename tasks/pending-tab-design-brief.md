# Pending Tab UX/UI Improvement Plan

**Status**: Confirmed design brief — ready for implementation

## Chunks

### 1. Split-View Layout
CSS grid restructure within InboxView: list column (dense rows, no inline expansion) + detail panel on selection.
- List column (left ~40%): dense rows with checkbox, badge, subject, sender, snippet, confidence dots
- Detail panel (right ~60%): slides in when email selected
- Narrow viewport: detail panel overlays as slide-in with back arrow
- Group sections show counts until expanded, not individual rows

### 2. Dense Row Redesign
Compact row without inline expansion (moved to detail panel).
- Checkbox, Tx/Noise badge, subject (truncated), sender domain, snippet (1 line), confidence indicator (●●○ dots or "Low"/"Medium" label)
- Selected state: `--paper-2` background, left accent border (`--accent`)
- Hover: subtle background shift

### 3. Detail Panel
Slides in on click/Enter with full email context.
- Sender info, date
- "Why pending" explanation as subtle callout (`--paper-2` bg, small icon)
- Full email body (truncated with "Load full body" link)
- Persistent Keep/Discard buttons (always visible, not hidden behind scroll)

### 4. Enhanced Empty State
Two variants:
- **Reviewed**: "All caught up" + session stats ("You kept {N} and discarded {M} in {Z} min") + "Run sync" / "View transactions" / "Legacy review ({N})" links
- **First use**: "No emails to review yet" + "Run a sync to find expenses" CTA

### 5. Auto-Advance on Action
After keep/discard, auto-select next item in list.
- If last in group, collapse group
- If last overall, transition to empty state
- Keep session stats updated in real-time

### 6. Bulk Action UX
- Sticky bottom bar when ≥1 item selected
- Shows count, "Keep N" / "Discard N" buttons
- Progress indicator during bulk (X of Y complete)
- "Undo all" for 10s after completion
- Errors shown per-item inline

### 7. Session End
- "Done reviewing" button for satisfying closure (like Things 3)
- Session stats persist in localStorage
- "Last session: 12 kept, 3 discarded" shown on return

### 8. New Keyboard Shortcuts
- `a` — toggle select all
- `g` — jump to top / first group
- `Shift + j/k` — jump between groups
- `?` — toggle floating hint overlay

Keep existing: j/k/Enter/Space/d/e/z/Esc.

## Design Direction
- **Register**: Product
- **Color strategy**: Restrained (existing Warm Ledger tokens)
- **Scene**: User on a laptop at 9pm, reviewing flagged expenses from today's sync — slightly tired, wants confident yes/no decisions
- **Theme**: Warm light (existing)
- **Anchor references**: Linear (fast batch triage), Gmail priority inbox (visual density + grouping), Things 3 review mode (satisfying empty state + session progression)

## Implementation Notes
- All changes live in `inbox.jsx` (inline-in-InboxView architecture)
- CSS custom properties from DESIGN.md (--paper, --paper-2, --card, --line, --ink, --ink-2, --ink-3, --ink-4, --accent, --pos, --neg)
- Fraunces for display/amounts, Geist for body/labels, Geist Mono for tabular data
- No shadows at rest, tonal layering for depth
