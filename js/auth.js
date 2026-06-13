/* ============================================================
   AUTH.JS - Simple PIN Login & Role Helpers

   This is a small mock auth layer for the static app.
   It stores only the current session user in localStorage.
   ============================================================ */

'use strict';

import { getUserByUsername, initUsersSync } from './users.js';
import { logAction } from './logs.js';
import { showToast } from './utils.js';
import {
  callVerifyPin,
  signInWithToken,
  firebaseSignOut,
  registerAuthStateCallback,
  initFirebaseAuthLayer,
  authReady,
  resolveAuthReadyManually,
} from './firebase.js';

const SESSION_KEY = 'pbsi_current_user';

/* ── Break-glass: AUTH_DIRECT_PIN ────────────────────────────────
   Emergency rollback path. DEFAULT OFF. When enabled, login bypasses
   verifyPin / Firebase Auth and uses the legacy client-side PIN
   comparison + localStorage session. Requires RTDB rules at Stage A
   (open), since clients are then unauthenticated. Removable once
   custom auth is proven stable.

   Enable via either:
     • window.AUTH_DIRECT_PIN = true
     • localStorage['pbsi_auth_direct_pin'] = 'true'
   ──────────────────────────────────────────────────────────────── */
function isDirectPinMode() {
  try {
    if (typeof window !== 'undefined' && window.AUTH_DIRECT_PIN === true) return true;
    return localStorage.getItem('pbsi_auth_direct_pin') === 'true';
  } catch (_) {
    return false;
  }
}

const ROLE_LABELS = {
  admin: 'Admin',
  bidang: 'Bidang',
  driver: 'Driver',
  viewer: 'Viewer',
};

const PERMISSIONS = {
  view: ['admin', 'bidang', 'viewer', 'driver'],
  view_assignments: ['admin', 'bidang', 'driver'],
  view_own_assignments: ['driver'],
  create: ['admin'],
  request: ['bidang'],
  assign: ['admin'],
  edit: ['admin'],
  delete: ['admin'],
  manage_users: ['admin'],
  start: ['admin', 'driver'],
  complete: ['admin', 'driver'],
  cancel: ['admin', 'bidang'],
  print_reimbursement: ['admin', 'driver'],
};

let authChangeCallback = null;

/**
 * Login dengan username + PIN.
 * Routes to Firebase custom auth (default) or the legacy client-side
 * PIN path when AUTH_DIRECT_PIN break-glass is active.
 * Returns the session user on success, or null on failure (so the
 * login form can surface its error UI) — never throws.
 * @param {string} username
 * @param {string} pin
 * @returns {Promise<Object|null>}
 */
export async function login(username, pin) {
  return isDirectPinMode()
    ? loginLegacy(username, pin)
    : loginViaFirebase(username, pin);
}

/**
 * Firebase custom-auth login: verifyPin (server-side) → custom token
 * → signInWithCustomToken. localStorage is written as a write-through
 * cache; onAuthStateChanged re-hydrates it from the token claim.
 */
async function loginViaFirebase(username, pin) {
  let data;
  try {
    data = await callVerifyPin(String(username).trim(), String(pin).trim());
  } catch (err) {
    const code = String(err?.code || '');
    // Auth failures (wrong PIN / unknown user / bad input) → silent null
    // so the form shows its standard error. Anything else is an outage.
    if (!/unauthenticated|invalid-argument|not-found|permission-denied/.test(code)) {
      console.error('[auth] verifyPin error:', err);
      showToast('Login sementara tidak tersedia. Coba lagi sebentar.');
    }
    return null;
  }

  if (!data || !data.token) return null;

  const p = data.profile || {};
  const sessionUser = {
    id: p.username,
    username: p.username,
    name: p.name || p.username,
    role: p.role,
    active: p.active !== false,
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(sessionUser));

  try {
    await signInWithToken(data.token);
  } catch (err) {
    console.error('[auth] signInWithCustomToken failed:', err);
    localStorage.removeItem(SESSION_KEY);
    showToast('Gagal membuat sesi. Coba lagi.');
    return null;
  }

  // Signed in now → audit write passes auth != null rules.
  logAction({ userId: sessionUser.id, username: sessionUser.username, action: 'login' });
  notifyAuthChange();
  closeLoginModal();
  return sessionUser;
}

/**
 * Legacy client-side PIN comparison (break-glass only).
 * Preserved verbatim from the pre-v1.11.1.2 flow.
 */
async function loginLegacy(username, pin) {
  const user = await getUserByUsername(String(username).trim());
  if (!user || !user.active || user.pin !== String(pin).trim()) {
    return null;
  }

  const sessionUser = {
    id: user.id,
    username: user.username,
    name: user.displayName || user.username,
    role: user.role,
    active: user.active,
  };

  localStorage.setItem(SESSION_KEY, JSON.stringify(sessionUser));
  logAction({ userId: user.id, username: user.username, action: 'login' });
  notifyAuthChange();
  closeLoginModal();
  return sessionUser;
}

/**
 * Write-through hydration from Firebase auth state.
 * user → cache {id, username, name, role, active}; null → clear cache.
 * role is sourced from the authoritative token claim; name falls back
 * to the cached blob (preserves displayName offline) then to uid.
 * @param {Object|null} user Firebase user
 */
async function _hydrateFromFirebaseUser(user) {
  if (!user) {
    localStorage.removeItem(SESSION_KEY);
    notifyAuthChange();
    return;
  }

  let role = 'viewer';
  const cached = getCurrentUser();
  try {
    const res = await user.getIdTokenResult();
    role = res.claims?.role || role;
  } catch (_) {
    if (cached && cached.username === user.uid) role = cached.role || role;
  }

  const name = (cached && cached.username === user.uid && cached.name)
    ? cached.name
    : user.uid;

  const sessionUser = { id: user.uid, username: user.uid, name, role, active: true };
  localStorage.setItem(SESSION_KEY, JSON.stringify(sessionUser));
  notifyAuthChange();
}

/**
 * Logout user saat ini.
 */
export async function logout() {
  const currentUser = getCurrentUser();
  if (currentUser) {
    logAction({ userId: currentUser.id, username: currentUser.username, action: 'logout' });
  }

  if (isDirectPinMode()) {
    localStorage.removeItem(SESSION_KEY);
    notifyAuthChange();
    return;
  }

  try {
    await firebaseSignOut();
  } catch (err) {
    console.error('[auth] signOut failed:', err);
  }
  localStorage.removeItem(SESSION_KEY);
  // Reload to a clean unauthenticated state: detaches RTDB listeners
  // that would otherwise hit permission_denied under auth != null rules.
  if (typeof window !== 'undefined') window.location.reload();
}

/**
 * Ambil user dari localStorage.
 * @returns {Object|null}
 */
export function getCurrentUser() {
  const rawUser = localStorage.getItem(SESSION_KEY);
  if (!rawUser) return null;

  try {
    return JSON.parse(rawUser);
  } catch (error) {
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

/**
 * Cek apakah user saat ini punya permission tertentu.
 * Permission yang dipakai: view, create, request, edit, delete.
 * @param {string} permission
 * @returns {boolean}
 */
export function hasPermission(permission) {
  const user = getCurrentUser();
  if (!user) return false;

  const allowedRoles = PERMISSIONS[permission] || [];
  return allowedRoles.includes(user.role);
}

export function isAdmin() {
  const user = getCurrentUser();
  return Boolean(user && user.role === 'admin');
}

export function isBidang() {
  const user = getCurrentUser();
  return Boolean(user && user.role === 'bidang');
}

export function isViewer() {
  const user = getCurrentUser();
  return Boolean(user && user.role === 'viewer');
}

export function isDriver() {
  const user = getCurrentUser();
  return Boolean(user && user.role === 'driver');
}

/**
 * Get nama driver dari current user jika role adalah driver.
 * @returns {string|null}
 */
export function getDriverName() {
  const user = getCurrentUser();
  return user && user.role === 'driver' ? user.username : null;
}

/**
 * Setup login modal, logout button, dan role badge.
 * @param {Function} onAuthChange
 */
export async function initAuthUI(onAuthChange) {
  authChangeCallback = onAuthChange;

  const form = document.getElementById('loginForm');
  if (form) {
    form.addEventListener('submit', handleLoginSubmit);
    initLoginKeyboardUX();
  }

  const logoutButton = document.getElementById('btnLogout');
  if (logoutButton) {
    logoutButton.addEventListener('click', logout);
  }

  if (isDirectPinMode()) {
    // ── Break-glass: legacy client-side PIN (requires Stage A open rules) ──
    console.warn('[auth] AUTH_DIRECT_PIN active — legacy PIN mode. RTDB must be at Stage A (open).');
    await initUsersSync();
    restoreSession();
    resolveAuthReadyManually(getCurrentUser());
    updateAuthUI();
    if (!getCurrentUser()) openLoginModal();
    return;
  }

  // ── Firebase custom-auth mode: register hydration, then GATE on auth ──
  // No RTDB access occurs here. The first onAuthStateChanged emission
  // hydrates the session cache and resolves authReady().
  registerAuthStateCallback(_hydrateFromFirebaseUser);
  initFirebaseAuthLayer();
  await authReady();
  updateAuthUI();

  if (!getCurrentUser()) {
    openLoginModal();
  }
}

/**
 * Update badge, display name, dan modal sesuai session saat ini.
 */
export function updateAuthUI() {
  const user = getCurrentUser();
  const badge = document.getElementById('roleBadge');
  const logoutButton = document.getElementById('btnLogout');
  const displayNameEl = document.getElementById('headerDisplayName');

  if (badge) {
    badge.textContent = user ? (ROLE_LABELS[user.role] || user.role) : 'Belum Login';
    badge.dataset.role = user ? user.role : 'guest';
    badge.title = user ? `${user.name} · ${ROLE_LABELS[user.role]}` : 'Silakan login';
  }

  if (displayNameEl) {
    displayNameEl.textContent = user ? (user.name || user.username) : '';
  }

  if (logoutButton) {
    logoutButton.disabled = !user;
  }

  if (user) {
    closeLoginModal();
  } else {
    openLoginModal();
  }
}

export function getRoleLabel(role) {
  return ROLE_LABELS[role] || 'Guest';
}

async function handleLoginSubmit(event) {
  event.preventDefault();

  const usernameInput = document.getElementById('loginUsername');
  const pinInput = document.getElementById('loginPin');
  const errorEl = document.getElementById('loginError');

  const username = usernameInput ? usernameInput.value.trim() : '';
  const pin = pinInput ? pinInput.value.trim() : '';
  const user = await login(username, pin);

  if (!user) {
    if (errorEl) errorEl.style.display = 'block';
    if (pinInput) {
      pinInput.value = '';
      pinInput.focus();
    }
    return;
  }

  if (errorEl) errorEl.style.display = 'none';
  if (pinInput) pinInput.value = '';
  if (usernameInput) usernameInput.value = '';
}

function restoreSession() {
  const session = getCurrentUser();
  if (!session) return;

  getUserByUsername(session.username).then(user => {
    if (!user || !user.active) {
      logout();
      return;
    }

    const refreshedSession = {
      id: user.id,
      username: user.username,
      name: user.displayName || user.username,
      role: user.role,
      active: user.active,
    };

    localStorage.setItem(SESSION_KEY, JSON.stringify(refreshedSession));
    notifyAuthChange();
  }).catch(() => {
    logout();
  });
}

function notifyAuthChange() {
  updateAuthUI();

  if (authChangeCallback) {
    authChangeCallback(getCurrentUser());
  }
}

function openLoginModal() {
  const modal = document.getElementById('modalLogin');
  const usernameInput = document.getElementById('loginUsername');

  if (modal) {
    modal.style.display = 'flex';
    modal.style.pointerEvents = 'auto';
  }

  setTimeout(() => {
    if (usernameInput) usernameInput.focus();
  }, 50);
}

function initLoginKeyboardUX() {
  const usernameInput = document.getElementById('loginUsername');
  const pinInput = document.getElementById('loginPin');
  const form = document.getElementById('loginForm');

  if (usernameInput) {
    usernameInput.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      if (usernameInput.value.trim() && pinInput) {
        pinInput.focus();
      }
    });
  }

  if (pinInput) {
    pinInput.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const username = usernameInput ? usernameInput.value.trim() : '';
      const pin = pinInput.value.trim();
      if (username && pin && form) {
        form.requestSubmit();
      }
    });
  }
}

function closeLoginModal() {
  const modal = document.getElementById('modalLogin');
  if (modal) {
    modal.style.display = 'none';
    modal.style.pointerEvents = 'none';
  }
}

console.info('Auth module loaded');
