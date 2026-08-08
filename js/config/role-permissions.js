/* ============================================================
   ROLE-PERMISSIONS.JS — Role → Permission Grants (v1.30.0)

   Permission Foundation, Phase 1. The single source of truth for WHICH
   roles own WHICH permissions. This is the "Role Model" the brief asks
   for: Role ↓ permissions[], nothing else.

   Depends on permission-registry.js (permission ids) and role-registry.js
   (role ids + the existing Engineering/Sarpras-Intelligence capability
   grants, reused rather than duplicated). The dependency runs one way:
   permission-registry.js does not know this file exists. Adding a new
   role (including a future custom role) means adding one array below and
   nothing else — permission-registry.js is never touched. Adding a new
   permission means adding one entry in permission-registry.js, then
   granting it to whichever roles here.

   Driver Operations grants below are a literal mirror of js/auth.js's
   PERMISSIONS map (view/view_assignments consolidated into one
   driver.schedule.view — no caller depends on the distinction yet), and
   module-level grants mirror js/app.js's canAccessModule() admin-only
   policy. MUST stay in sync with both if either changes — the same
   documented-drift-risk pattern already accepted for
   functions/src/auth/verifyPin.js's VALID_ROLES mirroring role-registry.js.

   PURE: plain data + lookups. No DOM, no Firebase, no `window`.
   ============================================================ */

'use strict';

import { ROLES, CAPABILITIES } from './role-registry.js';
import { PERMISSIONS as PERMISSION_CATALOG } from './permission-registry.js';

/**
 * Grants outside the Engineering/Sarpras-Intelligence capability matrix
 * (those are merged in below via grantsFromCapabilities). Only roles that
 * hold at least one such grant need an entry here.
 */
const BASE_GRANTS = {
  admin: [
    'system.admin', 'system.users.manage',
    'driver.schedule.view', 'driver.schedule.create', 'driver.schedule.edit',
    'driver.schedule.delete', 'driver.schedule.assign', 'driver.schedule.start',
    'driver.schedule.complete', 'driver.schedule.cancel',
    'driver.reimbursement.print', 'driver.overtime.override',
    'warehouse.view', 'warehouse.item.create', 'warehouse.item.edit',
    'warehouse.item.delete', 'warehouse.goodsin.execute', 'warehouse.goodsout.execute',
    'vehicle.view', 'vehicle.edit', 'vehicle.maintenance',
    'pettycash.view', 'pettycash.manage',
    'overtime.view', 'overtime.manage',
    'analytics.view', 'konfigurasi.view', 'executive.dashboard.view',
  ],
  bidang: [
    'driver.schedule.view', 'driver.request.create',
    'driver.schedule.start', 'driver.schedule.complete', 'driver.schedule.cancel',
  ],
  driver: [
    'driver.schedule.view', 'driver.schedule.view.own',
    'driver.schedule.start', 'driver.schedule.complete',
    'driver.reimbursement.print',
  ],
  viewer: [
    'driver.schedule.view',
  ],
};

/** Every eng./sic. permission id `roleId` holds, per the existing capability matrix. */
function grantsFromCapabilities(roleId) {
  return Object.keys(CAPABILITIES).filter((cap) => CAPABILITIES[cap].includes(roleId));
}

/** Role id → frozen permission id[]. Computed once at module load. */
export const ROLE_PERMISSIONS = Object.freeze(
  Object.fromEntries(
    ROLES.map((r) => [
      r.id,
      Object.freeze([...(BASE_GRANTS[r.id] || []), ...grantsFromCapabilities(r.id)]),
    ])
  )
);

/** All permission ids `roleId` holds (empty array for an unknown role). */
export function permissionsForRole(roleId) {
  return ROLE_PERMISSIONS[roleId] || [];
}

/**
 * Cross-check: every permission id granted to any role must exist in the
 * permission-registry catalog. Guards against the two files drifting apart
 * now that they're split. Returns a list of problems (empty = healthy).
 * @returns {Array<{roleId: string, permissionId: string}>}
 */
export function validateRegistryIntegrity() {
  const problems = [];
  for (const [roleId, permissionIds] of Object.entries(ROLE_PERMISSIONS)) {
    for (const permissionId of permissionIds) {
      if (!PERMISSION_CATALOG[permissionId]) problems.push({ roleId, permissionId });
    }
  }
  return problems;
}
