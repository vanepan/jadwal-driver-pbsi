'use strict';

/* ============================================================
   agenda/reminderPlan.js — pure fireAt computation for Agenda reminders
   (V1.31 Agenda & To-Do, Phase C2)

   Mirrors functions/src/reminders/schedule.js#computeFireAts's role for
   assignments, generalized for Agenda's two-offset shape: 'h1' (fires
   BEFORE the instant, like assignments' H-1h) and 'overdue' (fires AT/
   AFTER the instant — a genuinely new concept assignments' reminders
   don't need, since a trip has no "overdue" state of its own).

   PURE: no Firebase, no Date.now(). Both functions take the already-
   derived `startAt`/`endAt`/`dueAt` epoch-ms fields straight off the
   record (computed client-side at write time per the approved data
   model — see docs/AGENDA_TODO_PHASE_B_ARCHITECTURE_VALIDATION_v1.31.0.0.md
   §1), never re-derive them from date+time strings.
   ============================================================ */

const H1_MS = 60 * 60 * 1000;

/**
 * @param {{startAt: number|null, endAt: number|null}} event
 * @returns {{h1: number, overdue: number}|null} null if the event has no
 *   computable start/end (defensive — the C1 Rules already require both
 *   startAt and endAt to be well-formed on any accepted write, so this
 *   should not happen against real data).
 */
function planForEvent(event) {
  if (!event || event.startAt == null || event.endAt == null) return null;
  return { h1: event.startAt - H1_MS, overdue: event.endAt };
}

/**
 * Task 'h1' is OMITTED (not zero, not null — absent) when the task has no
 * explicit due TIME, per the spec's own "Reminder H-1 JAM sebelum due
 * date/time jika due time tersedia" instruction — a date-only task never
 * gets an hour-based reminder. 'overdue' always applies once dueAt exists,
 * regardless of whether a time was given (dueAt already resolves to
 * end-of-day for a date-only task per the C1 data model).
 * @param {{dueAt: number|null, dueTime: string|null}} task
 * @returns {{h1?: number, overdue: number}|null}
 */
function planForTask(task) {
  if (!task || task.dueAt == null) return null;
  const plan = { overdue: task.dueAt };
  if (task.dueTime != null) plan.h1 = task.dueAt - H1_MS;
  return plan;
}

module.exports = { planForEvent, planForTask, H1_MS };
