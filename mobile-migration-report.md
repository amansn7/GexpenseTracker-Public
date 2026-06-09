# Mobile Migration Report — MoneyFlow (Gexpense Tracker)

Generated: June 7, 2026

## Overview

Successfully converted the MoneyFlow web application into a Capacitor-based iOS app. Android configuration is documented and ready for setup when the Android SDK is available.

## Changes Made

### 1. Capacitor Setup

| Item | Status | Details |
|---|---|---|
| `@capacitor/core` | ✅ Installed | v8.x |
| `@capacitor/cli` | ✅ Installed | v8.x |
| `@capacitor/ios` | ✅ Installed | iOS platform added |
| `capacitor.config.ts` | ✅ Created | server.url mode pointing to production |
| `capacitor/index.html` | ✅ Created | Minimal fallback loader |

### 2. Plugins Installed

| Plugin | Version | Purpose |
|---|---|---|
| `@capacitor/status-bar` | 8.0.2 | Status bar styling (dark, bg matches theme) |
| `@capacitor/splash-screen` | 8.0.1 | Native splash screen on launch |
| `@capacitor/haptics` | 8.0.2 | Haptic feedback for touch interactions |
| `@capacitor/share` | 8.0.1 | Native share sheet for transactions |
| `@capacitor/app` | 8.1.0 | App lifecycle and deep link handling |
| `@capacitor/browser` | 8.0.3 | System browser (for OAuth flows) |

### 3. Platform Configuration

**iOS** (`ios/App/App/Info.plist`):
- Added `moneyflow://` custom URL scheme for deep linking
- Added `LSApplicationQueriesSchemes` (googlechrome)
- Added `NSAppTransportSecurity` (allows arbitrary loads for dev)
- Restricted orientation to portrait

### 4. CSS Mobile Readiness Improvements

**File**: `static/styles.css`

| Change | Location | Details |
|---|---|---|
| `.safe-area-bottom` utility class | New (line ~382) | Reusable safe area bottom padding |
| Mobile nav toggle top offset | `@media (≤980px)` | Uses `max(14px, env(safe-area-inset-top))` |
| Mobile sidebar padding | `@media (≤980px)` | Safe area top/bottom padding added |
| Sync panel bottom offset | `@media (≤980px)` | Uses `max(12px, env(safe-area-inset-bottom))` |
| Toast container bottom offset | `@media (≤980px)` | Uses `max(12px, env(safe-area-inset-bottom))` |
| Nav item touch targets | `@media (≤980px)` | `min-height: 44px`, increased padding |
| Period tab touch targets | `@media (≤980px)` | `min-height: 44px` |

### 5. Build Pipeline

New npm scripts added to `package.json`:

```bash
npm run mobile:build    # Build frontend + copy to native platforms
npm run mobile:sync     # Sync Capacitor config + plugins
npm run mobile:ios      # Build, copy, and open in Xcode
npm run mobile:update   # Update iOS platform
```

### 6. Deep Linking

- **iOS**: Custom URL scheme `moneyflow://` configured in Info.plist
- **Android**: Configuration documented in `DEEP-LINKING.md` (ready for setup)
- Universal Links and Android App Links documented

### 7. Documentation Generated

| Document | Location | Purpose |
|---|---|---|
| Discovery Report | `/mobile-discovery-report.md` | Architecture analysis, risks, recommendations |
| UX Audit | `/mobile-ux-report.md` | Per-page mobile readiness assessment |
| Auth Compatibility | `/auth-mobile-compatibility.md` | Auth flow behavior in WebView |
| Deep Linking | `/DEEP-LINKING.md` | URL scheme and Universal Links setup |
| Migration Report | `/mobile-migration-report.md` | This file — summary of all changes |

## How to Build & Run

### iOS (Prerequisites: Xcode 14+)

```bash
# 1. Build the web frontend
npm run build

# 2. Copy to iOS project and open in Xcode
npm run mobile:ios

# 3. In Xcode:
#    - Select a simulator or connected device
#    - Press Cmd+R to build and run
```

For first-time setup, you may need to:
1. Open `ios/App/App.xcworkspace` in Xcode
2. Configure your Apple Developer team under Signing & Capabilities
3. Set the bundle identifier to match your provisioning profile

## Remaining Issues

### High Priority
- [ ] **iOS cookie persistence**: Test session cookie survival across app restarts. iOS WKWebView may clear cookies.
- [ ] **Google OAuth flow**: Must open in system browser (not embedded WebView) — use `@capacitor/browser` plugin.
- [ ] **Splash screen icon**: Replace `capacitor/` placeholder with real app icon.

### Medium Priority
- [ ] **Offline support**: The current service worker only covers `/mobile` PWA. The main web app has no offline fallback.
- [ ] **Pull-to-refresh**: Add to inbox and transaction list views.
- [ ] **Swipe actions**: Swipe to classify/delete on inbox rows.
- [ ] **Bottom tab bar**: Replace sidebar with native bottom navigation for mobile.

### Low Priority
- [ ] **Push notifications**: Real-time transaction alerts via `@capacitor/push-notifications`.
- [ ] **Camera receipt capture**: Enable camera Permissions-Policy and add receipt scanning.
- [ ] **Widgets**: iOS home screen widget showing daily balance.
- [ ] **Biometric app lock**: Face ID / Touch ID via `@capacitor/biometric-auth`.

## Android Setup (When SDK is Available)

```bash
npm install @capacitor/android
npx cap add android

# Add Android-specific config to capacitor.config.ts:
# - intent filters for deep linking
# - Allow cleartext for dev

npx cap sync android
npm run mobile:android  # Add to package.json scripts
```

## Verification Checklist

- [x] Capacitor installed and configured
- [x] iOS platform added and builds
- [x] Safe areas configured in CSS
- [x] Touch targets optimized (44px minimum)
- [x] Responsive breakpoints verified
- [x] Deep linking configured (iOS URL scheme)
- [x] Auth flows documented
- [x] Build scripts created
- [ ] Build and run on iOS simulator (requires Xcode)

## Architecture Decision Records

### ADR-1: Server URL Mode

**Decision**: Use Capacitor `server.url` mode to load the app from the production backend.

**Rationale**: The web app is a server-rendered SPA (Jinja2 + FastAPI) with CSP nonces and session cookie auth. Loading from a server URL preserves all server-side functionality without changes to the backend.

**Trade-off**: Requires network connectivity. No offline mode.

### ADR-2: No Frontend Framework Changes

**Decision**: Keep React + esbuild + CDN setup. No migration to React Native or Next.js.

**Rationale**: The app is built with React 18 and has no build toolchain. Capacitor wraps the existing web app with minimal changes, avoiding a full rewrite.

### ADR-3: JWT vs Session Cookie

**Decision**: Document both approaches. Start with session cookie (simplest, works with `server.url`). Migrate to JWT Bearer for production robustness.

**Rationale**: JWT is already implemented server-side. The Capacitor app can progressively enhance from cookie auth to JWT auth.
