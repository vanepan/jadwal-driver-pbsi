/* ============================================================
   AUTH.JS - Simple PIN Login & Role Helpers

   This is a small mock auth layer for the static app.
   It stores only the current session user in localStorage.
   ============================================================ */

'use strict';

import { getUserByUsername, initUsersSync } from './users.js';
import { logAction } from './logs.js';
import { cleanupPushOnLogout } from './push.js';
import {
  callVerifyPin,
  signInWithToken,
  firebaseSignOut,
  registerAuthStateCallback,
  initFirebaseAuthLayer,
  authReady,
  resolveAuthReadyManually,
} from './firebase.js';
import {
  can as registryCan,
  roleLabel as registryRoleLabel,
  isEngineeringRole,
  ENGINEERING_ROLE,
} from './config/role-registry.js';
import { runSaveFeedback } from './components/save-feedback.js';
import { playLoginSuccessTransition, playLogoutExitTransition } from './components/entry-transition.js';

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

// Role display labels come from the shared role registry — the SINGLE source of
// truth for role presentation (Objective 5). No local role→label map here.

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
  // v1.27.0: 'bidang' added for Self-Drive Assignment — someone has to be able
  // to Start/Complete a trip with no driver, and it's the requester who drives
  // it. Per-assignment ownership (own self-drive assignment only) is enforced
  // separately in modal.js canActOnAssignment(), not here.
  start: ['admin', 'driver', 'bidang'],
  complete: ['admin', 'driver', 'bidang'],
  cancel: ['admin', 'bidang'],
  print_reimbursement: ['admin', 'driver'],
  override_overtime: ['admin'],
};

let authChangeCallback = null;

/**
 * Login dengan username + PIN.
 * Routes to Firebase custom auth (default) or the legacy client-side
 * PIN path when AUTH_DIRECT_PIN break-glass is active.
 * Resolves the session user on success. Throws an Error with a
 * user-facing message on any failure (invalid credentials or an
 * infra/outage) — this is the contract js/components/save-feedback.js's
 * runSaveFeedback() already expects from an `operation`, so the login
 * submit button drives the same saving→success/error state machine as
 * every other async save in the app (Design System Program Phase 6).
 * @param {string} username
 * @param {string} pin
 * @returns {Promise<Object>}
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
    // Auth failures (wrong PIN / unknown user / bad input) get a specific
    // message; anything else is an outage — both surface inline through the
    // caller's save-feedback error region, same as every other async save.
    if (!/unauthenticated|invalid-argument|not-found|permission-denied/.test(code)) {
      console.error('[auth] verifyPin error:', err);
      throw new Error('Login sementara tidak tersedia. Coba lagi sebentar.');
    }
    throw new Error('Username atau PIN tidak dikenal.');
  }

  if (!data || !data.token) throw new Error('Username atau PIN tidak dikenal.');

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
    throw new Error('Gagal membuat sesi. Coba lagi.');
  }

  // Signed in now → audit write passes auth != null rules.
  logAction({ userId: sessionUser.id, username: sessionUser.username, action: 'login' });
  notifyAuthChange();
  // closeLoginModal() is deliberately NOT called here — the login→shell
  // success transition (handleLoginSubmit's onSuccess) owns closing the
  // modal now, as the last step of its own choreography. notifyAuthChange()
  // above still calls updateAuthUI() → closeLoginModal(), but that call is
  // a no-op for the duration of the transition (see _deferLoginClose).
  return sessionUser;
}

/**
 * Legacy client-side PIN comparison (break-glass only).
 * Preserved verbatim from the pre-v1.11.1.2 flow, apart from throwing
 * instead of returning null on failure (see login()'s doc comment).
 */
async function loginLegacy(username, pin) {
  const user = await getUserByUsername(String(username).trim());
  if (!user || !user.active || user.pin !== String(pin).trim()) {
    throw new Error('Username atau PIN tidak dikenal.');
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
    // SS1 hotfix (v1.27.1): getIdTokenResult() refreshes over the network when
    // the cached token is stale, and that request has no built-in timeout — on
    // a flaky connection at cold-start it can hang indefinitely, which (since
    // this whole function is awaited before authReady() resolves) froze the
    // startup splash screen forever. Bounded so a stalled refresh degrades to
    // the cached role instead of blocking startup; a rejection already did.
    const res = await Promise.race([
      user.getIdTokenResult(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('getIdTokenResult timeout')), 5000)),
    ]);
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
  // Phase 7G.4 auth diagnostic — marks this as an EXPLICIT, deliberate
  // sign-out in the console trail, distinct from a passive session loss
  // (see js/firebase.js's [auth-diag] logs around onAuthStateChanged).
  // No PII: no username/PIN/token, just that logout() was invoked and how.
  console.info(`[auth-diag] ${new Date().toISOString()} logout() called`, { directPinMode: isDirectPinMode() });
  const currentUser = getCurrentUser();
  if (currentUser) {
    logAction({ userId: currentUser.id, username: currentUser.username, action: 'logout' });
  }

  if (isDirectPinMode()) {
    localStorage.removeItem(SESSION_KEY);
    notifyAuthChange();
    return;
  }

  // Design System Program Phase 6 — the shell's brief exit animation plays
  // CONCURRENTLY with the real sign-out work below, not before it, so the
  // coherent inverse transition never adds latency on top of the network
  // calls (logout must never feel slower than before). Both are awaited
  // together; whichever finishes first waits for the other.
  await Promise.all([
    playLogoutExitTransition({ shellEl: document.querySelector('.app-layout') }),
    (async () => {
      // Push cleanup BEFORE signOut — the callable needs the live auth
      // session. A logged-out device must stop receiving push; siblings
      // keep working (per-device record). Best-effort, never blocks logout.
      try {
        await cleanupPushOnLogout();
      } catch (err) {
        console.warn('[auth] push cleanup on logout failed:', err);
      }

      try {
        await firebaseSignOut();
      } catch (err) {
        console.error('[auth] signOut failed:', err);
      }
    })(),
  ]);
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
 * Resolve the set of identity strings that denote the given user AS A DRIVER,
 * for matching against an assignment's stored `driver` name.
 *
 * SINGLE SOURCE OF TRUTH for "does this assignment belong to this driver?" —
 * the dashboard visibility filter (app.js filterAssignmentsForUser) and the
 * lifecycle action gate (modal.js canActOnAssignment) BOTH call this, so a
 * driver can always act on an assignment they can see. Previously these two
 * checks built DIFFERENT candidate sets (visibility: username+name+displayName+
 * capitalized+"driver " prefix; action: only username+name), so an assignment
 * matched by a candidate unique to the visibility set rendered as visible but
 * could not be started/finished — surfacing as the "changing displayName breaks
 * the driver lifecycle" bug (v1.20.7 Obj 9).
 *
 * NOTE: this still accepts the mutable display fields (name/displayName) as a
 * backward-compatible fallback for assignments written before a stable key
 * existed. The durable fix is an immutable `driverUsername`/uid written at
 * assignment time and matched exclusively — see the v1.20.7 identity migration.
 * @param {Object} user  a getCurrentUser() object
 * @returns {Set<string>} normalized lowercase identity candidates
 */
export function driverIdentityCandidates(user) {
  if (!user) return new Set();
  const cap = user.username
    ? user.username.charAt(0).toUpperCase() + user.username.slice(1).toLowerCase()
    : '';
  const candidates = [user.username, user.name, user.displayName, cap]
    .filter(Boolean)
    .flatMap((value) => {
      const normalized = String(value).trim().toLowerCase();
      return normalized.startsWith('driver ')
        ? [normalized, normalized.replace(/^driver\s+/, '')]
        : [normalized];
    });
  return new Set(candidates);
}

/**
 * Whether `assignment` belongs to `user` (as a driver). Matches the assignment's
 * stored driver name against driverIdentityCandidates(user).
 * @param {Object} assignment
 * @param {Object} user
 * @returns {boolean}
 */
export function assignmentBelongsToDriver(assignment, user) {
  if (!assignment || !user) return false;
  // Immutable-identity match (v1.20.x stabilization, Issue 9): when the assignment
  // carries a stable `driverUsername` (stamped at creation from the driver record's
  // linkedUserUsername — see app.js resolveDriverUsername/stampDriverIdentity),
  // ownership resolves on that key EXCLUSIVELY. A later display-name or driver-name
  // edit can never break Start/Finish, because the key never changes. Legacy
  // assignments (no driverUsername) fall back to the mutable name-candidate match,
  // so existing records behave exactly as before (no regression).
  const stableUser = String(assignment.driverUsername || '').trim().toLowerCase();
  if (stableUser) {
    const uname = String(user.username || '').trim().toLowerCase();
    return !!uname && stableUser === uname;
  }
  const driverName = String(assignment.driver || '').trim().toLowerCase();
  if (!driverName) return false;
  return driverIdentityCandidates(user).has(driverName);
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

/* ── Engineering roles + capabilities (v1.20.1) ──────────────────────────
   Additive layer over the existing role model. Driver-Ops `PERMISSIONS` /
   `hasPermission()` are untouched; Engineering gates through the central
   role-registry capability matrix so it stays extensible to future roles. */

/** The current session's role id (or null when signed out). */
export function currentRole() {
  const user = getCurrentUser();
  return user ? user.role : null;
}

/**
 * Engineering capability check for the CURRENT user.
 * Admin always passes (full Engineering access) via the registry matrix.
 * @param {string} capability  e.g. 'eng.verify', 'eng.create'
 * @returns {boolean}
 */
export function canEng(capability) {
  const role = currentRole();
  return !!role && registryCan(capability, role);
}

/** Whether the current user is the Engineering Coordinator role. */
export function isEngineeringCoordinator() {
  return currentRole() === ENGINEERING_ROLE.COORDINATOR;
}

/** Whether the current user is an Engineering Member. */
export function isEngineeringMember() {
  return currentRole() === ENGINEERING_ROLE.MEMBER;
}

/** Whether the current user holds any Engineering role. */
export function isEngineeringUser() {
  return isEngineeringRole(currentRole());
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
  // SS1 hotfix (v1.27.1): authReady() only resolves once onAuthStateChanged
  // fires once — normally near-instant, but any hang upstream (Firebase Auth
  // network hiccup, or a future change to the hydration callback) would
  // otherwise wait here forever and freeze the startup splash screen, since
  // this function is awaited before app.js reveals the app. Bounded so the
  // login gate always opens; the real listener keeps running in the
  // background and still hydrates/notifies normally once it settles.
  await Promise.race([
    authReady(),
    new Promise(resolve => setTimeout(resolve, 8000)),
  ]);
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
    badge.textContent = user ? registryRoleLabel(user.role) : 'Belum Login';
    badge.dataset.role = user ? user.role : 'guest';
    badge.title = user ? `${user.name} · ${registryRoleLabel(user.role)}` : 'Silakan login';
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

// Phase 11 (Administration) — audit finding Roles D-2: this (and
// updateAuthUI()'s #roleBadge above) is Custom-Role-blind the same way
// app.js's topbar/rail-footer/domain-shell labels were — falls back to the
// raw stored role id for a Custom Role instead of role-catalog.js's
// resolveRoleInfo(). Left AS-IS here, deliberately, not overlooked:
// role-catalog.js -> custom-roles-store.js imports isAdmin() FROM this
// exact file, so importing resolveRoleInfo() here would create a genuine
// import cycle (auth.js -> role-catalog.js -> custom-roles-store.js ->
// auth.js) in a foundational, everywhere-imported module — a real risk to
// app boot ordering that a label-formatting fix does not justify taking on
// blind. Lower real-world impact than the 3 sites already fixed: #roleBadge
// is a V1-only element, hidden inside the V2 topbar by default (see
// platform.css's own comment) and only visible via the emergency V2
// rollback flag. Fixing this properly needs restructuring which of
// auth.js/custom-roles-store.js owns isAdmin() (or extracting it to a
// dependency-free module) — a real but separately-scoped follow-up, not a
// silent scope-narrowing of this fix.
export function getRoleLabel(role) {
  return role ? registryRoleLabel(role) : 'Guest';
}

async function handleLoginSubmit(event) {
  event.preventDefault();

  const form = event.target;
  const usernameInput = document.getElementById('loginUsername');
  const pinInput = document.getElementById('loginPin');
  const errorEl = document.getElementById('loginError');
  const submitBtn = form.querySelector('.login-submit');

  const username = usernameInput ? usernameInput.value.trim() : '';
  const pin = pinInput ? pinInput.value.trim() : '';

  // Design System Program Phase 6 — the login button now drives the same
  // canonical saving→success/error state machine as every other async save
  // in the app (js/components/save-feedback.js), instead of a bespoke
  // disable/re-enable dance. login() throws on failure; runSaveFeedback
  // catches that and shows it inline via #loginError automatically.
  //
  // _deferLoginClose is set for the WHOLE attempt, not just after success:
  // login() calls notifyAuthChange() internally the instant Firebase auth
  // resolves — synchronously inside operation(), well before onSuccess runs
  // — and the onAuthStateChanged side-channel can fire the same call again
  // independently. Both would otherwise instantly display:none the modal
  // underneath the still-playing transition if the flag were only set once
  // onSuccess starts.
  _deferLoginClose = true;

  await runSaveFeedback({
    button: submitBtn,
    alsoDisable: [usernameInput, pinInput].filter(Boolean),
    errorRegion: errorEl,
    operation: async () => ({ ok: true, user: await login(username, pin) }),
    onSuccess: async () => {
      if (pinInput) pinInput.value = '';
      if (usernameInput) usernameInput.value = '';
      try {
        await playLoginSuccessTransition({
          cardBodyEl: document.querySelector('.login-card-body'),
          brandMarkEl: document.querySelector('.login-brand-crest'),
          loginScreenEl: document.getElementById('modalLogin'),
        });
      } finally {
        _deferLoginClose = false;
        closeLoginModal();
      }
    },
    onError: () => {
      _deferLoginClose = false;
      if (pinInput) {
        pinInput.value = '';
        pinInput.focus();
      }
    },
  });
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

// Set for the duration of the login→shell success transition (see
// handleLoginSubmit's onSuccess). While true, closeLoginModal() no-ops —
// otherwise the auth-state listener's own notifyAuthChange()/updateAuthUI()
// call (fired by the onAuthStateChanged side-channel signInWithToken()
// triggers) would instantly display:none the modal underneath the still-
// playing transition, recreating the hard cut this phase exists to remove.
// Session restore never sets this flag, so its closeLoginModal() calls are
// unaffected — always instant, exactly as before.
let _deferLoginClose = false;

function closeLoginModal() {
  if (_deferLoginClose) return;
  const modal = document.getElementById('modalLogin');
  if (modal) {
    modal.style.display = 'none';
    modal.style.pointerEvents = 'none';
  }
}

console.info('Auth module loaded');
