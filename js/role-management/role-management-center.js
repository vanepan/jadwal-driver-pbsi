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
import { pill, esc, empty } from '../widgets/_widget-base.js';
import { logAction } from '../logs.js';
import { createFocusGuard } from '../ui/focus-preserving-render.js';
import {
  getPermissionTree,
  filterTree,
  buildSummary,
  flattenTree,
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
import { buildRoleSummary, buildModuleBreakdown, invalidateRoleSummaryCache } from './role-summary-model.js';
import { canArchiveRole } from './role-archive-guard.js';
import { getRoleUsage } from './role-usage-provider.js';
import { roleStatusLabel } from './role-status.js';
import { getAllRoles, resolveGrantedSet } from './role-catalog.js';
// Role-Level Permission Assignment, Phase 4 (v1.30.9.9) — "Role Additional
// Permissions": a bulk, per-System-Role grant layer independent of a
// Custom Role's own (untouched) permission set. See role-permission-
// overrides-rules.js's header for why this is a SEPARATE mechanism, only
// ever legal for role.type === 'system'.
import {
  getRolePermissionOverrides,
  grantRolePermission,
  revokeRolePermission,
} from '../permission-management/role-permission-overrides-store.js';
import { FORBIDDEN_PERMISSION_IDS } from '../permission-management/role-permission-overrides-rules.js';

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

/* ============================================================
   Role Additional Permissions state — v1.30.9.9. Only ever populated for
   a role.type === 'system' (see role-permission-overrides-rules.js's
   header for why Custom Roles never target this mechanism). Grant/revoke
   are IMMEDIATE, independent writes — mirrors js/admin.js's Individual
   Permission Management (ipmState) shape and its request-token race
   guard exactly, not the Custom Role Draft/Review/Save flow above (a
   single boolean toggle per permission has no meaningful "review" step,
   and Role Additional must stay structurally independent of the Custom
   Role draft mechanism regardless).
   ============================================================ */
let raState = { roleId: null, loading: false, error: false, permissions: new Set(), busyPermissionId: null };
let raRequestToken = 0;

/** Mount the module into a platform-owned host container (admin only). */
export async function mountRoleManagement(container) {
  if (!isAdmin()) { console.warn('[RoleManagement] admin only'); return; }
  if (!container) { console.warn('[RoleManagement] mount container missing'); return; }
  root = container;
  bindDelegation();
  await initCustomRolesStore();
  registerCustomRolesChangeListener(() => { invalidateRoleSummaryCache(); render(); });
  render();
  const initialRole = getRoleById(selectedRoleId);
  if (initialRole && initialRole.type === 'system') loadRoleAdditionalFor(selectedRoleId);
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
   getAllRoles()/resolveGrantedSet() moved to role-catalog.js (v1.30.4)
   so User Management can reuse them without importing this DOM module.
   ============================================================ */
function getRoleById(id) {
  return getAllRoles().find((r) => r.id === id) || null;
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
  if (e.target.matches('.rm-permission-row input[type="checkbox"][data-rm-permission-id]')) {
    const role = getRoleById(selectedRoleId);
    if (!role || role.type !== 'custom') return; // defense in depth; disabled attr already prevents this
    const permId = e.target.dataset.rmPermissionId;
    ensureDraft(role);
    if (draft.permissions.has(permId)) draft.permissions.delete(permId);
    else draft.permissions.add(permId);
    dirty = true;
    error = '';
    render();
    return;
  }
  if (e.target.matches('.rm-permission-row input[type="checkbox"][data-rm-ra-permission-id]')) {
    const role = getRoleById(selectedRoleId);
    if (!role || role.type !== 'system') return; // defense in depth; disabled attr already prevents this
    void handleRaToggle(e.target.dataset.rmRaPermissionId);
  }
}

function onClick(e) {
  if (e.target.classList && e.target.classList.contains('modal-overlay')) {
    clonePrompt = null; reviewModal = null; render(); return;
  }
  const roleBtn = e.target.closest('[data-rm-role]');
  if (roleBtn) { selectRole(roleBtn.dataset.rmRole); return; }

  const detailToggle = e.target.closest('[data-rm-detail-toggle]');
  if (detailToggle) {
    groupExpanded.__roleDetail__ = !isDetailExpanded();
    render();
    return;
  }

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

/** Detail panel starts COLLAPSED (unlike permission-tree groups, which default open). */
function isDetailExpanded() {
  return groupExpanded.__roleDetail__ === true;
}

function selectRole(id) {
  if (id === selectedRoleId) return;
  if (dirty && !confirm('Anda memiliki perubahan yang belum disimpan. Buang perubahan?')) return;
  selectedRoleId = id;
  draft = null;
  dirty = false;
  error = '';
  const role = getRoleById(id);
  if (role && role.type === 'system') {
    loadRoleAdditionalFor(id);
  } else {
    resetRaState();
  }
  render();
}

/* ============================================================
   Role Additional Permissions — load + mutate (v1.30.9.9)
   ============================================================ */
function resetRaState() {
  raState = { roleId: null, loading: false, error: false, permissions: new Set(), busyPermissionId: null };
}

/** The role's currently-loaded Role Additional grant Set, or empty when
    `role` isn't the one raState is scoped to (not yet loaded, a Custom
    Role, or a stale reference) — never returns a cross-role result. */
function roleAdditionalSetFor(role) {
  if (!role || role.type !== 'system' || raState.roleId !== role.id) return new Set();
  return raState.permissions;
}

/**
 * Synchronously resets to a loading state for `roleId` (clearing any
 * previous role's data immediately), then awaits the real one-shot read.
 * A request token guards against a slow response from a PREVIOUS load
 * landing after the admin has already switched roles — mirrors js/
 * admin.js#loadIndividualPermissionsFor()'s identical, audit-hardened
 * shape (ipmRequestToken).
 * @param {string} roleId
 */
async function loadRoleAdditionalFor(roleId) {
  raState = { roleId, loading: true, error: false, permissions: new Set(), busyPermissionId: null };
  render();

  const token = ++raRequestToken;
  let permissions = new Set();
  let failed = false;
  try {
    permissions = await getRolePermissionOverrides(roleId);
  } catch (err) {
    console.error(err);
    failed = true;
  }
  if (token !== raRequestToken || raState.roleId !== roleId) return; // superseded — discard
  raState.loading = false;
  raState.error = failed;
  raState.permissions = permissions;
  render();
}

/**
 * Shared grant/revoke shape — mirrors js/admin.js#runIpmMutation()
 * exactly, including the token-AND-roleId double guard (the same race
 * class the Individual Permission Management audit found and fixed:
 * closing/reopening the SAME role starts a fresh load with a fresh
 * token, so a mutation still in flight at that moment gets its result
 * correctly discarded here too — a roleId-only check would have missed
 * this).
 */
async function runRaMutation(permissionId, storeFn, successMessage, failureMessage, auditAction) {
  if (!permissionId || raState.busyPermissionId) return;
  const roleId = raState.roleId;
  if (!roleId) return;

  raState.busyPermissionId = permissionId;
  const token = ++raRequestToken;
  render();
  try {
    const nextSet = await storeFn(roleId, permissionId);
    if (token !== raRequestToken || raState.roleId !== roleId) return; // superseded — discard
    raState.permissions = nextSet;
    raState.busyPermissionId = null;
    render();
    const user = getCurrentUser();
    if (user) {
      await logAction({ userId: user.id, username: user.username, action: auditAction, targetId: roleId, metadata: { permission: permissionId } });
    }
    toast(successMessage);
  } catch (err) {
    console.error(err);
    if (token !== raRequestToken || raState.roleId !== roleId) return;
    raState.busyPermissionId = null;
    error = err.message || failureMessage;
    render();
  }
}

/** Toggles ONE Role Additional permission for the currently-selected
    System Role — grant if not currently granted, revoke if it is. */
async function handleRaToggle(permissionId) {
  if (!permissionId || FORBIDDEN_PERMISSION_IDS.includes(permissionId)) return; // defense in depth; already excluded from the tree
  if (raState.permissions.has(permissionId)) {
    await runRaMutation(permissionId, revokeRolePermission, 'Role Additional Permission berhasil dicabut.', 'Gagal mencabut Role Additional Permission.', 'role_permission_revoked');
  } else {
    await runRaMutation(permissionId, grantRolePermission, 'Role Additional Permission berhasil ditambahkan.', 'Gagal menambahkan Role Additional Permission.', 'role_permission_granted');
  }
}

/**
 * TEST-ONLY. Directly seeds raState for `roleId`, bypassing the real
 * one-shot Firebase read entirely — same convention as js/admin.js#
 * __setIpmOverridesForTest(). Real application code MUST NEVER call this.
 * @param {string} roleId
 * @param {string[]} permissionIds
 */
export function __setRaStateForTest(roleId, permissionIds) {
  raState = { roleId, loading: false, error: false, permissions: new Set(permissionIds || []), busyPermissionId: null };
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
      sourceRoleId: role.id,
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
  const gate = canArchiveRole(role.id);
  if (!gate.allowed) { error = gate.reason; render(); return; }
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
    loadRoleAdditionalFor('admin'); // deleteSelectedRole() bypasses selectRole(), so this phase's own load trigger must be repeated here
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
  const isSystem = !!role && role.type === 'system';
  const baseGrantedSet = role ? resolveGrantedSet(role) : new Set();
  const roleAdditionalSet = roleAdditionalSetFor(role);
  const grantedSet = isSystem ? new Set([...baseGrantedSet, ...roleAdditionalSet]) : effectiveGrantedSet(role);
  const filtered = filterTree(getPermissionTree(), { search: searchQuery, module: moduleFilter });
  const summary = buildSummary(filtered, grantedSet);
  const roleSummary = role ? buildRoleSummary(role, getAllRoles(), resolveGrantedSet(role)) : null;
  return `
    <div class="rm-layout">
      <aside class="rm-sidebar">
        <h2 class="rm-sidebar__title">Peran</h2>
        <div class="rm-role-list">${roleListHtml()}</div>
      </aside>
      <section class="rm-main">
        ${headerHtml(role, isCustom)}
        ${error ? `<div class="rm-error">${esc(error)}</div>` : ''}
        ${role && roleSummary ? detailPanelHtml(role, roleSummary) : ''}
        <div class="v2-admin-toolbar">
          <input type="search" id="rmSearch" class="v2-admin-search" data-focus="rm-search"
                 placeholder="Cari ID, judul, deskripsi, modul, atau kategori…"
                 autocomplete="off" value="${esc(searchQuery)}" />
          <select id="rmModuleFilter" class="v2-admin-filter">
            <option value="all"${moduleFilter === 'all' ? ' selected' : ''}>Semua Modul</option>
            ${listModules().map((m) => `<option value="${esc(m)}"${moduleFilter === m ? ' selected' : ''}>${esc(m)}</option>`).join('')}
          </select>
        </div>
        ${isSystem ? systemStatsHtml(filtered, baseGrantedSet, roleAdditionalSet, summary) : statsHtml(summary)}
        ${isSystem ? raStatusHtml(role) : ''}
        <div class="rm-tree">${isSystem ? systemTreeHtml(filtered, baseGrantedSet, roleAdditionalSet) : treeHtml(filtered, grantedSet, isCustom)}</div>
        ${isCustom && dirty ? saveBarHtml() : ''}
      </section>
    </div>
    ${clonePrompt ? clonePromptHtml() : ''}
    ${reviewModal ? reviewModalHtml() : ''}
    ${toastMsg ? `<div class="rm-toast">${esc(toastMsg)}</div>` : ''}`;
}

function statsHtml(summary) {
  return `
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
    </div>`;
}

/** System Role variant — splits "Diberikan" into Base vs Role Additional
    (per the Phase 4 UI brief) so an admin never has to guess which layer
    a granted checkbox belongs to. `baseVisible`/`roleAdditionalVisible`
    are counted over the currently-visible (filtered/searched) tree only,
    matching buildSummary()'s own scope — Role Additional's contribution
    is its UNIQUE count (excludes any overlap with Base) so the two
    numbers always sum to `summary.granted`, mirroring js/admin.js's IPM
    "unique individual contribution" convention exactly. */
function systemStatsHtml(filteredTree, baseGrantedSet, roleAdditionalSet, summary) {
  const visible = flattenTree(filteredTree);
  const baseVisible = visible.filter((p) => baseGrantedSet.has(p.id)).length;
  const roleAdditionalVisible = visible.filter((p) => !baseGrantedSet.has(p.id) && roleAdditionalSet.has(p.id)).length;
  return `
    <div class="v2-dq-stats rm-stats">
      <div class="v2-dq-stat-card">
        <span class="v2-dq-stat-value">${summary.totalPermissions}</span>
        <span class="v2-dq-stat-label">Total Permission</span>
      </div>
      <div class="v2-dq-stat-card">
        <span class="v2-dq-stat-value">${baseVisible}</span>
        <span class="v2-dq-stat-label">Base Permissions</span>
      </div>
      <div class="v2-dq-stat-card">
        <span class="v2-dq-stat-value">${roleAdditionalVisible}</span>
        <span class="v2-dq-stat-label">Role Additional</span>
      </div>
      <div class="v2-dq-stat-card">
        <span class="v2-dq-stat-value">${summary.denied}</span>
        <span class="v2-dq-stat-label">Tidak Diberikan</span>
      </div>
      <div class="v2-dq-stat-card">
        <span class="v2-dq-stat-value">${summary.modulesRepresented}</span>
        <span class="v2-dq-stat-label">Modul</span>
      </div>
    </div>`;
}

function raStatusHtml(role) {
  if (raState.roleId !== role.id) return '';
  if (raState.loading) return `<div class="rm-ra-status">Memuat Role Additional Permissions…</div>`;
  if (raState.error) return `<div class="rm-ra-status rm-ra-status--error">Gagal memuat Role Additional Permissions. Checkbox di bawah mungkin tidak mencerminkan status terkini.</div>`;
  return '';
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
        ${!isCustom ? pill('Base Read-only · Role Additional Dapat Diedit', 'neutral') : ''}
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

/* ============================================================
   Detail Panel — Relationship/Usage/Lifecycle info (v1.30.3). Collapsed
   by default; the current sidebar/tree/save screen is unchanged unless an
   admin opts in. Reads only from roleSummary (role-summary-model.js) —
   never recomputes a number the summary or the stat cards below it
   already own.
   ============================================================ */
function detailPanelHtml(role, summary) {
  const expanded = isDetailExpanded();
  const statusTone = summary.status === 'archived' ? 'danger' : 'good';
  return `
    <div class="rm-detail-panel">
      <button type="button" class="rm-detail-toggle" data-rm-detail-toggle="1" aria-expanded="${expanded}">
        <span class="user-role-arrow">${expanded ? '▼' : '▶'}</span>
        <span class="rm-detail-toggle__label">Detail &amp; Relasi Role</span>
        ${pill(roleStatusLabel(summary.status), statusTone)}
      </button>
      ${expanded ? `<div class="rm-detail-grid">
        ${roleInfoHtml(role, summary)}
        ${relationshipInfoHtml(summary)}
        ${moduleBreakdownHtml(role)}
        ${usageSummaryHtml(role)}
        ${lifecycleSummaryHtml(summary)}
        ${futureAssignmentHtml()}
      </div>` : ''}
    </div>`;
}

function roleInfoHtml(role, summary) {
  return `
    <div class="rm-detail-card">
      <h4 class="rm-detail-card__title">Informasi Role</h4>
      <dl class="rm-detail-dl">
        <div><dt>Nama</dt><dd>${esc(summary.name)}</dd></div>
        <div><dt>Tipe</dt><dd>${pill(role.type === 'system' ? 'System Role' : 'Custom Role', role.type === 'system' ? 'neutral' : 'info')}</dd></div>
        <div><dt>Jumlah Permission</dt><dd>${summary.permissionCount}</dd></div>
        <div><dt>Jumlah Modul</dt><dd>${summary.moduleCount}</dd></div>
      </dl>
      <p class="rm-detail-note">Ringkasan permission lengkap ada pada kartu statistik di bawah.</p>
    </div>`;
}

function relationshipInfoHtml(summary) {
  const derivedFromHtml = summary.derivedFrom
    ? esc(summary.derivedFrom.label)
    : summary.derivedFromStale
      ? `<span class="rm-detail-stale">Sumber tidak ditemukan (mungkin telah diganti nama atau diarsipkan)</span>`
      : empty('Bukan hasil clone');
  const derivedRolesHtml = summary.derivedRoles.length
    ? `<ul class="rm-detail-list">${summary.derivedRoles.map((r) => `<li>${esc(r.label)}</li>`).join('')}</ul>`
    : empty('Belum ada role turunan');
  return `
    <div class="rm-detail-card">
      <h4 class="rm-detail-card__title">Relasi Role</h4>
      <dl class="rm-detail-dl">
        <div><dt>Diturunkan Dari</dt><dd>${derivedFromHtml}</dd></div>
        <div><dt>Role Turunan</dt><dd>${derivedRolesHtml}</dd></div>
      </dl>
    </div>`;
}

function moduleBreakdownHtml(role) {
  const grantedSet = resolveGrantedSet(role);
  const breakdown = buildModuleBreakdown(getPermissionTree(), grantedSet).filter((b) => b.total > 0);
  const rows = breakdown.map((b) => `
    <div class="rm-detail-breakdown-row">
      <span class="rm-detail-breakdown-row__module">${esc(b.module)}</span>
      <span class="rm-detail-breakdown-row__count">${b.granted}/${b.total}</span>
    </div>`).join('');
  return `
    <div class="rm-detail-card rm-detail-card--wide">
      <h4 class="rm-detail-card__title">Breakdown Modul</h4>
      <div class="rm-detail-breakdown">${rows}</div>
    </div>`;
}

function usageSummaryHtml(role) {
  const usage = getRoleUsage(role.id);
  return `
    <div class="rm-detail-card">
      <h4 class="rm-detail-card__title">Ringkasan Penggunaan</h4>
      <dl class="rm-detail-dl">
        <div><dt>Assigned Users</dt><dd>${usage.assignedUsers > 0 ? usage.assignedUsers : empty('Belum ada user')}</dd></div>
        <div><dt>Assignments</dt><dd>${usage.assignments.length > 0 ? usage.assignments.length : empty('Belum ada assignment')}</dd></div>
        <div><dt>Dependencies</dt><dd>${usage.dependencies.length > 0 ? usage.dependencies.length : empty('Belum ada dependensi')}</dd></div>
        <div><dt>Consumers</dt><dd>${usage.consumers.length > 0 ? usage.consumers.length : empty('Belum ada consumer')}</dd></div>
      </dl>
    </div>`;
}

function lifecycleSummaryHtml(summary) {
  const fmt = (iso) => (iso ? new Date(iso).toLocaleString('id-ID') : null);
  return `
    <div class="rm-detail-card">
      <h4 class="rm-detail-card__title">Siklus Hidup</h4>
      <dl class="rm-detail-dl">
        <div><dt>Status</dt><dd>${pill(roleStatusLabel(summary.status), summary.status === 'archived' ? 'danger' : 'good')}</dd></div>
        <div><dt>Dibuat</dt><dd>${fmt(summary.createdAt) || empty('Ditentukan oleh kode')}</dd></div>
        <div><dt>Diperbarui</dt><dd>${fmt(summary.updatedAt) || empty('Ditentukan oleh kode')}</dd></div>
        ${summary.status === 'archived' ? `<div><dt>Diarsipkan</dt><dd>${fmt(summary.archivedAt) || '-'}</dd></div>` : ''}
      </dl>
    </div>`;
}

function futureAssignmentHtml() {
  return `
    <div class="rm-detail-card rm-detail-card--future">
      <h4 class="rm-detail-card__title">Penetapan User</h4>
      ${empty('Tersedia setelah Manajemen User mendukung Custom Role')}
    </div>`;
}

function roleListHtml() {
  return getAllRoles().map((r) => {
    const active = r.id === selectedRoleId;
    // Role Additional is only ever already-loaded (via raState) for
    // whichever role is currently selected — roleAdditionalSetFor()
    // returns empty for any other role, so this never triggers an extra
    // fetch per sidebar row; an unselected role's badge simply reflects
    // Base (+ Custom) only until the admin visits it.
    const count = r.type === 'system'
      ? new Set([...effectiveGrantedSet(r), ...roleAdditionalSetFor(r)]).size
      : effectiveGrantedSet(r).size;
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

/* ============================================================
   System Role permission tree — v1.30.9.9. Deliberately a PARALLEL
   function to treeHtml()/permissionRowHtml() above, not a shared/
   parameterized one: those two functions back the already-shipped,
   already-tested Custom Role Draft/Review/Save flow, and this phase's
   own "small diff, isolated module, backward compatible" discipline
   means that path stays byte-for-byte untouched rather than being
   refactored to also serve a THIRD checkbox state Custom Roles never
   had (Base/Role Additional/Grantable/Protected, vs. Custom Roles'
   simple granted/not-granted).
   ============================================================ */
function systemTreeHtml(filteredTree, baseGrantedSet, roleAdditionalSet) {
  const moduleNames = Object.keys(filteredTree);
  if (moduleNames.length === 0) {
    return `<div class="user-role-empty">Tidak ada permission yang cocok.</div>`;
  }
  const busy = !!raState.busyPermissionId;
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
              ${permissions.map((p) => systemPermissionRowHtml(p, baseGrantedSet, roleAdditionalSet, busy)).join('')}
            </div>`).join('')}
        </div>
      </div>`;
  }).join('');
}

/**
 * Three (really four, counting the always-hidden-from-toggling Base
 * case) checkbox states for a System Role, per the Phase 4 UI brief:
 *   Base            → checked + disabled, NOT EDITABLE, no data attribute
 *                      at all (structurally impossible to toggle, not
 *                      just visually disabled).
 *   Role Additional → checked + enabled (currently granted at this layer).
 *   Protected       → unchecked + disabled (system.admin/
 *                      system.users.manage can never be granted here,
 *                      regardless of who is looking at it).
 *   Grantable       → unchecked + enabled.
 * A permission that is BOTH base-granted AND happens to also carry a
 * stale Role Additional record (e.g. the role's base grants changed
 * after the override was made) renders as Base — Base always wins the
 * display, matching effectivePermissionSetFor()'s own "one permission,
 * never counted twice" union semantics.
 */
function systemPermissionRowHtml(permission, baseGrantedSet, roleAdditionalSet, busy) {
  const isBase = baseGrantedSet.has(permission.id);
  const isProtected = FORBIDDEN_PERMISSION_IDS.includes(permission.id);
  const isRoleAdditional = !isBase && roleAdditionalSet.has(permission.id);
  const checked = isBase || isRoleAdditional;
  const disabled = isBase || isProtected || busy;
  let note = 'Tambahkan ke semua user dengan role ini.';
  if (isBase) note = 'Base System Permission — tidak dapat diubah di sini.';
  else if (isProtected) note = 'Protected — tidak dapat diberikan melalui Role Additional.';
  else if (isRoleAdditional) note = 'Role Additional — diberikan ke semua user dengan role ini.';
  const dataAttr = isBase || isProtected ? '' : `data-rm-ra-permission-id="${esc(permission.id)}"`;
  return `
    <label class="rm-permission-row${isBase ? ' rm-permission-row--base' : ''}${isRoleAdditional ? ' rm-permission-row--role-additional' : ''}${isProtected ? ' rm-permission-row--protected' : ''}">
      <input type="checkbox" ${dataAttr}
             ${disabled ? 'disabled' : ''} ${checked ? 'checked' : ''}
             aria-label="${esc(permission.title)}" />
      <span class="rm-permission-row__text">
        <span class="rm-permission-row__title">${esc(permission.title)}</span>
        <span class="rm-permission-row__desc">${esc(permission.description)}</span>
        <span class="rm-permission-row__note">${esc(note)}</span>
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
