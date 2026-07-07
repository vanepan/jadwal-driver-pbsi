/* ============================================================
   ROLE-REGISTRY.JS — Platform Role & Capability Registry
   (v1.20.1 — Engineering Operations UI Foundation)

   The authoritative, extensible registry of application roles and the
   capability matrix that gates features. Introduced so the Engineering
   roles (Coordinator + Member) become FIRST-CLASS production roles, and so
   future role families — notably Executive (Ketua Umum / Waketum / Sekjen) —
   slot in by adding data here, with NO redesign of the authorization system.

   SHAPE:
     • ROLES        — every role: { id, label, group }. Groups: 'core'
                      (existing driver-ops roles), 'engineering', and the
                      reserved 'executive' family (declared, not yet granted).
     • CAPABILITIES — capability-id → allowed role-id[] . A capability is an
                      atomic, checkable permission (e.g. 'eng.verify'); the UI
                      and nav ask `can(capability, role)`.

   This registry is ADDITIVE: it does not replace auth.js's existing
   PERMISSIONS map (which continues to gate Driver Operations byte-for-byte).
   auth.js imports the labels + `can()` from here for the new roles.

   PURE: plain data + lookups. No DOM, no Firebase, no `window`.
   ============================================================ */

'use strict';

/** Role group ids. Future families are added here without touching consumers. */
export const ROLE_GROUP = Object.freeze({
  CORE: 'core',
  ENGINEERING: 'engineering',
  EXECUTIVE: 'executive',
});

/** Engineering role ids — the two new first-class production roles. */
export const ENGINEERING_ROLE = Object.freeze({
  COORDINATOR: 'engineering_coordinator',
  MEMBER: 'engineering_member',
});

/**
 * Reserved Executive role ids (declared for extensibility; granted no
 * capabilities yet). A future sprint activates them by adding capability
 * entries below — the registry shape does not change.
 */
export const EXECUTIVE_ROLE = Object.freeze({
  KETUA_UMUM: 'ketua_umum',
  WAKETUM: 'waketum',
  SEKJEN: 'sekjen',
});

/** Every known role. `group` classifies it; `label` is the human name. */
export const ROLES = Object.freeze([
  // core (existing Driver Operations roles — labels mirror auth.js)
  { id: 'admin', label: 'Admin', group: ROLE_GROUP.CORE },
  { id: 'bidang', label: 'Bidang', group: ROLE_GROUP.CORE },
  { id: 'driver', label: 'Driver', group: ROLE_GROUP.CORE },
  { id: 'viewer', label: 'Viewer', group: ROLE_GROUP.CORE },
  // engineering (new)
  { id: ENGINEERING_ROLE.COORDINATOR, label: 'Koordinator Engineering', group: ROLE_GROUP.ENGINEERING },
  { id: ENGINEERING_ROLE.MEMBER, label: 'Anggota Engineering', group: ROLE_GROUP.ENGINEERING },
  // executive (reserved — declared, not yet granted capabilities)
  { id: EXECUTIVE_ROLE.KETUA_UMUM, label: 'Ketua Umum', group: ROLE_GROUP.EXECUTIVE },
  { id: EXECUTIVE_ROLE.WAKETUM, label: 'Wakil Ketua Umum', group: ROLE_GROUP.EXECUTIVE },
  { id: EXECUTIVE_ROLE.SEKJEN, label: 'Sekretaris Jenderal', group: ROLE_GROUP.EXECUTIVE },
]);

const { COORDINATOR, MEMBER } = ENGINEERING_ROLE;
const ADMIN = 'admin';

/**
 * Engineering capability matrix — capability id → allowed role ids.
 *
 * Admin Sarpras: full Engineering access.
 * Coordinator:   field coordination + verification (no create/edit/delete,
 *                no analytics, no settings).
 * Member:        field execution; continue-tomorrow only for own participation
 *                (enforced by the `eng.continueTomorrow.ownOnly` modifier).
 */
export const CAPABILITIES = Object.freeze({
  // navigation / surfaces
  'eng.view': [ADMIN, COORDINATOR, MEMBER],
  'eng.dashboard': [ADMIN, COORDINATOR, MEMBER],
  'eng.timeline': [ADMIN, COORDINATOR, MEMBER],
  'eng.history': [COORDINATOR, MEMBER],
  'eng.analytics': [ADMIN],
  'eng.settings': [ADMIN],
  // assignment authoring (admin only)
  'eng.create': [ADMIN],
  'eng.edit': [ADMIN],
  'eng.delete': [ADMIN],
  // operational work report — "Catat Pekerjaan" (data acquisition, not an assignment)
  'eng.report.create': [ADMIN, COORDINATOR],
  // field operations
  'eng.join': [ADMIN, COORDINATOR, MEMBER],
  'eng.start': [ADMIN, COORDINATOR, MEMBER],
  'eng.finish': [ADMIN, COORDINATOR, MEMBER],
  'eng.continueTomorrow': [ADMIN, COORDINATOR, MEMBER],
  // supervisory
  'eng.verify': [ADMIN, COORDINATOR],
  'eng.postpone': [ADMIN, COORDINATOR],
  'eng.reopen': [ADMIN, COORDINATOR],
  // modifiers
  'eng.continueTomorrow.ownOnly': [MEMBER],
});

const ROLE_BY_ID = new Map(ROLES.map((r) => [r.id, r]));

/** Human label for a role id (falls back to the id). */
export function roleLabel(roleId) {
  const r = ROLE_BY_ID.get(roleId);
  return r ? r.label : (roleId || 'Guest');
}

/** The role record, or null when unknown. */
export function getRole(roleId) {
  return ROLE_BY_ID.get(roleId) || null;
}

/** All roles in a group (e.g. rolesInGroup('engineering')). */
export function rolesInGroup(group) {
  return ROLES.filter((r) => r.group === group);
}

/** Whether `roleId` is one of the Engineering roles. */
export function isEngineeringRole(roleId) {
  const r = ROLE_BY_ID.get(roleId);
  return !!r && r.group === ROLE_GROUP.ENGINEERING;
}

/**
 * Capability check: does `roleId` hold `capability`?
 * Unknown capabilities deny by default (safe).
 * @param {string} capability  a CAPABILITIES key (e.g. 'eng.verify')
 * @param {string} roleId
 * @returns {boolean}
 */
export function can(capability, roleId) {
  const allowed = CAPABILITIES[capability];
  return Array.isArray(allowed) && allowed.includes(roleId);
}

/** All capabilities a role holds (for introspection / tests). */
export function capabilitiesOf(roleId) {
  return Object.keys(CAPABILITIES).filter((cap) => CAPABILITIES[cap].includes(roleId));
}

/** A label map { roleId: label } for the given group (used to extend ROLE_LABELS). */
export function roleLabelsForGroup(group) {
  return Object.fromEntries(rolesInGroup(group).map((r) => [r.id, r.label]));
}
