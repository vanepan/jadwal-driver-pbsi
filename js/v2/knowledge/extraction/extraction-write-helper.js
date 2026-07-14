/* ============================================================
   EXTRACTION-WRITE-HELPER.JS — Knowledge Learning Foundation (V2.0.8, Phase 11)

   PURPOSE: the ONE place every extraction engine in this directory writes
   through — "everything should produce Candidate Knowledge" (never
   Approved, per Decision 6). Mirrors acquisition-engine.js's
   create-or-appendVersion-on-DUPLICATE_ID idempotency, so re-running an
   extraction updates its own prior output instead of duplicating it.

   RESPONSIBILITY: `writeExtractedCandidate(item)`.

   DEPENDENCIES: repository/knowledge-repository.js,
   repository/contracts/repository-contract.js.

   NON-GOALS: does not decide what to extract — see each engine's own
   file. Never writes anything but `lifecycleState: 'candidate'`.
   ============================================================ */

'use strict';

// Phase 3 — a CLIENT of the Knowledge Service, no longer a writer. The
// create-or-append-on-DUPLICATE_ID dance this file used to perform itself is
// the same one acquisition-engine.js performed, character for character; it
// now lives once, in the one module that owns knowledge (services/
// knowledge-service.js#ingest).
import { ingest } from '../services/knowledge-service.js';
import { LIFECYCLE_STATE } from '../contracts/lifecycle-contract.js';

/**
 * @param {import('../contracts/knowledge-item-contract.js').KnowledgeItem} item - must already have lifecycleState 'candidate'
 * @returns {{ok: boolean, data: object|null, error: object|null, op: 'create'|'append'|null}}
 */
export function writeExtractedCandidate(item) {
  // Extraction's own narrower rule (its output is always a Candidate — never a
  // Draft) stays here, where it belongs: the Service enforces what is true of
  // ALL knowledge, this file enforces what is true of EXTRACTED knowledge.
  if (item.lifecycleState !== LIFECYCLE_STATE.CANDIDATE) {
    return { ok: false, data: null, error: { code: 'INVALID_ITEM', message: 'writeExtractedCandidate: extraction output must be lifecycleState "candidate".' }, op: null };
  }
  return ingest(item);
}
