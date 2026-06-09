const { useState, useEffect, useRef } = React;

// ── Runtime Detection ────────────────────────────────────────────
const isCapacitor = () => typeof window !== "undefined" && window.Capacitor?.isNativePlatform?.();

// ── Token Storage ────────────────────────────────────────────────
const TOKEN_KEY = "mf_jwt_access";
const REFRESH_KEY = "mf_jwt_refresh";

const getAccessToken = () => localStorage.getItem(TOKEN_KEY);
const getRefreshToken = () => localStorage.getItem(REFRESH_KEY);
const setTokens = (access, refresh) => {
  localStorage.setItem(TOKEN_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
};
const clearTokens = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
};

// ── Capacitor Auth Flow ──────────────────────────────────────────
const isCapacitorAuth = () => isCapacitor() && !!getAccessToken();

const setupCapacitorBridge = () => {
  if (!isCapacitor()) return;

  const Cap = window.Capacitor;
  const Browser = Cap.Plugins.Browser;
  const App = Cap.Plugins.App;

  // Listen for OAuth callback — Browser opens page with JWT tokens
  // The page URL contains ?access_token=...&refresh_token=...
  Browser.addListener("browserPageLoaded", (info) => {
    try {
      const url = new URL(info.url);
      const access = url.searchParams.get("access_token");
      const refresh = url.searchParams.get("refresh_token");
      if (access && refresh) {
        setTokens(access, refresh);
        Browser.close();
        // Reload the main app with JWT auth
        window.location.reload();
      }
    } catch {}
  });

  // Handle custom scheme deep links (fallback)
  App.addListener("appUrlOpen", (data) => {
    try {
      const url = new URL(data.url);
      if (url.hostname === "auth" || url.pathname.startsWith("/auth")) {
        const access = url.searchParams.get("access_token");
        const refresh = url.searchParams.get("refresh_token");
        if (access && refresh) {
          setTokens(access, refresh);
          window.location.reload();
        }
      }
    } catch {}
  });

  // Patch the login page: hide passkey, intercept Google OAuth
  const patchLogin = () => {
    // Remove passkey button — WebAuthn unavailable in WKWebView
    const passkeySection = document.getElementById("passkey-section");
    if (passkeySection) {
      const passkeyBtn = document.getElementById("passkey-btn");
      if (passkeyBtn) {
        passkeyBtn.style.display = "none";
      }
      const orDivider = passkeySection.querySelector("div[style*='margin:16px 0']");
      if (orDivider) orDivider.style.display = "none";
    }

    // Intercept Google OAuth to use system browser
    document.querySelectorAll('a[href="/api/auth/google"]').forEach((btn) => {
      const newBtn = btn.cloneNode(true);
      newBtn.removeAttribute("href");
      newBtn.style.cursor = "pointer";
      newBtn.addEventListener("click", (e) => {
        e.preventDefault();
        Browser.open({
          url: "/api/auth/google?redirect=" + encodeURIComponent(window.location.origin + "/oauth/success"),
        });
      });
      btn.parentNode.replaceChild(newBtn, btn);
    });
  };

  // Patch the main app API layer to use JWT Bearer tokens
  const patchAPI = () => {
    const accessToken = getAccessToken();
    if (!accessToken) return;

    // Wait for window.API to be available (defined in data.jsx)
    const interval = setInterval(() => {
      if (!window.API) return;
      clearInterval(interval);

      const origFetch = window.API._fetch || window.fetch;
      const origGet = window.API.get;
      const origPost = window.API.post;
      const origPatch = window.API.patch;
      const origDelete = window.API.delete;

      if (!window.API._patched) {
        window.API._patched = true;

        const withBearer = (url, opts = {}) => {
          const headers = { ...opts.headers };
          headers["Authorization"] = "Bearer " + accessToken;
          // Remove credentials: 'include' since we're using Bearer
          return fetch(url, { ...opts, headers, credentials: "omit" });
        };

        if (origGet) {
          window.API.get = (path) => withBearer(path, { method: "GET" }).then((r) => r.json());
        }
        if (origPost) {
          window.API.post = (path, body) =>
            withBearer(path, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            }).then((r) => r.json());
        }
        if (origPatch) {
          window.API.patch = (path, body) =>
            withBearer(path, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            }).then((r) => r.json());
        }
        if (origDelete) {
          window.API.delete = (path) => withBearer(path, { method: "DELETE" }).then((r) => r.json());
        }
      }
    }, 50);
  };

  // Apply patches based on current page
  if (document.getElementById("passkey-btn")) {
    patchLogin();
  }
  if (getAccessToken()) {
    patchAPI();
  }

  // Expose JWT refresh on window for use by the app
  window._refreshJWT = async () => {
    const refresh = getRefreshToken();
    if (!refresh) return false;
    try {
      const r = await fetch("/api/auth/token/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refresh }),
      });
      if (!r.ok) throw new Error("Refresh failed");
      const data = await r.json();
      setTokens(data.access_token, data.refresh_token);
      return true;
    } catch {
      clearTokens();
      return false;
    }
  };
};

// ── Init on DOM ready ────────────────────────────────────────────
if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupCapacitorBridge);
  } else {
    setupCapacitorBridge();
  }
}
