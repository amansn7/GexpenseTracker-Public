# React — Secure Coding

Covers React 17, 18, 19, plus React Router, Next.js (app + pages router), and common state libs (Redux, TanStack Query). Frontend-only — for backend security, load the relevant backend reference.

React's biggest security wins come from JSX's automatic escaping. Most React vulnerabilities come from explicitly opting out of it.

## XSS

JSX auto-escapes string children:
```jsx
// SAFE — text is escaped
<div>{userBio}</div>
<a title={userTitle}>{userName}</a>
```

The dangerous escape hatches:

```jsx
// CRITICAL: dangerouslySetInnerHTML on user content = stored XSS
<div dangerouslySetInnerHTML={{ __html: userBio }} />
```
If you must render user-generated HTML (rich-text editors), sanitize first:
```jsx
import DOMPurify from "dompurify";
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(userBio) }} />
```
DOMPurify with default config is safe; don't add `ADD_TAGS: ["script"]` or `ALLOWED_ATTR: ["onclick", ...]` unless you know exactly what you're doing.

### Attribute-based XSS

JSX escapes attribute values for HTML-injection, but not for protocol-injection in URL attributes:
```jsx
// XSS if href starts with javascript:
<a href={userUrl}>click</a>
```
Validate URL protocols:
```jsx
const safeUrl = (u) => {
  try {
    const parsed = new URL(u, window.location.origin);
    return ["http:", "https:", "mailto:"].includes(parsed.protocol) ? parsed.href : "#";
  } catch { return "#"; }
};
<a href={safeUrl(userUrl)}>click</a>
```
Same applies to `<iframe src>`, `<form action>`, `<object data>`, `<embed src>`, `<link href>`, SVG `<use href>`, and CSS `url(...)`.

### `ref` callbacks and direct DOM

```jsx
// XSS if you write to innerHTML via a ref
<div ref={(el) => el && (el.innerHTML = userHtml)} />
```
Same risk as `dangerouslySetInnerHTML`. Don't write to `.innerHTML`, `.outerHTML`, or use `document.write` with user input.

### CSS injection

Inline styles via `style={...}` are safe — React rejects function expressions in CSS values. But `<style>{userCss}</style>` is dangerous (CSS expression / `url(javascript:...)` in older browsers, plus exfiltration via attribute selectors).

### Third-party HTML

When integrating WYSIWYG editors (TinyMCE, Quill, ProseMirror) or markdown renderers (marked, markdown-it):
- Always sanitize the output HTML before rendering, even if the editor "sanitizes" — sanitize at the render site too (defense in depth).
- For markdown, use `marked` with `DOMPurify.sanitize(marked(md))` or `react-markdown` (which sanitizes by default — keep it that way; don't pass `rehypeRaw` plugin).

## State and storage

### Where to put auth tokens

| Storage | XSS-stealable | CSRF risk | Notes |
| --- | --- | --- | --- |
| `localStorage` | yes | no | Any XSS = full token theft |
| `sessionStorage` | yes | no | Same as above, scoped to tab |
| Memory (React state) | no, but lost on refresh | no | Best XSS resistance |
| `HttpOnly Secure SameSite` cookie | no | yes — needs CSRF | Best for SPA + same-origin backend |

For tokens in cookies: backend sets `HttpOnly Secure SameSite=Lax` and you implement CSRF (double-submit-cookie or backend's CSRF token).

For tokens in memory: refresh-token rotation via HttpOnly cookie, access token kept in memory only.

`localStorage` is NOT secure for tokens — any XSS exfiltrates everything. Some teams accept this trade-off for simplicity; recognize it as a trade-off, not a default.

### Don't put secrets in env vars exposed to the client

In Create React App: anything starting with `REACT_APP_` is bundled into the JS — public.
In Next.js: `NEXT_PUBLIC_*` is public; non-prefixed env vars are server-only (only in `getServerSideProps`, route handlers, server components).
In Vite: `VITE_*` is public.

API keys for third-party services (Stripe **publishable** key, Google Maps key with referrer restrictions, public Sentry DSN) are fine. Secret keys, DB passwords, service-account JSONs are not.

## URL handling and open redirects

```jsx
// Open redirect — never directly redirect to a URL from query string
const next = new URLSearchParams(window.location.search).get("next");
window.location.href = next;   // attacker sets next=https://evil.com

// Validate that it's same-origin (or an allowlisted host)
const target = new URL(next ?? "/", window.location.origin);
if (target.origin !== window.location.origin) target.href = "/";
window.location.href = target.href;
```

In React Router, `<Navigate to={userInput} />` and `useNavigate()(userInput)` have the same risk.

## Postmessage and iframes

If you use `window.postMessage` for cross-frame comms:
```js
// SENDER: always specify targetOrigin
parentWindow.postMessage(msg, "https://app.example.com");   // not "*"

// RECEIVER: always check origin
window.addEventListener("message", (e) => {
  if (e.origin !== "https://trusted.example.com") return;
  // process e.data
});
```

For embedded third-party iframes:
- `sandbox` attribute with minimal permissions: `<iframe sandbox="allow-scripts allow-same-origin" />` — don't combine those two unless necessary (the combo defeats sandbox).
- `allow=""` to deny all browser features by default; explicitly grant what's needed.

## Dependencies and supply chain

React's npm ecosystem is the #1 attack surface:
- Run `npm audit` (or `pnpm audit` / `yarn audit`) in CI — investigate "moderate" and above.
- Use `npm install --ignore-scripts` to block postinstall hooks (then re-enable per-package as needed). Tools like `socket.dev` or `snyk` can flag supply chain risk.
- Pin versions or use a lockfile (`package-lock.json` / `yarn.lock` / `pnpm-lock.yaml`); commit the lockfile.
- Be skeptical of micro-packages (`is-odd`, `left-pad`-style). Prefer fewer, well-maintained deps.
- `react-helmet-async` (over `react-helmet`) for SSR safety.
- Avoid `eval`-based template engines; if you import `lodash.template` or similar, you're a string interpolation away from RCE in SSR contexts.

## Server-Side Rendering (Next.js etc.)

Server components and SSR introduce backend security concerns into "frontend" code:

- **Data fetching in server components**: SSRF risk if you `fetch(userUrl)`. Validate URLs.
- **Route handlers / API routes**: full backend security applies — input validation (use Zod), auth checks, CSRF.
- **`getServerSideProps` / Server Actions**: receive cookies, run with server privileges. Don't pass server-only data through to the client unless intended (it gets serialized into the HTML).
- **Next.js Server Actions**: are POST endpoints. They have CSRF protection in Next 14+ via origin checking, but verify your `next.config.js` `serverActions.allowedOrigins` is set correctly.
- **`<Image src={userUrl} />`** in Next.js: the image optimizer fetches the URL server-side — SSRF risk. Configure `images.remotePatterns` strictly.
- **`<Link href={userUrl}>`**: open redirect risk if `userUrl` is external — validate.
- **Streaming / Suspense**: errors in server components leak server stack traces unless you set up `error.tsx` boundaries.
- **`use client` boundary**: anything passed from server → client is sent to the browser. Don't pass full DB rows with internal fields — strip/select.

## CSP

A strong CSP is the best defense against XSS that slips through:
```
default-src 'self';
script-src 'self' 'nonce-<random>';
style-src 'self' 'nonce-<random>';
object-src 'none';
base-uri 'self';
frame-ancestors 'none';
```
Avoid `'unsafe-inline'` for scripts. React 18+ supports nonces for inline scripts via `nonce` prop. For Next.js, generate a nonce in middleware and pass via headers.

## Security-relevant React patterns

### Don't render user-controlled component types

```jsx
// DANGEROUS: user picks which component to render
const Cmp = COMPONENTS[userInput];
return <Cmp />;
```
Allowlist:
```jsx
const SAFE = { profile: Profile, settings: Settings };
const Cmp = SAFE[userInput] ?? NotFound;
```

### Forms and file inputs

- File inputs (`<input type="file">`) — validate on the server too. Client-side `accept=".png"` is UX, not security.
- Always send CSRF tokens on form POSTs if using cookie auth.
- For credentials, use `autocomplete="current-password"` / `"new-password"` (not `"off"` — browsers ignore it for passwords and some password managers stop helping).

### Prevent prototype pollution

If you ever do `Object.assign({}, userObj)` or `_.merge(target, userObj)` with user-controlled keys, an attacker setting `__proto__.foo = "bar"` can pollute every object. Use `Object.create(null)` for base objects, or `_.mergeWith` with a customizer that rejects `__proto__`/`constructor`/`prototype` keys, or migrate to `lodash` >= 4.17.20.

### React-specific timing attacks

- `useDeferredValue` / `useTransition` shouldn't be used for security-critical UI gating (e.g., hiding an admin panel). Auth checks must happen on the server; client routing is just UX.

## Routing

```jsx
// React Router — protected route pattern
function RequireAuth({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return children;
}
```
Remember: client-side route guards are NOT security — anyone can edit JS in the browser. Always re-check auth on the server for any data the route fetches.

## DevTools and source maps

- Don't ship Redux DevTools enabled in production unless you intend to. `composeWithDevTools` checks `NODE_ENV` — verify your build sets it.
- Source maps in production make reverse engineering trivial. Either don't generate them, or upload to Sentry and don't serve from your CDN.
- `console.log` of user data persists in browser console — strip in production builds (Vite/Webpack drop_console plugins).

## Logging

- Don't log auth tokens, full API responses, or PII to the browser console (gets shipped to error trackers and to user's machine).
- Sentry / LogRocket / FullStory ingest browser data — configure them to redact passwords, tokens, credit-card patterns.

## Framework-specific footguns

- `dangerouslySetInnerHTML` is the obvious one — search for it in every PR.
- `eval`, `new Function(string)`, `setTimeout(string, ...)` — never with user input. ESLint rules `no-eval`, `no-implied-eval` catch these.
- React 18 strict mode double-invokes effects in dev — security checks that mutate state may behave unexpectedly. Make effects idempotent.
- `useState(initialFromQueryParam)` makes the URL query a state seed — open to fixation attacks where attacker crafts a URL that puts the app in an unexpected state.
- Service workers with broad scope can intercept all fetches — review SW updates carefully.
- `history.replaceState` to clean a sensitive token out of the URL still leaves the original URL in browser history & referer. Don't put secrets in URLs in the first place.
- React Server Components: `import "server-only"` enforces a module is server-side only — use it for secret-containing modules so a stray `use client` doesn't leak them.
- JSX in `.jsx` vs `.tsx` — TypeScript catches some prop-spread mistakes (`<a {...userObj}>` would let `dangerouslySetInnerHTML` slip in if the type allows it).
- `<form action={url}>` where `url` is user-controlled = CSRF where the user can choose the target.

## Review checklist

1. No `dangerouslySetInnerHTML` without DOMPurify (or equivalent sanitizer)
2. URL attributes (`href`, `src`, `action`) validated for `javascript:`, `data:`
3. No `eval`, `new Function`, string-`setTimeout` with user input
4. Auth tokens not in `localStorage` (or accept the XSS-blast-radius trade-off knowingly)
5. No secrets in `REACT_APP_` / `NEXT_PUBLIC_` / `VITE_` env vars
6. Open redirect protection on any `window.location = userUrl` or `<Navigate to={userUrl} />`
7. `postMessage` calls use explicit `targetOrigin`; receivers check `e.origin`
8. CSP configured at server, no `'unsafe-inline'` for scripts
9. Dependencies audited; lockfile committed; postinstall scripts reviewed
10. Server-rendered routes apply backend security (CSRF, auth, input validation, SSRF)
11. Source maps and DevTools off in production builds
12. WYSIWYG / markdown renderers sanitize output
