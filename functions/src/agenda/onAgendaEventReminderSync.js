'use strict';

/* ============================================================
   agenda/onAgendaEventReminderSync.js — timer-queue maintenance for
   /agendaEvents (V1.31 Agenda & To-Do, Phase C2)

   A THIRD trigger on /agendaEvents/{eventId} (alongside onAgendaEventWrite
   and onAgendaEventIndexSync) — same "N triggers on one node, each with a
   single job" pattern reminders/onAssignmentReminderSync.js already
   established for assignments (there: events-trigger + timer-queue-
   trigger = 2; here: audit/events-trigger + index-trigger +
   timer-queue-trigger = 3 — an additive extension of an already-accepted
   pattern, not a new one).

   Maintains the /reminders rows via the C2 extension of
   reminders/schedule.js (syncAgendaOffsets/tombstoneAgendaOffsets) —
   the EXISTING assignment reminder rows/logic are never touched by this
   file. No REMINDER_FLAGS gate: that flag's semantics are specifically
   the assignment-reminder rollout; Agenda reminders are a separate,
   independently-releasable surface (see the C2 report's "known
   limitations" for the eventual-deploy staging question this leaves
   open, deliberately not resolved here).

   'cancelled' tombstones pending rows (spec: cancellation stops future
   reminders). Un-cancelling (scheduled again) re-syncs a fresh plan —
   syncAgendaOffsets's own "only 'fired' survives a re-sync" rule already
   makes this correct without any special-casing here (mirrors
   syncOffsets()'s identical behavior for assignments).
   ============================================================ */

const { onValueWritten } = require('firebase-functions/v2/database');
const logger = require('firebase-functions/logger');
const { REGION, DB_INSTANCE } = require('../config/constants');
const { syncAgendaOffsets, tombstoneAgendaOffsets } = require('../reminders/schedule');
const { planForEvent } = require('./reminderPlan');

const ENTITY_TYPE = 'agendaEvent';

const onAgendaEventReminderSync = onValueWritten(
  { ref: '/agendaEvents/{eventId}', region: REGION, instance: DB_INSTANCE },
  async (event) => {
    const before = event.data.before.val();
    const after = event.data.after.val();
    const eventId = event.params.eventId;

    try {
      if (!before && after) {
        const plan = planForEvent(after);
        if (plan) await syncAgendaOffsets(ENTITY_TYPE, eventId, plan);
        return;
      }
      if (!after) return; // Rules forbid hard delete — defensive only

      if (after.status === 'cancelled') {
        await tombstoneAgendaOffsets(ENTITY_TYPE, eventId);
        return;
      }

      const scheduleChanged = !before
        || before.startAt !== after.startAt
        || before.endAt !== after.endAt
        || before.status === 'cancelled';
      if (scheduleChanged) {
        const plan = planForEvent(after);
        if (plan) await syncAgendaOffsets(ENTITY_TYPE, eventId, plan);
      }
    } catch (err) {
      logger.error('[onAgendaEventReminderSync] failed', { eventId, error: err.message });
    }
  }
);

module.exports = { onAgendaEventReminderSync };
