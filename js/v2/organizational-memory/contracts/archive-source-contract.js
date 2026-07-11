/* ============================================================
   ARCHIVE-SOURCE-CONTRACT.JS — Organizational Memory Foundation (V2.0.7, Phase 10)

   PURPOSE: fix the one shape every archive source conforms to — mirrors
   knowledge/contracts/connector-contract.js's Connector/ConnectorResult
   shape exactly (same reasoning: read-only, predictable success/failure,
   never throws), applied to ArchiveRecord instead of KnowledgeItem. This
   is genuine pattern reuse — the SAME proven shape — not a copy of logic,
   since an ArchiveSource and a Connector produce structurally different
   items for a structurally different repository.

   RESPONSIBILITY: define ArchiveSource and ArchiveSourceResult.

   DEPENDENCIES: none.

   NON-GOALS: no source is implemented here. Every source is read-only —
   the same "Core Operations never depends on Intelligence" boundary
   already established for Connectors applies here.
   ============================================================ */

'use strict';

export const ARCHIVE_SOURCE_SCHEMA = 'archive-source@1';

export const ARCHIVE_SOURCE_ERRORS = Object.freeze({
  FETCH_FAILED: 'FETCH_FAILED',
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
});

/**
 * @typedef {Object} ArchiveSource
 * @property {string} id
 * @property {string} version
 * @property {string} description
 * @property {() => ArchiveSourceResult} fetch
 */

/**
 * @typedef {Object} ArchiveSourceResult
 * @property {boolean} ok
 * @property {import('./archive-record-contract.js').ArchiveRecord[]|null} items
 * @property {{code: string, message: string}|null} error
 * @property {string} sourceId
 */

export function archiveSourceSuccess(items, { sourceId } = {}) {
  return Object.freeze({ ok: true, items: Object.freeze(items ?? []), error: null, sourceId: sourceId ?? null });
}

export function archiveSourceFailure(code, message, { sourceId } = {}) {
  return Object.freeze({ ok: false, items: null, error: Object.freeze({ code, message }), sourceId: sourceId ?? null });
}

export function isArchiveSource(s) {
  return !!s && typeof s === 'object'
    && typeof s.id === 'string' && s.id.length > 0
    && typeof s.version === 'string' && s.version.length > 0
    && typeof s.fetch === 'function';
}
