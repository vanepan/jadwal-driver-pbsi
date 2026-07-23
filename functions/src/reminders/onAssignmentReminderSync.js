'use strict';

/* ============================================================
   reminders/onAssignmentReminderSync.js — timer-queue maintenance

   A dedicated /assignments trigger that maintains the /reminders rows.
   Kept SEPARATE from onAssignmentWrite (which mints business events):
   the event trigger's job is events; this trigger's job is the timer
   queue. Two triggers on one node is an established additive pattern;
   the cost is one extra invocation per assignment write.

   classify(before, after) mirrors onAssignmentWrite's PRE-v1.25.x transition
   logic (create/delete/status — deliberately NOT the v1.25.x reassigned-vs-
   updated split added there for notification wording; this file only cares
   whether the FIRE TIME needs to move) and maps each transition to a queue
   action:

     created                          → upsert two `pending` rows
     date/startTime changed (updated) → recompute fireAt, upsert in place
     started/completed/cancelled/deleted → tombstone (cancelled)

   v1.25.x Driver Notification V2 (Part 5 — Reminder Synchronization): a
   driver-only reassignment (no date/startTime change) intentionally takes
   NO action here — and needs none. /reminders rows carry no driver snapshot
   (schedule.js), and reminders/tick.js re-reads the LIVE /assignments node
   at fire time, so whoever is CURRENTLY assigned always receives the H-1d/
   H-1h reminder; a previous driver can never keep receiving reminders after
   reassignment, and this was true before this change — it just wasn't
   documented as a deliberate guarantee until now.

   Gated on REMINDER_FLAGS.enabled: while false the whole subsystem is
   dormant (no rows written) — deploying the code changes nothing in
   production until ops flips the flag.
   ============================================================ */

const { onValueWritten } = require('firebase-functions/v2/database');
const logger = require('firebase-functions/logger');
const { REGION, DB_INSTANCE, REMINDER_FLAGS } = require('../config/constants');
const { computeFireAts, syncOffsets, tombstoneOffsets } = require('./schedule');

/** Identical to onAssignmentWrite.classify — derives the transition type. */
function classify(before, after) {
  const existedBefore = before !== null && before !== undefined;
  const existsAfter   = after !== null && after !== undefined;

  if (!existedBefore && existsAfter) return 'assignment.created';
  if (existedBefore && !existsAfter) return 'assignment.deleted';
  if (!existsAfter) return null;

  const prevStatus = before ? before.status : null;
  const nextStatus = after.status;
  if (nextStatus !== prevStatus) {
    if (nextStatus === 'cancelled') return 'assignment.cancelled';
    if (nextStatus === 'completed') return 'assignment.completed';
    if (nextStatus === 'started')   return 'assignment.started';
  }
  return 'assignment.updated';
}

/** Did the scheduled instant (date or startTime) change between snapshots? */
function scheduleChanged(before, after) {
  const key = (n) => `${(n && (n.date ?? n.startDate)) || ''}T${(n && n.startTime) || ''}`;
  return key(before) !== key(after);
}

const onAssignmentReminderSync = onValueWritten(
  { ref: '/assignments/{assignmentId}', region: REGION, instance: DB_INSTANCE },
  async (event) => {
    if (!REMINDER_FLAGS.enabled) return; // dormant until ops activates (Phase A)

    const before = event.data.before.val();
    const after  = event.data.after.val();
    const type   = classify(before, after);
    if (!type) return;

    const assignmentId = event.params.assignmentId;

    try {
      switch (type) {
        case 'assignment.created': {
          const fa = computeFireAts(after.date ?? after.startDate, after.startTime);
          if (fa) await syncOffsets(assignmentId, fa);
          break;
        }
        // A trip underway or terminal no longer needs future reminders;
        // tombstone blocks a racing tick (the tick also re-validates).
        case 'assignment.started':
        case 'assignment.completed':
        case 'assignment.cancelled':
        case 'assignment.deleted': {
          await tombstoneOffsets(assignmentId);
          break;
        }
        case 'assignment.updated': {
          // Only a date/startTime change moves the reminder; ignore other edits.
          if (scheduleChanged(before, after)) {
            const fa = computeFireAts(after.date ?? after.startDate, after.startTime);
            if (fa) await syncOffsets(assignmentId, fa);
          }
          break;
        }
        default:
          break;
      }
      logger.info('[onAssignmentReminderSync] synced', { type, assignmentId });
    } catch (err) {
      logger.error('[onAssignmentReminderSync] failed', { type, assignmentId, error: err.message });
    }
  }
);

module.exports = { onAssignmentReminderSync };
