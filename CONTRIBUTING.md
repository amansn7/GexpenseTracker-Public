# Contributing to MoneyFlow

Thanks for considering contributing! Here's how to get started.

## Development Setup

1. **Clone the repo**
   ```bash
   git clone https://github.com/your-username/moneyflow.git
   cd moneyflow
   ```

2. **Local mode (no external services)**
   ```bash
   bash scripts/setup-local.sh
   source .venv/bin/activate
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

3. **Frontend (if editing JSX)**
   ```bash
   node scripts/build-frontend.mjs --watch
   ```

## Code Style

- **Python:** ruff (lint + format), mypy. Run `ruff check app tests` and `mypy app/`.
- **Frontend:** TypeScript strict mode via `tsconfig.json`. ESM bundles via esbuild.
- Run `pytest -v --tb=short` before committing.

## Pull Request Process

1. Open an issue first to discuss significant changes.
2. Keep PRs focused — one feature/fix per PR.
3. Verify the full test suite passes: `pytest -q`
4. Verify the frontend builds: `npm run build`
5. Update docs if your change affects setup, config, or API.

## Project Structure

- `app/` — Python FastAPI backend
- `static/src/` — JSX/TSX frontend source
- `static/dist/` — Compiled frontend (esbuild output)
- `templates/` — Jinja2 HTML templates
- `tests/` — pytest test suite
- `alembic/` — Database migrations

## License

By contributing, you agree that your contributions will be licensed under Apache 2.0.
