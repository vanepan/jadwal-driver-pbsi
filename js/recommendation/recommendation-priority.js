/* ============================================================
   RECOMMENDATION-PRIORITY.JS — Fleet Recommendation Engine (v1.19.7)

   The priority + execution-window vocabulary for the Recommendation layer.
   Prediction answers "what will happen?"; Explainability answers "why?"; the
   Recommendation layer answers "what should the administrator do, and how
   urgently?". This module owns ONLY the urgency grammar those recommendations
   are ranked and scheduled with.

   ── PURE MAPPING ONLY ────────────────────────────────────────────────────────
   It computes NO prediction and invents NO risk score. It maps an ALREADY
   CERTIFIED risk band (LOW / MODERATE / ELEVATED / HIGH / CRITICAL — the exact
   keys the Prediction Engine emits) onto a recommendation PRIORITY and an
   execution WINDOW. There is no maths here, only a deterministic lookup, so the
   whole Recommendation layer ranks and schedules identically everywhere.

   ── DESIGN AUTHORITY ─────────────────────────────────────────────────────────
   Priorities reuse the EXISTING Executive status tones (ok / info / warn /
   danger) — no new colour system. The five levels map onto those four tones so
   the board, cards and drawer inherit dark-mode safety and high contrast for
   free.

   API (all pure):
     PRIORITY_LEVELS                       → frozen level table
     priorityFor(level, actionable)        → PriorityLevel
     priorityRank(key)                     → number (0 = most urgent)
     TIMELINE_BUCKETS                      → frozen window table
     timelineFor(level, kind)              → TimelineBucket
   ============================================================ */

'use strict';

/* ── Priority levels ──────────────────────────────────────────────────────────
   Five executive levels, ordered most-urgent first. `tone` is one of the four
   Executive status tones (no new palette). `rank` drives deterministic sorting
   (lower = more urgent). Labels are the user-facing Indonesian words the whole
   platform speaks. */
export const PRIORITY_LEVELS = Object.freeze([
  { key: 'critical',      label: 'Kritis',        tone: 'danger', rank: 0 },
  { key: 'high',          label: 'Tinggi',        tone: 'danger', rank: 1 },
  { key: 'medium',        label: 'Sedang',        tone: 'warn',   rank: 2 },
  { key: 'low',           label: 'Rendah',        tone: 'info',   rank: 3 },
  { key: 'informational', label: 'Informasional', tone: 'ok',     rank: 4 },
]);

const PRIORITY_BY_KEY = Object.freeze(
  PRIORITY_LEVELS.reduce((m, p) => { m[p.key] = p; return m; }, {}));

/* Risk band (the engine's own level key) → priority key WHEN an operational
   action is warranted. A vehicle with no actionable pressure collapses to
   `informational` regardless of band (handled by `actionable=false`). */
const BAND_TO_PRIORITY = Object.freeze({
  CRITICAL: 'critical',
  HIGH: 'high',
  ELEVATED: 'medium',
  MODERATE: 'low',
  LOW: 'informational',
});

/**
 * The priority for a certified risk band.
 * @param {string} level      the engine risk-band key (LOW…CRITICAL)
 * @param {boolean} actionable whether the recommendation asks for an action at
 *        all; a monitoring / no-action recommendation is always `informational`.
 * @returns {{key,label,tone,rank}} a frozen PriorityLevel (never null).
 */
export function priorityFor(level, actionable = true) {
  if (!actionable) return PRIORITY_BY_KEY.informational;
  const key = BAND_TO_PRIORITY[level] || 'informational';
  return PRIORITY_BY_KEY[key] || PRIORITY_BY_KEY.informational;
}

/** Sortable rank for a priority key (0 = most urgent; unknown → last). */
export function priorityRank(key) {
  const p = PRIORITY_BY_KEY[key];
  return p ? p.rank : PRIORITY_LEVELS.length;
}

/* ── Execution windows ────────────────────────────────────────────────────────
   The recommended window a recommendation should be acted within. Ordered
   soonest-first; `order` drives the Priority Timeline grouping. Windows are
   presentation buckets over the SAME certified horizon the dashboards already
   headline (urgent maintenance at 3 days, everything else at 7) — they add no
   new predicted date. */
export const TIMELINE_BUCKETS = Object.freeze([
  { key: 'immediate', label: 'Segera',        note: 'Perlu tindakan segera',        order: 0 },
  { key: 'today',     label: 'Hari Ini',      note: 'Dalam hari ini',               order: 1 },
  { key: 'this-week', label: 'Minggu Ini',    note: 'Dalam beberapa hari ke depan', order: 2 },
  { key: 'next-week', label: 'Minggu Depan',  note: 'Pada minggu berikutnya',       order: 3 },
  { key: 'later',     label: 'Selanjutnya',   note: 'Pemantauan berkelanjutan',     order: 4 },
]);

const TIMELINE_BY_KEY = Object.freeze(
  TIMELINE_BUCKETS.reduce((m, t) => { m[t.key] = t; return m; }, {}));

/**
 * The execution window for a certified risk band. Urgent maintenance is the only
 * case that compresses to `immediate`; the rest widen with decreasing severity.
 * @param {string} level  the engine risk-band key (LOW…CRITICAL)
 * @param {string} kind   the dominant risk kind ('maintenance' | 'administrative'
 *                        | 'availability') — only used to flag urgent maintenance.
 * @returns {{key,label,note,order}} a frozen TimelineBucket (never null).
 */
export function timelineFor(level, kind) {
  if (level === 'CRITICAL') {
    return kind === 'maintenance' ? TIMELINE_BY_KEY.immediate : TIMELINE_BY_KEY.today;
  }
  if (level === 'HIGH') return TIMELINE_BY_KEY['this-week'];
  if (level === 'ELEVATED') return TIMELINE_BY_KEY['next-week'];
  return TIMELINE_BY_KEY.later;
}

/** Look up a timeline bucket by key (for grouping); unknown → `later`. */
export function timelineByKey(key) {
  return TIMELINE_BY_KEY[key] || TIMELINE_BY_KEY.later;
}

export default {
  PRIORITY_LEVELS,
  priorityFor,
  priorityRank,
  TIMELINE_BUCKETS,
  timelineFor,
  timelineByKey,
};
