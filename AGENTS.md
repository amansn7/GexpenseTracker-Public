<!-- code-review-graph MCP tools -->
## MCP Tools: code-review-graph

**IMPORTANT: This project has a knowledge graph. ALWAYS use the
code-review-graph MCP tools BEFORE using Grep/Glob/Read to explore
the codebase.** The graph is faster, cheaper (fewer tokens), and gives
you structural context (callers, dependents, test coverage) that file
scanning cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes` or `query_graph` instead of Grep
- **Understanding impact**: `get_impact_radius` instead of manually tracing imports
- **Code review**: `detect_changes` + `get_review_context` instead of reading entire files
- **Finding relationships**: `query_graph` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview` + `list_communities`

Fall back to Grep/Glob/Read **only** when the graph doesn't cover what you need.

### Key Tools

| Tool | Use when |
|------|----------|
| `detect_changes` | Reviewing code changes — gives risk-scored analysis |
| `get_review_context` | Need source snippets for review — token-efficient |
| `get_impact_radius` | Understanding blast radius of a change |
| `get_affected_flows` | Finding which execution paths are impacted |
| `query_graph` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes` | Finding functions/classes by name or keyword |
| `get_architecture_overview` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes` for code review.
3. Use `get_affected_flows` to understand impact.
4. Use `query_graph` pattern="tests_for" to check coverage.


<claude-mem-context>
# Memory Context

# [GexpenseTracker] recent context, 2026-05-08 9:53am GMT+5:30

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 14 obs (4,963t read) | 1,183,608t work | 100% savings

### May 6, 2026
1 5:59p 🔵 Email Classification Pipeline: Three Critical Gaps Identified
2 " 🔵 GexpenseTracker Has Dual-Stack Architecture: Python/FastAPI + Next.js Coexist
3 " 🔵 Filter Button Broken: InboxView Not Receiving setFilter Prop from app.js
4 " 🔵 No Bulk LLM Pre-Classification Pipeline: All Classification Is On-Demand Per-Email
5 " 🔵 Filter Button Has No onClick: Topbar "Filter" Button Is Purely Decorative
6 " 🔵 InboxView Shows Transactions Not Emails: Empty Inbox Confirms Zero Classifications
7 " 🔵 Gmail Sync Pipeline Already Includes LLM Classification — Not Missing, Just Not Triggered
9 " 🔵 Database is PostgreSQL Not SQLite: expense_tracker on localhost:5432
10 " 🔵 Backfill Phase (Phase 5) Exists in sync.py But Only Runs With user_id
11 6:00p 🔵 Sync Trigger Correctly Passes user_id — Phase 5 Backfill Should Execute
12 " 🔵 Transaction Model Has No user_id — Linked to User Via Email.user_id Join
13 6:01p 🔵 Phase 5 Backfill Bug: Transaction Created With Invalid user_id kwarg — All Backfills Silently Fail
14 " 🔵 Complete Root Cause Map: Three Compounding Issues Cause Empty Inbox
8 " 🔵 Sync Skips Already-Stored Emails: Root Cause of Zero Classifications

Access 1184k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>