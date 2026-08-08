/* ============================================================
   PERMISSION-REGISTRY.JS — Platform Permission Catalog (v1.30.0)

   Permission Foundation, Phase 1. The single source of truth for WHAT
   permissions exist. This file NEVER contains role information and never
   needs to change when a role is added, renamed, or removed — role grants
   live exclusively in role-permissions.js, which depends on this file, not
   the other way around. permission-registry.js has zero knowledge that
   role-permissions.js exists.

   Every permission is fully machine-readable ({ id, title, description,
   module, category }) so a future Role Management UI, Permission
   Simulator, or Audit page can render itself entirely from this data —
   no hardcoded label switch/case tables anywhere. `module` + `category`
   double as the grouping keys for the Module → Feature → Permission
   hierarchy (see buildPermissionTree()).

   Vocabulary was derived from a full audit of existing role/permission
   checks across the app (auth.js PERMISSIONS, config/role-registry.js
   CAPABILITIES, app.js canAccessModule, and every module's admin-only
   gate). See docs/PERMISSION_FOUNDATION_REPORT_v1.30.0.md for the full
   audit. 'eng.*'/'sic.*' ids intentionally match role-registry.js's
   CAPABILITIES keys verbatim (same id, metadata authored here) so
   traceability back to the existing Engineering system stays 1:1.

   PURE: plain data + lookups. No DOM, no Firebase, no `window`, no role data.
   ============================================================ */

'use strict';

/** Every known permission, keyed by its hierarchical dot-notation id. */
export const PERMISSIONS = Object.freeze({
  // ── System ────────────────────────────────────────────────────────────
  'system.admin': {
    id: 'system.admin', title: 'Full Administrator Access',
    description: 'Unrestricted access to every module and administrative function.',
    module: 'System', category: 'Administration',
  },
  'system.users.manage': {
    id: 'system.users.manage', title: 'Manage Users',
    description: 'Create, edit, and deactivate user accounts and role assignments.',
    module: 'System', category: 'Administration',
  },

  // ── Driver Operations ────────────────────────────────────────────────
  'driver.schedule.view': {
    id: 'driver.schedule.view', title: 'View Schedule',
    description: 'View the driver assignment schedule and trip details.',
    module: 'Driver Operations', category: 'Schedule',
  },
  'driver.schedule.view.own': {
    id: 'driver.schedule.view.own', title: 'View Own Schedule',
    description: 'View only assignments belonging to the current driver.',
    module: 'Driver Operations', category: 'Schedule',
  },
  'driver.schedule.create': {
    id: 'driver.schedule.create', title: 'Create Assignment',
    description: 'Create a new driver assignment.',
    module: 'Driver Operations', category: 'Schedule',
  },
  'driver.schedule.edit': {
    id: 'driver.schedule.edit', title: 'Edit Assignment',
    description: 'Edit an existing driver assignment.',
    module: 'Driver Operations', category: 'Schedule',
  },
  'driver.schedule.delete': {
    id: 'driver.schedule.delete', title: 'Delete Assignment',
    description: 'Permanently delete a driver assignment.',
    module: 'Driver Operations', category: 'Schedule',
  },
  'driver.schedule.assign': {
    id: 'driver.schedule.assign', title: 'Assign Driver',
    description: 'Assign a driver and vehicle to a trip.',
    module: 'Driver Operations', category: 'Schedule',
  },
  'driver.schedule.start': {
    id: 'driver.schedule.start', title: 'Start Trip',
    description: 'Mark an assigned trip as started.',
    module: 'Driver Operations', category: 'Schedule',
  },
  'driver.schedule.complete': {
    id: 'driver.schedule.complete', title: 'Complete Trip',
    description: 'Mark a started trip as completed.',
    module: 'Driver Operations', category: 'Schedule',
  },
  'driver.schedule.cancel': {
    id: 'driver.schedule.cancel', title: 'Cancel Assignment',
    description: 'Cancel a pending or in-progress assignment.',
    module: 'Driver Operations', category: 'Schedule',
  },
  'driver.request.create': {
    id: 'driver.request.create', title: 'Submit Trip Request',
    description: 'Submit a new trip request for a bidang/unit.',
    module: 'Driver Operations', category: 'Request',
  },
  'driver.reimbursement.print': {
    id: 'driver.reimbursement.print', title: 'Print Reimbursement',
    description: 'Print the reimbursement document for a completed trip.',
    module: 'Driver Operations', category: 'Reimbursement',
  },
  'driver.overtime.override': {
    id: 'driver.overtime.override', title: 'Override Overtime',
    description: 'Manually override calculated overtime for a trip.',
    module: 'Driver Operations', category: 'Overtime',
  },

  // ── Warehouse ────────────────────────────────────────────────────────
  'warehouse.view': {
    id: 'warehouse.view', title: 'View Warehouse',
    description: 'View warehouse inventory, dashboard, and analytics.',
    module: 'Warehouse', category: 'Overview',
  },
  'warehouse.item.create': {
    id: 'warehouse.item.create', title: 'Create Item',
    description: 'Add a new item to warehouse inventory.',
    module: 'Warehouse', category: 'Items',
  },
  'warehouse.item.edit': {
    id: 'warehouse.item.edit', title: 'Edit Item',
    description: 'Allows editing warehouse inventory items.',
    module: 'Warehouse', category: 'Items',
  },
  'warehouse.item.delete': {
    id: 'warehouse.item.delete', title: 'Delete Item',
    description: 'Remove an item from warehouse inventory.',
    module: 'Warehouse', category: 'Items',
  },
  'warehouse.goodsin.execute': {
    id: 'warehouse.goodsin.execute', title: 'Execute Goods In',
    description: 'Record incoming stock movements.',
    module: 'Warehouse', category: 'Goods In',
  },
  'warehouse.goodsout.execute': {
    id: 'warehouse.goodsout.execute', title: 'Execute Goods Out',
    description: 'Record outgoing stock movements.',
    module: 'Warehouse', category: 'Goods Out',
  },

  // ── Vehicle ──────────────────────────────────────────────────────────
  'vehicle.view': {
    id: 'vehicle.view', title: 'View Vehicle Data',
    description: 'View the vehicle registry, health, and compliance data.',
    module: 'Vehicle', category: 'Fleet',
  },
  'vehicle.edit': {
    id: 'vehicle.edit', title: 'Edit Vehicle Data',
    description: 'Edit vehicle records (documents, insurance, compliance).',
    module: 'Vehicle', category: 'Fleet',
  },
  'vehicle.maintenance': {
    id: 'vehicle.maintenance', title: 'Manage Maintenance',
    description: 'Log and manage vehicle maintenance activity.',
    module: 'Vehicle', category: 'Maintenance',
  },

  // ── Petty Cash ───────────────────────────────────────────────────────
  'pettycash.view': {
    id: 'pettycash.view', title: 'View Petty Cash',
    description: 'View petty cash ledgers and balances.',
    module: 'Petty Cash', category: 'Overview',
  },
  'pettycash.manage': {
    id: 'pettycash.manage', title: 'Manage Petty Cash',
    description: 'Record and manage petty cash transactions.',
    module: 'Petty Cash', category: 'Overview',
  },

  // ── Overtime ─────────────────────────────────────────────────────────
  'overtime.view': {
    id: 'overtime.view', title: 'View Overtime',
    description: 'View overtime records and analytics.',
    module: 'Overtime', category: 'Overview',
  },
  'overtime.manage': {
    id: 'overtime.manage', title: 'Manage Overtime',
    description: 'Record, close, and adjust overtime entries.',
    module: 'Overtime', category: 'Overview',
  },

  // ── Analytics ────────────────────────────────────────────────────────
  'analytics.view': {
    id: 'analytics.view', title: 'View Analytics',
    description: 'View cross-module operational analytics.',
    module: 'Analytics', category: 'Overview',
  },

  // ── Configuration ────────────────────────────────────────────────────
  'konfigurasi.view': {
    id: 'konfigurasi.view', title: 'View Configuration',
    description: 'View and manage platform configuration.',
    module: 'Configuration', category: 'Overview',
  },

  // ── Executive ────────────────────────────────────────────────────────
  'executive.dashboard.view': {
    id: 'executive.dashboard.view', title: 'View Executive Dashboard',
    description: 'View the Executive Command Center home workspace.',
    module: 'Executive', category: 'Overview',
  },

  // ── Engineering (ids match config/role-registry.js CAPABILITIES verbatim) ──
  'eng.view': {
    id: 'eng.view', title: 'View Engineering',
    description: 'Reach the Engineering workspace.',
    module: 'Engineering', category: 'Navigation',
  },
  'eng.dashboard': {
    id: 'eng.dashboard', title: 'View Dashboard',
    description: 'View the Engineering dashboard.',
    module: 'Engineering', category: 'Navigation',
  },
  'eng.timeline': {
    id: 'eng.timeline', title: 'View Timeline',
    description: 'View the Engineering assignment timeline.',
    module: 'Engineering', category: 'Navigation',
  },
  'eng.history': {
    id: 'eng.history', title: 'View History',
    description: 'View past Engineering assignments.',
    module: 'Engineering', category: 'Navigation',
  },
  'eng.analytics': {
    id: 'eng.analytics', title: 'View Analytics',
    description: 'View Engineering analytics.',
    module: 'Engineering', category: 'Navigation',
  },
  'eng.settings': {
    id: 'eng.settings', title: 'Manage Settings',
    description: 'Manage Engineering module settings.',
    module: 'Engineering', category: 'Navigation',
  },
  'eng.create': {
    id: 'eng.create', title: 'Create Assignment',
    description: 'Create a new Engineering assignment.',
    module: 'Engineering', category: 'Assignments',
  },
  'eng.edit': {
    id: 'eng.edit', title: 'Edit Assignment',
    description: 'Edit an Engineering assignment.',
    module: 'Engineering', category: 'Assignments',
  },
  'eng.delete': {
    id: 'eng.delete', title: 'Delete Assignment',
    description: 'Delete an Engineering assignment.',
    module: 'Engineering', category: 'Assignments',
  },
  'eng.report.create': {
    id: 'eng.report.create', title: 'Create Work Report',
    description: 'Create a "Catat Pekerjaan" operational work report.',
    module: 'Engineering', category: 'Work Reports',
  },
  'eng.join': {
    id: 'eng.join', title: 'Join Assignment',
    description: 'Join an Engineering field assignment.',
    module: 'Engineering', category: 'Field Operations',
  },
  'eng.start': {
    id: 'eng.start', title: 'Start Work',
    description: 'Start work on an Engineering assignment.',
    module: 'Engineering', category: 'Field Operations',
  },
  'eng.finish': {
    id: 'eng.finish', title: 'Finish Work',
    description: 'Finish work on an Engineering assignment.',
    module: 'Engineering', category: 'Field Operations',
  },
  'eng.continueTomorrow': {
    id: 'eng.continueTomorrow', title: 'Continue Tomorrow',
    description: 'Roll an unfinished assignment over to the next day.',
    module: 'Engineering', category: 'Field Operations',
  },
  'eng.continueTomorrow.ownOnly': {
    id: 'eng.continueTomorrow.ownOnly', title: 'Continue Own Assignment Only',
    description: 'Modifier: a Member may only roll over an assignment they participate in.',
    module: 'Engineering', category: 'Field Operations',
  },
  'eng.verify': {
    id: 'eng.verify', title: 'Verify Assignment',
    description: 'Verify a completed Engineering assignment.',
    module: 'Engineering', category: 'Supervision',
  },
  'eng.postpone': {
    id: 'eng.postpone', title: 'Postpone Assignment',
    description: 'Postpone an Engineering assignment.',
    module: 'Engineering', category: 'Supervision',
  },
  'eng.reopen': {
    id: 'eng.reopen', title: 'Reopen Assignment',
    description: 'Reopen a verified or postponed Engineering assignment.',
    module: 'Engineering', category: 'Supervision',
  },

  // ── Sarpras Intelligence (ids match role-registry.js CAPABILITIES) ─────
  'sic.review.act': {
    id: 'sic.review.act', title: 'Act as Reviewer',
    description: 'Edit a knowledge draft and move it through the review workflow.',
    module: 'Sarpras Intelligence', category: 'Review Workflow',
  },
  'sic.approve.act': {
    id: 'sic.approve.act', title: 'Act as Approver',
    description: 'Approve a knowledge draft as organizationally true.',
    module: 'Sarpras Intelligence', category: 'Review Workflow',
  },
});

/** The permission record for `id`, or null when unknown. */
export function getPermission(id) {
  return PERMISSIONS[id] || null;
}

/** Every permission record, as an array (for iteration/rendering). */
export function listAllPermissions() {
  return Object.values(PERMISSIONS);
}

/** All permissions belonging to `module` (e.g. 'Warehouse'). */
export function permissionsByModule(module) {
  return listAllPermissions().filter((p) => p.module === module);
}

/** All permissions belonging to `module`'s `category` (e.g. 'Warehouse' → 'Items'). */
export function permissionsByCategory(module, category) {
  return permissionsByModule(module).filter((p) => p.category === category);
}

/**
 * Module → Feature (category) → Permission[] — the full permission tree,
 * derived automatically from the flat registry. A future Role Management
 * screen renders directly from this; no separate tree-shape config exists
 * or needs to.
 * @returns {Object<string, Object<string, Array>>}
 */
export function buildPermissionTree() {
  const tree = {};
  for (const perm of listAllPermissions()) {
    if (!tree[perm.module]) tree[perm.module] = {};
    if (!tree[perm.module][perm.category]) tree[perm.module][perm.category] = [];
    tree[perm.module][perm.category].push(perm);
  }
  return tree;
}
