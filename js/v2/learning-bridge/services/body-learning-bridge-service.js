/* ============================================================
   BODY-LEARNING-BRIDGE-SERVICE.JS — Universal Learning Engine, Body Bridge (Phase 12.6.6)

   PURPOSE: pullBodyEventsAsSignals() — the ONE impure orchestrator in
   this domain. Reads js/v2/body/repository/body-event-repository.js's
   `list()` (read-only, NEVER `append()` — the write boundary
   scripts/learning-signal-ownership-check.mjs, Phase 12.6.7, asserts by
   direct source inspection), maps each BodyEvent through
   adapters/body-signal-adapter.js, and calls
   js/v2/learning/services/learning-signal-service.js#emitLearningSignal()
   — the SAME entry point any other domain would call directly, Body's
   pull adapter is not a special or privileged path into Learning.

   RESPONSIBILITY: pullBodyEventsAsSignals(filter).

   DEPENDENCIES: js/v2/body/repository/body-event-repository.js (list()
   only), adapters/body-signal-adapter.js,
   js/v2/learning/services/learning-signal-service.js (emitLearningSignal
   only — never learning-repository.js directly).

   NON-GOALS: no scheduler, no cron trigger, no live caller anywhere in
   this phase — mirrors js/v2/body/services/body-sensing-service.js's own
   NON-GOAL ("does not decide WHEN to run"), applied one layer downstream.
   This function is callable only from a test/fixture harness
   (scripts/learning-bridge-check.mjs) in Phase 12.6 — wiring a real
   trigger (a scheduler, a UI action) is explicitly deferred to a later,
   separately-approved sprint. One malformed BodyEvent must never sink the
   whole pull — each mapping is isolated, mirroring every connector/sensor
   in this platform's own per-record isolation discipline.
   ============================================================ */

'use strict';

import { list as listBodyEvents } from '../../body/repository/body-event-repository.js';
import { mapBodyEventToSignalSeed } from '../adapters/body-signal-adapter.js';
import { emitLearningSignal } from '../../learning/services/learning-signal-service.js';

/**
 * @param {{type?: string, entityType?: string, entityId?: string}} [filter]
 * @returns {{ok: boolean, data: {pulled: number, emitted: number, failed: number, outcomes: Array}|null, error: object|null}}
 */
export function pullBodyEventsAsSignals(filter = {}) {
  const result = listBodyEvents(filter);
  if (!result.ok) return { ok: false, data: null, error: result.error };

  const outcomes = [];
  for (const event of result.data) {
    try {
      const seed = mapBodyEventToSignalSeed(event);
      outcomes.push({ bodyEventId: event.id, emitted: emitLearningSignal(seed) });
    } catch (e) {
      outcomes.push({
        bodyEventId: event.id,
        emitted: { ok: false, data: null, error: { code: 'MAPPING_FAILED', message: e.message }, op: null, confidence: null, conflicts: [], dedupCandidates: [] },
      });
    }
  }

  return {
    ok: true,
    error: null,
    data: {
      pulled: result.data.length,
      emitted: outcomes.filter((o) => o.emitted.ok).length,
      failed: outcomes.filter((o) => !o.emitted.ok).length,
      outcomes,
    },
  };
}
