# Product

## Register

product

## Users

Individuals tracking personal expenses and finances. Primary context: desktop browser, reviewing Gmail transactions, categorizing spending, checking dashboards. Users are typically managing their own money and want a quick, clear picture without financial-jargon friction.

## Product Purpose

MoneyFlow turns Gmail purchase receipts into an organized expense dashboard. It parses transaction emails, classifies them using AI or rules, and presents a clear inbox-to-dashboard flow. Success means the user can understand their monthly spending in under 30 seconds.

## Brand Personality

Warm, Minimal, Approachable. Finance that feels friendly — like a well-organized notebook, not a corporate banking portal.

## Anti-references

No generic dark startup dashboard aesthetic: avoid glow orbs, purple gradients, glassmorphism overlays, and the "dark mode SaaS" template. The UI should feel intentional and warm, not templated.

## Design Principles

1. **Clarity over density** — financial data is stressful enough. Every screen should answer one question without noise.
2. **Earned familiarity** — use standard patterns (inbox list, sidebar nav, detail panel). Don't reinvent affordances for flavor.
3. **Warmth through restraint** — a few warm accent touches, not decorative gradients or glowing backgrounds. Color serves information, not atmosphere.
4. **Mobile-respectful** — the core inbox + detail flow must work on narrow viewports without losing context.
5. **Accessibility is not optional** — WCAG AA contrast, keyboard navigation, screen-reader-friendly labels throughout.

## Accessibility & Inclusion

WCAG AA as baseline. Focus indicators on all interactive elements (`focus-ring` class), semantic landmarks (`role="navigation"`, `role="main"`), aria-live regions for dynamic content (sync progress, search results), and touch targets ≥44px for mobile.
