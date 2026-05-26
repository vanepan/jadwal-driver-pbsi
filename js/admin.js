'use strict';

import { getCurrentUser, isAdmin } from './auth.js';
import { createUser, getUserByUsername, getUsers, initUsersSync, updateUser, deactivateUser, validateUniquePin, validateUsername, registerUsersChangeListener } from './users.js';
import { logAction } from './logs.js';
import { showToast } from './utils.js';

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

  if (btnUserMgmt) btnUserMgmt.addEventListener('click', openUsersListModal);
  if (btnProfile) btnProfile.addEventListener('click', openProfileModal);
  if (btnCloseUserList) btnCloseUserList.addEventListener('click', closeUsersListModal);
  if (btnCloseUserList2) btnCloseUserList2.addEventListener('click', closeUsersListModal);
  if (btnAddUser) btnAddUser.addEventListener('click', () => openUserFormModal());
  if (btnCloseUserForm) btnCloseUserForm.addEventListener('click', closeUserFormModal);
  if (btnCancelUserForm) btnCancelUserForm.addEventListener('click', closeUserFormModal);
  if (btnCloseProfile) btnCloseProfile.addEventListener('click', closeProfileModal);
  if (btnCancelProfile) btnCancelProfile.addEventListener('click', closeProfileModal);

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

  if (!username || !displayName || !pin) {
    showToast('Lengkapi username, display name, dan PIN.');
    return;
  }

  if (!/^\d{4}$/.test(pin)) {
    showToast('PIN harus 4 digit angka.');
    return;
  }

  if (!(await validateUniquePin(pin, editingUsername))) {
    showToast('PIN sudah dipakai oleh user lain.');
    return;
  }

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

function openProfileModal() {
  const modal = document.getElementById('modalProfile');
  if (!modal) return;
  const currentUser = getCurrentUser();
  const usernameLabel = document.getElementById('profileUsernameLabel');
  if (usernameLabel) usernameLabel.textContent = currentUser ? currentUser.displayName : '-';
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

  if (!/^\d{4}$/.test(currentPin) || !/^\d{4}$/.test(newPin) || !/^\d{4}$/.test(confirmPin)) {
    showToast('Semua field PIN harus 4 digit angka.');
    return;
  }

  if (newPin !== confirmPin) {
    showToast('Konfirmasi PIN tidak cocok.');
    return;
  }

  try {
    const user = await getUserByUsername(currentUser.username);
    if (!user || user.pin !== currentPin) {
      showToast('PIN saat ini tidak cocok.');
      return;
    }

    if (!(await validateUniquePin(newPin, currentUser.username))) {
      showToast('PIN baru sudah digunakan oleh user lain.');
      return;
    }

    await updateUser({ username: currentUser.username, pin: newPin });
    await logAction({ userId: currentUser.id, username: currentUser.username, action: 'pin_changed', targetId: currentUser.username });
    showToast('PIN berhasil diperbarui.');
    closeProfileModal();
  } catch (error) {
    showToast(error.message || 'Gagal mengubah PIN.');
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
