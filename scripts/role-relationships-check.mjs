/* role-relationships-check.mjs — Role Assignment & Dependency (v1.30.3)
   PURE node test. Drives the REAL role-relationships.js directly (no
   Firebase, no auth.js — Node-loadable by design). Covers: clonedFromId
   (Phase 4) taking priority over the legacy clonedFrom label, case-
   insensitive label fallback for pre-Phase-4 records, a stale/unresolved
   lineage being surfaced (not silently dropped), direct-children-only
   Derived Roles across a 3-generation clone chain, the batch relationship
   graph matching per-role resolution, and System Roles carrying no
   lineage or lifecycle timestamps.
   Run: node scripts/role-relationships-check.mjs (exit 0 = pass) */

import {
  resolveDerivedFrom,
  findDerivedRoles,
  buildRelationshipGraph,
  buildRoleRelationships,
} from '../js/role-management/role-relationships.js';
import { ROLE_STATUS } from '../js/role-management/role-status.js';

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };
const sameIds = (list, ids) => list.length === ids.length && ids.every((id) => list.some((r) => r.id === id));

const admin = { id: 'admin', label: 'Admin', type: 'system', record: null };
const viewer = { id: 'viewer', label: 'Viewer', type: 'system', record: null };

// B clones from A (admin) via the new clonedFromId.
const roleB = {
  id: 'role_b', label: 'Role B', type: 'custom',
  record: { clonedFromId: 'admin', clonedFrom: 'Admin', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z', archived: false, archivedAt: null },
};
// C clones from B — a 3-generation chain (admin -> B -> C).
const roleC = {
  id: 'role_c', label: 'Role C', type: 'custom',
  record: { clonedFromId: 'role_b', clonedFrom: 'Role B', createdAt: '2026-01-03T00:00:00.000Z', updatedAt: '2026-01-03T00:00:00.000Z', archived: false, archivedAt: null },
};
// Legacy record (pre-v1.30.3): only the label was ever stored.
const roleLegacyLabel = {
  id: 'role_legacy', label: 'Legacy Clone', type: 'custom',
  record: { clonedFromId: null, clonedFrom: 'admin', createdAt: '2026-01-04T00:00:00.000Z', updatedAt: '2026-01-04T00:00:00.000Z', archived: false, archivedAt: null },
};
// Claims a source label that no longer resolves to anything (renamed/removed).
const roleStale = {
  id: 'role_stale', label: 'Stale Clone', type: 'custom',
  record: { clonedFromId: null, clonedFrom: 'Deleted Role', createdAt: '2026-01-05T00:00:00.000Z', updatedAt: '2026-01-05T00:00:00.000Z', archived: false, archivedAt: null },
};
// Created directly, never cloned from anything.
const roleUnlinked = {
  id: 'role_unlinked', label: 'From Scratch', type: 'custom',
  record: { clonedFromId: null, clonedFrom: null, createdAt: '2026-01-06T00:00:00.000Z', updatedAt: '2026-01-06T00:00:00.000Z', archived: false, archivedAt: null },
};
// Both fields present and point to DIFFERENT roles — clonedFromId must win.
const roleIdPriority = {
  id: 'role_id_priority', label: 'Id Priority', type: 'custom',
  record: { clonedFromId: 'viewer', clonedFrom: 'Admin', createdAt: '2026-01-07T00:00:00.000Z', updatedAt: '2026-01-07T00:00:00.000Z', archived: false, archivedAt: null },
};
const archivedCustom = {
  id: 'role_archived', label: 'Archived Custom', type: 'custom',
  record: { clonedFromId: null, clonedFrom: null, createdAt: '2026-01-08T00:00:00.000Z', updatedAt: '2026-01-09T00:00:00.000Z', archived: true, archivedAt: '2026-01-09T00:00:00.000Z' },
};

const allRoles = [admin, viewer, roleB, roleC, roleLegacyLabel, roleStale, roleUnlinked, roleIdPriority, archivedCustom];

console.log('\n1. resolveDerivedFrom');
check('resolves via clonedFromId', resolveDerivedFrom(roleB, allRoles)?.id === 'admin');
check('falls back to case-insensitive label match when clonedFromId is absent', resolveDerivedFrom(roleLegacyLabel, allRoles)?.id === 'admin');
check('an unresolvable label returns null', resolveDerivedFrom(roleStale, allRoles) === null);
check('no lineage claimed at all returns null', resolveDerivedFrom(roleUnlinked, allRoles) === null);
check('clonedFromId takes priority over a conflicting clonedFrom label', resolveDerivedFrom(roleIdPriority, allRoles)?.id === 'viewer');
check('System Roles never have a Derived From', resolveDerivedFrom(admin, allRoles) === null);

console.log('\n2. findDerivedRoles — direct children only');
check('admin\'s direct children are role_b and role_legacy (not role_c, a grandchild)', sameIds(findDerivedRoles(admin, allRoles), ['role_b', 'role_legacy']));
check('role_b\'s direct child is role_c only', sameIds(findDerivedRoles(roleB, allRoles), ['role_c']));
check('a role with no children returns an empty array', findDerivedRoles(roleC, allRoles).length === 0);

console.log('\n3. buildRelationshipGraph — batch resolution matches per-role resolution');
const graph = buildRelationshipGraph(allRoles);
check('forward map has one entry per role', graph.forward.size === allRoles.length);
check('reverse index for admin matches findDerivedRoles(admin)', sameIds(graph.reverse.get('admin'), findDerivedRoles(admin, allRoles).map((r) => r.id)));
check('reverse index for role_b matches findDerivedRoles(role_b)', sameIds(graph.reverse.get('role_b'), findDerivedRoles(roleB, allRoles).map((r) => r.id)));
check('stale set contains exactly the unresolved-but-claimed lineage', graph.stale.size === 1 && graph.stale.has('role_stale'));

console.log('\n4. buildRoleRelationships — full shape');
const adminRel = buildRoleRelationships(admin, graph);
check('System Role has no derivedFrom', adminRel.derivedFrom === null);
check('System Role is never stale', adminRel.derivedFromStale === false);
check('System Role has 2 derived roles', adminRel.derivedRoles.length === 2);
check('System Role has null createdAt/updatedAt/archivedAt (code-defined)', adminRel.createdAt === null && adminRel.updatedAt === null && adminRel.archivedAt === null);
check('System Role status is ACTIVE', adminRel.status === ROLE_STATUS.ACTIVE);

const bRel = buildRoleRelationships(roleB, graph);
check('role_b resolves derivedFrom to admin', bRel.derivedFrom?.id === 'admin');
check('role_b has exactly one derived role (role_c)', bRel.derivedRoles.length === 1 && bRel.derivedRoles[0].id === 'role_c');
check('role_b carries its own record timestamps', bRel.createdAt === '2026-01-01T00:00:00.000Z' && bRel.updatedAt === '2026-01-02T00:00:00.000Z');
check('role_b status is ACTIVE', bRel.status === ROLE_STATUS.ACTIVE);

const staleRel = buildRoleRelationships(roleStale, graph);
check('a claimed-but-unresolved lineage sets derivedFromStale, not a silent null', staleRel.derivedFrom === null && staleRel.derivedFromStale === true);

const archivedRel = buildRoleRelationships(archivedCustom, graph);
check('archived custom role status is ARCHIVED', archivedRel.status === ROLE_STATUS.ARCHIVED);
check('archived custom role surfaces archivedAt', archivedRel.archivedAt === '2026-01-09T00:00:00.000Z');
check('an unlinked custom role has no derivedFrom and is not stale', buildRoleRelationships(roleUnlinked, graph).derivedFrom === null && buildRoleRelationships(roleUnlinked, graph).derivedFromStale === false);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
