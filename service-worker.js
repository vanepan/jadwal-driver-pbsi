'use strict';

/* ============================================================
   Service Worker — Sarpras Operations v1.9.1
   Strategy:
     • Install  → precache offline.html only; no skipWaiting
     • Activate → purge stale caches, claim clients
     • Fetch    → Firebase: network-only
                  navigate : network-first → offline.html fallback
                  static   : cache-first  → network fill
     • Message  → SKIP_WAITING to accept pending update
   ============================================================ */

const CACHE_NAME  = 'sarpras-cache-v1.9.1';
const OFFLINE_URL = '/offline.html';

/* Origins that must never be served from cache */
const BYPASS_ORIGINS = [
  'firebaseio.com',
  'firebase.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'firestore.googleapis.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
];

/* File extensions that qualify as cacheable static assets */
const STATIC_EXT = /\.(css|js|mjs|png|jpg|jpeg|webp|svg|ico|woff2?|ttf|otf|json)(\?|$)/i;

function _isBypassOrigin(url) {
  return BYPASS_ORIGINS.some(o => url.hostname.endsWith(o));
}

function _isStaticAsset(url) {
  return STATIC_EXT.test(url.pathname);
}

/* ── Install ─────────────────────────────────────────────── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.add(OFFLINE_URL))
  );
  /* Do NOT skipWaiting — let the update-detection flow handle it
     so the app can show "Versi baru tersedia" before activating. */
});

/* ── Activate ────────────────────────────────────────────── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* ── Fetch ───────────────────────────────────────────────── */
self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  /* Skip browser internals and Firebase/font CDN */
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return;
  if (_isBypassOrigin(url)) return;

  /* Navigation requests: network-first, offline.html fallback */
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .catch(() => caches.match(OFFLINE_URL))
    );
    return;
  }

  /* Static assets: cache-first, fill cache on network hit */
  if (_isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(c => c.put(request, clone));
          }
          return response;
        }).catch(() => cached);
      })
    );
    return;
  }

  /* All other requests: network-only (no caching) */
});

/* ── Messages ────────────────────────────────────────────── */
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
