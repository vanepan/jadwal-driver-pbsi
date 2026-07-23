/* import-batch-check.mjs — Node check for V2.1.2 "Batch History
   Foundation": every ImportBatchRecord count is a real, incremental tally
   driven by real per-file outcomes (recordBatchItem), never independently
   recomputed. Status transitions (Pause/Resume/Cancel/Complete) are
   guarded — no illegal jump succeeds. RTDB sync is never exercised here
   (see import-batch-repository.js's header — same "no production writes"
   discipline every check script in this repo follows).
   Run: node scripts/import-batch-check.mjs   (exit 0 = pass) */

import {
  createBatch, recordBatchItem, pauseBatch, resumeBatch, cancelBatch, completeBatch,
  getBatch, listBatches, getBatchHistory, BATCH_STATUS,
} from '../src/knowledge/datasets/import-session/import-batch-engine.js';
import { resetImportBatchRepository } from '../src/knowledge/datasets/import-session/repository/import-batch-repository.js';
import { isImportBatchRecord } from '../src/knowledge/datasets/import-session/contracts/import-batch-contract.js';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

resetImportBatchRepository();

console.log('\n[createBatch]');
const created = createBatch({ createdBy: 'evan', domainType: 'nor', totalFiles: 3 });
check('createBatch succeeds at status processing, version 1', created.ok && created.data.status === BATCH_STATUS.PROCESSING && created.data.version === 1);
check('createBatch record satisfies the contract', isImportBatchRecord(created.data));
check('createBatch starts with zero counts (never fabricated)', created.data.imported === 0 && created.data.duplicate === 0 && created.data.error === 0 && created.data.warning === 0 && created.data.knowledgeProduced === 0 && created.data.storageUsedBytes === 0);
const id = created.data.id;

console.log('\n[recordBatchItem — real incremental tallies]');
recordBatchItem(id, 's1', { imported: true, storageBytes: 100 });
recordBatchItem(id, 's2', { duplicate: true, imported: true });
const after3 = recordBatchItem(id, 's3', { error: true, warningCount: 2 });
check('imported count reflects exactly the 2 imported items', after3.data.imported === 2);
check('duplicate count reflects exactly the 1 duplicate item', after3.data.duplicate === 1);
check('error count reflects exactly the 1 error item', after3.data.error === 1);
check('warning count sums real per-item warningCount values', after3.data.warning === 2);
check('storageUsedBytes sums only the real bytes reported (100, not counting the duplicate)', after3.data.storageUsedBytes === 100);
check('sessionIds records every reported session id in order', JSON.stringify(after3.data.sessionIds) === JSON.stringify(['s1', 's2', 's3']));
check('each recordBatchItem call is a real new version (append-only, audit trail)', after3.data.version === 4);

console.log('\n[Status transitions — guarded, no illegal jump]');
const paused = pauseBatch(id);
check('pauseBatch succeeds from processing', paused.ok && paused.data.status === BATCH_STATUS.PAUSED);
const doublePause = pauseBatch(id);
check('pausing an already-paused batch fails (guarded transition)', doublePause.ok === false);
const resumed = resumeBatch(id);
check('resumeBatch succeeds from paused', resumed.ok && resumed.data.status === BATCH_STATUS.PROCESSING);
const resumeFromProcessing = resumeBatch(id);
check('resuming an already-processing batch fails (guarded transition)', resumeFromProcessing.ok === false);
const completed = completeBatch(id);
check('completeBatch succeeds and stamps finishedAt', completed.ok && completed.data.status === BATCH_STATUS.COMPLETED && !!completed.data.finishedAt);
const cancelAfterComplete = cancelBatch(id);
check('cancelling an already-completed batch fails (guarded transition)', cancelAfterComplete.ok === false);

console.log('\n[Cancel path — separate batch, never destroys already-real sessionIds]');
const b2 = createBatch({ createdBy: 'evan', domainType: 'nor', totalFiles: 5 });
recordBatchItem(b2.data.id, 'sx', { imported: true });
const cancelled = cancelBatch(b2.data.id);
check('cancelBatch succeeds and stamps finishedAt', cancelled.ok && cancelled.data.status === BATCH_STATUS.CANCELLED && !!cancelled.data.finishedAt);
check('cancelling never clears already-recorded sessionIds (no destructive rollback of real work)', cancelled.data.sessionIds.includes('sx'));

console.log('\n[Read surface]');
const fetched = getBatch(id);
check('getBatch retrieves the latest version', fetched.ok && fetched.data.status === BATCH_STATUS.COMPLETED);
const history = getBatchHistory(id);
// create(v1) + 3x recordBatchItem(v2-v4) + pause(v5) + resume(v6) + complete(v7) = 7
check('getBatchHistory returns the full real version chain', history.ok && history.data.length === 7);
const listed = listBatches({});
check('listBatches returns both batches created in this run', listed.ok && listed.data.length === 2);
const filteredByStatus = listBatches({ status: BATCH_STATUS.CANCELLED });
check('listBatches filters by status correctly', filteredByStatus.ok && filteredByStatus.data.length === 1 && filteredByStatus.data[0].id === b2.data.id);

resetImportBatchRepository();
console.log(`\n${pass}/${pass + fail} checks passed.`);
process.exit(fail > 0 ? 1 : 0);
