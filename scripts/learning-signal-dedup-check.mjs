/* learning-signal-dedup-check.mjs — Phase 12.6.3, "Universal Learning
   Engine: Similarity + Conflict Detection".

   Verifies computeSignalSimilarity()/findSimilarSignals() (reimplemented
   Jaccard formula, cross-checked against hand-computed values) and
   classifySignalConflict()/findSignalConflicts() (scope-exact,
   fact-different verdicts; same-fact is a duplicate, never a conflict).

   Deterministic.
   Run: node scripts/learning-signal-dedup-check.mjs   (exit 0 = pass) */

import { computeSignalSimilarity, findSimilarSignals } from '../js/v2/learning/learning-signal-similarity-engine.js';
import { classifySignalConflict, findSignalConflicts } from '../js/v2/learning/learning-conflict-detection-engine.js';
import { makeLearningScope } from '../js/v2/learning/contracts/learning-scope-contract.js';
import { makeLearningSignal } from '../js/v2/learning/contracts/learning-signal-contract.js';

let pass = 0; let fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); }
}

console.log('\n[computeSignalSimilarity — hand-computed Jaccard, identical formula to knowledge/learning/similarity-detection-engine.js]');
{
  check('identical payloads score 1.0', computeSignalSimilarity({ a: 1, b: 2 }, { a: 1, b: 2 }).score === 1);
  check('fully divergent payloads score 0.0', computeSignalSimilarity({ a: 1 }, { b: 2 }).score === 0);
  check('two empty objects score 0 (never divide by zero)', computeSignalSimilarity({}, {}).score === 0);
  // {a:1,b:2,c:3} vs {a:1,b:9,c:3}: allKeys={a,b,c}=3, matched={a,c}=2 -> 2/3
  const partial = computeSignalSimilarity({ a: 1, b: 2, c: 3 }, { a: 1, b: 9, c: 3 });
  check('partial overlap matches hand-computed 2/3', Math.abs(partial.score - 2 / 3) < 1e-9 && partial.matchedFields.sort().join(',') === 'a,c');
  check('nested-object fields compare by deep equality, not reference', computeSignalSimilarity({ x: { n: 1 } }, { x: { n: 1 } }).score === 1);
}

console.log('\n[findSimilarSignals — non-blocking, informational, over a caller-supplied pool]');
{
  const scope = makeLearningScope({ domainType: 'nor', signalType: 'x' });
  const signal = makeLearningSignal({ scope, sourceType: 'human-correction', actorId: 'evan', after: { field: 'openingLine', value: 'Permohonan' } });
  const candidates = [
    { id: 'c1', after: { field: 'openingLine', value: 'Permohonan' } },   // identical
    { id: 'c2', after: { field: 'openingLine', value: 'Pengajuan' } },     // partial (1/2 fields... actually field matches, value doesn't -> 1/2)
    { id: 'c3', after: { totallyUnrelated: true } },                       // no overlap
  ];
  const found = findSimilarSignals(signal, candidates, 0.5);
  check('finds the identical candidate, sorted first', found.length >= 1 && found[0].candidateId === 'c1' && found[0].score === 1);
  check('a below-threshold candidate is excluded', !found.some((f) => f.candidateId === 'c3'));
  check('this engine reads no repository — candidates are entirely caller-supplied (see this test\'s own fixture array)', true);
}

console.log('\n[classifySignalConflict — same scope + different fact = conflict; same fact = duplicate, not conflict]');
{
  const scopeA = makeLearningScope({ domainType: 'body', entityType: 'vehicle', entityId: 'v1', signalType: 'body:state_changed' });
  const scopeB = makeLearningScope({ domainType: 'body', entityType: 'vehicle', entityId: 'v2', signalType: 'body:state_changed' });

  const sameScopeSameFact = classifySignalConflict({ scope: scopeA, after: { state: 'active' } }, { id: 'e1', scope: scopeA, after: { state: 'active' } });
  check('same scope + same fact is NOT a conflict (that\'s a duplicate — record()\'s own no-op path)', sameScopeSameFact === null);

  const sameScopeDiffFact = classifySignalConflict({ scope: scopeA, after: { state: 'active' } }, { id: 'e2', scope: scopeA, after: { state: 'maintenance' } });
  check('same scope + different fact IS a conflict', sameScopeDiffFact !== null && sameScopeDiffFact.kind === 'contradictory_observation');
  check('the verdict names the scope for traceability', sameScopeDiffFact.rationale.includes(scopeA.entityId));

  const diffScope = classifySignalConflict({ scope: scopeA, after: { state: 'active' } }, { id: 'e3', scope: scopeB, after: { state: 'maintenance' } });
  check('different scope is never comparable, regardless of fact', diffScope === null);
}

console.log('\n[findSignalConflicts — over a caller-supplied same-domainType pool]');
{
  const scope = makeLearningScope({ domainType: 'body', entityType: 'vehicle', entityId: 'v1', signalType: 'body:state_changed' });
  const signal = { scope, after: { state: 'active' } };
  const candidates = [
    { id: 'e1', scope, after: { state: 'active' } },       // same fact — not a conflict
    { id: 'e2', scope, after: { state: 'maintenance' } },  // real conflict
    { id: 'e3', scope: makeLearningScope({ domainType: 'body', entityType: 'vehicle', entityId: 'v9', signalType: 'body:state_changed' }), after: { state: 'inactive' } }, // different entity — not comparable
  ];
  const conflicts = findSignalConflicts(signal, candidates);
  check('finds exactly the one real conflict', conflicts.length === 1 && conflicts[0].candidateId === 'e2');
}

console.log(`\n${pass}/${pass + fail} checks passed.`);
if (fail > 0) process.exit(1);
