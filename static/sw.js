// MoneyFlow Service Worker — App Shell pattern
// Cache version is determined by /static/dist/manifest.json at install time

const CACHE_PREFIX = "mf-shell";
const STATIC_CACHE = CACHE_PREFIX + "-static";

self.addEventListener("install", (e) => {
  e.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      try {
        const res = await fetch("/static/dist/manifest.json");
        const manifest = await res.json();
        const ver = manifest.version || "1";
        const versionedCache = CACHE_PREFIX + "-v" + ver;
        const vCache = await caches.open(versionedCache);
        const shellUrls = manifest.shell || [];
        await vCache.addAll(shellUrls);
        await cache.addAll(shellUrls);
        // Store active cache name for activate handler
        self.__activeCache = versionedCache;
      } catch {
        const fallbackUrls = [
          "/static/styles.css",
          "/static/vendor/react.production.min.js",
          "/static/vendor/react-dom.production.min.js",
          "/static/dist/vendor/d3-sankey.js",
          "/static/dist/vendor/react-window.js",
          "/static/dist/components/Button.js",
          "/static/dist/components/Input.js",
          "/static/dist/components/Modal.js",
          "/static/dist/components/BottomSheet.js",
          "/static/dist/components/ProgressBar.js",
          "/static/dist/components/Skeleton.js",
          "/static/dist/components/Toggle.js",
          "/static/dist/mf-core.js",
          "/static/dist/mf-app.js",
        ];
        await cache.addAll(fallbackUrls);
        self.__activeCache = STATIC_CACHE;
      }
    })()
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      const active = self.__activeCache || STATIC_CACHE;
      await Promise.all(
        keys
          .filter((k) => k.startsWith(CACHE_PREFIX) && k !== active)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

function isFontUrl(url) {
  return url.hostname === "fonts.gstatic.com";
}

function isApiCall(url) {
  return url.pathname.startsWith("/api/");
}

function isStaticAsset(url) {
  return url.pathname.startsWith("/static/") && !url.pathname.endsWith("/sw.js");
}

self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  if (isApiCall(url)) {
    e.respondWith(
      fetch(e.request).catch(() =>
        new Response(
          JSON.stringify({
            error: "offline",
            detail: "You are offline. Data will refresh when connection returns.",
          }),
          { status: 503, headers: { "Content-Type": "application/json" } }
        )
      )
    );
    return;
  }

  // Only intercept same-origin requests for static assets
  // Cross-origin requests (profile images, external resources) pass through naturally
  if (isFontUrl(url) || (url.origin === self.location.origin && isStaticAsset(url))) {
    e.respondWith(
      (async () => {
        const cached = await caches.match(e.request);
        if (cached) {
          fetch(e.request).then((res) => {
            if (res.ok) {
              const clone = res.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(e.request, clone));
            }
          }).catch(() => {});
          return cached;
        }
        try {
          const res = await fetch(e.request);
          if (res.ok) {
            const clone = res.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(e.request, clone));
          }
          return res;
        } catch {
          return new Response(null, { status: 504 });
        }
      })()
    );
    return;
  }

  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(e.request).catch(() =>
        caches.match(e.request).then((cached) => cached || new Response(null, { status: 504 }))
      )
    );
  }
  // Cross-origin requests pass through — let the browser handle them naturally
});
