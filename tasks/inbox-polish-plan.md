# Inbox Viewer Polish Plan

Date: 2026-05-26
Source: Comparative report from impeccable + design-taste-frontend skill reviews

## Priority Items

### P0: Reduce render thrash

- [ ] P0.1 Wrap `Row` with `React.memo` — compare on tx.id, selected, selectMode
- [ ] P0.2 Wrap `ReviewEmailRow` with `React.memo`
- [ ] P0.3 Wrap `IncomeRow` with `React.memo`
- [ ] P0.4 Move inline row style objects to `inboxStyles` lookup or CSS classes

### P1: Motion & micro-interaction (M=6 target)

- [ ] P1.1 Add staggered row entrance via CSS animation-delay cascade
- [ ] P1.2 Add spring-like scale[0.98] on button active state
- [ ] P1.3 Animate category chip dot on mount (spring expand)

### P2: Visual polish

- [ ] P2.1 Replace Fraunces serif in ReviewDetailPanel subject → Geist weight contrast
- [ ] P2.2 Add proper focus-ring to all interactive elements consistently
- [ ] P2.3 Negative amounts use `var(--neg)` instead of `var(--ink)`
