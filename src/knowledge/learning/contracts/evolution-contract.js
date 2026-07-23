/* ============================================================
   EVOLUTION-CONTRACT.JS — Teach Once, Learn Forever (V2.0.5, Phase 9.4)

   PURPOSE: fix the shape of a readable "how did this item's understanding
   change over time" timeline — derived from
   repository/knowledge-repository.js#getHistory(id) (every version of ONE
   item, already real since Phase 5), not a new data source. "Knowledge
   Evolution" is a REPORTING shape over existing history, not new state.

   RESPONSIBILITY: define KnowledgeEvolutionEntry / KnowledgeEvolutionTimeline.

   DEPENDENCIES: none (structural only — knowledge-evolution-engine.js
   does the actual derivation from getHistory()).
   ============================================================ */

'use strict';

export const EVOLUTION_SCHEMA = 'knowledge-evolution@1';

/**
 * @typedef {Object} KnowledgeEvolutionEntry
 * @property {number} version
 * @property {string} lifecycleState
 * @property {number} confidence
 * @property {string} producedBy    - provenance.connectorId AS OF this version
 *   ('nor', 'correction', 'merge', ...) — this is `provenance`, not the
 *   item's fixed `sourceType` baked into its id, precisely because
 *   provenance is expected to be repatched per-version (a correction's
 *   appended version legitimately says "a human corrected this", not the
 *   stale original connector) while `sourceType` never changes after
 *   `create()`.
 * @property {string} at            - ISO 8601 (updatedAt of this version)
 */

/**
 * @typedef {Object} KnowledgeEvolutionTimeline
 * @property {string} itemId
 * @property {KnowledgeEvolutionEntry[]} entries - oldest first
 * @property {number} correctionCount - versions whose provenance.connectorId is 'correction'
 * @property {number} confidenceDelta - latest confidence minus first confidence
 */

export function makeEvolutionEntry(version) {
  return Object.freeze({
    version: version.version,
    lifecycleState: version.lifecycleState,
    confidence: version.confidence,
    producedBy: version.provenance ? version.provenance.connectorId : null,
    at: version.updatedAt,
  });
}
