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

# [GexpenseTracker] recent context, 2026-05-13 4:20pm GMT+5:30

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (17,143t read) | 921,511t work | 98% savings

### May 12, 2026
152 1:14p 🔵 DB Connection Config and User Onboarding Field Located for Reset Planning
154 1:15p 🟣 reset_user.py Successfully Ran Against Local DB — amansn7@gmail.com Reset Complete
155 1:16p 🟣 AI Services Tab Redesigned — Unified LLM Providers Table Replacing Two Separate Sections
156 6:01p 🔵 Email Pipeline Architecture Overview
157 6:03p 🔵 N+1 session.flush() Inside Per-Message Loop — Confirmed
158 " 🔵 UserSettings + build_domain_rules Reloaded Per Message in Sync Loop
159 " 🔵 Body Text Double-Truncation Confirmed: 4000 → 3000 Chars
160 " 🔵 _sync_progress Is Pure In-Memory — Confirmed Non-Persistent
S36 Re-review commit d1d7c84 — verify if previously flagged issues are now fixed (May 12, 6:03 PM)
161 7:11p 🔴 Commit d1d7c84: Batch Classification + N² Dedup Fix + N+1 Settings Reload Fix
162 7:12p 🔴 Commit d1d7c84 Exact Scope: Batch LLM Classification + N² Dedup Fix Across 4 Files
163 " 🟣 batch_classify_emails() Added — N Emails Per LLM Call
164 " 🟣 batch_classify_verbose() + _parse_batch_response() Added to MultiLLMClient
165 " 🔴 _rules_fallback_result() Extracted — Batch Failure Guarantee
166 7:14p 🔴 UserSettings + db_rules + LLM Client Now Loaded Once Per Sync (Not Per Message)
167 " 🟣 LLM_BATCH_SIZE Config Added + Batch Prompt Format Documented
168 " 🔵 _parse_batch_response Silently Pads/Truncates — No Count Mismatch Warning
169 " 🔵 No Direct Unit Tests for batch_classify_emails — Integration Coverage Only
S37 Fix remaining issues from code review — re-verify state of all pending items across commits 342439b and 71b6a94 (May 12, 7:14 PM)
S35 Code review of commit d1d7c84 — batch LLM classification + N² dedup fix + N+1 settings reload fix (May 12, 7:14 PM)
S38 Code review of commits 4808fc9..71b6a94 (batch LLM classification + N² dedup fix), followed by fix application and commit (May 12, 7:19 PM)
### May 13, 2026
170 10:20a 🟣 Batch LLM Classification for Email Expense Parsing
171 " 🟣 batch_classify_emails: 3-Phase Pipeline Replacing asyncio.gather
172 " 🔴 _extract_json Fixed to Handle JSON Array Responses
173 " 🟣 _rules_fallback_result and _extract_amount Added to classifier.py
174 " 🟣 30-Test Batch Classifier Test Suite Added
175 " 🟣 Batch LLM Email Classification System
176 " 🔴 _extract_json Fixed to Detect JSON Arrays Before Objects
177 " 🔄 _rules_fallback_result and _extract_amount Extracted as Shared Helpers
178 " 🔴 N² Duplicate Detection and N+1 Settings Reload Fixed in sync.py
179 " 🟣 307-Line Test Suite Added for Batch Classifier
180 11:15a 🔵 Code Review Found 2 Critical Bugs Blocking Merge
181 11:16a 🔵 C1 Bug Report Was False Positive — snippet IS Assigned Before ClassificationLog Write
182 " 🔴 Fixed _parse_response to Handle Array-Wrapped Single Object from LLM
183 " 🔴 Added Warning Log for Batch Count Mismatch in _parse_batch_response
184 " 🔵 Pre-existing NameError: Tuple Not Imported in llm_client.py Blocks Entire Test Suite
185 11:17a 🔴 Fixed Missing Tuple Import in llm_client.py — Blocked Entire Test Suite
186 " 🔴 Added Missing Tuple Import to classifier.py — All 39 Tests Now Pass
S39 Status check: what issues remain pending after batch classifier review and fixes (May 13, 11:17 AM)
S40 Restore missing AI/LLM provider performance section that disappeared from UI (May 13, 3:18 PM)
187 3:22p 🔵 LLMStatusSection Component Exists in admin.jsx — Shows Provider Performance Table
188 " 🔵 /api/llm/status Endpoint Lives in app/api/sync.py
189 3:23p 🔵 Backend /api/llm/status API Intact — Returns Correct Field Shape for Frontend
190 " 🔵 LLMStatusSection Only Rendered Inside AdminView — Not in account.jsx
191 " 🔵 Duplicate LLM Status Components — AdminLLMSection in account.jsx vs LLMStatusSection in admin.jsx
192 3:24p 🔵 AdminLLMSection Is Dead Code — AI Tab Renders Inline Table Instead
193 " 🔵 AI Tab LLM Status Is Fully Wired — Fetches on Mount, Renders Unified Table
194 3:25p 🔵 AdminView Not Referenced in Navigation Shell or HTML Templates
195 " 🔵 admin.jsx Loaded via Script Tag But AdminView Never Mounted in Shell Router
197 " 🟣 AdminLLMSection Added to Admin Tab in Settings — LLM Performance Now Visible to Owners
196 3:26p 🔵 Admin Sections Migrated from admin.jsx to account.jsx — admin.jsx Now Dead Code
198 " ✅ account.jsx Cache Bust — Version Tag Incremented to v=22
S41 Push commits to origin after restoring LLM provider performance section (May 13, 3:27 PM)
199 3:27p 🔵 b69210a Commit Found — 6 Deferred Issues from Batch Classifier Review Fixed
S43 Deep code audit of sync.py and dedup system — validate latent issues found during b69210a review (May 13, 3:27 PM)
200 3:29p 🔴 _AMOUNT_RE Made Currency Prefix Required — Fixes Bare Integer False Matches
S42 Deep audit of b69210a commit — validate 6 deferred fixes and investigate latent code issues (May 13, 3:29 PM)
S44 User said "fix!" — session resumed and re-ran same code audit (identical tool calls, identical results) (May 13, 3:30 PM)
201 3:39p 🔵 run_sync_range Missing detect_and_record_duplicates Call — Confirmed Dedup Gap
202 " 🔵 FilterRule Model Has No user_id Column — Global Rules Are by Design

Access 922k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>