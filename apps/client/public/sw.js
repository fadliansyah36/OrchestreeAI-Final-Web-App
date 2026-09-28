// OrchestreeAI Production Service Worker
// PRD v2.2 / AGENTS.md: never cache personalized or business-data HTML.
// Only the public shell and immutable static assets may be cached.

const CACHE_NAME = 'orchestree-pwa-v3';
const PRECACHE_ASSETS = [
  '/',
  '/manifest.json',
  '/favicon.ico',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Business APIs, health probes, WebSocket handshakes and all writes are network-only.
  if (
    request.method !== 'GET' ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/health/') ||
    url.pathname.startsWith('/public/') ||
    url.pathname.startsWith('/ws') ||
    url.pathname === '/openapi.json'
  ) {
    return;
  }

  // Navigation is deliberately network-only.
  // This prevents personalized tenant/auth HTML from entering the browser cache.
  if (request.mode === 'navigate') {
    return;
  }

  // Only static assets are cacheable.
  if (
    request.destination === 'image' ||
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'font'
  ) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        const networkRequest = fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const clone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            }
            return networkResponse;
          });

        return cachedResponse || networkRequest;
      })
    );
  }
});