'use strict';

import { readNode, subscribeNode, storeFirebaseData, updateFirebaseData, isFirebaseConfigured } from './firebase.js';

const USERS_PATH = 'users';

// Explicit state machines (v1.11.3.3) replace the old usersLoaded/usersSubscribed
// booleans. LOADED/SUBSCRIBED are reached ONLY on a successful read — a
// permission_denied never latches an empty cache, so a later auth-available
// event recovers the data. See docs/ADMIN_DATA_BOOTSTRAP_FIX_DESIGN.md.
const LOAD = { UNLOADED: 'UNLOADED', LOADING: 'LOADING', LOADED: 'LOADED' };
const SUB = { IDLE: 'IDLE', SUBSCRIBING: 'SUBSCRIBING', SUBSCRIBED: 'SUBSCRIBED' };

let users = [];
let loadState = LOAD.UNLOADED;
let subState = SUB.IDLE;
let unsubscribe = null;
let onUsersChangeCallbacks = [];

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '-');
}

function isValidUsername(value) {
  const normalized = normalizeUsername(value);
  return /^[a-z0-9._-]{3,30}$/.test(normalized);
}

function isValidPin(value) {
  return /^\d{4}$/.test(String(value || '').trim());
}

function isValidRole(value) {
  return ['admin', 'bidang', 'viewer', 'driver'].includes(value);
}

function mapFirebaseUsers(value) {
  const raw = value || {};
  return Object.keys(raw).map(key => ({ id: key, username: key, ...raw[key] }));
}

// Apply an AUTHORITATIVE user set: caller has real data (successful read,
// realtime snapshot, or local mutation). Marks LOADED and fans out to the UI.
// Failure paths must NOT call this — that was the poisoned-cache bug.
function refreshUsersCache(nextUsers) {
  users = nextUsers;
  loadState = LOAD.LOADED;
  onUsersChangeCallbacks.forEach(cb => cb(users));
}

/**
 * Idempotent, re-entrant: load + attach the realtime listener for /users.
 * The subscription's initial snapshot is the loader. Safe to call on every
 * auth-available event — already-SUBSCRIBED is a no-op; a previously denied
 * subscription (state reset to IDLE) re-attaches cleanly.
 */
export async function ensureUsersLoadedAndSubscribed() {
  if (!isFirebaseConfigured()) return;
  if (subState !== SUB.IDLE) return; // SUBSCRIBING or SUBSCRIBED → nothing to do
  subState = SUB.SUBSCRIBING;
  if (unsubscribe) { try { unsubscribe(); } catch (_) {} unsubscribe = null; }
  unsubscribe = subscribeNode(
    USERS_PATH,
    snapshot => {
      refreshUsersCache(mapFirebaseUsers(snapshot.val())); // sets LOADED
      subState = SUB.SUBSCRIBED;
    },
    {
      // Denied/error → do NOT latch. Reset so a later auth-available retries.
      onDenied: () => { subState = SUB.IDLE; loadState = LOAD.UNLOADED; },
      onError: () => { subState = SUB.IDLE; loadState = LOAD.UNLOADED; },
    }
  );
}

/** Tear down on sign-out/expiry so a re-login reloads from a clean state. */
export function resetUsersSync() {
  if (unsubscribe) { try { unsubscribe(); } catch (_) {} unsubscribe = null; }
  subState = SUB.IDLE;
  loadState = LOAD.UNLOADED;
  users = [];
}

// Back-compat alias — callers (auth.js, app.js) keep calling initUsersSync().
export async function initUsersSync() {
  return ensureUsersLoadedAndSubscribed();
}

export async function getUsers() {
  if (loadState === LOAD.LOADED) return users;
  const res = await readNode(USERS_PATH);
  if (res.status === 'ok') {
    refreshUsersCache(mapFirebaseUsers(res.value)); // sets LOADED only on success
  }
  // denied/error → return current cache WITHOUT latching; next call retries.
  return users;
}

export async function getUserByUsername(username) {
  if (!username) return null;
  const normalized = normalizeUsername(username);
  if (loadState !== LOAD.LOADED) await getUsers();
  return users.find(item => normalizeUsername(item.username) === normalized) || null;
}

export async function validateUsername(username, excludeUsername = null) {
  if (!username) return false;
  if (!isValidUsername(username)) return false;
  const normalized = normalizeUsername(username);
  if (loadState !== LOAD.LOADED) await getUsers();
  const existing = users.find(user => normalizeUsername(user.username) === normalized);
  return !existing || normalizeUsername(excludeUsername) === normalized;
}

// Note: PIN uniqueness validation removed. Use `isValidPin()` for format checks.

export async function createUser(userData) {
  if (!userData) throw new Error('User data is required');
  const username = normalizeUsername(userData.username);

  if (!isValidUsername(username)) {
    throw new Error('Username harus 3-30 karakter, tanpa spasi khusus.');
  }

  if (!(await validateUsername(username))) {
    throw new Error('Username sudah digunakan.');
  }

  if (!isValidPin(userData.pin)) {
    throw new Error('PIN harus 4 digit.');
  }

  const createdAt = new Date().toISOString();
  const nextUser = {
    username,
    displayName: String(userData.displayName || userData.username).trim() || username,
    role: isValidRole(userData.role) ? userData.role : 'viewer',
    pin: String(userData.pin).trim(),
    // telegramChatIds: object with keys { primary, secondary1, secondary2 } for drivers
    telegramChatIds: userData.telegramChatIds && typeof userData.telegramChatIds === 'object'
      ? userData.telegramChatIds
      : (userData.telegramChatId ? { primary: String(userData.telegramChatId).trim() } : {}),
    notificationsEnabled: Boolean(userData.notificationsEnabled),
    active: userData.active !== false,
    createdAt,
    updatedAt: createdAt,
  };

  await storeFirebaseData(`${USERS_PATH}/${username}`, nextUser);
  refreshUsersCache([
    ...users.filter(user => normalizeUsername(user.username) !== username),
    nextUser,
  ]);
  return nextUser;
}

export async function updateUser(userData) {
  if (!userData || !userData.username) throw new Error('Username required');

  const existing = await getUserByUsername(userData.username);
  if (!existing) throw new Error('User tidak ditemukan');

  const username = normalizeUsername(existing.username);
  const nextRole = isValidRole(userData.role) ? userData.role : existing.role;
  const nextActive = typeof userData.active === 'boolean' ? userData.active : existing.active;
  const activeAdmins = users.filter(item => item.role === 'admin' && item.active);

  if (existing.role === 'admin' && existing.active && activeAdmins.length <= 1) {
    if (nextRole !== 'admin') {
      throw new Error('Tidak dapat mengubah role admin terakhir.');
    }
    if (nextActive === false) {
      throw new Error('Tidak dapat menonaktifkan admin terakhir.');
    }
  }

  const updates = {
    displayName: String(userData.displayName || existing.displayName || existing.username).trim(),
    role: nextRole,
    telegramChatIds: userData.telegramChatIds !== undefined
      ? (userData.telegramChatIds || {})
      : (existing.telegramChatIds || (existing.telegramChatId ? { primary: existing.telegramChatId } : {})),
    notificationsEnabled: userData.notificationsEnabled !== undefined
      ? Boolean(userData.notificationsEnabled)
      : Boolean(existing.notificationsEnabled),
    active: nextActive,
    updatedAt: new Date().toISOString(),
  };

  if (String(userData.pin || '').trim()) {
    if (!isValidPin(userData.pin)) {
      throw new Error('PIN harus tepat 4 digit.');
    }
    updates.pin = String(userData.pin).trim();
  }

  await updateFirebaseData(`${USERS_PATH}/${username}`, updates);
  const updatedUser = { ...existing, ...updates };
  refreshUsersCache(users.map(user =>
    normalizeUsername(user.username) === username ? updatedUser : user
  ));
  return updatedUser;
}

export async function deactivateUser(username) {
  const user = await getUserByUsername(username);
  if (!user) throw new Error('User tidak ditemukan');

  const activeAdmins = users.filter(item => item.role === 'admin' && item.active);
  if (user.role === 'admin' && activeAdmins.length <= 1) {
    throw new Error('Tidak dapat menonaktifkan admin terakhir.');
  }

  return updateUser({ username: user.username, active: false });
}

export async function activateUser(username) {
  const user = await getUserByUsername(username);
  if (!user) throw new Error('User tidak ditemukan');
  return updateUser({ username: user.username, active: true });
}

export function registerUsersChangeListener(callback) {
  onUsersChangeCallbacks.push(callback);
}

export function getUserList() {
  return users;
}

export function getActiveAdminCount() {
  return users.filter(item => item.role === 'admin' && item.active && item.archived !== true).length;
}

export async function archiveUser(username) {
  const user = await getUserByUsername(username);
  if (!user) throw new Error('User tidak ditemukan.');

  // Guard the last active admin
  if (user.role === 'admin') {
    const activeAdmins = users.filter(u => u.role === 'admin' && u.active !== false && u.archived !== true);
    if (activeAdmins.length <= 1) throw new Error('Tidak dapat mengarsipkan admin terakhir.');
  }

  const normalized = normalizeUsername(username);
  const now = new Date().toISOString();
  const updates = { archived: true, archivedAt: now, active: false, updatedAt: now };
  await updateFirebaseData(`${USERS_PATH}/${normalized}`, updates);
  refreshUsersCache(users.map(u =>
    normalizeUsername(u.username) === normalized ? { ...u, ...updates } : u
  ));
}

export async function restoreUser(username) {
  const user = await getUserByUsername(username);
  if (!user) throw new Error('User tidak ditemukan.');
  const normalized = normalizeUsername(username);
  const now = new Date().toISOString();
  const updates = { archived: false, archivedAt: null, updatedAt: now };
  await updateFirebaseData(`${USERS_PATH}/${normalized}`, updates);
  refreshUsersCache(users.map(u =>
    normalizeUsername(u.username) === normalized ? { ...u, ...updates } : u
  ));
}

export async function deleteUser(username) {
  const user = await getUserByUsername(username);
  if (!user) throw new Error('User tidak ditemukan.');
  if (user.archived !== true) throw new Error('User harus diarsipkan sebelum dapat dihapus permanen.');
  const normalized = normalizeUsername(username);
  await storeFirebaseData(`${USERS_PATH}/${normalized}`, null);
  refreshUsersCache(users.filter(u => normalizeUsername(u.username) !== normalized));
}
