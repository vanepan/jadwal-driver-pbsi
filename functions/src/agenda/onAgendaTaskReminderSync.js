'use strict';

/* ============================================================
   agenda/onAgendaTaskReminderSync.js — timer-queue maintenance for
   /agendaTasks (V1.31 Agenda & To-Do, Phase C2)

   Structurally identical to onAgendaEventReminderSync.js — see that
   file's header for the shared design rationale. 'done' tombstones
   pending rows (spec: completion stops future reminders); reopening
   (done -> not-done) re-syncs a fresh plan, same "only 'fired' survives
   a re-sync" rule making this correct with no special-casing — this is
   also exactly the "reopened task" scenario js/agenda/agenda-lifecycle.js's
   isTaskOverdue() was tested against in Phase C1 (a reopened, still-
   overdue task recomputes as overdue again with no hidden state) — this
   trigger is the reminder-queue side of that same guarantee.
   ============================================================ */

const { onValueWritten } = require('firebase-functions/v2/database');
const logger = require('firebase-functions/logger');
const { REGION, DB_INSTANCE } = require('../config/constants');
const { syncAgendaOffsets, tombstoneAgendaOffsets } = require('../reminders/schedule');
const { planForTask } = require('./reminderPlan');

const ENTITY_TYPE = 'agendaTask';

const onAgendaTaskReminderSync = onValueWritten(
  { ref: '/agendaTasks/{taskId}', region: REGION, instance: DB_INSTANCE },
  async (event) => {
    const before = event.data.before.val();
    const after = event.data.after.val();
    const taskId = event.params.taskId;

    try {
      if (!before && after) {
        const plan = planForTask(after);
        if (plan) await syncAgendaOffsets(ENTITY_TYPE, taskId, plan);
        return;
      }
      if (!after) return; // Rules forbid hard delete — defensive only

      if (after.status === 'done') {
        await tombstoneAgendaOffsets(ENTITY_TYPE, taskId);
        return;
      }

      const scheduleChanged = !before
        || before.dueAt !== after.dueAt
        || before.dueTime !== after.dueTime
        || before.status === 'done';
      if (scheduleChanged) {
        const plan = planForTask(after);
        if (plan) await syncAgendaOffsets(ENTITY_TYPE, taskId, plan);
      }
    } catch (err) {
      logger.error('[onAgendaTaskReminderSync] failed', { taskId, error: err.message });
    }
  }
);

module.exports = { onAgendaTaskReminderSync };
