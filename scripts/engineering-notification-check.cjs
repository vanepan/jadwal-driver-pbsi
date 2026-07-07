/* engineering-notification-check.cjs — v1.20.4 production hardening.
   Proves Engineering rides the EXISTING Cloud Functions notification pipeline
   (no parallel system): the pure lifecycle classifier, the shared recipient
   resolver, the registry (which events notify + channels), the template copy,
   and canonical-envelope validity. Exercises the real functions/src modules.
   Run: node scripts/engineering-notification-check.cjs   (exit 0 = all pass) */

'use strict';

// The shared modules require functions/src/config/admin, which initializes the
// Admin SDK at load. Provide a Database URL so admin.database() resolves WITHOUT
// any network call (the resolver/classifier/templates under test are pure and
// never touch the DB). Must be set before the requires below.
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'schedule-driver-pbsi';
process.env.FIREBASE_CONFIG = process.env.FIREBASE_CONFIG || JSON.stringify({
  projectId: 'schedule-driver-pbsi',
  databaseURL: 'https://schedule-driver-pbsi-default-rtdb.asia-southeast1.firebasedatabase.app',
});

const { classifyEngineering, buildEngineeringPayload } = require('../functions/src/events/engineeringEvents');
const { resolveRecipients } = require('../functions/src/notifications/recipients');
const { getRegistryEntry, isNotifiable } = require('../functions/src/notifications/registry');
const { render } = require('../functions/src/notifications/templates');
const { buildEnvelope, validateEnvelope } = require('../functions/src/events/schema');

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };

/* ── 1. Lifecycle classification from the TRUE state change ─────────────── */
console.log('\n[classify — transition → canonical type]');
const P = (ids) => ids.map((workerId) => ({ workerId, name: workerId }));
const N = (status, participants) => ({ status, participants: participants || [] });
const cases = [
  ['create → published',   classifyEngineering(null, N('available', P(['b']))),                 'engineering.published'],
  ['available→in_progress = accepted', classifyEngineering(N('available', []), N('in_progress', P(['b']))), 'engineering.accepted'],
  ['+member (same status) = joined',   classifyEngineering(N('in_progress', P(['a'])), N('in_progress', P(['a', 'b']))), 'engineering.joined'],
  ['→waiting_verification = completed', classifyEngineering(N('in_progress', P(['b'])), N('waiting_verification', P(['b']))), 'engineering.completed'],
  ['→verified',            classifyEngineering(N('waiting_verification', P(['b'])), N('verified', P(['b']))), 'engineering.verified'],
  ['wv→in_progress = rejected', classifyEngineering(N('waiting_verification', P(['b'])), N('in_progress', P(['b']))), 'engineering.rejected'],
  ['→postponed',           classifyEngineering(N('in_progress', P(['b'])), N('postponed', P(['b']))),  'engineering.postponed'],
  ['postponed→in_progress = resumed', classifyEngineering(N('postponed', P(['b'])), N('in_progress', P(['b']))), 'engineering.resumed'],
  ['→cancelled',           classifyEngineering(N('available', []), N('cancelled', [])),           'engineering.cancelled'],
  ['deleted',              classifyEngineering(N('available', []), null),                          'engineering.deleted'],
  ['finish-by-one (no status change) = non-notifiable', classifyEngineering(N('in_progress', P(['a', 'b'])), N('in_progress', P(['a', 'b']))), 'engineering.updated'],
];
for (const [name, got, want] of cases) check(`${name}`, got === want);

/* ── 2. Recipient fan-out by Engineering role (unified resolver) ────────── */
console.log('\n[recipients — role-based fan-out, actor excluded]');
const users = [
  { username: 'admin1', role: 'admin', active: true },
  { username: 'coord1', role: 'engineering_coordinator', active: true },
  { username: 'mem1', role: 'engineering_member', active: true },
  { username: 'mem2', role: 'engineering_member', active: true },
  { username: 'driver1', role: 'driver', active: true },
];
const ev = (type, actorUid, payload) => ({ type, actor: { uid: actorUid || null }, payload: payload || {} });
const rc = (type, actorUid, payload) => resolveRecipients(ev(type, actorUid, payload), users).users.sort();

check('published → all coordinators + members (not admin, not driver)',
  JSON.stringify(rc('engineering.published', 'admin1')) === JSON.stringify(['coord1', 'mem1', 'mem2']));
check('accepted → admins + coordinators, minus actor member',
  JSON.stringify(rc('engineering.accepted', 'mem1')) === JSON.stringify(['admin1', 'coord1']));
check('completed (verification requested) → admins + coordinators',
  JSON.stringify(rc('engineering.completed', 'mem1')) === JSON.stringify(['admin1', 'coord1']));
check('verified → working members + admins, minus verifier',
  JSON.stringify(rc('engineering.verified', 'coord1', { participantIds: ['mem1', 'mem2'] })) === JSON.stringify(['admin1', 'mem1', 'mem2']));
check('rejected → working members + coordinators, minus verifier',
  JSON.stringify(rc('engineering.rejected', 'coord1', { participantIds: ['mem1'] })) === JSON.stringify(['mem1']));
check('driver is never an Engineering recipient',
  !rc('engineering.published', 'admin1').includes('driver1'));

/* ── 3. Registry: every notifiable Engineering type is wired ───────────── */
console.log('\n[registry — notifiable + channels]');
const engTypes = ['published', 'accepted', 'joined', 'resumed', 'postponed', 'completed', 'verified', 'rejected', 'cancelled'].map((s) => `engineering.${s}`);
for (const t of engTypes) {
  const entry = getRegistryEntry(t);
  check(`${t} notifiable with in-app + push`, isNotifiable(t) && entry && entry.channels.includes('inApp') && entry.channels.includes('push'));
}
check('engineering.updated is NOT notifiable', !isNotifiable('engineering.updated'));
check('engineering.deleted is NOT notifiable', !isNotifiable('engineering.deleted'));

/* ── 4. Templates render Indonesian copy for every type ────────────────── */
console.log('\n[templates — copy renders]');
const sample = { title: 'Ganti Lampu', building: 'GOR', room: 'Lt 2' };
for (const t of engTypes) {
  const e = { type: t, actor: { displayName: 'Budi' }, payload: sample, entity: { kind: 'engineering', id: 'eng-1' } };
  const copy = render(t, e, { username: 'mem1' }, 'push');
  check(`${t} → title+body+deeplink`, !!copy && !!copy.title && !!copy.body && copy.data && copy.data.url.includes('engineering'));
}

/* ── 5. Canonical envelope validity (rides onEventWrite unchanged) ─────── */
console.log('\n[envelope — valid on the shared /events schema]');
const envelope = buildEnvelope({
  type: 'engineering.published',
  actor: { uid: 'admin1', role: 'admin', displayName: 'Admin' },
  entity: { kind: 'engineering', id: 'eng-1' },
  payload: buildEngineeringPayload(N('available', P(['b']))),
});
const v = validateEnvelope(envelope);
check('engineering envelope validates (entity.kind engineering accepted)', v.valid === true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
