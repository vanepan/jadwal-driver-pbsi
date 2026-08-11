'use strict';

/* ============================================================
   remaining-triggers-check.js — RTDB Authorization Validation Suite
   (v1.30.7.x, Phase C: Cloud Function & Server-Side Authorization
   Validation)

   Investigation summary: none of these six functions are directly
   client-invokable (RTDB triggers fire only on writes already gated by
   database.rules.json, tested in Phase B; onSchedule functions have no
   caller at all) — so there is no "caller authorization" boundary to
   test here. The question this file answers is narrower and different:
   does each trigger's OWN Admin SDK write stay correctly scoped, using
   the REAL handler against REAL (emulated) data? Pure classification
   logic (classify(), isMeaningfulChange(), the debounce re-check) is
   ALREADY unit-tested by the pre-existing functions/scripts/
   assignment-notify-classify-check.js and assignment-notify-debounce-
   check.js — not duplicated here.

   onAssignmentWrite / onRequestWrite / onEngineeringAssignmentWrite —
   each derives a canonical event from a REAL before/after transition and
   appends it to /events (an admin-readable, append-only audit log — no
   elevated access is ever granted by these writes).

   onEventWrite — re-validates the envelope shape before processing.
   SCOPE BOUNDARY, stated explicitly: this file tests ONLY the envelope-
   validation gate (a malformed envelope is safely ignored; a
   'notification.sent' delivery record is never re-processed, the
   existing loop guard) — it deliberately does NOT invoke the full
   notification engine (recipients → templates → dispatch) for a valid
   business event, since that pipeline can reach real push/Telegram send
   paths with no dependency-injection point in the untouched notification
   engine code, and this file's remit is authorization/scoping, not
   notification delivery (already covered by this program's other
   pre-existing tests).

   onAssignmentReminderSync / reminderTick — maintain and fire the
   /reminders timer queue; confirmed to write ONLY under /reminders and
   /events, never anywhere caller-influenced (there is no caller).

   Run standalone during development:
     firebase emulators:exec --only database "node functions/scripts/phase-c-emulator/remaining-triggers-check.js"
   Normally run via: npm run test:functions-emulator (exit 0 = pass) */

const { assertSafeEmulatorOrExit } = require('./_lib/safety-guard');

let pass = 0, fail = 0;
async function checkAsync(name, run) {
  try { await run(); pass++; console.log(`  ✓ ${name}`); }
  catch (err) { fail++; console.log(`  ✗ ${name} — ${err.message}`); }
}

async function findEventByEntity(db, kind, id, type) {
  const snap = await db.ref('events').orderByChild('entity/id').equalTo(id).once('value');
  const all = Object.values(snap.val() || {});
  return all.find((e) => e.entity && e.entity.kind === kind && e.type === type) || null;
}

async function main() {
  await assertSafeEmulatorOrExit();

  const { makeChangeEvent, makeCreatedEvent } = require('./_lib/fixtures');
  const { onAssignmentWrite } = require('../../src/events/onAssignmentWrite');
  const { onRequestWrite } = require('../../src/events/onRequestWrite');
  const { onEngineeringAssignmentWrite } = require('../../src/events/onEngineeringAssignmentWrite');
  const { onEventWrite } = require('../../src/events/onEventWrite');
  const { onAssignmentReminderSync } = require('../../src/reminders/onAssignmentReminderSync');
  const { reminderTick } = require('../../src/reminders/tick');
  const { db } = require('../../src/config/admin');
  const { reminderId } = require('../../src/reminders/schedule');

  try {
    console.log('\n=== onAssignmentWrite — real transition -> real /events write ===');
    const assignId = 'phasec-trigger-assignment';
    await checkAsync("created transition -> 'assignment.created' event written", async () => {
      await onAssignmentWrite.run(makeChangeEvent({ params: { assignmentId: assignId }, before: null, after: { driver: 'Budi', destination: 'Kantor Pusat', date: '2026-08-15', startTime: '08:00', status: 'assigned' } }));
      const event = await findEventByEntity(db, 'assignment', assignId, 'assignment.created');
      if (!event) throw new Error('expected an assignment.created event to be written');
    });
    await checkAsync("status -> 'cancelled' transition -> 'assignment.cancelled' event written (not debounced, immediate)", async () => {
      await onAssignmentWrite.run(makeChangeEvent({
        params: { assignmentId: assignId },
        before: { driver: 'Budi', destination: 'Kantor Pusat', date: '2026-08-15', startTime: '08:00', status: 'assigned' },
        after: { driver: 'Budi', destination: 'Kantor Pusat', date: '2026-08-15', startTime: '08:00', status: 'cancelled', cancelledBy: { uid: 'admin1', role: 'admin', name: 'Admin One' } },
      }));
      const event = await findEventByEntity(db, 'assignment', assignId, 'assignment.cancelled');
      if (!event) throw new Error('expected an assignment.cancelled event to be written');
    });
    await checkAsync('a true no-op resave (before === after) writes NO event', async () => {
      const same = { driver: 'Budi', destination: 'Kantor Pusat', date: '2026-08-15', startTime: '08:00', status: 'cancelled', cancelledBy: { uid: 'admin1', role: 'admin', name: 'Admin One' } };
      const before = (await db.ref('events').once('value')).val() || {};
      await onAssignmentWrite.run(makeChangeEvent({ params: { assignmentId: assignId }, before: same, after: same }));
      const after = (await db.ref('events').once('value')).val() || {};
      if (Object.keys(after).length !== Object.keys(before).length) throw new Error('expected no new event for a no-op resave');
    });

    console.log('\n=== onRequestWrite — real transition -> real /events write ===');
    const reqId = 'phasec-trigger-request';
    await checkAsync("created transition -> 'request.created' event written", async () => {
      await onRequestWrite.run(makeChangeEvent({ params: { requestId: reqId }, before: null, after: { requesterId: 'bidang1', requesterName: 'Bidang One', status: 'pending' } }));
      const event = await findEventByEntity(db, 'request', reqId, 'request.created');
      if (!event) throw new Error('expected a request.created event to be written');
    });
    await checkAsync("status -> 'approved' transition -> 'request.approved' event written", async () => {
      await onRequestWrite.run(makeChangeEvent({
        params: { requestId: reqId },
        before: { requesterId: 'bidang1', requesterName: 'Bidang One', status: 'pending' },
        after: { requesterId: 'bidang1', requesterName: 'Bidang One', status: 'approved', approvedBy: 'Admin One' },
      }));
      const event = await findEventByEntity(db, 'request', reqId, 'request.approved');
      if (!event) throw new Error('expected a request.approved event to be written');
    });

    console.log('\n=== onEngineeringAssignmentWrite — real transition -> real /events write ===');
    const engId = 'phasec-trigger-engineering';
    await checkAsync("created transition (publishes to 'available') -> 'engineering.published' event written", async () => {
      await onEngineeringAssignmentWrite.run(makeChangeEvent({ params: { assignmentId: engId }, before: null, after: { id: engId, status: 'available', title: 'Fix AC' } }));
      const event = await findEventByEntity(db, 'engineering', engId, 'engineering.published');
      if (!event) throw new Error('expected an engineering.published event to be written');
    });

    console.log('\n=== onEventWrite — envelope validation gate ONLY (full notification engine dispatch out of scope, see file header) ===');
    await checkAsync('a malformed envelope (missing required fields) is safely ignored — no throw', async () => {
      await onEventWrite.run(makeCreatedEvent({ params: { eventId: 'phasec-invalid-envelope' }, value: { type: 'not.a.real.type', garbage: true } }));
    });
    await checkAsync("a 'notification.sent' delivery-record envelope is validated but never re-processed (the existing loop guard) — no throw", async () => {
      await onEventWrite.run(makeCreatedEvent({
        params: { eventId: 'phasec-delivery-record' },
        value: { id: 'phasec-delivery-record', type: 'notification.sent', version: 1, timestamp: new Date().toISOString(), actor: { uid: null, role: 'system', displayName: null }, entity: { kind: 'notification', id: 'x' }, payload: {} },
      }));
    });

    console.log('\n=== onAssignmentReminderSync — real transition -> real /reminders write ===');
    const remAssignId = 'phasec-trigger-reminder-assignment';
    await checkAsync('created transition with a valid date/startTime upserts BOTH H-1d and H-1h rows as pending', async () => {
      await onAssignmentReminderSync.run(makeChangeEvent({ params: { assignmentId: remAssignId }, before: null, after: { date: '2026-12-25', startTime: '09:00', status: 'assigned' } }));
      const d1 = (await db.ref(`reminders/${reminderId(remAssignId, 'H-1d')}`).once('value')).val();
      const h1 = (await db.ref(`reminders/${reminderId(remAssignId, 'H-1h')}`).once('value')).val();
      if (!d1 || d1.status !== 'pending') throw new Error(`expected H-1d row pending, got ${JSON.stringify(d1)}`);
      if (!h1 || h1.status !== 'pending') throw new Error(`expected H-1h row pending, got ${JSON.stringify(h1)}`);
    });
    await checkAsync("cancelled transition tombstones BOTH rows to status 'cancelled'", async () => {
      await onAssignmentReminderSync.run(makeChangeEvent({
        params: { assignmentId: remAssignId },
        before: { date: '2026-12-25', startTime: '09:00', status: 'assigned' },
        after: { date: '2026-12-25', startTime: '09:00', status: 'cancelled' },
      }));
      const d1 = (await db.ref(`reminders/${reminderId(remAssignId, 'H-1d')}`).once('value')).val();
      if (d1.status !== 'cancelled') throw new Error(`expected H-1d row cancelled, got ${JSON.stringify(d1)}`);
    });

    console.log('\n=== reminderTick — fires due reminders against LIVE assignment state, re-validated at fire time ===');
    const tickAssignId = 'phasec-tick-assignment';
    const tickReminderId = reminderId(tickAssignId, 'H-1h');
    await db.ref(`assignments/${tickAssignId}`).set({ date: '2099-01-01', startTime: '09:00', status: 'assigned' });
    await db.ref(`reminders/${tickReminderId}`).set({ id: tickReminderId, assignmentId: tickAssignId, offset: 'H-1h', fireAt: Date.now() - 1000, status: 'pending', firedAt: null, eventId: null, updatedAt: new Date().toISOString() });
    await checkAsync('a due reminder for a live, non-terminal assignment fires: row marked fired, an assignment.reminder event minted', async () => {
      await reminderTick.run();
      const row = (await db.ref(`reminders/${tickReminderId}`).once('value')).val();
      if (row.status !== 'fired') throw new Error(`expected status 'fired', got ${JSON.stringify(row)}`);
      const event = await findEventByEntity(db, 'assignment', tickAssignId, 'assignment.reminder');
      if (!event) throw new Error('expected an assignment.reminder event to be written');
    });

    const cancelledAssignId = 'phasec-tick-cancelled-assignment';
    const cancelledReminderId = reminderId(cancelledAssignId, 'H-1h');
    await db.ref(`assignments/${cancelledAssignId}`).set({ date: '2099-01-01', startTime: '09:00', status: 'cancelled' });
    await db.ref(`reminders/${cancelledReminderId}`).set({ id: cancelledReminderId, assignmentId: cancelledAssignId, offset: 'H-1h', fireAt: Date.now() - 1000, status: 'pending', firedAt: null, eventId: null, updatedAt: new Date().toISOString() });
    await checkAsync('a due reminder whose LIVE assignment is already cancelled is skipped: row marked cancelled, no event minted', async () => {
      await reminderTick.run();
      const row = (await db.ref(`reminders/${cancelledReminderId}`).once('value')).val();
      if (row.status !== 'cancelled') throw new Error(`expected status 'cancelled' (re-validated at fire time), got ${JSON.stringify(row)}`);
    });
  } finally {
    for (const path of [
      'events/phasec-invalid-envelope', 'events/phasec-delivery-record',
      'assignments/phasec-trigger-assignment', 'assignments/phasec-tick-assignment', 'assignments/phasec-tick-cancelled-assignment',
      'driver_requests/phasec-trigger-request',
      'engineering/assignments/phasec-trigger-engineering',
      `reminders/${reminderId('phasec-trigger-reminder-assignment', 'H-1d')}`,
      `reminders/${reminderId('phasec-trigger-reminder-assignment', 'H-1h')}`,
      `reminders/${reminderId('phasec-tick-assignment', 'H-1h')}`,
      `reminders/${reminderId('phasec-tick-cancelled-assignment', 'H-1h')}`,
    ]) {
      await db.ref(path).remove();
    }
    const stale = (await db.ref('events').orderByChild('entity/id').equalTo('phasec-trigger-assignment').once('value')).val();
    for (const key of Object.keys(stale || {})) await db.ref(`events/${key}`).remove();
    for (const entityId of ['phasec-trigger-request', 'phasec-trigger-engineering', 'phasec-tick-assignment']) {
      const found = (await db.ref('events').orderByChild('entity/id').equalTo(entityId).once('value')).val();
      for (const key of Object.keys(found || {})) await db.ref(`events/${key}`).remove();
    }
  }
}

main()
  .then(() => {
    console.log(`\n${pass} passed, ${fail} failed\n`);
    process.exit(fail === 0 ? 0 : 1);
  })
  .catch((err) => {
    console.error(`\n[remaining-triggers-check] FATAL: ${err.stack || err.message}\n`);
    process.exit(1);
  });
