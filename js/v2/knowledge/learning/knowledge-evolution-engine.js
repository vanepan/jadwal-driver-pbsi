/* ============================================================
   KNOWLEDGE-EVOLUTION-ENGINE.JS — Teach Once, Learn Forever (V2.0.5, Phase 9.4)

   PURPOSE: "Knowledge Evolution" — a readable timeline of how ONE item's
   understanding changed, derived entirely from
   repository/knowledge-repository.js#getHistory(id) (every version of ONE
   item, real since Phase 5). Not a new data source — a reporting shape
   over data that already exists.

   RESPONSIBILITY: `getKnowledgeEvolution(itemId)`.

   DEPENDENCIES: repository/knowledge-repository.js,
   contracts/evolution-contract.js.
   ============================================================ */

'use strict';

import {
  getKnowledgeHistory as getHistory,
} from '../services/knowledge-service.js';
import { makeEvolutionEntry } from './contracts/evolution-contract.js';

/**
 * @param {string} itemId
 * @returns {import('./contracts/evolution-contract.js').KnowledgeEvolutionTimeline|null}
 */
export function getKnowledgeEvolution(itemId) {
  const result = getHistory(itemId);
  if (!result.ok) return null;

  const entries = result.data.map(makeEvolutionEntry);
  const correctionCount = entries.filter((e) => e.producedBy === 'correction').length;
  const confidenceDelta = entries.length ? entries[entries.length - 1].confidence - entries[0].confidence : 0;

  return Object.freeze({ itemId, entries: Object.freeze(entries), correctionCount, confidenceDelta });
}
