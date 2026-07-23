/* ============================================================
   EXTRACTION-CONTRACT.JS — Knowledge Acquisition (V2, Phase 9)

   PURPOSE: fix the shape of the context an acquisition run builds around a
   single connector call, and the shape of a per-record extraction failure
   — distinct from ConnectorResult's single ok/error (contracts/
   connector-contract.js), which cannot say "record 4 of 12 failed, the
   rest succeeded."

   RESPONSIBILITY: define KnowledgeExtractionContext and
   KnowledgeExtractionError.

   DEPENDENCIES: none.

   NON-GOALS: does not change contracts/connector-contract.js's
   `fetch(since)` signature — that contract is already proven and load-
   bearing (Phase 3). KnowledgeExtractionContext is what
   acquisition-engine.js builds internally around a fetch() call, for its
   own session/report bookkeeping; a connector is never required to accept
   it as a parameter.
   ============================================================ */

'use strict';

export const EXTRACTION_SCHEMA = 'knowledge-extraction@1';

export const EXTRACTION_ERRORS = Object.freeze({
  RECORD_EXTRACTION_FAILED: 'RECORD_EXTRACTION_FAILED',
  NORMALIZATION_FAILED: 'NORMALIZATION_FAILED',
});

/**
 * @typedef {Object} KnowledgeExtractionContext
 * @property {string} connectorId
 * @property {string} sourceId
 * @property {string|null} since      - watermark passed to connector.fetch()
 * @property {string} requestedAt     - ISO 8601
 */

export function makeExtractionContext({ connectorId, sourceId, since = null }) {
  return Object.freeze({
    connectorId, sourceId, since: since ?? null,
    requestedAt: new Date().toISOString(),
  });
}

/**
 * @typedef {Object} KnowledgeExtractionError
 * @property {string} code            - one of EXTRACTION_ERRORS
 * @property {string} message
 * @property {string} connectorId
 * @property {string|null} sourceRef  - which record within the source failed, if known
 */

export function makeExtractionError(code, message, { connectorId, sourceRef = null } = {}) {
  return Object.freeze({ code, message, connectorId: connectorId ?? null, sourceRef });
}
