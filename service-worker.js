'use strict';

/* ============================================================
   Service Worker — Sarpras Operations
   Strategy:
     • Install  → precache offline.html only; no skipWaiting
     • Activate → purge stale caches, claim clients
     • Fetch    → Firebase: network-only
                  version.json: network-only (never cached)
                  navigate : network-first → offline.html fallback
                  static   : cache-first  → network fill
     • Message  → SKIP_WAITING to accept pending update

   CACHE LIFECYCLE — why this works for EVERY release:
   SW_VERSION is stamped from config.js APP_VERSION by
   scripts/sync-version.mjs at deploy time. Because the version is
   embedded here, service-worker.js bytes CHANGE on every release →
   the browser detects a new SW → installs it (waiting) → the update
   banner activates it → activate() purges the old version-scoped
   cache → cache-first re-fetches every asset fresh. No manual cache
   bump, no reinstall, no drift between deployed and installed.
   ============================================================ */

const SW_VERSION  = '1.10.8';   // stamped from config.js — do not edit by hand
const CACHE_NAME  = `sarpras-cache-v${SW_VERSION}`;
const OFFLINE_URL = '/offline.html';
const VERSION_URL = '/version.json';

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

  /* Version oracle must ALWAYS be fresh — never cache, never serve cached.
     This is the signal the app uses to detect a new deployment. */
  if (url.pathname === VERSION_URL) return;

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
