# Shared Agent Assets

`.agents/` holds repo-owned agent assets that can be reused by multiple harnesses.

Current convention:

- Put full skill sources in `.agents/skills/`
- Expose them from harness-specific locations such as `.claude/skills/` via symlink or wrapper
- Keep skill metadata in `SKILL.md` frontmatter
- Keep generated outputs and session logs somewhere else

Current repo-owned skills:

- `impeccable`
- `classifier-audit`
- `sync-debug`
- `release-check`
- `browser-smoke`
