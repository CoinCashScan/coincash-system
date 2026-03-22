// ── CoinCash Service Worker ────────────────────────────────────────────────
// Strategy:
//   • Static shell (HTML, icons, manifest) → Cache-First
//   • API calls (TronGrid, external) → Network-First, no cache
//   • Everything else → Stale-While-Revalidate

const CACHE_NAME    = 'coincash-v2';
const OFFLINE_URL   = '/';

// Files to precache on install (app shell)
const PRECACHE_URLS = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/favicon.png',
  '/favicon.svg',
];

// ── Install: precache shell ────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// ── Activate: remove old caches ────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: routing strategy ────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET requests
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // 1. API / external network calls → Network-Only (never cache blockchain data)
  if (
    url.hostname !== self.location.hostname ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/v1/')
  ) {
    event.respondWith(fetch(request));
    return;
  }

  // 2. Navigation requests (HTML) → Network-First with offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(OFFLINE_URL))
    );
    return;
  }

  // 3. Static assets (JS, CSS, images, fonts) → Cache-First, update in background
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      });
      return cached ?? networkFetch;
    })
  );
});

// ── Push notifications ─────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload;
  try { payload = event.data.json(); } catch { payload = { title: 'CoinCash', body: event.data.text() }; }

  const title   = payload.title ?? 'CoinCash';
  const options = {
    body:    payload.body  ?? 'Nuevo mensaje',
    icon:    '/icon-192.png',
    badge:   '/icon-192.png',
    data:    payload.data  ?? {},
    vibrate: [200, 100, 200],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// ── Notification click ─────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client) return client.focus();
        }
        if (self.clients.openWindow) return self.clients.openWindow('/');
      })
  );
});
