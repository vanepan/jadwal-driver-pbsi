/* ============================================================
   SESSION-CONTRACT.JS — Knowledge Acquisition (V2, Phase 9)

   PURPOSE: fix the shape of one acquisition run for one connector
   (KnowledgeAcquisitionSession) and its outcome
   (KnowledgeAcquisitionResult) — the layer acquisition-engine.js produces,
   sitting above the single-shot ConnectorResult (contracts/
   connector-contract.js) which has no notion of a session or a report.

   RESPONSIBILITY: define both shapes and constructors. No orchestration
   logic — see acquisition-engine.js.

   DEPENDENCIES: none.
   ============================================================ */

'use strict';

export const SESSION_SCHEMA = 'knowledge-acquisition-session@1';

export const SESSION_STATUS = Object.freeze({
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
});

/**
 * @typedef {Object} KnowledgeAcquisitionSession
 * @property {string} sessionId
 * @property {string} connectorId
 * @property {string} sourceId
 * @property {string|null} since
 * @property {string} startedAt   - ISO 8601
 * @property {string|null} completedAt - ISO 8601, null while running
 * @property {string} status      - one of SESSION_STATUS
 */

let _counter = 0;

export function startSession({ connectorId, sourceId, since = null }) {
  _counter += 1;
  return Object.freeze({
    sessionId: `session:${connectorId}:${Date.now()}:${_counter}`,
    connectorId, sourceId, since: since ?? null,
    startedAt: new Date().toISOString(),
    completedAt: null,
    status: SESSION_STATUS.RUNNING,
  });
}

export function completeSession(session, status) {
  return Object.freeze({ ...session, completedAt: new Date().toISOString(), status });
}

/**
 * @typedef {Object} KnowledgeAcquisitionResult
 * @property {boolean} ok
 * @property {KnowledgeAcquisitionSession} session
 * @property {number} itemsExtracted
 * @property {number} itemsWritten   - created + appended
 * @property {number} itemsSkipped
 * @property {import('./extraction-contract.js').KnowledgeExtractionError[]} errors
 * @property {import('../../observability/contracts/warning-contract.js').KnowledgeWarning[]} warnings
 *   - non-fatal (Phase 9.1) — carried through from the connector's
 *     ConnectorResult.warnings, never blocks `ok: true`.
 */

export function makeAcquisitionResult({ ok, session, itemsExtracted = 0, itemsWritten = 0, itemsSkipped = 0, errors = [], warnings = [] }) {
  return Object.freeze({
    ok, session, itemsExtracted, itemsWritten, itemsSkipped,
    errors: Object.freeze([...errors]),
    warnings: Object.freeze([...warnings]),
  });
}
