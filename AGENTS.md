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
