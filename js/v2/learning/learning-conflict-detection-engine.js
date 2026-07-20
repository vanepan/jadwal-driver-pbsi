/* ============================================================
   LEARNING-CONFLICT-DETECTION-ENGINE.JS — Universal Learning Engine (Phase 12.6.3)

   PURPOSE: detect when a new LearningSignal contradicts an existing,
   same-scope fact. Fresh, LearningScope-shaped algorithm — mirrors
   organizational-memory/archive-relationship-engine.js's bucket-then-
   pairwise-verdict SHAPE only (that engine's own code is hardcoded to
   ArchiveRecord's exact fields — documentHash/documentNumber/
   documentDate/senderOrigin/supersedesId — and is not importable or
   reusable here). Exact-match on `scopeKey()`, exact-match on
   contradictory `after` values — the same "no scoring, no guessing"
   discipline that engine states for itself, applied to new data.

   A conflict is meaningfully different from a duplicate: same scope +
   SAME `after` is learning-service.js#record()'s own existing no-op path
   (a duplicate observation). Same scope + DIFFERENT `after` is a real,
   checkable disagreement — a conflict. This engine only ever reports the
   second case.

   RESPONSIBILITY: classifySignalConflict(a, b) (pure pairwise verdict),
   findSignalConflicts(signal, candidates) (pure, over a caller-supplied
   same-domainType candidate pool — this engine never reads a repository
   itself, same discipline learning-signal-similarity-engine.js follows).

   DEPENDENCIES: contracts/learning-scope-contract.js (scopeKey).

   NON-GOALS: no severity scoring, no automatic resolution — a conflict is
   reported as evidence for learning-confidence-engine.js's contradiction
   penalty (Phase 12.6.2) and for a future human reviewing a
   LearningRecommendation (Phase 12.6.5); this engine never decides which
   side is "right."
   ============================================================ */

'use strict';

import { scopeKey } from './contracts/learning-scope-contract.js';

/**
 * @param {{scope: object, after: *}} a
 * @param {{id: string, scope: object, after: *}} b
 * @returns {{kind: string, rationale: string}|null}
 */
export function classifySignalConflict(a, b) {
  if (!a || !b || !a.scope || !b.scope) return null;
  if (scopeKey(a.scope) !== scopeKey(b.scope)) return null; // different scope: not comparable
  const sameFact = JSON.stringify(a.after) === JSON.stringify(b.after);
  if (sameFact) return null; // same fact: a duplicate, not a conflict — record()'s own no-op path handles this
  return Object.freeze({
    kind: 'contradictory_observation',
    rationale: `Two signals for the same scope (${scopeKey(a.scope)}) report different facts.`,
  });
}

/**
 * @param {import('./contracts/learning-signal-contract.js').LearningSignal} signal
 * @param {Array<{id: string, scope: object, after: *}>} candidates - caller-supplied same-domainType pool
 * @returns {Array<{candidateId: string, kind: string, rationale: string}>}
 */
export function findSignalConflicts(signal, candidates) {
  const conflicts = [];
  for (const candidate of candidates || []) {
    const verdict = classifySignalConflict(signal, candidate);
    if (verdict) conflicts.push({ candidateId: candidate.id, ...verdict });
  }
  return conflicts;
}
