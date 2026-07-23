/* recognition-similarity-check.mjs — Phase 12.7.3, "Similarity Discovery".

   Verifies: the four bootstrapped strategies ('exact-hash', 'field-overlap',
   'structural-shape', 'metadata-shape') dispatch correctly by strategyId;
   'field-overlap' is byte-identical to calling knowledge/services/
   similarity-service.js#computeSimilarity directly (an exact-value
   cross-check, the same discipline body-health-check.mjs already
   established for its Vehicle passthrough — never a shape-only
   assertion); 'exact-hash' and the two Jaccard-based strategies behave
   correctly on real, hand-worked fixtures; dispatchSimilarity never
   throws, even for an unknown strategy or a strategy that itself throws;
   knowledge/services/similarity-service.js's new export is itself
   byte-identical to calling learning/similarity-detection-engine.js
   directly (proving the services-facade addition changed no formula).

   Deterministic. No V1, no Firebase, no AI.
   Run: node scripts/recognition-similarity-check.mjs   (exit 0 = pass) */

import {
  dispatchSimilarity, listStrategies, hasStrategy, resetStrategyRegistry, jaccardSetSimilarity, registerStrategy,
  SIMILARITY_STRATEGY_ERRORS,
} from '../js/v2/recognition/similarity/similarity-strategy-registry.js';
import { computeSimilarity as knowledgeComputeSimilarity } from '../src/knowledge/services/similarity-service.js';
import { computeSimilarity as engineComputeSimilarity } from '../src/knowledge/learning/similarity-detection-engine.js';

let pass = 0; let fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); }
}

console.log('\n[Registry — the four bootstrapped strategies]');
{
  resetStrategyRegistry();
  check('exactly 4 strategies registered at bootstrap', listStrategies().length === 4);
  check('exact-hash is registered', hasStrategy('exact-hash'));
  check('field-overlap is registered', hasStrategy('field-overlap'));
  check('structural-shape is registered', hasStrategy('structural-shape'));
  check('metadata-shape is registered', hasStrategy('metadata-shape'));
}

console.log('\n[knowledge/services/similarity-service.js — byte-identical to the real engine]');
{
  const a = { subject: 'X', amount: 100, note: 'a' };
  const b = { subject: 'X', amount: 100, note: 'b' };
  const viaService = knowledgeComputeSimilarity(a, b);
  const viaEngine = engineComputeSimilarity(a, b);
  check('the new services-facade export is byte-identical to the real engine (no formula drift)', JSON.stringify(viaService) === JSON.stringify(viaEngine));
}

console.log('\n[dispatchSimilarity — exact-hash]');
{
  const same = dispatchSimilarity('exact-hash', 'abc123', 'abc123');
  check('identical hash values -> score 1', same.ok && same.score === 1);
  const different = dispatchSimilarity('exact-hash', 'abc123', 'def456');
  check('different hash values -> score 0', different.ok && different.score === 0);
}

console.log('\n[dispatchSimilarity — field-overlap, cross-checked against the real engine directly]');
{
  const payloadA = { subject: 'Realisasi Petty Cash', amount: 500000, sender: 'Kabid' };
  const payloadB = { subject: 'Realisasi Petty Cash', amount: 500000, sender: 'Wakabid' };
  const dispatched = dispatchSimilarity('field-overlap', payloadA, payloadB);
  const direct = engineComputeSimilarity(payloadA, payloadB);
  check('field-overlap dispatch score exactly matches calling the real engine directly', dispatched.ok && dispatched.score === direct.score);
  check('field-overlap dispatch matchedFields exactly matches the real engine', JSON.stringify(dispatched.matchedFields) === JSON.stringify(direct.matchedFields));
}

console.log('\n[dispatchSimilarity — structural-shape / metadata-shape (Jaccard over sets)]');
{
  const fieldsA = ['id', 'subject', 'amount', 'sender'];
  const fieldsB = ['id', 'subject', 'amount', 'recipient'];
  const result = dispatchSimilarity('structural-shape', fieldsA, fieldsB);
  // union = {id,subject,amount,sender,recipient} (5), intersection = {id,subject,amount} (3)
  check('structural-shape computes a real Jaccard score over field-name sets', result.ok && Math.abs(result.score - 3 / 5) < 1e-9);

  const identical = dispatchSimilarity('structural-shape', fieldsA, fieldsA);
  check('identical field sets score exactly 1', identical.score === 1);

  const disjoint = dispatchSimilarity('metadata-shape', ['nor', 'petty', 'cash'], ['sop', 'engineering']);
  check('completely disjoint token sets score exactly 0', disjoint.ok && disjoint.score === 0);

  const emptyBoth = jaccardSetSimilarity([], []);
  check('two empty sets never divide by zero (honest 0, not NaN)', emptyBoth.score === 0 && !Number.isNaN(emptyBoth.score));
}

console.log('\n[dispatchSimilarity — never throws]');
{
  const unknown = dispatchSimilarity('not-a-real-strategy', 'a', 'b');
  check('an unknown strategy is a reported failure, never an uncaught exception', unknown.ok === false && typeof unknown.error === 'string');

  resetStrategyRegistry();
  registerStrategy('throws-on-purpose', () => { throw new Error('simulated strategy failure'); });
  const threw = dispatchSimilarity('throws-on-purpose', 1, 2);
  check('a strategy that throws is caught and reported, never propagated', threw.ok === false && threw.error.includes('simulated strategy failure'));
  resetStrategyRegistry();
  check('resetStrategyRegistry genuinely reboots the real 4 (temp strategy gone)', listStrategies().length === 4 && !hasStrategy('throws-on-purpose'));
}

void SIMILARITY_STRATEGY_ERRORS;

console.log(`\n${pass}/${pass + fail} checks passed.`);
if (fail > 0) process.exit(1);
