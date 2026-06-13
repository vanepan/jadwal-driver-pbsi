'use strict';

/* ============================================================
   PUSH — Web Push opt-in, subscription, and lifecycle (v1.11.3)

   Channel #3 of the unified notification pipeline. This module is the
   CLIENT half: permission UX + subscription minting. The send side is
   entirely server-side (Notification Engine → Dispatcher → dispatchPush).
   There is NO client send path.

   Flow (architecture §5):  Soft Ask → Install Check (iOS) →
   Native Prompt → subscribe() → register (server-only write).

   Foundation discipline:
     • Feature-degrades silently where push is unsupported (old iOS,
       no PushManager) — the affordance never appears.
     • Never cold-prompts. Soft-ask is gated by a 7-day TTL.
     • deviceId is stable (localStorage + IndexedDB mirror) so endpoint
       rotation overwrites one record instead of orphaning tokens.
     • Reuses pwa.js platform/install detection and the iOS install modal.
   ============================================================ */

import { APP_VERSION, VAPID_PUBLIC_KEY } from './config.js';
import { getPWAState, showIOSInstallModal } from './pwa.js';
import { callRegisterPushSubscription, callUnregisterPushSubscription } from './firebase.js';
import { showToast } from './utils.js';

const DEVICE_ID_KEY    = 'pbsi_device_id';
const SOFT_ASK_KEY     = 'pbsi_push_softasked';
const SOFT_ASK_TTL     = 7 * 24 * 60 * 60 * 1000; // 7 days (mirrors pwa.js install-dismiss)
const IDB_NAME         = 'pbsi-push';
const IDB_STORE        = 'kv';

let _softAskEl = null;

/* ── Feature detection ─────────────────────────────────────── */

export function isPushSupported() {
  return typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager'   in window &&
    'Notification'  in window &&
    Boolean(VAPID_PUBLIC_KEY);
}

/* ── Stable device id (localStorage + IndexedDB mirror) ─────── */

function _idbGet(key) {
  return new Promise((resolve) => {
    try {
      const open = indexedDB.open(IDB_NAME, 1);
      open.onupgradeneeded = () => open.result.createObjectStore(IDB_STORE);
      open.onerror = () => resolve(null);
      open.onsuccess = () => {
        try {
          const tx = open.result.transaction(IDB_STORE, 'readonly');
          const req = tx.objectStore(IDB_STORE).get(key);
          req.onsuccess = () => resolve(req.result || null);
          req.onerror = () => resolve(null);
        } catch (_) { resolve(null); }
      };
    } catch (_) { resolve(null); }
  });
}

function _idbSet(key, value) {
  return new Promise((resolve) => {
    try {
      const open = indexedDB.open(IDB_NAME, 1);
      open.onupgradeneeded = () => open.result.createObjectStore(IDB_STORE);
      open.onerror = () => resolve(false);
      open.onsuccess = () => {
        try {
          const tx = open.result.transaction(IDB_STORE, 'readwrite');
          tx.objectStore(IDB_STORE).put(value, key);
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => resolve(false);
        } catch (_) { resolve(false); }
      };
    } catch (_) { resolve(false); }
  });
}

async function getDeviceId() {
  let id = null;
  try { id = localStorage.getItem(DEVICE_ID_KEY); } catch (_) {}
  if (!id) id = await _idbGet(DEVICE_ID_KEY);
  if (!id) {
    id = (crypto && crypto.randomUUID) ? crypto.randomUUID()
      : `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
  try { localStorage.setItem(DEVICE_ID_KEY, id); } catch (_) {}
  _idbSet(DEVICE_ID_KEY, id); // best-effort mirror (durable + SW-readable)
  return id;
}

/* ── Soft-ask TTL ──────────────────────────────────────────── */

function _softAsked() {
  try {
    const ts = localStorage.getItem(SOFT_ASK_KEY);
    return Boolean(ts) && (Date.now() - Number(ts) < SOFT_ASK_TTL);
  } catch (_) { return false; }
}
function _recordSoftAsk() {
  try { localStorage.setItem(SOFT_ASK_KEY, String(Date.now())); } catch (_) {}
}

/* ── VAPID key encoding ────────────────────────────────────── */

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/* ── Core opt-in flow ──────────────────────────────────────── */

/**
 * Run the full opt-in: iOS install gate → native prompt → subscribe →
 * register. Must be called from a user gesture. Returns true on success.
 */
export async function enablePush() {
  if (!isPushSupported()) {
    showToast('Notifikasi push tidak didukung di perangkat ini.');
    return false;
  }

  const pwa = getPWAState();

  // iOS gate: push requires an installed (A2HS) PWA on iOS 16.4+.
  if (pwa.isIOSSafari && !pwa.isInstalled) {
    showIOSInstallModal();
    return false;
  }

  // Already denied → cannot re-prompt; guide to settings.
  if (Notification.permission === 'denied') {
    showToast('Notifikasi diblokir. Aktifkan lewat pengaturan browser/OS.');
    return false;
  }

  const permission = Notification.permission === 'granted'
    ? 'granted'
    : await Notification.requestPermission();
  if (permission !== 'granted') return false;

  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }
    await _register(sub);
    showToast('Notifikasi aktif di perangkat ini.');
    return true;
  } catch (err) {
    console.warn('[push] enable failed:', err);
    showToast('Gagal mengaktifkan notifikasi. Coba lagi.');
    return false;
  }
}

async function _register(subscription) {
  const deviceId = await getDeviceId();
  const platform = getPWAState().platform || 'other';
  await callRegisterPushSubscription({
    deviceId,
    subscription: subscription.toJSON(),
    platform,
    appVersion: APP_VERSION,
  });
}

/**
 * Disable push on this device: unsubscribe locally + delete the server
 * record. Used by a Settings toggle and as part of logout cleanup.
 */
export async function disablePush() {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) await sub.unsubscribe();
  } catch (err) { console.warn('[push] unsubscribe failed:', err); }
  try {
    const deviceId = await getDeviceId();
    await callUnregisterPushSubscription({ deviceId });
  } catch (err) { console.warn('[push] unregister failed:', err); }
}

/**
 * Logout cleanup — best-effort, awaited so it completes before the
 * post-logout reload. A logged-out device must stop receiving push.
 */
export async function cleanupPushOnLogout() {
  if (!isPushSupported()) return;
  try { await disablePush(); } catch (_) {}
}

/* ── Soft-ask card (built in JS, mirrors pwa.js banner pattern) ─ */

function _showSoftAsk() {
  if (_softAskEl) { _softAskEl.style.display = 'flex'; return; }
  const card = document.createElement('div');
  card.id = 'pushSoftAsk';
  card.className = 'v2-pwa-install-banner'; // reuse existing banner styling
  card.innerHTML = `
    <div class="v2-pwa-install-icon" aria-hidden="true">🔔</div>
    <div class="v2-pwa-install-info">
      <span class="v2-pwa-install-name">Aktifkan Notifikasi</span>
      <span class="v2-pwa-install-hint">Tahu langsung saat ada penugasan, persetujuan, atau pembatalan.</span>
    </div>
    <button class="v2-pwa-install-cta" type="button" id="btnPushEnable">Aktifkan</button>
    <button class="v2-pwa-install-close" type="button" id="btnPushDismiss" aria-label="Tutup">&times;</button>
  `;
  document.body.appendChild(card);
  _softAskEl = card;

  // Dismiss is an explicit "not now" → suppress for the TTL.
  document.getElementById('btnPushDismiss')?.addEventListener('click', () => {
    _recordSoftAsk();
    card.style.display = 'none';
  });
  // Enable: only record (suppress) on SUCCESS. A failed activation must NOT
  // suppress the soft-ask — the user keeps the card and can retry immediately.
  document.getElementById('btnPushEnable')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnPushEnable');
    if (btn) btn.disabled = true;
    const ok = await enablePush();
    if (ok) {
      _recordSoftAsk();
      card.style.display = 'none';
    } else if (btn) {
      btn.disabled = false; // allow immediate retry
    }
  });
}

/* ── Deep-link routing (from SW notificationclick) ──────────── */

function _emitNav(url) {
  try {
    const u = new URL(url, window.location.origin);
    const view = u.searchParams.get('view');
    const id = u.searchParams.get('id');
    // Non-destructive: broadcast for any interested module to handle.
    window.dispatchEvent(new CustomEvent('pbsi:push-nav', { detail: { view, id, url } }));
  } catch (_) {}
}

function _initNavigation() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'NAV' && event.data.url) _emitNav(event.data.url);
  });
  // Cold start: a notification may have opened the app at a deep link.
  const params = new URLSearchParams(window.location.search);
  if (params.get('view') && params.get('id')) _emitNav(window.location.href);
}

/* ── Public init ───────────────────────────────────────────── */

/**
 * Initialize push for a signed-in session. Call AFTER auth is ready.
 *   • wires deep-link navigation,
 *   • if already subscribed, re-registers (idempotent — refreshes the
 *     server record / lastSeenAt and heals a missing one),
 *   • otherwise offers the soft-ask once (TTL-gated).
 */
export async function initPush() {
  _initNavigation();
  if (!isPushSupported()) return;

  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub && Notification.permission === 'granted') {
      await _register(sub); // refresh lastSeenAt / heal server record
      return;
    }
  } catch (err) { console.warn('[push] init check failed:', err); }

  // Not subscribed yet → gentle soft-ask after the UI settles (once / 7 days).
  if (Notification.permission !== 'denied' && !_softAsked()) {
    setTimeout(() => { if (!_softAsked()) _showSoftAsk(); }, 8000);
  }
}
