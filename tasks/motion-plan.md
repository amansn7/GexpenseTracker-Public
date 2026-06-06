# Motion Plan — MoneyFlow

**Register:** Product (app UI — motion serves tasks, not spectacle)  
**North Star:** "The Warm Ledger" — motion that feels like turning pages, not flashy effects  
**Existing state:** 22 keyframes, 120-200ms hover transitions, skeleton shimmer, toast in/out, modal in, staggered row entrance, button press. Already has `prefers-reduced-motion` support.

## Guiding Principles

1. **Motion conveys state, not decoration.** Every animation has a purpose: feedback, reveal, hierarchy, transition.
2. **Spend the budget on high-impact moments.** The inbox row list, detail panel open/close, sync panel, and dashboard stat reveal are where users spend 90% of their time.
3. **Exponential ease-out curves only.** No bounce, no elastic, no CSS `ease` default. Duration matters more than easing.
4. **Exit faster than entry.** ~75% of enter duration for exits.
5. **Respect reduced motion.** Already handled globally, but preserve functional feedback (spinners slowed, opacity-only states).

---

## Motion Tokens (to add to `:root`)

```css
:root {
  --ease-out-quart: cubic-bezier(0.25, 1, 0.5, 1);
  --ease-out-quint: cubic-bezier(0.22, 1, 0.36, 1);
  --ease-out-expo:  cubic-bezier(0.16, 1, 0.3, 1);
  --ease-out-smooth: cubic-bezier(0.4, 0, 0.2, 1);
  --ease-in:        cubic-bezier(0.7, 0, 0.84, 0);
  --ease-in-out:    cubic-bezier(0.65, 0, 0.35, 1);

  --dur-instant:  80ms;
  --dur-fast:     120ms;
  --dur-normal:   200ms;
  --dur-slow:     350ms;
  --dur-reveal:   500ms;
}
```

(Some already exist — consolidate into these tokens.)

---

## Animation Inventory by Surface

### 1. Navigation & Shell

| Element | What | Duration | Easing | Notes |
|---------|------|----------|--------|-------|
| **Mobile sidebar open** | Slide from left | 180ms `ease-out` | `var(--ease-out-smooth)` | Already exists, good |
| **Mobile sidebar close** | Slide to left | 140ms `ease-in` | `var(--ease-in)` | Exit = 75% of enter |
| **Sidebar backdrop** | Opacity fade | 180ms | `var(--ease-out-smooth)` | Already exists |
| **Sidebar section collapse** | Chevron rotation | 120ms | `var(--ease-out-quart)` | Exists but needs token |
| **View transition (route change)** | Content crossfade | 200ms | `var(--ease-out-quart)` | **NEW** — subtle opacity + translateY(4px) on content area when switching views |
| **Theme switch** | Immediate color swap with 200ms transition on `background`/`color` | Already works via `transition: background 200ms ease, color 200ms ease` on body |
| **Account menu dropdown** | Fade + slight translateY | 150ms | `var(--ease-out-quart)` | **NEW** — replace instant show/hide |

### 2. Topbar & Search

| Element | What | Duration | Easing | Notes |
|---------|------|----------|--------|-------|
| **Search dropdown open** | Fade + translateY(4px) | 150ms | `var(--ease-out-quart)` | Already uses `.fade-in` class (200ms) |
| **Search results items** | Staggered fadeSlideUp | 120ms, stagger 20ms | `var(--ease-out-quart)` | **NEW** — subtle between-item stagger |
| **Search spinner** | Spin animation | 600ms linear infinite | Already exists |

### 3. Inbox — Transaction List

| Element | What | Duration | Easing | Notes |
|---------|------|----------|--------|-------|
| **Row entrance (initial load)** | Staggered fadeSlideUpSpring | 300ms, stagger 40ms | `var(--ease-out-expo)` | Already exists via `anim-row-spring` — **keep** |
| **Row hover** | Background shift | 120ms | `var(--ease-out-quart)` | Already exists via `transition: background 120ms` |
| **Row selection** | Background + border-left | 120ms | `var(--ease-out-quart)` | Already exists |
| **Row unread dot** | Subtle pulse on new items | 2s infinite, then stops | Use `@keyframes pulse` for unread indicator | **NEW** — soft pulse attention |
| **Filter chip toggle** | Background + color crossfade | 120ms | `var(--ease-out-quart)` | Already works via `transition: all 120ms ease` on chips |

### 4. Inbox — Detail Panel

| Element | What | Duration | Easing | Notes |
|---------|------|----------|--------|-------|
| **Panel open** | Slide from right (translateX) + fade | 250ms | `var(--ease-out-quint)` | **NEW** — currently instant. Panel slides in from 20px offset |
| **Panel close** | Slide to right + fade | 180ms | `var(--ease-in)` | Exit |
| **Panel content** | Staggered reveal of sections | 200ms, stagger 40ms | `var(--ease-out-quart)` | **NEW** — sections fade+slide up as panel opens |
| **Amount edit toggle** | Border-bottom color + cursor transition | 150ms | `var(--ease-out-quart)` | Already works via CSS |
| **Recategorize preview** | FadeSlideUp | 200ms | `var(--ease-out-quart)` | Already uses `.fade-in` class |
| **Recategorize success/error** | FadeSlideUp | 200ms | `var(--ease-out-quart)` | Already uses `.fade-in` class |
| **LLM/Rules toggle** | Slider pill translateX | 200ms | `var(--ease-out-smooth)` | Already exists inline — extract to CSS class |
| **Note save spinner** | Spin animation | 700ms linear | Already exists |
| **Category picker open** | Fade + scale (modalIn) | 200ms | `var(--ease-out-quart)` | Already uses `.fade-in` class |
| **Category picker items** | Staggered fadeSlideUp | 120ms, stagger 20ms | `var(--ease-out-quart)` | **NEW** — subtle entrance stagger |

### 5. Sync Panel

| Element | What | Duration | Easing | Notes |
|---------|------|----------|--------|-------|
| **Panel show** | Slide up + fade | 350ms | `var(--ease-out-smooth)` | Already exists in CSS — good |
| **Panel hide** | Slide down + fade | 250ms | `var(--ease-out-quart)` | Exists |
| **Progress bar** | ScaleX width transition | 400ms | `var(--ease-out-smooth)` | Exists as `.progress-fill-sync` |
| **Preview items entering** | Staggered fadeSlideUp | 200ms, stagger 30ms | `var(--ease-out-quart)` | Already uses `fadeSlideUp .2s` |
| **Sync completion** | Checkmark pop + color shift | 300ms | `var(--ease-out-quint)` | **NEW** — brief scale pulse on completion indicator |

### 6. Toasts

| Element | What | Duration | Easing | Notes |
|---------|------|----------|--------|-------|
| **Toast enter** | Slide from right (120% → 0) | 250ms | `var(--ease-out-expo)` | Already exists in CSS — `toastIn` |
| **Toast exit** | Slide to right | 280ms | `var(--ease-in)` | Already exists — `toastOut` |
| **Toast stacking** | No transform animation needed | — | — | OK as-is |

### 7. Dashboard

| Element | What | Duration | Easing | Notes |
|---------|------|----------|--------|-------|
| **Stat cards entrance** | Staggered fadeSlideUpSpring | 300ms, stagger 60ms | `var(--ease-out-expo)` | Already uses `anim-row-spring` with `--i` |
| **Hero section entrance** | FadeSlideUp | 350ms | `var(--ease-out-quint)` | **NEW** — the hero number is the most important element |
| **Hero amount count-up** | Animated number reveal | 600ms | ease-quad | Already exists in `app.js` as `countUp()` |
| **Category bar fill** | ScaleX reveal | 400ms | `var(--ease-out-smooth)` | Already exists with 400ms cubic-bezier |
| **Budget bar fill** | ScaleX reveal | 400ms | `var(--ease-out-smooth)` | Already exists |
| **Sparkline bars** | Height grow animation | 500ms (split across items) | `var(--ease-out-expo)` | **NEW** — bars scale up sequentially |
| **Merchant list rows** | Staggered fadeSlideUp | 200ms, stagger 30ms | `var(--ease-out-quart)` | Already uses `anim-row` |
| **Net worth section** | Staggered fadeSlideUpSpring | 300ms, stagger 40ms | `var(--ease-out-expo)` | Already uses `anim-row-spring` |
| **Date range toggle** | Button active state | 120ms | `var(--ease-out-quart)` | Already works |

### 8. Modals, Dropdowns & Overlays

| Element | What | Duration | Easing | Notes |
|---------|------|----------|--------|-------|
| **Edit modal open** | Scale (0.96) + fade | 200ms | `var(--ease-out-quint)` | Already has `modalIn` keyframe |
| **Edit modal close** | Scale (0.96) + fade out | 150ms | `var(--ease-in)` | **NEW** — add exit animation |
| **Backdrop** | Opacity fade in/out | 200ms | `var(--ease-out-smooth)` | Already has `backdropIn` |
| **Category dropdown (inline)** | Fade + translateY | 150ms | `var(--ease-out-quart)` | Already uses `.fade-in` |
| **Email tooltip** | Fade in | 120ms | `var(--ease-out-quart)` | **NEW** — currently appears instantly after 3s delay |
| **Duplicate pair cards** | Staggered fadeSlideUp | 200ms, stagger 30ms | `var(--ease-out-quart)` | **NEW** — entrance animation |

### 9. Micro-interactions

| Element | What | Duration | Easing | Notes |
|---------|------|----------|--------|-------|
| **Button hover** | Filter brightness | 120ms | `var(--ease-out-quart)` | Already exists |
| **Button press** | Scale(0.97) | 80ms | spring | Already exists via `.btn-press` |
| **Progress fill hover** | No change needed | — | — | Already good |
| **Checkbox toggle** | Accent color transition | 150ms | `var(--ease-out-quart)` | Native checkbox — limited control |
| **Row hover lift** | translateY(-1px) + shadow | 100ms | `var(--ease-out-quart)` | Already exists on table rows |
| **Sticky header state** | No animation needed | — | — | Keep instant (scroll-driven) |

---

## New CSS Keyframes to Add

```css
/* Panel slide-in — for detail panel */
@keyframes slideInRight {
  from { opacity: 0; transform: translateX(20px); }
  to   { opacity: 1; transform: translateX(0); }
}
@keyframes slideOutRight {
  from { opacity: 1; transform: translateX(0); }
  to   { opacity: 0; transform: translateX(20px); }
}

/* Content crossfade — for view transitions */
@keyframes viewEnter {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* Unread dot pulse */
@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%      { opacity: 0.6; transform: scale(1.3); }
}

/* Completion check pop */
@keyframes checkPop {
  0%   { transform: scale(0); opacity: 0; }
  60%  { transform: scale(1.2); }
  100% { transform: scale(1); opacity: 1; }
}
```

---

## Implementation Priority

### Wave 1 (High Impact, Low Effort) — ~15 min

1. Add motion tokens to `:root` in CSS
2. Add `.slide-in-right` / `.slide-out-right` classes for detail panel
3. Add `.view-enter` class for view transitions
4. Add `.pulse-dot` class for unread indicators
5. Add exit animation for edit modal backdrop
6. Extract inline `toggle-slider` transition to CSS class

### Wave 2 (Medium Impact, Medium Effort) — ~30 min

7. Wire detail panel sections stagger (panel opens → sections fade in)
8. Wire category picker item stagger
9. Wire search result item stagger
10. Add email tooltip fade-in
11. Add duplicate pair card entrance stagger
12. Add dashboard hero section entrance

### Wave 3 (Polish, Lower Visibility) — ~20 min

13. Stat count-up improvements (already works, ensure all dash stats use it)
14. Sparkline bar-growth animation
15. Sync completion checkmark pop
16. Account menu dropdown fade-in

---

### 10. Login / Auth

| Element | What | Duration | Easing | Notes |
|---------|------|----------|--------|-------|
| **Toggle entrance (drop)** | translateY from above viewport to center | 1200ms | `cubic-bezier(.34,1.56,.64,1)` | Full overshoot bounce — matches toggle hover curve |
| **Three.js dot burst** | Dots spread from center (0,0,0) to grid positions | 2000ms, stagger 0-35% | `ease-out-quart` | `spreadActive` is one-shot; dots animate Y sine wave continuously |
| **#bg canvas fade-in** | Opacity 0 → 1 | 1000ms | `ease-out` | Starts at same time as drop |
| **Day/night toggle on impact** | Sets `data-theme` opposite, calls `playToggleSound()` | ~420ms (triggered, not timed) | — | No localStorage save — visual demo only |
| **Toggle slide to bottom-right** | translateX/Y from center to final position | 1000ms | `cubic-bezier(.34,1.56,.64,1)` | Same overshoot curve |
| **Login card materialize** | Opacity + translateY | 800ms | `var(--ease-out-quart)` | Starts at 1400ms (after drop resolves) |
| **Inline style cleanup** | Remove `transition`, `opacity`, `transform` from `.wrap` | ~2500ms | — | Leaves `opacity:1` since CSS has `opacity:0`; clears `transition` so CSS theme class transitions work |
| **Reduced-motion** | Skip all entrance, show everything immediately | — | — | CSS `.wrap { opacity:1 }`, `#bg { opacity:1 }` override at `prefers-reduced-motion: reduce` |

**Key implementation details:**
- Toggle starts off-screen top (`translate`) with no CSS transition — JS snap-positions it, then applies transition for the drop.
- `#bg` starts `opacity:0` via CSS (no inline style needed).
- Sound effect on day/night toggle uses existing `playToggleSound()` function.
- Reduced-motion CSS overrides `opacity:0` on `.wrap` and `#bg` so content is immediately visible.
- Compiled to `static/dist/login-effects.js` (4095 bytes), hashed in `templates/login.html`.

---

## What NOT to Animate

- **Sidebar nav items** — they're static navigation, motion would feel sluggish
- **Table headers** — sticky state changes should be instant
- **Date range inputs** — date pickers handle their own UI
- **Body background on theme switch** — already smooth via CSS transition, don't overcomplicate
- **SVG chart elements** — sparklines and area charts update on data change; animating them would fight the data refresh
