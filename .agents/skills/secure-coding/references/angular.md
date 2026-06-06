# Angular — Secure Coding

Covers Angular 14+ (the standalone-components era). Frontend-only — for backend security, load the relevant backend reference.

Angular has the strongest XSS defaults of the major SPA frameworks because it treats values flowing into the DOM as security contexts. Most Angular vulnerabilities come from explicitly bypassing the sanitizer or from server-side rendering misconfigurations.

## XSS

### Interpolation and property binding are safe

```html
<!-- SAFE — escapes HTML -->
<div>{{ userBio }}</div>
<a [title]="userTitle">{{ userName }}</a>
```

### `[innerHTML]` is sanitized — but bypassable

Angular sanitizes values bound to `[innerHTML]`:
```html
<!-- Angular strips <script>, on*, javascript: URLs, etc. -->
<div [innerHTML]="userHtml"></div>
```
But `bypassSecurityTrustHtml` disables it:
```ts
// CRITICAL: trust bypass + user input = stored XSS
this.html = this.sanitizer.bypassSecurityTrustHtml(userHtml);
```
Never `bypassSecurityTrust*` with user input. The `bypass*` methods are for HTML you authored, not HTML the user gave you. If you have to render user-generated HTML (rich-text editor output), sanitize with DOMPurify first, then bind via `[innerHTML]` (which will sanitize again — defense in depth):

```ts
import DOMPurify from "dompurify";
this.html = DOMPurify.sanitize(userHtml);
```

The five `bypassSecurityTrust*` methods correspond to security contexts:
- `bypassSecurityTrustHtml` — for `[innerHTML]`
- `bypassSecurityTrustStyle` — for `[style]`
- `bypassSecurityTrustScript` — for `[ngSrc]` of `<script>` (rare; very dangerous)
- `bypassSecurityTrustUrl` — for `[href]`, `[src]`
- `bypassSecurityTrustResourceUrl` — for `[src]` of `<iframe>`, `<embed>`, etc.

Each one corresponds to a vulnerability class. If you find any of them with user input, that's a finding.

### URL binding

```html
<!-- Angular sanitizes URLs — strips javascript: -->
<a [href]="userUrl">click</a>
```
Angular's URL sanitizer correctly strips `javascript:` from `href`/`src`. So `[href]="userUrl"` is generally safe. But `[attr.href]="userUrl"` (attribute binding, not property binding) bypasses the sanitizer. Use `[href]`, not `[attr.href]`, for security-sensitive attributes.

For `[src]` on iframes and embeds, Angular requires `bypassSecurityTrustResourceUrl` — meaning you have to make a deliberate choice. Don't pass user URLs to iframes.

### Style and CSS injection

```html
<!-- [style.background-image]="'url(' + userUrl + ')'" — NEVER -->
```
CSS `url()` can be `javascript:` in older browsers and exfiltrate data via attribute selectors. Use `[ngStyle]` with object literals where values come from a strict allowlist.

### Template injection (don't)

```ts
// DANGEROUS — compiling templates with user input
@Component({ template: userInput })   // never
```
Angular templates are AOT-compiled at build time. If you JIT-compile user-controlled templates at runtime, you have RCE. Don't.

## Authentication and session

### Token storage

| Storage | XSS-stealable | CSRF risk |
| --- | --- | --- |
| `localStorage` | yes | no |
| `sessionStorage` | yes | no |
| Memory (Service singleton) | no, but lost on refresh | no |
| `HttpOnly Secure SameSite` cookie | no | yes — needs CSRF |

Angular's `HttpClient` has built-in XSRF protection: it reads `XSRF-TOKEN` cookie and sends it as `X-XSRF-TOKEN` header for non-GET/HEAD requests. Backend must:
- Set `XSRF-TOKEN` cookie (not HttpOnly, since JS reads it)
- Validate `X-XSRF-TOKEN` header on state-changing requests

Configure with `provideHttpClient(withXsrfConfiguration({ cookieName, headerName }))`.

### HTTP interceptors for auth

```ts
@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  intercept(req: HttpRequest<any>, next: HttpHandler) {
    const token = this.auth.token;
    if (token && this.isApiUrl(req.url)) {                    // don't leak token to 3rd parties
      req = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
    }
    return next.handle(req);
  }
  private isApiUrl(url: string) {
    return url.startsWith("/api/") || url.startsWith(environment.apiUrl);
  }
}
```
**Never attach `Authorization` to all outbound requests** — third-party CDNs and analytics endpoints will receive the token. Always allowlist API URLs.

### Route guards

```ts
export const authGuard: CanActivateFn = (route, state) => {
  const auth = inject(AuthService);
  if (auth.isAuthenticated) return true;
  return inject(Router).createUrlTree(["/login"], { queryParams: { next: state.url } });
};
```
As with React/Vue: client guards are UX, not security. Server must re-check on every API call.

## Open redirect

```ts
// User controls the redirect target
const next = this.route.snapshot.queryParamMap.get("next");
this.router.navigateByUrl(next);   // open redirect

// Validate same-origin
const target = new URL(next ?? "/", window.location.origin);
if (target.origin === window.location.origin) {
  this.router.navigateByUrl(target.pathname + target.search);
} else {
  this.router.navigate(["/"]);
}
```
Same risk applies to `window.location.href = userInput`.

## Don't expose secrets in `environment.ts`

`environment.ts` and `environment.prod.ts` are bundled into the client. Anything in there is public. API keys for client-safe services (Stripe publishable, Mapbox public token) are fine. Backend secrets, DB strings, signing keys — never.

## CSP

Angular works well with strict CSP because production builds (with AOT) avoid `eval` and inline scripts:
```
default-src 'self';
script-src 'self' 'nonce-<random>';
style-src 'self' 'nonce-<random>';
object-src 'none';
base-uri 'self';
frame-ancestors 'none';
```

JIT mode and runtime template compilation require `'unsafe-eval'` — avoid by using AOT (Angular's default for `ng build`).

## Postmessage and iframes

```ts
// SENDER — explicit targetOrigin
parentWindow.postMessage(msg, "https://app.example.com");

// RECEIVER (in a service)
@Injectable({ providedIn: "root" })
export class CrossOriginService {
  constructor(private ngZone: NgZone) {
    window.addEventListener("message", (e) => {
      if (e.origin !== "https://trusted.example.com") return;
      this.ngZone.run(() => { /* process e.data */ });
    });
  }
}
```

For embedded iframes, use `sandbox` attribute with minimum permissions. Avoid `[src]` from user input — Angular requires `bypassSecurityTrustResourceUrl` which is an explicit signal you're in dangerous territory.

## Server-Side Rendering (Angular Universal)

Angular Universal renders components on the server, then hydrates on the client.

- **`HttpClient` calls during SSR** run on the server — they have access to internal network. Don't fetch user-supplied URLs without SSRF validation.
- **`TransferState`** ships server-rendered state to the client. Don't put secrets in transferred state — the entire `<script id="state">...</script>` is sent to the browser.
- **Cookies on SSR**: requests forwarded to your API include cookies if you opt in via `withFetch` interceptors — be careful which third-party services see them.
- **Error pages**: production SSR should not render Angular's verbose dev error pages. Set `production: true` in `environment.prod.ts` and ensure `ng build --configuration=production`.
- **Document / Window**: use `@Inject(DOCUMENT)` and check `isPlatformBrowser(this.platformId)` before calling browser-only APIs. Code paths that diverge between server and client are easy places for security checks to be missed.

## Forms and validation

Reactive Forms are the recommended pattern:
```ts
this.form = this.fb.group({
  email: ["", [Validators.required, Validators.email]],
  age: [null, [Validators.min(0), Validators.max(150)]],
});
```
But: **client validation is UX, not security**. The server must re-validate every field. Angular's validators don't sanitize — `Validators.email` doesn't strip script content from an email field.

For file inputs, `accept=".png"` is UX; validate file type by sniffing magic bytes on the server.

## Dependencies and supply chain

- `npm audit` / `pnpm audit` / `yarn audit` in CI.
- Pin Angular and Angular Material versions; commit lockfile.
- Watch for advisories on: Angular itself, `@angular/material`, `ngx-*` community packages (varying maintenance), `zone.js`.
- `ng update` keeps Angular up-to-date and applies migrations — don't skip multiple major versions.

## Logging

- Angular's default `ErrorHandler` logs to console — wrap with custom handler for production that ships to Sentry without exposing user data.
- Don't `console.log` tokens, full HTTP responses, or PII in production builds. Configure Terser to strip `console.*` calls.
- Sentry/LogRocket: configure data-scrubbing for password / token / SSN / cc patterns.

## Framework-specific footguns

- `bypassSecurityTrust*` is the obvious one. Grep for it in every PR.
- `[attr.href]` and `[attr.src]` bypass the URL sanitizer — use `[href]` / `[src]`.
- `Renderer2.setProperty(el, "innerHTML", userHtml)` bypasses the template sanitizer — never.
- `ElementRef.nativeElement.innerHTML = userHtml` — same issue, accessing the DOM directly.
- `*ngFor` with object iteration that includes `__proto__`-polluted keys can trip up rendering — sanitize input before iteration.
- Dynamic component loading: `viewContainerRef.createComponent(componentType)` is fine if `componentType` is a class reference; if you let the user pick by string-key, allowlist:
  ```ts
  const SAFE = { profile: ProfileComponent, settings: SettingsComponent };
  ```
- JIT compilation in production: require `'unsafe-eval'` in CSP. Always use AOT.
- `ng-template` interpolation respects context; `<ng-container *ngTemplateOutlet="userTemplate; context: ctx">` with user-controlled template ref is a route to template injection.
- DomSanitizer `sanitize(SecurityContext.NONE, value)` returns the value as-is — read like a no-op, but a yellow flag in code review.
- Service-worker (Angular PWA) updates can be hijacked if served over HTTP or with weak CSP — keep `ngsw-config.json` review tight.
- Angular's `HttpClient.get<T>(url)` doesn't sanitize the response. The `<T>` is a TypeScript hint, not a runtime check — use `zod` or similar to validate response shape if you treat it as security boundary.
- `fakeBackend`/in-memory mock providers should NOT be in production bundles — verify your `providers` array is environment-conditional.
- Standalone components: `imports: [...]` arrays sometimes pull in dev-only modules — review for production builds.
- Forms `disabled` attribute set via template (`<input disabled>`) and changed via FormControl can cause Angular to log warnings but still let unauthorized state pass through; control disable state programmatically.

## Review checklist

1. `bypassSecurityTrust*` audited — none with user input
2. URL bindings use `[href]`/`[src]`, not `[attr.href]`/`[attr.src]`
3. No direct DOM `innerHTML` writes via `Renderer2` or `ElementRef`
4. HTTP interceptors for auth tokens scoped to API URLs only
5. XSRF protection enabled with `withXsrfConfiguration`
6. Tokens / secrets not in `localStorage` via persisted state
7. No secrets in `environment.ts` / `environment.prod.ts`
8. Open redirect protection on `navigateByUrl(userInput)`
9. CSP configured; AOT used (no `'unsafe-eval'` needed)
10. Angular Universal: `TransferState` audited for leaks, SSR fetch protected against SSRF
11. Dynamic component loading uses allowlists
12. Server validates all input; client validators are UX only
13. Dependencies audited, Angular kept current via `ng update`
14. Production build strips `console.*`; error handler doesn't leak details
