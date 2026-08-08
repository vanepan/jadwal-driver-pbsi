/* ============================================================
   CUSTOM-ROLES-STORE.JS — Role Management (Editable), v1.30.2

   Administration Platform, Phase 3. Firebase-persisted store for Custom
   Roles — a brand-new collection, completely separate from the code-defined
   System Roles (js/config/role-registry.js, js/config/role-permissions.js),
   which this file never imports or writes to. A Custom Role starts as a
   value-copy snapshot of some role's permissions (see
   custom-roles-rules.js's buildClonedRole()) and evolves independently.

   Shape mirrors js/users.js's LOAD/SUB state machine (the current
   convention for admin-only data stores — a permission_denied never
   latches an empty cache, so a later auth-available event recovers real
   data) combined with js/drivers-store.js's create/update/archive shape.

   No user can be assigned a Custom Role yet (User Management is a future
   phase) — this store is read only by js/role-management/role-management-
   center.js today.
   ============================================================ */

'use strict';

import { readNode, subscribeNode, storeFirebaseData, updateFirebaseData, isFirebaseConfigured } from '../firebase.js';
import { isAdmin } from '../auth.js';
import { findDuplicateName, makeCustomRoleId, buildClonedRole } from './custom-roles-rules.js';

const CUSTOM_ROLES_PATH = 'customRoles';

const LOAD = { UNLOADED: 'UNLOADED', LOADING: 'LOADING', LOADED: 'LOADED' };
const SUB = { IDLE: 'IDLE', SUBSCRIBING: 'SUBSCRIBING', SUBSCRIBED: 'SUBSCRIBED' };

let customRoles = [];
let loadState = LOAD.UNLOADED;
let subState = SUB.IDLE;
let unsubscribe = null;
let onChangeCallbacks = [];

function mapFirebaseCustomRoles(value) {
  const raw = value || {};
  return Object.keys(raw)
    .map((key) => ({ id: key, ...raw[key] }))
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'id'));
}

function refreshCache(next) {
  customRoles = next;
  loadState = LOAD.LOADED;
  onChangeCallbacks.forEach((cb) => cb(customRoles));
}

/**
 * Idempotent, re-entrant: attach the realtime listener for /customRoles.
 * Safe to call on every mount / auth-available event.
 */
export async function initCustomRolesStore() {
  if (!isFirebaseConfigured()) { refreshCache([]); return; }
  if (subState !== SUB.IDLE) return;
  subState = SUB.SUBSCRIBING;
  if (unsubscribe) { try { unsubscribe(); } catch (_) {} unsubscribe = null; }
  unsubscribe = subscribeNode(
    CUSTOM_ROLES_PATH,
    (snapshot) => {
      refreshCache(mapFirebaseCustomRoles(snapshot.val()));
      subState = SUB.SUBSCRIBED;
    },
    {
      onDenied: () => { subState = SUB.IDLE; loadState = LOAD.UNLOADED; },
      onError: () => { subState = SUB.IDLE; loadState = LOAD.UNLOADED; },
    }
  );
}

/** Every active (non-archived) Custom Role. */
export function getCustomRoles() {
  return customRoles.filter((r) => r.archived !== true);
}

export function getCustomRoleById(id) {
  if (!id) return null;
  return customRoles.find((r) => r.id === id) || null;
}

export async function getCustomRolesFresh() {
  if (loadState === LOAD.LOADED) return getCustomRoles();
  const res = await readNode(CUSTOM_ROLES_PATH);
  if (res.status === 'ok') refreshCache(mapFirebaseCustomRoles(res.value));
  return getCustomRoles();
}

/**
 * TEST-ONLY. Directly seeds the local cache, bypassing Firebase entirely.
 * Real production/application code MUST NEVER import this — it exists so
 * scripts/role-management-edit-dom-check.mjs can exercise the editable-
 * Custom-Role UI without a real authenticated write, which this sandboxed
 * environment cannot perform against the real production database (see
 * docs/ROLE_MANAGEMENT_EDITABLE_REPORT_v1.30.2.md, Testing Summary).
 * @param {Array<Object>} roles
 */
export function __seedCustomRolesForTest(roles) {
  refreshCache(roles);
}

export function registerCustomRolesChangeListener(callback) {
  onChangeCallbacks.push(callback);
}

/**
 * Create a new Custom Role by cloning an existing role's permission
 * snapshot (System or Custom). Validates the name against every System
 * Role label and active Custom Role name before writing.
 * @param {{sourceLabel: string, sourcePermissions: string[], newName: string, systemLabels: string[]}} args
 * @returns {Promise<Object>} the created record
 */
export async function createCustomRoleFromClone({ sourceLabel, sourcePermissions, newName, systemLabels }) {
  if (!isAdmin()) throw new Error('Hanya admin yang dapat membuat Custom Role.');
  const trimName = String(newName || '').trim();
  if (!trimName) throw new Error('Nama role wajib diisi.');
  const conflict = findDuplicateName(trimName, { systemLabels, customRoles: getCustomRoles() });
  if (conflict) throw new Error(`Nama role "${conflict}" sudah digunakan.`);

  const record = {
    ...buildClonedRole({ sourceLabel, sourcePermissions, newName: trimName }),
    archived: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const id = makeCustomRoleId(trimName, new Set(customRoles.map((r) => r.id)));
  const full = { id, ...record };

  if (!isFirebaseConfigured()) { refreshCache([...customRoles, full]); return full; }
  await storeFirebaseData(`${CUSTOM_ROLES_PATH}/${id}`, record);
  return full;
}

/**
 * Update a Custom Role's name and/or permission list. Full overwrite of
 * the mutable fields (matches drivers-store.js's updateDriver() shape) —
 * `id`/`clonedFrom`/`createdAt` are preserved from the existing record.
 * @param {string} id
 * @param {{name: string, permissions: string[], systemLabels: string[]}} args
 * @returns {Promise<Object>} the updated record
 */
export async function updateCustomRole(id, { name, permissions, systemLabels }) {
  if (!isAdmin()) throw new Error('Hanya admin yang dapat mengubah Custom Role.');
  const existing = getCustomRoleById(id);
  if (!existing) throw new Error('Custom Role tidak ditemukan.');

  const trimName = String(name || '').trim();
  if (!trimName) throw new Error('Nama role wajib diisi.');
  const conflict = findDuplicateName(trimName, { systemLabels, customRoles: getCustomRoles(), excludeId: id });
  if (conflict) throw new Error(`Nama role "${conflict}" sudah digunakan.`);

  const updates = {
    name: trimName,
    permissions: [...(permissions || [])],
    updatedAt: new Date().toISOString(),
  };
  const next = { ...existing, ...updates };

  if (!isFirebaseConfigured()) {
    refreshCache(customRoles.map((r) => (r.id === id ? next : r)));
    return next;
  }
  await updateFirebaseData(`${CUSTOM_ROLES_PATH}/${id}`, updates);
  return next;
}

/**
 * Soft-delete: archives the record (never hard-removed), matching this
 * app's house convention (Users/Drivers/Vehicles/Gudang). The UI calls
 * this "Delete" — the role simply disappears from getCustomRoles().
 */
export async function archiveCustomRole(id) {
  if (!isAdmin()) throw new Error('Hanya admin yang dapat menghapus Custom Role.');
  const existing = getCustomRoleById(id);
  if (!existing) throw new Error('Custom Role tidak ditemukan.');

  const updates = { archived: true, archivedAt: new Date().toISOString() };
  const next = { ...existing, ...updates };

  if (!isFirebaseConfigured()) {
    refreshCache(customRoles.map((r) => (r.id === id ? next : r)));
    return next;
  }
  await updateFirebaseData(`${CUSTOM_ROLES_PATH}/${id}`, updates);
  return next;
}

console.info('Custom roles store module loaded');
