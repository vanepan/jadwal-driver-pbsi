/* ============================================================
   ROLE-MANAGEMENT-CENTER.JS — Role Management (Editable), v1.30.2

   Administration Platform, Phase 3. Extends the read-only Phase 2 page
   with real editing — but ONLY for "Custom Roles," a new Firebase-persisted
   entity administrators create by cloning a System Role. System Roles (the
   9 in config/role-registry.js) stay exactly what they were in Phase 2:
   code-defined, rendered from PERMISSION_TREE with disabled checkboxes,
   never written to. No user can be assigned a Custom Role yet — User
   Management is a future phase — so this file never touches
   permission-service.js, auth.js's session role, or role-registry.js.

   Save model: Edit -> Review -> Save/Cancel. No auto-save. Checking a
   permission or editing a Custom Role's name builds a local draft
   (Petty Cash's settingsDraft shape); Save opens a Review modal summarizing
   the exact added/removed permissions before anything is written; Cancel
   discards the draft. Custom Role "Delete" soft-archives (archived:true) —
   matching this app's house convention (Users/Drivers/Vehicles/Gudang all
   archive rather than hard-delete) — and is blocked entirely for System
   Roles, which have no delete/rename/edit affordance in this UI at all.

   Audit: every successful clone/save/delete calls the existing global
   js/logs.js#logAction() — no parallel audit collection was invented.

   PURE DATA LAYERS (untouched by this phase):
     - js/role-management/role-management-logic.js — tree/search/filter/summary
     - js/role-management/custom-roles-rules.js — name/clone/diff validation
   FIREBASE STORE: js/role-management/custom-roles-store.js
   ============================================================ */

'use strict';

import { isAdmin, getCurrentUser } from '../auth.js';
import { ROLES, roleLabel } from '../config/role-registry.js';
import { getPermission } from '../config/permission-registry.js';
import { pill, esc } from '../widgets/_widget-base.js';
import { logAction } from '../logs.js';
import { createFocusGuard } from '../ui/focus-preserving-render.js';
import {
  getPermissionTree,
  filterTree,
  buildSummary,
  grantedSetForRole,
  listModules,
} from './role-management-logic.js';
import {
  initCustomRolesStore,
  getCustomRoles,
  getCustomRoleById,
  registerCustomRolesChangeListener,
  createCustomRoleFromClone,
  updateCustomRole,
  archiveCustomRole,
} from './custom-roles-store.js';
import { findDuplicateName, diffPermissions, isEmptyPermissionSet } from './custom-roles-rules.js';

let root = null;
let bound = false;
let selectedRoleId = 'admin';
let searchQuery = '';
let moduleFilter = 'all';
const groupExpanded = {}; // moduleName -> boolean, defaults to true (see isExpanded)
const focusGuard = createFocusGuard();

// Edit state — only ever populated for a role.type === 'custom'.
let draft = null;      // { id, name, permissions: Set<string> }
let dirty = false;
let error = '';
let clonePrompt = null;  // { sourceRoleId, sourceLabel, name }
let reviewModal = null;  // { id, name, renamedFrom, added: Permission[], removed: Permission[], nextPermissions: string[] }
let toastMsg = null;
let toastTimer = null;

/** Mount the module into a platform-owned host container (admin only). */
export async function mountRoleManagement(container) {
  if (!isAdmin()) { console.warn('[RoleManagement] admin only'); return; }
  if (!container) { console.warn('[RoleManagement] mount container missing'); return; }
  root = container;
  bindDelegation();
  await initCustomRolesStore();
  registerCustomRolesChangeListener(() => render());
  render();
}

function bindDelegation() {
  if (bound || !root) return;
  bound = true;
  root.addEventListener('input', onInput);
  root.addEventListener('change', onChange);
  root.addEventListener('click', onClick);
}

/* ============================================================
   System + Custom role resolution
   ============================================================ */
function getAllRoles() {
  return [
    ...ROLES.map((r) => ({ id: r.id, label: roleLabel(r.id), type: 'system' })),
    ...getCustomRoles().map((r) => ({ id: r.id, label: r.name, type: 'custom', clonedFrom: r.clonedFrom })),
  ];
}

function getRoleById(id) {
  return getAllRoles().find((r) => r.id === id) || null;
}

/** The role's last-saved granted-permission Set (ignores any in-progress draft). */
function resolveGrantedSet(role) {
  if (!role) return new Set();
  if (role.type === 'system') return grantedSetForRole(role.id);
  const record = getCustomRoleById(role.id);
  return new Set(record ? record.permissions || [] : []);
}

/** What the tree/summary should render RIGHT NOW — the live draft while dirty, else last-saved. */
function effectiveGrantedSet(role) {
  if (dirty && draft && role && draft.id === role.id) return draft.permissions;
  return resolveGrantedSet(role);
}

function effectiveName(role) {
  if (dirty && draft && role && draft.id === role.id) return draft.name;
  return role ? role.label : '';
}

function ensureDraft(role) {
  if (draft && draft.id === role.id) return;
  draft = { id: role.id, name: role.label, permissions: new Set(resolveGrantedSet(role)) };
}

/* ============================================================
   Local toast — Petty Cash/Gudang/Overtime shape (module state + inline
   render), NOT js/utils.js#showToast, matching this module's existing
   render-loop architecture.
   ============================================================ */
function toast(msg) {
  if (toastTimer) clearTimeout(toastTimer);
  toastMsg = msg;
  toastTimer = setTimeout(() => { toastMsg = null; render(); }, 2600);
  render();
}

/* ============================================================
   Events
   ============================================================ */
function onInput(e) {
  if (e.target.id === 'rmSearch') { searchQuery = e.target.value; render(); return; }
  if (e.target.id === 'rmNameInput') {
    const role = getRoleById(selectedRoleId);
    if (!role || role.type !== 'custom') return;
    ensureDraft(role);
    draft.name = e.target.value;
    dirty = true;
    error = '';
    render();
    return;
  }
  if (e.target.id === 'rmCloneName') {
    if (clonePrompt) clonePrompt.name = e.target.value;
  }
}

function onChange(e) {
  if (e.target.id === 'rmModuleFilter') { moduleFilter = e.target.value; render(); return; }
  if (e.target.matches('.rm-permission-row input[type="checkbox"]')) {
    const role = getRoleById(selectedRoleId);
    if (!role || role.type !== 'custom') return; // defense in depth; disabled attr already prevents this
    const permId = e.target.dataset.rmPermissionId;
    ensureDraft(role);
    if (draft.permissions.has(permId)) draft.permissions.delete(permId);
    else draft.permissions.add(permId);
    dirty = true;
    error = '';
    render();
  }
}

function onClick(e) {
  if (e.target.classList && e.target.classList.contains('modal-overlay')) {
    clonePrompt = null; reviewModal = null; render(); return;
  }
  const roleBtn = e.target.closest('[data-rm-role]');
  if (roleBtn) { selectRole(roleBtn.dataset.rmRole); return; }

  const groupToggle = e.target.closest('[data-rm-group-toggle]');
  if (groupToggle) {
    const moduleName = groupToggle.dataset.rmGroupToggle;
    groupExpanded[moduleName] = !isExpanded(moduleName);
    render();
    return;
  }

  const action = e.target.closest('[data-rm-action]')?.dataset.rmAction;
  if (!action) return;
  if (action === 'clone-open') return openClonePrompt();
  if (action === 'clone-confirm') return void confirmClone();
  if (action === 'clone-cancel') { clonePrompt = null; render(); return; }
  if (action === 'delete') return void deleteSelectedRole();
  if (action === 'save') return attemptSave();
  if (action === 'cancel') return cancelDraft();
  if (action === 'review-confirm') return void confirmReview();
  if (action === 'review-back') { reviewModal = null; render(); return; }
}

function isExpanded(moduleName) {
  return groupExpanded[moduleName] ?? true;
}

function selectRole(id) {
  if (id === selectedRoleId) return;
  if (dirty && !confirm('Anda memiliki perubahan yang belum disimpan. Buang perubahan?')) return;
  selectedRoleId = id;
  draft = null;
  dirty = false;
  error = '';
  render();
}

/* ── Clone ────────────────────────────────────────────────────────── */
function openClonePrompt() {
  const role = getRoleById(selectedRoleId);
  if (!role) return;
  clonePrompt = { sourceRoleId: role.id, sourceLabel: role.label, name: `${role.label} (Copy)` };
  render();
}

async function confirmClone() {
  if (!clonePrompt) return;
  const role = getRoleById(clonePrompt.sourceRoleId);
  if (!role) return;
  try {
    const created = await createCustomRoleFromClone({
      sourceLabel: role.label,
      sourcePermissions: [...resolveGrantedSet(role)],
      newName: clonePrompt.name,
      systemLabels: ROLES.map((r) => roleLabel(r.id)),
    });
    const user = getCurrentUser();
    await logAction({
      userId: user?.id, username: user?.username, action: 'custom_role_created',
      targetId: created.id,
      metadata: { name: created.name, clonedFrom: role.label, permissionCount: created.permissions.length },
    });
    clonePrompt = null;
    selectedRoleId = created.id;
    toast(`Custom Role "${created.name}" berhasil dibuat.`);
  } catch (err) {
    // Close the prompt on failure too (matches confirmReview()'s shape) — the
    // .rm-error slot renders in the main panel, which a still-open modal
    // overlay would visually cover, hiding the error from the user.
    clonePrompt = null;
    error = err.message || 'Gagal membuat Custom Role.';
    render();
  }
}

/* ── Delete (soft-archive) ────────────────────────────────────────── */
async function deleteSelectedRole() {
  const role = getRoleById(selectedRoleId);
  if (!role || role.type !== 'custom') return;
  if (!confirm(`Hapus Custom Role "${role.label}"?`)) return;
  const record = getCustomRoleById(role.id);
  try {
    await archiveCustomRole(role.id);
    const user = getCurrentUser();
    await logAction({
      userId: user?.id, username: user?.username, action: 'custom_role_archived',
      targetId: role.id,
      metadata: { name: role.label, permissionCount: (record?.permissions || []).length },
    });
    selectedRoleId = 'admin';
    draft = null;
    dirty = false;
    toast(`Custom Role "${role.label}" berhasil dihapus.`);
  } catch (err) {
    error = err.message || 'Gagal menghapus Custom Role.';
    render();
  }
}

/* ── Save: validate -> (confirm if empty) -> Review -> commit ──────── */
function attemptSave() {
  const role = getRoleById(selectedRoleId);
  if (!role || role.type !== 'custom' || !draft) return;

  const trimName = draft.name.trim();
  if (!trimName) { error = 'Nama role wajib diisi.'; render(); return; }
  const conflict = findDuplicateName(trimName, {
    systemLabels: ROLES.map((r) => roleLabel(r.id)),
    customRoles: getCustomRoles().map((r) => ({ id: r.id, name: r.name })),
    excludeId: role.id,
  });
  if (conflict) { error = `Nama role "${conflict}" sudah digunakan.`; render(); return; }

  const nextPermissions = [...draft.permissions];
  if (isEmptyPermissionSet(nextPermissions)) {
    if (!confirm('Role ini tidak akan memiliki permission sama sekali. Lanjutkan?')) return;
  }

  const before = [...resolveGrantedSet(role)];
  const { added, removed } = diffPermissions(before, nextPermissions);
  reviewModal = {
    id: role.id,
    name: trimName,
    renamedFrom: trimName !== role.label ? role.label : null,
    added: added.map((id) => getPermission(id)).filter(Boolean),
    removed: removed.map((id) => getPermission(id)).filter(Boolean),
    nextPermissions,
  };
  error = '';
  render();
}

async function confirmReview() {
  if (!reviewModal) return;
  const { id, name, renamedFrom, added, removed, nextPermissions } = reviewModal;
  try {
    await updateCustomRole(id, {
      name,
      permissions: nextPermissions,
      systemLabels: ROLES.map((r) => roleLabel(r.id)),
    });
    const user = getCurrentUser();
    await logAction({
      userId: user?.id, username: user?.username, action: 'custom_role_updated',
      targetId: id,
      metadata: { name, renamedFrom, added: added.map((p) => p.id), removed: removed.map((p) => p.id) },
    });
    reviewModal = null;
    draft = null;
    dirty = false;
    toast(`Custom Role "${name}" berhasil disimpan.`);
  } catch (err) {
    reviewModal = null;
    error = err.message || 'Gagal menyimpan Custom Role.';
    render();
  }
}

function cancelDraft() {
  draft = null;
  dirty = false;
  error = '';
  toast('Perubahan dibatalkan.');
}

/* ============================================================
   RENDER
   ============================================================ */
function render() {
  if (!root) return;
  focusGuard.capture(root);
  root.innerHTML = shell();
  focusGuard.restore(root);
}

function shell() {
  const role = getRoleById(selectedRoleId);
  const isCustom = !!role && role.type === 'custom';
  const grantedSet = effectiveGrantedSet(role);
  const filtered = filterTree(getPermissionTree(), { search: searchQuery, module: moduleFilter });
  const summary = buildSummary(filtered, grantedSet);
  return `
    <div class="rm-layout">
      <aside class="rm-sidebar">
        <h2 class="rm-sidebar__title">Peran</h2>
        <div class="rm-role-list">${roleListHtml()}</div>
      </aside>
      <section class="rm-main">
        ${headerHtml(role, isCustom)}
        ${error ? `<div class="rm-error">${esc(error)}</div>` : ''}
        <div class="v2-admin-toolbar">
          <input type="search" id="rmSearch" class="v2-admin-search" data-focus="rm-search"
                 placeholder="Cari ID, judul, deskripsi, modul, atau kategori…"
                 autocomplete="off" value="${esc(searchQuery)}" />
          <select id="rmModuleFilter" class="v2-admin-filter">
            <option value="all"${moduleFilter === 'all' ? ' selected' : ''}>Semua Modul</option>
            ${listModules().map((m) => `<option value="${esc(m)}"${moduleFilter === m ? ' selected' : ''}>${esc(m)}</option>`).join('')}
          </select>
        </div>
        <div class="v2-dq-stats rm-stats">
          <div class="v2-dq-stat-card">
            <span class="v2-dq-stat-value">${summary.totalPermissions}</span>
            <span class="v2-dq-stat-label">Total Permission</span>
          </div>
          <div class="v2-dq-stat-card">
            <span class="v2-dq-stat-value">${summary.granted}</span>
            <span class="v2-dq-stat-label">Diberikan</span>
          </div>
          <div class="v2-dq-stat-card">
            <span class="v2-dq-stat-value">${summary.denied}</span>
            <span class="v2-dq-stat-label">Tidak Diberikan</span>
          </div>
          <div class="v2-dq-stat-card">
            <span class="v2-dq-stat-value">${summary.modulesRepresented}</span>
            <span class="v2-dq-stat-label">Modul</span>
          </div>
        </div>
        <div class="rm-tree">${treeHtml(filtered, grantedSet, isCustom)}</div>
        ${isCustom && dirty ? saveBarHtml() : ''}
      </section>
    </div>
    ${clonePrompt ? clonePromptHtml() : ''}
    ${reviewModal ? reviewModalHtml() : ''}
    ${toastMsg ? `<div class="rm-toast">${esc(toastMsg)}</div>` : ''}`;
}

function headerHtml(role, isCustom) {
  const nameField = isCustom
    ? `<input type="text" id="rmNameInput" class="rm-name-input" data-focus="rm-name" value="${esc(effectiveName(role))}" />`
    : `<span class="rm-header__role-name">${esc(role ? role.label : '')}</span>`;
  return `
    <div class="rm-header">
      <div class="rm-header__top">
        <h1 class="rm-header__title">Role Management</h1>
        ${pill(isCustom ? 'Custom Role' : 'System Role', isCustom ? 'info' : 'neutral')}
        ${!isCustom ? pill('Read-only', 'neutral') : ''}
      </div>
      <div class="rm-header__role">
        ${nameField}
        ${!dirty ? `
          <div class="rm-header__actions">
            <button type="button" class="rm-action-btn" data-rm-action="clone-open">Clone</button>
            ${isCustom ? `<button type="button" class="rm-action-btn rm-action-btn--danger" data-rm-action="delete">Delete</button>` : ''}
          </div>` : ''}
      </div>
    </div>`;
}

function roleListHtml() {
  return getAllRoles().map((r) => {
    const active = r.id === selectedRoleId;
    const count = effectiveGrantedSet(r).size;
    return `
      <button type="button" class="rm-role-item${active ? ' rm-role-item--active' : ''}"
              data-rm-role="${esc(r.id)}" aria-pressed="${active}">
        <span class="rm-role-item__label">${esc(r.label)}</span>
        ${r.type === 'custom' ? '<span class="rm-role-type-badge">Custom</span>' : ''}
        <span class="user-role-count-badge">${count}</span>
      </button>`;
  }).join('');
}

function treeHtml(filteredTree, grantedSet, editable) {
  const moduleNames = Object.keys(filteredTree);
  if (moduleNames.length === 0) {
    return `<div class="user-role-empty">Tidak ada permission yang cocok.</div>`;
  }
  return moduleNames.map((moduleName) => {
    const categories = filteredTree[moduleName];
    const totalInModule = Object.values(categories).reduce((sum, list) => sum + list.length, 0);
    const expanded = isExpanded(moduleName);
    return `
      <div class="user-role-group">
        <button class="user-role-header" data-rm-group-toggle="${esc(moduleName)}" type="button" aria-expanded="${expanded}">
          <span class="user-role-arrow">${expanded ? '▼' : '▶'}</span>
          <span class="user-role-label">${esc(moduleName)}</span>
          <span class="user-role-count-badge">${totalInModule}</span>
        </button>
        <div class="user-role-body"${expanded ? '' : ' style="display:none;"'}>
          ${Object.entries(categories).map(([categoryName, permissions]) => `
            <div class="rm-category">
              <h4 class="rm-category__title">${esc(categoryName)}</h4>
              ${permissions.map((p) => permissionRowHtml(p, grantedSet.has(p.id), editable)).join('')}
            </div>`).join('')}
        </div>
      </div>`;
  }).join('');
}

function permissionRowHtml(permission, granted, editable) {
  return `
    <label class="rm-permission-row">
      <input type="checkbox" data-rm-permission-id="${esc(permission.id)}"
             ${editable ? '' : 'disabled'} ${granted ? 'checked' : ''}
             aria-label="${esc(permission.title)}" />
      <span class="rm-permission-row__text">
        <span class="rm-permission-row__title">${esc(permission.title)}</span>
        <span class="rm-permission-row__desc">${esc(permission.description)}</span>
      </span>
    </label>`;
}

function saveBarHtml() {
  return `
    <div class="rm-save-bar">
      <span class="rm-save-bar__msg">Ada perubahan yang belum disimpan.</span>
      <div class="rm-save-bar__actions">
        <button type="button" class="rm-action-btn" data-rm-action="cancel">Batal</button>
        <button type="button" class="rm-action-btn rm-action-btn--primary" data-rm-action="save">Simpan</button>
      </div>
    </div>`;
}

function clonePromptHtml() {
  return `
    <div class="modal-overlay">
      <div class="modal-box rm-modal-box">
        <h3>Clone Role</h3>
        <p>Membuat Custom Role baru dari &quot;${esc(clonePrompt.sourceLabel)}&quot;.</p>
        <input type="text" id="rmCloneName" class="rm-name-input" data-focus="rm-clone-name"
               value="${esc(clonePrompt.name)}" />
        <div class="rm-modal-actions">
          <button type="button" class="rm-action-btn" data-rm-action="clone-cancel">Batal</button>
          <button type="button" class="rm-action-btn rm-action-btn--primary" data-rm-action="clone-confirm">Buat Custom Role</button>
        </div>
      </div>
    </div>`;
}

function reviewModalHtml() {
  const addedHtml = reviewModal.added.length
    ? `<ul class="rm-review-list">${reviewModal.added.map((p) => `<li>+ ${esc(p.title)}</li>`).join('')}</ul>`
    : `<p class="rm-review-empty">Tidak ada permission ditambahkan.</p>`;
  const removedHtml = reviewModal.removed.length
    ? `<ul class="rm-review-list">${reviewModal.removed.map((p) => `<li>&minus; ${esc(p.title)}</li>`).join('')}</ul>`
    : `<p class="rm-review-empty">Tidak ada permission dicabut.</p>`;
  return `
    <div class="modal-overlay">
      <div class="modal-box rm-modal-box rm-review-box">
        <h3>Review Perubahan</h3>
        ${reviewModal.renamedFrom ? `<p>Nama: &quot;${esc(reviewModal.renamedFrom)}&quot; &rarr; &quot;${esc(reviewModal.name)}&quot;</p>` : ''}
        <div class="rm-review-col rm-review-col--added"><h4>Ditambahkan (${reviewModal.added.length})</h4>${addedHtml}</div>
        <div class="rm-review-col rm-review-col--removed"><h4>Dicabut (${reviewModal.removed.length})</h4>${removedHtml}</div>
        <div class="rm-modal-actions">
          <button type="button" class="rm-action-btn" data-rm-action="review-back">Kembali</button>
          <button type="button" class="rm-action-btn rm-action-btn--primary" data-rm-action="review-confirm">Simpan Perubahan</button>
        </div>
      </div>
    </div>`;
}
