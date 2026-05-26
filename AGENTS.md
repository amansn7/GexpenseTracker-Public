## MCP Tools: code-review-graph

This project is configured to use `code-review-graph`. Use graph tools before raw search when they are available.

### Preferred graph-first workflow

- Explore code with `semantic_search_nodes` or `query_graph`
- Understand impact with `get_impact_radius` or `get_affected_flows`
- Review changes with `detect_changes` and `get_review_context`
- Trace relationships with `query_graph` patterns such as `callers_of`, `callees_of`, `imports_of`, and `tests_for`
- Use `get_architecture_overview` and `list_communities` for repo-level structure

Fall back to `rg`, `find`, or direct file reads only when the graph cannot answer the question.

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

# [GexpenseTracker] recent context, 2026-05-25 10:12pm GMT+5:30

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (19,353t read) | 1,234,841t work | 98% savings

### May 25, 2026
793 10:40a 🔵 Code Quality Scan: 34 Ruff Lint Errors, All Minor
795 10:41a 🔵 Second Pre-existing Failure: Gmail Socket Timeout Test Mock Not Called
796 " 🟣 Important Security Fixes: SSRF, OAuth State, DELETE Re-auth, CSP — Subagent Dispatched
797 3:17p 🔵 Parallel Subagents Launched for Deep Scan — Security + API Surface
798 3:18p 🔐 SSRF Still Open: base_url Written to DB Without Validation
799 " 🔵 API Surface Scan: Key Security Findings from Direct Code Read
800 " 🔵 Security Deep Scan: OAuth State DB-Bound (PASS), CSP Still unsafe-inline (FAIL), JWT Blacklist Active (PASS), TOTP Enforcement Active (PASS)
804 3:19p 🔵 API key encryption uses dedicated encrypt_ai_secret function
805 " 🔵 Batch classify prompt includes email content with escape sanitization
806 " 🔵 Admin endpoints require owner role with _require_owner dependency
807 " 🔵 Search transactions endpoint has bounded limit constraint
S126 Parallel deepscan complete — 6 agents finished, comprehensive readiness report compiled with 6+ critical blockers identified (May 25, 3:21 PM)
S127 Parallel deepscan complete — 6 agents finished, comprehensive readiness report with 6+ critical blockers identified for public release (May 25, 3:22 PM)
S124 Parallel deepscan application readiness for public consumption — 5 agents complete, data integrity findings critical (May 25, 3:22 PM)
S125 Parallel deepscan application readiness for public consumption — 5 agents complete, data integrity findings critical (May 25, 3:22 PM)
S128 Deep scan of GexpenseTracker to determine public release readiness — comprehensive security, data integrity, migration, and deployment audit across 6 domains using parallel subagents (May 25, 3:24 PM)
S129 Create task list for GexpenseTracker public release blockers — user requested task tracking for all pre-launch blockers identified in deepscan (May 25, 3:25 PM)
808 3:27p ⚖️ GexpenseTracker Public Release Blockers — Remediation Task List Created
S130 GexpenseTracker public release readiness deepscan + full blocker/pre-launch task list creation — 20 tasks created covering 7 hard blockers and 13 pre-launch warnings (May 25, 3:40 PM)
809 3:40p 🟣 GexpenseTracker Pre-Launch Warning Tasks Created (8–16)
S131 GexpenseTracker public release deepscan + task list creation — deepscan complete, 20 tasks created, canonical report written to tasks/deepscan-2026-05-25.md (May 25, 3:41 PM)
810 3:41p 🔵 Existing public-release-readiness-checklist.md Found in tasks/
811 3:42p ✅ Deepscan Report Written to tasks/deepscan-2026-05-25.md
S132 GexpenseTracker pre-launch hardening: tackle 12 deepscan items (CSP unsafe-inline, .dockerignore, pagination cap, structlog redaction, etc.) (May 25, 3:43 PM)
812 7:38p 🔵 GexpenseTracker Public Launch Readiness Deep Scan
813 " 🚨 SSRF Vulnerability in AI Service Base URL Validation
814 " 🚨 TOTP Not Enforced on JWT Bearer Auth Path
815 " 🚨 No Re-Authentication Gate for Destructive Account Operations
816 " 🔵 GexpenseTracker Full Blocker Details with File:Line Evidence
817 " 🔵 GexpenseTracker Pre-Launch Issues (Non-Blocker) Full Details
818 7:39p 🔵 Deepscan Blockers Largely Already Fixed — Stale Report
819 " 🔵 Remaining Real Issues: S4 DATABASE_URL Fallback and D1 Second FK Missing Cascade
820 " 🔵 SSRF Validation Has DNS Rebinding Gap
821 7:40p 🔵 D1 Cascade Issue Is ClassificationLog, Not Transaction Table
822 " 🔵 Migration 0041 Already Exists and Covers All Data Integrity Blockers
823 " 🔴 S4 Fixed: docker-compose DATABASE_URL Now Fails Fast on Missing Env Vars
824 " 🔵 GexpenseTracker Security Posture — Comprehensive Passed Items
825 " 🔵 Additional Pre-Launch Issues: Atomicity, Queue, Pagination, Observability
826 " ✅ Deepscan Verdict Updated to BLOCKERS CLEARED — All 7 Marked Resolved
827 8:12p 🔵 GexpenseTracker Pre-Launch Task Files Identified
828 " 🔵 GexpenseTracker Pre-Launch Readiness State: 7 Blockers Fixed, 12 Pre-Launch Items Remaining
829 " 🔵 Specific Pre-Launch Fix Locations in GexpenseTracker Codebase
830 " 🔵 GexpenseTracker Data Integrity Pre-Launch Issues: 5 Open Items with Exact Locations
831 " 🔵 GexpenseTracker P2 and Remaining Pre-Launch Gaps: Observability, pytest-asyncio, and Security Edge Cases
832 " 🔵 DeepScan Pre-Launch Items: Multiple Already Fixed in Codebase
833 " 🔵 Classifier Atomicity: Uses flush() Not commit() — Less Severe Than Deepscan Stated
834 " 🔵 merchant.py MerchantEntityAlias Model Has Correct FK — Conflict Is Naming Only
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
S133 Fix Railway deployment crash — Alembic migration 0038 boolean default PostgreSQL incompatibility (May 25, 10:02 PM)
**Investigated**: Railway deployment logs showing repeated container crash-restart loop. Traced to `alembic/versions/0038_add_goals_and_contributions.py` failing at startup with `psycopg2.errors.DatatypeMismatch: column "active" is of type boolean but default expression is of type integer`. Confirmed generated SQL was `active BOOLEAN DEFAULT 1` — integer literal rejected by PostgreSQL.

**Learned**: PostgreSQL strictly rejects integer literals (`1`/`0`) as defaults for BOOLEAN columns. SQLite silently accepts them. Alembic `server_default=sa.text("1")` compiles directly to SQL — no type coercion. Must use `sa.text("true")` for PostgreSQL-compatible boolean server defaults. Migration 0034 also produces expected warnings about 2 AI key rows already re-encrypted with FERNET_KEY — not a blocker.

**Completed**: Fixed `alembic/versions/0038_add_goals_and_contributions.py`: changed `server_default=sa.text("1")` → `server_default=sa.text("true")` for `active` BOOLEAN column in `goals` table. Committed as `eca0b5c` on `main`. Pushed to `github.com:amansn7/GexpenseTracker.git` (75d7ca5..eca0b5c). Railway deploy will trigger automatically and migrations should now complete successfully.

**Next Steps**: Wait for Railway to pick up the push and redeploy. Verify deployment succeeds and `/health` check passes. Confirm `goals` and `goal_contributions` tables created in production PostgreSQL.


Access 1235k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>