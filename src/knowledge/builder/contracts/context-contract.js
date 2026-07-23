/* ============================================================
   CONTEXT-CONTRACT.JS — Knowledge Builder Foundation (V2, Phase 4)

   PURPOSE: fix the shape of the one object every Stage receives — the
   Builder's incremental-indexing watermarks (Decision 9) plus whatever
   options this run was invoked with. Kept as its own contract so Stages
   never reach into the orchestrator's internals.

   RESPONSIBILITY: define BuilderContext and IndexWatermark.

   DEPENDENCIES: none.

   NON-GOALS: does not populate real watermarks (no connector has ever run,
   so every watermark starts null). Does not decide HOW a stage uses the
   context — that is each Stage's own concern.

   FUTURE EVOLUTION: Phase 4+ populates `watermarks` from wherever the
   Builder decides to persist them (likely inside the repository once one
   exists, mirroring functions/src/reminders/schedule.js's `fireAt`
   watermark pattern).
   ============================================================ */

'use strict';

/**
 * @typedef {Object} IndexWatermark
 * @property {string} connectorId
 * @property {string|null} lastIndexedAt - ISO 8601, or null if never indexed
 */

/**
 * @typedef {Object} BuilderContext
 * @property {string} runId              - unique per builder run, for correlating events/logs
 * @property {'incremental'|'full'} mode
 * @property {IndexWatermark[]} watermarks
 * @property {import('./error-contract.js').CancellationToken} cancellationToken
 * @property {(event: import('./state-contract.js').BuilderEvent) => void} [onEvent]
 */

/** Build a fresh context for a run. Pure construction — does not start anything. */
export function createContext({ runId, mode, watermarks = [], cancellationToken, onEvent } = {}) {
  return Object.freeze({
    runId: runId ?? null,
    mode: mode === 'full' ? 'full' : 'incremental',
    watermarks: Object.freeze([...watermarks]),
    cancellationToken: cancellationToken ?? null,
    onEvent: typeof onEvent === 'function' ? onEvent : null,
  });
}
