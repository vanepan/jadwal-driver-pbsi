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

import { create, appendVersion } from '../repository/knowledge-repository.js';
import { REPOSITORY_ERRORS } from '../repository/contracts/repository-contract.js';
import { LIFECYCLE_STATE } from '../contracts/lifecycle-contract.js';

/**
 * @param {import('../contracts/knowledge-item-contract.js').KnowledgeItem} item - must already have lifecycleState 'candidate'
 * @returns {{ok: boolean, data: object|null, error: object|null, op: 'create'|'append'|null}}
 */
export function writeExtractedCandidate(item) {
  if (item.lifecycleState !== LIFECYCLE_STATE.CANDIDATE) {
    return { ok: false, data: null, error: { code: 'INVALID_ITEM', message: 'writeExtractedCandidate: extraction output must be lifecycleState "candidate".' }, op: null };
  }
  const createResult = create(item);
  if (createResult.ok) return { ...createResult, op: 'create' };
  if (createResult.error && createResult.error.code === REPOSITORY_ERRORS.DUPLICATE_ID) {
    const appendResult = appendVersion(item.id, item);
    return { ...appendResult, op: 'append' };
  }
  return { ...createResult, op: null };
}
