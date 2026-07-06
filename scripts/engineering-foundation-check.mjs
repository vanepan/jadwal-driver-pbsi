/* engineering-foundation-check.mjs — validates the Engineering Operations
   Foundation (v1.20.0): config enums + lifecycle graph, the assignment/
   participant model, the timeline / assignment / verification engines, the
   notification engine (+ future-source extension seam), settings, the store,
   the analytics foundation, and the provider (with and without an adapter).
   Run: node scripts/engineering-foundation-check.mjs   (exit 0 = all pass)

   PURE node — imports the ES modules directly, no Firebase, no DOM. */

import {
  STATUS, PRIORITY, SOURCE, LIFECYCLE, canTransition, comparePriority,
  isKnownStatus, isKnownCategory, isFutureSource, priorityWeight,
  CATEGORY_SEED, PARTICIPANT_STATUS, VERIFICATION_STATUS,
  getEngineeringConfig, setEngineeringConfig, resetEngineeringConfig,
} from '../js/engineering/config/engineering-config.js';
import {
  generateId, generateAssignmentNumber, rtdbSafeKey, durationMs, nodeToArray,
} from '../js/engineering/utils/engineering-utils.js';
import {
  createAssignmentModel, createParticipant, serializeAssignment,
  normalizeAssignment, normalizeActor, findParticipant,
} from '../js/engineering/models/engineering-assignment.js';
import {
  TIMELINE_EVENT, createTimelineEvent, appendEvents, recordEvents,
  eventsOfType, latestEvent, isKnownEventType,
} from '../js/engineering/timeline/timeline-engine.js';
import {
  createAssignment, publishAssignment, markAvailable, joinAssignment,
  leaveAssignment, startAssignment, finishAssignment, postponeAssignment,
  continueTomorrowAssignment, cancelAssignment, archiveAssignment,
  transitionAssignment, TransitionError,
} from '../js/engineering/engines/assignment-engine.js';
import {
  verifyAssignment, rejectVerification, completeAssignment,
  isAwaitingVerification, isVerified,
} from '../js/engineering/engines/verification-engine.js';
import {
  buildPublishNotification, resolveRecipients, buildNotificationForAssignment,
  registerSourceNotifier, hasSourceNotifier, _resetSourceNotifiers,
  AUDIENCE, NOTIFICATION_TYPE,
} from '../js/engineering/notifications/notification-engine.js';
import {
  getEngineeringSettings, updateEngineeringSettings, resetEngineeringSettings,
  getEnabledCategories, isVerificationRequired,
} from '../js/engineering/settings/engineering-settings.js';
import {
  upsertAssignment, getAssignment, listAssignments, removeAssignment,
  nextAssignmentSequence, hydrateAssignments, getAssignmentTimeline,
  addNotification, getNotifications, resetEngineeringStore, getEngineeringState,
} from '../js/engineering/stores/engineering-store.js';
import {
  loadAssignments, loadAnalytics, loadAll, ENGINEERING_PATHS,
} from '../js/engineering/providers/engineering-provider.js';
import {
  buildEngineeringAnalytics, countCompleted, mostRequestedRooms,
  engineeringWorkload, overdueAssignments,
} from '../js/engineering/analytics/engineering-analytics.js';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}
function throws(name, fn, Type) {
  try { fn(); check(name, false); }
  catch (e) { check(name, Type ? e instanceof Type : true); }
}

/* ── 1. Config: enums + lifecycle graph ──────────────────────────────── */
console.log('\n[config]');
check('11 lifecycle statuses defined', Object.keys(LIFECYCLE).length === 11);
check('10 seed categories', CATEGORY_SEED.length === 10);
check('canTransition draft→published', canTransition(STATUS.DRAFT, STATUS.PUBLISHED));
check('canTransition published→available', canTransition(STATUS.PUBLISHED, STATUS.AVAILABLE));
check('canTransition in_progress→waiting_verification', canTransition(STATUS.IN_PROGRESS, STATUS.WAITING_VERIFICATION));
check('canTransition waiting_verification→verified', canTransition(STATUS.WAITING_VERIFICATION, STATUS.VERIFIED));
check('reject draft→verified (illegal)', !canTransition(STATUS.DRAFT, STATUS.VERIFIED));
check('reject archived→anything (terminal)', LIFECYCLE[STATUS.ARCHIVED].length === 0);
check('isKnownStatus true for draft', isKnownStatus(STATUS.DRAFT));
check('isKnownStatus false for bogus', !isKnownStatus('nope'));
check('isKnownCategory ac-maintenance', isKnownCategory('ac-maintenance'));
check('isFutureSource bidang_request', isFutureSource(SOURCE.BIDANG_REQUEST));
check('isFutureSource false for direct', !isFutureSource(SOURCE.DIRECT));
check('priority CRITICAL outweighs LOW', priorityWeight(PRIORITY.CRITICAL) > priorityWeight(PRIORITY.LOW));
check('comparePriority sorts critical first', comparePriority(PRIORITY.CRITICAL, PRIORITY.LOW) < 0);
setEngineeringConfig({ assignmentNumberPrefix: 'ENGX' });
check('setEngineeringConfig applies prefix', getEngineeringConfig().assignmentNumberPrefix === 'ENGX');
setEngineeringConfig({ assignmentNumberPrefix: '   ' });
check('setEngineeringConfig ignores blank', getEngineeringConfig().assignmentNumberPrefix === 'ENGX');
resetEngineeringConfig();
check('resetEngineeringConfig restores default', getEngineeringConfig().assignmentNumberPrefix === 'ENG');

/* ── 2. Utils ─────────────────────────────────────────────────────────── */
console.log('\n[utils]');
check('generateId is RTDB-safe', /^[a-z0-9-]+$/.test(generateId('eng')));
check('generateId two calls differ', generateId('eng') !== generateId('eng'));
check('assignment number format', /^ENG-\d{8}-\d{4}$/.test(generateAssignmentNumber({ prefix: 'ENG', sequence: 7, now: '2026-07-05T00:00:00Z' })));
check('assignment number uses sequence', generateAssignmentNumber({ sequence: 42, now: '2026-07-05T00:00:00Z' }).endsWith('-0042'));
check('rtdbSafeKey strips illegal chars', rtdbSafeKey('a.b#c/d [e]') === 'a-b-c-d-e');
check('durationMs 1h', durationMs('2026-07-05T08:00:00Z', '2026-07-05T09:00:00Z') === 3600000);
check('durationMs negative → null', durationMs('2026-07-05T09:00:00Z', '2026-07-05T08:00:00Z') === null);
check('nodeToArray from keyed object', nodeToArray({ a: { x: 1 }, b: { x: 2 } }).length === 2);

/* ── 3. Model ─────────────────────────────────────────────────────────── */
console.log('\n[model]');
const model = createAssignmentModel({ title: 'Fix AC', category: 'ac-maintenance', priority: PRIORITY.HIGH, building: 'A', room: '101', creator: { id: 'admin', name: 'Admin' } }, { id: 'a1', assignmentNumber: 'ENG-20260705-0001', now: '2026-07-05T08:00:00Z' });
check('model starts in draft', model.status === STATUS.DRAFT);
check('model keeps known priority', model.priority === PRIORITY.HIGH);
check('model bad priority → default normal', createAssignmentModel({ priority: 'urgent' }).priority === PRIORITY.NORMAL);
check('model has reserved reference block', 'bidangRequestRef' in model.references && model.references.bidangRequestRef === null);
check('model has verification block', model.verification.verifierId === null);
check('normalizeActor string → {id,name}', normalizeActor('admin').id === 'admin');
check('serializeAssignment deep-clones', (() => { const s = serializeAssignment(model); s.title = 'X'; return model.title === 'Fix AC'; })());
const part = createParticipant({ workerId: 'w1', name: 'Budi' }, { id: 'p1' });
check('participant starts JOINED', part.status === PARTICIPANT_STATUS.JOINED);
check('participant verification PENDING', part.verificationStatus === VERIFICATION_STATUS.PENDING);
check('normalizeAssignment round-trips', normalizeAssignment(serializeAssignment(model)).id === 'a1');

/* ── 4. Timeline engine ──────────────────────────────────────────────── */
console.log('\n[timeline]');
check('isKnownEventType CREATED', isKnownEventType(TIMELINE_EVENT.CREATED));
const e1 = createTimelineEvent(TIMELINE_EVENT.PUBLISHED, { actor: { id: 'admin' }, now: '2026-07-05T08:05:00Z' });
const e2 = createTimelineEvent(TIMELINE_EVENT.STARTED, { now: '2026-07-05T08:00:00Z' });
check('createTimelineEvent has id + timestamp', !!e1.id && e1.timestamp.includes('T'));
const sorted = appendEvents([], [e1, e2]);
check('appendEvents sorts by timestamp', sorted[0].type === TIMELINE_EVENT.STARTED);
const rec = recordEvents(model, e1);
check('recordEvents does not mutate input', model.timeline.length === 0 && rec.timeline.length === 1);
check('unknown event type still recorded', createTimelineEvent('mystery').metadata.unknownType === true);
check('eventsOfType filters', eventsOfType(sorted, TIMELINE_EVENT.PUBLISHED).length === 1);
check('latestEvent is newest', latestEvent(sorted).type === TIMELINE_EVENT.PUBLISHED);

/* ── 5. Assignment engine: full lifecycle ────────────────────────────── */
console.log('\n[assignment-engine lifecycle]');
let a = createAssignment({ title: 'Fix AC', category: 'ac-maintenance', priority: PRIORITY.HIGH, building: 'A', room: '101', creator: { id: 'admin', name: 'Admin' } }, { sequence: 1, now: '2026-07-05T08:00:00Z' });
check('createAssignment → draft', a.status === STATUS.DRAFT);
check('createAssignment has id + number', !!a.id && /^ENG-\d{8}-\d{4}$/.test(a.assignmentNumber));
check('createAssignment emits CREATED', eventsOfType(a.timeline, TIMELINE_EVENT.CREATED).length === 1);
a = publishAssignment(a, { actor: { id: 'admin' }, now: '2026-07-05T08:05:00Z' });
check('publish → published', a.status === STATUS.PUBLISHED && !!a.publishedTime);
a = markAvailable(a, { recipientCount: 3, now: '2026-07-05T08:06:00Z' });
check('markAvailable → available', a.status === STATUS.AVAILABLE);
check('markAvailable emits NOTIFICATION_SENT(3)', eventsOfType(a.timeline, TIMELINE_EVENT.NOTIFICATION_SENT)[0].metadata.recipientCount === 3);
a = joinAssignment(a, { workerId: 'w1', name: 'Budi' }, { now: '2026-07-05T08:10:00Z' });
a = joinAssignment(a, { workerId: 'w2', name: 'Andi' }, { now: '2026-07-05T08:11:00Z' });
check('two workers joined (equal, no owner)', a.participants.length === 2);
a = startAssignment(a, { workerId: 'w1', now: '2026-07-05T08:15:00Z' });
check('first start → in_progress', a.status === STATUS.IN_PROGRESS && !!a.startedTime);
check('worker w1 WORKING', findParticipant(a, 'w1').status === PARTICIPANT_STATUS.WORKING);
a = finishAssignment(a, { workerId: 'w1', now: '2026-07-05T09:15:00Z' });
check('one of two finished → stays in_progress', a.status === STATUS.IN_PROGRESS);
check('worker w1 actual duration = 1h', findParticipant(a, 'w1').actualWorkingDurationMs === 3600000);
a = finishAssignment(a, { workerId: 'w2', now: '2026-07-05T09:20:00Z' });
check('all finished → waiting_verification', a.status === STATUS.WAITING_VERIFICATION && !!a.finishedTime);
check('isAwaitingVerification true', isAwaitingVerification(a));
a = verifyAssignment(a, { id: 'coord', name: 'Coordinator' }, { notes: 'OK', now: '2026-07-05T09:30:00Z' });
check('verify → verified', a.status === STATUS.VERIFIED && a.verification.verifierId === 'coord');
check('verifiedTime stamped', !!a.verifiedTime);
check('isVerified true', isVerified(a));
check('participants marked verified', a.participants.every((p) => p.verificationStatus === VERIFICATION_STATUS.VERIFIED));
a = completeAssignment(a, { now: '2026-07-05T09:31:00Z' });
check('complete → completed', a.status === STATUS.COMPLETED);
a = archiveAssignment(a, { now: '2026-07-05T09:32:00Z' });
check('archive → archived', a.status === STATUS.ARCHIVED);

/* ── 6. Invalid transitions are impossible ───────────────────────────── */
console.log('\n[assignment-engine guards]');
const draft = createAssignment({ title: 'X' }, { sequence: 2, now: '2026-07-05T08:00:00Z' });
throws('transition draft→verified throws', () => transitionAssignment(draft, STATUS.VERIFIED), TransitionError);
throws('publish an archived assignment throws', () => publishAssignment(a), TransitionError);
throws('verify a draft throws', () => verifyAssignment(draft, { id: 'c' }), TransitionError);
throws('start on draft throws', () => startAssignment(draft, { workerId: 'w1' }), TransitionError);

/* ── 7. Postpone / continue-tomorrow / cancel / reject ───────────────── */
console.log('\n[assignment-engine branches]');
let b = createAssignment({ title: 'Pump' }, { sequence: 3, now: '2026-07-05T08:00:00Z' });
b = markAvailable(publishAssignment(b, { now: '2026-07-05T08:01:00Z' }), { now: '2026-07-05T08:02:00Z' });
b = joinAssignment(b, { workerId: 'w1' }, { now: '2026-07-05T08:03:00Z' });
b = startAssignment(b, { workerId: 'w1', now: '2026-07-05T08:04:00Z' });
const cont = continueTomorrowAssignment(b, { workerId: 'w1', now: '2026-07-05T10:04:00Z' });
check('continueTomorrow → continue_tomorrow', cont.status === STATUS.CONTINUE_TOMORROW && !!cont.continueTomorrowTime);
check('continueTomorrow flags worker', findParticipant(cont, 'w1').continueTomorrow === true);
check('continueTomorrow banks 2h', findParticipant(cont, 'w1').actualWorkingDurationMs === 7200000);
check('resume continue_tomorrow→in_progress legal', transitionAssignment(cont, STATUS.IN_PROGRESS, { now: '2026-07-06T08:00:00Z' }).status === STATUS.IN_PROGRESS);
const post = postponeAssignment(b, { reason: 'parts', now: '2026-07-05T10:00:00Z' });
check('postpone → postponed', post.status === STATUS.POSTPONED && !!post.postponedTime);
const canc = cancelAssignment(b, { reason: 'duplicate', now: '2026-07-05T10:00:00Z' });
check('cancel → cancelled', canc.status === STATUS.CANCELLED);
check('archive a cancelled assignment', archiveAssignment(canc).status === STATUS.ARCHIVED);
const left = leaveAssignment(b, 'w1');
check('leave marks worker LEFT', findParticipant(left, 'w1').status === PARTICIPANT_STATUS.LEFT);
// reject path
let wv = finishAssignment(b, { workerId: 'w1', force: true, now: '2026-07-05T11:00:00Z' });
check('force finish → waiting_verification', wv.status === STATUS.WAITING_VERIFICATION);
const rej = rejectVerification(wv, { id: 'coord' }, { reason: 'redo' });
check('reject → back to in_progress', rej.status === STATUS.IN_PROGRESS);
check('reject marks worker verification REJECTED', findParticipant(rej, 'w1').verificationStatus === VERIFICATION_STATUS.REJECTED);

/* ── 8. Notification engine ──────────────────────────────────────────── */
console.log('\n[notification-engine]');
_resetSourceNotifiers();
const notif = buildPublishNotification({ id: 'a1', title: 'Fix AC', assignmentNumber: 'ENG-20260705-0001', priority: PRIORITY.HIGH, building: 'A', room: '101', source: SOURCE.DIRECT });
check('publish notif type', notif.type === NOTIFICATION_TYPE.ASSIGNMENT_PUBLISHED);
check('targets coordinator + members', notif.audiences.includes(AUDIENCE.ENGINEERING_COORDINATOR) && notif.audiences.includes(AUDIENCE.ENGINEERING_MEMBERS));
const recips = resolveRecipients(notif, { coordinator: { id: 'coord' }, members: [{ id: 'm1' }, { id: 'm2' }, { id: 'm1' }] });
check('resolveRecipients de-dups', recips.length === 3 && recips[0] === 'coord');
check('registerSourceNotifier rejects DIRECT', registerSourceNotifier(SOURCE.DIRECT, () => ({})) === false);
check('registerSourceNotifier accepts future source', registerSourceNotifier(SOURCE.BIDANG_REQUEST, (asg) => ({ ...buildPublishNotification(asg), type: 'bidang' })) === true);
check('hasSourceNotifier bidang', hasSourceNotifier(SOURCE.BIDANG_REQUEST));
check('buildNotificationForAssignment delegates future source', buildNotificationForAssignment({ id: 'x', source: SOURCE.BIDANG_REQUEST }).type === 'bidang');
check('buildNotificationForAssignment DIRECT uses publish flow', buildNotificationForAssignment({ id: 'y', source: SOURCE.DIRECT }).type === NOTIFICATION_TYPE.ASSIGNMENT_PUBLISHED);
_resetSourceNotifiers();
check('reset clears notifiers', !hasSourceNotifier(SOURCE.BIDANG_REQUEST));

/* ── 9. Settings ─────────────────────────────────────────────────────── */
console.log('\n[settings]');
resetEngineeringSettings();
check('10 enabled categories by default', getEnabledCategories().length === 10);
check('categories seeded from config', getEngineeringSettings().categories[0].id === CATEGORY_SEED[0].id);
check('verification required by default', isVerificationRequired());
updateEngineeringSettings({ buildings: [{ id: 'a', label: 'Gedung A' }], verificationRules: { required: false } });
check('update merges nested (verification off)', isVerificationRequired() === false);
check('update replaces array (buildings)', getEngineeringSettings().buildings.length === 1);
resetEngineeringSettings();
check('reset restores verification required', isVerificationRequired());

/* ── 10. Store ───────────────────────────────────────────────────────── */
console.log('\n[store]');
resetEngineeringStore();
const s1 = createAssignment({ title: 'One', category: 'plumbing', priority: PRIORITY.LOW }, { sequence: nextAssignmentSequence('2026-07-05T00:00:00Z'), now: '2026-07-05T08:00:00Z' });
upsertAssignment(s1);
const s2 = createAssignment({ title: 'Two', category: 'plumbing', priority: PRIORITY.LOW, status: STATUS.DRAFT }, { sequence: nextAssignmentSequence('2026-07-05T00:00:00Z'), now: '2026-07-05T08:01:00Z' });
upsertAssignment(publishAssignment(s2, { now: '2026-07-05T08:02:00Z' }));
check('store holds 2 assignments', Object.keys(getEngineeringState().assignments).length === 2);
check('getAssignment by id', getAssignment(s1.id).title === 'One');
check('listAssignments filter by status', listAssignments({ status: STATUS.DRAFT }).length === 1);
check('listAssignments filter array any-of', listAssignments({ status: [STATUS.DRAFT, STATUS.PUBLISHED] }).length === 2);
check('sequence increments per day', /-0002$/.test(s2.assignmentNumber));
check('getAssignmentTimeline embedded', getAssignmentTimeline(s1.id).length >= 1);
addNotification(buildPublishNotification(s2));
check('addNotification logs', getNotifications().length === 1);
check('removeAssignment', removeAssignment(s1.id) && !getAssignment(s1.id));
const hydrated = hydrateAssignments([serializeAssignment(s2)]);
check('hydrateAssignments recomputes map', Object.keys(hydrated).length === 1);

/* ── 11. Analytics ───────────────────────────────────────────────────── */
console.log('\n[analytics]');
const now = '2026-07-05T12:00:00Z';
const dataset = [
  { id: 'x1', status: STATUS.COMPLETED, category: 'ac-maintenance', priority: PRIORITY.HIGH, building: 'A', room: '101', source: SOURCE.DIRECT, startedTime: '2026-07-05T08:00:00Z', finishedTime: '2026-07-05T09:00:00Z', participants: [{ workerId: 'w1', name: 'Budi', status: PARTICIPANT_STATUS.FINISHED, actualWorkingDurationMs: 3600000, verificationStatus: 'verified' }] },
  { id: 'x2', status: STATUS.VERIFIED, category: 'ac-maintenance', priority: PRIORITY.NORMAL, building: 'A', room: '101', source: SOURCE.DIRECT, startedTime: '2026-07-05T08:00:00Z', finishedTime: '2026-07-05T10:00:00Z', participants: [{ workerId: 'w1', name: 'Budi', status: PARTICIPANT_STATUS.FINISHED, actualWorkingDurationMs: 7200000, verificationStatus: 'verified' }] },
  { id: 'x3', status: STATUS.IN_PROGRESS, category: 'plumbing', priority: PRIORITY.CRITICAL, building: 'B', room: '202', source: SOURCE.DIRECT, createdTime: '2026-07-01T08:00:00Z', participants: [{ workerId: 'w2', name: 'Andi', status: PARTICIPANT_STATUS.WORKING }] },
];
const an = buildEngineeringAnalytics(dataset, { now, overdueThresholdHours: 24 });
check('total assignments = 3', an.totalAssignments === 3);
check('completed (verified+completed) = 2', an.completedAssignments === 2 && countCompleted(dataset) === 2);
check('avg completion time = 1.5h', an.averageCompletionTime.averageMs === 5400000);
check('overdue counts stale in-progress', an.overdueAssignments.count === 1 && an.overdueAssignments.ids.includes('x3'));
check('category distribution', an.categoryDistribution['ac-maintenance'] === 2);
check('priority distribution', an.priorityDistribution[PRIORITY.CRITICAL] === 1);
check('most-requested rooms sorted', mostRequestedRooms(dataset)[0].room === '101' && mostRequestedRooms(dataset)[0].count === 2);
const wl = engineeringWorkload(dataset);
check('workload aggregates worker w1', wl.find((w) => w.workerId === 'w1').assignments === 2);
check('workload sums working time', wl.find((w) => w.workerId === 'w1').workingMs === 10800000);
check('request sources = direct×3', an.requestSources[SOURCE.DIRECT] === 3);
check('overdue standalone helper', overdueAssignments(dataset, { now }).count === 1);

/* ── 12. Provider (fake adapter + no adapter) ────────────────────────── */
console.log('\n[provider]');
resetEngineeringStore();
const fakeDb = { [ENGINEERING_PATHS.assignments]: { [s2.id]: serializeAssignment(s2) }, [ENGINEERING_PATHS.notifications]: [buildPublishNotification(s2)] };
const adapter = { isConfigured: () => true, fetchData: async (p) => fakeDb[p] ?? null };
const loaded = await loadAssignments(adapter);
check('provider loads assignments via adapter', loaded.loaded && loaded.count === 1);
const snap = loadAnalytics({ now });
check('provider computes + caches analytics', snap.totalAssignments === 1 && getEngineeringState().analytics === snap);
resetEngineeringStore();
const none = await loadAssignments(null);
check('provider no adapter → loaded:false, no throw', none.loaded === false);
const all = await loadAll(adapter, { now });
check('loadAll returns assignments + notifications + analytics', all.assignments === 1 && all.notifications === 1 && !!all.analytics);

/* ── Summary ─────────────────────────────────────────────────────────── */
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
