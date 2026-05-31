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

## Repo instruction boundaries

- Keep `AGENTS.md` limited to stable, versioned project instructions.
- Keep session memory, audit notes, and handoff logs out of this file.
- Store transient notes in `handoff.md`, `tasks/`, or other explicitly temporary docs.

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

# [GexpenseTracker] recent context, 2026-05-30 7:00pm GMT+5:30

Legend: 🎯session 🔴bugfix 🟣feature ✅change 🔵discovery ⚖️decision
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

### May 30, 2026
885 7:00p 🟣 Feature: merchant inline editing in DetailPanel (inbox-detail.jsx)
886 " 🟣 Reclassify preview fields made editable (label, amount, merchant, category)
887 " 🟣 Reclassify now uses PATCH with user edits instead of commit API
888 " 🟣 Bulk manual reclassify modal (inbox.jsx) — added amount + merchant fields
889 " 🔴 RowMemo comparison fixed: prev.tx === next.tx for instant re-render
890 7:01p ✅ Committed + pushed feature work to main (28c231a)
891 7:02p 🟣 CSS consistency pass: all input/select/textarea → var(--card), 6px radius, 8px 10px padding, outline: none, boxSizing: border-box
892 " ✅ account.jsx: accountStyles.input + balance/date/AI test select + add email
893 " ✅ admin.jsx: S.input/S.textarea shared styles
894 " ✅ onboarding.jsx: S.input shared style
895 " ✅ inbox-detail.jsx: merchant inline edit, reclassify preview, notes textarea
896 " ✅ inbox.jsx: bulk manual modal selects + inputs
897 " ✅ shell.jsx: date range inputs
898 7:03p ✅ Build passed, committed + pushed CSS fixes to main (a723bd3)

**Working context**: Recent session covered two work packages:
    1. Inbox edit UX feature: merchant inline editing in DetailPanel, editable reclassify preview with PATCH-based save (not commit API), amount+merchant fields in bulk manual modal, RowMemo identity comparison for instant re-render
    2. App-wide CSS consistency for form elements: unified spec (var(--card) bg, 6px radius, 8px 10px padding, outline:none, boxSizing:border-box, fontFamily:inherit) applied via shared style objects first, then inline elements. 13 files changed, 33 lines touched.

**Known state**: alembic HEAD 0048 (single head), frontend builds via `node scripts/build-frontend.mjs` (not npm run), ruff lint reports 291 false-positive errors on .jsx files (Python linter on JS — not real issues). 585 tests with pytest.

Access 873k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>