/* ============================================================
   agenda-calendar-lifecycle.js — pure Calendar display-state derivation
   (V1.31.1 "Agenda, Kalender & To-Do")

   Calendar deliberately does NOT reuse agenda-lifecycle.js's overdue
   semantics (isEventOverdue/isTaskOverdue) — a multi-day planning block
   like "Evan - Sirnas C Piala Raja, 15-20 September" must never become
   "Terlewat" just because its start date passed; it is still an active
   commitment until its END date passes. Persisted `status` only ever
   holds 'scheduled' | 'cancelled' | 'deleted' (mirroring agendaEvents'
   own vocabulary); the richer Terjadwal/Berlangsung/Selesai distinction
   is DERIVED from the date range here, exactly as overdue is derived
   (never stored) for events/tasks — same discipline, different rule.

   PURE: no Date.now() read internally, no Firebase, no DOM. `now` is
   always passed in explicitly so the UI and a future Cloud Function can
   share this exact logic without risking disagreement.
   ============================================================ */

'use strict';

/**
 * @param {{status: string, startAt: number|null, endAt: number|null}} item
 * @param {number} now epoch ms
 * @returns {'terjadwal'|'berlangsung'|'selesai'|'dibatalkan'|'dihapus'}
 */
export function calendarItemDisplayState(item, now) {
  if (!item) return 'terjadwal';
  if (item.status === 'deleted') return 'dihapus'; // defensive — deleted items are filtered upstream before reaching a view
  if (item.status === 'cancelled') return 'dibatalkan';
  if (item.startAt != null && now < item.startAt) return 'terjadwal';
  if (item.endAt != null && now > item.endAt) return 'selesai';
  return 'berlangsung';
}

export const CALENDAR_STATE_LABEL = {
  terjadwal: 'Terjadwal',
  berlangsung: 'Berlangsung',
  selesai: 'Selesai',
  dibatalkan: 'Dibatalkan',
  dihapus: 'Dihapus',
};

export function calendarStateLabel(state) {
  return CALENDAR_STATE_LABEL[state] || state;
}

/** True while `now` falls within [startAt, endAt] and the item is still
 *  active (not cancelled/deleted) — the "Berlangsung" signal month/week
 *  cells use to render a continuation/"currently running" marker. */
export function isCalendarItemActive(item, now) {
  return calendarItemDisplayState(item, now) === 'berlangsung';
}
