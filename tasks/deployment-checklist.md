# Deployment Checklist

## Pre-Deploy

- [ ] **Tests pass.** `pytest` — all expected count (currently 584/584).
- [ ] **Lint passes.** `ruff check . && ruff format --check .`
- [ ] **Frontend builds.** `npm run build` — no errors, all dist files generated.
- [ ] **Content hashes updated.** `git diff templates/index.html` shows `?v=` changes for modified JS dist files.
- [ ] **CSS cache buster bumped.** If `static/styles.css` changed, increment `?v=N` in `templates/index.html`.
- [ ] **Alembic head is single.** `alembic heads` returns exactly one. No migration drift.
- [ ] **No stale dist files.** `git status` shows no leftover build artifacts outside the build script's output.
- [ ] **Migration tested.** If new migrations exist, run `alembic upgrade head` against a clean database to verify.
- [ ] **Dead code removed.** No `console.log`, debug imports, or commented-out blocks in changed files.

## Deploy

- [ ] **Commit all changes.** Working tree clean before push.
- [ ] **Push to main.** `git push origin main`
- [ ] **Verify CI passes.** If CI is configured, confirm green on the commit.

## Post-Deploy Smoke

- [ ] **App loads.** Homepage (or /login) returns 200, no JS console errors.
- [ ] **Auth flow.** Login works; redirects to main app.
- [ ] **Key views render.** Inbox, Dashboard, Flow, Reports, Recurring, Debt, Goals, Budgets — each loads without crashes.
- [ ] **Modal opens.** At least one "Add" modal (Debt, Goal, Recurring, Budget) — verify full visibility, no cutoff, proper scroll lock.
- [ ] **Sync works.** Trigger a manual sync; verify progress indicator and data appear.
- [ ] **CSS is correct.** No visual regressions versus the previous deploy. Check dark + light themes if changed.

## Rollback

- [ ] **Previous dist files are cached.** `git revert <sha>` and re-deploy if needed.
- [ ] **Migration rollback known.** `alembic downgrade -1` command confirmed, or the migration is additive-only so no rollback needed.
