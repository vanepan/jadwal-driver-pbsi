/* ============================================================
   AUTH.JS - Simple PIN Login & Role Helpers

   This is a small mock auth layer for the static app.
   It stores only the current session user in localStorage.
   ============================================================ */

'use strict';

import { getUserByUsername, initUsersSync } from './users.js';
import { logAction } from './logs.js';
import { showToast } from './utils.js';

const SESSION_KEY = 'pbsi_current_user';

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
  print_reimbursement: ['admin', 'driver'],
};

let authChangeCallback = null;

/**
 * Login dengan username + PIN.
 * @param {string} username
 * @param {string} pin
 * @returns {Object|null}
 */
export async function login(username, pin) {
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
 * Logout user saat ini.
 */
export function logout() {
  const currentUser = getCurrentUser();
  localStorage.removeItem(SESSION_KEY);
  if (currentUser) {
    logAction({ userId: currentUser.id, username: currentUser.username, action: 'logout' });
  }
  notifyAuthChange();
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
  }

  const logoutButton = document.getElementById('btnLogout');
  if (logoutButton) {
    logoutButton.addEventListener('click', logout);
  }

  await initUsersSync();
  restoreSession();
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
  const pinInput = document.getElementById('loginPin');

  if (modal) {
    modal.style.display = 'flex';
    modal.style.pointerEvents = 'auto';
  }

  setTimeout(() => {
    if (pinInput) pinInput.focus();
  }, 50);
}

function closeLoginModal() {
  const modal = document.getElementById('modalLogin');
  if (modal) {
    modal.style.display = 'none';
    modal.style.pointerEvents = 'none';
  }
}

console.info('Auth module loaded');
