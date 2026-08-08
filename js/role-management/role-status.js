/* ============================================================
   ROLE-STATUS.JS — Role Assignment & Dependency, v1.30.3

   Administration Platform, Phase 4. PURE lifecycle-status layer for roles.
   Mirrors js/drivers-store.js's deriveStatus() priority order exactly
   (archived flag wins over any stored status field, which wins over a
   derived default) so this codebase has one consistent "how do we decide
   status" rule across domains, not a bespoke one per module.

   Role Type (system/custom) is NOT part of this enum — that's already
   exposed by role-management-center.js's getAllRoles() as `role.type` and
   is not duplicated here. This file answers only "is it active or
   archived," which is the one axis System Roles and Custom Roles both
   genuinely share (System Roles are always ACTIVE — they are code-defined
   and have no archive affordance in the UI).

   PURE: plain data transforms. No DOM, no Firebase, no `window`.
   ============================================================ */

'use strict';

export const ROLE_STATUS = Object.freeze({
  ACTIVE: 'active',
  ARCHIVED: 'archived',
});

const STATUS_LABELS = Object.freeze({
  [ROLE_STATUS.ACTIVE]: 'Aktif',
  [ROLE_STATUS.ARCHIVED]: 'Arsip',
});

/**
 * Normalized lifecycle status for a role — never inspect `role.archived` or
 * `role.status` directly outside this function.
 * @param {{type?: string, archived?: boolean, status?: string}|null} role
 * @returns {string} a ROLE_STATUS value
 */
export function deriveRoleStatus(role) {
  if (!role) return ROLE_STATUS.ARCHIVED;
  if (role.type === 'system') return ROLE_STATUS.ACTIVE;
  if (role.archived === true) return ROLE_STATUS.ARCHIVED;
  if (role.status && Object.values(ROLE_STATUS).includes(role.status)) return role.status;
  return ROLE_STATUS.ACTIVE;
}

/** Indonesian display label for a ROLE_STATUS value (falls back to the raw value). */
export function roleStatusLabel(status) {
  return STATUS_LABELS[status] || String(status || '');
}
