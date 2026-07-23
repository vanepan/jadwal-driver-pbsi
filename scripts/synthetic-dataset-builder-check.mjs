/* synthetic-dataset-builder-check.mjs — Node check for V2.0.13.5
   "Synthetic Dataset Builder Foundation": DatasetPack contract, the pack
   registry, pack lineage (parent-chain walk, cycle detection), and pack
   quality (honest completeness reporting — every pack here is empty by
   design, since no generator exists yet). Zero content is generated.
   No AI, no LLM, no production writes.
   Run: node scripts/synthetic-dataset-builder-check.mjs   (exit 0 = pass) */

import { makePack, isDatasetPack } from '../src/knowledge/datasets/contracts/dataset-pack-contract.js';
import {
  registerPack, getPack, listPacks, resetPackRegistry, PACK_REGISTRY_ERRORS,
} from '../src/knowledge/datasets/registry/pack-registry.js';
import { getPackLineage, getPackDepth } from '../src/knowledge/datasets/pack-lineage-engine.js';
import { computePackQuality } from '../src/knowledge/datasets/pack-quality-engine.js';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

resetPackRegistry();

console.log('\n[DatasetPack contract — construction, validation]');
const root = makePack('bootstrap-sarpras-nor', { targetItemCount: 100, notes: 'Root pack — framework only.' });
check('makePack produces a valid DatasetPack', isDatasetPack(root));
check('a fresh pack starts at version 1 with itemCount 0', root.version === 1 && root.itemCount === 0);
check('a root pack has parentPackId null', root.parentPackId === null);
check('isDatasetPack rejects a negative targetItemCount', !isDatasetPack({ ...root, targetItemCount: -1 }));

console.log('\n[Pack registry — register/get/list, idempotent, zero bootstrap entries]');
check('the registry starts empty', listPacks().length === 0);
registerPack(root);
const child = makePack('bootstrap-sarpras-nor', { parentPackId: root.packId, targetItemCount: 100 });
registerPack(child);
const grandchild = makePack('bootstrap-sarpras-nor', { parentPackId: child.packId, targetItemCount: 100 });
registerPack(grandchild);
check('getPack round-trips a registered pack', getPack(root.packId).packId === root.packId);
check('listPacks(filter) scopes by datasetId', listPacks({ datasetId: 'bootstrap-sarpras-nor' }).length === 3);
let threw = false;
try { registerPack({ not: 'valid' }); } catch (e) { threw = e.code === PACK_REGISTRY_ERRORS.INVALID_PACK; }
check('registerPack throws INVALID_PACK for a malformed pack', threw);

console.log('\n[Pack lineage — parent-chain walk]');
const lineageOfGrandchild = getPackLineage(grandchild.packId);
check('getPackLineage(grandchild) succeeds', lineageOfGrandchild.ok === true);
check('the chain is ordered root-first: root, child, grandchild', lineageOfGrandchild.chain.map((p) => p.packId).join(',')
  === [root.packId, child.packId, grandchild.packId].join(','));
check('getPackDepth(root) is 0', getPackDepth(root.packId) === 0);
check('getPackDepth(grandchild) is 2', getPackDepth(grandchild.packId) === 2);
const missingLineage = getPackLineage('never-registered');
check('getPackLineage on an unregistered packId returns ok:false / NOT_FOUND', missingLineage.ok === false && missingLineage.error.code === 'NOT_FOUND');

console.log('\n[Pack lineage — cycle detection]');
const a = makePack('cycle-test', { targetItemCount: 1 });
const b = makePack('cycle-test', { parentPackId: a.packId, targetItemCount: 1 });
registerPack(a);
registerPack({ ...b, parentPackId: a.packId });
const cyclicA = { ...a, parentPackId: b.packId }; // manually construct a cycle: a -> b -> a
registerPack(cyclicA);
const cycleResult = getPackLineage(cyclicA.packId);
check('a manually constructed cycle is detected, not looped forever', cycleResult.ok === false && cycleResult.cycleDetected === true);

console.log('\n[Pack quality — honest completeness, no fabricated scores]');
const emptyQuality = computePackQuality(root);
check('computePackQuality succeeds on a valid pack', emptyQuality.ok === true);
check('an empty pack (itemCount 0) reports completeness 0', emptyQuality.completeness === 0);
check('an empty pack reports isEmpty true', emptyQuality.isEmpty === true);
check('an empty pack surfaces a "zero items" issue', emptyQuality.issues.some((i) => i.includes('zero items')));
const noTargetPack = makePack('no-target-test');
const noTargetQuality = computePackQuality(noTargetPack);
check('a pack with no target surfaces a "cannot be measured" issue', noTargetQuality.issues.some((i) => i.includes('cannot be measured')));
const invalidQuality = computePackQuality({ not: 'a pack' });
check('computePackQuality rejects a malformed pack', invalidQuality.ok === false && invalidQuality.error.code === 'INVALID_PACK');

resetPackRegistry();
console.log(`\n${pass}/${pass + fail} checks passed.`);
process.exit(fail > 0 ? 1 : 0);
