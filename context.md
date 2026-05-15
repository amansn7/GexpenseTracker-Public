# MoneyFlow — Session Context

## Project Overview
MoneyFlow is a self-hosted expense tracking app. It reads Gmail inbox to parse purchase receipts and organize transactions automatically using AI (bring your own API key).

## Tech Stack
- **Frontend:** Vanilla React 19 + JSX (no bundler — esbuild pre-transpiles JSX→JS)
- **Backend:** FastAPI (Python) + SQLAlchemy + PostgreSQL
- **Build:** `npm run build` → `scripts/build-frontend.mjs` (esbuild, bundle:false, IIFE per file)
- **No module system** — each `.jsx` → `.js` exposes globals via `Object.assign(window, {...})`
- **Scripts loaded in sequence** in `templates/index.html` (alphabetically by default)
- **Cache busting:** `?v=N` on all static script/stylesheet URLs in `templates/index.html`

## Key Architecture Decisions

### CategoryService (in `static/src/data.jsx`)
Centralized category logic handling both built-in + user-defined categories:
- `CategoryService.init(account)` — seeds user categories from account bundle
- `CategoryService.display(cat)` → `{ label, bg, ink }` — handles user cats, built-ins, fallback
- `CategoryService.resolve(cat, isIncome)` — normalizes to canonical key
- `CategoryService.grouped()` → `[{ key, label, icon, categories[] }]` — hierarchical groups
- `CategoryService.expenseCategories()` — flat merged list (excludes income)
- `CategoryService.colorVar(cat)` / `colorInk(cat)` — CSS var names for built-in, hex for user
- `CategoryService.isBuiltin(name)` — checks if name matches a canonical key
- `CategoryService.onChange(fn)` / `notify()` — event bus for category updates

**Category groups** (`CATEGORY_GROUPS`):
- essentials → food, rent
- transport → travel
- bills → sub, util
- lifestyle → shop
- finance → income
- other → other
- _user → user-defined categories (ungrouped)

### Three.js Dotted Surface (background animation)
- **Vendored locally** at `static/vendor/three.min.js` (v0.149.0, UMD build, 594KB)
- Used on **onboarding** (`static/src/onboarding.jsx` → `DottedSurface` React component)
- Used on **login** (`templates/login.html` → inline script)
- 40×60 grid of 2400 points on XZ plane, PerspectiveCamera at (0,355,1220)
- Sine-wave Y animation (`sin((ix+count)*0.3)*50 + sin((iy+count)*0.5)*50`)
- Theme-aware via MutationObserver on `data-theme` (updates vertex colors + fog color)
- `renderer.setClearColor(fog.color, 0)` for transparent background

### Theme System
- 3 themes: `paper` (light), `cool` (light-cool), `midnight` (dark)
- Set via `data-theme` attribute on `<html>`
- Persisted in `localStorage` key `mf_theme`
- Restored on page load via inline `<script>` in `<head>` (prevents flash)
- CSS variables defined in `static/styles.css` per `[data-theme="..."]` selector
- Theme toggle (onboarding + login pages): SVG sun↔moon morph with Web Audio tick sound
  - Cosine/cubic-bezier spring approximation: `cubic-bezier(.34,1.56,.64,1)` over 400ms

### Backend CategoryService (`app/services/category_service.py`)
- `CategoryService.resolve(raw, is_income)` — maps DB value to canonical key
- `CategoryService.load_for_llm(session, user_id)` — comma-separated string for LLM prompts
- `CategoryService.get_list(session, user_id)` — all user categories as dicts
- `CategoryService.get_active_list(session, user_id)` — only active user categories

## Important Files

### Frontend (`static/src/`)
| File | Purpose |
|------|---------|
| `data.jsx` | CATEGORIES, TAGS, API, transformTransaction, CategoryService, CATEGORY_GROUPS |
| `app.jsx` | Main App shell, categoryFilter state, dropdown filter |
| `shell.jsx` | Sidebar navigation including grouped categories |
| `inbox.jsx` | InboxView, CategoryChip, CategoryPicker, SearchView |
| `onboarding.jsx` | 5-step wizard, DottedSurface (Three.js), ThemeToggle (SVG morph + sound) |
| `flow.jsx` | Sankey diagram, category-aware colors via CategoryService |
| `dashboard.jsx` | Category breakdown cards via CategoryService |
| `recurring.jsx` | Recurring expenses form, category dropdown via CategoryService |
| `account.jsx` | Settings/profile, user-defined category CRUD |

### Templates
| File | Purpose |
|------|---------|
| `index.html` | Main app entry — loads all scripts + React + three.js |
| `login.html` | Standalone sign-in page — Three.js background + theme toggle |

### Backend (`app/`)
| File | Purpose |
|------|---------|
| `services/category_service.py` | Centralized category service |
| `api/stats.py` | Stats endpoints with optional `?category=` filter |
| `api/transactions.py` | Transaction CRUD, reclassify preview with categories_override |
| `classifier/classifier.py` | Email classification, uses CategoryService.load_for_llm |
| `api/settings.py` | User category CRUD endpoints |
| `api/_account_helpers.py` | Account bundle loader, categories via CategoryService |

## Build & Deploy
- `npm run build` — builds all 15 JSX files → static/dist/
- `npm run watch` — watch mode for development
- No bundler — each file is a separate IIFE, loaded in order via script tags
- Adding a new `.jsx` file: create it in `static/src/`, build auto-discovers it, BUT must add `<script>` tag to `templates/index.html` manually

## Recent Changes (this session)
1. Centralized CategoryService with hierarchical groups (frontend + backend)
2. Three.js animated dotted surface on onboarding + login pages
3. Animated sun↔moon theme toggle with tick sound
4. Vendor three.js locally (v0.149.0) after CDN issues
5. Income category now visible in picker, dropdown, sidebar
6. Stats endpoints accept `?category=` query param
7. Removed `brand-sheen` overlay (caused scrollbar + visible rectangle issues)

## Known Issues / Gotchas
- **Script load order matters**: `categories.js` was briefly a separate file and wasn't in the template. Now CategoryService lives in `data.jsx` (loaded first) to avoid this.
- **Three.js**: Must use UMD/IIFE build. Modern versions (r160+) only ship ES modules. Vendored v0.149.0 is the last UMD without deprecation warnings.
- **Retina**: Canvas/WebGL renderer uses `setPixelRatio(window.devicePixelRatio)`.
- **Category filter on stats**: Client-side AND server-side filtering both exist. Server-side uses direct `Transaction.category == category` comparison (no normalization), which is a pre-existing mismatch with DB raw values.
- **Cache busting**: When changing `.jsx` files, increment `?v=N` in `templates/index.html` to force browser to reload the new dist file.
