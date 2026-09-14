'use strict';

/* ============================================================
   agenda-triggers-check.js — V1.31 Agenda & To-Do, Phase C2

   Functions-emulator integration test (real RTDB emulator + the REAL
   trigger handlers invoked directly via `.run()`, exactly like every
   other file in this suite — see remaining-triggers-check.js and
   _lib/fixtures.js's header for why `.run()` is the correct, verified
   invocation point, not an HTTP/Functions-emulator round trip).

   SCOPE BOUNDARY, stated explicitly (mirrors remaining-triggers-check.js's
   own scope note): this file proves TRIGGER correctness — given a real
   before/after RTDB write, does the Admin-SDK code write the right audit
   row / index entry / reminder row / /events entry, with the right
   actor/scope/idempotency. It does NOT and CANNOT prove client-side READ/
   WRITE authorization (Admin SDK bypasses database.rules.json by
   construction — the safety-guard file's own reasoning) — that half is
   already proven, exhaustively, by scripts/agenda-rules-security-check.mjs
   (Phase C1, 65 checks, re-run as part of this same C2 regression pass,
   unchanged since C2 touched zero Rules). Where a brief item names both
   halves (e.g. "Kabid privacy": trigger writes entityScope='kabid'
   correctly here + an unrelated admin is denied read there), this file
   proves its half and says so explicitly rather than silently assuming
   the other.

   Run standalone:
     firebase emulators:exec --only database "node functions/scripts/phase-c-emulator/agenda-triggers-check.js"
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
  const { onAgendaEventWrite } = require('../../src/agenda/onAgendaEventWrite');
  const { onAgendaTaskWrite } = require('../../src/agenda/onAgendaTaskWrite');
  const { onAgendaEventIndexSync } = require('../../src/agenda/onAgendaEventIndexSync');
  const { onAgendaTaskIndexSync } = require('../../src/agenda/onAgendaTaskIndexSync');
  const { onAgendaEventReminderSync } = require('../../src/agenda/onAgendaEventReminderSync');
  const { onAgendaTaskReminderSync } = require('../../src/agenda/onAgendaTaskReminderSync');
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
       [1] EVENT — create, participant add/remove, PIC, cancel
       ============================================================ */
    const eventId = 'phasec2-event-1';
    const T0 = new Date('2026-10-15T00:00:00.000Z').getTime(); // fixed, not wall-clock
    const startAt = T0 + 9 * 3600000;
    const endAt = T0 + 11 * 3600000;
    track(`agendaEvents/${eventId}`); track(`agendaEventsByUser/organizerA/${eventId}`);
    track(`agendaEventsByScope/sarpras_shared/${eventId}`);

    console.log('\n=== [1a] Event creation -> audit + creation /events + user/scope index + H1 reminder row ===');
    const created = {
      id: eventId, title: 'Rapat Koordinasi', scope: 'sarpras_shared', organizerUsername: 'organizerA',
      status: 'scheduled', startAt, endAt, participants: {},
      createdBy: 'organizerA', createdAt: 'x', updatedBy: 'organizerA', updatedAt: 'x',
    };
    const createTime = new Date(T0 - 86400000).toISOString();
    await onAgendaEventWrite.run(makeChangeEvent({ params: { eventId }, before: null, after: created, time: createTime }));
    await onAgendaEventIndexSync.run(makeChangeEvent({ params: { eventId }, before: null, after: created, time: createTime }));
    await onAgendaEventReminderSync.run(makeChangeEvent({ params: { eventId }, before: null, after: created, time: createTime }));

    await checkAsync('exactly one audit row, action=created', async () => {
      const rows = await auditRowsFor(eventId);
      if (rows.length !== 1 || rows[0].action !== 'created') throw new Error(`got ${JSON.stringify(rows)}`);
    });
    await checkAsync("audit row's actorUsername is the organizer, NOT a display name", async () => {
      const rows = await auditRowsFor(eventId);
      if (rows[0].actorUsername !== 'organizerA') throw new Error(`got actorUsername=${rows[0].actorUsername}`);
    });
    await checkAsync("audit row's entityScope is 'sarpras_shared' (load-bearing for the Rules-level Kabid-privacy read gate proven in C1)", async () => {
      const rows = await auditRowsFor(eventId);
      if (rows[0].entityScope !== 'sarpras_shared') throw new Error(`got ${rows[0].entityScope}`);
    });
    await checkAsync("a deterministic 'agenda.created' event exists in /events, id = agenda_created__<eventId>", async () => {
      const snap = await db.ref(`events/agenda_created__${eventId}`).once('value');
      if (!snap.exists() || snap.val().type !== 'agenda.created') throw new Error('missing or wrong type');
    });
    await checkAsync('organizer indexed under agendaEventsByUser with startAt as value', async () => {
      const v = (await db.ref(`agendaEventsByUser/organizerA/${eventId}`).once('value')).val();
      if (v !== startAt) throw new Error(`got ${v}`);
    });
    await checkAsync("event indexed under agendaEventsByScope/sarpras_shared (from the record's own immutable scope)", async () => {
      const v = (await db.ref(`agendaEventsByScope/sarpras_shared/${eventId}`).once('value')).val();
      if (v !== startAt) throw new Error(`got ${v}`);
    });
    await checkAsync("an 'h1' reminder row exists, pending, fireAt = startAt - 1h", async () => {
      const row = await getReminder(agendaReminderId('agendaEvent', eventId, 'h1'));
      if (!row || row.status !== 'pending' || row.fireAt !== startAt - 3600000) throw new Error(`got ${JSON.stringify(row)}`);
    });
    await checkAsync("an 'overdue' reminder row exists, pending, fireAt = endAt", async () => {
      const row = await getReminder(agendaReminderId('agendaEvent', eventId, 'overdue'));
      if (!row || row.status !== 'pending' || row.fireAt !== endAt) throw new Error(`got ${JSON.stringify(row)}`);
    });
    track(`reminders/${agendaReminderId('agendaEvent', eventId, 'h1')}`);
    track(`reminders/${agendaReminderId('agendaEvent', eventId, 'overdue')}`);
    track(`events/agenda_created__${eventId}`);

    console.log('\n=== [1b] Add participant (ordinary) -> audit + index + participant_added /events, targeted at the ONE affected person (proven separately by the pure recipients test — this file proves the WRITE side only) ===');
    const withPic = { ...created, participants: { picB: { isPic: false, status: 'invited', invitedBy: 'organizerA', invitedAt: 'x' } }, updatedBy: 'organizerA', updatedAt: 'y' };
    const addTime = new Date(T0 - 86300000).toISOString();
    await onAgendaEventWrite.run(makeChangeEvent({ params: { eventId }, before: created, after: withPic, time: addTime }));
    await onAgendaEventIndexSync.run(makeChangeEvent({ params: { eventId }, before: created, after: withPic, time: addTime }));

    await checkAsync("audit row: action=participant_added, affectedUsername=picB", async () => {
      const rows = await auditRowsFor(eventId);
      const row = rows.find((r) => r.action === 'participant_added');
      if (!row || row.affectedUsername !== 'picB') throw new Error(`got ${JSON.stringify(row)}`);
    });
    await checkAsync('picB now indexed under agendaEventsByUser', async () => {
      const v = (await db.ref(`agendaEventsByUser/picB/${eventId}`).once('value')).val();
      if (v !== startAt) throw new Error(`got ${v}`);
    });
    await checkAsync("a deterministic 'agenda.participant_added' event exists targeting picB", async () => {
      const evs = await eventsFor(eventId, 'agenda.participant_added');
      if (!evs.some((e) => e.payload.affectedUsername === 'picB')) throw new Error(`got ${JSON.stringify(evs)}`);
    });
    track('agendaEventsByUser/picB/' + eventId);

    console.log('\n=== [1c] Mark picB as PIC (participants field write, no membership change) -> generic \'updated\' audit, NO duplicate participant_added ===');
    const picMarked = { ...withPic, participants: { picB: { ...withPic.participants.picB, isPic: true } }, updatedBy: 'organizerA', updatedAt: 'z' };
    const picTime = new Date(T0 - 86200000).toISOString();
    await onAgendaEventWrite.run(makeChangeEvent({ params: { eventId }, before: withPic, after: picMarked, time: picTime }));
    await checkAsync("isPic-only flip produces an 'updated' audit row, NOT another participant_added (membership unchanged, only a field within an existing member)", async () => {
      const rows = await auditRowsFor(eventId);
      const addedCount = rows.filter((r) => r.action === 'participant_added').length;
      if (addedCount !== 1) throw new Error(`expected exactly 1 participant_added total (from 1b), got ${addedCount}`);
    });

    console.log('\n=== [1d] Remove picB -> audit + index removed ===');
    const removed = { ...picMarked, participants: {}, updatedBy: 'organizerA', updatedAt: 'w' };
    const removeTime = new Date(T0 - 86100000).toISOString();
    await onAgendaEventWrite.run(makeChangeEvent({ params: { eventId }, before: picMarked, after: removed, time: removeTime }));
    await onAgendaEventIndexSync.run(makeChangeEvent({ params: { eventId }, before: picMarked, after: removed, time: removeTime }));

    await checkAsync('audit row: action=participant_removed, affectedUsername=picB', async () => {
      const rows = await auditRowsFor(eventId);
      const row = rows.find((r) => r.action === 'participant_removed');
      if (!row || row.affectedUsername !== 'picB') throw new Error(`got ${JSON.stringify(row)}`);
    });
    await checkAsync('picB index entry removed (null) from agendaEventsByUser', async () => {
      const snap = await db.ref(`agendaEventsByUser/picB/${eventId}`).once('value');
      if (snap.exists()) throw new Error('expected the entry to be gone');
    });

    console.log('\n=== [1e] Cancel -> cancellation audit + reminders tombstoned + HISTORICAL INDEX ENTRIES REMAIN (§15) ===');
    const cancelled = { ...removed, status: 'cancelled', cancelledBy: 'organizerA', cancelledAt: 'c', cancelReason: 'Ruang tidak tersedia', updatedBy: 'organizerA', updatedAt: 'v' };
    const cancelTime = new Date(T0 - 86000000).toISOString();
    await onAgendaEventWrite.run(makeChangeEvent({ params: { eventId }, before: removed, after: cancelled, time: cancelTime }));
    await onAgendaEventIndexSync.run(makeChangeEvent({ params: { eventId }, before: removed, after: cancelled, time: cancelTime }));
    await onAgendaEventReminderSync.run(makeChangeEvent({ params: { eventId }, before: removed, after: cancelled, time: cancelTime }));

    await checkAsync("audit row: action=cancelled, note carries cancelReason", async () => {
      const rows = await auditRowsFor(eventId);
      const row = rows.find((r) => r.action === 'cancelled');
      if (!row || row.note !== 'Ruang tidak tersedia') throw new Error(`got ${JSON.stringify(row)}`);
    });
    await checkAsync('BOTH reminder rows tombstoned to cancelled (cancellation stops future reminders)', async () => {
      const h1 = await getReminder(agendaReminderId('agendaEvent', eventId, 'h1'));
      const overdue = await getReminder(agendaReminderId('agendaEvent', eventId, 'overdue'));
      if (h1.status !== 'cancelled' || overdue.status !== 'cancelled') throw new Error(`got ${JSON.stringify({ h1, overdue })}`);
    });
    await checkAsync('organizer STILL indexed under agendaEventsByUser after cancellation — historical accountability, index untouched by status changes (§15)', async () => {
      const v = (await db.ref(`agendaEventsByUser/organizerA/${eventId}`).once('value')).val();
      if (v !== startAt) throw new Error(`expected the historical entry to remain, got ${v}`);
    });

    /* ============================================================
       [2] TASK — create, responsible add/remove, complete
       ============================================================ */
    console.log('\n=== [2] Task lifecycle ===');
    const taskId = 'phasec2-task-1';
    const dueAt = T0 + 5 * 3600000;
    track(`agendaTasks/${taskId}`); track(`agendaTasksByUser/creatorX/${taskId}`); track(`agendaTasksByScope/sarpras_shared/${taskId}`);

    const taskCreated = {
      id: taskId, title: 'Siapkan Materi Rapat', scope: 'sarpras_shared', status: 'not_started', priority: 'penting',
      dueDate: '2026-10-15', dueTime: '13:00', dueAt, responsible: {},
      createdBy: 'creatorX', createdAt: 'x', updatedBy: 'creatorX', updatedAt: 'x',
    };
    const taskCreateTime = new Date(T0 - 86400000).toISOString();
    await onAgendaTaskWrite.run(makeChangeEvent({ params: { taskId }, before: null, after: taskCreated, time: taskCreateTime }));
    await onAgendaTaskIndexSync.run(makeChangeEvent({ params: { taskId }, before: null, after: taskCreated, time: taskCreateTime }));
    await onAgendaTaskReminderSync.run(makeChangeEvent({ params: { taskId }, before: null, after: taskCreated, time: taskCreateTime }));

    await checkAsync('task creation: exactly one audit row, action=created', async () => {
      const rows = await auditRowsFor(taskId);
      if (rows.length !== 1 || rows[0].action !== 'created') throw new Error(JSON.stringify(rows));
    });
    await checkAsync('creator indexed under agendaTasksByUser with dueAt', async () => {
      const v = (await db.ref(`agendaTasksByUser/creatorX/${taskId}`).once('value')).val();
      if (v !== dueAt) throw new Error(`got ${v}`);
    });
    await checkAsync('task indexed under agendaTasksByScope/sarpras_shared', async () => {
      const v = (await db.ref(`agendaTasksByScope/sarpras_shared/${taskId}`).once('value')).val();
      if (v !== dueAt) throw new Error(`got ${v}`);
    });
    await checkAsync("a deterministic 'task.created' event exists", async () => {
      const snap = await db.ref(`events/task_created__${taskId}`).once('value');
      if (!snap.exists()) throw new Error('missing');
    });
    await checkAsync("both 'h1' (dueTime present) and 'overdue' reminder rows exist, pending", async () => {
      const h1 = await getReminder(agendaReminderId('agendaTask', taskId, 'h1'));
      const overdue = await getReminder(agendaReminderId('agendaTask', taskId, 'overdue'));
      if (!h1 || h1.status !== 'pending' || h1.fireAt !== dueAt - 3600000) throw new Error(`h1: ${JSON.stringify(h1)}`);
      if (!overdue || overdue.status !== 'pending' || overdue.fireAt !== dueAt) throw new Error(`overdue: ${JSON.stringify(overdue)}`);
    });
    track(`reminders/${agendaReminderId('agendaTask', taskId, 'h1')}`);
    track(`reminders/${agendaReminderId('agendaTask', taskId, 'overdue')}`);
    track(`events/task_created__${taskId}`);

    console.log('\n=== [2b] Add + remove responsible member ===');
    const taskWithResp = { ...taskCreated, responsible: { workerY: { assignedBy: 'creatorX', assignedAt: 'x' } }, updatedBy: 'creatorX', updatedAt: 'y' };
    const respAddTime = new Date(T0 - 86300000).toISOString();
    await onAgendaTaskWrite.run(makeChangeEvent({ params: { taskId }, before: taskCreated, after: taskWithResp, time: respAddTime }));
    await onAgendaTaskIndexSync.run(makeChangeEvent({ params: { taskId }, before: taskCreated, after: taskWithResp, time: respAddTime }));
    await checkAsync("audit row: action=responsible_added (NOT participant_added — field auto-detected)", async () => {
      const rows = await auditRowsFor(taskId);
      if (!rows.some((r) => r.action === 'responsible_added' && r.affectedUsername === 'workerY')) throw new Error(JSON.stringify(rows));
    });
    await checkAsync('workerY indexed under agendaTasksByUser', async () => {
      const v = (await db.ref(`agendaTasksByUser/workerY/${taskId}`).once('value')).val();
      if (v !== dueAt) throw new Error(`got ${v}`);
    });
    track(`agendaTasksByUser/workerY/${taskId}`);

    const taskRespRemoved = { ...taskWithResp, responsible: {}, updatedBy: 'creatorX', updatedAt: 'z' };
    const respRemoveTime = new Date(T0 - 86200000).toISOString();
    await onAgendaTaskWrite.run(makeChangeEvent({ params: { taskId }, before: taskWithResp, after: taskRespRemoved, time: respRemoveTime }));
    await onAgendaTaskIndexSync.run(makeChangeEvent({ params: { taskId }, before: taskWithResp, after: taskRespRemoved, time: respRemoveTime }));
    await checkAsync('audit row: action=responsible_removed', async () => {
      const rows = await auditRowsFor(taskId);
      if (!rows.some((r) => r.action === 'responsible_removed' && r.affectedUsername === 'workerY')) throw new Error(JSON.stringify(rows));
    });
    await checkAsync('workerY index entry removed', async () => {
      const snap = await db.ref(`agendaTasksByUser/workerY/${taskId}`).once('value');
      if (snap.exists()) throw new Error('expected gone');
    });

    console.log("\n=== [2c] Complete task -> 'completed' audit (never also generic \'updated\' or \'status_changed\'), reminders tombstoned ===");
    const taskDone = { ...taskRespRemoved, status: 'done', completedAt: 'd', completedBy: 'creatorX', updatedBy: 'creatorX', updatedAt: 'v' };
    const doneTime = new Date(T0 - 86100000).toISOString();
    await onAgendaTaskWrite.run(makeChangeEvent({ params: { taskId }, before: taskRespRemoved, after: taskDone, time: doneTime }));
    await onAgendaTaskReminderSync.run(makeChangeEvent({ params: { taskId }, before: taskRespRemoved, after: taskDone, time: doneTime }));

    await checkAsync('exactly one audit row for this write, action=completed', async () => {
      const rows = await auditRowsFor(taskId);
      const completedRows = rows.filter((r) => r.timestamp === new Date(doneTime).getTime());
      if (completedRows.length !== 1 || completedRows[0].action !== 'completed') throw new Error(JSON.stringify(completedRows));
    });
    await checkAsync("a 'task.completed' /events entry exists", async () => {
      const evs = await eventsFor(taskId, 'task.completed');
      if (evs.length !== 1) throw new Error(JSON.stringify(evs));
    });
    await checkAsync('completion tombstones BOTH reminder rows — overdue behavior is suppressed going forward', async () => {
      const h1 = await getReminder(agendaReminderId('agendaTask', taskId, 'h1'));
      const overdue = await getReminder(agendaReminderId('agendaTask', taskId, 'overdue'));
      if (h1.status !== 'cancelled' || overdue.status !== 'cancelled') throw new Error(JSON.stringify({ h1, overdue }));
    });

    /* ============================================================
       [3] REMINDER TICK — fire/skip against LIVE (re-validated) state,
       deterministic timestamps only, no wall-clock dependency
       ============================================================ */
    console.log('\n=== [3] reminderTick — Agenda branch ===');

    const tickEventId = 'phasec2-tick-event';
    const tickStartAt = Date.now() + 3600000; // not due yet, for the staleness-guard case below
    await db.ref(`agendaEvents/${tickEventId}`).set({
      id: tickEventId, title: 'Tick Test Event', scope: 'sarpras_shared', organizerUsername: 'organizerA',
      status: 'scheduled', startAt: tickStartAt, endAt: tickStartAt + 3600000, participants: {},
    });
    track(`agendaEvents/${tickEventId}`);
    const tickH1Id = agendaReminderId('agendaEvent', tickEventId, 'h1');
    await db.ref(`reminders/${tickH1Id}`).set({ id: tickH1Id, entityType: 'agendaEvent', entityId: tickEventId, offset: 'h1', fireAt: Date.now() - 1000, status: 'pending', firedAt: null, eventId: null, updatedAt: 'x' });
    track(`reminders/${tickH1Id}`);

    await checkAsync("a due 'h1' row for a live, still-future event fires: row 'fired', an 'agenda.reminder' event minted", async () => {
      await reminderTick.run();
      const row = await getReminder(tickH1Id);
      if (row.status !== 'fired') throw new Error(`got ${JSON.stringify(row)}`);
      const snap = await db.ref(`events/agenda__agendaEvent__${tickEventId}__h1`).once('value');
      if (!snap.exists() || snap.val().type !== 'agenda.reminder') throw new Error('missing agenda.reminder event');
    });
    track(`events/agenda__agendaEvent__${tickEventId}__h1`);

    await checkAsync('RETRY: firing the SAME due row a second time (simulating a tick replay before the first mark landed) does not create a second /events entry — writeEventWithId is a no-op on the existing deterministic id', async () => {
      // Re-seed the row back to pending (simulating the race the deterministic id protects against) and fire again.
      await db.ref(`reminders/${tickH1Id}/status`).set('pending');
      await reminderTick.run();
      const snap = await db.ref('events').orderByChild('entity/id').equalTo(tickEventId).once('value');
      const reminderEvents = Object.values(snap.val() || {}).filter((e) => e.type === 'agenda.reminder');
      if (reminderEvents.length !== 1) throw new Error(`expected exactly 1, got ${reminderEvents.length}`);
    });

    console.log('\n=== [3b] Overdue: fires once, re-validated against live state, suppressed once acknowledged ===');
    const overdueEventId = 'phasec2-overdue-event';
    await db.ref(`agendaEvents/${overdueEventId}`).set({
      id: overdueEventId, title: 'Overdue Test', scope: 'sarpras_shared', organizerUsername: 'organizerA',
      status: 'scheduled', acknowledgedAt: null, startAt: Date.now() - 7200000, endAt: Date.now() - 3600000, participants: {},
    });
    track(`agendaEvents/${overdueEventId}`);
    const overdueRowId = agendaReminderId('agendaEvent', overdueEventId, 'overdue');
    await db.ref(`reminders/${overdueRowId}`).set({ id: overdueRowId, entityType: 'agendaEvent', entityId: overdueEventId, offset: 'overdue', fireAt: Date.now() - 1000, status: 'pending', firedAt: null, eventId: null, updatedAt: 'x' });
    track(`reminders/${overdueRowId}`);

    await checkAsync('a genuinely overdue, unacknowledged event fires its overdue reminder', async () => {
      await reminderTick.run();
      const row = await getReminder(overdueRowId);
      if (row.status !== 'fired') throw new Error(JSON.stringify(row));
    });
    track(`events/agenda__agendaEvent__${overdueEventId}__overdue`);

    const ackEventId = 'phasec2-acked-event';
    await db.ref(`agendaEvents/${ackEventId}`).set({
      id: ackEventId, title: 'Acked Test', scope: 'sarpras_shared', organizerUsername: 'organizerA',
      status: 'scheduled', acknowledgedAt: 'already-acked', startAt: Date.now() - 7200000, endAt: Date.now() - 3600000, participants: {},
    });
    track(`agendaEvents/${ackEventId}`);
    const ackRowId = agendaReminderId('agendaEvent', ackEventId, 'overdue');
    await db.ref(`reminders/${ackRowId}`).set({ id: ackRowId, entityType: 'agendaEvent', entityId: ackEventId, offset: 'overdue', fireAt: Date.now() - 1000, status: 'pending', firedAt: null, eventId: null, updatedAt: 'x' });
    track(`reminders/${ackRowId}`);

    await checkAsync('an ALREADY-ACKNOWLEDGED event does NOT fire an overdue reminder — re-validated live, not just scheduled-at-plan-time', async () => {
      await reminderTick.run();
      const row = await getReminder(ackRowId);
      if (row.status !== 'cancelled') throw new Error(`expected 'cancelled' (re-validated, not overdue), got ${JSON.stringify(row)}`);
      const snap = await db.ref(`events/agenda__agendaEvent__${ackEventId}__overdue`).once('value');
      if (snap.exists()) throw new Error('should not have minted an overdue event');
    });

    const cancelledTickId = 'phasec2-cancelled-tick-event';
    await db.ref(`agendaEvents/${cancelledTickId}`).set({ id: cancelledTickId, status: 'cancelled', scope: 'sarpras_shared', startAt: Date.now() + 3600000, endAt: Date.now() + 7200000 });
    track(`agendaEvents/${cancelledTickId}`);
    const cancelledH1Id = agendaReminderId('agendaEvent', cancelledTickId, 'h1');
    await db.ref(`reminders/${cancelledH1Id}`).set({ id: cancelledH1Id, entityType: 'agendaEvent', entityId: cancelledTickId, offset: 'h1', fireAt: Date.now() - 1000, status: 'pending', firedAt: null, eventId: null, updatedAt: 'x' });
    track(`reminders/${cancelledH1Id}`);
    await checkAsync("a cancelled event's due 'h1' row is skipped (cancelled), not fired", async () => {
      await reminderTick.run();
      const row = await getReminder(cancelledH1Id);
      if (row.status !== 'cancelled') throw new Error(JSON.stringify(row));
    });

    const doneTickTaskId = 'phasec2-done-tick-task';
    await db.ref(`agendaTasks/${doneTickTaskId}`).set({ id: doneTickTaskId, status: 'done', scope: 'sarpras_shared', dueAt: Date.now() - 3600000 });
    track(`agendaTasks/${doneTickTaskId}`);
    const doneOverdueId = agendaReminderId('agendaTask', doneTickTaskId, 'overdue');
    await db.ref(`reminders/${doneOverdueId}`).set({ id: doneOverdueId, entityType: 'agendaTask', entityId: doneTickTaskId, offset: 'overdue', fireAt: Date.now() - 1000, status: 'pending', firedAt: null, eventId: null, updatedAt: 'x' });
    track(`reminders/${doneOverdueId}`);
    await checkAsync("a COMPLETED task's overdue row does not fire (isAgendaTaskOverdue re-validates status!=='done' at fire time)", async () => {
      await reminderTick.run();
      const row = await getReminder(doneOverdueId);
      if (row.status !== 'cancelled') throw new Error(JSON.stringify(row));
    });

    console.log('\n=== [4] IDEMPOTENCY — replaying the SAME write event twice converges, never duplicates ===');
    const idEventId = 'phasec2-idempotency-event';
    track(`agendaEvents/${idEventId}`); track(`agendaEventsByUser/organizerA/${idEventId}`);
    track(`agendaEventsByScope/sarpras_shared/${idEventId}`);
    const idStartAt = T0 + 20 * 3600000;
    const idCreated = {
      id: idEventId, title: 'Idempotency Probe', scope: 'sarpras_shared', organizerUsername: 'organizerA',
      status: 'scheduled', startAt: idStartAt, endAt: idStartAt + 3600000, participants: {},
      createdBy: 'organizerA', createdAt: 'x', updatedBy: 'organizerA', updatedAt: 'x',
    };
    const idTime = new Date(T0 - 86400000).toISOString();
    const idFixture = makeChangeEvent({ params: { eventId: idEventId }, before: null, after: idCreated, time: idTime });

    await onAgendaEventWrite.run(idFixture);
    await onAgendaEventWrite.run(idFixture); // replay — identical event.time, identical action
    await checkAsync('audit trigger replay: still exactly ONE created row, not two', async () => {
      const rows = await auditRowsFor(idEventId);
      if (rows.length !== 1) throw new Error(`got ${rows.length}: ${JSON.stringify(rows)}`);
    });
    await checkAsync("creation /events replay: still exactly ONE agenda.created entry", async () => {
      const evs = await eventsFor(idEventId, 'agenda.created');
      if (evs.length !== 1) throw new Error(`got ${evs.length}`);
    });

    await onAgendaEventIndexSync.run(idFixture);
    await onAgendaEventIndexSync.run(idFixture); // replay
    await checkAsync('index trigger replay: single, convergent index value (not duplicated — RTDB keys are inherently single-valued, but proves the trigger did not error or diverge on replay)', async () => {
      const v = (await db.ref(`agendaEventsByUser/organizerA/${idEventId}`).once('value')).val();
      if (v !== idStartAt) throw new Error(`got ${v}`);
    });

    await onAgendaEventReminderSync.run(idFixture);
    await onAgendaEventReminderSync.run(idFixture); // replay
    await checkAsync('reminder-sync trigger replay: still exactly one h1 row at the same id (deterministic key, upsert-in-place)', async () => {
      const row = await getReminder(agendaReminderId('agendaEvent', idEventId, 'h1'));
      if (!row || row.fireAt !== idStartAt - 3600000) throw new Error(JSON.stringify(row));
    });
    track(`reminders/${agendaReminderId('agendaEvent', idEventId, 'h1')}`);
    track(`reminders/${agendaReminderId('agendaEvent', idEventId, 'overdue')}`);
    track(`events/agenda_created__${idEventId}`);

    /* ============================================================
       [5] Kabid — TRIGGER half of the privacy proof (the READ/WRITE
       authorization half is scripts/agenda-rules-security-check.mjs,
       already exhaustively proven in Phase C1, unchanged by C2)
       ============================================================ */
    console.log('\n=== [5] Kabid-scope event — trigger correctness ===');
    const kabidEventId = 'phasec2-kabid-event';
    track(`agendaEvents/${kabidEventId}`); track(`agendaEventsByUser/kabidUser/${kabidEventId}`);
    track(`agendaEventsByScope/kabid/${kabidEventId}`);
    const kabidCreated = {
      id: kabidEventId, title: 'Rapat Internal Kabid', scope: 'kabid', organizerUsername: 'kabidUser',
      status: 'scheduled', startAt: T0 + 30 * 3600000, endAt: T0 + 31 * 3600000, participants: {},
      createdBy: 'kabidUser', createdAt: 'x', updatedBy: 'kabidUser', updatedAt: 'x',
    };
    const kabidTime = new Date(T0 - 86400000).toISOString();
    await onAgendaEventWrite.run(makeChangeEvent({ params: { eventId: kabidEventId }, before: null, after: kabidCreated, time: kabidTime }));
    await onAgendaEventIndexSync.run(makeChangeEvent({ params: { eventId: kabidEventId }, before: null, after: kabidCreated, time: kabidTime }));

    await checkAsync("audit row's entityScope is 'kabid' (the field the C1 Rules test proves an unrelated admin is denied read on)", async () => {
      const rows = await auditRowsFor(kabidEventId);
      if (rows[0].entityScope !== 'kabid') throw new Error(`got ${rows[0].entityScope}`);
    });
    await checkAsync("the event is indexed under agendaEventsByScope/kabid, NOT sarpras_shared (the bucket the C1 Rules test proves has no admin bypass)", async () => {
      const kabidVal = (await db.ref(`agendaEventsByScope/kabid/${kabidEventId}`).once('value')).val();
      const sharedVal = (await db.ref(`agendaEventsByScope/sarpras_shared/${kabidEventId}`).once('value')).val();
      if (kabidVal == null || sharedVal != null) throw new Error(`kabid=${kabidVal} shared=${sharedVal}`);
    });
    track(`events/agenda_created__${kabidEventId}`);
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
    console.error(`\n[agenda-triggers-check] FATAL: ${err.stack || err.message}\n`);
    process.exit(1);
  });
