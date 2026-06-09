# Mobile Discovery Report — MoneyFlow (Gexpense Tracker)

Generated: June 7, 2026

## Architecture Overview

### Frontend
- **Framework**: React 18 via CDN (UMD builds from `/static/vendor/`)
- **Routing**: Custom state-based routing via React Context (`ViewContext`), no URL router
- **Build**: esbuild transpiles `static/src/*.jsx` → `static/dist/*.js` (IIFE format, no bundling)
- **State**: React Context (3 contexts: View, Filter, Sync) + component-local state
- **Styling**: CSS custom properties with 4 themes (paper, cool, midnight, observatory)
- **Backend**: FastAPI (Python) serves the SPA from Jinja2 template (`templates/index.html`)

### Build Output
| Directory | Purpose |
|---|---|
| `static/dist/` | Transpiled JS bundles (web app) |
| `static/dist/vendor/` | Vendor bundles (d3-sankey, react-window) |
| `static/mobile/` | Separate PWA prototype (NOT part of Capacitor target) |

### Key Dependencies
| Package | Version | Purpose |
|---|---|---|
| react (CDN) | 18.3.1 | UI framework |
| esbuild | ^0.28.0 | JSX transpilation |
| d3-sankey | 0.12.3 | Flow/Sankey diagram |
| react-window | 1.8.11 | Virtualized lists |
| playwright | ^1.60.0 | E2E testing |

## Mobile Compatibility Risks

### High Risk

1. **Server-rendered SPA with CSP nonces**
   - `templates/index.html` is a Jinja2 template served by FastAPI
   - CSP nonces are injected server-side per request
   - **Impact**: Loading from local filesystem (standard Capacitor mode) breaks nonce injection
   - **Solution**: Use Capacitor `server.url` mode to load from backend

2. **Session cookie auth**
   - `HttpOnly`, `Secure`, `SameSite=Lax` session cookie
   - Mobile WebView cookies behave differently
   - **Solution**: Use JWT Bearer auth (already implemented) or configure cookie handling

3. **Strict CSP headers**
   - `script-src` includes nonces; inline scripts are blocked without matching nonce
   - Mobile WebView may fail to load if CSP isn't relaxed
   - **Solution**: Mobile-specific CSP path (already exists for `/mobile`)

### Medium Risk

4. **CDN-loaded React**
   - React and dependencies loaded from CDN (`/static/vendor/`)
   - Offline support requires bundling or service worker
   - **Solution**: Bundle all vendor JS into Capacitor web assets

5. **CSS `env(safe-area-inset-*)` already configured**
   - Safe area variables are defined in `:root` (lines 2-9 of styles.css)
   - Touch target sizing already has `@media (pointer: coarse)` (lines 683-695)
   - **Good**: Basic mobile support is already partially in place

6. **No WebSocket usage** — low risk
7. **No push notifications** — enhancement opportunity
8. **No camera/geolocation** — blocked by Permissions-Policy header

## Native Capability Requirements

| Capability | Currently Used | Capacitor Plugin | Priority |
|---|---|---|---|
| Push Notifications | No | `@capacitor/push-notifications` | Medium |
| Biometric Auth | WebAuthn (passkeys) | `@capacitor/biometric-auth` | Low |
| Native Share | No | `@capacitor/share` | Low |
| Camera | No (blocked) | `@capacitor/camera` | Low |
| File System | No | `@capacitor/filesystem` | Low |
| Haptics | No | `@capacitor/haptics` | Low |
| Status Bar | No | `@capacitor/status-bar` | High |
| Splash Screen | No | `@capacitor/splash-screen` | High |

## Recommended Fixes

### Critical (blocking)

1. **Create Capacitor entry point** — a minimal HTML shell that loads the SPA from the backend via `server.url`
2. **Relax CSP for Capacitor WebView** — allow `capacitor://` and `https://` schemes
3. **Configure cookie handling** — ensure session cookies persist in WebView

### High Priority

4. **Add Capacitor plugins for native feel** — Status Bar, Splash Screen
5. **Create build pipeline** — `npm run mobile:build`, `npm run mobile:sync`
6. **Configure deep linking** — Android intent filters and iOS Universal Links

### Medium Priority

7. **Add safe area support** to views that lack it (already partially done)
8. **Increase touch targets** to 44×44px minimum (already partially done)
9. **Add mobile navigation gestures** (swipe back, pull to refresh)

## Auth Analysis

| Auth Method | Mobile Compatibility | Notes |
|---|---|---|
| Session Cookie | Medium | Use `@capacitor/cookies` or server.url mode |
| JWT Bearer | High | Already implemented for mobile clients |
| Google OAuth | Medium | Requires secure WebView config |
| WebAuthn/Passkeys | Medium | Platform authenticator varies by device |
| TOTP | High | Works in WebView |
| CSRF Tokens | High | Works with cookie persistence |

## Migration Strategy

1. **Phase 1** — Capacitor shell with `server.url` pointing to production backend
2. **Phase 2** — Native plugin integration (push, biometrics, sharing)
3. **Phase 3** — Offline support with service worker + local caching
4. **Phase 4** — App store preparation (splash screen, icons, metadata)

## Estimated Effort

| Phase | Effort | Dependencies |
|---|---|---|
| Phase 1 (Shell) | 2-3 hours | Capacitor CLI, Android SDK / Xcode |
| Phase 2 (Native) | 4-6 hours | Platform-specific testing |
| Phase 3 (Offline) | 8-12 hours | Service worker rewrite |
| Phase 4 (Store) | 4-8 hours | Screenshots, metadata, signing |
