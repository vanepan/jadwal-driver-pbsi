'use strict';

import { getCurrentUser, isAdmin, logout } from './auth.js';
import { createUser, getUserByUsername, getUsers, initUsersSync, updateUser, deactivateUser, validateUsername, registerUsersChangeListener } from './users.js';
import { logAction } from './logs.js';
import { sendNotification } from './telegram.js';
import { showToast } from './utils.js';

const TELEGRAM_BOT_USERNAME = 'PBSI_Assistant_Bot';
const TELEGRAM_BOT_URL = `https://t.me/${TELEGRAM_BOT_USERNAME}`;

let users = [];
let editingUsername = null;

export async function initAdminUI() {
  await initUsersSync();
  users = await getUsers();
  attachAdminButtons();
  renderAdminList();
  registerUsersChangeListener((nextUsers) => {
    users = nextUsers;
    renderAdminList();
    checkCurrentUserActiveState();
  });
}

function attachAdminButtons() {
  const btnUserMgmt = document.getElementById('btnUserMgmt');
  const btnProfile = document.getElementById('btnProfile');
  const btnCloseUserList = document.getElementById('btnCloseUsersList');
  const btnCloseUserList2 = document.getElementById('btnCloseUsersList2');
  const btnAddUser = document.getElementById('btnOpenAddUser');
  const btnCloseUserForm = document.getElementById('btnCloseUserForm');
  const btnCancelUserForm = document.getElementById('btnCancelUserForm');
  const btnCloseProfile = document.getElementById('btnCloseProfile');
  const btnCancelProfile = document.getElementById('btnCancelProfile');
  const btnOpenTelegramBot = document.getElementById('btnOpenTelegramBot');
  const btnSendTestTelegram = document.getElementById('btnSendTestTelegram');
  const btnCopyMyIdCommand = document.getElementById('btnCopyMyIdCommand');

  if (btnUserMgmt) btnUserMgmt.addEventListener('click', openUsersListModal);

  // Profile modal → Admin Panel shortcut (admin only, P2.2)
  const btnProfileOpenAdmin = document.getElementById('btnProfileOpenAdmin');
  if (btnProfileOpenAdmin) {
    btnProfileOpenAdmin.addEventListener('click', () => {
      closeProfileModal();
      openUsersListModal();
    });
  }
  if (btnProfile) {
    btnProfile.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();
      console.log('[CLICK] PROFILE');
      openProfileModal();
    });
  }
  if (btnCloseUserList) btnCloseUserList.addEventListener('click', closeUsersListModal);
  if (btnCloseUserList2) btnCloseUserList2.addEventListener('click', closeUsersListModal);
  if (btnAddUser) btnAddUser.addEventListener('click', () => openUserFormModal());
  if (btnCloseUserForm) btnCloseUserForm.addEventListener('click', closeUserFormModal);
  if (btnCancelUserForm) btnCancelUserForm.addEventListener('click', closeUserFormModal);
  if (btnCloseProfile) btnCloseProfile.addEventListener('click', closeProfileModal);
  if (btnCancelProfile) btnCancelProfile.addEventListener('click', closeProfileModal);
  if (btnOpenTelegramBot) btnOpenTelegramBot.addEventListener('click', openTelegramBot);
  if (btnSendTestTelegram) btnSendTestTelegram.addEventListener('click', handleSendTestTelegram);
  if (btnCopyMyIdCommand) btnCopyMyIdCommand.addEventListener('click', handleCopyMyIdCommand);

  // Telegram Chat ID input listeners
  const primaryChatIdField = document.getElementById('profileTelegramChatIdPrimary');
  const btnPasteIdPrimary = document.getElementById('btnPasteIdPrimary');
  const extra1ChatIdField = document.getElementById('profileTelegramChatId1');

  if (btnPasteIdPrimary) {
    btnPasteIdPrimary.addEventListener('click', handlePasteChatId);
  }

  if (primaryChatIdField) {
    primaryChatIdField.addEventListener('input', updateTelegramStatusBadge);
    primaryChatIdField.addEventListener('change', updateTelegramStatusBadge);
  }

  if (extra1ChatIdField) {
    extra1ChatIdField.addEventListener('input', updateTelegramStatusBadge);
    extra1ChatIdField.addEventListener('change', updateTelegramStatusBadge);
  }

  const form = document.getElementById('userForm');
  if (form) form.addEventListener('submit', handleUserFormSubmit);

  const profileForm = document.getElementById('profileForm');
  if (profileForm) profileForm.addEventListener('submit', handleProfileSubmit);

  const usersModal = document.getElementById('modalUsersList');
  if (usersModal) {
    usersModal.addEventListener('click', (event) => {
      if (event.target === usersModal) closeUsersListModal();
    });
  }

  const userFormModal = document.getElementById('modalUserForm');
  if (userFormModal) {
    userFormModal.addEventListener('click', (event) => {
      if (event.target === userFormModal) closeUserFormModal();
    });
  }

  const profileModal = document.getElementById('modalProfile');
  if (profileModal) {
    profileModal.addEventListener('click', (event) => {
      if (event.target === profileModal) closeProfileModal();
    });
  }
}

export function updateAdminButtons() {
  const btnUserMgmt = document.getElementById('btnUserMgmt');
  const btnProfile = document.getElementById('btnProfile');
  const currentUser = getCurrentUser();

  if (btnProfile) {
    btnProfile.style.display = currentUser ? 'flex' : 'none';
  }

  if (btnUserMgmt) {
    btnUserMgmt.style.display = isAdmin() ? 'flex' : 'none';
  }
}

function openUsersListModal() {
  renderAdminList();
  const modal = document.getElementById('modalUsersList');
  if (modal) modal.style.display = 'flex';
}

function closeUsersListModal() {
  const modal = document.getElementById('modalUsersList');
  if (modal) modal.style.display = 'none';
}

function openUserFormModal(username = null) {
  editingUsername = username;
  const form = document.getElementById('userForm');
  if (!form) return;
  form.reset();

  const title = document.getElementById('modalUserFormTitle');
  if (title) title.textContent = username ? 'Edit User' : 'Tambah User';

  const btnSave = document.getElementById('btnSaveUserForm');
  if (btnSave) btnSave.textContent = username ? 'Simpan Perubahan' : 'Buat User';

  const usernameField = document.getElementById('userFieldUsername');
  const displayNameField = document.getElementById('userFieldDisplayName');
  const roleField = document.getElementById('userFieldRole');
  const pinField = document.getElementById('userFieldPin');
  const activeField = document.getElementById('userFieldActive');

  if (username && users.length) {
    const user = users.find(item => item.username === username);
    if (user) {
      if (usernameField) {
        usernameField.value = user.username;
        usernameField.disabled = true;
      }
      if (displayNameField) displayNameField.value = user.displayName || user.username;
      if (roleField) roleField.value = user.role;
      if (pinField) pinField.value = user.pin || '';
      if (activeField) activeField.checked = Boolean(user.active);
    }
  } else {
    if (usernameField) {
      usernameField.value = '';
      usernameField.disabled = false;
    }
    if (displayNameField) displayNameField.value = '';
    if (roleField) roleField.value = 'viewer';
    if (pinField) pinField.value = '';
    if (activeField) activeField.checked = true;
  }

  const modal = document.getElementById('modalUserForm');
  if (modal) modal.style.display = 'flex';
}

function closeUserFormModal() {
  const modal = document.getElementById('modalUserForm');
  if (modal) modal.style.display = 'none';
  editingUsername = null;
}

async function handleUserFormSubmit(event) {
  event.preventDefault();

  const usernameField = document.getElementById('userFieldUsername');
  const displayNameField = document.getElementById('userFieldDisplayName');
  const roleField = document.getElementById('userFieldRole');
  const pinField = document.getElementById('userFieldPin');
  const activeField = document.getElementById('userFieldActive');

  const username = usernameField ? usernameField.value.trim() : '';
  const displayName = displayNameField ? displayNameField.value.trim() : '';
  const role = roleField ? roleField.value : 'viewer';
  const pin = pinField ? pinField.value.trim() : '';
  const active = activeField ? activeField.checked : true;

    if (!username || !displayName || !role) {
      showToast('Lengkapi username, display name, dan role.');
      return;
    }

    // PIN required only for new user creation
    if (!editingUsername && !pin) {
      showToast('PIN wajib diisi untuk user baru.');
      return;
    }

  if (!/^\d{4}$/.test(pin)) {
    showToast('PIN harus 4 digit angka.');
    return;
  }

    // Duplicate PINs allowed; no uniqueness check needed

  if (!(await validateUsername(username, editingUsername))) {
    showToast('Username sudah digunakan atau tidak valid.');
    return;
  }

  try {
    if (editingUsername) {
      await updateUser({ username: editingUsername, displayName, role, pin, active });
      await logAction({ userId: getCurrentUser().id, username: getCurrentUser().username, action: 'user_edited', targetId: editingUsername, metadata: { displayName, role, active } });
      showToast('User berhasil diperbarui.');
    } else {
      await createUser({ username, displayName, role, pin, active });
      await logAction({ userId: getCurrentUser().id, username: getCurrentUser().username, action: 'user_created', targetId: username, metadata: { displayName, role, active } });
      showToast('User baru berhasil dibuat.');
    }
    users = await getUsers();
    renderAdminList();
    closeUserFormModal();
  } catch (error) {
    showToast(error.message || 'Gagal menyimpan user.');
    console.error(error);
  }
}

function renderAdminList() {
  const container = document.getElementById('usersListContent');
  if (!container) return;

  const sorted = [...users].sort((a, b) => {
    const order = { admin: 0, bidang: 1, viewer: 2 };
    return (order[a.role] - order[b.role]) || a.username.localeCompare(b.username);
  });

  if (sorted.length === 0) {
    container.innerHTML = '<div class="empty-request-state">Belum ada user.</div>';
    return;
  }

  container.innerHTML = sorted.map(user => {
    const status = user.active ? 'Aktif' : 'Non-aktif';
    const statusClass = user.active ? 'status-active' : 'status-inactive';
    return `
      <div class="user-card">
        <div class="user-card-main">
          <div>
            <div class="user-title">${escapeHTML(user.displayName || user.username)}</div>
            <div class="user-sub">${escapeHTML(user.username)} · ${escapeHTML(user.role)}</div>
          </div>
          <span class="user-status ${statusClass}">${status}</span>
        </div>
        <div class="user-card-meta">
          <div>PIN: ${escapeHTML(user.pin || '—')}</div>
          <div>Dibuat: ${new Date(user.createdAt || '').toLocaleDateString('id-ID') || '-'}</div>
        </div>
        <div class="user-card-actions">
          <button class="btn-secondary" data-user-action="edit" data-user-name="${escapeHTML(user.username)}">Edit</button>
          ${user.active ? `<button class="btn-secondary" data-user-action="deactivate" data-user-name="${escapeHTML(user.username)}">Nonaktifkan</button>` : ''}
          <button class="btn-secondary" data-user-action="reset" data-user-name="${escapeHTML(user.username)}">Reset PIN</button>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('[data-user-action]').forEach(button => {
    button.addEventListener('click', handleUserActionClick);
  });
}

async function handleUserActionClick(event) {
  const button = event.currentTarget;
  const action = button.dataset.userAction;
  const username = button.dataset.userName;

  if (!username) return;

  if (action === 'edit') {
    openUserFormModal(username);
    return;
  }

  if (action === 'deactivate') {
    if (!confirm('Nonaktifkan user ini?')) return;
    try {
      await deactivateUser(username);
      await logAction({ userId: getCurrentUser().id, username: getCurrentUser().username, action: 'user_deactivated', targetId: username });
      showToast('User dinonaktifkan.');
      users = await getUsers();
      renderAdminList();
    } catch (error) {
      showToast(error.message || 'Gagal menonaktifkan user.');
    }
    return;
  }

  if (action === 'reset') {
    try {
      const randomPin = String(Math.floor(1000 + Math.random() * 9000));
      await updateUser({ username, pin: randomPin });
      await logAction({ userId: getCurrentUser().id, username: getCurrentUser().username, action: 'user_pin_reset', targetId: username });
      showToast(`PIN untuk ${username} di-reset menjadi ${randomPin}`);
      users = await getUsers();
      renderAdminList();
    } catch (error) {
      showToast(error.message || 'Gagal mereset PIN.');
    }
    return;
  }
}

/**
 * Update Telegram status badge berdasarkan ada tidaknya Chat ID.
 * Called saat input berubah atau modal dibuka.
 */
function updateTelegramStatusBadge() {
  const primaryField = document.getElementById('profileTelegramChatIdPrimary');
  const statusBadge = document.getElementById('telegramStatusBadge');
  const statusText = document.getElementById('telegramStatusText');

  if (!statusBadge || !primaryField) return;

  const hasChatId = Boolean(primaryField.value?.trim());

  if (hasChatId) {
    statusBadge.dataset.status = 'connected';
    statusBadge.textContent = '✅ Terhubung';
    if (statusText) statusText.textContent = 'Telegram sudah terhubung. Notifikasi akan dikirim.';
  } else {
    statusBadge.dataset.status = 'not-connected';
    statusBadge.textContent = '⚠️ Belum Terhubung';
    if (statusText) statusText.textContent = 'Belum terhubung ke Telegram. Setup Chat ID terlebih dahulu.';
  }
}

/**
 * Handle paste button - paste from clipboard ke Chat ID input.
 * Uses modern Clipboard API with fallback.
 */
async function handlePasteChatId(event) {
  event.preventDefault();
  const primaryField = document.getElementById('profileTelegramChatIdPrimary');
  if (!primaryField) return;

  try {
    // Try modern Clipboard API first
    if (navigator.clipboard && navigator.clipboard.readText) {
      const text = await navigator.clipboard.readText();
      primaryField.value = text.trim();
      primaryField.focus();
      updateTelegramStatusBadge();
      showToast('Chat ID berhasil dipaste dari clipboard');
    } else {
      // Fallback untuk browser lama
      showToast('Clipboard API tidak tersedia. Paste manual menggunakan Ctrl+V');
      primaryField.focus();
    }
  } catch (error) {
    console.error('Paste error:', error);
    showToast('Gagal paste dari clipboard. Paste manual dengan Ctrl+V');
    primaryField.focus();
  }
}

async function openProfileModal() {
  const modal = document.getElementById('modalProfile');
  if (!modal) return;

  const currentUser = getCurrentUser();
  const usernameLabel = document.getElementById('profileUsernameLabel');
  const avatarEl = document.getElementById('profileAvatar');
  const roleEl = document.getElementById('profileRoleLabel');
  const primaryField = document.getElementById('profileTelegramChatIdPrimary');
  const extra1Field = document.getElementById('profileTelegramChatId1');
  const extra2Field = document.getElementById('profileTelegramChatId2');
  const notificationsEnabledField = document.getElementById('profileNotificationsEnabled');

  if (usernameLabel) usernameLabel.textContent = currentUser ? (currentUser.name || currentUser.username) : '-';

  if (avatarEl && currentUser) {
    avatarEl.textContent = (currentUser.name || currentUser.username || '?').charAt(0).toUpperCase();
  }

  if (roleEl && currentUser) {
    const roleLabels = { admin: 'Admin', bidang: 'Bidang', viewer: 'Viewer', driver: 'Driver' };
    roleEl.textContent = roleLabels[currentUser.role] || currentUser.role || '';
    roleEl.dataset.role = currentUser.role || '';
  }

  // Prefill fields from Firebase; support legacy telegramChatId
  if (currentUser) {
    try {
      const user = await getUserByUsername(currentUser.username);
      if (user) {
        const ids = user.telegramChatIds || (user.telegramChatId ? { primary: user.telegramChatId } : {});
        if (primaryField) primaryField.value = ids.primary || '';
        if (extra1Field) extra1Field.value = ids.secondary1 || '';
        if (extra2Field) extra2Field.value = ids.secondary2 || '';
        if (notificationsEnabledField) notificationsEnabledField.checked = Boolean(user.notificationsEnabled);
        const isDriver = (currentUser.role === 'driver' || (user.role === 'driver'));
        const driverOnlyEls = [extra1Field, extra2Field];
        driverOnlyEls.forEach(el => { if (el) el.parentElement.style.display = isDriver ? 'block' : 'none'; });
      }
    } catch (err) {
      console.error('[openProfileModal] failed to load user data:', err);
    }
  }

  // Admin section — visible only when the logged-in user is admin
  const adminSection = document.getElementById('profileAdminSection');
  if (adminSection) adminSection.style.display = isAdmin() ? 'block' : 'none';

  // Update Telegram status badge saat modal dibuka
  updateTelegramStatusBadge();

  modal.style.display = 'flex';
}

function closeProfileModal() {
  const modal = document.getElementById('modalProfile');
  if (modal) modal.style.display = 'none';
  const form = document.getElementById('profileForm');
  if (form) form.reset();
}

async function handleProfileSubmit(event) {
  event.preventDefault();
  const currentUser = getCurrentUser();
  if (!currentUser) {
    showToast('Sesi tidak tersedia. Silakan login ulang.');
    return;
  }

  const currentPin = document.getElementById('profileCurrentPin')?.value.trim();
  const newPin = document.getElementById('profileNewPin')?.value.trim();
  const confirmPin = document.getElementById('profileConfirmPin')?.value.trim();
  const primary = document.getElementById('profileTelegramChatIdPrimary')?.value.trim() || '';
  const extra1 = document.getElementById('profileTelegramChatId1')?.value.trim() || '';
  const extra2 = document.getElementById('profileTelegramChatId2')?.value.trim() || '';
  const notificationsEnabled = Boolean(document.getElementById('profileNotificationsEnabled')?.checked);

  const pinChangeRequested = Boolean(currentPin || newPin || confirmPin);
  if (pinChangeRequested) {
    if (!/^[0-9]{4}$/.test(currentPin) || !/^[0-9]{4}$/.test(newPin) || !/^[0-9]{4}$/.test(confirmPin)) {
      showToast('Semua field PIN harus 4 digit angka.');
      return;
    }
    if (newPin !== confirmPin) {
      showToast('Konfirmasi PIN tidak cocok.');
      return;
    }
  }

  // Collect chat IDs; driver accounts may have multiple
  const ids = [primary, extra1, extra2].map(v => (v || '').trim()).filter(Boolean);
  // Prevent duplicates within same account
  const uniqueIds = Array.from(new Set(ids));

  if (notificationsEnabled && uniqueIds.length === 0) {
    showToast('Isi minimal satu Telegram Chat ID jika notifikasi diaktifkan.');
    return;
  }

  // Validate numeric chat IDs
  for (const id of uniqueIds) {
    if (!/^-?\d+$/.test(id)) {
      showToast('Telegram Chat ID harus berupa angka.');
      return;
    }
  }

  try {
    const user = await getUserByUsername(currentUser.username);
    if (!user) {
      showToast('User tidak ditemukan.');
      return;
    }

    if (pinChangeRequested && user.pin !== currentPin) {
      showToast('PIN saat ini tidak cocok.');
      return;
    }

    const telegramChatIds = {};
    if (uniqueIds.length > 0) {
      telegramChatIds.primary = uniqueIds[0];
      if (uniqueIds[1]) telegramChatIds.secondary1 = uniqueIds[1];
      if (uniqueIds[2]) telegramChatIds.secondary2 = uniqueIds[2];
    }

    const updatePayload = {
      username: currentUser.username,
      telegramChatIds,
      notificationsEnabled,
    };

    if (pinChangeRequested) updatePayload.pin = newPin;

    await updateUser(updatePayload);
    await logAction({ userId: currentUser.id, username: currentUser.username, action: 'profile_updated', targetId: currentUser.username });
    showToast('Profil berhasil diperbarui.');
    closeProfileModal();
  } catch (error) {
    showToast(error.message || 'Gagal memperbarui profil.');
  }
}

function openTelegramBot() {
  window.open(TELEGRAM_BOT_URL, '_blank', 'noopener');
}

async function handleSendTestTelegram() {
  const currentUser = getCurrentUser();
  if (!currentUser) {
    showToast('Sesi tidak tersedia. Silakan login ulang.');
    return;
  }
  try {
    const user = await getUserByUsername(currentUser.username);
    if (!user) {
      showToast('User tidak ditemukan.');
      return;
    }

    const results = await sendNotification(user, `Tes notifikasi dari PBSI Scheduler pada ${new Date().toLocaleString('id-ID')}`);
    if (results && results.skipped) {
      showToast('Notifikasi tidak dikirim: notifikasi dinonaktifkan.');
      return;
    }

    const okCount = Array.isArray(results) ? results.filter(r => r.ok).length : 0;
    const errCount = Array.isArray(results) ? results.filter(r => !r.ok).length : 0;
    showToast(`Notifikasi tes: sukses ${okCount}, gagal ${errCount}`);
    await logAction({ userId: currentUser.id, username: currentUser.username, action: 'telegram_test_sent', targetId: JSON.stringify(results || {}) });
  } catch (error) {
    showToast(error.message || 'Gagal mengirim notifikasi tes.');
  }
}

function handleCopyMyIdCommand() {
  const text = '/myid';
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('Perintah /myid tersalin.');
    }).catch(() => {
      showToast('Gagal menyalin. Silakan salin secara manual: /myid');
    });
    return;
  }

  // Fallback: use execCommand
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('Perintah /myid tersalin.');
  } catch (e) {
    showToast('Gagal menyalin. Silakan salin secara manual: /myid');
  }
}

function escapeHTML(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function checkCurrentUserActiveState() {
  const currentUser = getCurrentUser();
  if (!currentUser) return;
  const current = users.find(item => item.username === currentUser.username);
  if (current && current.active === false) {
    showToast('Akun Anda dinonaktifkan. Silakan login ulang jika diaktifkan kembali.');
    window.location.reload();
  }
}
