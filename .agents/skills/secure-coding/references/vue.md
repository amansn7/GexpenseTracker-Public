# Vue — Secure Coding

Covers Vue 2.7 (final release), Vue 3.x (Composition API and Options API), Nuxt 2/3, Pinia, Vue Router. Frontend-only — for backend security, load the relevant backend reference.

Vue's templates auto-escape interpolation by default. Most Vue XSS comes from `v-html`, a small set of bind shortcuts, and Nuxt SSR mistakes.

## XSS

### Mustache and `v-bind` are safe

```vue
<!-- SAFE — escapes HTML -->
<div>{{ userName }}</div>
<a :title="userTitle">{{ userName }}</a>
```

### `v-html` is the main XSS vector

```vue
<!-- CRITICAL: stored XSS if userBio comes from user input -->
<div v-html="userBio"></div>
```

If you must render user-generated HTML (rich-text editor output):
```vue
<script setup>
import DOMPurify from "dompurify";
const safeBio = computed(() => DOMPurify.sanitize(props.userBio));
</script>

<template>
  <div v-html="safeBio"></div>
</template>
```

Avoid `DOMPurify.sanitize(html, { ADD_TAGS: ["script"], ALLOWED_ATTR: ["onclick"] })` — that's defeating the sanitizer. Default config is correct for almost all cases.

### URL attribute injection

`v-bind:href="userUrl"` is rendered as-is. `javascript:` URLs execute on click:
```vue
<!-- DANGEROUS -->
<a :href="userUrl">click</a>
```
Validate protocols before bind:
```js
const safeUrl = (u) => {
  try {
    const p = new URL(u, window.location.origin);
    return ["http:", "https:", "mailto:"].includes(p.protocol) ? p.href : "#";
  } catch { return "#"; }
};
```
Apply to `:href`, `:src`, `:action`, `:formaction`, `:data`, SVG `:xlink:href`, `:srcset`.

### `v-bind` with object spread

```vue
<!-- If userObj contains 'innerHTML' or 'onclick', this binds them -->
<div v-bind="userObj"></div>
```
Don't spread user-controlled objects as attribute bags. Always allowlist.

### Direct DOM access via `ref` or `$el`

```vue
<script setup>
const el = ref(null);
onMounted(() => { el.value.innerHTML = userHtml; });   // XSS
</script>
```
Same risk as `v-html`. Don't write to `.innerHTML` / `.outerHTML` from user data — use `.textContent` for plain text.

### Render functions and JSX

If you write render functions or use JSX in Vue:
```js
// SAFE — children are escaped
h("div", null, userText)

// DANGEROUS
h("div", { innerHTML: userHtml })
```

## State and storage

### Token storage (same trade-offs as React)

| Storage | XSS-stealable | CSRF risk |
| --- | --- | --- |
| `localStorage` (Pinia-persisted) | yes | no |
| Memory (Pinia store) | no, but lost on refresh | no |
| `HttpOnly Secure SameSite` cookie | no | yes — needs CSRF |

`pinia-plugin-persistedstate` writes to `localStorage` by default. If your store contains tokens or PII, configure a custom storage backend (or just don't persist that store).

### Don't expose secrets via env vars

In Vite / Vue CLI, env vars prefixed with `VITE_` (Vite) or `VUE_APP_` (Vue CLI) are bundled into the client. In Nuxt, anything in `runtimeConfig.public` is sent to the browser; `runtimeConfig.*` (without `public`) is server-only.

API keys for client-safe services (Stripe publishable, Mapbox public token with URL restrictions) are fine. Database URLs, secret keys, signing keys — never.

## URL handling and open redirects

```js
// Open redirect
const next = route.query.next;
router.push(next);   // attacker sets ?next=//evil.com
```
`router.push("//evil.com")` resolves to a same-origin path in most cases (Vue Router treats it as a path), but `window.location.href = userInput` with no validation is a clear open redirect. Always validate against an allowlist:
```js
const target = new URL(next ?? "/", window.location.origin);
if (target.origin === window.location.origin) router.push(target.pathname + target.search);
else router.push("/");
```

## CSP

Vue 3's compiled templates work well with CSP — no inline scripts in production builds. For Vue 2 with the runtime + compiler, runtime-compiled templates (`new Vue({ template: "..." })`) require `'unsafe-eval'` — avoid by precompiling to render functions.

A solid CSP for Vue:
```
default-src 'self';
script-src 'self' 'nonce-<random>';
style-src 'self' 'nonce-<random>';
object-src 'none';
base-uri 'self';
frame-ancestors 'none';
```

## SSR (Nuxt)

Nuxt 3's server-rendered routes blur frontend / backend:

- **`nuxt/server/api`** routes are real backend endpoints — apply input validation (Zod / Valibot), auth checks, CSRF. Use `defineEventHandler` with explicit checks.
- **`useFetch`** in server context runs at SSR — passes cookies through. Don't fetch user-supplied URLs without SSRF validation.
- **`useState` and shared state in SSR**: state is per-request on the server but shared via the SSR HTML payload — don't put secrets in `useState` or you'll send them to the client.
- **`runtimeConfig`**: `runtimeConfig.public.*` is sent to client. Anything else is server-only. Verify before deploy.
- **Nitro server middleware**: runs on all requests; great place to enforce auth headers, but easy to misconfigure (e.g., regex `/admin/` matches `/admin/foo` but not `/admin`).
- **Server actions / `$fetch`**: not CSRF-protected by default. For state-changing endpoints called from the browser, validate origin or implement CSRF tokens.
- **Error handling**: Nuxt's default error page can leak stack traces in non-production modes. Always set `NUXT_DEBUG=false`/`NODE_ENV=production` in prod.

For Nuxt 2, similar story but with `nuxtServerInit`, `serverMiddleware`, and the `context.req`/`context.res` pattern.

## Postmessage and iframes

```js
// SENDER — explicit targetOrigin
parentWindow.postMessage(msg, "https://app.example.com");   // not "*"

// RECEIVER
window.addEventListener("message", (e) => {
  if (e.origin !== "https://trusted.example.com") return;
  // process e.data
});
```

For embedded iframes, use `sandbox` attribute with minimum permissions; avoid `allow-scripts allow-same-origin` together (defeats the sandbox).

## Dependencies and supply chain

- `npm audit` / `pnpm audit` / `yarn audit` in CI.
- Pin versions and commit lockfiles.
- Vue ecosystem packages to watch: `vue-router`, `vuex`, `pinia`, `@nuxt/*`, `vee-validate`, `quasar`, `vuetify`, third-party Vue components on npm.
- Avoid Vue plugins that haven't been updated for >12 months — Vue 3 ecosystem moves fast.
- For Vue 2: it reached EOL on 2023-12-31. Migrate to Vue 3 or ensure paid extended support.

## Forms and inputs

- File inputs: client `accept=".png"` is UX, validate on the server.
- For credential fields: `autocomplete="current-password"` / `"new-password"`.
- VeeValidate / Vuelidate provide schema-based validation — but client validation is UX, the server must re-validate.
- Don't store credit-card or SSN data in component state for any longer than needed; clear after submit.

## Reactivity gotchas with security implications

- `reactive()` makes all properties reactive — don't put auth tokens in a reactive object that's displayed via `v-for` debug output (easy to accidentally render).
- `toRaw()` strips reactivity — use it before serializing to JSON to avoid leaking proxy internals.
- `watch` / `watchEffect` triggered by user input that calls `fetch` is a good place for validation-skip bugs — make sure validators run inside the watcher, not just on form submit.

## Routing

```js
// Protected route via navigation guard
router.beforeEach((to) => {
  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { path: "/login", query: { next: to.fullPath } };
  }
});
```
Same caveat as React: client guards are UX, not security. Server must re-check on every API call.

For Nuxt: use `definePageMeta({ middleware: "auth" })` and a server middleware that enforces auth on `/api/*`.

## Logging

- Don't `console.log` user data, tokens, or full API responses in production builds.
- Vite/webpack: `terserOptions.compress.drop_console = true` strips them at build.
- Sentry/LogRocket: configure data-scrubbing for password/token/SSN patterns.

## Framework-specific footguns

- `v-html` is the obvious one — grep for it in every PR.
- `Vue.compile(userTemplate)` (Vue 2) or runtime template compilation — NEVER with user input. RCE via expressions.
- Vue 2: filters in templates received the value but didn't re-escape if the filter returned HTML. Vue 3 removed filters — but Vue 2 `{{ x | someFilter }}` still escapes the result of the filter, so it's safer than `v-html`.
- `eval` / `Function(string)` / `setTimeout(string)` — never with user input.
- `<component :is="userInput">` — dynamic component rendering with user-controlled name renders any registered component, including admin ones. Allowlist:
  ```js
  const SAFE = { profile: Profile, settings: Settings };
  ```
- Vue Router: `path: '/user/:id(.*)'` regex catch-all matches across slashes. Used with file paths → traversal.
- SSR data hydration: server state is sent as `<script>window.__INITIAL_STATE__ = {...}</script>`. If state contains user-supplied strings with `</script>`, you get HTML injection unless serializer escapes it. Nuxt handles this; custom SSR may not.
- Pinia + persistedstate plugin: by default persists everything to `localStorage` including tokens. Configure `paths: [...]` to allowlist.
- `defineProps({ userHtml: String })` then `v-html="userHtml"` in a "trusted parent → child" mental model — child still needs to sanitize, since "trust" is just a convention.
- Nuxt 3 `definePageMeta` with `middleware: 'auth'` runs only on client navigations, not on direct URL load (without server middleware). Always pair with server-side auth check.
- `$fetch` / `useFetch` in Nuxt: server-side calls follow redirects by default, including to internal IPs — SSRF vector for any user-URL fetcher.

## Review checklist

1. `v-html` used only with DOMPurify-sanitized content (or never)
2. URL bindings (`:href`, `:src`, `:action`, `:srcset`) validated for `javascript:` / `data:` protocols
3. No `v-bind="userObj"` spread of user-controlled objects
4. Direct DOM writes (`.innerHTML = userHtml`) absent
5. No `Vue.compile`, `eval`, `new Function` with user input
6. `<component :is="userInput">` uses an allowlist
7. Tokens / secrets not in `localStorage` via persisted Pinia stores
8. No secrets in `VITE_*` / `VUE_APP_*` / `runtimeConfig.public` env vars
9. Open redirect protection on `router.push(userInput)` and `window.location.href = userInput`
10. CSP configured; no inline-script reliance in production
11. Nuxt `runtimeConfig` audited for accidentally-public secrets
12. Nuxt API routes validate input + check auth + protect against CSRF and SSRF
13. SSR hydration script properly escapes `</script>` in serialized state
14. Dependencies audited; Vue 2 apps either migrated or on extended support
