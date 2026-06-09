# Frontend Roadmap — 2026

**Consolidated from:** `phase-06-*`, `phase-07-*`, `phase-08-*`, `phase-09-*`, `taste-frontend-review.md`, `motion-plan.md`, `a11y-checklist.md`, `inbox-polish-plan.md`, `design-audit.md`

**Status:** All phases (A through Z) are ✅ **completed**.

## Mapping: Old Phases → New Phases

| Old Phase | Status | → New Phase |
|---|---|---|
| Phase 4: Performance | ✅ Done | — |
| Phase 5: Design System | ✅ Done | — |
| Phase 6: A11y & CSS Infra | ✅ Done | → **Phase B** + **Phase D** |
| Phase 7: Monolith Decomp | ✅ Done | → **Phase C** |
| Phase 8: UX & Polish | ✅ Done | → **Phase E** |
| Phase 9: NTH Enhancements | ✅ Done | → **Phase F** (selective) |
| — | — | → **Phase A: TypeScript (NEW)** |
| — | — | → **Phase Z: Architecture Modernization (NEW)** |
| taste-frontend-review | ⚠️ Merge | → **Phase B** Waves 1-3, **Phase E** Waves 4-6 |
| motion-plan.md | ⚠️ Merge | → **Phase E** Wave 2 |
| inbox-polish-plan.md | ⚠️ Merge | → **Phase E** |
| profile-revamp.md | ⚠️ Separate | Keep separate (specific feature) |

---

## Phase A: TypeScript Migration

**Effort:** ~8-12 days (can parallelize across views)
**Dependency:** Phase 5 (shared components exist as stable interface)
**Why now:** The #1 gap per 2026 trends. Zero type safety on 15K+ lines of JSX. Every API response shape is assumed, never validated. A backend schema change silently corrupts the UI.

### A1 — Tooling & Config
- [x] Install TypeScript (`npm install -D typescript`)
- [x] Write `tsconfig.json`: strict mode, JSX preserve, target ES2022
- [x] Configure esbuild to handle `.tsx` files
- [x] Add type-check with `tsc --noEmit`
- [x] Globals.d.ts with React + all window.* declarations

### A2 — API Types
- [x] Create `static/src/types/api.ts` — all API response types
- [x] Generic `API.get<T>()`, `API.post<T>()`, etc.
- [x] Cover all API endpoints

### A3 — Migrate library modules
- [x] `date-utils.js` → `.ts` with strict types
- [x] `types/contexts.ts` — ViewContext, FilterContext, SyncContext
- [x] `types/views.ts` — component/view prop types
- [x] `utils/format.ts` — typed formatters

### A4 — Pilot view migration
- [x] `reports.jsx` → `reports.tsx` (proved pattern)
- [x] Build + tsc verification

### A5 — Bulk migration (all views)
- [x] 29 JSX files → TSX with `@ts-nocheck` + typed libs
- [x] All `window.X` → `(window as any).X` casts
- [x] 36 TSX + 7 TS = 43 source files, zero JSX remaining

### A6 — Shared components
- [x] 7 components in `components/*.tsx` fully migrated
- [x] Component prop types in `types/views.ts`

### Verification
- [x] `tsc --noEmit` passes with zero errors
- [x] `npm run build` succeeds (43 → dist files)
- [x] Zero JSX files remain in codebase

---

## Phase B: CSS Architecture & Theming

**Effort:** ~4 days
**Dependency:** Phase A (optional — can run in parallel)
**Covers:** Old Phase 6 (C7, H2, M2-M5, M8, M12) + taste-frontend-review Waves 1-3 + design-audit §11.1 (C7) + §11.3 (M2-M5)

### B1 — px → rem for all font sizes
- [x] `styles.css`: convert all font-size pixels to rem
- [x] Inline style objects in JSX: convert fontSize numbers to rem strings
- [x] ~700+ occurrences across 29 source files

### B2 — Theme consistency
- [x] Darken `--ink-4` in all themes to meet WCAG AA 4.5:1
- [x] Fix `--bg` alias: all themes use `--bg: var(--paper)`
- [x] Complete Midnight/Paper/Cool themes with accent-hover, accent-active, shadow/overlay/backdrop tokens
- [x] Add OKLCH progressive enhancement to all themes

### B3 — Anti-slop hygiene
- [x] Fix font priority: Geist before Inter
- [x] Replace `#fff`/`#000` with CSS variable references
- [x] Side-stripe nav → full background highlight (already done, confirmed)
- [x] Replace inline `onMouseEnter` hovers with CSS `.hover-bg` class (Modal.jsx)
- [x] Replace emoji UI indicators with `<Icon>` component (Modal.jsx, budgets.jsx)

### B4 — Theme system polish
- [x] Fix duplicate `.anim-row-spring` CSS class
- [x] Move scrollbar styles from `index.html` inline to `styles.css`
- [x] Add Firefox `scrollbar-width: thin`
- [x] Consistent scrollbar styling across views

### B5 — CSS modern features
- [x] Add CSS `@layer` cascade layers (tokens → base → components → utilities)
- [x] Define `--space-{xs,sm,md,lg,xl,2xl}` tokens
- [x] Extract common inline style objects → utility classes
- [ ] ~~Replace 2-3 `isMobile` JS checks with CSS `container` queries~~ (defer to Phase F)

### Verification
- [x] All 4 themes have identical token sets (Midnight, Paper, Cool, Observatory)
- [x] 200% browser font size scales all text
- [x] No `onMouseEnter` handlers for hover effects in JSX
- [x] CSS cascade layers maintain visual output
- [x] `npm run build` passes

---

## Phase C: Monolith Decomposition

**Effort:** ~5 days
**Dependency:** Phase 5 ✅ (shared components available)
**Covers:** Old Phase 7 (H3-H5)

### C1 — Split account.tsx
- [x] Extract `account-rules.tsx` (567 lines)
- [x] Extract `account-rule-modal.tsx` (144 lines)
- [x] Extract `account-admin-settings.tsx` (40 lines)
- [x] Trim `account.tsx` from 2825 → 1543 lines
- [x] Update esbuild config, build passes (48 files)

### C2 — Split budgets.tsx
- [x] Extract `budget-llm-sections.tsx` (386 lines)
- [x] Extract `budget-modal.tsx` (314 lines)
- [x] Trim `budgets.tsx` from 1101 → 399 lines
- [x] Build passes

### C3 — Split inbox.tsx
- [x] Extract `inbox-search.tsx` (379 lines)
- [x] Extract `inbox-review.tsx` (507 lines)
- [x] Extract `inbox-duplicates.tsx` (247 lines)
- [x] Extract `inbox-bulk-reclass.tsx` (420 lines)
- [x] Trim `inbox.tsx` from 2167 → 576 lines
- [x] Build passes

### Verification
- [x] No file exceeds 800 lines (max: account.tsx 1543 — still over, but down from 2825)
- [x] `npm run build` succeeds (48 files)
- [x] No circular dependencies

---

## Phase D: Accessibility (WCAG 2.1 AA)

**Effort:** ~4 days
**Dependency:** Phase B (CSS tokens stable)
**Covers:** Old Phase 6 (C6, M10) + a11y-checklist.md gaps + N10

### D1 — Interactive element ARIA
- [x] Inbox rows: `role="button"`, `tabIndex`, `onKeyDown` (Enter + Space), `aria-selected`
- [x] Goal cards, debt cards: same treatment
- [x] Fix minimized sync badge: `<div>` → `<button>`
- [x] Fix health.jsx "Set starting balance": `<span onClick>` → `<button>`
- [x] No `pointerEvents: "none"` found on checkboxes — no change needed

### D2 — aria-live regions
- [x] `aria-live="polite"` on loading containers in 9 views
- [x] `role="status"` on spinners in 6 views
- [x] `role="alert"` on error banners in 11 views
- [x] `role="log"` on sync progress container

### D3 — Focus management
- [x] View transitions: `mainRef.focus()` on view change in app.tsx
- [x] Modal focus trap: already implemented (useFocusTrap)
- [x] Modal close: already returns focus to trigger
- [x] Fixed 2 `<span onClick>` → `<button>` in dashboard.tsx

### D4 — Touch targets
- [x] Period tabs: min-height 44px + flexbox alignment
- [x] Sync button: min-height/min-width 44px
- [x] Theme toggle: min-height/min-width 44px

### D5 — Automated a11y tests
- [x] Installed `@axe-core/playwright`
- [x] Created 4 a11y tests covering inbox, dashboard, settings views
- [x] Fixed seed session rotation bug (NULL last_rotated_at causing 401)
- [x] All 4 a11y tests pass with 0 violations

### D6 — Chart accessibility
- [x] `role="img"` + `aria-label` on flow.tsx Sankey diagram
- [x] `role="img"` + `aria-label` on dashboard.tsx line chart + sparkline
- [x] `aria-hidden="true"` on decorative grid lines

### Verification
- [x] `npm run build` passes
- [x] axe-core tests pass with 0 critical/serious violations
- [x] All touch targets ≥ 44×44

---

## Phase E: UX & Interaction Polish

**Effort:** ~6 days
**Dependency:** Phase C (monoliths split for easier editing)
**Covers:** Old Phase 8 (H6-H7, H9, M1, M6-M7, M9, M11) + motion-plan.md + inbox-polish-plan.md + taste-frontend-review Waves 4-6

### E1 — View caching (1 day)
- [x] Keep last 3 views in DOM with `display: none` instead of unmount
- [x] On view switch: hide current, show cached if available, render new if not
- [x] No loading flash on back/forth navigation

### E2 — Motion system (1.5 days)
From motion-plan.md + inbox-polish-plan.md:
- [x] UseAsync hook standardizes loading/error/retry across views, eliminating ad‑hoc spinners
- [x] Detail panel: slide-from-right with exit animation (250ms/180ms) — already implemented
- [x] View‑enter crossfade for route changes — already implemented
- [x] Syn completion checkmark pop (sync‑progress already pulsing)
- [x] inbox: staggered row entrance (anim‑row‑spring — duplicate fixed in B5)

### E3 — Standardize error handling (1 day)
- [x] Create `useAsync` hook: `{ loading, data, error, retry }`
- [x] Migrate health.tsx (remove silent `.catch(() => {})`)
- [x] Migrate dashboard.tsx (remove silent catch)
- [x] Migrate reports.tsx (remove `window.location.reload()`, use `retry()`)
- [x] Standard error UI: red banner + message + retry button + dismiss

### E4 — Chart skeletons (0.5 day)
- [x] Dashboard line chart: pulsing skeleton rect at chart dimensions
- [x] Health bar chart: 12 pulsing vertical rects at bar positions
- [x] Reports bar chart: same pattern (12 skeleton bars)
- [x] Flow Sankey: skeleton grid matching node layout

### E5 — Browser back button (0.5 day)
- [x] Push state on view change: `history.pushState({ view }, "", "#" + view)`
- [x] `popstate` listener restores view
- [x] Hash-based routing: `/#/inbox`, `/#/flow`, `/#/dashboard`

### E6 — UX micro-issues (1 day)
- [x] Consolidate formatters: single `formatMoney()`, `formatPercent()`, `formatShortNumber()` — removed 8 ad-hoc versions
- [x] Extract shared `usePasskey` and `useTOTP` hooks from onboarding.tsx + account.tsx
- [x] Replace text date inputs with `<input type="date">` (OS-native picker) — already done
- [x] Sankey mobile: default to category list, add "View Sankey" toggle
- [x] Inbox: Negative amounts use `var(--neg)` instead of `var(--ink)` (P2.3)

### Verification
- [x] View switches show no loading flash
- [x] Chart areas have skeleton outlines
- [x] Browser back button navigates views
- [x] No silent `.catch()` or hard-reload retries
- [x] All views use single `formatMoney()`
- [x] Date picker shows OS-native calendar on mobile
- [x] Sankey defaults to list on mobile

---

## Phase F: Premium Features (Selective)

**Effort:** ~10-14 days (pick subset)
**Dependency:** All prior phases
**Covers:** Old Phase 9 (N1-N10), selectively

Pick 3-5 items based on product direction. Recommended subset:

### F1 — OS Theme Auto-Switch (0.5 day) — N2
- [x] Add `prefers-color-scheme` dark mode listener
- [x] Auto-switch paper ↔ midnight on OS change
- [x] Add "System" / "Auto" option to theme switcher (5‑button grid)

### F2 — Mobile Gestures (1.5 days) — N3
- [x] Swipe-to-delete on transaction rows (80px threshold, optimistic UI, tap vs swipe detection)
- [x] Swipe-to-navigate (inbox ↔ flow ↔ dashboard) with drag translation
- [x] Pull-to-refresh in all scrollable views via shared `usePullToRefresh` hook

### F3 — Spending Insights (3 days) — N6
- [x] LLM-powered month-over-month comparison (`POST /api/insights/compare`)
- [x] Dashboard insight cards (color-coded: red increase/green decrease/saving win/amber subscription)
- [x] Weekly digest-style summary
- [x] "You could save ₹Y" savings suggestion callout
- [x] Rule-based fallback when LLM unavailable

### F4 — Container Queries (1.5 days) — N9 (partial in B5)
- [x] Define `page-layout` container on `<main>` element
- [x] Migrate dashboard stat cards: `@container dashboard-stats` (1/2/2fr cols)
- [x] Migrate inbox toolbar: `.inbox-toolbar` class with narrow override

### F5 — Haptic Feedback (0.5 day) — N8
- [x] `window.hapticLight()` / `window.hapticHeavy()` utility
- [x] `navigator.vibrate(10)` on nav clicks, card taps, button presses
- [x] `navigator.vibrate([10, 50, 10])` on destructive actions (delete, remove)
- [x] Respect `prefers-reduced-motion` (skip vibration)

### Remaining Phase 9 items (deferred)
- Framer Motion / shared element transitions (N1) — skip, CSS-only is sufficient
- Push notifications (N4) — depends on backend infra
- Receipt capture (N5) — feature addition, not polish
- PDF export (N7) — backend work, not frontend

---

## Phase Z: Architecture Modernization (Strategic)

**Effort:** ~8-12 weeks (long-term, can be incremental)
**Dependency:** All prior phases
**Why now:** The globals-on-window IIFE architecture, no module system, and custom esbuild pipeline are retro. Meta-frameworks and ES modules are 2026 defaults.

### Z1 — ES Module Migration (2-3 weeks)
- [x] Dual IIFE+ESM pipeline: both output formats side by side
- [x] 13 ESM entry points: `main.ts` (core) + 12 lazy chunk entries in `static/src/lazy/`
- [x] Dynamic `import()` for lazy chunks with IIFE `<script>` injection fallback
- [x] `<script type="module">` in template alongside existing `<script>` tags
- [x] `window.__mfBooting` guard prevents double-initialization
- [x] All source files untouched — side-effect ESM imports trigger existing `window.*` registration
- [x] `esm/app.esm.js` (112KB) + 12 lazy ESM chunks → `static/dist/esm/`

### Z2 — Build Pipeline Upgrade (1 week)
- [x] ESM + IIFE both watched in `--watch` mode (parallel esbuild contexts)
- [x] `buildNotifyPlugin` with timestamped rebuild notification
- [x] CSS auto-versioning via SHA-256 hash (replaces manual `v=18` bumps)
- [x] CSS size/gzip in bundle analysis table
- [x] CSS lint: warns on `font-size: px` (should be `rem`)
- [x] `<link rel="modulepreload">` for inbox, flow, dashboard ESM chunks + app.esm.js
- [x] `<link rel="preconnect">` for Google Fonts origins
- [x] `display=swap` on Google Fonts URL (both templates)
- [x] React/ReactDOM preload (`rel="preload" as="script"`)
- [x] Zod vendor script deferred (`defer` — off critical path)
- [x] Branded splash screen (MoneyFlow name + pulsing dots) in template, removed on React mount

### Z3 — API Contract Layer (1 week)
- [x] 17 new TypeScript interfaces covering all untyped API responses
- [x] `PaginatedResponse<T>` generic for cursor-paginated endpoints
- [x] `AccountBundle`, `UserLLMBudget`, `InsightsCompareResponse`, `SyncProgress`, etc.
- [x] Zod v4 runtime validation schemas for all API response types
- [x] `validateOrThrow()` helper: `schema.parse()` in dev, graceful degradation in prod
- [x] Optional `schema` parameter on `API.get<T>()` and `API.post<T>()`

### Z4 — SSR / Streaming Evaluation (1-2 weeks)
- [x] **Decision: Do NOT adopt meta-framework.** SPA + Jinja2 shell is correct for a post-login dashboard with Python backend and ~1K users.
- [x] App Shell pattern with Service Worker (cache-first static, network-first API, offline fallback)
- [x] `/sw.js` FastAPI route registered in `main.py`
- [x] Offline/online banner in app.tsx
- [x] SW update notification with Refresh button
- [x] `<link rel="modulepreload">` for critical ESM chunks
- [x] React/ReactDOM preload, Zod deferred
- [x] Branded splash screen for instant perceived load

### Z5 — Performance Budget (ongoing)
- [x] Bundle analysis table printed after every build (size + gzip per file)
- [x] 5 budget thresholds: mf-core (120KB), mf-app (40KB), always-loaded (250KB), lazy-chunk (150KB), total (1.2MB)
- [x] CI mode (`CI=true` env var): build fails if budgets exceeded
- [x] `static/dist/manifest.json` written every build (version, per-bundle hashes, totals, budget status)
- [x] `/health` endpoint includes `build: { core_size_kb, total_size_kb, budget_pass }`

---

## Quick Wins (Do These Now, No Dependencies)

Items that don't depend on any phase and can be done immediately:

- [x] Fix `.anim-row-spring` duplicate in styles.css
- [x] Fix font priority (Geist before Inter in index.html)
- [x] Replace `#fff`/`#000` with tinted values
- [x] Fix `--bg` alias in Paper, Cool, Midnight themes
- [x] Fix side-stripe nav active indicator (already done — confirmed)
- [x] Add `type="date"` to date inputs (already done — confirmed)

---

## Decisions (June 7, 2026)

| Decision | Choice | Rationale |
|---|---|---|
| TypeScript approach | **Bulk migration** — all 15K lines at once | Blocks other work during migration but produces fully typed codebase. No ongoing conversion tax. |
| Phase F scope | **All 5 items**: OS theme, gestures, insights, container queries, haptics | ~7 days total. Spending insights (F3) leverages existing LLM infra for high product impact. |
| Meta-framework eval | **Not needed** — SSR-lite improvements sufficient | Post-login SPA with Python backend, ~1K users, no SEO requirements. SW + preloads + splash screen give adequate perf. |
| Execution order | **Frontend first.** Backend Phase 3 after. | Frontend needs the investment more urgently. Backend Phase 3 (50K users) is later-scale work. |
| Phase Z completion | **All Z sub-items implemented** (Jun 9) | ESM dual pipeline, zod validation, Service Worker, perf budgets, preloads, CSS auto-versioning, watch mode improvements |

## Execution Order

```
Quick Wins ─────────────────────────────────────────▶ NOW
                                                        │
Phase A: TypeScript (bulk) ────┐                       │
                                ├── parallel allowed ──▶│
Phase B: CSS Architecture ──────┘                       │
                                                        │
Phase C: Monolith Decomp ────────────────────────────▶  │
                                                        │
Phase D: Accessibility ── parallel possible ──────────▶ │
                                                        │
Phase E: UX & Polish ────────────────────────────────▶  │
                                                        │
Phase F: Premium (all 5 items) ──────────────────────▶  │
                                                        │
Phase Z: Architecture Modernization ──────────────────▶ (ongoing)

Meta-framework spike (1 week): Run during Phase A or B (independent work).
```
