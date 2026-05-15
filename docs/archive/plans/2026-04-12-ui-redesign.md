# New Era UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign all 6 pages of the expense tracker with glassmorphism aesthetic, left sidebar navigation, purposeful animations, and an activity-led dashboard — zero backend changes.

**Architecture:** New `static/styles.css` holds all design tokens and shared styles. `templates/base.html` is rewritten with a sidebar layout, replacing the top nav. Each page template is restyled in sequence. `static/app.js` gains `countUp()`, `showToast()`, and skeleton utilities. All existing JS logic (sync panel, edit modal, hover tooltip, chart renderers) is preserved.

**Tech Stack:** Vanilla CSS (custom properties, backdrop-filter, keyframe animations), vanilla JS (requestAnimationFrame, class toggling), Jinja2 templates, FastAPI backend (zero changes).

---

## File Map

| File | Action |
|------|--------|
| `static/styles.css` | **Create** — full design system |
| `templates/base.html` | **Rewrite** — sidebar layout, link styles.css, toast container |
| `static/app.js` | **Extend** — countUp, showToast, skeleton, sidebar active |
| `templates/dashboard.html` | **Rewrite** — activity-led hero, 4 stats, 2-col body |
| `templates/transactions.html` | **Restyle** — glass table, filter bar |
| `templates/review.html` | **Restyle** — glass cards, keyboard shortcuts, slide-out |
| `templates/recurring.html` | **Restyle** — glass list, animated bars |
| `templates/budgets.html` | **Restyle** — glass cards, animated progress bars |
| `templates/settings.html` | **Restyle** — glass sections, toast feedback |

---

## Task 1: Design System (`static/styles.css` + `templates/base.html`)

**Files:**
- Create: `static/styles.css`
- Modify: `templates/base.html`

- [ ] **Step 1: Create `static/styles.css`**

```css
/* ── Design Tokens ──────────────────────────────────────────── */
:root {
  --bg:          #060610;
  --bg-card:     rgba(255,255,255,0.04);
  --bg-sidebar:  rgba(255,255,255,0.02);
  --border:      rgba(255,255,255,0.07);
  --border-act:  rgba(124,131,253,0.25);
  --text:        #e0e0e0;
  --muted:       #666;
  --dim:         #333;
  --accent:      #7c83fd;
  --accent-soft: rgba(124,131,253,0.12);
  --red:         #e07070;
  --green:       #5db87d;
  --amber:       #f0a500;
  --purple:      #a78bfa;
  --blur-card:   blur(8px);
  --blur-modal:  blur(20px);
  --r:           12px;
  --r-sm:        8px;
}

/* ── Reset ──────────────────────────────────────────────────── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

/* ── Layout ─────────────────────────────────────────────────── */
body {
  font-family: system-ui, -apple-system, sans-serif;
  background: var(--bg);
  color: var(--text);
  min-height: 100vh;
}
.layout { display: flex; min-height: 100vh; }
.main   { flex: 1; overflow-x: hidden; }
.container { max-width: 1160px; margin: 0 auto; padding: 28px 32px; }

/* ── Ambient Glow Orbs ──────────────────────────────────────── */
.glow-orb {
  position: fixed; border-radius: 50%;
  filter: blur(80px); pointer-events: none; z-index: 0;
}
/* per-page orb colors via body class */
body.page-dashboard   #glow1 { width:400px;height:400px;background:rgba(224,112,112,0.06);top:-120px;right:-80px; }
body.page-dashboard   #glow2 { width:280px;height:280px;background:rgba(124,131,253,0.05);bottom:-80px;left:220px; }
body.page-transactions #glow1 { width:360px;height:360px;background:rgba(124,131,253,0.06);top:-100px;right:-60px; }
body.page-transactions #glow2 { width:240px;height:240px;background:rgba(93,184,125,0.04);bottom:-60px;left:240px; }
body.page-review      #glow1 { width:360px;height:360px;background:rgba(240,165,0,0.05);top:-100px;right:-60px; }
body.page-review      #glow2 { width:240px;height:240px;background:rgba(124,131,253,0.05);bottom:-60px;left:240px; }
body.page-recurring   #glow1 { width:340px;height:340px;background:rgba(167,139,250,0.05);top:-100px;right:-60px; }
body.page-recurring   #glow2 { width:220px;height:220px;background:rgba(224,112,112,0.04);bottom:-60px;left:240px; }
body.page-budgets     #glow1 { width:360px;height:360px;background:rgba(93,184,125,0.06);top:-100px;right:-60px; }
body.page-budgets     #glow2 { width:240px;height:240px;background:rgba(124,131,253,0.05);bottom:-60px;left:240px; }
body.page-settings    #glow1 { width:320px;height:320px;background:rgba(124,131,253,0.05);top:-100px;right:-60px; }
body.page-settings    #glow2 { width:200px;height:200px;background:rgba(93,184,125,0.04);bottom:-60px;left:240px; }

/* ── Sidebar ─────────────────────────────────────────────────── */
.sidebar {
  width: 200px; flex-shrink: 0;
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border);
  backdrop-filter: blur(16px);
  display: flex; flex-direction: column;
  padding: 20px 12px;
  position: sticky; top: 0; height: 100vh;
  z-index: 10;
}
.sidebar-brand {
  font-size: 15px; font-weight: 800; color: var(--accent);
  letter-spacing: -.4px; text-decoration: none;
  padding: 0 6px; margin-bottom: 28px; display: block;
}
.sidebar-nav { display: flex; flex-direction: column; gap: 2px; flex: 1; }
.nav-item {
  display: flex; align-items: center; gap: 9px;
  padding: 8px 10px; border-radius: var(--r-sm);
  font-size: 13px; color: var(--muted);
  text-decoration: none; cursor: pointer;
  transition: background 120ms, color 120ms;
  border: 1px solid transparent;
  position: relative;
}
.nav-item:hover  { background: rgba(255,255,255,0.04); color: var(--text); }
.nav-item.active { background: var(--accent-soft); border-color: var(--border-act); color: #fff; }
.nav-icon { width: 16px; text-align: center; font-size: 14px; flex-shrink: 0; }
.nav-badge {
  margin-left: auto; background: var(--red); color: #fff;
  border-radius: 8px; padding: 1px 6px; font-size: 9px; font-weight: 700;
}
.sidebar-bottom { margin-top: auto; display: flex; flex-direction: column; gap: 2px; }
.sync-btn {
  width: 100%; margin-top: 10px; padding: 9px;
  background: linear-gradient(135deg, var(--accent), var(--purple));
  color: #fff; border: none; border-radius: var(--r-sm);
  font-size: 12px; font-weight: 600; cursor: pointer;
  transition: filter 150ms;
}
.sync-btn:hover { filter: brightness(1.1); }

/* ── Glass Card ──────────────────────────────────────────────── */
.glass {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--r);
  backdrop-filter: var(--blur-card);
  position: relative; overflow: hidden;
}
.glass::before {
  content: ''; position: absolute; inset: 0;
  background: linear-gradient(135deg, rgba(255,255,255,0.02) 0%, transparent 60%);
  pointer-events: none;
}
.glass-header {
  padding: 12px 16px; border-bottom: 1px solid var(--border);
  font-size: 12px; color: var(--muted);
  display: flex; justify-content: space-between; align-items: center;
}
.glass-header a, .glass-header .hdr-link {
  font-size: 11px; color: var(--accent); text-decoration: none; cursor: pointer;
}
.glass-header a:hover, .glass-header .hdr-link:hover { text-decoration: underline; }
.glass-body { padding: 16px; }

/* ── Page Heading ────────────────────────────────────────────── */
.page-title { font-size: 20px; font-weight: 800; color: #fff; letter-spacing: -.4px; }
.page-sub   { font-size: 12px; color: var(--muted); margin-top: 3px; }

/* ── Stat Cards ──────────────────────────────────────────────── */
.stat-grid { display: grid; gap: 14px; margin-bottom: 24px; }
.stat-card {
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: var(--r); backdrop-filter: var(--blur-card);
  padding: 16px 18px; position: relative; overflow: hidden;
}
.stat-card::before {
  content: ''; position: absolute; inset: 0;
  background: linear-gradient(135deg,rgba(255,255,255,0.02) 0%,transparent 60%);
  pointer-events: none;
}
.stat-lbl { font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: .8px; margin-bottom: 8px; }
.stat-val  { font-size: 22px; font-weight: 800; letter-spacing: -.5px; line-height: 1; }
.stat-delta { font-size: 10px; color: var(--dim); margin-top: 5px; }
.stat-val.red    { color: var(--red); }
.stat-val.green  { color: var(--green); }
.stat-val.amber  { color: var(--amber); }
.stat-val.purple { color: var(--accent); }

/* ── Skeleton ────────────────────────────────────────────────── */
@keyframes shimmer {
  from { background-position: -200% 0; }
  to   { background-position:  200% 0; }
}
.skeleton {
  background: linear-gradient(90deg,#111 25%,#1a1a2e 50%,#111 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
  border-radius: 4px; color: transparent !important;
  user-select: none;
}

/* ── Animations ──────────────────────────────────────────────── */
@keyframes fadeSlideUp {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
.anim-row {
  animation: fadeSlideUp 200ms ease both;
  animation-delay: calc(var(--i, 0) * 30ms);
}

@keyframes modalIn {
  from { opacity: 0; transform: scale(0.96) translateY(6px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}
@keyframes backdropIn {
  from { opacity: 0; } to { opacity: 1; }
}

@keyframes barGrow {
  from { width: 0; }
  to   { width: var(--pct, 0%); }
}

@keyframes toastIn  { from { opacity:0; transform:translateX(120%); } to { opacity:1; transform:translateX(0); } }
@keyframes toastOut { from { opacity:1; transform:translateX(0); } to { opacity:0; transform:translateX(120%); } }

/* ── Toasts ──────────────────────────────────────────────────── */
#toast-container {
  position: fixed; bottom: 24px; right: 24px;
  display: flex; flex-direction: column; gap: 8px;
  z-index: 2000; pointer-events: none;
}
.toast {
  padding: 10px 16px; border-radius: var(--r-sm);
  font-size: 13px; font-weight: 500; color: #fff;
  backdrop-filter: blur(12px); pointer-events: auto;
  animation: toastIn 250ms ease both;
  border: 1px solid rgba(255,255,255,0.1);
  max-width: 320px;
}
.toast.toast-out { animation: toastOut 280ms ease both; }
.toast-success { background: rgba(93,184,125,0.85); }
.toast-error   { background: rgba(224,112,112,0.85); }
.toast-info    { background: rgba(124,131,253,0.85); }

/* ── Table ───────────────────────────────────────────────────── */
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th {
  color: var(--muted); text-align: left; padding: 10px 14px;
  border-bottom: 1px solid var(--border); font-weight: 500; font-size: 11px;
  text-transform: uppercase; letter-spacing: .4px;
}
td { padding: 11px 14px; border-bottom: 1px solid rgba(255,255,255,0.04); }
tbody tr {
  transition: background 100ms, transform 100ms, box-shadow 100ms;
}
tbody tr:hover {
  background: rgba(255,255,255,0.03);
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(0,0,0,.25);
}

/* ── Badges ──────────────────────────────────────────────────── */
.badge {
  display: inline-block; border-radius: 20px;
  padding: 2px 9px; font-size: 11px; font-weight: 600; letter-spacing: .3px;
}
.badge.expense { background: rgba(224,112,112,0.12); color: var(--red); }
.badge.income  { background: rgba(93,184,125,0.12);  color: var(--green); }
.badge.ignore  { background: rgba(255,255,255,0.04); color: var(--muted); }
.badge.review  { background: rgba(124,131,253,0.12); color: var(--accent); }

/* ── Buttons ─────────────────────────────────────────────────── */
.btn-primary {
  background: var(--accent); color: #fff; cursor: pointer;
  border: none; border-radius: var(--r-sm);
  padding: 7px 18px; font-size: 13px; font-weight: 500;
  transition: filter 150ms;
}
.btn-primary:hover { filter: brightness(1.1); }
.btn-ghost {
  background: transparent; color: var(--accent);
  border: 1px solid var(--accent); cursor: pointer;
  border-radius: var(--r-sm); padding: 7px 18px;
  font-size: 13px; transition: background 150ms;
}
.btn-ghost:hover { background: var(--accent-soft); }
.btn-primary:disabled, .btn-ghost:disabled { opacity: .5; cursor: not-allowed; filter: none; }

/* ── Inputs ──────────────────────────────────────────────────── */
input, select, textarea {
  background: rgba(255,255,255,0.04); color: var(--text);
  border: 1px solid var(--border); border-radius: var(--r-sm);
  padding: 7px 10px; font-size: 13px;
  transition: border-color 150ms;
}
input:focus, select:focus, textarea:focus {
  outline: none; border-color: var(--accent);
}
input::placeholder, textarea::placeholder { color: var(--muted); }

/* ── Links ───────────────────────────────────────────────────── */
a.link { color: var(--accent); text-decoration: none; }
a.link:hover { text-decoration: underline; }

/* ── Period tabs ─────────────────────────────────────────────── */
.period-tab {
  background: var(--bg-card); border: 1px solid var(--border);
  color: var(--muted); border-radius: 20px;
  padding: 5px 14px; font-size: 12px; cursor: pointer;
  transition: background 150ms, color 150ms, border-color 150ms;
}
.period-tab.active {
  background: var(--accent); border-color: var(--accent); color: #fff;
}
.period-tab:hover:not(.active) { border-color: var(--accent); color: var(--text); }

/* ── Budget bar ──────────────────────────────────────────────── */
.budget-bar-track {
  height: 5px; background: rgba(255,255,255,0.06); border-radius: 3px; overflow: hidden;
}
.budget-bar-fill {
  height: 5px; border-radius: 3px;
  width: var(--pct, 0%);
  animation: barGrow 600ms ease-out both;
}

/* ── Sync panel (token updates only) ────────────────────────── */
#sync-panel {
  position: fixed; bottom: 24px; right: 24px; width: 420px;
  background: rgba(13,13,26,0.9); backdrop-filter: blur(20px);
  border: 1px solid var(--border); border-radius: 14px;
  box-shadow: 0 12px 40px rgba(0,0,0,.6); z-index: 1000; overflow: hidden;
  transition: transform .35s cubic-bezier(.4,0,.2,1), opacity .35s;
  transform: translateY(24px); opacity: 0; pointer-events: none;
}
#sync-panel.visible { transform: translateY(0); opacity: 1; pointer-events: auto; }
#sync-panel-header { padding: 14px 16px 10px; display: flex; justify-content: space-between; align-items: flex-start; }
#sync-panel-title  { font-size: 14px; font-weight: 700; color: #e8e8f0; letter-spacing: -.2px; }
#sync-panel-phase  { font-size: 12px; color: #6a6a8a; margin-top: 3px; }
#sync-panel-spinner { font-size: 16px; color: var(--accent); margin-top: 2px; flex-shrink: 0; }
@keyframes spin { to { transform: rotate(360deg); } }
#sync-panel-spinner.spinning { display: inline-block; animation: spin 1.2s linear infinite; }
.sync-bar-wrap  { padding: 4px 16px 0; }
.sync-bar-track { height: 6px; background: #1e1e32; border-radius: 3px; overflow: hidden; }
.sync-bar-fill  { height: 6px; background: linear-gradient(90deg,var(--accent),var(--purple)); border-radius: 3px; transition: width .6s cubic-bezier(.4,0,.2,1); width: 0%; }
.sync-bar-meta  { display: flex; justify-content: space-between; padding: 5px 0 0; font-size: 11px; color: #4a4a6a; }
.sync-bar-meta .pct { color: var(--accent); font-weight: 600; }
#sync-tally { display: flex; gap: 16px; padding: 8px 16px 10px; border-bottom: 1px solid #1e1e32; }
.tally-item { display: flex; align-items: center; gap: 5px; font-size: 12px; }
.tally-dot  { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.tally-dot.expense { background: var(--red); }
.tally-dot.income  { background: var(--green); }
.tally-dot.ignore  { background: #3a3a5a; }
.tally-num { font-weight: 700; color: #ccc; }
.tally-lbl { color: #4a4a6a; }
#sync-previews { overflow: hidden; }
.sp-item { display: grid; grid-template-columns: 1fr auto; gap: 6px; padding: 7px 16px; border-top: 1px solid #1a1a2e; align-items: center; animation: fadeSlideUp .2s ease; }
.sp-subject { font-size: 12px; color: #c8c8d8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sp-sender  { font-size: 11px; color: #3e3e5e; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }
.sp-right   { display: flex; align-items: center; gap: 7px; flex-shrink: 0; }
.sp-amount  { font-size: 12px; font-weight: 600; min-width: 52px; text-align: right; }
.sp-amount.expense { color: var(--red); }
.sp-amount.income  { color: var(--green); }
.sp-amount.ignore  { color: #2e2e4e; }
.sp-badge  { font-size: 10px; font-weight: 600; border-radius: 3px; padding: 1px 6px; text-transform: uppercase; letter-spacing: .4px; }
.sp-badge.expense { background: #2a1a1a; color: var(--red); }
.sp-badge.income  { background: #1a2a1a; color: var(--green); }
.sp-badge.ignore  { background: #1a1a28; color: #3a3a5a; }
#sync-panel-done { padding: 10px 16px 14px; font-size: 12px; text-align: center; display: none; border-top: 1px solid #1e1e32; }
```

- [ ] **Step 2: Verify `static/styles.css` was created**

```bash
wc -l /Users/amansaini/Desktop/Vibe/GexpenseTracker/static/styles.css
```
Expected: ~200+ lines

- [ ] **Step 3: Rewrite `templates/base.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Expense Tracker</title>
  <link rel="stylesheet" href="/static/styles.css">
  {% block extra_head %}{% endblock %}
</head>
<body class="page-{% block page_name %}dashboard{% endblock %}">

<!-- Ambient glow orbs -->
<div class="glow-orb" id="glow1"></div>
<div class="glow-orb" id="glow2"></div>

<div class="layout">
  <!-- Sidebar -->
  <aside class="sidebar">
    <a href="/" class="sidebar-brand">ExpenseTracker</a>

    <nav class="sidebar-nav">
      <a href="/" class="nav-item" data-page="dashboard">
        <span class="nav-icon">⬛</span>
        <span>Dashboard</span>
      </a>
      <a href="/transactions" class="nav-item" data-page="transactions">
        <span class="nav-icon">≡</span>
        <span>Transactions</span>
      </a>
      <a href="/review" class="nav-item" data-page="review">
        <span class="nav-icon">◉</span>
        <span>Review</span>
        <span id="review-count" style="display:none" class="nav-badge"></span>
      </a>
      <a href="/recurring" class="nav-item" data-page="recurring">
        <span class="nav-icon">↺</span>
        <span>Recurring</span>
      </a>
      <a href="/budgets" class="nav-item" data-page="budgets">
        <span class="nav-icon">◎</span>
        <span>Budgets</span>
      </a>
    </nav>

    <div class="sidebar-bottom">
      <a href="/settings" class="nav-item" data-page="settings">
        <span class="nav-icon">⚙</span>
        <span>Settings</span>
      </a>
      <button class="sync-btn" onclick="triggerSync()">↻ Sync Now</button>
    </div>
  </aside>

  <!-- Main content -->
  <main class="main">
    <div class="container">
      {% block content %}{% endblock %}
    </div>
  </main>
</div>

<!-- Sync progress panel -->
<div id="sync-panel">
  <div id="sync-panel-header">
    <div>
      <div id="sync-panel-title">Syncing Gmail</div>
      <div id="sync-panel-phase">Connecting...</div>
    </div>
    <span id="sync-panel-spinner" class="spinning">↻</span>
  </div>
  <div class="sync-bar-wrap">
    <div class="sync-bar-track"><div class="sync-bar-fill" id="sync-bar-fill"></div></div>
    <div class="sync-bar-meta">
      <span id="sync-bar-fraction"></span>
      <span class="pct" id="sync-bar-pct"></span>
    </div>
  </div>
  <div id="sync-tally">
    <div class="tally-item"><div class="tally-dot expense"></div><span class="tally-num" id="tally-expense">0</span><span class="tally-lbl">expense</span></div>
    <div class="tally-item"><div class="tally-dot income"></div><span class="tally-num" id="tally-income">0</span><span class="tally-lbl">income</span></div>
    <div class="tally-item"><div class="tally-dot ignore"></div><span class="tally-num" id="tally-ignore">0</span><span class="tally-lbl">ignore</span></div>
  </div>
  <div id="sync-previews"></div>
  <div id="sync-more" style="display:none;padding:6px 16px 10px;font-size:11px;color:#3a3a5a;text-align:center"></div>
  <div id="sync-panel-done"></div>
</div>

<!-- Toast container -->
<div id="toast-container"></div>

<script src="/static/app.js"></script>
<script>
  // Sidebar active state
  const _page = window.location.pathname.replace(/^\//, '').split('/')[0] || 'dashboard';
  document.querySelectorAll('.nav-item[data-page]').forEach(function(a) {
    a.classList.toggle('active', a.dataset.page === _page);
  });
</script>
</body>
</html>
```

- [ ] **Step 4: Commit**

```bash
git add static/styles.css templates/base.html
git commit -m "feat: design system + sidebar layout (styles.css + base.html)"
```

---

## Task 2: app.js Extensions

**Files:**
- Modify: `static/app.js` (prepend new utilities before existing code)

- [ ] **Step 1: Add utilities to the top of `static/app.js`**

Insert the following block at the very top of `static/app.js` (before any existing code):

```js
/* ── Design system utilities ─────────────────────────────────── */

// Count-up animation for stat numbers
function countUp(el, target, duration) {
  duration = duration || 600;
  var start = performance.now();
  var prefix = el.dataset.prefix || '';
  function tick(now) {
    var t = Math.min((now - start) / duration, 1);
    var ease = t * (2 - t);
    var cur = Math.round(target * ease);
    el.textContent = prefix + cur.toLocaleString('en-IN');
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// Toast notification
function showToast(msg, type) {
  type = type || 'success';
  var container = document.getElementById('toast-container');
  if (!container) return;
  var toast = document.createElement('div');
  toast.className = 'toast toast-' + type;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(function() {
    toast.classList.add('toast-out');
    setTimeout(function() { toast.remove(); }, 300);
  }, 3000);
}

// Skeleton rows for table loading state
function _skeletonRows(n, cols) {
  var row = '<tr>' + Array(cols).fill('<td><div class="skeleton" style="height:13px;width:80%">&nbsp;</div></td>').join('') + '</tr>';
  return Array(n).fill(row).join('');
}

/* ── End utilities ───────────────────────────────────────────── */
```

- [ ] **Step 2: Update `triggerSync` in `static/app.js` to show toast on complete**

Find the section in `app.js` that handles sync completion (look for `syncDone` or `sync-panel-done`). After the panel shows "Done", add:

```js
showToast('Sync complete', 'success');
```

Specifically, find where `syncDone` or the done-message is set and add the call there. The existing sync function sets `document.getElementById('sync-panel-done')` text — add `showToast('Sync complete', 'success');` right after that line.

- [ ] **Step 3: Update `_esc` to be globally available (check it's not duplicated)**

The function `_esc` is defined globally in `app.js`. Several page templates also define it locally. This is fine — local definitions shadow the global but produce same result. No change needed.

- [ ] **Step 4: Commit**

```bash
git add static/app.js
git commit -m "feat: add countUp, showToast, skeletonRows utilities to app.js"
```

---

## Task 3: Dashboard Redesign

**Files:**
- Modify: `templates/dashboard.html`

The dashboard gets: greeting + period picker, 4 stat cards (count-up), 2-col layout (activity feed + budget sidebar), then charts below.

- [ ] **Step 1: Rewrite `templates/dashboard.html`**

```html
{% extends "base.html" %}
{% block page_name %}dashboard{% endblock %}
{% block content %}

<!-- Alerts -->
<div id="alerts-wrap" style="margin-bottom:16px"></div>

<!-- Header row -->
<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px">
  <div>
    <div class="page-title" id="dash-greeting">Good morning</div>
    <div class="page-sub" id="dash-sub">Loading...</div>
  </div>
  <!-- Period picker -->
  <div style="display:flex;gap:6px;align-items:center">
    <button class="period-tab" data-period="1m" onclick="setPeriod('1m')">This month</button>
    <button class="period-tab" data-period="3m" onclick="setPeriod('3m')">3 months</button>
    <button class="period-tab" data-period="6m" onclick="setPeriod('6m')">6 months</button>
    <button class="period-tab" data-period="1y" onclick="setPeriod('1y')">This year</button>
  </div>
</div>

<!-- 4 stat cards -->
<div class="stat-grid" style="grid-template-columns:repeat(4,1fr)">
  <div class="stat-card">
    <div class="stat-lbl">Total Spent</div>
    <div class="stat-val red skeleton" id="s-expense" data-prefix="₹">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</div>
    <div class="stat-delta" id="s-expense-delta">&nbsp;</div>
  </div>
  <div class="stat-card">
    <div class="stat-lbl">Income</div>
    <div class="stat-val green skeleton" id="s-income" data-prefix="₹">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</div>
    <div class="stat-delta" id="s-income-delta">&nbsp;</div>
  </div>
  <div class="stat-card">
    <div class="stat-lbl">Net</div>
    <div class="stat-val amber skeleton" id="s-saved" data-prefix="₹">&nbsp;&nbsp;&nbsp;&nbsp;</div>
    <div class="stat-delta" id="s-rate">&nbsp;</div>
  </div>
  <div class="stat-card" style="cursor:pointer" onclick="location.href='/review'">
    <div class="stat-lbl">Needs Review</div>
    <div class="stat-val purple skeleton" id="s-review">&nbsp;&nbsp;&nbsp;</div>
    <div class="stat-delta" style="color:var(--accent)">Review now →</div>
  </div>
</div>

<!-- 2-col: activity feed + sidebar -->
<div style="display:grid;grid-template-columns:1fr 300px;gap:16px;margin-bottom:16px">

  <!-- Activity feed -->
  <div class="glass">
    <div class="glass-header">
      Recent Activity
      <a href="/transactions" class="hdr-link">View all →</a>
    </div>
    <div class="glass-body" id="activity-feed" style="padding:8px 16px">
      <!-- skeleton rows -->
      <div id="activity-skeleton">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.04)" id="_as0"><div class="skeleton" style="height:12px;width:40%">&nbsp;</div><div class="skeleton" style="height:12px;width:15%">&nbsp;</div></div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.04)" id="_as1"><div class="skeleton" style="height:12px;width:50%">&nbsp;</div><div class="skeleton" style="height:12px;width:15%">&nbsp;</div></div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.04)" id="_as2"><div class="skeleton" style="height:12px;width:35%">&nbsp;</div><div class="skeleton" style="height:12px;width:15%">&nbsp;</div></div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0" id="_as3"><div class="skeleton" style="height:12px;width:45%">&nbsp;</div><div class="skeleton" style="height:12px;width:15%">&nbsp;</div></div>
      </div>
    </div>
  </div>

  <!-- Budget sidebar -->
  <div class="glass">
    <div class="glass-header">
      Budgets
      <a href="/budgets" class="hdr-link">Manage →</a>
    </div>
    <div class="glass-body" id="budget-sidebar" style="padding:12px 16px">
      <div class="skeleton" style="height:12px;width:100%;margin-bottom:12px">&nbsp;</div>
      <div class="skeleton" style="height:12px;width:100%;margin-bottom:12px">&nbsp;</div>
      <div class="skeleton" style="height:12px;width:100%;margin-bottom:12px">&nbsp;</div>
    </div>
  </div>

</div>

<!-- Row 2: Trend + Donut -->
<div style="display:grid;grid-template-columns:2fr 1fr;gap:16px;margin-bottom:16px">
  <div class="glass">
    <div class="glass-header">Monthly Trend <span id="trend-legend" style="font-size:11px;color:var(--muted)"></span></div>
    <div class="glass-body">
      <svg id="trend-svg" viewBox="0 0 500 120" width="100%" style="display:block;overflow:visible">
        <text x="250" y="60" text-anchor="middle" fill="#333" font-size="13">Loading…</text>
      </svg>
    </div>
  </div>
  <div class="glass">
    <div class="glass-header">Category Breakdown</div>
    <div class="glass-body" style="display:flex;flex-direction:column;align-items:center;gap:12px">
      <svg id="donut-svg" viewBox="0 0 180 180" width="150" height="150" style="display:block;overflow:visible">
        <circle cx="90" cy="90" r="60" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="22"/>
        <text x="90" y="95" text-anchor="middle" fill="#333" font-size="13">Loading…</text>
      </svg>
      <div id="donut-legend" style="width:100%"></div>
    </div>
  </div>
</div>

<!-- Row 3: Merchants + Income vs Expense -->
<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
  <div class="glass">
    <div class="glass-header">Top Merchants</div>
    <div class="glass-body" id="merchants-list">
      <div style="color:var(--dim);text-align:center;padding:20px">Loading…</div>
    </div>
  </div>
  <div class="glass">
    <div class="glass-header">
      Income vs Expense
      <span style="font-size:11px;color:var(--muted)"><span style="color:var(--green)">●</span> Income &nbsp;<span style="color:var(--red)">●</span> Expense</span>
    </div>
    <div class="glass-body">
      <svg id="ive-svg" viewBox="0 0 400 120" width="100%" style="display:block;overflow:visible">
        <text x="200" y="60" text-anchor="middle" fill="#333" font-size="13">Loading…</text>
      </svg>
    </div>
  </div>
</div>

<script>
var _period = localStorage.getItem('dashboard_period') || '1m';
var _countsUp = false;

// Greeting
(function() {
  var h = new Date().getHours();
  document.getElementById('dash-greeting').textContent =
    h < 12 ? 'Good morning ☀️' : h < 17 ? 'Good afternoon 🌤' : 'Good evening 🌙';
})();

function setPeriod(p) {
  _period = p;
  localStorage.setItem('dashboard_period', p);
  document.querySelectorAll('.period-tab').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.period === p);
  });
  _countsUp = false;
  loadCharts(p);
}

// ── Activity feed ───────────────────────────────────────────────
var CATEGORY_EMOJI = {
  Food:'🍔', Groceries:'🛒', Shopping:'🛍', Travel:'✈️',
  Transport:'🚗', Utilities:'⚡', Entertainment:'🎬',
  Healthcare:'💊', Education:'📚', Income:'💰', Other:'📌', 'UPI Payment':'📱'
};

async function loadActivity() {
  try {
    var txns = await fetch('/api/transactions').then(function(r) { return r.json(); });
    var feed = txns.filter(function(t) { return t.label !== 'ignore'; }).slice(0, 8);
    var el = document.getElementById('activity-feed');
    el.innerHTML = feed.length ? feed.map(function(t, i) {
      var isIncome = t.label === 'income';
      var amtColor = isIncome ? 'var(--green)' : 'var(--red)';
      var sign = isIncome ? '+' : '−';
      var emoji = CATEGORY_EMOJI[t.category] || '📌';
      var iconBg = isIncome ? 'rgba(93,184,125,0.12)' : 'rgba(224,112,112,0.12)';
      var date = t.txn_date || (t.email && t.email.received_at ? t.email.received_at.slice(0,10) : '');
      return '<div class="anim-row" style="--i:' + i + ';display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid rgba(255,255,255,0.04)">' +
        '<div style="display:flex;align-items:center;gap:10px">' +
          '<div style="width:30px;height:30px;border-radius:8px;background:' + iconBg + ';display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0">' + emoji + '</div>' +
          '<div>' +
            '<div style="font-size:12px;color:var(--text);font-weight:500">' + _esc(t.merchant || t.category || 'Unknown') + '</div>' +
            '<div style="font-size:10px;color:var(--muted)">' + _esc(t.category || '') + (date ? ' · ' + date : '') + '</div>' +
          '</div>' +
        '</div>' +
        '<div style="font-size:12px;font-weight:700;color:' + amtColor + '">' +
          (t.amount != null ? sign + '₹' + Number(t.amount).toLocaleString('en-IN') : '—') +
        '</div>' +
      '</div>';
    }).join('') : '<div style="color:var(--muted);text-align:center;padding:24px">No transactions yet.</div>';
  } catch(e) {
    document.getElementById('activity-feed').innerHTML = '<div style="color:var(--muted);text-align:center;padding:24px">Failed to load.</div>';
  }
}

// ── Budget sidebar ──────────────────────────────────────────────
async function loadBudgetSidebar() {
  try {
    var data = await fetch('/api/budgets').then(function(r) { return r.json(); });
    var el = document.getElementById('budget-sidebar');
    var budgets = (data.budgets || []).slice(0, 6);
    if (!budgets.length) {
      el.innerHTML = '<div style="color:var(--muted);text-align:center;padding:16px;font-size:12px">No budgets. <a href="/budgets" class="link">Add one →</a></div>';
      return;
    }
    el.innerHTML = budgets.map(function(b) {
      var pct = Math.min(b.pct, 100);
      var color = b.pct >= 100 ? 'var(--red)' : b.pct >= 70 ? 'var(--amber)' : 'var(--accent)';
      var barColor = b.pct >= 100 ? 'var(--red)' : b.pct >= 70 ? 'var(--amber)' : 'var(--green)';
      return '<div style="margin-bottom:14px">' +
        '<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:5px">' +
          '<span style="color:var(--text)">' + _esc(b.category) + '</span>' +
          '<span style="color:' + color + ';font-weight:600">' + b.pct.toFixed(0) + '%</span>' +
        '</div>' +
        '<div class="budget-bar-track"><div class="budget-bar-fill" style="--pct:' + pct.toFixed(1) + '%;background:' + barColor + '"></div></div>' +
        '<div style="font-size:10px;color:var(--muted);margin-top:3px">₹' + b.spent_this_month.toLocaleString('en-IN') + ' of ₹' + b.monthly_limit.toLocaleString('en-IN') + '</div>' +
      '</div>';
    }).join('');
  } catch(e) {}
}

// ── Alerts ──────────────────────────────────────────────────────
async function loadAlerts() {
  try {
    var alerts = await fetch('/api/alerts').then(function(r) { return r.json(); });
    var wrap = document.getElementById('alerts-wrap');
    var unread = alerts.filter(function(a) { return !a.read; });
    if (!unread.length) { wrap.innerHTML = ''; return; }
    var colors = { error:'var(--red)', warning:'var(--amber)', info:'var(--accent)' };
    wrap.innerHTML = unread.map(function(a) {
      return '<div style="display:flex;align-items:flex-start;gap:10px;background:var(--bg-card);border:1px solid ' + (colors[a.level]||'var(--border)') + ';border-radius:var(--r-sm);padding:10px 14px;margin-bottom:8px;font-size:13px">' +
        '<span style="color:' + (colors[a.level]||'var(--accent)') + ';font-weight:700;flex-shrink:0">' + a.level.toUpperCase() + '</span>' +
        '<div style="flex:1"><span style="color:#ccc">' + _esc(a.message) + '</span></div>' +
        '<button onclick="clearAlerts()" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:16px;padding:0 2px">&times;</button>' +
      '</div>';
    }).join('');
  } catch(e) {}
}

async function clearAlerts() {
  await fetch('/api/alerts/clear', { method: 'POST' });
  document.getElementById('alerts-wrap').innerHTML = '';
}

// ── Chart renderers (same logic, updated colors) ─────────────────
var COLORS = ['var(--red)','var(--accent)','var(--green)','var(--amber)','var(--purple)','#60c9e0','#f08080'];

function renderSummary(data) {
  // Remove skeleton class and count up
  var expEl = document.getElementById('s-expense');
  var incEl = document.getElementById('s-income');
  var savEl = document.getElementById('s-saved');
  var revEl = document.getElementById('s-review');
  [expEl, incEl, savEl, revEl].forEach(function(el) { el.classList.remove('skeleton'); });

  if (!_countsUp) {
    _countsUp = true;
    countUp(expEl, Math.round(data.total_expenses));
    countUp(incEl, Math.round(data.total_income));
    countUp(savEl, Math.round(Math.abs(data.saved)));
  } else {
    expEl.textContent = '₹' + Math.round(data.total_expenses).toLocaleString('en-IN');
    incEl.textContent = '₹' + Math.round(data.total_income).toLocaleString('en-IN');
    savEl.textContent = '₹' + Math.round(Math.abs(data.saved)).toLocaleString('en-IN');
  }
  revEl.textContent = data.needs_review_count;
  document.getElementById('s-rate').textContent = 'Savings rate ' + data.savings_rate.toFixed(1) + '%';
  document.getElementById('dash-sub').textContent =
    _period === '1m' ? 'April 2026 · ' + data.needs_review_count + ' need review'
    : data.needs_review_count + ' need review';

  var badge = document.getElementById('review-count');
  if (badge) {
    if (data.needs_review_count > 0) { badge.textContent = data.needs_review_count; badge.style.display = 'inline'; }
    else badge.style.display = 'none';
  }
}

function renderDonut(categories) {
  var svg = document.getElementById('donut-svg');
  var leg = document.getElementById('donut-legend');
  if (!categories.length) {
    svg.innerHTML = '<circle cx="90" cy="90" r="60" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="22"/><text x="90" y="95" text-anchor="middle" fill="var(--muted)" font-size="12">No data</text>';
    leg.innerHTML = ''; return;
  }
  var circ = 2 * Math.PI * 60, offset = 0;
  var circles = '<circle cx="90" cy="90" r="60" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="22"/>';
  var legend = '';
  var total = categories.reduce(function(s, c) { return s + c.amount; }, 0);
  var rawColors = ['#e07070','#7c83fd','#5db87d','#f0a500','#a78bfa','#60c9e0','#f08080'];
  categories.forEach(function(cat, i) {
    var pct = total > 0 ? cat.amount / total : 0;
    var dash = pct * circ, gap = circ - dash;
    var color = rawColors[i % rawColors.length];
    circles += '<circle cx="90" cy="90" r="60" fill="none" stroke="' + color + '" stroke-width="22"' +
      ' stroke-dasharray="' + dash.toFixed(2) + ' ' + gap.toFixed(2) + '"' +
      ' stroke-dashoffset="' + (-offset).toFixed(2) + '"' +
      ' transform="rotate(-90 90 90)"/>';
    offset += dash;
    legend += '<div style="display:flex;align-items:center;gap:6px;font-size:11px;color:#888;margin-bottom:4px">' +
      '<div style="width:7px;height:7px;border-radius:50%;background:' + color + ';flex-shrink:0"></div>' +
      '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + _esc(cat.category) + '</span>' +
      '<span style="color:#ccc;font-weight:600">₹' + cat.amount.toLocaleString('en-IN') + '</span></div>';
  });
  svg.innerHTML = circles; leg.innerHTML = legend;
}

function renderTrend(months) {
  var svg = document.getElementById('trend-svg');
  var leg = document.getElementById('trend-legend');
  if (!months.length) { svg.innerHTML = '<text x="250" y="60" text-anchor="middle" fill="var(--muted)" font-size="13">No data</text>'; leg.innerHTML = ''; return; }
  var W=500,H=120,pL=50,pR=20,pT=10,pB=30,cW=W-pL-pR,cH=H-pT-pB,n=months.length;
  var maxVal = Math.max.apply(null, months.map(function(m) { return Math.max(m.expenses,m.income); }).concat([1]));
  function xOf(i) { return pL + (n===1 ? cW/2 : (i/(n-1))*cW); }
  function yOf(v) { return pT + cH - (v/maxVal)*cH; }
  var expPts = months.map(function(m,i) { return xOf(i).toFixed(1)+','+yOf(m.expenses).toFixed(1); }).join(' ');
  var incPts = months.map(function(m,i) { return xOf(i).toFixed(1)+','+yOf(m.income).toFixed(1); }).join(' ');
  var hasInc = months.some(function(m) { return m.income > 0; });
  var MONS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var s = '<line x1="'+pL+'" y1="'+(pT+cH)+'" x2="'+(W-pR)+'" y2="'+(pT+cH)+'" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>';
  if (hasInc) s += '<polyline points="'+incPts+'" fill="none" stroke="#5db87d" stroke-width="2" stroke-linejoin="round"/>';
  s += '<polyline points="'+expPts+'" fill="none" stroke="#e07070" stroke-width="2" stroke-linejoin="round"/>';
  months.forEach(function(m,i) {
    s += '<text x="'+xOf(i).toFixed(1)+'" y="'+(H-4)+'" text-anchor="middle" font-size="9" fill="var(--muted)">'+MONS[parseInt(m.month.split('-')[1])-1]+'</text>';
  });
  svg.innerHTML = s;
  leg.innerHTML = '<span style="color:#e07070">● Expense</span>'+(hasInc?'<span style="color:#5db87d;margin-left:12px">● Income</span>':'');
}

function renderMerchants(merchants) {
  var el = document.getElementById('merchants-list');
  if (!merchants.length) { el.innerHTML = '<div style="color:var(--muted);text-align:center;padding:20px;font-size:12px">No data</div>'; return; }
  var max = merchants[0].amount;
  el.innerHTML = merchants.map(function(m) {
    return '<div style="margin-bottom:12px">' +
      '<div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:5px">' +
        '<span style="color:#888">' + _esc(m.merchant) + '</span>' +
        '<span style="color:var(--red);font-weight:600">₹' + m.amount.toLocaleString('en-IN') + '</span>' +
      '</div>' +
      '<div class="budget-bar-track"><div class="budget-bar-fill" style="--pct:' + (max>0?(m.amount/max*100).toFixed(1):0) + '%;background:var(--red)"></div></div>' +
    '</div>';
  }).join('');
}

function renderIncomeVsExpense(months) {
  var svg = document.getElementById('ive-svg');
  if (!months.length) { svg.innerHTML = '<text x="200" y="60" text-anchor="middle" fill="var(--muted)" font-size="13">No data</text>'; return; }
  var W=400,H=120,pL=10,pR=10,pT=10,pB=25,cW=W-pL-pR,cH=H-pT-pB;
  var maxVal=Math.max.apply(null,months.map(function(m){return Math.max(m.income,m.expenses);}).concat([1]));
  var n=months.length,groupW=cW/n,barW=Math.min(groupW*0.35,18);
  var MONS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var s='<line x1="'+pL+'" y1="'+(pT+cH)+'" x2="'+(W-pR)+'" y2="'+(pT+cH)+'" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>';
  months.forEach(function(m,i) {
    var cx=pL+i*groupW+groupW/2,x1=cx-barW-1,x2=cx+1;
    var hInc=m.income>0?(m.income/maxVal)*cH:0,hExp=m.expenses>0?(m.expenses/maxVal)*cH:0;
    if(hInc>0)s+='<rect x="'+x1.toFixed(1)+'" y="'+(pT+cH-hInc).toFixed(1)+'" width="'+barW.toFixed(1)+'" height="'+hInc.toFixed(1)+'" fill="#5db87d" rx="2"/>';
    if(hExp>0)s+='<rect x="'+x2.toFixed(1)+'" y="'+(pT+cH-hExp).toFixed(1)+'" width="'+barW.toFixed(1)+'" height="'+hExp.toFixed(1)+'" fill="#e07070" rx="2"/>';
    s+='<text x="'+cx+'" y="'+(H-4)+'" text-anchor="middle" font-size="8" fill="var(--muted)">'+MONS[parseInt(m.month.split('-')[1])-1]+'</text>';
  });
  svg.innerHTML = s;
}

// ── Main loader ──────────────────────────────────────────────────
async function loadCharts(period) {
  var fetches = [
    fetch('/api/stats/summary?period='+period).then(function(r){return r.json();}),
    fetch('/api/stats/category-breakdown?period='+period).then(function(r){return r.json();}),
    fetch('/api/stats/monthly-trend?period='+period).then(function(r){return r.json();}),
    fetch('/api/stats/top-merchants?period='+period).then(function(r){return r.json();}),
    fetch('/api/stats/income-vs-expense?period='+period).then(function(r){return r.json();}),
  ];
  var results = await Promise.allSettled(fetches);
  function val(i) { return results[i].status==='fulfilled'?results[i].value:null; }
  if (val(0)) renderSummary(val(0));
  if (val(1)) renderDonut((val(1).categories)||[]);
  if (val(2)) renderTrend((val(2).months)||[]);
  if (val(3)) renderMerchants((val(3).merchants)||[]);
  if (val(4)) renderIncomeVsExpense((val(4).months)||[]);
}

// ── Boot ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
  document.querySelectorAll('.period-tab').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.period === _period);
  });
  loadAlerts();
  loadActivity();
  loadBudgetSidebar();
  loadCharts(_period);
});
</script>
{% endblock %}
```

- [ ] **Step 2: Verify the app loads without errors**

Start the server and open `http://localhost:8000`. The page should show the sidebar, greeting, 4 skeleton stat cards that fill in, and the activity feed.

```bash
# In terminal with venv active:
uvicorn app.main:app --reload --port 8000
```

Open browser at `http://localhost:8000` — no JS errors in console.

- [ ] **Step 3: Commit**

```bash
git add templates/dashboard.html
git commit -m "feat: activity-led dashboard redesign with glass cards and count-up stats"
```

---

## Task 4: Transactions Page Restyle

**Files:**
- Modify: `templates/transactions.html`

- [ ] **Step 1: Rewrite `templates/transactions.html`**

```html
{% extends "base.html" %}
{% block page_name %}transactions{% endblock %}
{% block content %}

<!-- Filter bar -->
<div style="display:flex;gap:8px;margin-bottom:20px;align-items:center;flex-wrap:wrap">
  <select id="filter-label" onchange="loadTxns()">
    <option value="">All labels</option>
    <option value="expense">Expense</option>
    <option value="income">Income</option>
    <option value="ignore">Ignore</option>
  </select>
  <select id="filter-category" onchange="loadTxns()">
    <option value="">All categories</option>
    <option value="Food">Food</option>
    <option value="Groceries">Groceries</option>
    <option value="Shopping">Shopping</option>
    <option value="Travel">Travel</option>
    <option value="Transport">Transport</option>
    <option value="Utilities">Utilities</option>
    <option value="Entertainment">Entertainment</option>
    <option value="Healthcare">Healthcare</option>
    <option value="Education">Education</option>
    <option value="UPI Payment">UPI Payment</option>
    <option value="Bank Transfer">Bank Transfer</option>
    <option value="Income">Income</option>
    <option value="Other">Other</option>
  </select>
  <select id="filter-status" onchange="loadTxns()">
    <option value="">All statuses</option>
    <option value="auto">Auto</option>
    <option value="corrected">Corrected</option>
    <option value="needs_review">Needs Review</option>
  </select>
  <input type="date" id="filter-from" onchange="loadTxns()">
  <input type="date" id="filter-to" onchange="loadTxns()">
  <span id="txn-count" style="margin-left:auto;font-size:12px;color:var(--muted)"></span>
</div>

<!-- Table -->
<div class="glass" style="padding:0;overflow:hidden">
  <table>
    <thead>
      <tr>
        <th style="width:90px">Date</th>
        <th>Merchant</th>
        <th>Category</th>
        <th style="text-align:right">Amount</th>
        <th style="width:100px">Label</th>
        <th style="width:28px"></th>
      </tr>
    </thead>
    <tbody id="txn-body"></tbody>
  </table>
</div>

<style>
  tr.lbl-expense     { border-left: 3px solid var(--red); }
  tr.lbl-income      { border-left: 3px solid var(--green); }
  tr.lbl-ignore      { border-left: 3px solid rgba(255,255,255,0.05); }
  tr.lbl-needs_review{ border-left: 3px solid var(--accent); }

  .edit-btn {
    background: none; border: none; color: var(--dim);
    cursor: pointer; font-size: 14px; padding: 2px 6px;
    border-radius: 4px; transition: color .12s;
  }
  .edit-btn:hover { color: var(--accent); }

  #email-tooltip {
    position: fixed; z-index: 9999;
    background: rgba(10,10,24,0.95);
    border: 1px solid var(--border);
    border-radius: var(--r-sm);
    padding: 14px 16px; max-width: 420px; min-width: 280px;
    box-shadow: 0 8px 32px rgba(0,0,0,.6);
    backdrop-filter: blur(16px); pointer-events: auto;
  }
  #email-tooltip .tip-subject { font-size: 13px; font-weight: 600; color: #ccc; margin-bottom: 3px; }
  #email-tooltip .tip-meta { font-size: 11px; color: var(--muted); margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; }
  #email-tooltip .tip-body { font-size: 12px; color: #888; line-height: 1.6; max-height: 160px; overflow-y: auto; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 10px; white-space: pre-wrap; word-break: break-word; }
</style>

<script>
const LABEL_BORDER = { expense:'var(--red)', income:'var(--green)', ignore:'rgba(255,255,255,0.05)', needs_review:'var(--accent)' };
const LABEL_COLOR  = { expense:'var(--red)', income:'var(--green)', ignore:'var(--muted)', needs_review:'var(--accent)' };
const LABEL_BG     = { expense:'rgba(224,112,112,0.1)', income:'rgba(93,184,125,0.1)', ignore:'rgba(255,255,255,0.04)', needs_review:'rgba(124,131,253,0.1)' };

async function loadTxns() {
  const tbody = document.getElementById('txn-body');
  tbody.innerHTML = _skeletonRows(8, 6);

  const params = new URLSearchParams();
  const label    = document.getElementById('filter-label').value;
  const category = document.getElementById('filter-category').value;
  const status   = document.getElementById('filter-status').value;
  const from     = document.getElementById('filter-from').value;
  const to       = document.getElementById('filter-to').value;
  if (label)    params.set('label', label);
  if (category) params.set('category', category);
  if (status)   params.set('status', status);
  if (from)     params.set('date_from', from);
  if (to)       params.set('date_to', to);

  const txns = await fetch('/api/transactions?' + params).then(r => r.json());
  document.getElementById('txn-count').textContent = txns.length + ' transaction' + (txns.length !== 1 ? 's' : '');

  const lbl = (t) => t.status === 'needs_review' ? 'needs_review' : (t.label || 'ignore');
  tbody.innerHTML = txns.map((t, i) => {
    const l = lbl(t);
    const badgeLabel = l === 'needs_review' ? 'review' : l;
    return `<tr class="lbl-${l} anim-row" style="--i:${Math.min(i,20)}"
      data-id="${_esc(t.id)}"
      data-label="${_esc(t.label)}"
      data-category="${_esc(t.category||'')}"
      data-amount="${t.amount ?? ''}"
      data-notes="${_esc(t.user_notes||'')}"
    >
      <td style="color:var(--muted);font-size:12px">${_esc(t.txn_date || (t.email?.received_at ? t.email.received_at.slice(0,10) : '—'))}</td>
      <td style="font-weight:500;color:var(--text)">${_esc(t.merchant || '—')}</td>
      <td style="color:var(--muted)">${_esc(t.category || '—')}</td>
      <td style="text-align:right;color:${LABEL_COLOR[l]};font-weight:${t.amount != null ? '600' : '400'}">${t.amount != null ? '₹' + Number(t.amount).toLocaleString('en-IN') : '—'}</td>
      <td><span class="badge ${l === 'needs_review' ? 'review' : l}">${badgeLabel}</span></td>
      <td><button class="edit-btn" onclick="openEditModal(this)" title="Edit">✎</button></td>
    </tr>`;
  }).join('') || '<tr><td colspan="6" style="color:var(--muted);padding:24px;text-align:center">No transactions</td></tr>';

  _attachHoverListeners();
}

loadTxns();
</script>
{% endblock %}
```

- [ ] **Step 2: Commit**

```bash
git add templates/transactions.html
git commit -m "feat: restyle transactions page with glass table and skeleton load"
```

---

## Task 5: Review Page — Card Stack

**Files:**
- Modify: `templates/review.html`

Key additions: glass cards, slide-out on confirm, keyboard shortcuts (E=expense, I=income, S=ignore, Enter=confirm focused card).

- [ ] **Step 1: Update the `<style>` block in `templates/review.html`**

Replace the entire `<style>` block (lines 30–53 in original) with:

```css
<style>
  .review-card { margin-bottom: 14px; }
  .review-snippet {
    color: var(--muted); font-size: 13px; margin-bottom: 16px;
    line-height: 1.6; padding: 10px 12px;
    background: rgba(255,255,255,0.03);
    border-radius: var(--r-sm); border-left: 3px solid var(--border);
  }
  .label-btns { display: flex; gap: 8px; margin-bottom: 12px; }
  .label-btn {
    flex: 1; padding: 9px 0; border: 1px solid var(--border);
    border-radius: var(--r-sm); cursor: pointer; font-size: 13px;
    font-weight: 600; background: var(--bg-card); color: var(--muted);
    transition: all .15s;
  }
  .label-btn:hover { border-color: rgba(255,255,255,0.15); color: var(--text); }
  .label-btn.active-expense { border-color: var(--red);   background: rgba(224,112,112,0.1); color: var(--red); }
  .label-btn.active-income  { border-color: var(--green); background: rgba(93,184,125,0.1);  color: var(--green); }
  .label-btn.active-ignore  { border-color: var(--muted); background: rgba(255,255,255,0.04); color: #888; }
  .field-row { display: flex; gap: 10px; align-items: flex-end; flex-wrap: wrap; margin-bottom: 12px; }
  .field-group { display: flex; flex-direction: column; gap: 4px; }
  .field-label { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: .4px; }
  .amount-wrap { display: none; }
  .amount-wrap.visible { display: block; }
  .cat-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
  .cat-chip {
    padding: 3px 10px; border-radius: 20px;
    border: 1px solid var(--border); background: transparent;
    color: var(--muted); cursor: pointer; font-size: 12px; transition: all .12s;
  }
  .cat-chip:hover { border-color: rgba(255,255,255,0.15); color: var(--text); }
  .cat-chip.active { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); }
  .batch-banner {
    background: var(--bg-card); border: 1px solid var(--border);
    border-radius: var(--r-sm); padding: 10px 14px; margin-bottom: 12px;
    display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: var(--muted);
  }
  .batch-btns { display: flex; gap: 8px; }
  .batch-btn {
    padding: 4px 12px; border-radius: var(--r-sm);
    border: 1px solid var(--border-act); background: transparent;
    color: var(--accent); cursor: pointer; font-size: 12px; transition: background .12s;
  }
  .batch-btn:hover { background: var(--accent-soft); }
  .ai-hint { font-size: 11px; color: var(--dim); margin-bottom: 8px; }

  /* Slide-out animation for confirmed cards */
  @keyframes cardOut {
    from { opacity: 1; transform: translateX(0); max-height: 400px; margin-bottom: 14px; }
    to   { opacity: 0; transform: translateX(60px); max-height: 0; margin-bottom: 0; overflow: hidden; }
  }
  .card-removing { animation: cardOut 250ms ease both; pointer-events: none; }

  /* Keyboard focus ring on cards */
  .review-card:focus-within .glass-header { border-color: rgba(124,131,253,0.3); }
</style>
```

- [ ] **Step 2: Update `_renderCard` to use glass classes**

Replace `_renderCard` function. The outer div changes from `class="card review-card"` to `class="glass review-card"`, and `card-header` to `glass-header`:

```js
function _renderCard(t) {
  const hasBatch = t.domain_count > 0 && t.email.sender_domain;
  const aiLabel = t.confidence > 0
    ? `AI classified as <strong>${t.label}</strong> (${Math.round(t.confidence * 100)}% confidence)`
    : 'No AI classification';
  const gmailHref = /^https?:\/\//.test(t.email.gmail_link || '') ? t.email.gmail_link : '#';

  return `<div class="glass review-card" id="review-${t.id}">
    <div class="glass-header">
      <div>
        <strong style="color:var(--text)">${_esc(t.email.subject || '(no subject)')}</strong>
        <span style="color:var(--muted);font-size:12px;margin-left:10px">${_esc(t.email.sender || '')}</span>
        <span style="color:var(--dim);font-size:12px;margin-left:8px">${t.email.received_at ? t.email.received_at.slice(0,10) : ''}</span>
      </div>
      <a href="${_esc(gmailHref)}" target="_blank" class="link" style="font-size:12px">Gmail ↗</a>
    </div>
    <div style="padding:14px 16px">
      ${t.email.body_snippet ? `<div class="review-snippet">${_esc(t.email.body_snippet)}</div>` : ''}
      <div class="ai-hint">${aiLabel}</div>

      ${hasBatch ? `<div class="batch-banner">
        <span>${t.domain_count} more from <code style="color:var(--accent)">${_esc(t.email.sender_domain)}</code></span>
        <div class="batch-btns">
          <button class="batch-btn" onclick="batchAction('ignore_domain','${_esc(t.email.sender_domain)}',null,'${t.id}')">Ignore all</button>
          <button class="batch-btn" onclick="batchAction('expense_domain','${_esc(t.email.sender_domain)}',null,'${t.id}')">Expense all</button>
        </div>
      </div>` : ''}

      <div style="margin-bottom:10px">
        <button type="button" class="btn-ghost" style="padding:5px 14px;font-size:12px" id="reprocess-${t.id}" onclick="reprocess('${t.id}')">↻ Reprocess</button>
        <span id="reprocess-msg-${t.id}" style="font-size:12px;margin-left:10px"></span>
      </div>

      <div class="label-btns">
        <button type="button" class="label-btn" id="lbl-expense-${t.id}" onclick="selectLabel('${t.id}','expense')">Expense</button>
        <button type="button" class="label-btn" id="lbl-income-${t.id}"  onclick="selectLabel('${t.id}','income')">Income</button>
        <button type="button" class="label-btn" id="lbl-ignore-${t.id}"  onclick="selectLabel('${t.id}','ignore')">Ignore</button>
      </div>

      <div class="cat-chips" id="chips-${t.id}">
        ${CATEGORIES.map(c => `<button type="button" class="cat-chip${t.category === c ? ' active' : ''}" onclick="selectCat('${t.id}','${c}')">${c}</button>`).join('')}
        <input type="text" id="custom-cat-${t.id}" placeholder="Custom…" style="width:100px;padding:3px 8px;font-size:12px" oninput="selectCat('${t.id}',this.value)">
      </div>

      <div class="field-row">
        <div class="field-group amount-wrap" id="amt-wrap-${t.id}">
          <label class="field-label">Amount (₹)</label>
          <input type="number" step="0.01" min="0" id="amt-${t.id}" value="${t.amount ?? ''}" style="width:160px" placeholder="0.00">
        </div>
        <div style="align-self:flex-end">
          <button class="btn-primary" onclick="submitCorrection('${t.id}')" id="submit-${t.id}" disabled>Confirm</button>
        </div>
      </div>
    </div>
  </div>`;
}
```

- [ ] **Step 3: Update `submitCorrection` to slide card out instead of `.remove()`**

Replace the `document.getElementById('review-' + id).remove();` line with:

```js
  const cardEl = document.getElementById('review-' + id);
  cardEl.classList.add('card-removing');
  cardEl.addEventListener('animationend', function() {
    cardEl.remove();
    _items = _items.filter(t => t.id !== id);
    const countEl = document.getElementById('review-count-label');
    if (_items.length === 0) {
      document.getElementById('review-list').innerHTML = '<div style="color:var(--muted);padding:40px;text-align:center;font-size:14px">All clear ✓</div>';
      countEl.textContent = '';
    } else {
      countEl.textContent = `${_items.length} email${_items.length > 1 ? 's' : ''} to review`;
    }
  }, { once: true });
```

Also remove `showToast('Confirmed', 'success');` call by adding it just before the cardEl animation code:
```js
  showToast('Saved', 'success');
```

- [ ] **Step 4: Add keyboard shortcuts at bottom of the `<script>` block (before `loadReview()`)**

```js
// Keyboard shortcuts: E=expense, I=income, S=ignore, Enter=confirm first pending card
document.addEventListener('keydown', function(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  const firstId = _items[0]?.id;
  if (!firstId) return;
  if (e.key === 'e' || e.key === 'E') { e.preventDefault(); selectLabel(firstId, 'expense'); }
  if (e.key === 'i' || e.key === 'I') { e.preventDefault(); selectLabel(firstId, 'income'); }
  if (e.key === 's' || e.key === 'S') { e.preventDefault(); selectLabel(firstId, 'ignore'); }
  if (e.key === 'Enter') {
    e.preventDefault();
    const btn = document.getElementById('submit-' + firstId);
    if (btn && !btn.disabled) btn.click();
  }
});
```

- [ ] **Step 5: Add `{% block page_name %}review{% endblock %}` at top of the template**

Add after `{% extends "base.html" %}`:
```
{% block page_name %}review{% endblock %}
```

- [ ] **Step 6: Update bulk-progress card to use glass classes**

Change the inner `class="card"` in the bulk progress section to `class="glass"`.

- [ ] **Step 7: Commit**

```bash
git add templates/review.html
git commit -m "feat: review page glass cards, slide-out confirm, keyboard shortcuts E/I/S/Enter"
```

---

## Task 6: Recurring + Budgets Restyle

**Files:**
- Modify: `templates/recurring.html`
- Modify: `templates/budgets.html`

- [ ] **Step 1: Update `templates/recurring.html` — add page_name block and restyle**

After `{% extends "base.html" %}`, add:
```
{% block page_name %}recurring{% endblock %}
```

Replace the outer wrapping `class="card"` divs with `class="glass"`, and replace `class="card-header"` with `class="glass-header"`.

Specifically:
- Line 9: `<div class="card" style="margin-bottom:20px">` → `<div class="glass" style="margin-bottom:20px">`
- Line 10: `<div class="card-header">Add Recurring Expense</div>` → `<div class="glass-header">Add Recurring Expense</div>`
- Line 48: `<div class="card">` → `<div class="glass">`
- Line 49: `<div class="card-header">All Recurring Expenses</div>` → `<div class="glass-header">All Recurring Expenses</div>`

Replace the `<style>` block with:
```css
<style>
  .rec-table { width:100%; border-collapse:collapse; font-size:13px; }
  .rec-table th { color:var(--muted); text-align:left; padding:8px 14px; border-bottom:1px solid var(--border); font-weight:500; font-size:11px; text-transform:uppercase; letter-spacing:.4px; }
  .rec-table td { padding:10px 14px; border-bottom:1px solid rgba(255,255,255,0.04); }
  .rec-table tr:last-child td { border-bottom:none; }
  .rec-table tbody tr:hover td { background:rgba(255,255,255,0.03); }
  .freq-badge { font-size:11px; padding:2px 9px; border-radius:20px; font-weight:600; }
  .freq-badge.monthly { background:var(--accent-soft); color:var(--accent); }
  .freq-badge.weekly  { background:rgba(93,184,125,0.12); color:var(--green); }
  .freq-badge.yearly  { background:rgba(224,112,112,0.1); color:var(--red); }
  .inactive-row td { opacity:.4; }
  .del-btn { background:none; border:none; color:var(--dim); cursor:pointer; font-size:16px; padding:2px 6px; border-radius:4px; }
  .del-btn:hover { background:rgba(224,112,112,0.1); color:var(--red); }
</style>
```

Update the `addRecurring` success/error feedback to use `showToast`:
- Replace `msg.style.color = '#5db87d'; msg.textContent = 'Added!';` with `showToast('Added!', 'success');`
- Replace `msg.style.color = '#e07070'; msg.textContent = err.detail || 'Error';` with `showToast(err.detail || 'Error', 'error');`
- Remove the `setTimeout` that clears `msg.textContent`
- Remove `<span id="rec-msg" ...>` from the form HTML (no longer needed)

- [ ] **Step 2: Update `templates/budgets.html` — add page_name + glass cards + animated bars**

After `{% extends "base.html" %}`, add:
```
{% block page_name %}budgets{% endblock %}
```

Replace `class="card"` with `class="glass"` throughout.

Replace the table-based budget display with glass progress cards. Change `renderTable` function:

```js
function renderTable() {
  var tbody = document.getElementById('budgets-body');
  if (!_budgets.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="color:var(--muted);padding:24px;text-align:center">No budgets yet.</td></tr>';
    return;
  }
  tbody.innerHTML = _budgets.map(function(b) {
    var color = b.pct >= 100 ? 'var(--red)' : b.pct >= 70 ? 'var(--amber)' : 'var(--green)';
    var pctW = Math.min(b.pct, 100).toFixed(1);
    return '<tr id="row-' + b.id + '">' +
      '<td style="font-weight:500;color:var(--text)">' + _esc(b.category) + '</td>' +
      '<td>' +
        '<span id="limit-display-' + b.id + '">₹' + b.monthly_limit.toLocaleString('en-IN') + '</span>' +
        '<input id="limit-input-' + b.id + '" type="number" min="1"' +
        ' style="display:none;width:100px"' +
        ' value="' + b.monthly_limit + '"' +
        ' onkeydown="if(event.key===\'Enter\')saveBudget(' + b.id + ')"' +
        ' onblur="saveBudget(' + b.id + ')">' +
      '</td>' +
      '<td style="color:' + color + ';font-weight:600">₹' + b.spent_this_month.toLocaleString('en-IN') + '</td>' +
      '<td style="min-width:120px">' +
        '<div style="display:flex;align-items:center;gap:8px">' +
          '<span style="color:' + color + ';font-weight:700;width:38px">' + b.pct.toFixed(1) + '%</span>' +
          '<div class="budget-bar-track" style="flex:1"><div class="budget-bar-fill" style="--pct:' + pctW + '%;background:' + color + '"></div></div>' +
        '</div>' +
      '</td>' +
      '<td>' +
        '<button onclick="editBudget(' + b.id + ')" class="btn-ghost" style="padding:3px 10px;font-size:12px;margin-right:6px">Edit</button>' +
        '<button onclick="deleteBudget(' + b.id + ')" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:12px;padding:3px 6px">Delete</button>' +
      '</td>' +
    '</tr>';
  }).join('');
}
```

- [ ] **Step 3: Commit**

```bash
git add templates/recurring.html templates/budgets.html
git commit -m "feat: glass cards for recurring + budgets, animated progress bars"
```

---

## Task 7: Settings Restyle

**Files:**
- Modify: `templates/settings.html`

- [ ] **Step 1: Add page_name block and replace card classes in `templates/settings.html`**

After `{% extends "base.html" %}`, add:
```
{% block page_name %}settings{% endblock %}
```

Global replacements in the file:
- `class="card"` → `class="glass"`
- `class="card-header"` → `class="glass-header"`

- [ ] **Step 2: Update the `<style>` block in settings.html**

Replace the `<style>` block with:
```css
<style>
  .filter-btn { padding:6px 16px; border:1px solid var(--border); border-radius:20px; background:var(--bg-card); color:var(--muted); cursor:pointer; font-size:13px; transition:all .15s; }
  .filter-btn:hover { border-color:var(--accent); color:var(--text); }
  .filter-btn.active { border-color:var(--accent); background:var(--accent-soft); color:var(--accent); }
  .llm-table { width:100%; border-collapse:collapse; font-size:13px; }
  .llm-table th { color:var(--muted); text-align:left; padding:7px 12px; border-bottom:1px solid var(--border); font-weight:500; font-size:11px; text-transform:uppercase; letter-spacing:.4px; }
  .llm-table td { padding:9px 12px; border-bottom:1px solid rgba(255,255,255,0.04); vertical-align:middle; }
  .llm-table tr:last-child td { border-bottom:none; }
  .llm-table tr.unavailable td { opacity:.5; }
  .llm-dot { width:8px; height:8px; border-radius:50%; display:inline-block; flex-shrink:0; }
  .llm-dot.ok { background:var(--green); } .llm-dot.limited { background:var(--amber); } .llm-dot.off { background:#3a3a5a; }
  .priority-badge { display:inline-flex; align-items:center; justify-content:center; width:22px; height:22px; border-radius:50%; font-size:11px; font-weight:700; }
  .priority-badge.p1 { background:var(--accent-soft); color:var(--accent); border:1px solid rgba(124,131,253,0.3); }
  .priority-badge.p2 { background:rgba(93,184,125,0.12); color:var(--green); border:1px solid rgba(93,184,125,0.3); }
  .priority-badge.pn { background:rgba(255,255,255,0.04); color:var(--muted); border:1px solid var(--border); }
  .priority-badge.unavail { background:rgba(255,255,255,0.02); color:var(--dim); border:1px solid rgba(255,255,255,0.04); }
  .score-bar-wrap { width:80px; height:5px; background:rgba(255,255,255,0.06); border-radius:3px; display:inline-block; vertical-align:middle; overflow:hidden; }
  .score-bar-fill { height:5px; border-radius:3px; background:var(--amber); }
  .rules-table { width:100%; border-collapse:collapse; font-size:13px; }
  .rules-table th { color:var(--muted); text-align:left; padding:6px 10px; border-bottom:1px solid var(--border); font-weight:500; font-size:11px; text-transform:uppercase; letter-spacing:.4px; }
  .rules-table td { padding:8px 10px; border-bottom:1px solid rgba(255,255,255,0.04); }
  .rules-table tr:last-child td { border-bottom:none; }
  .del-btn { background:none; border:none; color:var(--dim); cursor:pointer; font-size:16px; padding:2px 6px; border-radius:4px; }
  .del-btn:hover { background:rgba(224,112,112,0.1); color:var(--red); }
  .source-tag { font-size:10px; font-weight:600; padding:1px 6px; border-radius:3px; text-transform:uppercase; letter-spacing:.4px; }
  .source-tag.user_trained { background:var(--accent-soft); color:var(--accent); border:1px solid rgba(124,131,253,0.2); }
  .source-tag.builtin { background:rgba(255,255,255,0.04); color:var(--dim); border:1px solid rgba(255,255,255,0.06); }
  .empty-state { color:var(--dim); font-size:13px; padding:12px 0; }
</style>
```

- [ ] **Step 3: Update `setFilter` to show toast on save (replace inline `filter-msg` span)**

In `setFilter` function, replace:
```js
    const msg = document.getElementById('filter-msg');
    msg.style.color = '#5db87d';
    msg.textContent = 'Saved';
    setTimeout(() => { msg.textContent = ''; }, 2000);
```
with:
```js
    showToast('Filter saved', 'success');
```

Remove `<span id="filter-msg" style="font-size:12px"></span>` from the template HTML.

- [ ] **Step 4: Update `addRule` success/error to use showToast**

Replace:
```js
    msg.style.color = '#5db87d';
    msg.textContent = `Rule saved for ${domain}`;
    ...
    msg.style.color = '#e07070';
    msg.textContent = err.detail || 'Error saving rule';
```
with:
```js
    showToast(`Rule saved for ${domain}`, 'success');
    ...
    showToast(err.detail || 'Error saving rule', 'error');
```

Remove `<span id="rule-msg" ...>` from the form HTML.

- [ ] **Step 5: Commit**

```bash
git add templates/settings.html
git commit -m "feat: settings glass sections, toast feedback replaces inline status spans"
```

---

## Task 8: Final Polish + Verification

**Files:** None — verification only

- [ ] **Step 1: Start the full app and run through all pages**

```bash
uvicorn app.main:app --reload
```

Check each page:
- `http://localhost:8000` — sidebar active on Dashboard, stat cards count up, activity feed loads, budget sidebar shows
- `http://localhost:8000/transactions` — glass table, filters work, edit modal opens, hover tooltip appears
- `http://localhost:8000/review` — glass cards, keyboard E/I/S/Enter works, card slides out on confirm
- `http://localhost:8000/recurring` — glass list, add form works
- `http://localhost:8000/budgets` — glass table, animated bars, edit inline works
- `http://localhost:8000/settings` — glass sections, filter saves show toast, rule adds show toast

- [ ] **Step 2: Verify sidebar active state on each page**

Navigate to each page — the correct nav item should be highlighted with `active` class (accent background, white text).

- [ ] **Step 3: Verify no console errors on any page**

Open browser DevTools → Console. No red errors on any page.

- [ ] **Step 4: Verify Sync Now button still works**

Click "↻ Sync Now" in sidebar. Sync panel should appear bottom-right with progress animation.

- [ ] **Step 5: Commit final check**

```bash
git add -A
git status  # should be clean or only show already-committed changes
git log --oneline -8
```

Expected recent commits:
```
feat: settings glass sections, toast feedback replaces inline status spans
feat: glass cards for recurring + budgets, animated progress bars
feat: review page glass cards, slide-out confirm, keyboard shortcuts E/I/S/Enter
feat: restyle transactions page with glass table and skeleton load
feat: activity-led dashboard redesign with glass cards and count-up stats
feat: add countUp, showToast, skeletonRows utilities to app.js
feat: design system + sidebar layout (styles.css + base.html)
```
