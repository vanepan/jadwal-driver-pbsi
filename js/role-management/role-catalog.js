/* ============================================================
   ROLE-CATALOG.JS — User Management Integration, v1.30.4

   Administration Platform, Phase 5. Extracted from role-management-
   center.js (getAllRoles/resolveGrantedSet moved verbatim, zero logic
   change) so any consumer can resolve System + Custom Roles without
   importing that DOM-coupled, admin-only-lazy-loaded module. In
   particular js/users.js is loaded eagerly for every session regardless
   of role, so it must not pull in role-management-center.js.

   Adds resolveRoleInfo(roleId) — the single place that answers "what
   does this stored role id mean right now": an active System Role, an
   active Custom Role, a Custom Role that was archived after being
   referenced, or a fully unknown/broken reference. Every label, badge,
   and search touchpoint in User Management goes through this instead of
   recomputing the same active/archived/unknown checks locally.

   PURE: plain data transforms + Role Domain reads. No DOM, no user
   storage. Role Domain remains unaware of User storage — this file reads
   custom-roles-store.js, never users.js.
   ============================================================ */

'use strict';

import { ROLES, roleLabel } from '../config/role-registry.js';
import { grantedSetForRole } from './role-management-logic.js';
import { getCustomRoles, getCustomRoleById } from './custom-roles-store.js';

/** Every assignable role right now: System Roles + active (non-archived) Custom Roles. */
export function getAllRoles() {
  return [
    ...ROLES.map((r) => ({ id: r.id, label: roleLabel(r.id), type: 'system', record: null })),
    ...getCustomRoles().map((r) => ({ id: r.id, label: r.name, type: 'custom', clonedFrom: r.clonedFrom, record: r })),
  ];
}

/** The role's last-saved granted-permission Set. */
export function resolveGrantedSet(role) {
  if (!role) return new Set();
  if (role.type === 'system') return grantedSetForRole(role.id);
  const record = getCustomRoleById(role.id);
  return new Set(record ? record.permissions || [] : []);
}

/**
 * Resolve a stored role id (e.g. a user's `role` field) to what it means today.
 * @param {string} roleId
 * @returns {{id: string, label: string, type: 'system'|'custom'|'unknown', archived: boolean, unknown: boolean}}
 */
export function resolveRoleInfo(roleId) {
  const active = getAllRoles().find((r) => r.id === roleId);
  if (active) return { id: active.id, label: active.label, type: active.type, archived: false, unknown: false };

  const archivedCustom = getCustomRoleById(roleId);
  if (archivedCustom) {
    return { id: roleId, label: archivedCustom.name, type: 'custom', archived: true, unknown: false };
  }

  return { id: roleId, label: roleLabel(roleId), type: 'unknown', archived: false, unknown: true };
}
