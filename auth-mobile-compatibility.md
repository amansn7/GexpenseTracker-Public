# Auth Mobile Compatibility — MoneyFlow

Generated: June 7, 2026

## Authentication Architecture

MoneyFlow uses a multi-layered auth system. In Capacitor (WebView), each method has specific behaviors.

### 1. Session Cookie Auth (Primary)

**How it works**: FastAPI sets an HttpOnly session cookie on login. The cookie is sent with every API request via `credentials: "include"`.

**Mobile WebView Behavior**:
| Aspect | Status | Notes |
|---|---|---|
| Same-origin via server.url | ✅ Works | Cookies shared between navigations within server.url origin |
| First-load redirect | ✅ Works | `/login` redirect functions normally |
| Session persistence | ⚠️ Test | iOS WKWebView may clear cookies on app restart |
| 7-day rotation | ✅ Works | Transparent cookie update via auth middleware |

**Recommendation**: With `server.url` mode, session cookies work naturally. No changes needed for basic auth flow. For session persistence across app restarts, consider switching to JWT Bearer tokens stored in Capacitor Preferences.

### 2. JWT Bearer Token (Mobile-optimized)

**Already implemented for mobile clients!** The app has:
- `POST /api/auth/token` - exchange session for JWT
- `POST /api/auth/token/refresh` - refresh JWT tokens
- Auth middleware accepts `Authorization: Bearer <token>` header
- RS256 asymmetric JWT (public/private key pair)

**Mobile Integration**:
```javascript
// In Capacitor app:
const { Preferences } = require('@capacitor/preferences');

// On login success:
const resp = await fetch('https://api.example.com/api/auth/token', {
  method: 'POST',
  credentials: 'include',
});
const { access_token, refresh_token } = await resp.json();
await Preferences.set({ key: 'access_token', value: access_token });
await Preferences.set({ key: 'refresh_token', value: refresh_token });

// On every API request:
const { value } = await Preferences.get({ key: 'access_token' });
fetch('/api/data', { headers: { 'Authorization': `Bearer ${value}` } });
```

### 3. Google OAuth

**How it works**: Redirect to Google consent screen → callback with code → server creates session.

**Mobile WebView Behavior**:
| Issue | Impact | Mitigation |
|---|---|---|
| OAuth in embedded WebView | Google blocks login in embedded browsers | Use `@capacitor/browser` to open in system browser |
| Redirect back to app | Needs deep link or custom scheme | Use `moneyflow://` URL scheme |
| Callback URL mismatch | Redirect URIs must match | Add custom scheme to Google Cloud Console |

**Implementation**:
```javascript
import { Browser } from '@capacitor/browser';
import { App } from '@capacitor/app';

// Open Google login in system browser
await Browser.open({ url: 'https://api.example.com/api/auth/google' });

// Listen for redirect back
App.addListener('appUrlOpen', (data) => {
  if (data.url.startsWith('moneyflow://auth/callback')) {
    // Extract code, exchange for session
  }
});
```

### 4. WebAuthn / Passkeys

**Status**: ⚠️ May NOT work in WKWebView on iOS. WebAuthn requires the `ASAuthorizationController` API which is not available in WKWebView.

**Alternative**: Use `@capacitor/biometric-auth` for Face ID / Touch ID integration instead.

### 5. CSRF Protection

**How it works**: Double-submit cookie pattern. `GET /api/auth/csrf-token` returns a token, sent back as `X-CSRF-Token` header on state-changing requests.

**Mobile WebView Behavior**: ✅ Works with cookies. Since the Capacitor app loads from `server.url`, cookies are in the same origin and CSRF works as expected.

### 6. TOTP (2FA)

**Mobile Behavior**: ✅ Works natively in WebView. No changes needed.

## Recommended Auth Strategy for Mobile

### Primary (simplest)
Use `server.url` mode → all cookie-based auth works naturally.
- User signs in normally via the login page
- Session cookie persists for the lifetime of the app
- On session expiry, user is redirected to login

### Advanced (preferred)
Use **JWT Bearer tokens** for API calls + token management via Capacitor Preferences:
1. On app start, check for stored JWT
2. If valid, use for all API calls (no redirect needed)
3. If expired, use refresh token to get new access token
4. If refresh fails, redirect to login

## Implementation Checklist

- [ ] Add `@capacitor/preferences` for token storage
- [ ] Create JWT auth service in Capacitor app
- [ ] Add Google OAuth callback handler with `@capacitor/browser`
- [ ] Configure `moneyflow://` URL scheme in Info.plist
- [ ] Test session cookie persistence across app restart
- [ ] Add biometric unlock option via `@capacitor/biometric-auth`
