/* ============================================================
   PROGRESS-CONTRACT.JS — Knowledge Observability (V2, Phase 9.1)

   PURPOSE: fix a generic Progress shape usable by any long-running
   Knowledge Platform operation, not just a Builder run — the Builder's own
   `Progress` typedef (builder/contracts/state-contract.js) is scoped to
   `{stagesTotal, stagesCompleted, itemsProcessed}` and is never actually
   returned by anything; this is the generic version acquisition-engine.js
   populates for real, item by item, within one runAcquisition() call.

   RESPONSIBILITY: define ProgressReport and a pure updater.

   DEPENDENCIES: none.
   ============================================================ */

'use strict';

export const PROGRESS_SCHEMA = 'knowledge-progress@1';

/**
 * @typedef {Object} ProgressReport
 * @property {string} label       - what is progressing, e.g. a connectorId
 * @property {number} total       - -1 when not yet known
 * @property {number} completed
 * @property {number|null} percent - null when total is unknown
 * @property {string} startedAt   - ISO 8601
 * @property {string} updatedAt   - ISO 8601
 */

export function makeProgressReport(label, total = -1) {
  const now = new Date().toISOString();
  return Object.freeze({
    label, total, completed: 0,
    percent: total > 0 ? 0 : null,
    startedAt: now, updatedAt: now,
  });
}

/** Pure — returns a NEW ProgressReport with `completed` advanced. */
export function advanceProgress(report, by = 1) {
  const completed = report.completed + by;
  return Object.freeze({
    ...report,
    completed,
    percent: report.total > 0 ? Math.min(100, Math.round((completed / report.total) * 100)) : null,
    updatedAt: new Date().toISOString(),
  });
}
