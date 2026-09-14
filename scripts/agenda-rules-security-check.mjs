/* agenda-rules-security-check.mjs — V1.31 Agenda & To-Do, Phase C1

   REAL Firebase Realtime Database emulator test of the new agendaEvents /
   agendaTasks / agendaAudit / agendaEventsByUser / agendaEventsByScope /
   agendaTasksByUser / agendaTasksByScope rules added to database.rules.json
   in this phase. Mirrors this repo's existing RTDB Authorization Validation
   Suite convention (scripts/rtdb-emulator/*-check.mjs) — same
   initializeTestEnvironment/authenticatedContext/checkAsync shape — but is
   NOT wired into scripts/rtdb-emulator/suite-registry.mjs (out of this
   phase's allowed scope; that is a follow-up decision, not made here).

   `agendaKabid` is simulated directly as a mock custom claim on the test
   auth context (`{ role: 'kabid_test_role', agendaKabid: true }`) exactly
   the way this suite's own role-claim-rules-check.mjs simulates
   `adminEquivalent` on a synthetic 'fasilitas_super' role today — the Rules
   only ever see `auth.token.*`, so this exercises the real rule branch
   without touching verifyPin.js or minting anything in production (C2's
   job, still pending).

   Run standalone:
     firebase emulators:exec --only database "node scripts/agenda-rules-security-check.mjs"
   (Requires JAVA_HOME resolvable — see scripts/rtdb-emulator/run-with-emulator.mjs
   for the JDK-resolution logic this repo already established; this file
   assumes an already-running emulator invoked that way, exit 0 = pass.) */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rulesSource = readFileSync(path.join(ROOT, 'database.rules.json'), 'utf8');
const firebaseJson = JSON.parse(readFileSync(path.join(ROOT, 'firebase.json'), 'utf8'));
const DB_PORT = firebaseJson.emulators?.database?.port ?? 9000;

let pass = 0, fail = 0;
async function checkAsync(name, run) {
  try { await run(); pass++; console.log(`  ✓ ${name}`); }
  catch (err) { fail++; console.log(`  ✗ ${name} — ${err.message}`); }
}

const testEnv = await initializeTestEnvironment({
  projectId: 'demo-sarpras-agenda-c1',
  database: { rules: rulesSource, host: '127.0.0.1', port: DB_PORT },
});

// ---- synthetic test identities only — never real production usernames ----
const dbAs = (uid, claims) => testEnv.authenticatedContext(uid, claims).database();
const asSarprasAdminA = () => dbAs('sarprasAdminA', { role: 'admin' });
const asSarprasAdminB = () => dbAs('sarprasAdminB', { role: 'admin' });
const asSarprasAdminC = () => dbAs('sarprasAdminC', { role: 'admin' });
const asKabid = () => dbAs('kabid', { role: 'kabid_test_role', agendaKabid: true });
const asOrdinaryParticipant = () => dbAs('ordinaryParticipant', { role: 'driver' });
const asPicParticipant = () => dbAs('picParticipant', { role: 'driver' });
const asUnrelatedUser = () => dbAs('unrelatedUser', { role: 'driver' });
const asDriver = () => dbAs('genericDriver', { role: 'driver' });
const asBidang = () => dbAs('genericBidang', { role: 'bidang' });
const asViewer = () => dbAs('genericViewer', { role: 'viewer' });
const asAnon = () => testEnv.unauthenticatedContext().database();

const now = Date.now();

function sharedEvent(overrides = {}) {
  return {
    id: 'evtShared1', title: 'Rapat Koordinasi', scope: 'sarpras_shared',
    organizerUsername: 'sarprasAdminA', status: 'scheduled',
    participants: {
      ordinaryParticipant: { isPic: false, status: 'invited', invitedBy: 'sarprasAdminA', invitedAt: 'x' },
      picParticipant: { isPic: true, status: 'invited', invitedBy: 'sarprasAdminA', invitedAt: 'x' },
    },
    createdBy: 'sarprasAdminA', createdAt: 'x', updatedBy: 'sarprasAdminA', updatedAt: 'x',
    ...overrides,
  };
}
function kabidEvent(overrides = {}) {
  return {
    id: 'evtKabid1', title: 'Rapat Evaluasi Sarpras', scope: 'kabid',
    organizerUsername: 'kabid', status: 'scheduled',
    participants: {
      ordinaryParticipant: { isPic: false, status: 'invited', invitedBy: 'kabid', invitedAt: 'x' },
      picParticipant: { isPic: true, status: 'invited', invitedBy: 'kabid', invitedAt: 'x' },
    },
    createdBy: 'kabid', createdAt: 'x', updatedBy: 'kabid', updatedAt: 'x',
    ...overrides,
  };
}
function sharedTask(overrides = {}) {
  return {
    id: 'taskShared1', title: 'Persiapan Rapat', scope: 'sarpras_shared',
    status: 'not_started', priority: 'normal',
    responsible: { picParticipant: { assignedBy: 'sarprasAdminA', assignedAt: 'x' } },
    createdBy: 'sarprasAdminA', createdAt: 'x', updatedBy: 'sarprasAdminA', updatedAt: 'x',
    ...overrides,
  };
}
function kabidTask(overrides = {}) {
  return {
    id: 'taskKabid1', title: 'Review Anggaran', scope: 'kabid',
    status: 'not_started', priority: 'normal',
    responsible: { picParticipant: { assignedBy: 'kabid', assignedAt: 'x' } },
    createdBy: 'kabid', createdAt: 'x', updatedBy: 'kabid', updatedAt: 'x',
    ...overrides,
  };
}

try {
  await testEnv.clearDatabase();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.database();
    await db.ref('agendaEvents/evtShared1').set(sharedEvent());
    await db.ref('agendaEvents/evtKabid1').set(kabidEvent());
    await db.ref('agendaTasks/taskShared1').set(sharedTask());
    await db.ref('agendaTasks/taskKabid1').set(kabidTask());
    await db.ref('agendaAudit/existingAudit1').set({
      id: 'existingAudit1', action: 'created', entityType: 'agendaEvent', entityId: 'evtShared1',
      entityScope: 'sarpras_shared', actorUsername: 'sarprasAdminA', timestamp: now,
    });
    await db.ref('agendaEventsByUser/sarprasAdminA/evtShared1').set(now);
    await db.ref('agendaEventsByScope/sarpras_shared/evtShared1').set(now);
    await db.ref('agendaEventsByScope/kabid/evtKabid1').set(now);
  });

  // ================================================================
  console.log('\n=== [18a] Shared-scope event — READ/WRITE matrix ===');
  // ================================================================
  await checkAsync('Sarpras admin -> read shared event ALLOWED',
    () => assertSucceeds(asSarprasAdminA().ref('agendaEvents/evtShared1').once('value')));
  await checkAsync('Sarpras admin -> write shared event ALLOWED',
    () => assertSucceeds(asSarprasAdminA().ref('agendaEvents/evtShared1').update({ title: 'Updated', updatedBy: 'sarprasAdminA' })));
  await checkAsync('Ordinary participant (isPic false) -> read shared event ALLOWED',
    () => assertSucceeds(asOrdinaryParticipant().ref('agendaEvents/evtShared1').once('value')));
  await checkAsync('Ordinary participant -> write shared event DENIED',
    () => assertFails(asOrdinaryParticipant().ref('agendaEvents/evtShared1').update({ title: 'Hacked', updatedBy: 'ordinaryParticipant' })));
  await checkAsync('PIC participant -> read shared event ALLOWED',
    () => assertSucceeds(asPicParticipant().ref('agendaEvents/evtShared1').once('value')));
  await checkAsync('PIC participant -> write shared event ALLOWED',
    () => assertSucceeds(asPicParticipant().ref('agendaEvents/evtShared1').update({ title: 'PIC edit', updatedBy: 'picParticipant' })));
  await checkAsync('Unrelated user -> read shared event DENIED',
    () => assertFails(asUnrelatedUser().ref('agendaEvents/evtShared1').once('value')));
  await checkAsync('Unrelated user -> write shared event DENIED',
    () => assertFails(asUnrelatedUser().ref('agendaEvents/evtShared1').update({ title: 'Hacked', updatedBy: 'unrelatedUser' })));
  await checkAsync('Unauthenticated -> read shared event DENIED',
    () => assertFails(asAnon().ref('agendaEvents/evtShared1').once('value')));

  // ================================================================
  console.log('\n=== [18b] Kabid-scope event — READ/WRITE matrix ===');
  // ================================================================
  await checkAsync('Kabid -> read own-scope event ALLOWED',
    () => assertSucceeds(asKabid().ref('agendaEvents/evtKabid1').once('value')));
  await checkAsync('Kabid -> write own-scope event ALLOWED',
    () => assertSucceeds(asKabid().ref('agendaEvents/evtKabid1').update({ title: 'Kabid edit', updatedBy: 'kabid' })));
  await checkAsync('Sarpras admin who is NOT a participant -> read Kabid event DENIED (Case 4/5 — no blanket admin bypass on kabid scope)',
    () => assertFails(asSarprasAdminA().ref('agendaEvents/evtKabid1').once('value')));
  await checkAsync('Sarpras admin who is NOT a participant -> write Kabid event DENIED',
    () => assertFails(asSarprasAdminA().ref('agendaEvents/evtKabid1').update({ title: 'Hacked', updatedBy: 'sarprasAdminA' })));
  await checkAsync('Cross-scope ordinary participant (Sarpras user invited into Kabid event) -> read ALLOWED',
    () => assertSucceeds(asOrdinaryParticipant().ref('agendaEvents/evtKabid1').once('value')));
  await checkAsync('Cross-scope ordinary participant -> write DENIED (participant, not PIC)',
    () => assertFails(asOrdinaryParticipant().ref('agendaEvents/evtKabid1').update({ title: 'Hacked', updatedBy: 'ordinaryParticipant' })));
  await checkAsync('Cross-scope PIC participant -> read ALLOWED',
    () => assertSucceeds(asPicParticipant().ref('agendaEvents/evtKabid1').once('value')));
  await checkAsync('Cross-scope PIC participant -> write ALLOWED',
    () => assertSucceeds(asPicParticipant().ref('agendaEvents/evtKabid1').update({ title: 'PIC edit', updatedBy: 'picParticipant' })));
  await checkAsync('Unrelated user -> read Kabid event DENIED',
    () => assertFails(asUnrelatedUser().ref('agendaEvents/evtKabid1').once('value')));
  await checkAsync('Unrelated user -> write Kabid event DENIED',
    () => assertFails(asUnrelatedUser().ref('agendaEvents/evtKabid1').update({ title: 'Hacked', updatedBy: 'unrelatedUser' })));

  // ================================================================
  console.log('\n=== [19] Immutability — event ===');
  // ================================================================
  await checkAsync('Organizer changing scope DENIED',
    () => assertFails(asSarprasAdminA().ref('agendaEvents/evtShared1').update({ scope: 'kabid', updatedBy: 'sarprasAdminA' })));
  await checkAsync('Organizer changing organizerUsername DENIED (scope-laundering guard)',
    () => assertFails(asSarprasAdminA().ref('agendaEvents/evtShared1').update({ organizerUsername: 'sarprasAdminB', updatedBy: 'sarprasAdminA' })));
  await checkAsync('Admin changing createdBy DENIED',
    () => assertFails(asSarprasAdminA().ref('agendaEvents/evtShared1').update({ createdBy: 'sarprasAdminB', updatedBy: 'sarprasAdminA' })));
  await checkAsync('Admin changing id DENIED (id must equal $eventId, per .validate)',
    () => assertFails(asSarprasAdminA().ref('agendaEvents/evtShared1').update({ id: 'somethingElse', updatedBy: 'sarprasAdminA' })));

  console.log('\n=== [19] Immutability — task ===');
  await checkAsync('Creator changing task scope DENIED',
    () => assertFails(asSarprasAdminA().ref('agendaTasks/taskShared1').update({ scope: 'kabid', updatedBy: 'sarprasAdminA' })));
  await checkAsync('Creator changing task createdBy DENIED',
    () => assertFails(asSarprasAdminA().ref('agendaTasks/taskShared1').update({ createdBy: 'sarprasAdminB', updatedBy: 'sarprasAdminA' })));
  await checkAsync('Creator changing task id DENIED',
    () => assertFails(asSarprasAdminA().ref('agendaTasks/taskShared1').update({ id: 'somethingElse', updatedBy: 'sarprasAdminA' })));

  // ================================================================
  console.log('\n=== [20] Actor attribution — updatedBy must equal auth.uid, every branch ===');
  // ================================================================
  await checkAsync('Organizer sets updatedBy to someone else DENIED',
    () => assertFails(asSarprasAdminA().ref('agendaEvents/evtShared1').update({ title: 'x', updatedBy: 'sarprasAdminB' })));
  await checkAsync('Sarpras admin (scope-bypass branch) sets updatedBy to someone else DENIED',
    () => assertFails(asSarprasAdminB().ref('agendaEvents/evtShared1').update({ title: 'x', updatedBy: 'sarprasAdminA' })));
  await checkAsync('PIC sets updatedBy to someone else DENIED',
    () => assertFails(asPicParticipant().ref('agendaEvents/evtShared1').update({ title: 'x', updatedBy: 'sarprasAdminA' })));
  await checkAsync('Kabid sets updatedBy to someone else DENIED',
    () => assertFails(asKabid().ref('agendaEvents/evtKabid1').update({ title: 'x', updatedBy: 'sarprasAdminA' })));
  await checkAsync('Responsible task member sets updatedBy to someone else DENIED',
    () => assertFails(asPicParticipant().ref('agendaTasks/taskShared1').update({ title: 'x', updatedBy: 'sarprasAdminA' })));
  await checkAsync('Legitimate self-attributed write still succeeds (control case — the mechanism is not just always-deny)',
    () => assertSucceeds(asSarprasAdminA().ref('agendaEvents/evtShared1').update({ title: 'legit', updatedBy: 'sarprasAdminA' })));

  // ================================================================
  console.log('\n=== [9/18] Task authorization (mirrors event matrix, no participant concept) ===');
  // ================================================================
  await checkAsync('Task creator -> read/write shared task ALLOWED',
    () => assertSucceeds(asSarprasAdminA().ref('agendaTasks/taskShared1').update({ title: 'x', updatedBy: 'sarprasAdminA' })));
  await checkAsync('Responsible member -> read/write shared task ALLOWED',
    () => assertSucceeds(asPicParticipant().ref('agendaTasks/taskShared1').update({ status: 'in_progress', updatedBy: 'picParticipant' })));
  await checkAsync('Kabid -> read/write own-scope task ALLOWED',
    () => assertSucceeds(asKabid().ref('agendaTasks/taskKabid1').update({ title: 'x', updatedBy: 'kabid' })));
  await checkAsync('Sarpras admin (not creator/responsible) -> read Kabid task DENIED',
    () => assertFails(asSarprasAdminA().ref('agendaTasks/taskKabid1').once('value')));
  await checkAsync('Unrelated authenticated user -> read shared task DENIED (mere path reachability is not authorization)',
    () => assertFails(asUnrelatedUser().ref('agendaTasks/taskShared1').once('value')));
  await checkAsync('Unrelated authenticated user -> write shared task DENIED',
    () => assertFails(asUnrelatedUser().ref('agendaTasks/taskShared1').update({ title: 'Hacked', updatedBy: 'unrelatedUser' })));
  await checkAsync('driver/bidang/viewer roles with no relation to the task -> write DENIED',
    () => assertFails(asDriver().ref('agendaTasks/taskShared1').update({ title: 'Hacked', updatedBy: 'genericDriver' })));

  // ================================================================
  console.log('\n=== [8] Hard delete forbidden ===');
  // ================================================================
  await checkAsync('Organizer attempts to delete (remove) the event DENIED — newData.exists() required',
    () => assertFails(asSarprasAdminA().ref('agendaEvents/evtShared1').remove()));
  await checkAsync('Admin attempts to delete a task DENIED',
    () => assertFails(asSarprasAdminA().ref('agendaTasks/taskShared1').remove()));

  // ================================================================
  console.log('\n=== [21] Direct audit-attack tests ===');
  // ================================================================
  await checkAsync('Authenticated Sarpras admin: set /agendaAudit/fake DENIED',
    () => assertFails(asSarprasAdminA().ref('agendaAudit/fake').set({ id: 'fake', action: 'created' })));
  await checkAsync('Authenticated Sarpras admin: update /agendaAudit/fake DENIED',
    () => assertFails(asSarprasAdminA().ref('agendaAudit/fake').update({ action: 'created' })));
  await checkAsync('Authenticated Sarpras admin: delete an EXISTING audit row DENIED',
    () => assertFails(asSarprasAdminA().ref('agendaAudit/existingAudit1').remove()));
  await checkAsync('Forged audit row (impersonating another user, arbitrary action) DENIED',
    () => assertFails(asOrdinaryParticipant().ref('agendaAudit/forged').set({
      actorUsername: 'sarprasAdminA', entityId: 'evtShared1', entityScope: 'sarpras_shared', action: 'completed',
    })));
  await checkAsync('Kabid identity: set /agendaAudit/fake2 DENIED (server-authoritative — no role is exempt)',
    () => assertFails(asKabid().ref('agendaAudit/fake2').set({ id: 'fake2', action: 'created' })));
  await checkAsync('Sarpras admin -> read own-scope audit row ALLOWED (read path, unaffected by the write correction)',
    () => assertSucceeds(asSarprasAdminA().ref('agendaAudit/existingAudit1').once('value')));
  await checkAsync('Unrelated user -> read audit row DENIED',
    () => assertFails(asUnrelatedUser().ref('agendaAudit/existingAudit1').once('value')));

  // ================================================================
  console.log('\n=== [22] Derived-index attack + read-scope tests ===');
  // ================================================================
  for (const [label, path_] of [
    ['agendaEventsByUser', 'agendaEventsByUser/sarprasAdminA/evtShared1'],
    ['agendaEventsByScope', 'agendaEventsByScope/sarpras_shared/evtShared1'],
    ['agendaTasksByUser', 'agendaTasksByUser/sarprasAdminA/taskShared1'],
    ['agendaTasksByScope', 'agendaTasksByScope/sarpras_shared/taskShared1'],
  ]) {
    await checkAsync(`Sarpras admin: client write to ${label} DENIED (index is trigger-owned only)`,
      () => assertFails(asSarprasAdminA().ref(path_).set(now)));
    await checkAsync(`Kabid: client write to ${label} DENIED`,
      () => assertFails(asKabid().ref(path_).set(now)));
  }
  await checkAsync('Sarpras admin -> read agendaEventsByScope/sarpras_shared ALLOWED',
    () => assertSucceeds(asSarprasAdminA().ref('agendaEventsByScope/sarpras_shared').once('value')));
  await checkAsync('Sarpras admin -> read agendaEventsByScope/kabid DENIED (no admin bypass on the kabid index leg)',
    () => assertFails(asSarprasAdminA().ref('agendaEventsByScope/kabid').once('value')));
  await checkAsync('Kabid -> read agendaEventsByScope/kabid ALLOWED',
    () => assertSucceeds(asKabid().ref('agendaEventsByScope/kabid').once('value')));
  await checkAsync('Kabid -> read agendaEventsByScope/sarpras_shared DENIED',
    () => assertFails(asKabid().ref('agendaEventsByScope/sarpras_shared').once('value')));
  await checkAsync("User A -> read own agendaEventsByUser/sarprasAdminA index ALLOWED",
    () => assertSucceeds(asSarprasAdminA().ref('agendaEventsByUser/sarprasAdminA').once('value')));
  await checkAsync("User A -> read User B's agendaEventsByUser/sarprasAdminB index DENIED (no admin bypass here either — Phase B §2.6)",
    () => assertFails(asSarprasAdminA().ref('agendaEventsByUser/sarprasAdminB').once('value')));

  // ================================================================
  console.log('\n=== [23] Multi-path / rule-cascade — cannot piggyback an unauthorized write on a legitimate one ===');
  // ================================================================
  await checkAsync('Legitimate event-only write in isolation succeeds (control case, isolates the next test)',
    () => assertSucceeds(asSarprasAdminA().ref().update({
      'agendaEvents/evtShared1/title': 'solo update legit',
      'agendaEvents/evtShared1/updatedBy': 'sarprasAdminA',
    })));
  await checkAsync('Combined multi-location update (valid event write + forged agendaAudit + forged index write in ONE call) DENIED in full — the illegitimate paths sink the whole atomic write, they do not get silently dropped while the event part succeeds',
    () => assertFails(asSarprasAdminA().ref().update({
      'agendaEvents/evtShared1/title': 'piggyback attempt',
      'agendaEvents/evtShared1/updatedBy': 'sarprasAdminA',
      'agendaAudit/piggybackForged/action': 'completed',
      'agendaEventsByUser/sarprasAdminA/evtShared1': now + 1,
    })));
  await checkAsync('...and confirm the piggyback truly did not partially land: title is still what the LAST successful legitimate write set it to',
    async () => {
      const snap = await asSarprasAdminA().ref('agendaEvents/evtShared1/title').once('value');
      if (snap.val() !== 'solo update legit') throw new Error(`expected 'solo update legit', got '${snap.val()}'`);
    });

  // ================================================================
  console.log('\n=== [24] Self-RSVP (Phase C3.1) — narrow participants/$uid grant ===');
  // ================================================================
  await checkAsync('Ordinary participant -> set OWN status to accepted (isPic/invitedBy/invitedAt unchanged) ALLOWED',
    () => assertSucceeds(asOrdinaryParticipant().ref('agendaEvents/evtShared1/participants/ordinaryParticipant').set(
      { isPic: false, status: 'accepted', invitedBy: 'sarprasAdminA', invitedAt: 'x' })));
  await checkAsync('Ordinary participant -> set OWN status to tentative via a narrower leaf-only write (…/status only, not the whole entry) ALLOWED — proves the ancestor equality-lock still evaluates against the correctly-merged resulting object',
    () => assertSucceeds(asOrdinaryParticipant().ref('agendaEvents/evtShared1/participants/ordinaryParticipant/status').set('tentative')));
  await checkAsync("Ordinary participant -> set SOMEONE ELSE's status (picParticipant) DENIED",
    () => assertFails(asOrdinaryParticipant().ref('agendaEvents/evtShared1/participants/picParticipant').set(
      { isPic: true, status: 'accepted', invitedBy: 'sarprasAdminA', invitedAt: 'x' })));
  await checkAsync('Ordinary participant -> RSVP write that ALSO flips isPic to true DENIED (isPic equality-locked)',
    () => assertFails(asOrdinaryParticipant().ref('agendaEvents/evtShared1/participants/ordinaryParticipant').set(
      { isPic: true, status: 'accepted', invitedBy: 'sarprasAdminA', invitedAt: 'x' })));
  await checkAsync('Ordinary participant -> RSVP write that ALSO changes invitedBy DENIED (invitedBy equality-locked)',
    () => assertFails(asOrdinaryParticipant().ref('agendaEvents/evtShared1/participants/ordinaryParticipant').set(
      { isPic: false, status: 'accepted', invitedBy: 'ordinaryParticipant', invitedAt: 'x' })));
  await checkAsync('Ordinary participant -> RSVP write that ALSO changes invitedAt DENIED (invitedAt equality-locked)',
    () => assertFails(asOrdinaryParticipant().ref('agendaEvents/evtShared1/participants/ordinaryParticipant').set(
      { isPic: false, status: 'accepted', invitedBy: 'sarprasAdminA', invitedAt: 'somethingElse' })));
  await checkAsync("Ordinary participant -> revert own status back to 'invited' DENIED (not one of the 3 RSVP outcomes this grant offers)",
    () => assertFails(asOrdinaryParticipant().ref('agendaEvents/evtShared1/participants/ordinaryParticipant').set(
      { isPic: false, status: 'invited', invitedBy: 'sarprasAdminA', invitedAt: 'x' })));
  await checkAsync('Ordinary participant -> out-of-vocabulary status value DENIED',
    () => assertFails(asOrdinaryParticipant().ref('agendaEvents/evtShared1/participants/ordinaryParticipant').set(
      { isPic: false, status: 'maybe_later', invitedBy: 'sarprasAdminA', invitedAt: 'x' })));
  await checkAsync('Non-participant (unrelatedUser, absent from participants map) -> self-invite via the RSVP path DENIED (data.exists() required)',
    () => assertFails(asUnrelatedUser().ref('agendaEvents/evtShared1/participants/unrelatedUser').set(
      { isPic: false, status: 'accepted', invitedBy: 'unrelatedUser', invitedAt: 'x' })));
  await checkAsync('PIC participant -> RSVP their OWN status too (the grant is not restricted to non-PIC participants) ALLOWED',
    () => assertSucceeds(asPicParticipant().ref('agendaEvents/evtShared1/participants/picParticipant').set(
      { isPic: true, status: 'declined', invitedBy: 'sarprasAdminA', invitedAt: 'x' })));
  await checkAsync('Cross-scope ordinary participant -> RSVP own status on a Kabid event ALLOWED (grant is scope-agnostic, same as read)',
    () => assertSucceeds(asOrdinaryParticipant().ref('agendaEvents/evtKabid1/participants/ordinaryParticipant').set(
      { isPic: false, status: 'accepted', invitedBy: 'kabid', invitedAt: 'x' })));
  await checkAsync('Unauthenticated -> RSVP write DENIED',
    () => assertFails(asAnon().ref('agendaEvents/evtShared1/participants/ordinaryParticipant').set(
      { isPic: false, status: 'accepted', invitedBy: 'sarprasAdminA', invitedAt: 'x' })));

  await checkAsync('Combined multi-location update (legit RSVP status leaf + forged title/updatedBy in ONE call) DENIED in full — RSVP cannot be used to piggyback an event-field change',
    () => assertFails(asOrdinaryParticipant().ref().update({
      'agendaEvents/evtShared1/participants/ordinaryParticipant/status': 'accepted',
      'agendaEvents/evtShared1/title': 'piggyback via rsvp path',
      'agendaEvents/evtShared1/updatedBy': 'ordinaryParticipant',
    })));
  await checkAsync('...and confirm that denied piggyback did not partially land: title is unchanged',
    async () => {
      const snap = await asSarprasAdminA().ref('agendaEvents/evtShared1/title').once('value');
      if (snap.val() !== 'solo update legit') throw new Error(`expected 'solo update legit', got '${snap.val()}'`);
    });
  await checkAsync('...and confirm the OTHER participant (picParticipant) and organizer/scope are untouched by any RSVP write above',
    async () => {
      const snap = await asSarprasAdminA().ref('agendaEvents/evtShared1').once('value');
      const v = snap.val();
      if (v.organizerUsername !== 'sarprasAdminA') throw new Error(`organizerUsername mutated: ${v.organizerUsername}`);
      if (v.scope !== 'sarpras_shared') throw new Error(`scope mutated: ${v.scope}`);
      if (v.participants.picParticipant.isPic !== true) throw new Error('picParticipant.isPic was mutated by an ordinary participant RSVP write');
    });
} finally {
  await testEnv.cleanup();
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
