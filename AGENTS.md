## MCP Tools: code-review-graph

This project is configured to use `code-review-graph`. Use graph tools before raw search when they are available.

### Preferred graph-first workflow

- Explore code with `semantic_search_nodes` or `query_graph`
- Understand impact with `get_impact_radius` or `get_affected_flows`
- Review changes with `detect_changes` and `get_review_context`
- Trace relationships with `query_graph` patterns such as `callers_of`, `callees_of`, `imports_of`, and `tests_for`
- Use `get_architecture_overview` and `list_communities` for repo-level structure

Fall back to `rg`, `find`, or direct file reads only when the graph cannot answer the question.

## Standing Rules

1. **Review lessons at session start.** Read `tasks/lessons.md` before any work — especially the "Modal & Fixed Positioning" section when touching modals, and the "Deployment & Observability" section before any backend changes.

2. **Run deployment checklist on every commit.** Before pushing, verify against `tasks/deployment-checklist.md`:
   - Tests pass
   - Lint passes
   - Frontend builds
   - Content hashes updated
   - CSS cache buster bumped (if styles.css changed)
   - No stale dist files
   - Alembic head is single (if migrations exist)

3. **Log new lessons.** If a debugging session or fix reveals a non-obvious pattern, add it to `tasks/lessons.md` under the relevant section before committing.

## Phase Execution Workflow

When I say "start phase N" (where N is a number from `tasks/todo.md`):

1. Read the plan file (`tasks/phase-N-*.md`) and the todo file (`tasks/phase-N-*-todo.md`)
2. Show me the phase summary and ask for confirmation to begin
3. Wait for my approval before executing anything
4. On approval, execute all unchecked items using parallel subagents where possible
5. After execution, run the appropriate verification:
   - **Frontend:** `npm run build` + lint if applicable
   - **Backend:** `pytest` + `ruff` + check Alembic head is single
6. Show me the completed checklist and any issues found
7. Do NOT proceed to the next phase without my explicit go-ahead

## Repo instruction boundaries

- Keep `AGENTS.md` limited to stable, versioned project instructions.
- Keep session memory, audit notes, and handoff logs out of this file.
- Store transient notes in `handoff.md`, `tasks/`, or other explicitly temporary docs.

## Railway & Database Access

### Railway CLI

| Command | Use |
|---|---|
| `railway status` | Show project, service, and DB status |
| `railway variables list` | List all env vars for the active service |
| `railway deployment list` | List recent deployments |
| `railway logs --service Gexpense` | Tail app logs |
| `railway service list` | List all services (app, Postgres, Redis) |

### Querying the Production Database

**psql (simple queries):**
```bash
railway connect Postgres -c "SELECT * FROM transactions LIMIT 5;"
```
Requires `psql` in PATH (`/opt/local/lib/postgresql16/bin/psql` via MacPorts).

**Python via SSH (complex queries + code):**
```bash
railway ssh --service Gexpense -- python3 <<'PYEOF'
import asyncio, os, asyncpg
async def run():
    c = await asyncpg.connect(os.environ['DATABASE_URL'])
    rows = await c.fetch("SELECT id, label, amount FROM transactions LIMIT 5")
    for r in rows: print(dict(r))
    await c.close()
asyncio.run(run())
PYEOF
```
Use this when you need `asyncpg`, SQLAlchemy ORM, or access to app modules (`from app.services.stats_service import recompute_month`).

**Important:** `railway run` only injects env vars locally — it does NOT resolve `*.railway.internal` hostnames. To reach the DB you must be inside Railway's network (SSH) or use `railway connect` with psql.

### Key Production Details

- **App URL:** `https://gexpense-production.up.railway.app`
- **User IDs:** There are 2 users — the real human (`2656a055-...`, email `amansn7@gmail.com`) and a service user (`564d8655-...`, email `service@localhost`). Always use the correct user_id in ad-hoc queries.
- **DB driver:** Always use `+asyncpg` in DATABASE_URL (`postgresql+asyncpg://`). The app's `config.py` auto-converts `postgres://` → `postgresql+asyncpg://`.
- **Session reuse:** After `session.commit()`, ORM objects are expired. Read needed fields before commit to avoid `MissingGreenlet` errors.
- **Rollups:** `recompute_month()` ends with `await db.flush()`, not `commit()`. Callers must commit separately.
- **Salary shift:** Income in the last N days of a month is attributed to the next month via `recompute_month()` (not `_effective_month()`, which is just `day=1`). Always check `salary_shift_enabled` + `salary_shift_window` in `user_settings` before modifying production transaction dates — moving income in/out of the shift window changes rollup attribution.
- **recompute_month via SSH:** Import `app.config.settings` first (its DATABASE_URL has `+asyncpg`), then `from app.services.stats_service import recompute_month`. Using `settings.DATABASE_URL` with `create_async_engine` avoids the psycopg2 driver detection issue.

## Claude/Codex layout

- `AGENTS.md`: stable agent instructions for the repo
- `CLAUDE.md`: concise project context and workflow
- `.claude/`: Claude settings, plugins, and Claude-facing skills
- `.agents/`: shared skill sources owned by the repo
- `.mcp.json`: MCP server configuration
- `graphify-out/` and `.code-review-graph/`: generated graph artifacts

## Frontend Hook: Always use impeccable skill

**Rule:** For ANY frontend task — design, redesign, audit, polish, animate, colorize, extract, optimize, adapt, or improve a UI — invoke the `impeccable` skill FIRST before doing anything else.

This applies to:
- Websites, landing pages, dashboards, product UI, app shells
- Components, forms, settings, onboarding, empty states
- UX review, visual hierarchy, information architecture, cognitive load
- Accessibility, performance, responsive behavior, theming
- Typography, fonts, spacing, layout, alignment, color, motion
- Micro-interactions, UX copy, error states, edge cases, i18n
- Design systems, tokens, reusable patterns

Trigger keywords: `ui`, `frontend`, `design`, `style`, `css`, `layout`, `component`, `theme`, `responsive`, `animate`, `polish`, `redesign`, `audit`, `visual`, `ux`

**Never skip this step.** Even for "small" frontend fixes, load impeccable first to get the full design system context and workflow guidance.

<claude-mem-context>
# Memory Context

# [GexpenseTracker] recent context, 2026-05-27 3:45pm GMT+5:30

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (16,168t read) | 873,366t work | 98% savings

### May 25, 2026
835 8:14p 🔵 LLMSpendTracker ORM Model Already Has ForeignKey — Deepscan Item #14 Already Done
836 " 🔵 HTTPSRedirectMiddleware and Sentry Already Implemented — Items #17 and #18 Done
837 " 🔵 True Open Pre-Launch Items: Only 4 Remain from Original 12
838 8:15p 🔵 CSP style-src unsafe-inline Required by Inline Style Blocks in Both Templates
839 " 🔵 CSP style-src: No Inline style= Attributes in index.html — Only Style Block
840 " 🔴 CSP style-src unsafe-inline Fix: Nonce Added to login.html Style Block, Inline Styles Moved to CSS
841 8:16p 🔴 login.html Inline Styles Fully Removed, index.html Style Block Gets Nonce — CSP style-src Fix In Progress
842 8:18p ✅ Git push of pre-launch hardening changes
843 8:22p 🔵 Full pre-launch diff: 31 files, 381 insertions, 270 deletions
844 8:23p 🔐 CSP unsafe-inline removal committed and pushed to main
845 10:01p 🔵 Alembic Migration 0038 Fails on PostgreSQL Boolean Default
846 10:02p 🔴 Fixed Migration 0038 Boolean Default — PostgreSQL Compatibility
### May 26, 2026
847 10:50a 🔵 MoneyFlow (GexpenseTracker) Custom Skill Inventory
848 11:04a 🔵 Computer-Use MCP Available for Mobile UI Review
849 11:05a 🔵 Google Chrome Not Installed on Review Machine
850 " 🔵 Browser Access Constraints for MoneyFlow Mobile Review
851 11:06a 🔵 MoneyFlow Production URL Confirmed
852 " 🔵 Screenshot Tool Blocked — macOS Version Too Old
853 " 🔵 MoneyFlow Frontend Structure — JSX Components and Templates
854 " 🔵 MoneyFlow Responsive Architecture — JS Viewport Hook, No Tailwind
855 " 🔵 MoneyFlow Mobile UI Behavior — Sidebar Drawer, Topbar, Row Layout
856 11:07a 🔵 useViewport Hook — window.innerWidth Resize Listener
857 " 🔵 Mobile-Specific Layout Patterns — Search, Bulk Bar, Detail Panel
858 " 🔵 useViewport Breakpoints — isMobile &lt;720px, isTablet &lt;980px
859 " 🔵 DetailPanel IS Full-Screen on Mobile — Fixed Overlay with slide-in-right
S139 Mobile view review — Playwright screenshot script running, awaiting user login to capture mobile viewports (May 26, 11:11 AM)
860 11:11a 🔵 Playwright 1.60.0 Available — Node v24.15.0 via NVM
862 " 🟣 Playwright Mobile Screenshot Script Created and Launched
S140 Mobile view review — revised Playwright script relaunched (PID 53076), awaiting user login to capture 6 views × 2 viewports (May 26, 11:11 AM)
861 11:12a 🔵 Playwright Chromium on macOS 12 — Frozen ffmpeg, Screenshots Still Work
863 11:13a 🔵 Playwright Mobile Screenshots Captured Successfully
865 " ✅ mobile-review.mjs Improved — Robust Locators, 6 Screenshots, Error Handling
866 " 🔵 mobile-review.mjs Exits Immediately — No Screenshots, Process Gone
864 " 🔵 mobile-screenshots/ Directory Empty — No Screenshots Captured
S142 Mobile view review for MoneyFlow (GexpenseTracker) — Playwright script hardened against bot detection for Google OAuth (May 26, 11:14 AM)
S143 Mobile view review for MoneyFlow (GexpenseTracker) — Playwright script hardened with anti-bot-detection flags, relaunched for full screenshot capture (May 26, 11:15 AM)
S141 Mobile view review for MoneyFlow (GexpenseTracker) — Playwright screenshot capture with OAuth auth gate (May 26, 11:15 AM)
S145 Mobile view review for MoneyFlow (GexpenseTracker) — iterating through Playwright browser engines to bypass Google OAuth bot detection (May 26, 11:17 AM)
S146 Mobile view review for MoneyFlow — blocked on auth; pivoting to cookie injection approach via Safari DevTools (May 26, 11:18 AM)
S144 Mobile view review for MoneyFlow (GexpenseTracker) — switched Playwright to Firefox to bypass Google OAuth bot detection (May 26, 11:18 AM)
S147 Mobile view review for MoneyFlow — pivoting to cookie injection via Safari DevTools Storage tab to bypass OAuth (May 26, 11:19 AM)
867 11:19a 🔵 App exposes only CSRF token via document.cookie — session is HttpOnly
868 11:25a 🟣 Playwright script rewritten to use session cookie injection, bypassing Google OAuth entirely
869 " 🔵 Write to mobile-review.mjs did not persist — file still contains old webkit content
### May 27, 2026
870 11:01a 🔵 GexpenseTracker MoneyFlow Feature — Current State
871 11:02a 🔵 MoneyFlow Feature — Full Implementation Details and Code Gaps
872 11:04a 🔵 MoneyFlow UI Components — Architecture Gaps and Design Issues
873 11:12a 🔵 GexpenseTracker Recent Commit History — 30 Fixes Across Classifier, Inbox, Migrations
874 " 🔵 Goals and Budgets API Structure Mapped
875 11:13a 🔵 Shell.jsx Nav Structure — Collapsible Sections with localStorage Persistence
876 " 🔵 Inbox Polish Plan Exists — P0/P1/P2 Priority Work Pending
877 " 🔵 httpx External Calls — SSRF Risk Surface Identified in settings.py and currency.py
878 " 🔵 Frontend Build — esbuild via scripts/build-frontend.mjs
879 11:37a 🟣 Goals + Budgets Frontend Views — Subagent Dispatched for Implementation
880 11:41a 🟣 Mobile Viewport Fixes — Second Subagent Dispatched
881 " 🔵 Frontend Code Patterns — DebtView and RecurringView Reference Implementation
882 " 🔵 100vh Already Migrated to 100dvh — Mobile Subagent Task 1 Is No-Op
883 " 🔵 reports.jsx and health.jsx Already Have Savings Rate — Third Subagent May Duplicate
884 " 🔵 Icons List — "target" and "wallet" Not Available; Goals/Budgets Must Use Alternatives
S148 GexpenseTracker moneyflow review — fix gaps, add Goals/Budgets views, mobile responsiveness, security audit (May 27, 11:42 AM)
**Investigated**: - Recent subagent work observed via primary session tool calls
    - SA-A (Goals+Budgets): goals.jsx (301 lines), budgets.jsx (207 lines) created and wired into app.jsx and shell.jsx
    - SA-B (Mobile): flow.jsx Sankey mobile branch verified working; 100vh already gone (0 occurrences); stat-grid 720px override in CSS confirmed
    - SA-D (Backend security): url_utils.py SSRF protection (DNS+IP checks), rate_limiter.py full coverage, pattern_rules/domain_pair_rules have no user_id FK (global tables), oauth_states has no user_id FK, rate limiting had bug where EXEMPT endpoints bypassed rate limits

**Learned**: - goals.jsx and budgets.jsx: SA-A wrote both files twice (duplicate writes seen in observations) — final state is correct 301/207 lines respectively
    - shell.jsx: Goals (icon=star) and Budgets (icon=grid) added to BOTH classic mode (Views section) and new mode nav — 4 matches confirmed
    - app.jsx: titles object + view routing both updated — 4 matches confirmed
    - flow.jsx: isMobile early-return now renders category list instead of scrollable SVG
    - main.py: rate limiting had ordering bug — EXEMPT paths (/api/auth/callback, /api/auth/token/refresh) skipped rate limiting; SA-D fixed by moving rate limit block BEFORE the EXEMPT short-circuit, wrapped in `if not os.getenv("TESTING")`
    - pattern_rules and domain_pair_rules are global ML tables with no user_id — not in GDPR deletion pipeline but correctly not user-owned
    - oauth_states has no user_id column — ephemeral, expires naturally, acceptable
    - validate_url() checks: scheme http/https only, DNS resolution, blocks private/loopback/reserved/unspecified IPs

**Completed**: - static/src/goals.jsx: Full GoalsView + GoalModal with contributions (301 lines)
    - static/src/budgets.jsx: Full BudgetsView + BudgetModal with over-budget highlighting (207 lines)
    - static/src/app.jsx: titles dict + view routing for goals/budgets
    - static/src/shell.jsx: Goals+Budgets NavItems in both classic and new mode sidebars
    - static/src/flow.jsx: Sankey mobile list fallback (isMobile early return)
    - static/styles.css: @media (max-width: 720px) .stat-grid 2-column override
    - static/src/reports.jsx: monthly expense trend bar chart (orchestrator direct edit)
    - app/main.py: rate limiting ordering fix — EXEMPT endpoints now covered

**Next Steps**: All subagents appear to have completed their work based on the observed tool calls. Need to:
    1. Run `npm run build` to compile all static/src/*.jsx → static/dist/*.js
    2. Verify no conflicts between parallel agent changes
    3. Check if templates/index.html needs script tags for goals.js and budgets.js
    4. Confirm build succeeds without errors


Access 873k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>