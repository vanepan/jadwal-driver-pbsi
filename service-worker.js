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

const SW_VERSION  = '1.13.1';   // stamped from config.js — do not edit by hand
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

/* ── Push (v1.11.3) ──────────────────────────────────────────
   Additive only — does NOT touch the cache/update lifecycle above.
   Payload (from the server dispatcher) is JSON: { title, body, data }.
   userVisibleOnly is enforced: every push shows a notification. */
self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch (_) { payload = {}; }

  const title = payload.title || 'Sarpras Operations';
  const options = {
    body: payload.body || '',
    data: payload.data || {},
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    // Collapse repeat notifications for the same entity (data.entityId).
    tag: (payload.data && payload.data.entityId) || undefined,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

/* ── Push subscription change (v1.12.2) ──────────────────────
   The push service can rotate/expire an endpoint out from under us
   (common on iOS/Safari installed PWAs — the #1 cause of a 2nd device
   silently dropping out of delivery). When the browser fires this, the
   old endpoint is dead; re-subscribe immediately using the prior
   applicationServerKey (so we need no VAPID constant in the SW) and tell
   any open client to register the new endpoint on the server. If no
   client is open, the client-side heal in push.js#initPush re-registers
   on the next app open (and the server prunes the dead endpoint on the
   next 410). */
self.addEventListener('pushsubscriptionchange', event => {
  event.waitUntil((async () => {
    try {
      const appServerKey = event.oldSubscription && event.oldSubscription.options
        ? event.oldSubscription.options.applicationServerKey : undefined;
      await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: appServerKey || undefined,
      });
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const c of clients) c.postMessage({ type: 'PUSH_RESUBSCRIBED' });
    } catch (_) { /* best-effort; initPush heals on next open */ }
  })());
});

/* ── Notification click (v1.11.3) ────────────────────────────
   Focus an existing app window and route it (postMessage NAV), else
   open a new one at the deep link. */
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = all.find(c => c.url.indexOf(self.registration.scope) === 0);
    if (existing) {
      await existing.focus();
      existing.postMessage({ type: 'NAV', url: target });
    } else {
      await self.clients.openWindow(target);
    }
  })());
});
