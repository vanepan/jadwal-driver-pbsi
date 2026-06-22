'use strict';

/* ============================================================
   PWA — Install + Update lifecycle
   Handles install detection, prompt capture, iOS onboarding,
   service worker registration, update detection, update banner,
   and global install onboarding (all roles).

   UPDATE MODEL — SILENT AUTO-UPDATE (v1.15.5.2; no banner, no button):
     1. register with updateViaCache:'none' so the SW script is never
        served from the HTTP cache.
     2. On load + on focus/visibility (throttled), call reg.update()
        and fetch /version.json (no-store) — the deployed-version oracle.
        This only DOWNLOADS a newer SW into the waiting state.
     3. A newer SW is APPLIED automatically ONLY during the startup window
        (first STARTUP_APPLY_WINDOW_MS after load) and only when the user
        is not mid-task (_isBusy): a tiny "Memperbarui…" toast is shown,
        SKIP_WAITING is posted, and controllerchange triggers ONE guarded
        reload. The new SW's activate() purges the old cache, so every
        asset (incl. config.js) is re-fetched fresh.
     4. If a newer SW appears AFTER the startup window (app already open),
        it is left waiting and only flagged internally (swUpdateAvailable);
        it activates automatically on the NEXT launch's startup window.
   LOOP SAFETY: at most one auto-reload per page (_reloading) AND at most
     one auto-reload attempt per tab session keyed by APP_VERSION
     (sessionStorage), so a failed activation can never reload-loop.
   ============================================================ */

import { APP_VERSION } from './config.js';

const VERSION_URL = '/version.json';

/* How long after initial load an update may be applied AUTOMATICALLY (with a
   silent reload). After this window any newer SW is left waiting and applied on
   the next launch instead — so we never reload a user who is mid-task. The
   _isBusy() guard adds a second layer of protection within the window itself. */
const STARTUP_APPLY_WINDOW_MS = 60000;
/* sessionStorage key: records the APP_VERSION we last auto-reloaded FROM, so a
   failed activation cannot trigger an infinite reload loop in the same session. */
const _SESSION_RELOAD_KEY = 'pbsi_pwa_autoreload_from';

const _stateCallbacks = [];

let _deferredPrompt    = null;
let _swRegistration    = null;
let _installBannerEl   = null;
let _bannerCheckDone   = false; // true once the 3-second startup check has fired
let _skipWaitingTriggered = false; // an auto-apply is in flight → allow auto-reload
let _reloading            = false; // ensures we reload at most once
let _lastUpdateCheck      = 0;     // throttle for focus/visibility update checks
let _startupDeadline      = 0;     // Date.now() before which auto-apply is allowed

let _state = {
  /* Install */
  isInstalled:       false,
  platform:          'other',   // 'ios-safari' | 'android-chrome' | 'desktop-chrome' | 'other'
  canInstall:        false,
  isIOSSafari:       false,
  displayMode:       'browser', // 'standalone' | 'browser'
  /* Service Worker */
  swStatus:          'unsupported', // 'unsupported' | 'registering' | 'active' | 'failed'
  swUpdateAvailable: false,
  swCacheCount:      null,       // number | null — filled async after SW activates
  /* Version */
  appVersion:        APP_VERSION,
};

/* ── Install-dismiss persistence ───────────────────────────── */

const _INSTALL_DISMISS_KEY = 'pbsi_pwa_install_dismissed';
const _INSTALL_DISMISS_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

function _installDismissed() {
  try {
    const ts = localStorage.getItem(_INSTALL_DISMISS_KEY);
    return Boolean(ts) && (Date.now() - Number(ts) < _INSTALL_DISMISS_TTL);
  } catch (_) { return false; }
}

function _recordInstallDismiss() {
  try { localStorage.setItem(_INSTALL_DISMISS_KEY, String(Date.now())); } catch (_) {}
}

/* ── Module-level event listeners (run before DOMContentLoaded) */

/* Capture beforeinstallprompt early so we never miss it */
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  _deferredPrompt   = e;
  _state.canInstall = true;
  /* If the startup check already fired but couldn't show (no prompt yet), show now */
  if (_bannerCheckDone && !_installBannerEl && !_state.isInstalled && !_installDismissed()) {
    _showAndroidInstallBanner();
  }
  _notifyListeners();
});

window.addEventListener('appinstalled', () => {
  _deferredPrompt        = null;
  _state.isInstalled     = true;
  _state.canInstall      = false;
  _state.displayMode     = 'standalone';
  _hideInstallBanner();
  _notifyListeners();
});

/* ── Platform helpers ──────────────────────────────────────── */

function _detectPlatform() {
  const ua = navigator.userAgent || '';
  const isIOS       = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
  const isIOSSafari = isIOS && /Safari/i.test(ua) && !/CriOS|FxiOS|OPiOS/i.test(ua);
  const isAndroid   = /Android/i.test(ua);
  const isChrome    = /Chrome\/\d/i.test(ua) && !/Edg\/|OPR\/|Brave/i.test(ua);
  const isMobile    = isIOS || isAndroid;

  if (isIOSSafari)             return 'ios-safari';
  if (isAndroid && isChrome)   return 'android-chrome';
  if (!isMobile && isChrome)   return 'desktop-chrome';
  return 'other';
}

function _detectInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;
}

function _notifyListeners() {
  _syncHeaderInstallButton();
  const snap = getPWAState();
  _stateCallbacks.forEach(cb => cb(snap));
}

/* ── Header install affordance ─────────────────────────────────
   A header action button (#btnHeaderInstall) that exposes install
   directly from the topbar — reusing the existing install logic.
   Visible only when the app is installable and not yet installed. */

function _headerInstallShouldShow() {
  // iOS Safari never fires beforeinstallprompt, but Add-to-Home-Screen is
  // available — surface the button so it can open the iOS onboarding modal.
  if (_state.isInstalled) return false;
  return _state.canInstall || _state.isIOSSafari;
}

function _syncHeaderInstallButton() {
  const btn = document.getElementById('btnHeaderInstall');
  if (!btn) return;
  btn.style.display = _headerInstallShouldShow() ? '' : 'none';
}

function _initHeaderInstallButton() {
  const btn = document.getElementById('btnHeaderInstall');
  if (!btn || btn.dataset.pwaWired) return;
  btn.dataset.pwaWired = '1';

  btn.addEventListener('click', async () => {
    // iOS Safari → onboarding modal (no programmatic prompt available).
    if (_state.isIOSSafari) {
      showIOSInstallModal();
      return;
    }
    // Android / Windows Chrome / Edge → reuse the captured beforeinstallprompt.
    btn.disabled = true;
    const accepted = await triggerInstallPrompt();
    // On accept, appinstalled fires and _syncHeaderInstallButton() hides it.
    // On dismiss, re-enable so the user can try again.
    if (!accepted) btn.disabled = false;
  });

  _syncHeaderInstallButton();
}

/* ── Cache query (async) ───────────────────────────────────── */

async function _refreshCacheCount() {
  if (!('caches' in window)) return;
  try {
    const keys = await caches.keys();
    let total = 0;
    for (const key of keys) {
      const cache    = await caches.open(key);
      const requests = await cache.keys();
      total += requests.length;
    }
    _state.swCacheCount = total;
    _notifyListeners();
  } catch (_) { /* non-fatal */ }
}

/* ── Silent auto-update ─────────────────────────────────────────
   No banner, no button. A newer worker is applied automatically during the
   startup window; outside it, the update is deferred to the next launch. */

/** Brief, non-interactive "updating…" toast. Disappears with the reload. */
function _showUpdateToast() {
  if (document.getElementById('pwaUpdateToast')) return;
  const t = document.createElement('div');
  t.id = 'pwaUpdateToast';
  t.setAttribute('role', 'status');
  t.setAttribute('aria-live', 'polite');
  t.textContent = 'Memperbarui aplikasi ke versi terbaru…';
  t.style.cssText = [
    'position:fixed', 'left:50%', 'bottom:24px', 'transform:translateX(-50%)',
    'z-index:100000', 'max-width:90vw', 'padding:11px 18px',
    'background:#1A1A2E', 'color:#F0EFF0', 'font-size:0.86rem', 'font-weight:500',
    'border-radius:10px', 'box-shadow:0 4px 18px rgba(0,0,0,0.22)', 'font-family:inherit',
    'padding-bottom:max(11px,env(safe-area-inset-bottom))', 'pointer-events:none',
  ].join(';');
  document.body.appendChild(t);
}

/** True if the user may be mid-task — defer the reload rather than lose state. */
function _isBusy() {
  try {
    const hook = window.__pwaIsBusy;
    if (typeof hook === 'function') return !!hook();
    if (hook === true) return true;
  } catch (_) { /* hook threw — fall through to heuristic */ }
  // Heuristic fallback (active editing): a focused text field or an open modal.
  const ae = document.activeElement;
  if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return true;
  if (document.querySelector('.modal-overlay[style*="flex"]')) return true;
  return false;
}

/** Auto-apply is permitted only during the startup window, when idle, once. */
function _canAutoApply() {
  return Date.now() < _startupDeadline && !_isBusy() && !_reloading && !_skipWaitingTriggered;
}

/**
 * Silently activate the waiting worker and reload exactly once. Guarded so a
 * failed activation cannot loop: at most one attempt per tab session, keyed by
 * the APP_VERSION we are leaving (a successful update changes APP_VERSION, so a
 * later genuine update is still allowed; a failure that lands back on the same
 * version is blocked for the rest of the session and retried next launch).
 */
function _applyUpdateSilently() {
  const waiting = _swRegistration && _swRegistration.waiting;
  if (!waiting || _skipWaitingTriggered || _reloading) return;
  try {
    if (sessionStorage.getItem(_SESSION_RELOAD_KEY) === APP_VERSION) return; // already tried this session
    sessionStorage.setItem(_SESSION_RELOAD_KEY, APP_VERSION);
  } catch (_) { /* sessionStorage unavailable — _reloading still bounds to one */ }

  _skipWaitingTriggered = true;
  _showUpdateToast();
  waiting.postMessage('SKIP_WAITING'); // → SW activates → controllerchange → reload

  // Fallback: if controllerchange does not fire shortly, reload once anyway.
  setTimeout(() => { if (!_reloading) { _reloading = true; window.location.reload(); } }, 3000);
}

/* ── Deployed-version oracle ───────────────────────────────────
   Fetches /version.json (never cached by the SW) and compares the
   DEPLOYED version against the RUNNING bundle's APP_VERSION. A
   mismatch means a new deployment exists even if the browser hasn't
   yet noticed the new SW — so we pull it and surface the banner. */
async function _checkDeployedVersion() {
  try {
    const res = await fetch(`${VERSION_URL}?_=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    const deployed = data && data.version;
    if (deployed && deployed !== APP_VERSION) {
      _state.swUpdateAvailable = true;
      // Pull the newer SW into the waiting state. The actual silent activation
      // is driven by the `updatefound` handler (gated to the startup window) or
      // the waiting-at-startup check — never directly here, so a focus/visibility
      // check while the app is open can only DOWNLOAD, never reload.
      try { await _swRegistration?.update?.(); } catch (_) { /* non-fatal */ }
      _notifyListeners();
    }
  } catch (_) { /* offline or version.json absent — non-fatal */ }
}

/* Throttled update check for focus / visibility / reopen of installed app. */
function _maybeCheckUpdate() {
  const now = Date.now();
  if (now - _lastUpdateCheck < 60000) return; // at most once per minute
  _lastUpdateCheck = now;
  if (_swRegistration) { try { _swRegistration.update(); } catch (_) {} }
  _checkDeployedVersion();
}

/* ── Install banner (Android) ──────────────────────────────── */

function _hideInstallBanner() {
  if (_installBannerEl) _installBannerEl.style.display = 'none';
}

function _showAndroidInstallBanner() {
  if (_installBannerEl) {
    _installBannerEl.style.display = 'flex';
    return;
  }

  const banner = document.createElement('div');
  banner.id        = 'pwaInstallBanner';
  banner.className = 'v2-pwa-install-banner';
  banner.innerHTML = `
    <div class="v2-pwa-install-icon" aria-hidden="true">S</div>
    <div class="v2-pwa-install-info">
      <span class="v2-pwa-install-name">Sarpras Operations</span>
      <span class="v2-pwa-install-hint">Pasang di perangkat Anda</span>
    </div>
    <button class="v2-pwa-install-cta" type="button" id="btnPwaInstall">Instal</button>
    <button class="v2-pwa-install-close" type="button" id="btnPwaInstallDismiss" aria-label="Tutup">&times;</button>
  `;
  document.body.appendChild(banner);
  _installBannerEl = banner;

  document.getElementById('btnPwaInstallDismiss')?.addEventListener('click', () => {
    _recordInstallDismiss();
    _hideInstallBanner();
  });

  document.getElementById('btnPwaInstall')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnPwaInstall');
    if (btn) { btn.disabled = true; btn.textContent = 'Menginstal…'; }
    const accepted = await triggerInstallPrompt();
    /* If accepted, appinstalled will fire and hide the banner automatically */
    if (!accepted && btn) {
      btn.disabled   = false;
      btn.textContent = 'Instal';
    }
  });
}

/* ── Install onboarding gating ─────────────────────────────── */

function _maybeShowInstallOnboarding() {
  if (_state.isInstalled) return;
  if (_installDismissed()) return;

  if (_state.platform === 'android-chrome' && _deferredPrompt) {
    _showAndroidInstallBanner();
  } else if (_state.platform === 'ios-safari') {
    /* Record dismiss before showing so it doesn't auto-show again for 7 days */
    _recordInstallDismiss();
    showIOSInstallModal();
  }
}

/* ── Service worker registration ───────────────────────────── */

async function _registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    _state.swStatus = 'unsupported';
    _notifyListeners();
    return;
  }

  _state.swStatus = 'registering';
  _notifyListeners();

  try {
    /* updateViaCache:'none' → the SW script is fetched from network on every
       update check, so a new SW_VERSION is always seen promptly. */
    const reg = await navigator.serviceWorker.register('/service-worker.js', { updateViaCache: 'none' });
    _swRegistration = reg;

    /* Proactively check for a newer SW + deployment right away */
    reg.update().catch(() => {});
    _checkDeployedVersion();

    /* Already-waiting worker on first load (update downloaded in a previous
       session): apply it silently within the startup window, else defer. */
    if (reg.waiting && navigator.serviceWorker.controller) {
      _state.swUpdateAvailable = true;
      if (_canAutoApply()) _applyUpdateSilently();
    }

    /* Watch for future updates. A newer worker reaching the "installed" state
       while a controller exists is an UPDATE (not a first install). Apply it
       silently only during the startup window; otherwise leave it waiting and
       flag it — the next launch's startup check will activate it. */
    reg.addEventListener('updatefound', () => {
      const installing = reg.installing;
      if (!installing) return;
      installing.addEventListener('statechange', () => {
        if (installing.state === 'installed' && navigator.serviceWorker.controller) {
          _state.swUpdateAvailable = true;
          _notifyListeners();
          if (_canAutoApply()) _applyUpdateSilently();
        }
      });
    });

    _state.swStatus = reg.active ? 'active' : 'registering';
    _notifyListeners();

    /* Refresh cache count once SW is active */
    if (reg.active) {
      _refreshCacheCount();
    } else {
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        if (!w) return;
        w.addEventListener('statechange', () => {
          if (w.state === 'activated') _refreshCacheCount();
        });
      });
    }

    /* Detect when this tab's controller changes (after our silent skipWaiting).
       Reload exactly once, and ONLY when WE initiated the apply
       (_skipWaitingTriggered) — so a first-install control change never causes
       a surprise reload, and we can never enter a reload loop. */
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      _state.swStatus = 'active';
      _notifyListeners();
      _refreshCacheCount();
      if (_skipWaitingTriggered && !_reloading) {
        _reloading = true;
        window.location.reload();
      }
    });

  } catch (err) {
    console.warn('[PWA] Service worker registration failed:', err);
    _state.swStatus = 'failed';
    _notifyListeners();
  }
}

/* ── Public API ────────────────────────────────────────────── */

export function initPWA() {
  /* Open the startup window: updates may auto-apply (silent reload) only until
     this deadline; afterwards they defer to the next launch. */
  _startupDeadline   = Date.now() + STARTUP_APPLY_WINDOW_MS;
  _state.platform    = _detectPlatform();
  _state.isInstalled = _detectInstalled();
  _state.isIOSSafari = _state.platform === 'ios-safari';
  _state.displayMode = _state.isInstalled ? 'standalone' : 'browser';

  window.matchMedia('(display-mode: standalone)').addEventListener('change', (e) => {
    _state.isInstalled = e.matches;
    _state.displayMode = e.matches ? 'standalone' : 'browser';
    if (e.matches) _hideInstallBanner();
    _notifyListeners();
  });

  /* Header install affordance — wire click + set initial visibility */
  _initHeaderInstallButton();

  /* Register service worker */
  _registerServiceWorker();

  /* Re-check for a new deployment whenever the app regains focus or becomes
     visible. This is the key path for installed apps (esp. iOS Home Screen),
     which can sit resident for days between opens. Throttled to once/min. */
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') _maybeCheckUpdate();
  });
  window.addEventListener('focus', _maybeCheckUpdate);

  /* Show install onboarding after a brief delay so the app renders first */
  setTimeout(() => {
    _bannerCheckDone = true;
    _maybeShowInstallOnboarding();
  }, 3000);
}

export function getPWAState() {
  return { ..._state };
}

export function registerPWAStateListener(cb) {
  _stateCallbacks.push(cb);
}

export async function triggerInstallPrompt() {
  if (!_deferredPrompt) return false;
  try {
    _deferredPrompt.prompt();
    const { outcome } = await _deferredPrompt.userChoice;
    _deferredPrompt   = null;
    _state.canInstall = false;
    if (outcome === 'accepted') {
      _state.isInstalled = true;
      _state.displayMode = 'standalone';
    }
    _notifyListeners();
    return outcome === 'accepted';
  } catch (_) {
    return false;
  }
}

export function showIOSInstallModal() {
  let modal = document.getElementById('pwaIOSInstallModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id        = 'pwaIOSInstallModal';
    modal.className = 'modal-overlay';
    modal.style.display = 'none';
    modal.innerHTML = `
      <div class="modal-box v2-pwa-ios-modal-box">
        <div class="modal-header">
          <h2 class="modal-title">Instal Sarpras Operations</h2>
          <button class="modal-close" id="btnClosePwaIOS" type="button">&times;</button>
        </div>
        <div class="modal-body v2-pwa-ios-body">
          <p class="v2-pwa-ios-intro">Untuk memasang aplikasi di iPhone atau iPad:</p>
          <ol class="v2-pwa-ios-steps">
            <li class="v2-pwa-ios-step">
              <span class="v2-pwa-ios-num">1</span>
              <div class="v2-pwa-ios-step-text">
                <strong>Tap ikon Bagikan</strong>
                <span class="v2-pwa-ios-hint">Kotak dengan panah ke atas, di toolbar bawah Safari</span>
              </div>
            </li>
            <li class="v2-pwa-ios-step">
              <span class="v2-pwa-ios-num">2</span>
              <div class="v2-pwa-ios-step-text">
                <strong>Pilih "Add to Home Screen"</strong>
                <span class="v2-pwa-ios-hint">Scroll menu Share hingga menemukan opsi ini</span>
              </div>
            </li>
            <li class="v2-pwa-ios-step">
              <span class="v2-pwa-ios-num">3</span>
              <div class="v2-pwa-ios-step-text">
                <strong>Tap "Add"</strong>
                <span class="v2-pwa-ios-hint">Ikon Sarpras Operations akan muncul di Home Screen</span>
              </div>
            </li>
          </ol>
          <div class="v2-pwa-ios-note">
            Setelah terpasang, buka dari Home Screen untuk tampilan penuh tanpa toolbar browser.
          </div>
        </div>
        <div class="v2-alias-modal-footer">
          <button class="p-btn" id="btnClosePwaIOSConfirm" type="button">Mengerti</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const closeModal = () => { modal.style.display = 'none'; };
    document.getElementById('btnClosePwaIOS')?.addEventListener('click', closeModal);
    document.getElementById('btnClosePwaIOSConfirm')?.addEventListener('click', closeModal);
    modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && modal.style.display !== 'none') closeModal();
    });
  }
  modal.style.display = 'flex';
}
