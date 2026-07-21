/* recognition-classification-check.mjs — Phase 12.7.2, "Autonomous
   Classification".

   Verifies: suggestClassification() is pure, cite-or-abstain, never
   invents an unregistered domainType/kind/norType, correctly weighs
   corroborating signals over a single weak one, and honestly abstains
   below its confidence threshold; classification-service.js#
   recordClassification() only ever persists a REAL suggestion (never an
   abstention) and reconciles a re-classification of the same scope via
   append, not duplication.

   Deterministic. No V1, no Firebase, no AI.
   Run: node scripts/recognition-classification-check.mjs   (exit 0 = pass) */

import {
  suggestClassification, CLASSIFICATION_OUTCOME, CLASSIFICATION_CONFIDENCE_THRESHOLD,
} from '../js/v2/recognition/classification/classification-suggestion-engine.js';
import { recordClassification } from '../js/v2/recognition/services/classification-service.js';
import { resetRepositoryRegistry } from '../js/v2/recognition/repository/repository-registry.js';
import { setActiveRepository } from '../js/v2/recognition/repository/recognition-repository.js';
import { getRecognitionRecord, getRecognitionHistory } from '../js/v2/recognition/services/recognition-service.js';
import { makeRecognitionScope } from '../js/v2/recognition/contracts/recognition-scope-contract.js';

let pass = 0; let fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); }
}

console.log('\n[suggestClassification — cite-or-abstain]');
{
  const empty = suggestClassification([]);
  check('no signals -> honest abstention, not a guess', empty.outcome === CLASSIFICATION_OUTCOME.NO_CONFIDENT_CLASSIFICATION && empty.suggestion === null);

  const unregistered = suggestClassification([{
    domainType: 'not-a-real-domain', kind: null, norType: null, strength: 0.95, source: 'test',
  }]);
  check('an unregistered domainType is silently excluded, never suggested', unregistered.suggestion === null);

  const weak = suggestClassification([{
    domainType: 'nor', kind: null, norType: null, strength: 0.2, source: 'weak-signal',
  }]);
  check('a single weak signal stays below threshold -> abstains', weak.outcome === CLASSIFICATION_OUTCOME.NO_CONFIDENT_CLASSIFICATION);
  check('an abstention still reports its real (low) confidence, never a fabricated one', weak.confidence < CLASSIFICATION_CONFIDENCE_THRESHOLD);

  const strong = suggestClassification([{
    domainType: 'nor', kind: 'document_fact', norType: null, strength: 0.9, source: 'structural-signature-match',
  }]);
  check('one strong, registered signal clears the threshold', strong.outcome === CLASSIFICATION_OUTCOME.SUGGESTED);
  check('the suggestion names only registered vocabulary', strong.suggestion.suggestedDomainType === 'nor' && strong.suggestion.suggestedKind === 'document_fact');
  check('a real suggestion always carries non-empty evidence', strong.evidence.length > 0);

  const corroborated = suggestClassification([
    { domainType: 'nor', kind: null, norType: null, strength: 0.5, source: 'filename-vocabulary-match' },
    { domainType: 'nor', kind: null, norType: null, strength: 0.5, source: 'structural-signature-match' },
    { domainType: 'nor', kind: null, norType: null, strength: 0.5, source: 'prior-classified-corpus' },
  ]);
  const single = suggestClassification([{ domainType: 'nor', kind: null, norType: null, strength: 0.5, source: 'filename-vocabulary-match' }]);
  check('3 independent agreeing signals score higher than 1 alone (real corroboration boost)', corroborated.confidence > single.confidence);

  const conflicting = suggestClassification([
    { domainType: 'nor', kind: null, norType: null, strength: 0.55, source: 'a' },
    { domainType: 'memorandum', kind: null, norType: null, strength: 0.9, source: 'b' },
  ]);
  check('the highest-scoring candidate wins when signals disagree', conflicting.suggestion.suggestedDomainType === 'memorandum');
}

console.log('\n[classification-service.js — only a real suggestion is ever persisted]');
{
  resetRepositoryRegistry();
  setActiveRepository('memory');
  const scope = makeRecognitionScope({ domainType: 'nor', entityId: 'doc-classify-1' });

  const abstained = recordClassification(scope, []);
  check('an abstention writes nothing (op is null)', abstained.op === null && abstained.data === null);

  const first = recordClassification(scope, [
    { domainType: 'nor', kind: 'document_fact', norType: null, strength: 0.9, source: 'structural-signature-match' },
  ]);
  check('a real suggestion is persisted as a new record', first.ok && first.op === 'create');
  check('the persisted record has RECORD_TYPE.CLASSIFICATION shape', first.data.recordType === 'classification');

  const reclassified = recordClassification(scope, [
    { domainType: 'nor', kind: 'document_fact', norType: null, strength: 0.95, source: 'structural-signature-match' },
  ]);
  check('re-classifying the SAME scope appends a version, never duplicates', reclassified.ok && reclassified.op === 'append');

  const history = getRecognitionHistory(first.data.id);
  check('exactly 2 real versions exist for this scope (1 create + 1 append)', history.ok && history.data.length === 2);

  const fetched = getRecognitionRecord(first.data.id);
  check('the latest record reflects the most recent real classification', fetched.ok && fetched.data.confidence === reclassified.data.confidence);
}

console.log(`\n${pass}/${pass + fail} checks passed.`);
if (fail > 0) process.exit(1);
