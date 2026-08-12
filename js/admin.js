'use strict';

import { getCurrentUser, isAdmin, logout } from './auth.js';
import { roleLabel } from './config/role-registry.js';   // single source of role display labels
import { createUser, getUserByUsername, getUsers, updateUser, deactivateUser, validateUsername, registerUsersChangeListener, getUserList } from './users.js';
import { callResetUserCredential, callChangeMyCredential } from './firebase.js';
// v1.30.4 User Management Integration — Role Domain reads for the create/edit
// modal: an assignable-role catalog (System + active Custom, disabled) and a
// reused Role Summary (never recomputed locally, per role-summary-model.js).
import { getAllRoles, resolveGrantedSet, resolveRoleInfo } from './role-management/role-catalog.js';
import { buildRoleSummary } from './role-management/role-summary-model.js';
import { logAction } from './logs.js';
import { sendNotification } from './telegram.js';
import { showToast } from './utils.js';
import { syncPbsiSelect } from './pbsi-select.js';
import { enablePush, isPushSupported } from './push.js';
import { wireSheetSwipeDismiss, lockBodyScroll, unlockBodyScroll } from './ui/sheet-gesture.js'; // Phase 11K

const TELEGRAM_BOT_USERNAME = 'PBSI_Assistant_Bot';
const TELEGRAM_BOT_URL = `https://t.me/${TELEGRAM_BOT_USERNAME}`;

let users = [];
let editingUsername = null;

// v1.30.9.3 — Secure Admin PIN Reset UX. Inline stroke-SVG eye/eye-off icons,
// matching the app's existing icon system (viewBox 24x24, currentColor,
// stroke-width 1.8 — see index.html's nav-icon SVGs). No icon font/library.
const ICON_EYE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
const ICON_EYE_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a21.27 21.27 0 0 1 5.06-5.94"/><path d="M9.9 4.24A10.6 10.6 0 0 1 12 4c7 0 11 7 11 7a21.27 21.27 0 0 1-2.16 3.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><path d="M1 1l22 22"/></svg>';

// Reset PIN flow state — a username pending confirmation/result, whether to
// reopen the Edit User modal afterward, and the ONE-TIME plaintext returned
// by resetCredential. Exists only as in-memory UI state, never persisted
// (no localStorage/sessionStorage), and cleared the instant its dialog closes.
const pinResetFlow = { username: null, returnToEdit: false, plaintext: null };

// Role group headers. Labels are DERIVED from the shared role registry
// (roleLabel) — the single source of truth for role presentation (Objective 5).
// No hardcoded role strings here; renaming a role in the registry updates these.
const ROLE_CONFIG = [
  { key: 'admin',                   defaultExpanded: true,  visible: true  },
  { key: 'bidang',                  defaultExpanded: false, visible: true  },
  { key: 'driver',                  defaultExpanded: false, visible: true  },
  { key: 'viewer',                  defaultExpanded: false, visible: true  },
  // Engineering (v1.20.2) — the two concrete stored roles; the "Engineering"
  // role option in the form is a sentinel that resolves to one of these.
  { key: 'engineering_coordinator', defaultExpanded: false, visible: true },
  { key: 'engineering_member',      defaultExpanded: false, visible: true  },
].map((r) => ({ ...r, label: roleLabel(r.key).toUpperCase() }));

const groupExpanded = {};

/**
 * Sync a .pbsi-setting-status element to reflect the current toggle state.
 * @param {string} id - Element ID of the status <span>
 * @param {boolean} isOn
 */
function syncSettingStatus(id, isOn) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = isOn ? 'Aktif' : 'Nonaktif';
  el.classList.toggle('is-active', Boolean(isOn));
}

export async function initAdminUI() {
  // UI wiring only. User data load + realtime subscription is auth-gated
  // (app.js loadAuthedAdminData → ensureUsersLoadedAndSubscribed) so it never
  // runs unauthenticated and poisons the cache. We render whatever is cached
  // now (empty until auth arrives) and the change listener re-renders on the
  // first authenticated snapshot. See docs/ADMIN_DATA_BOOTSTRAP_FIX_DESIGN.md.
  attachAdminButtons();
  registerUsersChangeListener((nextUsers) => {
    users = nextUsers;
    renderAdminList();
    checkCurrentUserActiveState();
  });
  users = getUserList();
  renderAdminList();
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
  const btnEnablePushDevice = document.getElementById('btnEnablePushDevice');

  // V2 shell handles navigation to Administration workspace via setRailModule('administration').
  // Only attach the V1 modal in legacy (non-V2) context.
  if (btnUserMgmt && !document.body.classList.contains('v2-shell-active')) {
    btnUserMgmt.addEventListener('click', openUsersListModal);
  }

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
  if (btnEnablePushDevice) btnEnablePushDevice.addEventListener('click', handleEnablePushDevice);

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

  // Engineering role → reveal the Koordinator/Anggota segment (v1.20.2).
  const roleSelect = document.getElementById('userFieldRole');
  if (roleSelect) roleSelect.addEventListener('change', () => {
    syncEngineeringLevelUI();
    renderUserRoleSummaryPanel(); // v1.30.4
  });
  // Single-select: checking one Engineering level card unchecks the other.
  document.querySelectorAll('#userEngineeringLevelGroup [data-eng-level]').forEach((cb) => {
    cb.addEventListener('change', () => {
      setEngineeringLevel(cb.checked ? cb.dataset.engLevel : null);
      renderUserRoleSummaryPanel(); // v1.30.4
    });
  });

  const profileForm = document.getElementById('profileForm');
  if (profileForm) profileForm.addEventListener('submit', handleProfileSubmit);

  // ── Setting status: live update on toggle change ──────────────
  document.getElementById('profileNotificationsEnabled')?.addEventListener('change', (e) => {
    syncSettingStatus('statusNotificationsEnabled', e.target.checked);
  });

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

  // v1.30.9.3 — Secure Admin PIN Reset UX.
  // Create User's own eye toggle — reveals/hides what was just typed, never
  // anything stored. type="button" + inside #userForm, so it must never submit.
  const btnToggleUserFieldPin = document.getElementById('btnToggleUserFieldPin');
  const userFieldPinInput = document.getElementById('userFieldPin');
  if (btnToggleUserFieldPin && userFieldPinInput) {
    btnToggleUserFieldPin.addEventListener('click', () => {
      setPinToggleState(btnToggleUserFieldPin, userFieldPinInput, userFieldPinInput.type === 'password');
    });
  }

  // Edit User's "Reset PIN" trigger — closes the Edit modal first (Option A,
  // no stacked modals, same convention js/modal.js's odometer/cancel/
  // overtime-override dialogs already use) and remembers to reopen it.
  document.getElementById('btnResetPinFromEdit')?.addEventListener('click', () => {
    if (!editingUsername) return;
    const username = editingUsername;
    closeUserFormModal();
    openResetPinConfirm(username, { returnToEdit: true });
  });

  // Reset PIN confirmation dialog
  document.getElementById('btnCloseResetPinConfirm')?.addEventListener('click', () => closeResetPinConfirm({ reopenEdit: true }));
  document.getElementById('btnCancelResetPin')?.addEventListener('click', () => closeResetPinConfirm({ reopenEdit: true }));
  document.getElementById('btnConfirmResetPin')?.addEventListener('click', handleConfirmResetPin);
  const resetPinConfirmModal = document.getElementById('modalResetPinConfirm');
  if (resetPinConfirmModal) {
    resetPinConfirmModal.addEventListener('click', (event) => {
      if (event.target === resetPinConfirmModal) closeResetPinConfirm({ reopenEdit: true });
    });
  }

  // Reset PIN result dialog — the one-time plaintext display.
  document.getElementById('btnCloseResetPinResult')?.addEventListener('click', () => closeResetPinResult({ reopenEdit: true }));
  document.getElementById('btnDoneResetPin')?.addEventListener('click', () => closeResetPinResult({ reopenEdit: true }));
  document.getElementById('btnCopyResetPin')?.addEventListener('click', handleCopyResetPin);
  const btnToggleResetPinReveal = document.getElementById('btnToggleResetPinReveal');
  const resetPinResultInput = document.getElementById('resetPinResultValue');
  if (btnToggleResetPinReveal && resetPinResultInput) {
    btnToggleResetPinReveal.addEventListener('click', () => {
      setPinToggleState(btnToggleResetPinReveal, resetPinResultInput, resetPinResultInput.type === 'password');
    });
  }
  const resetPinResultModal = document.getElementById('modalResetPinResult');
  if (resetPinResultModal) {
    resetPinResultModal.addEventListener('click', (event) => {
      if (event.target === resetPinResultModal) closeResetPinResult({ reopenEdit: true });
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

  // Petty Cash Center — admin only (v1.13.0).
  const btnPettyCash = document.getElementById('btnPettyCash');
  if (btnPettyCash) {
    btnPettyCash.style.display = isAdmin() ? 'flex' : 'none';
  }

  // Overtime Management — admin only (v1.25.0 mobile module entry).
  const btnOvertime = document.getElementById('btnOvertime');
  if (btnOvertime) {
    btnOvertime.style.display = isAdmin() ? 'flex' : 'none';
  }

  // Analytics module — admin only (v1.14.0 mobile module entry).
  const btnAnalytics = document.getElementById('btnAnalytics');
  if (btnAnalytics) {
    btnAnalytics.style.display = isAdmin() ? 'flex' : 'none';
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

export function openUserFormModal(username = null) {
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
  const pinToggle = document.getElementById('btnToggleUserFieldPin');
  const pinCreateGroup = document.getElementById('userFieldPinGroup');
  const credentialGroup = document.getElementById('userCredentialGroup');
  const activeField = document.getElementById('userFieldActive');

  // v1.30.4 — before setting .value, so an active Custom Role reference (rare,
  // but possible via manual data) can still be represented as a disabled option.
  refreshCustomRoleOptions();
  let currentRoleWarning = null;

  // v1.30.9.3 — always start masked, regardless of mode; whichever group is
  // about to become visible below never opens already-revealed.
  if (pinField && pinToggle) setPinToggleState(pinToggle, pinField, false);

  if (username && users.length) {
    const user = users.find(item => item.username === username);
    if (user) {
      if (usernameField) {
        usernameField.value = user.username;
        usernameField.disabled = true;
      }
      if (displayNameField) displayNameField.value = user.displayName || user.username;
      // Engineering roles map back to the "engineering" sentinel + segment level.
      if (roleField) {
        if (user.role === 'engineering_coordinator' || user.role === 'engineering_member') {
          roleField.value = 'engineering';
          setEngineeringLevel(user.role === 'engineering_coordinator' ? 'coordinator' : 'member');
        } else {
          roleField.value = user.role;
          setEngineeringLevel(null);
          // The select can only represent System Roles + active Custom Roles.
          // If it couldn't hold this user's actual stored role, that role is
          // archived or a broken reference — surface it, never silently swap
          // it for whatever the select fell back to.
          if (roleField.value !== user.role) currentRoleWarning = resolveRoleInfo(user.role);
        }
      }
      // v1.30.9.3 — Secure Admin PIN Reset UX. The Credential Security
      // Patch (v1.30.6.2) made stored credentials one-way (pinHash); there
      // is no plaintext left to pre-fill, migrated or not, and a legacy
      // record's plaintext `pin` field (still possible during the
      // migration bridge — see docs/PRODUCTION_RTDB_DEPLOYMENT_REPORT_
      // v1.30.9.2.md §7) is likewise never read into this form. Edit shows
      // only "PIN tersimpan" + Reset PIN — never an input at all.
      if (pinField) pinField.value = '';
      if (pinCreateGroup) pinCreateGroup.style.display = 'none';
      if (credentialGroup) credentialGroup.style.display = '';
      if (activeField) activeField.checked = Boolean(user.active);
    }
  } else {
    if (usernameField) {
      usernameField.value = '';
      usernameField.disabled = false;
    }
    if (displayNameField) displayNameField.value = '';
    if (roleField) roleField.value = 'viewer';
    setEngineeringLevel(null);
    if (pinField) pinField.value = '';
    if (pinCreateGroup) pinCreateGroup.style.display = '';
    if (credentialGroup) credentialGroup.style.display = 'none';
    if (activeField) activeField.checked = true;
  }
  syncPbsiSelect(roleField);
  syncEngineeringLevelUI();
  renderCurrentRoleWarning(currentRoleWarning);
  renderUserRoleSummaryPanel();

  const modal = document.getElementById('modalUserForm');
  if (modal) modal.style.display = 'flex';
}

/**
 * v1.30.8 — list active Custom Roles as real, selectable options (activates
 * the v1.30.4 groundwork; the Permission Migration this was deferred for
 * — verifyPin.js / permission-service.js / database.rules.json Custom Role
 * resolution — shipped in v1.30.5-v1.30.7 and is deployed). Archived Custom
 * Roles are never listed here: they're already excluded upstream by
 * role-catalog.js#getAllRoles() (System Roles + active Custom Roles only —
 * the same mechanism System Roles themselves rely on, no archive state to
 * render). A user whose CURRENT stored role turns out to be archived or
 * unknown is surfaced separately, by renderCurrentRoleWarning() below — not
 * as a disabled option in this list. The save path (js/users.js#isValidRole())
 * enforces the identical active-role-only rule independent of this UI.
 */
function refreshCustomRoleOptions() {
  const roleField = document.getElementById('userFieldRole');
  if (!roleField) return;

  roleField.querySelectorAll('optgroup[data-dynamic-role-group]').forEach((el) => el.remove());

  const customRoles = getAllRoles().filter((r) => r.type === 'custom');
  if (!customRoles.length) return;

  const group = document.createElement('optgroup');
  group.label = 'Custom Role';
  group.dataset.dynamicRoleGroup = 'true';
  customRoles.forEach((r) => {
    const opt = document.createElement('option');
    opt.value = r.id;
    opt.textContent = r.label;
    group.appendChild(opt);
  });
  roleField.appendChild(group);
}

/** v1.30.4 — shown only when the picker couldn't represent a user's actual
    stored role (an archived Custom Role or a broken reference). */
function renderCurrentRoleWarning(info) {
  const el = document.getElementById('userRoleCurrentWarning');
  if (!el) return;
  if (!info) {
    el.style.display = 'none';
    el.innerHTML = '';
    return;
  }
  const reason = info.unknown ? 'tidak dikenal sistem' : 'sudah diarsipkan';
  el.style.display = '';
  el.innerHTML = `Role saat ini (<strong>${escapeHTML(info.label)}</strong>) ${reason}. Pilih role di atas untuk memperbarui — menyimpan form akan mengganti role user ini.`;
}

/**
 * v1.30.4 — Role Summary for the currently-selected role, reused via
 * role-summary-model.js (Permission Count / Module Count / Role Type /
 * Role Status are never recomputed locally).
 */
function renderUserRoleSummaryPanel() {
  const panel = document.getElementById('userRoleSummaryPanel');
  const roleField = document.getElementById('userFieldRole');
  if (!panel || !roleField) return;

  let roleId = roleField.value;
  if (roleId === 'engineering') roleId = currentEngineeringRole();

  if (!roleId) {
    panel.style.display = 'none';
    panel.innerHTML = '';
    return;
  }

  const info = resolveRoleInfo(roleId);
  const roleDescriptor = { id: info.id, label: info.label, type: info.type, record: null };
  const grantedSet = resolveGrantedSet(roleDescriptor);
  const summary = buildRoleSummary(roleDescriptor, getAllRoles(), grantedSet);
  const statusLabel = summary.status === 'archived' ? 'Arsip' : 'Aktif';
  const typeLabel = info.type === 'system' ? 'Sistem' : info.type === 'custom' ? 'Custom' : 'Tidak Dikenal';

  panel.style.display = '';
  panel.innerHTML = `
    <div class="v2-dq-stat-card">
      <span class="v2-dq-stat-value">${escapeHTML(typeLabel)}</span>
      <span class="v2-dq-stat-label">Tipe Role</span>
    </div>
    <div class="v2-dq-stat-card">
      <span class="v2-dq-stat-value">${escapeHTML(statusLabel)}</span>
      <span class="v2-dq-stat-label">Status Role</span>
    </div>
    <div class="v2-dq-stat-card">
      <span class="v2-dq-stat-value">${summary.permissionCount}</span>
      <span class="v2-dq-stat-label">Permission</span>
    </div>
    <div class="v2-dq-stat-card">
      <span class="v2-dq-stat-value">${summary.moduleCount}</span>
      <span class="v2-dq-stat-label">Modul</span>
    </div>
  `;
}

function closeUserFormModal() {
  const modal = document.getElementById('modalUserForm');
  if (modal) modal.style.display = 'none';
  editingUsername = null;
  // Closing always re-masks the Create-mode PIN field, even if it was
  // revealed — next open (Create or Edit) must never start revealed.
  const pinField = document.getElementById('userFieldPin');
  const pinToggle = document.getElementById('btnToggleUserFieldPin');
  if (pinField && pinToggle) setPinToggleState(pinToggle, pinField, false);
}

/* ── PIN reveal/reset UX (v1.30.9.3, Secure Admin PIN Reset) ──────────────
   Two independent things share the eye-icon pattern but are NOT the same
   feature: (1) unmasking a NEW PIN currently being typed (Create User —
   the value already lives in the input, nothing to fetch), and (2) the
   one-time plaintext a fresh Reset PIN returns (nothing pre-existing is
   ever read — see functions/src/auth/credentialService.js#resetCredential).
   Both reuse setPinToggleState(); neither ever touches a STORED credential. */

/** Flip a password-style input + its eye button between masked/revealed. */
function setPinToggleState(button, input, revealed) {
  input.type = revealed ? 'text' : 'password';
  button.innerHTML = revealed ? ICON_EYE_OFF : ICON_EYE;
  button.setAttribute('aria-pressed', String(revealed));
  button.setAttribute('aria-label', revealed ? 'Sembunyikan PIN' : 'Tampilkan PIN');
}

/**
 * Open the Reset PIN confirmation dialog. `returnToEdit: true` means this
 * was triggered from inside the Edit User modal (already closed per the
 * app's existing "Option A, no stacked modals" convention — see
 * js/modal.js's odometer/cancel/overtime-override dialogs) — Batal/close
 * reopens it. The list-card "Reset PIN" action (Manajemen User list, not
 * the Edit form) passes `returnToEdit: false` — there's nothing to reopen.
 */
function openResetPinConfirm(username, { returnToEdit = false } = {}) {
  pinResetFlow.username = username;
  pinResetFlow.returnToEdit = returnToEdit;
  const modal = document.getElementById('modalResetPinConfirm');
  if (modal) modal.style.display = 'flex';
}

function closeResetPinConfirm({ reopenEdit = false } = {}) {
  const modal = document.getElementById('modalResetPinConfirm');
  if (modal) modal.style.display = 'none';
  const { username, returnToEdit } = pinResetFlow;
  pinResetFlow.username = null;
  pinResetFlow.returnToEdit = false;
  if (reopenEdit && returnToEdit && username) openUserFormModal(username);
}

/**
 * Confirm → the ONLY place this version calls callResetUserCredential().
 * The Credential Service (functions/src/auth/credentialService.js) does
 * every bit of hashing/persistence server-side; this client only ever
 * receives the one-time plaintext back, and only for THIS toast/dialog use.
 * Failure leaves the admin on the (still-open) confirm dialog — no fake PIN,
 * no partial state, existing credential untouched (resetCredential() never
 * partially writes — see its own single persistCredential() call).
 */
async function handleConfirmResetPin() {
  const { username, returnToEdit } = pinResetFlow;
  if (!username) return;

  const btnConfirm = document.getElementById('btnConfirmResetPin');
  const btnCancel = document.getElementById('btnCancelResetPin');
  if (btnConfirm) { btnConfirm.disabled = true; btnConfirm.textContent = 'Mereset...'; }
  if (btnCancel) btnCancel.disabled = true;

  try {
    const { pin: newPin } = await callResetUserCredential({ username });
    await logAction({ userId: getCurrentUser().id, username: getCurrentUser().username, action: 'user_pin_reset', targetId: username });
    const confirmModal = document.getElementById('modalResetPinConfirm');
    if (confirmModal) confirmModal.style.display = 'none';
    pinResetFlow.username = null;
    pinResetFlow.returnToEdit = false;
    users = await getUsers();
    renderAdminList();
    openResetPinResult(newPin, { username, returnToEdit });
  } catch (error) {
    showToast(error.message || 'Gagal mereset PIN.');
  } finally {
    if (btnConfirm) { btnConfirm.disabled = false; btnConfirm.textContent = 'Reset PIN'; }
    if (btnCancel) btnCancel.disabled = false;
  }
}

/** Show the newly generated PIN exactly once, masked by default. */
function openResetPinResult(pin, { username, returnToEdit }) {
  pinResetFlow.username = username;
  pinResetFlow.returnToEdit = returnToEdit;
  pinResetFlow.plaintext = pin;

  const input = document.getElementById('resetPinResultValue');
  const toggle = document.getElementById('btnToggleResetPinReveal');
  if (input) input.value = pin; // DOM property, not an HTML `value="..."` attribute
  if (input && toggle) setPinToggleState(toggle, input, false);

  const modal = document.getElementById('modalResetPinResult');
  if (modal) modal.style.display = 'flex';
}

/** Closing destroys the visible plaintext — value cleared, state cleared, re-masked. */
function closeResetPinResult({ reopenEdit = false } = {}) {
  const modal = document.getElementById('modalResetPinResult');
  if (modal) modal.style.display = 'none';

  const input = document.getElementById('resetPinResultValue');
  const toggle = document.getElementById('btnToggleResetPinReveal');
  if (input) input.value = '';
  if (input && toggle) setPinToggleState(toggle, input, false);

  const { username, returnToEdit } = pinResetFlow;
  pinResetFlow.username = null;
  pinResetFlow.returnToEdit = false;
  pinResetFlow.plaintext = null;

  if (reopenEdit && returnToEdit && username) openUserFormModal(username);
}

/** "Salin PIN" — explicit, admin-initiated copy only; never automatic. */
async function handleCopyResetPin() {
  const pin = pinResetFlow.plaintext;
  if (!pin) return;
  try {
    await navigator.clipboard.writeText(pin);
    showToast('PIN disalin ke clipboard.');
  } catch {
    // Same execCommand fallback js/modal.js#copyWAText() already uses.
    const ta = document.createElement('textarea');
    ta.value = pin;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('PIN disalin ke clipboard.');
  }
}

/**
 * TEST-ONLY. Opens the result dialog directly, bypassing the Cloud Function
 * call entirely — mirrors users.js#__seedUsersForTest() / custom-roles-
 * store.js#__seedCustomRolesForTest()'s established pattern for exercising
 * UI behavior without a real authenticated network call (this codebase's
 * DOM checks never call a Cloud Function against real Firebase — see
 * scripts/admin-pin-reset-dom-check.mjs). Real application code MUST NEVER
 * call this.
 */
export function __openResetPinResultForTest(pin, username = 'test-user', returnToEdit = false) {
  openResetPinResult(pin, { username, returnToEdit });
}

/* ── Engineering level segment (v1.20.2) ──────────────────────────────────
   The role select's "Engineering" option is a sentinel; the concrete stored
   role (engineering_coordinator | engineering_member) is chosen via the
   Koordinator/Anggota segment. These helpers keep the segment in sync. */

/** Show/hide the segment based on the current role select value. */
function syncEngineeringLevelUI() {
  const roleField = document.getElementById('userFieldRole');
  const group = document.getElementById('userEngineeringLevelGroup');
  if (!roleField || !group) return;
  group.style.display = (roleField.value === 'engineering') ? '' : 'none';
}

/** Enforce single-select across the two level cards. `level` = 'coordinator' | 'member' | null. */
function setEngineeringLevel(level) {
  const koord = document.getElementById('userEngKoordinator');
  const angg = document.getElementById('userEngAnggota');
  if (koord) koord.checked = (level === 'coordinator');
  if (angg) angg.checked = (level === 'member');
}

/** The concrete role selected by the segment, or '' when none is chosen. */
function currentEngineeringRole() {
  const koord = document.getElementById('userEngKoordinator');
  const angg = document.getElementById('userEngAnggota');
  if (koord && koord.checked) return 'engineering_coordinator';
  if (angg && angg.checked) return 'engineering_member';
  return '';
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
  let role = roleField ? roleField.value : 'viewer';
  const active = activeField ? activeField.checked : true;

  if (!username || !displayName || !role) {
    showToast('Lengkapi username, display name, dan role.');
    return;
  }

  // Engineering sentinel → resolve to the concrete role via the segment (v1.20.2).
  if (role === 'engineering') {
    const resolved = currentEngineeringRole();
    if (!resolved) {
      showToast('Pilih tingkat Engineering: Koordinator atau Anggota.');
      return;
    }
    role = resolved;
  }

  // v1.30.9.3 — PIN is only ever collected here for a brand-new user;
  // #userFieldPin isn't even part of the Edit form anymore (see
  // #userCredentialGroup / openResetPinConfirm — changing an existing
  // credential now happens exclusively through Reset PIN). Scoping this to
  // !editingUsername also fixes a latent bug: the old unconditional
  // 4-digit check ran against this field's always-blank Edit-mode value
  // and silently rejected every Edit User save that didn't also enter a
  // brand new PIN.
  const pin = editingUsername ? '' : (pinField ? pinField.value.trim() : '');
  if (!editingUsername) {
    if (!pin) {
      showToast('PIN wajib diisi untuk user baru.');
      return;
    }
    if (!/^\d{4}$/.test(pin)) {
      showToast('PIN harus 4 digit angka.');
      return;
    }
  }

  if (!(await validateUsername(username, editingUsername))) {
    showToast('Username sudah digunakan atau tidak valid.');
    return;
  }

  try {
    if (editingUsername) {
      await updateUser({ username: editingUsername, displayName, role, active });
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

  renderUserStats();

  if (users.length === 0) {
    container.innerHTML = '<div class="empty-request-state">Belum ada user.</div>';
    return;
  }

  const byRole = {};
  for (const user of users) {
    const key = user.role || 'viewer';
    if (!byRole[key]) byRole[key] = [];
    byRole[key].push(user);
  }

  for (const key of Object.keys(byRole)) {
    byRole[key].sort((a, b) =>
      (a.displayName || a.username).localeCompare(b.displayName || b.username, 'id')
    );
  }

  const knownKeys = new Set(ROLE_CONFIG.map(r => r.key));
  const unknownRoles = Object.keys(byRole).filter(k => !knownKeys.has(k));
  const allRoles = [
    ...ROLE_CONFIG,
    // Never render a raw identifier: resolve any unmapped role through the
    // central formatter (falls back to the id only for a truly unknown role).
    ...unknownRoles.map(k => ({ key: k, label: roleLabel(k).toUpperCase(), defaultExpanded: false, visible: true })),
  ];

  let html = '';
  for (const roleInfo of allRoles) {
    if (!roleInfo.visible) continue;
    const roleUsers = byRole[roleInfo.key] || [];
    const expanded = groupExpanded[roleInfo.key] ?? roleInfo.defaultExpanded;
    const arrow = expanded ? '▼' : '▶';

    html += `<div class="user-role-group">
      <button class="user-role-header" data-role-toggle="${escapeHTML(roleInfo.key)}" type="button" aria-expanded="${expanded}">
        <span class="user-role-arrow">${arrow}</span>
        <span class="user-role-label">${escapeHTML(roleInfo.label)}</span>
        <span class="user-role-count-badge">${roleUsers.length}</span>
      </button>
      <div class="user-role-body"${expanded ? '' : ' style="display:none;"'}>
        ${roleUsers.length === 0
          ? '<div class="user-role-empty">Tidak ada user di grup ini.</div>'
          : roleUsers.map(user => renderUserCard(user)).join('')}
      </div>
    </div>`;
  }

  container.innerHTML = html;

  container.querySelectorAll('[data-role-toggle]').forEach(btn => {
    btn.addEventListener('click', handleRoleGroupToggle);
  });
  container.querySelectorAll('[data-user-action]').forEach(btn => {
    btn.addEventListener('click', handleUserActionClick);
  });
}

function renderUserStats() {
  const el = document.getElementById('usersStatsHeader');
  if (!el) return;

  const counts = {};
  for (const user of users) counts[user.role] = (counts[user.role] || 0) + 1;

  const visibleRoles = ROLE_CONFIG.filter(r => r.visible);
  const chips = visibleRoles.map(r => {
    const label = r.label.charAt(0) + r.label.slice(1).toLowerCase();
    return `<span class="users-stats-chip">
      <span class="users-stats-chip-label">${escapeHTML(label)}</span>
      <span class="users-stats-chip-count">${counts[r.key] || 0}</span>
    </span>`;
  }).join('');

  el.innerHTML = `<div class="users-stats">
    <div class="users-stats-total">Total <strong>${users.length}</strong></div>
    <div class="users-stats-chips">${chips}</div>
  </div>`;
}

function renderUserCard(user) {
  const status = user.active ? 'Aktif' : 'Non-aktif';
  const statusClass = user.active ? 'status-active' : 'status-inactive';
  return `<div class="user-card">
    <div class="user-card-main">
      <div>
        <div class="user-title">${escapeHTML(user.displayName || user.username)}</div>
        <div class="user-sub">${escapeHTML(user.username)}</div>
      </div>
      <span class="user-status ${statusClass}">${status}</span>
    </div>
    <div class="user-card-meta">
      <div>Dibuat: ${new Date(user.createdAt || '').toLocaleDateString('id-ID') || '-'}</div>
    </div>
    <div class="user-card-actions">
      <button class="btn-secondary" data-user-action="edit" data-user-name="${escapeHTML(user.username)}">Edit</button>
      ${user.active ? `<button class="btn-secondary" data-user-action="deactivate" data-user-name="${escapeHTML(user.username)}">Nonaktifkan</button>` : ''}
      <button class="btn-secondary" data-user-action="reset" data-user-name="${escapeHTML(user.username)}">Reset PIN</button>
    </div>
  </div>`;
}

function handleRoleGroupToggle(event) {
  const btn = event.currentTarget;
  const role = btn.dataset.roleToggle;
  const body = btn.nextElementSibling;
  if (!body) return;

  const wasExpanded = groupExpanded[role] ?? (ROLE_CONFIG.find(r => r.key === role)?.defaultExpanded ?? false);
  const nowExpanded = !wasExpanded;

  groupExpanded[role] = nowExpanded;
  body.style.display = nowExpanded ? '' : 'none';
  btn.setAttribute('aria-expanded', String(nowExpanded));
  btn.querySelector('.user-role-arrow').textContent = nowExpanded ? '▼' : '▶';
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
    // v1.30.9.3 — routes through the same confirm → Credential Service →
    // masked-by-default result dialog as Edit User's Reset PIN (see
    // openResetPinConfirm/handleConfirmResetPin). Previously this reset
    // instantly with no confirmation and put the raw new PIN straight into
    // a toast — exactly what the new UX is meant to stop doing; unifying
    // the two entry points means there is exactly one secure reset path.
    openResetPinConfirm(username, { returnToEdit: false });
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
      // Fallback untuk browser lama / iOS (clipboard-read tidak tersedia)
      showToast(`Clipboard tidak tersedia. ${pasteHint()}`);
      primaryField.focus();
    }
  } catch (error) {
    console.error('Paste error:', error);
    showToast(`Gagal paste otomatis. ${pasteHint()}`);
    primaryField.focus();
  }
}

/**
 * Platform-aware manual-paste guidance. iOS Safari blocks programmatic
 * clipboard reads, so the operator must paste by hand — and the gesture
 * differs per platform.
 */
function pasteHint() {
  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS 13+
  const isMac = !isIOS && /Mac/i.test(navigator.platform || ua);
  if (isIOS) return 'Tekan dan tahan kolom, lalu pilih Paste.';
  if (isMac) return 'Tempel manual dengan Cmd+V.';
  return 'Tempel manual dengan Ctrl+V.';
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
    roleEl.textContent = currentUser.role ? roleLabel(currentUser.role) : '';
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
        syncSettingStatus('statusNotificationsEnabled', Boolean(user.notificationsEnabled));
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

  // Reflect device push state (and hide the section where unsupported)
  updatePushDeviceStatus();

  // Sync appearance toggle + status text to current theme
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const darkToggle = document.getElementById('profileDarkModeToggle');
  if (darkToggle) darkToggle.checked = isDark;
  syncSettingStatus('statusDarkModeToggle', isDark);

  const profileBox = modal.querySelector('.modal-box');
  if (profileBox) wireSheetSwipeDismiss(profileBox, modal, closeProfileModal);
  modal.style.display = 'flex';
  lockBodyScroll();
}

function closeProfileModal() {
  const modal = document.getElementById('modalProfile');
  if (modal) modal.style.display = 'none';
  unlockBodyScroll();
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
    // v1.30.6.2 — proof of the current PIN and the actual change are both
    // owned by the Credential Service; this client never compares against
    // a stored credential itself. Verified/changed first so a wrong
    // current PIN never leaves the rest of the profile half-updated.
    if (pinChangeRequested) {
      await callChangeMyCredential({ currentPin, newPin });
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

    await updateUser(updatePayload);
    await logAction({ userId: currentUser.id, username: currentUser.username, action: 'profile_updated', targetId: currentUser.username });
    showToast('Profil berhasil diperbarui.');
    closeProfileModal();
  } catch (error) {
    showToast(error.message || 'Gagal memperbarui profil.');
  }
}

/**
 * Map a raw Telegram API error description to operator-friendly Indonesian,
 * preserving the original text for anything unrecognized so no diagnostic
 * information is lost. Input is the Telegram `description` (never the token).
 */
function humanizeTelegramError(raw) {
  const msg = String(raw || '').trim();
  if (!msg) return 'Alasan tidak diketahui.';
  const m = msg.toLowerCase();
  if (m.includes('chat not found')) return 'Chat ID tidak ditemukan — mulai percakapan dengan bot dulu (kirim /myid).';
  if (m.includes('bot was blocked')) return 'Bot diblokir oleh pengguna ini.';
  if (m.includes('unauthorized') || m.includes('401')) return 'Token bot tidak valid (401).';
  if (m.includes('forbidden') || m.includes('403')) return 'Akses ditolak (403) — bot belum diizinkan mengirim ke chat ini.';
  if (m.includes('parse') || m.includes('entities') || m.includes('markdown')) return 'Format pesan (Markdown) tidak valid.';
  if (m.includes('too many requests') || m.includes('429')) return 'Terlalu banyak permintaan (429) — coba lagi sebentar.';
  if (m.includes('koneksi gagal')) return msg; // already localized network error
  return msg; // unknown → show the raw description verbatim
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
    const failures = Array.isArray(results) ? results.filter(r => !r.ok) : [];

    if (failures.length === 0) {
      showToast(`Notifikasi tes terkirim ke ${okCount} chat.`);
    } else {
      // Surface the ACTUAL Telegram error reason so it is actionable, instead
      // of the opaque "sukses 0, gagal 1". The reason is the Telegram API
      // `description` (e.g. "chat not found", "Unauthorized") captured by
      // telegram.js — it never contains the bot token.
      const reasons = failures
        .map(r => `${r.chatId}: ${humanizeTelegramError(r.error)}`)
        .join(' · ');
      showToast(`Tes Telegram — sukses ${okCount}, gagal ${failures.length}. ${reasons}`);
    }
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

/**
 * Settings → Notifications → device push. Always-available entry point,
 * independent of the soft-ask card (which may have been dismissed). A failed
 * activation never suppresses anything — the user can tap again immediately.
 */
async function handleEnablePushDevice(event) {
  event?.preventDefault();
  const btn = document.getElementById('btnEnablePushDevice');
  if (btn) { btn.disabled = true; btn.textContent = 'Mengaktifkan…'; }
  try {
    const ok = await enablePush();
    if (ok) showToast('Notifikasi perangkat aktif.');
    // enablePush() surfaces its own failure toast; no double-toast here.
  } finally {
    if (btn) btn.textContent = 'Aktifkan Notifikasi Perangkat';
    updatePushDeviceStatus();
  }
}

/**
 * Reflect device push state in the profile modal. Hides the whole section
 * where push is unsupported (old iOS / no PushManager / no VAPID key).
 */
function updatePushDeviceStatus() {
  const section = document.getElementById('profilePushSection');
  const statusEl = document.getElementById('pushDeviceStatusText');
  const btn = document.getElementById('btnEnablePushDevice');
  if (!section) return;

  if (!isPushSupported()) {
    section.style.display = 'none';
    return;
  }
  section.style.display = '';

  const perm = (typeof Notification !== 'undefined') ? Notification.permission : 'default';
  if (statusEl) {
    if (perm === 'granted') {
      statusEl.textContent = 'Notifikasi perangkat aktif.';
    } else if (perm === 'denied') {
      statusEl.textContent = 'Diblokir. Aktifkan lewat pengaturan browser/OS, lalu coba lagi.';
    } else {
      statusEl.textContent = 'Belum aktif di perangkat ini.';
    }
  }
  if (btn) btn.disabled = (perm === 'denied');
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
