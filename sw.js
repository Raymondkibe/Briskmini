// Brisk Mini service worker
// Caches the app shell (this file, index.html, the games hub, icons) so the
// browser chrome itself opens instantly and works offline. Proxied pages
// (/api/proxy?...) are always fetched live and are never cached here, since
// their whole point is fresh, compressed content from the real backend.

const CACHE_VERSION = 'briskmini-shell-v1';
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/games.html'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never cache/intercept the live proxy or any other API call.
  if (url.pathname.startsWith('/api/')) return;

  // Only handle same-origin GET requests for the shell.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, copy));
          }
          return res;
        })
        .catch(() => cached);
      // Stale-while-revalidate: serve cache instantly, refresh in background.
      return cached || network;
    })
  );
});
