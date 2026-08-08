/* ============================================================
   ROLE-MANAGEMENT-CENTER.JS — Role Management (Read-Only), v1.30.1

   Administration Platform, Phase 2. The first real UI consumer of the
   Permission Foundation (v1.30.0): pick a role, see exactly which
   permissions it holds, rendered entirely from permission-registry.js's own
   metadata — no hardcoded module/category/label tables anywhere in this
   file. READ-ONLY: every checkbox is `disabled`; there is no write path,
   no Firebase call, and no mutation of role-permissions.js. Editing is an
   explicitly future phase (see docs/ROLE_MANAGEMENT_REPORT_v1.30.1.md).

   Mounts into a platform-owned host container (#v2RoleManagementWorkspace),
   mirroring js/petty-cash/petty-cash-center.js's embedded-module shape
   (mount*(container), one delegated render(), event delegation on the root
   — no per-row listeners). Unlike Petty Cash/Overtime this module holds no
   Firebase subscription, so there's no close()-on-hide pause to wire up —
   it's pure local UI state (selected role, search, module filter) over data
   that's already fully loaded and frozen at import time.

   PURE DATA LAYER: js/role-management/role-management-logic.js.
   ============================================================ */

'use strict';

import { isAdmin } from '../auth.js';
import { ROLES, roleLabel } from '../config/role-registry.js';
import { pill, esc } from '../widgets/_widget-base.js';
import {
  getPermissionTree,
  filterTree,
  buildSummary,
  grantedSetForRole,
  listModules,
} from './role-management-logic.js';

let root = null;
let bound = false;
let selectedRoleId = 'admin';
let searchQuery = '';
let moduleFilter = 'all';
const groupExpanded = {}; // moduleName -> boolean, defaults to true (see isExpanded)

/** Mount the module into a platform-owned host container (admin only). */
export async function mountRoleManagement(container) {
  if (!isAdmin()) { console.warn('[RoleManagement] admin only'); return; }
  if (!container) { console.warn('[RoleManagement] mount container missing'); return; }
  root = container;
  bindDelegation();
  render();
}

function bindDelegation() {
  if (bound || !root) return;
  bound = true;
  root.addEventListener('input', onInput);
  root.addEventListener('change', onChange);
  root.addEventListener('click', onClick);
}

function onInput(e) {
  if (e.target.id === 'rmSearch') {
    searchQuery = e.target.value;
    render();
  }
}

function onChange(e) {
  if (e.target.id === 'rmModuleFilter') {
    moduleFilter = e.target.value;
    render();
  }
}

function onClick(e) {
  const roleBtn = e.target.closest('[data-rm-role]');
  if (roleBtn) {
    selectedRoleId = roleBtn.dataset.rmRole;
    render();
    return;
  }
  const groupToggle = e.target.closest('[data-rm-group-toggle]');
  if (groupToggle) {
    const moduleName = groupToggle.dataset.rmGroupToggle;
    groupExpanded[moduleName] = !isExpanded(moduleName);
    render();
  }
}

function isExpanded(moduleName) {
  return groupExpanded[moduleName] ?? true;
}

/* ============================================================
   RENDER
   ============================================================ */
function render() {
  if (!root) return;
  root.innerHTML = shell();
}

function shell() {
  const grantedSet = grantedSetForRole(selectedRoleId);
  const filtered = filterTree(getPermissionTree(), { search: searchQuery, module: moduleFilter });
  const summary = buildSummary(filtered, grantedSet);
  return `
    <div class="rm-layout">
      <aside class="rm-sidebar">
        <h2 class="rm-sidebar__title">Peran</h2>
        <div class="rm-role-list">${roleListHtml()}</div>
      </aside>
      <section class="rm-main">
        <div class="rm-header">
          <h1 class="rm-header__title">Role Management</h1>
          ${pill('Read-only — editing arrives di fase berikutnya', 'neutral')}
        </div>
        <div class="v2-admin-toolbar">
          <input type="search" id="rmSearch" class="v2-admin-search"
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
        <div class="rm-tree">${treeHtml(filtered, grantedSet)}</div>
      </section>
    </div>`;
}

function roleListHtml() {
  return ROLES.map((r) => {
    const active = r.id === selectedRoleId;
    const count = grantedSetForRole(r.id).size;
    return `
      <button type="button" class="rm-role-item${active ? ' rm-role-item--active' : ''}"
              data-rm-role="${esc(r.id)}" aria-pressed="${active}">
        <span class="rm-role-item__label">${esc(roleLabel(r.id))}</span>
        <span class="user-role-count-badge">${count}</span>
      </button>`;
  }).join('');
}

function treeHtml(filteredTree, grantedSet) {
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
              ${permissions.map((p) => permissionRowHtml(p, grantedSet.has(p.id))).join('')}
            </div>`).join('')}
        </div>
      </div>`;
  }).join('');
}

function permissionRowHtml(permission, granted) {
  return `
    <label class="rm-permission-row">
      <input type="checkbox" disabled ${granted ? 'checked' : ''} aria-label="${esc(permission.title)}" />
      <span class="rm-permission-row__text">
        <span class="rm-permission-row__title">${esc(permission.title)}</span>
        <span class="rm-permission-row__desc">${esc(permission.description)}</span>
      </span>
    </label>`;
}
