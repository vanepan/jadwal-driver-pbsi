/* dataset-import-check.mjs — Node check for V2.0.14 "Dataset Import
   Foundation": wiring a registered DatasetSpec to the EXISTING
   acquisition-engine.js pipeline (Session/Events/Reports/Provider
   Registry all reused unchanged — see dataset-import-service.js's own
   header for the full reuse map). No parsing, no OCR, no NLP, no AI.
   No production writes (memory repository only).
   Run: node scripts/dataset-import-check.mjs   (exit 0 = pass) */

import { LIFECYCLE_STATE } from '../js/v2/knowledge/contracts/lifecycle-contract.js';
import { generateKnowledgeId } from '../js/v2/knowledge/contracts/identity-contract.js';
import { setActiveRepository, getById } from '../js/v2/knowledge/repository/knowledge-repository.js';
import { connectorSuccess } from '../js/v2/knowledge/contracts/connector-contract.js';
import { makeSource, SOURCE_REPRESENTATION } from '../js/v2/knowledge/acquisition/contracts/source-contract.js';
import { registerConnector, resetConnectorRegistry } from '../js/v2/knowledge/registry/connector-registry.js';
import { resetImportReportLog } from '../js/v2/knowledge/acquisition/acquisition-engine.js';

import { DATASET_TYPE, makeDatasetSpec } from '../js/v2/knowledge/datasets/contracts/dataset-contract.js';
import { registerDataset, resetDatasetRegistry } from '../js/v2/knowledge/datasets/registry/dataset-registry.js';
import {
  importDataset, listDatasetImportReports, DATASET_IMPORT_ERRORS, rollback,
} from '../js/v2/knowledge/datasets/dataset-import-service.js';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

setActiveRepository('memory');
resetConnectorRegistry();
resetDatasetRegistry();
resetImportReportLog();

console.log('\n[Fixture — a test connector + a DatasetSpec wired to its source]');
const testSource = makeSource({
  id: 'test.sarpras_docs', connectorId: 'sarpras-test',
  description: 'Test fixture source.', representation: SOURCE_REPRESENTATION.STORE_RECORD,
});

function makeFixtureItem(sourceRef) {
  const now = new Date().toISOString();
  return Object.freeze({
    id: generateKnowledgeId({ domainType: 'engineering', sourceType: 'sarpras-test', sourceRef }),
    version: 1, domainType: 'engineering', sourceType: 'sarpras-test', kind: 'structure',
    payload: { sourceRef }, confidence: 1, lifecycleState: LIFECYCLE_STATE.DRAFT,
    provenance: { connectorId: 'sarpras-test', sourceRef, capturedAt: now },
    approvedBy: null, approvedAt: null, preferenceRationale: null, createdAt: now, updatedAt: now,
  });
}

registerConnector({
  id: 'sarpras-test', version: 'sarpras-test-connector@1', description: 'Test fixture connector.',
  source: testSource,
  fetch: () => connectorSuccess([makeFixtureItem('doc-1'), makeFixtureItem('doc-2')], { connectorId: 'sarpras-test', warnings: [] }),
});

const spec = makeDatasetSpec({
  datasetId: 'sarpras-bootstrap-docs', name: 'Sarpras Bootstrap Docs (test)',
  datasetType: DATASET_TYPE.SYNTHETIC, domainType: 'engineering', sourceId: testSource.id,
});
registerDataset(spec);

console.log('\n[Dataset import — error paths]');
const notFound = importDataset('never-registered');
check('importDataset on an unregistered datasetId returns DATASET_NOT_FOUND', notFound.ok === false && notFound.error.code === DATASET_IMPORT_ERRORS.DATASET_NOT_FOUND);

const unwiredSpec = makeDatasetSpec({ datasetId: 'unwired', name: 'Unwired', datasetType: DATASET_TYPE.OFFICIAL, domainType: 'engineering' });
registerDataset(unwiredSpec);
const noSource = importDataset('unwired');
check('importDataset on a DatasetSpec with no sourceId returns NO_SOURCE_WIRED', noSource.ok === false && noSource.error.code === DATASET_IMPORT_ERRORS.NO_SOURCE_WIRED);

const wrongSourceSpec = makeDatasetSpec({ datasetId: 'wrong-source', name: 'Wrong Source', datasetType: DATASET_TYPE.OFFICIAL, domainType: 'engineering', sourceId: 'no.such.source' });
registerDataset(wrongSourceSpec);
const noConnector = importDataset('wrong-source');
check('importDataset with a sourceId no connector reads returns CONNECTOR_NOT_FOUND', noConnector.ok === false && noConnector.error.code === DATASET_IMPORT_ERRORS.CONNECTOR_NOT_FOUND);

console.log('\n[Dataset import — real run through the EXISTING acquisition pipeline]');
const result = importDataset('sarpras-bootstrap-docs');
check('importDataset succeeds end to end', result.ok === true);
check('the report reflects 2 real items written by acquisition-engine.js', result.report.itemsCreated === 2);
check('the report is stamped with the dataset\'s id and type', result.report.datasetId === 'sarpras-bootstrap-docs' && result.report.datasetType === DATASET_TYPE.SYNTHETIC);
check('the report carries the dataset\'s classification weight (0.3 for synthetic)', result.report.datasetWeight === 0.3);
check('the report flags isBootstrap true for a synthetic dataset', result.report.isBootstrap === true);
check('the underlying KnowledgeItems really exist in the repository (no parallel store)', getById(generateKnowledgeId({ domainType: 'engineering', sourceType: 'sarpras-test', sourceRef: 'doc-1' })).ok === true);

console.log('\n[Dataset import — history is a scoped view over acquisition-engine\'s existing log]');
const history = listDatasetImportReports('sarpras-bootstrap-docs');
check('listDatasetImportReports returns exactly the one run just performed', history.length === 1 && history[0].datasetId === 'sarpras-bootstrap-docs');
check('listDatasetImportReports for an unrelated dataset is empty', listDatasetImportReports('unwired').length === 0);

console.log('\n[Dataset import — rollback is the repository\'s own rollback, re-exported only]');
check('rollback is re-exported unchanged from knowledge-repository.js', typeof rollback === 'function');

resetConnectorRegistry();
resetDatasetRegistry();
resetImportReportLog();
console.log(`\n${pass}/${pass + fail} checks passed.`);
process.exit(fail > 0 ? 1 : 0);
