/* ============================================================
   agenda-lifecycle.js — pure overdue-derivation helpers
   (V1.31 Agenda & To-Do, Phase C1)

   Overdue is a DERIVED state, never stored — neither /agendaEvents nor
   /agendaTasks has an `isOverdue` field (see database.rules.json's
   .validate required-field lists, which deliberately omit one), per the
   product spec's own "Overdue adalah state turunan... bukan harus
   membuat duplikasi record" instruction.

   Both functions are PURE: no Date.now() read internally, no Firebase,
   no DOM, no hidden state. `now` is always passed in explicitly so the
   UI (a badge) and a future Cloud Function reminder tick can share this
   exact logic without ever risking the two disagreeing — mirroring
   js/utils.js#scheduledTimeState()'s existing precedent for assignments.
   ============================================================ */

'use strict';

/**
 * @param {{status: string, dueAt: number|null}} task
 * @param {number} now epoch ms
 * @returns {boolean}
 */
export function isTaskOverdue(task, now) {
  if (!task) return false;
  // 'deleted' (V1.31.1 soft-delete) suppresses overdue exactly like 'done'
  // — defensive here (agenda-store.js#getVisibleTasks() already filters
  // deleted tasks out before any view computes display state), but a
  // deleted task is never "outstanding" regardless of caller.
  if (task.status === 'done' || task.status === 'deleted') return false;
  if (task.dueAt == null) return false;
  return now > task.dueAt;
}

/**
 * @param {{status: string, acknowledgedAt: string|null, endAt: number|null}} event
 * @param {number} now epoch ms
 * @returns {boolean}
 */
export function isEventOverdue(event, now) {
  if (!event) return false;
  if (event.status !== 'scheduled') return false;
  if (event.acknowledgedAt != null) return false;
  if (event.endAt == null) return false;
  return now > event.endAt;
}
