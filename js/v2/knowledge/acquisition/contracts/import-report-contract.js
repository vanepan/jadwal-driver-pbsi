/* ============================================================
   IMPORT-REPORT-CONTRACT.JS — Knowledge Acquisition (V2, Phase 9)

   PURPOSE: fix the shape of KnowledgeImportReport — the human-readable
   summary of one acquisition run, derived from a completed
   KnowledgeAcquisitionResult (session-contract.js). This is what a future
   Review UI (explicitly out of scope for V2.0.2) would read to show "what
   did the last NOR acquisition do" without replaying the run.

   RESPONSIBILITY: define KnowledgeImportReport and a pure builder that
   derives one from a KnowledgeAcquisitionResult.

   DEPENDENCIES: session-contract.js (typedef reference only).

   NON-GOALS: does not persist the report anywhere — acquisition-engine.js
   returns it as part of its result; storing report history is a future
   consumer's concern.
   ============================================================ */

'use strict';

export const IMPORT_REPORT_SCHEMA = 'knowledge-import-report@1';

/**
 * @typedef {Object} KnowledgeImportReport
 * @property {string} sessionId
 * @property {string} connectorId
 * @property {string} sourceId
 * @property {number} itemsFound
 * @property {number} itemsCreated
 * @property {number} itemsUpdated
 * @property {number} itemsSkipped
 * @property {{code: string, message: string}[]} errors
 * @property {string} generatedAt - ISO 8601
 */

/**
 * @param {import('./session-contract.js').KnowledgeAcquisitionResult} result
 * @param {{itemsCreated: number, itemsUpdated: number}} counts
 */
export function buildImportReport(result, { itemsCreated = 0, itemsUpdated = 0 } = {}) {
  return Object.freeze({
    sessionId: result.session.sessionId,
    connectorId: result.session.connectorId,
    sourceId: result.session.sourceId,
    itemsFound: result.itemsExtracted,
    itemsCreated,
    itemsUpdated,
    itemsSkipped: result.itemsSkipped,
    errors: Object.freeze(result.errors.map((e) => ({ code: e.code, message: e.message }))),
    generatedAt: new Date().toISOString(),
  });
}
