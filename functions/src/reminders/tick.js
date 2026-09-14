'use strict';

/* ============================================================
   reminders/tick.js — the clock (v1.11.4)

   The one net-new capability of v1.11.4: a clock that mints a canonical
   assignment.reminder event at the right instant. Everything downstream
   (recipients, templates, persist, dispatch, delivery, idempotency,
   retry, prune) is the EXISTING pipeline, reused unchanged.

   onSchedule every 5 min (Asia/Jakarta). Algorithm (idempotent):
     1. now = Date.now()
     2. due = /reminders where fireAt ≤ now AND status == pending
     3. re-validate live assignment (cancelled/completed/started/gone → skip)
     4. staleness guard: trip already started (now ≥ tripStart) → skip
     5. mint deterministic envelope + writeEventWithId(eventId, …)
     6. mark row fired (firedAt, eventId)

   The deterministic eventId gives at-most-once: onEventWrite is
   onValueCreated, so a re-emitted (already-existing) event id does NOT
   re-fire the engine. The row marker is the fast pre-filter; the
   deterministic id is the correctness boundary (REV2 §3).
   ============================================================ */

const { onSchedule } = require('firebase-functions/v2/scheduler');
const logger = require('firebase-functions/logger');
const { db } = require('../config/admin');
const { REGION, REMINDER_FLAGS } = require('../config/constants');
const { buildEnvelope, writeEventWithId } = require('../events/schema');
const {
  loadDueReminders, markReminder, tripStartMs, reminderId,
} = require('./schedule');

/* V1.31 Agenda & To-Do — Phase C2. MUST mirror
   js/agenda/agenda-lifecycle.js#isEventOverdue()/isTaskOverdue() exactly —
   duplicated, not imported, because that module is client-side ESM and
   this is server-side CJS (the same client/server boundary every other
   pure-logic pair in this codebase already accepts rather than forcing a
   cross-runtime import — e.g. events/schema.js's own inlined keySafe()). */
const AGENDA_ENTITY_PATH = { agendaEvent: 'agendaEvents', agendaTask: 'agendaTasks', agendaCalendar: 'agendaCalendars' };

function isAgendaEventOverdue(e, now) {
  return Boolean(e) && e.status === 'scheduled' && e.acknowledgedAt == null && e.endAt != null && now > e.endAt;
}
// 'deleted' (V1.31.1 soft-delete, added alongside the Calendar entity) must
// suppress overdue exactly like 'done' already does — a deleted task is not
// an outstanding one. isAgendaEventOverdue needs no equivalent fix: its
// status==='scheduled' check is already positive-only, so 'deleted' (or any
// other non-'scheduled' status) already falls through to false.
function isAgendaTaskOverdue(t, now) {
  return Boolean(t) && t.status !== 'done' && t.status !== 'deleted' && t.dueAt != null && now > t.dueAt;
}
/* V1.31.1 "Agenda, Kalender & To-Do". MUST mirror
   js/agenda/agenda-calendar-lifecycle.js#calendarItemDisplayState()'s
   'selesai' branch exactly — duplicated, not imported, for the same
   client/server CJS-ESM boundary reason as the two functions above.
   Deliberately NOT named isAgendaCalendarOverdue: a Calendar period
   concluding is not a failure state (spec §E/L — never "Terlewat" for
   Calendar), it is just informational. */
function isCalendarItemEnded(item, now) {
  return Boolean(item) && item.status === 'scheduled' && item.endAt != null && now > item.endAt;
}

/* V1.31.1 "Agenda, Kalender & To-Do" — entityType -> event-type prefix.
   Was a binary ternary (agendaEvent->'agenda', else->'task'); a 3rd entity
   type needs a real lookup, not a wider ternary. */
const AGENDA_TYPE_PREFIX = { agendaEvent: 'agenda', agendaTask: 'task', agendaCalendar: 'calendar' };

/** Build the canonical agenda.reminder/agenda.overdue/task.reminder/
 *  task.overdue/calendar.reminder/calendar.ended envelope for a due row,
 *  re-reading the LIVE entity so the notification always reflects current
 *  state, not the state at schedule time (mirrors buildReminderEnvelope's
 *  identical philosophy below). */
function buildAgendaReminderEnvelope(entityType, entity, row) {
  const prefix = AGENDA_TYPE_PREFIX[entityType];
  // 'h1' -> '.reminder' (unchanged); every other offset name ('overdue' for
  // event/task, 'ended' for calendar) maps to itself — this is a
  // generalization of the old `row.offset === 'overdue' ? 'overdue' :
  // 'reminder'` ternary, not a behavior change for event/task.
  const type = `${prefix}.${row.offset === 'h1' ? 'reminder' : row.offset}`;
  let payload;
  if (entityType === 'agendaEvent') {
    payload = {
      title: entity.title ?? null,
      organizerUsername: entity.organizerUsername ?? null,
      participants: entity.participants ?? null,
      offset: row.offset,
    };
  } else if (entityType === 'agendaTask') {
    payload = {
      title: entity.title ?? null,
      responsible: entity.responsible ?? null,
      priority: entity.priority ?? null,
      offset: row.offset,
    };
  } else {
    payload = {
      title: entity.title ?? null,
      organizerUsername: entity.organizerUsername ?? null,
      participants: entity.participants ?? null,
      startDate: entity.startDate ?? null,
      endDate: entity.endDate ?? null,
      offset: row.offset,
    };
  }
  return buildEnvelope({
    type,
    actor: { uid: null, role: 'system', displayName: 'Pengingat' },
    entity: { kind: entityType, id: row.entityId },
    payload,
    timestamp: new Date(row.fireAt).toISOString(),
  });
}

/** Resolve the requesterId for an assignment (record carries requestId, not
 *  requesterId — mirror the client: requestId → /driver_requests → requesterId). */
async function resolveRequesterId(assignment) {
  if (!assignment || !assignment.requestId) return null;
  try {
    const snap = await db.ref(`driver_requests/${assignment.requestId}`).once('value');
    const req = snap.val();
    return (req && req.requesterId) || null;
  } catch {
    return null;
  }
}

/** Build the canonical assignment.reminder envelope for a due row. */
function buildReminderEnvelope(assignment, row, requesterId) {
  return buildEnvelope({
    type: 'assignment.reminder',
    actor: { uid: null, role: 'system', displayName: 'Pengingat' },
    entity: { kind: 'assignment', id: row.assignmentId },
    payload: {
      offset:         row.offset,
      fireAt:         new Date(row.fireAt).toISOString(),
      driver:         assignment.driver ?? null,
      driverUsername: assignment.driverUsername ?? null,
      vehicle:        assignment.vehicle ?? null,
      destination:    assignment.destination ?? null,
      date:           assignment.date ?? assignment.startDate ?? null,
      startTime:      assignment.startTime ?? null,
      endTime:        assignment.endTime ?? null,
      status:         assignment.status ?? null,
      requestId:      assignment.requestId ?? null,
      requesterId:    requesterId,
    },
    timestamp: new Date(row.fireAt).toISOString(),
  });
}

const reminderTick = onSchedule(
  { schedule: 'every 5 minutes', timeZone: 'Asia/Jakarta', region: REGION },
  async () => {
    if (!REMINDER_FLAGS.enabled) {
      logger.info('[reminder/tick] disabled — skipping');
      return;
    }

    const now = Date.now();
    const due = await loadDueReminders(now);
    if (!due.length) {
      logger.info('[reminder/tick] nothing due', { now });
      return;
    }

    let fired = 0, skipped = 0, cancelled = 0;

    for (const row of due) {
      const id = row.id || reminderId(row.assignmentId, row.offset);

      // V1.31 Agenda & To-Do — Phase C2. Agenda rows carry entityType;
      // legacy assignment rows never do — this branch is the ONLY new
      // code path in this loop, the assignment branch below it is
      // completely unmodified (see Risk R9,
      // docs/AGENDA_TODO_PHASE_B_ARCHITECTURE_VALIDATION_v1.31.0.0.md §12).
      if (row.entityType) {
        try {
          // V1.31.1 adds 'agendaCalendar' as a third entity type — was a
          // binary ternary, now a lookup (AGENDA_ENTITY_PATH, module scope).
          const path = `${AGENDA_ENTITY_PATH[row.entityType]}/${row.entityId}`;
          const entity = (await db.ref(path).once('value')).val();
          if (!entity) { await markReminder(id, { status: 'cancelled' }); cancelled++; continue; }

          if (row.offset === 'h1') {
            const startInstant = row.entityType === 'agendaTask' ? entity.dueAt : entity.startAt;
            // Terminal states per entity type. 'deleted' (V1.31.1 soft-delete)
            // is terminal for ALL three — added here alongside 'cancelled'/
            // 'done' rather than being a pre-existing gap left unfixed now
            // that a deleted event/task can exist.
            const terminal = row.entityType === 'agendaTask'
              ? (entity.status === 'done' || entity.status === 'deleted')
              : (entity.status === 'cancelled' || entity.status === 'deleted');
            if (terminal) { await markReminder(id, { status: 'cancelled' }); cancelled++; continue; }
            // Staleness guard, mirrors the assignment branch below: a "1 hour
            // before" reminder for something already past its own start/due
            // instant is noise (e.g. functions were down for hours) — skip,
            // don't blast a late reminder.
            if (startInstant != null && now >= startInstant) { await markReminder(id, { status: 'skipped' }); skipped++; continue; }
          } else if (row.offset === 'overdue') {
            // agendaEvent/agendaTask only — re-validate the item is
            // GENUINELY overdue right now (not merely that the row was
            // scheduled to fire): it may have been acknowledged/completed/
            // cancelled/deleted since this row was planned, and the row
            // itself carries no live status of its own.
            const stillOverdue = row.entityType === 'agendaEvent'
              ? isAgendaEventOverdue(entity, now)
              : isAgendaTaskOverdue(entity, now);
            if (!stillOverdue) { await markReminder(id, { status: 'cancelled' }); cancelled++; continue; }
          } else {
            // 'ended' — agendaCalendar only. Same live-re-validation
            // philosophy as 'overdue' above, but framed as a neutral
            // conclusion, never as lateness/failure.
            const genuinelyEnded = isCalendarItemEnded(entity, now);
            if (!genuinelyEnded) { await markReminder(id, { status: 'cancelled' }); cancelled++; continue; }
          }

          const eventId = `agenda__${row.entityType}__${row.entityId}__${row.offset}`;
          await writeEventWithId(eventId, buildAgendaReminderEnvelope(row.entityType, entity, row));
          await markReminder(id, { status: 'fired', firedAt: new Date().toISOString(), eventId });
          fired++;
        } catch (err) {
          logger.error('[reminder/tick] agenda row failed', { id, entityType: row.entityType, entityId: row.entityId, error: err.message });
        }
        continue;
      }

      try {
        // Re-validate against live state (guards the cancel/complete race).
        const asg = (await db.ref(`assignments/${row.assignmentId}`).once('value')).val();
        if (!asg) { await markReminder(id, { status: 'cancelled' }); cancelled++; continue; }

        const status = asg.status;
        if (status === 'cancelled' || status === 'completed' || status === 'deleted') {
          await markReminder(id, { status: 'cancelled' }); cancelled++; continue;
        }

        // Staleness guard: a reminder for a trip already started/underway is
        // noise (catches "functions were down for hours"). Skip, don't blast.
        const tripStart = tripStartMs(asg.date ?? asg.startDate, asg.startTime);
        if (status === 'started' || (tripStart != null && now >= tripStart)) {
          await markReminder(id, { status: 'skipped' }); skipped++; continue;
        }

        // Mint the deterministic event. Steps 5→6 are safe to repeat: if we
        // crash after the write, the next tick re-emits the same id (a no-op
        // create) — the row marker just avoids the wasted re-emit.
        const eventId = `reminder__${row.assignmentId}__${row.offset}`;
        const requesterId = await resolveRequesterId(asg);
        await writeEventWithId(eventId, buildReminderEnvelope(asg, row, requesterId));
        await markReminder(id, { status: 'fired', firedAt: new Date().toISOString(), eventId });
        fired++;
      } catch (err) {
        logger.error('[reminder/tick] row failed', { id, assignmentId: row.assignmentId, error: err.message });
      }
    }

    logger.info('[reminder/tick] done', { due: due.length, fired, skipped, cancelled });
  }
);

module.exports = { reminderTick };
