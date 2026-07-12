/* bootstrap-dataset-check.mjs — Node check for V2.0.13
   "Bootstrap Dataset Foundation": DatasetSpec contract (metadata,
   versioning, structural validation), the five DATASET_TYPEs, the
   classification/weight table (matching the roadmap's declared
   priority: correction > official > historical > synthetic/training),
   and the dataset registry. Zero real datasets are created — every
   fixture here is a spec only. No AI, no LLM, no production writes.
   Run: node scripts/bootstrap-dataset-check.mjs   (exit 0 = pass) */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  DATASET_TYPE, makeDatasetSpec, reviseDatasetSpec, isDatasetSpec,
} from '../js/v2/knowledge/datasets/contracts/dataset-contract.js';
import {
  KNOWLEDGE_PRIORITY_ORDER, getDatasetTypeWeight, isBootstrapType, compareDatasetPriority,
} from '../js/v2/knowledge/datasets/contracts/dataset-classification-contract.js';
import {
  registerDataset, getDataset, hasDataset, listDatasets, resetDatasetRegistry, DATASET_REGISTRY_ERRORS,
} from '../js/v2/knowledge/datasets/registry/dataset-registry.js';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

console.log('\n[DatasetSpec contract — construction, versioning, validation]');
const spec = makeDatasetSpec({
  datasetId: 'sarpras-nor-official', name: 'Sarpras NOR — Official Archive',
  datasetType: DATASET_TYPE.OFFICIAL, domainType: 'nor', description: 'Test fixture only.',
});
check('makeDatasetSpec produces a valid DatasetSpec', isDatasetSpec(spec));
check('a fresh DatasetSpec starts at version 1', spec.version === 1);
check('isDatasetSpec rejects an unregistered domainType', !isDatasetSpec({ ...spec, domainType: 'not-a-real-domain' }));
check('isDatasetSpec rejects an unregistered datasetType', !isDatasetSpec({ ...spec, datasetType: 'bogus' }));
const revised = reviseDatasetSpec(spec, { description: 'Updated description.' });
check('reviseDatasetSpec increments version by exactly 1', revised.version === 2);
check('reviseDatasetSpec keeps the same datasetId (identity stable across revisions)', revised.datasetId === spec.datasetId);
check('reviseDatasetSpec never mutates the original', spec.version === 1);

console.log('\n[DATASET_TYPE — five roadmap-named types]');
check('DATASET_TYPE has exactly 5 entries', Object.values(DATASET_TYPE).length === 5);
check('DATASET_TYPE includes OFFICIAL, HISTORICAL, SYNTHETIC, TRAINING, CORRECTION',
  ['official', 'historical', 'synthetic', 'training', 'correction'].every((t) => Object.values(DATASET_TYPE).includes(t)));

console.log('\n[Dataset classification — weight table + priority order]');
check('CORRECTION outweighs OFFICIAL', getDatasetTypeWeight(DATASET_TYPE.CORRECTION) > getDatasetTypeWeight(DATASET_TYPE.OFFICIAL));
check('OFFICIAL outweighs HISTORICAL', getDatasetTypeWeight(DATASET_TYPE.OFFICIAL) > getDatasetTypeWeight(DATASET_TYPE.HISTORICAL));
check('HISTORICAL outweighs SYNTHETIC and TRAINING', getDatasetTypeWeight(DATASET_TYPE.HISTORICAL) > getDatasetTypeWeight(DATASET_TYPE.SYNTHETIC)
  && getDatasetTypeWeight(DATASET_TYPE.HISTORICAL) > getDatasetTypeWeight(DATASET_TYPE.TRAINING));
check('isBootstrapType is true for SYNTHETIC and TRAINING only', isBootstrapType(DATASET_TYPE.SYNTHETIC) && isBootstrapType(DATASET_TYPE.TRAINING)
  && !isBootstrapType(DATASET_TYPE.OFFICIAL) && !isBootstrapType(DATASET_TYPE.CORRECTION));
check('KNOWLEDGE_PRIORITY_ORDER matches the roadmap\'s declared order exactly', JSON.stringify(KNOWLEDGE_PRIORITY_ORDER)
  === JSON.stringify(['correction', 'official', 'historical', 'synthetic', 'training']));
check('compareDatasetPriority(CORRECTION, TRAINING) is negative (correction outranks training)', compareDatasetPriority(DATASET_TYPE.CORRECTION, DATASET_TYPE.TRAINING) < 0);
check('Official documents always override Bootstrap (compareDatasetPriority confirms OFFICIAL < SYNTHETIC index)', compareDatasetPriority(DATASET_TYPE.OFFICIAL, DATASET_TYPE.SYNTHETIC) < 0);

console.log('\n[Dataset registry — register/get/list/has, idempotent, zero bootstrap entries]');
check('the registry starts empty (this milestone creates no real datasets)', listDatasets().length === 0);
registerDataset(spec);
check('registerDataset then getDataset round-trips the same spec', getDataset(spec.datasetId).datasetId === spec.datasetId);
check('hasDataset is true after registering', hasDataset(spec.datasetId));
check('hasDataset is false for an unregistered id', !hasDataset('never-registered'));
registerDataset(revised);
check('re-registering under the same datasetId is idempotent (replaces, does not duplicate)', listDatasets().length === 1);
check('the replaced entry is the newer version', getDataset(spec.datasetId).version === 2);
let threw = false;
try { registerDataset({ not: 'a valid spec' }); } catch (e) { threw = e.code === DATASET_REGISTRY_ERRORS.INVALID_DATASET_SPEC; }
check('registerDataset throws INVALID_DATASET_SPEC for a malformed spec', threw);
const bySynthetic = (() => {
  registerDataset(makeDatasetSpec({ datasetId: 'bootstrap-1', name: 'Bootstrap Pack', datasetType: DATASET_TYPE.SYNTHETIC, domainType: 'nor' }));
  return listDatasets({ datasetType: DATASET_TYPE.SYNTHETIC });
})();
check('listDatasets(filter) scopes correctly by datasetType', bySynthetic.length === 1 && bySynthetic[0].datasetId === 'bootstrap-1');
resetDatasetRegistry();
check('resetDatasetRegistry empties the registry', listDatasets().length === 0);

console.log('\n[Dormancy — structural import scan]');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const jsRoot = path.join(repoRoot, 'js');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

function importSpecifiers(filePath) {
  const src = fs.readFileSync(filePath, 'utf8');
  const specifiers = [];
  const re = /(?:import|export)\s+(?:[^'"]*?\bfrom\s+)?['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(src))) specifiers.push(m[1]);
  return specifiers;
}

const allJsFiles = walk(jsRoot);
const v2Root = path.join(jsRoot, 'v2');
const ALLOWED_V2_IMPORTERS = new Set([
  path.join(jsRoot, 'config', 'feature-gates.js'),
  path.join(jsRoot, 'config', 'module-loader-registry.js'),
]);

const outsideV2Violations = [];
for (const file of allJsFiles) {
  if (file.startsWith(v2Root)) continue;
  for (const spec2 of importSpecifiers(file)) {
    const resolved = path.resolve(path.dirname(file), spec2);
    if (resolved.startsWith(v2Root) && !ALLOWED_V2_IMPORTERS.has(file)) outsideV2Violations.push(file);
  }
}
check('no file outside the gated chain imports from js/v2/', outsideV2Violations.length === 0);

console.log(`\n${pass}/${pass + fail} checks passed.`);
process.exit(fail > 0 ? 1 : 0);
