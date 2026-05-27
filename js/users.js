'use strict';

import { fetchFirebaseData, subscribeFirebasePath, storeFirebaseData, updateFirebaseData, isFirebaseConfigured } from './firebase.js';

const USERS_PATH = 'users';
let users = [];
let usersLoaded = false;
let onUsersChangeCallback = null;

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

function refreshUsersCache(nextUsers) {
  users = nextUsers;
  usersLoaded = true;
  if (onUsersChangeCallback) onUsersChangeCallback(users);
}

export async function initUsersSync() {
  if (!isFirebaseConfigured()) return;

  if (!usersLoaded) {
    const raw = await fetchFirebaseData(USERS_PATH);
    refreshUsersCache(mapFirebaseUsers(raw));
  }

  subscribeFirebasePath(USERS_PATH, snapshot => {
    refreshUsersCache(mapFirebaseUsers(snapshot.val()));
  });
}

export async function getUsers() {
  if (usersLoaded) return users;
  const raw = await fetchFirebaseData(USERS_PATH);
  refreshUsersCache(mapFirebaseUsers(raw));
  return users;
}

export async function getUserByUsername(username) {
  if (!username) return null;
  const normalized = normalizeUsername(username);
  if (!usersLoaded) await getUsers();
  return users.find(item => normalizeUsername(item.username) === normalized) || null;
}

export async function validateUsername(username, excludeUsername = null) {
  if (!username) return false;
  if (!isValidUsername(username)) return false;
  const normalized = normalizeUsername(username);
  if (!usersLoaded) await getUsers();
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
  onUsersChangeCallback = callback;
}

export function getUserList() {
  return users;
}

export function getActiveAdminCount() {
  return users.filter(item => item.role === 'admin' && item.active).length;
}
