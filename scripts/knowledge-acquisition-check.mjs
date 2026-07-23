/* knowledge-acquisition-check.mjs — Node check for the generic Knowledge
   Acquisition framework (V2.0.2, "First Knowledge Acquisition").
   Run: node scripts/knowledge-acquisition-check.mjs   (exit 0 = pass)

   Exercises acquisition-engine.js, the acquisition contracts, identity
   generation, and the connector registry's bootstrap using a SYNTHETIC
   test connector. The real NOR connector is NOT exercised here — it
   transitively imports js/petty-cash/petty-cash-store.js -> js/firebase.js,
   which imports the Firebase SDK from a CDN via `https://` specifiers
   Node's ESM loader cannot resolve. See knowledge-acquisition-dom-check.mjs
   for the browser-based end-to-end proof against the real NOR connector. */

import {
  registerConnector, hasConnector, listConnectors, resetConnectorRegistry,
} from '../src/knowledge/registry/connector-registry.js';
import { connectorSuccess } from '../src/knowledge/contracts/connector-contract.js';
import { generateKnowledgeId } from '../src/knowledge/contracts/identity-contract.js';
import { LIFECYCLE_STATE } from '../src/knowledge/contracts/lifecycle-contract.js';
import { isKnowledgeItem } from '../src/knowledge/contracts/knowledge-item-contract.js';
import { hasStage } from '../src/knowledge/builder/stage-registry.js';
import { runAcquisition } from '../src/knowledge/acquisition/acquisition-engine.js';
import { isKnowledgeSource, SOURCE_REPRESENTATION } from '../src/knowledge/acquisition/contracts/source-contract.js';
import { makeBatch, isKnowledgeBatch } from '../src/knowledge/acquisition/contracts/batch-contract.js';
import { makeNormalization, isKnowledgeNormalization } from '../src/knowledge/acquisition/contracts/normalization-contract.js';
import {
  setActiveRepository, list as repoList, getById as repoGetById,
} from '../src/knowledge/repository/knowledge-repository.js';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

setActiveRepository('memory');

console.log('\n[Connector registry bootstrap]');
const PLACEHOLDER_IDS = [
  'memorandum', 'sop', 'configuration', 'business_rules', 'workflow',
  'analytics', 'recommendation', 'operational_history', 'policies',
  'templates', 'user_corrections',
];
check('all 11 placeholders registered', PLACEHOLDER_IDS.every((id) => hasConnector(id)));
check('nor is NOT registered (never imported in this Node process)', !hasConnector('nor'));
check('acquire-nor stage is NOT registered (stages/index.js never imported)', !hasStage('acquire-nor'));

const placeholderResult = runAcquisition('memorandum');
check('placeholder connector fetch fails NOT_IMPLEMENTED', !placeholderResult.result.ok
  && placeholderResult.result.errors[0].code === 'NOT_IMPLEMENTED');

console.log('\n[Identity generation]');
const idA = generateKnowledgeId({ domainType: 'nor', sourceType: 'test', sourceRef: 'rec-1' });
const idB = generateKnowledgeId({ domainType: 'nor', sourceType: 'test', sourceRef: 'rec-1' });
check('generateKnowledgeId is deterministic for the same seed', idA === idB);
check('id format is domainType:sourceType:sourceRef', idA === 'nor:test:rec-1');

console.log('\n[Acquisition contracts]');
check('isKnowledgeSource accepts a well-formed source', isKnowledgeSource({
  id: 'test.source', connectorId: 'test', description: 'x', representation: SOURCE_REPRESENTATION.STORE_RECORD,
}));
check('isKnowledgeSource rejects an unregistered representation', !isKnowledgeSource({
  id: 'test.source', connectorId: 'test', representation: 'rendered_pdf',
}));
const batch = makeBatch('test', 'test.source', []);
check('makeBatch produces a valid KnowledgeBatch', isKnowledgeBatch(batch));
const normalization = makeNormalization({ normalizerId: 'x', normalizerVersion: '1', sourceRepresentation: SOURCE_REPRESENTATION.VIEW_MODEL });
check('makeNormalization produces a valid KnowledgeNormalization', isKnowledgeNormalization(normalization));

console.log('\n[acquisition-engine end-to-end, synthetic connector]');
let seq = 0;
function makeTestItem(sourceRef) {
  const now = new Date().toISOString();
  return Object.freeze({
    id: generateKnowledgeId({ domainType: 'nor', sourceType: 'test', sourceRef }),
    version: 1,
    domainType: 'nor',
    sourceType: 'test',
    kind: 'structure',
    payload: Object.freeze({ seq: seq++ }),
    confidence: 1,
    lifecycleState: LIFECYCLE_STATE.DRAFT,
    provenance: Object.freeze({ connectorId: 'test', sourceRef, capturedAt: now }),
    approvedBy: null, approvedAt: null, preferenceRationale: null,
    createdAt: now, updatedAt: now,
  });
}

const testConnector = Object.freeze({
  id: 'test',
  version: 'test-connector@1',
  description: 'Synthetic connector for Node-level acquisition-engine verification.',
  source: isKnowledgeSource({ id: 'test.source', connectorId: 'test', representation: SOURCE_REPRESENTATION.STORE_RECORD })
    ? { id: 'test.source', connectorId: 'test', description: null, representation: SOURCE_REPRESENTATION.STORE_RECORD }
    : null,
  fetch() { return connectorSuccess([makeTestItem('rec-1')], { connectorId: 'test' }); },
});
registerConnector(testConnector);

const item = makeTestItem('rec-1');
check('synthetic item satisfies isKnowledgeItem', isKnowledgeItem(item));

const first = runAcquisition('test');
check('first run succeeds', first.result.ok === true);
check('first run extracts 1 item', first.result.itemsExtracted === 1);
check('first run writes 1 item (create)', first.result.itemsWritten === 1);
check('import report records 1 created, 0 updated', first.report.itemsCreated === 1 && first.report.itemsUpdated === 0);

const stored = repoGetById(item.id);
check('repository stores the item as Draft', stored.ok && stored.data.lifecycleState === LIFECYCLE_STATE.DRAFT);
check('repository item domainType/kind match the connector output', stored.data.domainType === 'nor' && stored.data.kind === 'structure');

const second = runAcquisition('test');
check('second run (same source) succeeds', second.result.ok === true);
check('second run writes 1 item (appendVersion, not duplicate)', second.result.itemsWritten === 1);
check('import report records 0 created, 1 updated on re-run', second.report.itemsCreated === 0 && second.report.itemsUpdated === 1);

const restored = repoGetById(item.id);
check('re-acquisition appended a new version (idempotent id)', restored.ok && restored.data.version === 2);

const listed = repoList({ domainType: 'nor', kind: 'structure' });
check('repository list finds exactly 1 logical item (no duplicate rows)', listed.ok && listed.data.length === 1);

console.log('\n[Registry reset]');
resetConnectorRegistry();
check('reset re-bootstraps the 11 placeholders', PLACEHOLDER_IDS.every((id) => hasConnector(id)));
check('reset does NOT re-register nor or the synthetic test connector', !hasConnector('nor') && !hasConnector('test'));

console.log(`\n${pass}/${pass + fail} checks passed.`);
process.exit(fail > 0 ? 1 : 0);
