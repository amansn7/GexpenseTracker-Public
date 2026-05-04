# Admin Page UI Redesign

**Date:** 2026-05-04  
**Status:** Approved  
**Scope:** `static/src/admin.jsx` only

## Goal

Align the admin page visual language with the rest of the application (account.jsx / settings page pattern) through 5 targeted style changes. No functional changes. No section internal layout changes.

## Changes

### 1. Page header
Add a header above the sections matching the account.jsx kicker + h1 pattern:

```jsx
<div style={S.header}>
  <div style={S.kicker}>System</div>
  <h1 style={S.h1}>Admin</h1>
</div>
```

New tokens in `S`:
- `header`: `{ marginBottom: 28 }`
- `kicker`: `{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 500 }`
- `h1`: `{ fontFamily: "'Fraunces', serif", fontSize: 36, fontWeight: 400, letterSpacing: "-0.02em", margin: "4px 0 0", color: "var(--ink)" }`

### 2. sectionSub style
Change from plain muted text to italic Instrument Serif matching account.jsx:

```js
// Before
sectionSub: { fontSize: 12, color: "var(--ink-3)", marginBottom: 20 }

// After
sectionSub: { fontStyle: "italic", fontFamily: "'Instrument Serif', serif", fontSize: 14, color: "var(--ink-3)", marginBottom: 18 }
```

### 3. Section borderRadius
`10` → `8` (matches account.jsx sections)

### 4. Section marginBottom
`20` → `16` (matches account.jsx sections)

### 5. Page maxWidth and centering
`maxWidth: 1000` → `maxWidth: 920`, add `margin: "0 auto"` (matches account.jsx wrap)

## Out of Scope

- Section internal layouts (sync progress, fetch preview form, classifier form, LLM table, alerts list) — unchanged
- Collapsible/expandable sections — deferred
- Any backend changes

## Files Changed

- `static/src/admin.jsx` — S object tweaks + header JSX in AdminView
