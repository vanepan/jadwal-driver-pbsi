/* engineering-ui-check.mjs — validates the Engineering Operations UI Foundation
   (v1.20.1) NON-render layer: the role registry + capability matrix (extensible
   to Executive), the Development Seed dataset (built through the real engines,
   covering every required scenario), the Provider hydration path, and the
   presentation mappings the screens rely on.
   Run: node scripts/engineering-ui-check.mjs   (exit 0 = all pass)   PURE node. */

import {
  ROLES, ROLE_GROUP, ENGINEERING_ROLE, EXECUTIVE_ROLE, CAPABILITIES,
  can, roleLabel, rolesInGroup, isEngineeringRole, capabilitiesOf, roleLabelsForGroup,
} from '../js/config/role-registry.js';
import { buildDevSeedAssignments, SEED_MEMBERS } from '../js/engineering/providers/dev-seed-data.js';
import {
  resetEngineeringStore, listAssignments, getEngineeringState,
} from '../js/engineering/stores/engineering-store.js';
import { loadAll } from '../js/engineering/providers/engineering-provider.js';
import { createDevSeedAdapter } from '../js/engineering/providers/dev-seed-adapter.js';
import { normalizeAssignment } from '../js/engineering/models/engineering-assignment.js';
import { STATUS, PRIORITY } from '../js/engineering/config/engineering-config.js';
import { catMeta, statusMeta, prioMeta, fmtDuration, initials, workerColorVar } from '../js/engineering/ui/engineering-atoms.js';

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };
const ADMIN = 'admin', { COORDINATOR, MEMBER } = ENGINEERING_ROLE;

/* ── 1. Role registry ─────────────────────────────────────────────────── */
console.log('\n[role registry]');
check('engineering roles are first-class', rolesInGroup(ROLE_GROUP.ENGINEERING).length === 2);
check('coordinator label', roleLabel(COORDINATOR) === 'Koordinator Engineering');
check('member label', roleLabel(MEMBER) === 'Engineering');
check('executive family reserved', rolesInGroup(ROLE_GROUP.EXECUTIVE).length === 3);
check('executive roles hold no capability yet', capabilitiesOf(EXECUTIVE_ROLE.KETUA_UMUM).length === 0);
check('isEngineeringRole true for coordinator', isEngineeringRole(COORDINATOR));
check('isEngineeringRole false for admin', !isEngineeringRole(ADMIN));
check('roleLabelsForGroup(engineering) has both', Object.keys(roleLabelsForGroup(ROLE_GROUP.ENGINEERING)).length === 2);
check('core roles preserved', ROLES.some((r) => r.id === 'admin') && ROLES.some((r) => r.id === 'driver'));

/* ── 2. Capability matrix (per the approved permission spec) ──────────── */
console.log('\n[capabilities]');
check('admin: full — create', can('eng.create', ADMIN));
check('admin: verify', can('eng.verify', ADMIN));
check('admin: analytics', can('eng.analytics', ADMIN));
check('admin: settings', can('eng.settings', ADMIN));
check('coordinator: verify', can('eng.verify', COORDINATOR));
check('coordinator: postpone', can('eng.postpone', COORDINATOR));
check('coordinator: join/start/finish', can('eng.join', COORDINATOR) && can('eng.start', COORDINATOR) && can('eng.finish', COORDINATOR));
check('coordinator: NO create', !can('eng.create', COORDINATOR));
check('coordinator: NO analytics', !can('eng.analytics', COORDINATOR));
check('coordinator: NO settings', !can('eng.settings', COORDINATOR));
check('member: join/start/finish', can('eng.join', MEMBER) && can('eng.start', MEMBER) && can('eng.finish', MEMBER));
check('member: continueTomorrow', can('eng.continueTomorrow', MEMBER));
check('member: own-only continue modifier', can('eng.continueTomorrow.ownOnly', MEMBER) && !can('eng.continueTomorrow.ownOnly', COORDINATOR));
check('member: NO verify', !can('eng.verify', MEMBER));
check('member: NO postpone', !can('eng.postpone', MEMBER));
check('member: NO analytics/settings/create', !can('eng.analytics', MEMBER) && !can('eng.settings', MEMBER) && !can('eng.create', MEMBER));
check('history for coordinator + member only', can('eng.history', COORDINATOR) && can('eng.history', MEMBER) && !can('eng.history', ADMIN));
check('unknown capability denies', !can('eng.bogus', ADMIN));
check('capability matrix has ≥ 14 entries', Object.keys(CAPABILITIES).length >= 14);

/* ── 3. Development Seed (through the real engines) ────────────────────── */
console.log('\n[dev seed]');
const seed = buildDevSeedAssignments();
check('seed builds 10 assignments', seed.length === 10);
const byStatus = {};
seed.forEach((a) => { byStatus[a.status] = (byStatus[a.status] || 0) + 1; });
check('covers waiting_verification', byStatus[STATUS.WAITING_VERIFICATION] >= 1);
check('covers continue_tomorrow', byStatus[STATUS.CONTINUE_TOMORROW] >= 1);
check('covers postponed', byStatus[STATUS.POSTPONED] >= 1);
check('covers verified/completed', (byStatus[STATUS.VERIFIED] || 0) + (byStatus[STATUS.COMPLETED] || 0) >= 2);
check('covers in_progress', byStatus[STATUS.IN_PROGRESS] >= 1);
check('covers available', byStatus[STATUS.AVAILABLE] >= 1);
const prios = new Set(seed.map((a) => a.priority));
check('covers Critical/High/Normal/Low', prios.has(PRIORITY.CRITICAL) && prios.has(PRIORITY.HIGH) && prios.has(PRIORITY.NORMAL) && prios.has(PRIORITY.LOW));
const multi = seed.find((a) => a.participants.length > 1);
check('has a multi-worker assignment', !!multi && multi.participants.every((p) => p.name));
check('in_progress worker has live startedTime', seed.find((a) => a.status === STATUS.IN_PROGRESS).participants.some((p) => p.status === 'working' && p.startedTime));
check('continue_tomorrow banks duration', seed.find((a) => a.status === STATUS.CONTINUE_TOMORROW).participants[0].actualWorkingDurationMs > 0);
check('every seed record validates against the real model', seed.every((a) => normalizeAssignment(a) && normalizeAssignment(a).id === a.id));
check('seed carries requester + dueDate (drawer fields)', seed.every((a) => 'requester' in a && 'dueDate' in a));
check('timelines are non-empty (built by engines)', seed.every((a) => Array.isArray(a.timeline) && a.timeline.length >= 1));
check('roster exposed', Array.isArray(SEED_MEMBERS) && SEED_MEMBERS.length >= 5);

/* ── 4. Provider hydration (the module always loads through the provider) ─ */
console.log('\n[provider hydration]');
resetEngineeringStore();
const result = await loadAll(createDevSeedAdapter(), { now: Date.now() });
check('loadAll reports 10 assignments', result.assignments === 10);
check('store hydrated to 10', listAssignments().length === 10);
check('analytics computed + cached', !!getEngineeringState().analytics && getEngineeringState().analytics.totalAssignments === 10);
check('analytics completed = 2', getEngineeringState().analytics.completedAssignments === 2);
check('analytics has statusDistribution', !!getEngineeringState().analytics.statusDistribution);
resetEngineeringStore();
const empty = await loadAll(null);
check('no adapter → safe empty load', empty.assignments === 0 && !!empty.analytics);

/* ── 5. Presentation mappings ─────────────────────────────────────────── */
console.log('\n[presentation]');
check('catMeta maps hydrant → crit tone/flame', catMeta('hydrant').tone === 'crit' && catMeta('hydrant').icon === 'flame');
check('catMeta unknown → other', catMeta('nope').label === CatOther());
check('statusMeta in_progress → active pill', statusMeta(STATUS.IN_PROGRESS).pill === 'active');
check('statusMeta verified → done pill', statusMeta(STATUS.VERIFIED).pill === 'done');
check('statusMeta postponed → cancel pill', statusMeta(STATUS.POSTPONED).pill === 'cancel');
check('prioMeta critical → Kritis/crit', prioMeta(PRIORITY.CRITICAL).label === 'Kritis' && prioMeta(PRIORITY.CRITICAL).tone === 'crit');
check('fmtDuration 90 → 1j 30m', fmtDuration(90) === '1j 30m');
check('fmtDuration 0 → 0m', fmtDuration(0) === '0m');
check('initials two-word', initials('Isep Saepudin') === 'IS');
check('initials single-word', initials('Suhendra') === 'SU');
check('workerColorVar deterministic', workerColorVar('Budi') === workerColorVar('Budi'));
function CatOther() { return catMeta('other').label; }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
