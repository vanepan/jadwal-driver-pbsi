/* ============================================================
   WARNING-CONTRACT.JS — Knowledge Observability (V2, Phase 9.1)

   PURPOSE: fix the shape of a non-fatal problem — distinct from
   contracts/connector-contract.js's ConnectorResult.error (which fails the
   WHOLE fetch) and acquisition/contracts/extraction-contract.js's
   KnowledgeExtractionError (which is per-record but still counted as a
   failure in the report). A Warning means "acquisition still succeeded,
   but something is worth a human's attention" — e.g. one malformed source
   record was skipped while the rest of the batch acquired normally.

   RESPONSIBILITY: define KnowledgeWarning and a constructor.

   DEPENDENCIES: none.
   ============================================================ */

'use strict';

export const WARNING_SCHEMA = 'knowledge-warning@1';

export const WARNING_SEVERITY = Object.freeze({
  INFO: 'info',
  LOW: 'low',
  MEDIUM: 'medium',
});

/**
 * @typedef {Object} KnowledgeWarning
 * @property {string} code
 * @property {string} message
 * @property {string} connectorId
 * @property {string|null} sourceRef
 * @property {string} severity - one of WARNING_SEVERITY
 * @property {string} at       - ISO 8601
 */

export function makeWarning(code, message, { connectorId, sourceRef = null, severity = WARNING_SEVERITY.LOW } = {}) {
  return Object.freeze({
    code, message, connectorId: connectorId ?? null, sourceRef, severity,
    at: new Date().toISOString(),
  });
}
