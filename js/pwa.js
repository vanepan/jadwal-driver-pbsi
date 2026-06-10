'use strict';

/* ============================================================
   PWA Foundation — v1.9.0
   Handles install detection, prompt capture, iOS onboarding.
   No service worker. No offline mode. Foundation only.
   ============================================================ */

const _stateCallbacks = [];

let _deferredPrompt = null;

let _state = {
  isInstalled: false,
  platform: 'other',        // 'ios-safari' | 'android-chrome' | 'desktop-chrome' | 'other'
  canInstall: false,
  isIOSSafari: false,
  displayMode: 'browser',   // 'standalone' | 'browser'
};

// Register beforeinstallprompt at module load time so we don't miss early fires.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  _deferredPrompt = e;
  _state.canInstall = true;
  _notifyListeners();
});

window.addEventListener('appinstalled', () => {
  _deferredPrompt = null;
  _state.isInstalled = true;
  _state.canInstall = false;
  _state.displayMode = 'standalone';
  _notifyListeners();
});

function _detectPlatform() {
  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
  const isIOSSafari = isIOS && /Safari/i.test(ua) && !/CriOS|FxiOS|OPiOS/i.test(ua);
  const isAndroid = /Android/i.test(ua);
  const isChrome = /Chrome\/\d/i.test(ua) && !/Edg\/|OPR\/|Brave/i.test(ua);
  const isMobile = isIOS || isAndroid;

  if (isIOSSafari) return 'ios-safari';
  if (isAndroid && isChrome) return 'android-chrome';
  if (!isMobile && isChrome) return 'desktop-chrome';
  return 'other';
}

function _detectInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;
}

function _notifyListeners() {
  const snap = getPWAState();
  _stateCallbacks.forEach(cb => cb(snap));
}

export function initPWA() {
  _state.platform    = _detectPlatform();
  _state.isInstalled = _detectInstalled();
  _state.isIOSSafari = _state.platform === 'ios-safari';
  _state.displayMode = _state.isInstalled ? 'standalone' : 'browser';

  window.matchMedia('(display-mode: standalone)').addEventListener('change', (e) => {
    _state.isInstalled = e.matches;
    _state.displayMode = e.matches ? 'standalone' : 'browser';
    _notifyListeners();
  });
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
    _deferredPrompt = null;
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
