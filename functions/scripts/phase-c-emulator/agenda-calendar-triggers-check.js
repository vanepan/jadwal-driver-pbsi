'use strict';

/* ============================================================
   agenda-calendar-triggers-check.js — V1.31.1 "Agenda, Kalender & To-Do"

   Functions-emulator integration test for the Calendar entity's own
   trigger triple (onAgendaCalendarWrite/IndexSync/ReminderSync), mirroring
   agenda-triggers-check.js's [1] EVENT section almost exactly — same
   `.run()` invocation pattern, same SCOPE BOUNDARY (this file proves
   TRIGGER correctness only; client READ/WRITE authorization is proven by
   scripts/agenda-calendar-rules-security-check.mjs).

   Calendar-specific differences exercised here, beyond a renamed entity:
     - the 'h1'/'ended' reminder-offset pair (not 'h1'/'overdue') — 'ended'
       is a neutral "period concluded" notice, never framed as overdue.
     - an ALL-DAY item gets NO 'h1' row at all (reminderPlan.js#
       planForCalendarItem omits it — no arbitrary midnight reminder).
     - the soft-delete ("Dihapus") transition, added in this same phase
       for events/tasks/calendar alike.

   Run standalone:
     firebase emulators:exec --only database "node functions/scripts/phase-c-emulator/agenda-calendar-triggers-check.js"
   Normally run via: npm run test:functions-emulator (exit 0 = pass) */

const { assertSafeEmulatorOrExit } = require('./_lib/safety-guard');

let pass = 0, fail = 0;
async function checkAsync(name, run) {
  try { await run(); pass++; console.log(`  ✓ ${name}`); }
  catch (err) { fail++; console.log(`  ✗ ${name} — ${err.stack || err.message}`); }
}

async function main() {
  await assertSafeEmulatorOrExit();

  const { makeChangeEvent } = require('./_lib/fixtures');
  const { onAgendaCalendarWrite } = require('../../src/agenda/onAgendaCalendarWrite');
  const { onAgendaCalendarIndexSync } = require('../../src/agenda/onAgendaCalendarIndexSync');
  const { onAgendaCalendarReminderSync } = require('../../src/agenda/onAgendaCalendarReminderSync');
  const { reminderTick } = require('../../src/reminders/tick');
  const { db } = require('../../src/config/admin');
  const { agendaReminderId, getReminder } = require('../../src/reminders/schedule');

  const cleanupPaths = new Set();
  const track = (p) => { cleanupPaths.add(p); return p; };

  async function auditRowsFor(entityId) {
    const snap = await db.ref('agendaAudit').orderByChild('entityId').equalTo(entityId).once('value');
    return Object.values(snap.val() || {});
  }
  async function eventsFor(entityId, type) {
    const snap = await db.ref('events').orderByChild('entity/id').equalTo(entityId).once('value');
    const all = Object.values(snap.val() || {});
    return type ? all.filter((e) => e.type === type) : all;
  }

  try {
    /* ============================================================
       [1] TIMED (non-all-day) calendar item — create, participant
       add/PIC/remove, cancel
       ============================================================ */
    const calId = 'phasec-cal-1';
    const T0 = new Date('2026-10-15T00:00:00.000Z').getTime();
    const startAt = T0 + 9 * 3600000;
    const endAt = T0 + 11 * 3600000;
    track(`agendaCalendars/${calId}`); track(`agendaCalendarsByUser/organizerA/${calId}`);
    track(`agendaCalendarsByScope/sarpras_shared/${calId}`);

    console.log('\n=== [1a] Timed calendar item creation -> audit + creation /events + user/scope index + h1 AND ended reminder rows ===');
    const created = {
      id: calId, title: 'Rapat Koordinasi', scope: 'sarpras_shared', organizerUsername: 'organizerA',
      status: 'scheduled', startDate: '2026-10-15', endDate: '2026-10-15', allDay: false,
      startAt, endAt, participants: {},
      createdBy: 'organizerA', createdAt: 'x', updatedBy: 'organizerA', updatedAt: 'x',
    };
    const createTime = new Date(T0 - 86400000).toISOString();
    await onAgendaCalendarWrite.run(makeChangeEvent({ params: { calendarId: calId }, before: null, after: created, time: createTime }));
    await onAgendaCalendarIndexSync.run(makeChangeEvent({ params: { calendarId: calId }, before: null, after: created, time: createTime }));
    await onAgendaCalendarReminderSync.run(makeChangeEvent({ params: { calendarId: calId }, before: null, after: created, time: createTime }));

    await checkAsync('exactly one audit row, action=created', async () => {
      const rows = await auditRowsFor(calId);
      if (rows.length !== 1 || rows[0].action !== 'created') throw new Error(`got ${JSON.stringify(rows)}`);
    });
    await checkAsync("audit row's entityType is 'agendaCalendar'", async () => {
      const rows = await auditRowsFor(calId);
      if (rows[0].entityType !== 'agendaCalendar') throw new Error(`got ${rows[0].entityType}`);
    });
    await checkAsync("a deterministic 'calendar.created' event exists in /events, id = calendar_created__<calId>", async () => {
      const snap = await db.ref(`events/calendar_created__${calId}`).once('value');
      if (!snap.exists() || snap.val().type !== 'calendar.created') throw new Error('missing or wrong type');
    });
    await checkAsync('organizer indexed under agendaCalendarsByUser with startAt as value', async () => {
      const v = (await db.ref(`agendaCalendarsByUser/organizerA/${calId}`).once('value')).val();
      if (v !== startAt) throw new Error(`got ${v}`);
    });
    await checkAsync('calendar item indexed under agendaCalendarsByScope/sarpras_shared', async () => {
      const v = (await db.ref(`agendaCalendarsByScope/sarpras_shared/${calId}`).once('value')).val();
      if (v !== startAt) throw new Error(`got ${v}`);
    });
    await checkAsync("an 'h1' reminder row exists (allDay=false), pending, fireAt = startAt - 1h", async () => {
      const row = await getReminder(agendaReminderId('agendaCalendar', calId, 'h1'));
      if (!row || row.status !== 'pending' || row.fireAt !== startAt - 3600000) throw new Error(`got ${JSON.stringify(row)}`);
    });
    await checkAsync("an 'ended' reminder row exists, pending, fireAt = endAt", async () => {
      const row = await getReminder(agendaReminderId('agendaCalendar', calId, 'ended'));
      if (!row || row.status !== 'pending' || row.fireAt !== endAt) throw new Error(`got ${JSON.stringify(row)}`);
    });
    track(`reminders/${agendaReminderId('agendaCalendar', calId, 'h1')}`);
    track(`reminders/${agendaReminderId('agendaCalendar', calId, 'ended')}`);
    track(`events/calendar_created__${calId}`);

    console.log('\n=== [1b] Add participant -> audit + index + participant_added /events targeted at the affected person ===');
    const withPic = { ...created, participants: { picB: { isPic: false, status: 'invited', invitedBy: 'organizerA', invitedAt: 'x' } }, updatedBy: 'organizerA', updatedAt: 'y' };
    const addTime = new Date(T0 - 86300000).toISOString();
    await onAgendaCalendarWrite.run(makeChangeEvent({ params: { calendarId: calId }, before: created, after: withPic, time: addTime }));
    await onAgendaCalendarIndexSync.run(makeChangeEvent({ params: { calendarId: calId }, before: created, after: withPic, time: addTime }));

    await checkAsync('audit row: action=participant_added, affectedUsername=picB', async () => {
      const rows = await auditRowsFor(calId);
      const row = rows.find((r) => r.action === 'participant_added');
      if (!row || row.affectedUsername !== 'picB') throw new Error(`got ${JSON.stringify(row)}`);
    });
    await checkAsync('picB now indexed under agendaCalendarsByUser', async () => {
      const v = (await db.ref(`agendaCalendarsByUser/picB/${calId}`).once('value')).val();
      if (v !== startAt) throw new Error(`got ${v}`);
    });
    await checkAsync("a deterministic 'calendar.participant_added' event exists targeting picB", async () => {
      const evs = await eventsFor(calId, 'calendar.participant_added');
      if (!evs.some((e) => e.payload.affectedUsername === 'picB')) throw new Error(`got ${JSON.stringify(evs)}`);
    });
    track(`agendaCalendarsByUser/picB/${calId}`);

    console.log('\n=== [1c] Mark picB as PIC -> generic \'updated\' audit, NO duplicate participant_added ===');
    const picMarked = { ...withPic, participants: { picB: { ...withPic.participants.picB, isPic: true } }, updatedBy: 'organizerA', updatedAt: 'z' };
    const picTime = new Date(T0 - 86200000).toISOString();
    await onAgendaCalendarWrite.run(makeChangeEvent({ params: { calendarId: calId }, before: withPic, after: picMarked, time: picTime }));
    await checkAsync("isPic-only flip produces an 'updated' audit row, NOT another participant_added", async () => {
      const rows = await auditRowsFor(calId);
      const addedCount = rows.filter((r) => r.action === 'participant_added').length;
      if (addedCount !== 1) throw new Error(`expected exactly 1 participant_added total, got ${addedCount}`);
    });

    console.log('\n=== [1d] Remove picB -> audit + index removed ===');
    const removed = { ...picMarked, participants: {}, updatedBy: 'organizerA', updatedAt: 'w' };
    const removeTime = new Date(T0 - 86100000).toISOString();
    await onAgendaCalendarWrite.run(makeChangeEvent({ params: { calendarId: calId }, before: picMarked, after: removed, time: removeTime }));
    await onAgendaCalendarIndexSync.run(makeChangeEvent({ params: { calendarId: calId }, before: picMarked, after: removed, time: removeTime }));

    await checkAsync('audit row: action=participant_removed, affectedUsername=picB', async () => {
      const rows = await auditRowsFor(calId);
      const row = rows.find((r) => r.action === 'participant_removed');
      if (!row || row.affectedUsername !== 'picB') throw new Error(`got ${JSON.stringify(row)}`);
    });
    await checkAsync('picB index entry removed from agendaCalendarsByUser', async () => {
      const snap = await db.ref(`agendaCalendarsByUser/picB/${calId}`).once('value');
      if (snap.exists()) throw new Error('expected the entry to be gone');
    });

    console.log('\n=== [1e] Cancel -> cancellation audit + reminders tombstoned + HISTORICAL INDEX ENTRIES REMAIN ===');
    const cancelled = { ...removed, status: 'cancelled', cancelledBy: 'organizerA', cancelledAt: 'c', cancelReason: 'Ruang tidak tersedia', updatedBy: 'organizerA', updatedAt: 'v' };
    const cancelTime = new Date(T0 - 86000000).toISOString();
    await onAgendaCalendarWrite.run(makeChangeEvent({ params: { calendarId: calId }, before: removed, after: cancelled, time: cancelTime }));
    await onAgendaCalendarIndexSync.run(makeChangeEvent({ params: { calendarId: calId }, before: removed, after: cancelled, time: cancelTime }));
    await onAgendaCalendarReminderSync.run(makeChangeEvent({ params: { calendarId: calId }, before: removed, after: cancelled, time: cancelTime }));

    await checkAsync("audit row: action=cancelled, note carries cancelReason", async () => {
      const rows = await auditRowsFor(calId);
      const row = rows.find((r) => r.action === 'cancelled');
      if (!row || row.note !== 'Ruang tidak tersedia') throw new Error(`got ${JSON.stringify(row)}`);
    });
    await checkAsync("BOTH reminder rows ('h1' and 'ended') tombstoned to cancelled", async () => {
      const h1 = await getReminder(agendaReminderId('agendaCalendar', calId, 'h1'));
      const ended = await getReminder(agendaReminderId('agendaCalendar', calId, 'ended'));
      if (h1.status !== 'cancelled' || ended.status !== 'cancelled') throw new Error(`got ${JSON.stringify({ h1, ended })}`);
    });
    await checkAsync('organizer STILL indexed under agendaCalendarsByUser after cancellation — historical accountability, index untouched by status changes', async () => {
      const v = (await db.ref(`agendaCalendarsByUser/organizerA/${calId}`).once('value')).val();
      if (v !== startAt) throw new Error(`expected the historical entry to remain, got ${v}`);
    });

    /* ============================================================
       [1f] Soft-delete ("Dihapus") — a SEPARATE item so it doesn't
       interact with [1e]'s cancel.
       ============================================================ */
    console.log('\n=== [1f] Soft-delete ("Dihapus") — dedicated audit action + reminders tombstoned ===');
    const delCalId = 'phasec-cal-delete-1';
    const delStartAt = T0 + 40 * 3600000;
    track(`agendaCalendars/${delCalId}`); track(`agendaCalendarsByUser/organizerA/${delCalId}`);
    track(`agendaCalendarsByScope/sarpras_shared/${delCalId}`);
    const delCreated = {
      id: delCalId, title: 'Kalender Uji Hapus', scope: 'sarpras_shared', organizerUsername: 'organizerA',
      status: 'scheduled', startDate: '2026-10-16', endDate: '2026-10-16', allDay: false,
      startAt: delStartAt, endAt: delStartAt + 2 * 3600000, participants: {},
      createdBy: 'organizerA', createdAt: 'x', updatedBy: 'organizerA', updatedAt: 'x',
    };
    const delCreateTime = new Date(T0 - 86400000).toISOString();
    await onAgendaCalendarWrite.run(makeChangeEvent({ params: { calendarId: delCalId }, before: null, after: delCreated, time: delCreateTime }));
    await onAgendaCalendarReminderSync.run(makeChangeEvent({ params: { calendarId: delCalId }, before: null, after: delCreated, time: delCreateTime }));
    track(`reminders/${agendaReminderId('agendaCalendar', delCalId, 'h1')}`);
    track(`reminders/${agendaReminderId('agendaCalendar', delCalId, 'ended')}`);
    track(`events/calendar_created__${delCalId}`);

    const delAfter = { ...delCreated, status: 'deleted', deletedBy: 'organizerA', deletedAt: 'd', deleteReason: 'Duplikat entri', updatedBy: 'organizerA', updatedAt: 'v' };
    const delTime = new Date(T0 - 86000000).toISOString();
    await onAgendaCalendarWrite.run(makeChangeEvent({ params: { calendarId: delCalId }, before: delCreated, after: delAfter, time: delTime }));
    await onAgendaCalendarReminderSync.run(makeChangeEvent({ params: { calendarId: delCalId }, before: delCreated, after: delAfter, time: delTime }));

    await checkAsync("audit row: action='deleted' (NOT generic 'status_changed'), note carries deleteReason", async () => {
      const rows = await auditRowsFor(delCalId);
      const row = rows.find((r) => r.action === 'deleted');
      if (!row || row.note !== 'Duplikat entri') throw new Error(`got ${JSON.stringify(rows)}`);
    });
    await checkAsync("no 'calendar.deleted' notification event is minted — deletion is audit-only, by construction", async () => {
      const evs = await eventsFor(delCalId, 'calendar.deleted');
      if (evs.length !== 0) throw new Error(`expected none, got ${JSON.stringify(evs)}`);
    });
    await checkAsync('BOTH reminder rows tombstoned to cancelled on delete', async () => {
      const h1 = await getReminder(agendaReminderId('agendaCalendar', delCalId, 'h1'));
      const ended = await getReminder(agendaReminderId('agendaCalendar', delCalId, 'ended'));
      if (h1.status !== 'cancelled' || ended.status !== 'cancelled') throw new Error(`got ${JSON.stringify({ h1, ended })}`);
    });

    /* ============================================================
       [2] ALL-DAY, MULTI-DAY calendar item — the Sirnas example. No 'h1'
       row at all (planForCalendarItem omits it for allDay=true).
       ============================================================ */
    console.log('\n=== [2] All-day, multi-day calendar item ("Evan - Sirnas C Piala Raja") — NO h1 row ===');
    const sirnasId = 'phasec-cal-sirnas';
    const sirnasStart = new Date('2026-09-15T00:00:00.000+07:00').getTime();
    const sirnasEnd = new Date('2026-09-20T23:59:00.000+07:00').getTime();
    track(`agendaCalendars/${sirnasId}`); track(`agendaCalendarsByUser/organizerA/${sirnasId}`);
    track(`agendaCalendarsByScope/sarpras_shared/${sirnasId}`);
    const sirnas = {
      id: sirnasId, title: 'Evan - Sirnas C Piala Raja', scope: 'sarpras_shared', organizerUsername: 'organizerA',
      status: 'scheduled', startDate: '2026-09-15', endDate: '2026-09-20', allDay: true,
      startAt: sirnasStart, endAt: sirnasEnd, participants: {},
      createdBy: 'organizerA', createdAt: 'x', updatedBy: 'organizerA', updatedAt: 'x',
    };
    const sirnasCreateTime = new Date(T0 - 86400000).toISOString();
    await onAgendaCalendarWrite.run(makeChangeEvent({ params: { calendarId: sirnasId }, before: null, after: sirnas, time: sirnasCreateTime }));
    await onAgendaCalendarReminderSync.run(makeChangeEvent({ params: { calendarId: sirnasId }, before: null, after: sirnas, time: sirnasCreateTime }));

    await checkAsync('NO h1 reminder row exists for an all-day item (no arbitrary midnight reminder)', async () => {
      const row = await getReminder(agendaReminderId('agendaCalendar', sirnasId, 'h1'));
      if (row) throw new Error(`expected no row, got ${JSON.stringify(row)}`);
    });
    await checkAsync("an 'ended' reminder row STILL exists, fireAt = endAt (end of the LAST day)", async () => {
      const row = await getReminder(agendaReminderId('agendaCalendar', sirnasId, 'ended'));
      if (!row || row.status !== 'pending' || row.fireAt !== sirnasEnd) throw new Error(`got ${JSON.stringify(row)}`);
    });
    track(`reminders/${agendaReminderId('agendaCalendar', sirnasId, 'ended')}`);
    track(`events/calendar_created__${sirnasId}`);

    /* ============================================================
       [3] REMINDER TICK — 'ended' branch. Fires against LIVE
       (re-validated) state, never framed as overdue.
       ============================================================ */
    console.log("\n=== [3] reminderTick — Calendar 'ended' branch ===");

    const endedId = 'phasec-cal-tick-ended';
    await db.ref(`agendaCalendars/${endedId}`).set({
      id: endedId, title: 'Tick Ended Test', scope: 'sarpras_shared', organizerUsername: 'organizerA',
      status: 'scheduled', startAt: Date.now() - 7200000, endAt: Date.now() - 3600000, participants: {},
    });
    track(`agendaCalendars/${endedId}`);
    const endedRowId = agendaReminderId('agendaCalendar', endedId, 'ended');
    await db.ref(`reminders/${endedRowId}`).set({ id: endedRowId, entityType: 'agendaCalendar', entityId: endedId, offset: 'ended', fireAt: Date.now() - 1000, status: 'pending', firedAt: null, eventId: null, updatedAt: 'x' });
    track(`reminders/${endedRowId}`);

    await checkAsync("a genuinely-ended, still-scheduled calendar item fires its 'ended' reminder as 'calendar.ended' (never 'calendar.overdue' — that type does not exist)", async () => {
      await reminderTick.run();
      const row = await getReminder(endedRowId);
      if (row.status !== 'fired') throw new Error(JSON.stringify(row));
      const snap = await db.ref(`events/agenda__agendaCalendar__${endedId}__ended`).once('value');
      if (!snap.exists() || snap.val().type !== 'calendar.ended') throw new Error('missing or wrong type');
    });
    track(`events/agenda__agendaCalendar__${endedId}__ended`);

    const cancelledTickId = 'phasec-cal-tick-cancelled';
    await db.ref(`agendaCalendars/${cancelledTickId}`).set({ id: cancelledTickId, status: 'cancelled', scope: 'sarpras_shared', startAt: Date.now() - 7200000, endAt: Date.now() - 3600000 });
    track(`agendaCalendars/${cancelledTickId}`);
    const cancelledEndedId = agendaReminderId('agendaCalendar', cancelledTickId, 'ended');
    await db.ref(`reminders/${cancelledEndedId}`).set({ id: cancelledEndedId, entityType: 'agendaCalendar', entityId: cancelledTickId, offset: 'ended', fireAt: Date.now() - 1000, status: 'pending', firedAt: null, eventId: null, updatedAt: 'x' });
    track(`reminders/${cancelledEndedId}`);
    await checkAsync("a CANCELLED calendar item's 'ended' row does not fire — re-validated live, not just scheduled-at-plan-time (isCalendarItemEnded requires status==='scheduled')", async () => {
      await reminderTick.run();
      const row = await getReminder(cancelledEndedId);
      if (row.status !== 'cancelled') throw new Error(`expected 'cancelled' (re-validated), got ${JSON.stringify(row)}`);
      const snap = await db.ref(`events/agenda__agendaCalendar__${cancelledTickId}__ended`).once('value');
      if (snap.exists()) throw new Error('should not have minted an ended event');
    });

    const deletedTickId = 'phasec-cal-tick-deleted';
    await db.ref(`agendaCalendars/${deletedTickId}`).set({ id: deletedTickId, status: 'deleted', scope: 'sarpras_shared', startAt: Date.now() + 3600000, endAt: Date.now() + 7200000 });
    track(`agendaCalendars/${deletedTickId}`);
    const deletedH1Id = agendaReminderId('agendaCalendar', deletedTickId, 'h1');
    await db.ref(`reminders/${deletedH1Id}`).set({ id: deletedH1Id, entityType: 'agendaCalendar', entityId: deletedTickId, offset: 'h1', fireAt: Date.now() - 1000, status: 'pending', firedAt: null, eventId: null, updatedAt: 'x' });
    track(`reminders/${deletedH1Id}`);
    await checkAsync("a soft-DELETED calendar item's due 'h1' row is cancelled, not fired (terminal-state check includes 'deleted')", async () => {
      await reminderTick.run();
      const row = await getReminder(deletedH1Id);
      if (row.status !== 'cancelled') throw new Error(JSON.stringify(row));
    });

    console.log('\n=== [3b] RETRY: replaying the same due row does not create a second /events entry ===');
    await db.ref(`reminders/${endedRowId}/status`).set('pending');
    await reminderTick.run();
    await checkAsync("replay: still exactly ONE 'calendar.ended' entry for this entity", async () => {
      const evs = await eventsFor(endedId, 'calendar.ended');
      if (evs.length !== 1) throw new Error(`expected exactly 1, got ${evs.length}`);
    });

    /* ============================================================
       [4] IDEMPOTENCY — replaying the SAME write event twice converges
       ============================================================ */
    console.log('\n=== [4] IDEMPOTENCY ===');
    const idCalId = 'phasec-cal-idempotency';
    track(`agendaCalendars/${idCalId}`); track(`agendaCalendarsByUser/organizerA/${idCalId}`);
    track(`agendaCalendarsByScope/sarpras_shared/${idCalId}`);
    const idStartAt = T0 + 20 * 3600000;
    const idCreated = {
      id: idCalId, title: 'Idempotency Probe', scope: 'sarpras_shared', organizerUsername: 'organizerA',
      status: 'scheduled', startAt: idStartAt, endAt: idStartAt + 3600000, participants: {},
      createdBy: 'organizerA', createdAt: 'x', updatedBy: 'organizerA', updatedAt: 'x',
    };
    const idTime = new Date(T0 - 86400000).toISOString();
    const idFixture = makeChangeEvent({ params: { calendarId: idCalId }, before: null, after: idCreated, time: idTime });

    await onAgendaCalendarWrite.run(idFixture);
    await onAgendaCalendarWrite.run(idFixture); // replay
    await checkAsync('audit trigger replay: still exactly ONE created row', async () => {
      const rows = await auditRowsFor(idCalId);
      if (rows.length !== 1) throw new Error(`got ${rows.length}: ${JSON.stringify(rows)}`);
    });
    await checkAsync("creation /events replay: still exactly ONE calendar.created entry", async () => {
      const evs = await eventsFor(idCalId, 'calendar.created');
      if (evs.length !== 1) throw new Error(`got ${evs.length}`);
    });

    await onAgendaCalendarReminderSync.run(idFixture);
    await onAgendaCalendarReminderSync.run(idFixture); // replay
    await checkAsync('reminder-sync trigger replay: still exactly one h1 row at the same id (deterministic key, upsert-in-place)', async () => {
      const row = await getReminder(agendaReminderId('agendaCalendar', idCalId, 'h1'));
      if (!row || row.fireAt !== idStartAt - 3600000) throw new Error(JSON.stringify(row));
    });
    track(`reminders/${agendaReminderId('agendaCalendar', idCalId, 'h1')}`);
    track(`reminders/${agendaReminderId('agendaCalendar', idCalId, 'ended')}`);
    track(`events/calendar_created__${idCalId}`);

    /* ============================================================
       [5] Kabid — TRIGGER half of the privacy proof (the READ/WRITE
       authorization half is scripts/agenda-calendar-rules-security-check.mjs)
       ============================================================ */
    console.log('\n=== [5] Kabid-scope calendar item — trigger correctness ===');
    const kabidCalId = 'phasec-cal-kabid';
    track(`agendaCalendars/${kabidCalId}`); track(`agendaCalendarsByUser/kabidUser/${kabidCalId}`);
    track(`agendaCalendarsByScope/kabid/${kabidCalId}`);
    const kabidCreated = {
      id: kabidCalId, title: 'Kunjungan Internal Kabid', scope: 'kabid', organizerUsername: 'kabidUser',
      status: 'scheduled', startAt: T0 + 30 * 3600000, endAt: T0 + 31 * 3600000, participants: {},
      createdBy: 'kabidUser', createdAt: 'x', updatedBy: 'kabidUser', updatedAt: 'x',
    };
    const kabidTime = new Date(T0 - 86400000).toISOString();
    await onAgendaCalendarWrite.run(makeChangeEvent({ params: { calendarId: kabidCalId }, before: null, after: kabidCreated, time: kabidTime }));
    await onAgendaCalendarIndexSync.run(makeChangeEvent({ params: { calendarId: kabidCalId }, before: null, after: kabidCreated, time: kabidTime }));

    await checkAsync("audit row's entityScope is 'kabid'", async () => {
      const rows = await auditRowsFor(kabidCalId);
      if (rows[0].entityScope !== 'kabid') throw new Error(`got ${rows[0].entityScope}`);
    });
    await checkAsync("the item is indexed under agendaCalendarsByScope/kabid, NOT sarpras_shared", async () => {
      const kabidVal = (await db.ref(`agendaCalendarsByScope/kabid/${kabidCalId}`).once('value')).val();
      const sharedVal = (await db.ref(`agendaCalendarsByScope/sarpras_shared/${kabidCalId}`).once('value')).val();
      if (kabidVal == null || sharedVal != null) throw new Error(`kabid=${kabidVal} shared=${sharedVal}`);
    });
    track(`events/calendar_created__${kabidCalId}`);
  } finally {
    for (const path of cleanupPaths) {
      try { await db.ref(path).remove(); } catch { /* best-effort cleanup */ }
    }
  }
}

main()
  .then(() => {
    console.log(`\n${pass} passed, ${fail} failed\n`);
    process.exit(fail === 0 ? 0 : 1);
  })
  .catch((err) => {
    console.error(`\n[agenda-calendar-triggers-check] FATAL: ${err.stack || err.message}\n`);
    process.exit(1);
  });
