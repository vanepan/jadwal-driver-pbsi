/* ============================================================
   agenda-view-model.js — pure presentation helpers
   (V1.31 Agenda & To-Do, Phase C3)

   PURE: no Firebase, no DOM construction (that's agenda-view-*.js's
   job) — just classification/sorting/formatting logic shared by the
   Agenda, Calendar, and To-Do views so the three renderers can never
   disagree about e.g. what counts as "overdue" or how priority sorts.
   ============================================================ */

'use strict';

import { isTaskOverdue, isEventOverdue } from './agenda-lifecycle.js';
import { formatDateShort, formatDateLong } from '../utils.js';

const PRIORITY_RANK = { urgent: 0, penting: 1, normal: 2 };
const PRIORITY_LABEL = { urgent: 'Urgent', penting: 'Penting', normal: 'Normal' };
const TYPE_LABEL = {
  rapat: 'Rapat', kegiatan: 'Kegiatan', kunjungan: 'Kunjungan', perjalanan: 'Perjalanan',
  maintenance: 'Maintenance', deadline: 'Deadline', lainnya: 'Lainnya',
};
const STATUS_LABEL = { not_started: 'Belum Mulai', in_progress: 'Dalam Proses', done: 'Selesai' };

export function priorityLabel(p) { return PRIORITY_LABEL[p] || PRIORITY_LABEL.normal; }
export function typeLabel(t) { return TYPE_LABEL[t] || TYPE_LABEL.lainnya; }
export function statusLabel(s) { return STATUS_LABEL[s] || s; }

/** Sorts tasks: urgent -> penting -> normal, then by due date (soonest
 *  first, undated last) within each tier — the "what needs my attention
 *  first" ordering the To-Do view and the Today section both use. */
export function sortTasksByPriority(tasks) {
  return [...(tasks || [])].sort((a, b) => {
    const pr = (PRIORITY_RANK[a.priority] ?? 2) - (PRIORITY_RANK[b.priority] ?? 2);
    if (pr !== 0) return pr;
    if (!a.dueAt && !b.dueAt) return 0;
    if (!a.dueAt) return 1;
    if (!b.dueAt) return -1;
    return a.dueAt - b.dueAt;
  });
}

/** Sorts events chronologically by their local time-of-day (HH:MM string
 *  compares correctly lexicographically). */
export function sortEventsByTime(events) {
  return [...(events || [])].sort((a, b) => (a.startAt || 0) - (b.startAt || 0));
}

/**
 * @param {Object} task
 * @param {number} now epoch ms
 * @returns {'done'|'overdue'|'in_progress'|'not_started'} the badge state
 *   to render — distinct from `task.status` itself, since 'overdue' is
 *   derived (never stored, per C1's own schema decision).
 */
export function taskDisplayState(task, now) {
  if (task.status === 'done') return 'done';
  if (isTaskOverdue(task, now)) return 'overdue';
  return task.status;
}

/** @returns {'cancelled'|'overdue'|'scheduled'} */
export function eventDisplayState(event, now) {
  if (event.status === 'cancelled') return 'cancelled';
  if (isEventOverdue(event, now)) return 'overdue';
  return 'scheduled';
}

export function checklistProgress(task) {
  const items = task.checklist || [];
  const done = items.filter((i) => i.done).length;
  return { done, total: items.length };
}

/** "14.30 WIB" from an epoch-ms instant — matches the spec's own example
 *  format exactly (§33: "14.30 WIB", not "14:30" or "2:30 PM"). */
export function formatClock(epochMs) {
  if (epochMs == null) return '';
  const d = new Date(epochMs);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}.${mm} WIB`;
}

export { formatDateShort, formatDateLong };

/** Resolve display names for a map of {username: {...}} via /userProfiles
 *  already loaded by the caller (a plain lookup object, not a live read —
 *  keeps this function pure). Falls back to the raw username. */
export function resolveNames(usernames, profileLookup) {
  return (usernames || []).map((u) => (profileLookup && profileLookup[u] && profileLookup[u].displayName) || u);
}

/** Splits an event's participants map into PIC / ordinary-participant
 *  username arrays — the one place this distinction is computed, reused
 *  by every renderer that needs to show "PIC: X, Y" separately. */
export function splitParticipants(participants) {
  const pic = [];
  const ordinary = [];
  for (const [username, entry] of Object.entries(participants || {})) {
    (entry && entry.isPic ? pic : ordinary).push(username);
  }
  return { pic, ordinary };
}
