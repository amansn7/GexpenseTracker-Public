const CACHE = 'gexpense-mobile-v3';

const PRECACHE = [
  '/mobile',
  '/static/mobile/manifest.json',
];

const CDN_CACHE = 'gexpense-cdn-v1';

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE && k !== CDN_CACHE).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // CDN resources: cache-first
  if (url.hostname === 'unpkg.com' || url.hostname.includes('fonts.g')) {
    e.respondWith(
      caches.open(CDN_CACHE).then(c =>
        c.match(e.request).then(r => {
          if (r) return r;
          return fetch(e.request).then(res => {
            c.put(e.request, res.clone());
            return res;
          });
        })
      )
    );
    return;
  }

  // App shell: network-first, fallback to cache
  if (url.pathname === '/mobile' || url.pathname.startsWith('/static/mobile')) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          caches.open(CACHE).then(c => c.put(e.request, res.clone()));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
  }
});
