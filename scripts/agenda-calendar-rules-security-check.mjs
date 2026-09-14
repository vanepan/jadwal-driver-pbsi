/* agenda-calendar-rules-security-check.mjs — V1.31.1 "Agenda, Kalender & To-Do"

   REAL Firebase Realtime Database emulator test of the new agendaCalendars /
   agendaCalendarsByUser / agendaCalendarsByScope rules added to
   database.rules.json this phase, PLUS the new 'deleted' ("Dihapus")
   soft-delete status transition added to agendaEvents / agendaTasks /
   agendaCalendars (no Rules change was needed for the latter — `status` has
   no enum .validate today, exactly as 'scheduled'/'cancelled' already
   aren't Rules-enforced — this suite proves that decision is actually
   correct in practice, not merely "the Rules don't reject it").

   Mirrors scripts/agenda-rules-security-check.mjs's own shape byte-for-byte
   (same synthetic identities, same initializeTestEnvironment/
   authenticatedContext/checkAsync convention) — deliberately a SEPARATE
   file rather than appended to that one, so the Phase C1 suite stays an
   unmodified, independently-rerunnable proof of what shipped in that phase.

   Run standalone:
     firebase emulators:exec --only database "node scripts/agenda-calendar-rules-security-check.mjs"
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
  projectId: 'demo-sarpras-agenda-calendar',
  database: { rules: rulesSource, host: '127.0.0.1', port: DB_PORT },
});

// ---- synthetic test identities only — never real production usernames ----
const dbAs = (uid, claims) => testEnv.authenticatedContext(uid, claims).database();
const asSarprasAdminA = () => dbAs('sarprasAdminA', { role: 'admin' });
const asKabid = () => dbAs('kabid', { role: 'kabid_test_role', agendaKabid: true });
const asOrdinaryParticipant = () => dbAs('ordinaryParticipant', { role: 'driver' });
const asPicParticipant = () => dbAs('picParticipant', { role: 'driver' });
const asUnrelatedUser = () => dbAs('unrelatedUser', { role: 'driver' });
const asAnon = () => testEnv.unauthenticatedContext().database();

const now = Date.now();
const DAY = 24 * 60 * 60 * 1000;

function sharedCalendarItem(overrides = {}) {
  return {
    id: 'calShared1', title: 'Evan - Sirnas C Piala Raja', scope: 'sarpras_shared',
    organizerUsername: 'sarprasAdminA', status: 'scheduled',
    startDate: '2026-09-15', endDate: '2026-09-20', allDay: true,
    startAt: now, endAt: now + 5 * DAY,
    participants: {
      ordinaryParticipant: { isPic: false, status: 'invited', invitedBy: 'sarprasAdminA', invitedAt: 'x' },
      picParticipant: { isPic: true, status: 'invited', invitedBy: 'sarprasAdminA', invitedAt: 'x' },
    },
    createdBy: 'sarprasAdminA', createdAt: 'x', updatedBy: 'sarprasAdminA', updatedAt: 'x',
    ...overrides,
  };
}
function kabidCalendarItem(overrides = {}) {
  return {
    id: 'calKabid1', title: 'Kunjungan Kabid', scope: 'kabid',
    organizerUsername: 'kabid', status: 'scheduled',
    startDate: '2026-09-14', endDate: '2026-09-14', allDay: false,
    startAt: now, endAt: now + 2 * 60 * 60 * 1000,
    participants: {
      ordinaryParticipant: { isPic: false, status: 'invited', invitedBy: 'kabid', invitedAt: 'x' },
      picParticipant: { isPic: true, status: 'invited', invitedBy: 'kabid', invitedAt: 'x' },
    },
    createdBy: 'kabid', createdAt: 'x', updatedBy: 'kabid', updatedAt: 'x',
    ...overrides,
  };
}
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
function sharedTask(overrides = {}) {
  return {
    id: 'taskShared1', title: 'Persiapan Rapat', scope: 'sarpras_shared',
    status: 'not_started', priority: 'normal',
    responsible: { picParticipant: { assignedBy: 'sarprasAdminA', assignedAt: 'x' } },
    createdBy: 'sarprasAdminA', createdAt: 'x', updatedBy: 'sarprasAdminA', updatedAt: 'x',
    ...overrides,
  };
}

try {
  await testEnv.clearDatabase();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.database();
    await db.ref('agendaCalendars/calShared1').set(sharedCalendarItem());
    await db.ref('agendaCalendars/calKabid1').set(kabidCalendarItem());
    await db.ref('agendaEvents/evtShared1').set(sharedEvent());
    await db.ref('agendaTasks/taskShared1').set(sharedTask());
    await db.ref('agendaAudit/calAudit1').set({
      id: 'calAudit1', action: 'created', entityType: 'agendaCalendar', entityId: 'calShared1',
      entityScope: 'sarpras_shared', actorUsername: 'sarprasAdminA', timestamp: now,
    });
    await db.ref('agendaAudit/calAuditKabid1').set({
      id: 'calAuditKabid1', action: 'created', entityType: 'agendaCalendar', entityId: 'calKabid1',
      entityScope: 'kabid', actorUsername: 'kabid', timestamp: now,
    });
    await db.ref('agendaCalendarsByUser/sarprasAdminA/calShared1').set(now);
    await db.ref('agendaCalendarsByScope/sarpras_shared/calShared1').set(now);
    await db.ref('agendaCalendarsByScope/kabid/calKabid1').set(now);
  });

  // ================================================================
  console.log('\n=== [C1] Shared-scope calendar item — READ/WRITE matrix ===');
  // ================================================================
  await checkAsync('Sarpras admin -> read shared calendar item ALLOWED',
    () => assertSucceeds(asSarprasAdminA().ref('agendaCalendars/calShared1').once('value')));
  await checkAsync('Sarpras admin -> write shared calendar item ALLOWED',
    () => assertSucceeds(asSarprasAdminA().ref('agendaCalendars/calShared1').update({ title: 'Updated', updatedBy: 'sarprasAdminA' })));
  await checkAsync('Ordinary participant -> read shared calendar item ALLOWED',
    () => assertSucceeds(asOrdinaryParticipant().ref('agendaCalendars/calShared1').once('value')));
  await checkAsync('Ordinary participant -> write shared calendar item DENIED',
    () => assertFails(asOrdinaryParticipant().ref('agendaCalendars/calShared1').update({ title: 'Hacked', updatedBy: 'ordinaryParticipant' })));
  await checkAsync('PIC participant -> write shared calendar item ALLOWED',
    () => assertSucceeds(asPicParticipant().ref('agendaCalendars/calShared1').update({ title: 'PIC edit', updatedBy: 'picParticipant' })));
  await checkAsync('Unrelated user -> read shared calendar item DENIED',
    () => assertFails(asUnrelatedUser().ref('agendaCalendars/calShared1').once('value')));
  await checkAsync('Unauthenticated -> read shared calendar item DENIED',
    () => assertFails(asAnon().ref('agendaCalendars/calShared1').once('value')));

  // ================================================================
  console.log('\n=== [C2] Kabid-scope calendar item — READ/WRITE matrix ===');
  // ================================================================
  await checkAsync('Kabid -> read own-scope calendar item ALLOWED',
    () => assertSucceeds(asKabid().ref('agendaCalendars/calKabid1').once('value')));
  await checkAsync('Kabid -> write own-scope calendar item ALLOWED',
    () => assertSucceeds(asKabid().ref('agendaCalendars/calKabid1').update({ title: 'Kabid edit', updatedBy: 'kabid' })));
  await checkAsync('Sarpras admin who is NOT a participant -> read Kabid calendar item DENIED (no blanket admin bypass on kabid scope)',
    () => assertFails(asSarprasAdminA().ref('agendaCalendars/calKabid1').once('value')));
  await checkAsync('Sarpras admin who is NOT a participant -> write Kabid calendar item DENIED',
    () => assertFails(asSarprasAdminA().ref('agendaCalendars/calKabid1').update({ title: 'Hacked', updatedBy: 'sarprasAdminA' })));
  await checkAsync('Cross-scope PIC participant (Sarpras user PIC on a Kabid item) -> write ALLOWED',
    () => assertSucceeds(asPicParticipant().ref('agendaCalendars/calKabid1').update({ title: 'PIC edit', updatedBy: 'picParticipant' })));
  await checkAsync('Unrelated user -> read Kabid calendar item DENIED',
    () => assertFails(asUnrelatedUser().ref('agendaCalendars/calKabid1').once('value')));

  // ================================================================
  console.log('\n=== [C3] Immutability — calendar item ===');
  // ================================================================
  await checkAsync('Organizer changing scope DENIED',
    () => assertFails(asSarprasAdminA().ref('agendaCalendars/calShared1').update({ scope: 'kabid', updatedBy: 'sarprasAdminA' })));
  await checkAsync('Organizer changing organizerUsername DENIED (scope-laundering guard)',
    () => assertFails(asSarprasAdminA().ref('agendaCalendars/calShared1').update({ organizerUsername: 'someoneElse', updatedBy: 'sarprasAdminA' })));
  await checkAsync('Admin changing createdBy DENIED',
    () => assertFails(asSarprasAdminA().ref('agendaCalendars/calShared1').update({ createdBy: 'someoneElse', updatedBy: 'sarprasAdminA' })));
  await checkAsync('Admin changing id DENIED (id must equal $calendarId, per .validate)',
    () => assertFails(asSarprasAdminA().ref('agendaCalendars/calShared1').update({ id: 'somethingElse', updatedBy: 'sarprasAdminA' })));

  // ================================================================
  console.log('\n=== [C4] Actor attribution — updatedBy must equal auth.uid ===');
  // ================================================================
  await checkAsync('Organizer sets updatedBy to someone else DENIED',
    () => assertFails(asSarprasAdminA().ref('agendaCalendars/calShared1').update({ title: 'x', updatedBy: 'someoneElse' })));
  await checkAsync('Kabid sets updatedBy to someone else DENIED',
    () => assertFails(asKabid().ref('agendaCalendars/calKabid1').update({ title: 'x', updatedBy: 'someoneElse' })));
  await checkAsync('Legitimate self-attributed write still succeeds (control case)',
    () => assertSucceeds(asSarprasAdminA().ref('agendaCalendars/calShared1').update({ title: 'legit', updatedBy: 'sarprasAdminA' })));

  // ================================================================
  console.log('\n=== [C5] Hard delete forbidden — calendar item ===');
  // ================================================================
  await checkAsync('Organizer attempts to delete (remove) the calendar item DENIED — newData.exists() required',
    () => assertFails(asSarprasAdminA().ref('agendaCalendars/calShared1').remove()));

  // ================================================================
  console.log('\n=== [C6] Derived-index attacks + read-scope — calendar ===');
  // ================================================================
  for (const [label, path_] of [
    ['agendaCalendarsByUser', 'agendaCalendarsByUser/sarprasAdminA/calShared1'],
    ['agendaCalendarsByScope', 'agendaCalendarsByScope/sarpras_shared/calShared1'],
  ]) {
    await checkAsync(`Sarpras admin: client write to ${label} DENIED (index is trigger-owned only)`,
      () => assertFails(asSarprasAdminA().ref(path_).set(now)));
  }
  await checkAsync('Sarpras admin -> read agendaCalendarsByScope/sarpras_shared ALLOWED',
    () => assertSucceeds(asSarprasAdminA().ref('agendaCalendarsByScope/sarpras_shared').once('value')));
  await checkAsync('Sarpras admin -> read agendaCalendarsByScope/kabid DENIED (no admin bypass on the kabid index leg)',
    () => assertFails(asSarprasAdminA().ref('agendaCalendarsByScope/kabid').once('value')));
  await checkAsync('Kabid -> read agendaCalendarsByScope/kabid ALLOWED',
    () => assertSucceeds(asKabid().ref('agendaCalendarsByScope/kabid').once('value')));
  await checkAsync('Kabid -> read agendaCalendarsByScope/sarpras_shared DENIED',
    () => assertFails(asKabid().ref('agendaCalendarsByScope/sarpras_shared').once('value')));
  await checkAsync("User A -> read User B's agendaCalendarsByUser index DENIED",
    () => assertFails(asSarprasAdminA().ref('agendaCalendarsByUser/someoneElse').once('value')));

  // ================================================================
  console.log('\n=== [C7] Self-RSVP — calendar item ===');
  // ================================================================
  await checkAsync('Ordinary participant -> set OWN status to accepted ALLOWED',
    () => assertSucceeds(asOrdinaryParticipant().ref('agendaCalendars/calShared1/participants/ordinaryParticipant').set(
      { isPic: false, status: 'accepted', invitedBy: 'sarprasAdminA', invitedAt: 'x' })));
  await checkAsync("Ordinary participant -> set SOMEONE ELSE's status DENIED",
    () => assertFails(asOrdinaryParticipant().ref('agendaCalendars/calShared1/participants/picParticipant').set(
      { isPic: true, status: 'accepted', invitedBy: 'sarprasAdminA', invitedAt: 'x' })));
  await checkAsync('Ordinary participant -> RSVP write that ALSO flips isPic to true DENIED',
    () => assertFails(asOrdinaryParticipant().ref('agendaCalendars/calShared1/participants/ordinaryParticipant').set(
      { isPic: true, status: 'accepted', invitedBy: 'sarprasAdminA', invitedAt: 'x' })));
  await checkAsync('Non-participant -> self-invite via the RSVP path DENIED',
    () => assertFails(asUnrelatedUser().ref('agendaCalendars/calShared1/participants/unrelatedUser').set(
      { isPic: false, status: 'accepted', invitedBy: 'unrelatedUser', invitedAt: 'x' })));

  // ================================================================
  console.log('\n=== [C8] Audit reuse — agendaAudit accepts entityType "agendaCalendar" with ZERO Rules changes ===');
  // ================================================================
  await checkAsync('Sarpras admin -> read shared-scope calendar audit row ALLOWED (generic agendaAudit rule, entityScope-keyed)',
    () => assertSucceeds(asSarprasAdminA().ref('agendaAudit/calAudit1').once('value')));
  await checkAsync('Kabid -> read kabid-scope calendar audit row ALLOWED',
    () => assertSucceeds(asKabid().ref('agendaAudit/calAuditKabid1').once('value')));
  await checkAsync('Sarpras admin -> read kabid-scope calendar audit row DENIED',
    () => assertFails(asSarprasAdminA().ref('agendaAudit/calAuditKabid1').once('value')));
  await checkAsync('Unrelated user -> read shared-scope calendar audit row DENIED',
    () => assertFails(asUnrelatedUser().ref('agendaAudit/calAudit1').once('value')));
  await checkAsync('Authenticated Sarpras admin: forge a calendar audit row DENIED (server-authoritative, no client writer)',
    () => assertFails(asSarprasAdminA().ref('agendaAudit/forgedCal').set({
      id: 'forgedCal', action: 'created', entityType: 'agendaCalendar', entityId: 'calShared1',
      entityScope: 'sarpras_shared', actorUsername: 'sarprasAdminA', timestamp: now,
    })));

  // ================================================================
  console.log('\n=== [D] Soft-delete ("Dihapus") — event / task / calendar item ===');
  // ================================================================
  await checkAsync('Organizer -> soft-delete (status:"deleted") the shared event ALLOWED',
    () => assertSucceeds(asSarprasAdminA().ref('agendaEvents/evtShared1').update({
      status: 'deleted', deletedBy: 'sarprasAdminA', deletedAt: 'x', deleteReason: null, updatedBy: 'sarprasAdminA',
    })));
  await checkAsync('...event still exists (soft, not hard, delete) and reads back with status "deleted"',
    async () => {
      const snap = await asSarprasAdminA().ref('agendaEvents/evtShared1/status').once('value');
      if (snap.val() !== 'deleted') throw new Error(`expected 'deleted', got '${snap.val()}'`);
    });
  await checkAsync('Hard delete (remove) of an already soft-deleted event is STILL DENIED',
    () => assertFails(asSarprasAdminA().ref('agendaEvents/evtShared1').remove()));
  await checkAsync('Unrelated user -> soft-delete someone else\'s task DENIED (delete is gated by the same write authorization as any other field)',
    () => assertFails(asUnrelatedUser().ref('agendaTasks/taskShared1').update({
      status: 'deleted', deletedBy: 'unrelatedUser', deletedAt: 'x', updatedBy: 'unrelatedUser',
    })));
  await checkAsync('Task creator -> soft-delete own task ALLOWED',
    () => assertSucceeds(asSarprasAdminA().ref('agendaTasks/taskShared1').update({
      status: 'deleted', deletedBy: 'sarprasAdminA', deletedAt: 'x', updatedBy: 'sarprasAdminA',
    })));
  await checkAsync('PIC -> soft-delete a shared calendar item ALLOWED',
    () => assertSucceeds(asPicParticipant().ref('agendaCalendars/calShared1').update({
      status: 'deleted', deletedBy: 'picParticipant', deletedAt: 'x', updatedBy: 'picParticipant',
    })));
  await checkAsync('Ordinary (non-PIC) participant -> soft-delete a calendar item DENIED (only organizer/PIC/scope-bypass may write the root)',
    () => assertFails(asOrdinaryParticipant().ref('agendaCalendars/calKabid1').update({
      status: 'deleted', deletedBy: 'ordinaryParticipant', deletedAt: 'x', updatedBy: 'ordinaryParticipant',
    })));
} finally {
  await testEnv.cleanup();
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
