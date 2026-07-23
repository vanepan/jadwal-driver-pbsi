/* ============================================================
   EVENT-CONTRACT.JS — Knowledge Acquisition Observability (V2, Phase 9.1)

   PURPOSE: fix the shape of events a single runAcquisition() call emits,
   mirroring knowledge/builder/contracts/state-contract.js's
   BUILDER_EVENT_TYPE/makeBuilderEvent — the ONE events idiom already
   established in this codebase (a per-call `onEvent` callback, not a
   process-wide EventEmitter). Builder events are about STAGE sequencing;
   these are about what ONE connector's acquisition run actually did.

   RESPONSIBILITY: define ACQUISITION_EVENT_TYPE and AcquisitionEvent.

   DEPENDENCIES: none.

   NON-GOALS: does not emit anything itself — see acquisition-engine.js,
   which accepts an optional `opts.onEvent` and calls `makeAcquisitionEvent`
   the same way builder-orchestrator.js calls `makeBuilderEvent`.
   ============================================================ */

'use strict';

/** Closed set of event types a running acquisition may emit via
 *  runAcquisition(connectorId, { onEvent }). */
export const ACQUISITION_EVENT_TYPE = Object.freeze({
  STARTED: 'started',
  FETCHED: 'fetched',
  ITEM_WRITTEN: 'item_written',
  ITEM_SKIPPED: 'item_skipped',
  COMPLETED: 'completed',
  FAILED: 'failed',
});

/**
 * @typedef {Object} AcquisitionEvent
 * @property {string} type        - one of ACQUISITION_EVENT_TYPE
 * @property {string} sessionId
 * @property {string} connectorId
 * @property {string} at          - ISO 8601
 * @property {*} [detail]
 */

export function makeAcquisitionEvent(type, { sessionId, connectorId, detail } = {}) {
  return Object.freeze({
    type,
    sessionId: sessionId ?? null,
    connectorId: connectorId ?? null,
    at: new Date().toISOString(),
    detail: detail ?? null,
  });
}
