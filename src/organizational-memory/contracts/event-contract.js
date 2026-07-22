/* ============================================================
   EVENT-CONTRACT.JS — Organizational Memory Observability (V2.0.7, Phase 10)

   PURPOSE: fix the shape of Archive Ingestion events, mirroring
   knowledge/acquisition/contracts/event-contract.js's onEvent idiom for
   observability parity across the whole platform.

   RESPONSIBILITY: define ARCHIVE_EVENT_TYPE and ArchiveEvent.

   DEPENDENCIES: none.
   ============================================================ */

'use strict';

export const ARCHIVE_EVENT_TYPE = Object.freeze({
  STARTED: 'started',
  FETCHED: 'fetched',
  RECORD_ARCHIVED: 'record_archived',
  RECORD_SKIPPED: 'record_skipped',
  COMPLETED: 'completed',
  FAILED: 'failed',
});

/**
 * @typedef {Object} ArchiveEvent
 * @property {string} type
 * @property {string} sourceId
 * @property {string} at
 * @property {*} [detail]
 */

export function makeArchiveEvent(type, { sourceId, detail } = {}) {
  return Object.freeze({ type, sourceId: sourceId ?? null, at: new Date().toISOString(), detail: detail ?? null });
}
