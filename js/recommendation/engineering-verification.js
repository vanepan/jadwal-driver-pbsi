/* ============================================================
   RECOMMENDATION/ENGINEERING-VERIFICATION.JS — v1.23.0 hotfix

   Single source of truth for "engineering assignments awaiting coordinator
   verification" — an ASSIGNMENT-level count, not a per-worker count. An
   assignment with two workers who both finished but haven't been verified
   is ONE unit of backlog, not two.

   Extracted from js/widgets/executive/index.js's former private
   unverifiedEngineeringAssignments(ctx) (same logic, byte-identical
   grouping/filter/sort — only the input changed from `ctx` to the raw
   `engineeringEvents` array) so the Executive Attention section and the
   Executive Recommendation section can no longer compute two different
   counts for the same fact. Recommendation previously derived its own count
   from workerProductivity (a per-participant sum), which diverges from
   Attention's assignment-level count whenever a backlog assignment has more
   than one worker — a normal case for equal-worker participant assignments.

   Pure: no DOM, no Firebase, no side effects.
   ============================================================ */

'use strict';

/**
 * Engineering assignments that finished but were never verified (or
 * cancelled), computed from the same allowlisted timeline events every
 * Executive Briefing section already reads (js/app.js's ctx.engineeringEvents).
 * @param {Array<{type:string, assignmentId:*, assignmentTitle?:string, timestamp:*}>} engineeringEvents
 * @returns {Array<{id:*, title:string, finishedAt:number}>} oldest-finished first
 */
export function unverifiedEngineeringAssignments(engineeringEvents) {
  const byAssignment = new Map();
  for (const e of engineeringEvents || []) {
    const id = e.assignmentId;
    if (id == null) continue;
    if (!byAssignment.has(id)) byAssignment.set(id, { title: e.assignmentTitle, finishedAt: null, verified: false, cancelled: false });
    const rec = byAssignment.get(id);
    if (e.type === 'finished') rec.finishedAt = Date.parse(e.timestamp || 0) || rec.finishedAt;
    if (e.type === 'verified') rec.verified = true;
    if (e.type === 'cancelled') rec.cancelled = true;
  }
  return [...byAssignment.entries()]
    .filter(([, r]) => r.finishedAt != null && !r.verified && !r.cancelled)
    .map(([id, r]) => ({ id, title: r.title || 'Penugasan', finishedAt: r.finishedAt }))
    .sort((a, b) => a.finishedAt - b.finishedAt);
}
