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
