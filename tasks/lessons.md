# Lessons

## 2026-05-14 — UI Polish Commit Regressions

1. **Count parentheses when wrapping in higher-order functions**: Adding `React.memo()` to an existing component function adds one `(` but the closing `);` stays the same — need `));` to close both the HOC call and the implicit return.

2. **Don't assume external CSS is loaded**: `index.html` had all CSS variable definitions inline in `<style>`. Moving them to `styles.css` requires also adding `<link rel="stylesheet">` to `index.html`. `base.html` is a separate template — check the actual page's head section.

3. **Removing inline `background` from style objects**: When removing inline hover handlers and their companion default styles, check if the CSS class provides the default. `.nav-btn` lost `background: transparent` when it was stripped from the inline `navItem` style object — browser default button backgrounds are opaque.
