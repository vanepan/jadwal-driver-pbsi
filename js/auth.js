/* ============================================================
   AUTH.JS - Simple PIN Login & Role Helpers

   This is a small mock auth layer for the static app.
   It stores only the current session user in localStorage.
   ============================================================ */

'use strict';

const SESSION_KEY = 'pbsi_current_user';

const MOCK_USERS = [
  {
    id: 'admin',
    name: 'Admin',
    role: 'admin',
    pin: '1234',
  },
  {
    id: 'bidang-komite-etik',
    name: 'Bidang Komite Etik',
    role: 'bidang',
    pin: '2222',
  },
  {
    id: 'bidang-humas',
    name: 'Bidang Humas',
    role: 'bidang',
    pin: '3333',
  },
  {
    id: 'viewer',
    name: 'Viewer',
    role: 'viewer',
    pin: '9999',
  },
];

const ROLE_LABELS = {
  admin: 'Admin',
  bidang: 'Bidang',
  viewer: 'Viewer',
};

const PERMISSIONS = {
  view: ['admin', 'bidang', 'viewer'],
  create: ['admin', 'bidang'],
  edit: ['admin'],
  delete: ['admin'],
};

let authChangeCallback = null;

/**
 * Login memakai PIN sederhana.
 * @param {string} pin
 * @returns {Object|null} user tanpa PIN, atau null jika PIN salah
 */
export function login(pin) {
  const user = MOCK_USERS.find(item => item.pin === String(pin).trim());
  if (!user) return null;

  const sessionUser = {
    id: user.id,
    name: user.name,
    role: user.role,
  };

  localStorage.setItem(SESSION_KEY, JSON.stringify(sessionUser));
  notifyAuthChange();
  return sessionUser;
}

/**
 * Logout user saat ini.
 */
export function logout() {
  localStorage.removeItem(SESSION_KEY);
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
 * Permission yang dipakai: view, create, edit, delete.
 * @param {string} permission
 * @returns {boolean}
 */
export function hasPermission(permission) {
  const user = getCurrentUser();
  if (!user) return false;

  const allowedRoles = PERMISSIONS[permission] || [];
  return allowedRoles.includes(user.role);
}

/**
 * Setup login modal, logout button, dan role badge.
 * @param {Function} onAuthChange
 */
export function initAuthUI(onAuthChange) {
  authChangeCallback = onAuthChange;

  const form = document.getElementById('loginForm');
  if (form) {
    form.addEventListener('submit', handleLoginSubmit);
  }

  const logoutButton = document.getElementById('btnLogout');
  if (logoutButton) {
    logoutButton.addEventListener('click', logout);
  }

  updateAuthUI();

  if (!getCurrentUser()) {
    openLoginModal();
  }
}

/**
 * Update badge dan modal sesuai session saat ini.
 */
export function updateAuthUI() {
  const user = getCurrentUser();
  const badge = document.getElementById('roleBadge');
  const logoutButton = document.getElementById('btnLogout');

  if (badge) {
    badge.textContent = user ? user.name : 'Belum Login';
    badge.dataset.role = user ? user.role : 'guest';
    badge.title = user ? ROLE_LABELS[user.role] : 'Silakan login';
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

function handleLoginSubmit(event) {
  event.preventDefault();

  const pinInput = document.getElementById('loginPin');
  const errorEl = document.getElementById('loginError');
  const user = login(pinInput ? pinInput.value : '');

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

  if (modal) modal.style.display = 'flex';

  setTimeout(() => {
    if (pinInput) pinInput.focus();
  }, 50);
}

function closeLoginModal() {
  const modal = document.getElementById('modalLogin');
  if (modal) modal.style.display = 'none';
}

console.info('Auth module loaded');
