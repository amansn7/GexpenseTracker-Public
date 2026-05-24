# Deployment Checklist

## Pre-deploy

### Code
- [ ] `git status` — no uncommitted work
- [ ] `git log --oneline -5` — review what's shipping
- [ ] Bump cache-busting `v=` in `templates/index.html` for any changed `.jsx` source files
- [ ] Run `node scripts/build-frontend.mjs` — rebuilds `static/dist/*.js`
- [ ] Verify compiled output: `grep "Overspend" static/dist/flow.js` (or similar keyword check for your changes)
- [ ] `git diff --stat` — confirms only intended files changed
- [ ] Run `alembic upgrade head` on a local dev DB if migrations are included
- [ ] Run `ruff check app/` and fix any lint errors
- [ ] Run tests: `pytest` (Python) if backend changes

### Static file version map (index.html)
| File | Version |
|------|---------|
| styles.css | 14 |
| date-utils.js | 2 |
| data.js | 14 |
| icons.js | 6 |
| shell.js | 16 |
| keyboard-hint.js | 2 |
| inbox.js | 16 |
| **flow.js** | **9** ← bumped |
| health.js | 2 |
| dashboard.js | 6 |
| reports.js | 2 |
| recurring.js | 2 |
| debt.js | 2 |
| onboarding.js | 4 |
| account.js | 31 |
| sync-progress.js | 3 |
| admin.js | 112 |
| app.js | 25 |

## Deploy

- [ ] Docker build: `docker build -t moneyflow .`
- [ ] Push to registry / deploy to Railway
- [ ] Verify health endpoint responds
- [ ] Smoke-test key flows: inbox, dashboard flow view, settings

## Post-deploy

- [ ] `alembic upgrade head` ran successfully (check logs)
- [ ] Load flow view in browser, toggle overspend/remaining
- [ ] Check weekly burn chart renders
- [ ] Verify category bars have readable text (light/dark theme)
