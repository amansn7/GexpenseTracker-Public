# MoneyFlow Date Range Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract a shared `DateRangeControl` component, use it in DashboardView, and fix FlowView to self-fetch date-filtered data instead of showing all-time static data.

**Architecture:** `DateRangeControl` is a stateless UI component added to `shell.jsx` that fires an `onChange(from, to, preset)` callback. Each consuming view (`DashboardView`, `FlowView`) owns its own `rangeFrom`/`rangeTo` state and fetching logic. `FlowView` is refactored to self-fetch from `/api/stats/summary` and `/api/stats/category-breakdown` with date params, matching the pattern already used by `DashboardView`.

**Tech Stack:** React (inline JSX, no bundler), Babel in browser, FastAPI backend (already has `date_from`/`date_to` params on all stat endpoints).

---

## File Structure

| File | Change |
|------|--------|
| `static/src/shell.jsx` | Add `DateRangeControl` component; export via `window` |
| `static/src/dashboard.jsx` | Replace inline date range block (lines 94–127) with `<DateRangeControl>` |
| `static/src/flow.jsx` | Make `FlowView` self-fetching; replace "Month/Quarter/Year" buttons with `<DateRangeControl>`; fix hardcoded KPI subtexts |
| `static/src/app.jsx` | Remove `flowSummary` state, its setter, and the `flowSummary &&` guard on `FlowView` |

---

## Task 1: Add `DateRangeControl` to shell.jsx

**Files:**
- Modify: `static/src/shell.jsx` (end of file, line 126)

The component is stateless — it takes `rangeFrom`, `rangeTo`, `activePreset`, and `onChange(from, to, preset)` as props. It renders 4 preset chips and 2 date inputs. The `onChange` callback is always called with all three values; `preset` is `null` when a date input changes directly.

- [ ] **Step 1: Add `DateRangeControl` just before the `Object.assign` line at the bottom of `shell.jsx`**

In `static/src/shell.jsx`, find the last line:
```javascript
Object.assign(window, { Sidebar, Topbar, shellStyles });
```

Insert the following block immediately above it:

```jsx
const DateRangeControl = ({ rangeFrom, rangeTo, activePreset, onChange }) => {
  const fmt = d => d.toISOString().slice(0, 10);
  const presets = [["7d", 7], ["30d", 30], ["90d", 90], ["1y", 365]];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      {presets.map(([label, days]) => (
        <button
          key={label}
          onClick={() => {
            const end = new Date();
            const start = new Date(); start.setDate(end.getDate() - days + 1);
            onChange(fmt(start), fmt(end), label);
          }}
          style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid var(--line)", background: activePreset === label ? "var(--ink)" : "var(--card)", color: activePreset === label ? "var(--paper)" : "var(--ink-2)", fontSize: 12, fontWeight: 500, cursor: "pointer" }}
        >{label}</button>
      ))}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 8 }}>
        <input
          type="date"
          value={rangeFrom}
          max={rangeTo}
          onChange={e => onChange(e.target.value, rangeTo, null)}
          style={{ border: "1px solid var(--line)", borderRadius: 6, padding: "5px 8px", fontSize: 12, background: "var(--card)", color: "var(--ink)" }}
        />
        <span style={{ color: "var(--ink-4)", fontSize: 12 }}>→</span>
        <input
          type="date"
          value={rangeTo}
          min={rangeFrom}
          onChange={e => onChange(rangeFrom, e.target.value, null)}
          style={{ border: "1px solid var(--line)", borderRadius: 6, padding: "5px 8px", fontSize: 12, background: "var(--card)", color: "var(--ink)" }}
        />
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Export `DateRangeControl` via `window`**

Update the `Object.assign` line at the bottom of `shell.jsx`:
```javascript
Object.assign(window, { Sidebar, Topbar, shellStyles, DateRangeControl });
```

- [ ] **Step 3: Verify no syntax errors**

Run: `python -m py_compile app/main.py && echo OK`
Expected: `OK`

(Frontend syntax errors only surface in the browser; we verify visually in Task 2.)

- [ ] **Step 4: Commit**

```bash
git add static/src/shell.jsx
git commit -m "feat: add shared DateRangeControl component to shell"
```

---

## Task 2: Refactor DashboardView to use `DateRangeControl`

**Files:**
- Modify: `static/src/dashboard.jsx` (lines 94–127)

The inline date range block (preset buttons + date inputs + loading indicator) is replaced with `<DateRangeControl>` plus a loading indicator span beside it. State vars (`rangeFrom`, `rangeTo`, `activePreset`, `setRangeFrom`, `setRangeTo`, `setActivePreset`) remain exactly the same — only the JSX changes.

- [ ] **Step 1: Replace the inline date range block in `dashboard.jsx`**

Find this block in `static/src/dashboard.jsx` (lines 94–127):
```jsx
      {/* Date range controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
        {[["7d",7],["30d",30],["90d",90],["1y",365]].map(([label, days]) => (
          <button
            key={label}
            onClick={() => {
              const end = new Date();
              const start = new Date(); start.setDate(end.getDate() - days + 1);
              const fmt = d => d.toISOString().slice(0,10);
              setRangeFrom(fmt(start));
              setRangeTo(fmt(end));
              setActivePreset(label);
            }}
            style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid var(--line)", background: activePreset===label ? "var(--ink)" : "var(--card)", color: activePreset===label ? "var(--paper)" : "var(--ink-2)", fontSize: 12, fontWeight: 500, cursor: "pointer" }}
          >{label}</button>
        ))}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 8 }}>
          <input
            type="date"
            value={rangeFrom}
            max={rangeTo}
            onChange={e => { setRangeFrom(e.target.value); setActivePreset(null); }}
            style={{ border: "1px solid var(--line)", borderRadius: 6, padding: "5px 8px", fontSize: 12, background: "var(--card)", color: "var(--ink)" }}
          />
          <span style={{ color: "var(--ink-4)", fontSize: 12 }}>→</span>
          <input
            type="date"
            value={rangeTo}
            min={rangeFrom}
            onChange={e => { setRangeTo(e.target.value); setActivePreset(null); }}
            style={{ border: "1px solid var(--line)", borderRadius: 6, padding: "5px 8px", fontSize: 12, background: "var(--card)", color: "var(--ink)" }}
          />
        </div>
        {statsLoading && <span style={{ fontSize: 11, color: "var(--ink-4)", fontFamily: "'Geist Mono', monospace" }}>Loading…</span>}
      </div>
```

Replace with:
```jsx
      {/* Date range controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 18, flexWrap: "wrap" }}>
        <DateRangeControl
          rangeFrom={rangeFrom}
          rangeTo={rangeTo}
          activePreset={activePreset}
          onChange={(f, t, p) => { setRangeFrom(f); setRangeTo(t); setActivePreset(p); }}
        />
        {statsLoading && <span style={{ fontSize: 11, color: "var(--ink-4)", fontFamily: "'Geist Mono', monospace" }}>Loading…</span>}
      </div>
```

- [ ] **Step 2: Start the dev server and verify Dashboard still works**

Run: `uvicorn app.main:app --reload --port 8000`

Open http://localhost:8000 → navigate to Dashboard tab.
Expected:
- Preset chips (7d/30d/90d/1y) render correctly, "30d" highlighted
- Date inputs show correct from/to dates
- Clicking "7d" updates the date range and refreshes the stats
- Editing a date input deselects the active preset and refreshes stats

- [ ] **Step 3: Commit**

```bash
git add static/src/dashboard.jsx
git commit -m "refactor: dashboard uses shared DateRangeControl"
```

---

## Task 3: Fix FlowView — self-fetching + DateRangeControl + KPI fixes

**Files:**
- Modify: `static/src/flow.jsx`

`FlowView`'s signature changes from `({ flow, transactions })` to `({ transactions })`. It gains its own state, a debounced fetch effect (identical pattern to `DashboardView`), and builds `flow` internally from the fetched stats. The "Month/Quarter/Year" static buttons are replaced with `<DateRangeControl>`. Hardcoded KPI subtexts are computed from live data.

- [ ] **Step 1: Replace the entire `FlowView` function in `flow.jsx`**

Find:
```javascript
const FlowView = ({ flow, transactions }) => {
```
through to the closing `};` of the function (lines 180–235).

Replace the entire `FlowView` function with:

```jsx
const FlowView = ({ transactions }) => {
  const todayStr = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgo = (() => {
    const d = new Date(); d.setDate(d.getDate() - 29);
    return d.toISOString().slice(0, 10);
  })();

  const [rangeFrom, setRangeFrom] = React.useState(thirtyDaysAgo);
  const [rangeTo, setRangeTo] = React.useState(todayStr);
  const [activePreset, setActivePreset] = React.useState("30d");
  const [stats, setStats] = React.useState(null);
  const [catBreakdown, setCatBreakdown] = React.useState(null);
  const [flowLoading, setFlowLoading] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      setFlowLoading(true);
      try {
        const [s, c] = await Promise.all([
          API.get(`/api/stats/summary?date_from=${rangeFrom}&date_to=${rangeTo}`),
          API.get(`/api/stats/category-breakdown?date_from=${rangeFrom}&date_to=${rangeTo}`),
        ]);
        if (!cancelled) { setStats(s); setCatBreakdown(c); }
      } catch (_) {}
      if (!cancelled) setFlowLoading(false);
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [rangeFrom, rangeTo]);

  const rangeTxs = transactions.filter(t => t.date >= rangeFrom && t.date <= rangeTo);
  const flow = stats && catBreakdown ? buildFlowSummary(rangeTxs, stats, catBreakdown) : null;

  const totalIncome = flow ? flow.income.reduce((a, i) => a + i.amount, 0) : 0;
  const totalExpense = flow ? flow.expenses.reduce((a, e) => a + e.amount, 0) : 0;
  const savingsRate = totalIncome > 0 ? ((totalIncome - totalExpense) / totalIncome * 100).toFixed(1) : "0.0";
  const rangeDays = Math.max(1, Math.round((new Date(rangeTo) - new Date(rangeFrom)) / 86400000) + 1);
  const daily = flow ? Math.round(totalExpense / rangeDays) : 0;
  const incomeSources = flow ? flow.income.length : 0;
  const pctOfIncome = totalIncome > 0 ? Math.round(totalExpense / totalIncome * 100) : 0;

  return (
    <div style={flowStyles.wrap}>
      <div style={flowStyles.kpis}>
        <div style={flowStyles.kpi}>
          <div style={flowStyles.kpiLabel}>Income</div>
          <div style={{ ...flowStyles.kpiValue, color: "var(--pos)" }} title={`₹${totalIncome.toLocaleString("en-IN")}`}>{fmtK(totalIncome)}</div>
          <div style={flowStyles.kpiSub}><Icon name="trend-u" size={11}/> {incomeSources} source{incomeSources !== 1 ? "s" : ""}</div>
        </div>
        <div style={flowStyles.kpi}>
          <div style={flowStyles.kpiLabel}>Spent</div>
          <div style={flowStyles.kpiValue} title={`₹${totalExpense.toLocaleString("en-IN")}`}>{fmtK(totalExpense)}</div>
          <div style={flowStyles.kpiSub}><Icon name="trend-d" size={11}/> {pctOfIncome}% of income</div>
        </div>
        <div style={flowStyles.kpi}>
          <div style={flowStyles.kpiLabel}>Remaining</div>
          <div style={{ ...flowStyles.kpiValue, color: "var(--pos)" }} title={`₹${(flow?.savings ?? 0).toLocaleString("en-IN")}`}>{fmtK(flow?.savings ?? 0)}</div>
          <div style={flowStyles.kpiSub}>{savingsRate}% savings rate</div>
        </div>
        <div style={flowStyles.kpi}>
          <div style={flowStyles.kpiLabel}>Daily burn</div>
          <div style={flowStyles.kpiValue}>{fmtK(daily)}</div>
          <div style={flowStyles.kpiSub}>over {rangeDays} day{rangeDays !== 1 ? "s" : ""}</div>
        </div>
      </div>

      <div style={flowStyles.sectionTitle}>
        <div>
          <h2 style={flowStyles.h2}>How your money moved</h2>
          <div style={flowStyles.h2sub}>— traced from {rangeTxs.length} parsed emails</div>
        </div>
        <DateRangeControl
          rangeFrom={rangeFrom}
          rangeTo={rangeTo}
          activePreset={activePreset}
          onChange={(f, t, p) => { setRangeFrom(f); setRangeTo(t); setActivePreset(p); }}
        />
      </div>

      {flowLoading && (
        <div style={{ display: "flex", justifyContent: "center", padding: "60px 0", color: "var(--ink-4)", fontSize: 13, fontFamily: "'Fraunces', serif" }}>
          Loading…
        </div>
      )}

      {!flowLoading && flow && <SankeyDiagram data={flow}/>}

      {!flowLoading && flow && (
        <>
          <div style={flowStyles.sectionTitle}>
            <div>
              <h2 style={flowStyles.h2}>Weekly burn</h2>
              <div style={flowStyles.h2sub}>— when the money actually leaves</div>
            </div>
          </div>
          <WeeklyBurn data={flow}/>
        </>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Verify Money Flow page in browser**

With the dev server still running (or restart: `uvicorn app.main:app --reload --port 8000`):

Navigate to http://localhost:8000 → click "Money Flow" in the sidebar.

Expected:
- KPI cards show computed values (not hardcoded "2 sources", "48% of income", "over 18 days")
- `DateRangeControl` renders in the section header row, right-aligned, with "30d" highlighted
- Sankey diagram and WeeklyBurn chart reflect the selected 30-day range (not all-time data)
- Switching to "7d" preset updates all data
- Editing date inputs updates all data

- [ ] **Step 3: Commit**

```bash
git add static/src/flow.jsx
git commit -m "fix: FlowView self-fetching with date range control, computed KPIs"
```

---

## Task 4: Clean up app.jsx

**Files:**
- Modify: `static/src/app.jsx`

`flowSummary` state is now unused (FlowView is self-fetching). Remove it, its setter in `loadData`, and the `flowSummary &&` guard on the FlowView render.

- [ ] **Step 1: Remove `flowSummary` state declaration**

Find in `static/src/app.jsx`:
```javascript
  const [flowSummary, setFlowSummary] = useState(null);
```
Delete that line.

- [ ] **Step 2: Remove `setFlowSummary` call in `loadData`**

Find in `static/src/app.jsx`:
```javascript
      setFlowSummary(buildFlowSummary(txs, summary, catBreakdown));
```
Delete that line.

- [ ] **Step 3: Remove `flowSummary &&` guard and `flow=` prop from FlowView render**

Find:
```jsx
        {view === "flow"      && flowSummary && <FlowView flow={flowSummary} transactions={transactions}/>}
```
Replace with:
```jsx
        {view === "flow"      && <FlowView transactions={transactions}/>}
```

- [ ] **Step 4: Verify the app loads without errors**

With dev server running, open http://localhost:8000.

Expected:
- App loads normally (no JS console errors about `flowSummary` or missing `flow` prop)
- Inbox, Dashboard, and Money Flow tabs all work
- Money Flow tab shows the date range control and live data

- [ ] **Step 5: Commit**

```bash
git add static/src/app.jsx
git commit -m "fix: remove unused flowSummary state from App, FlowView now self-fetching"
```
