/* import-batch-concurrency-check.mjs — Phase 7 (Runtime Hardening, Part 2)
   Run: node scripts/import-batch-concurrency-check.mjs   (exit 0 = pass)

   PROVES (not assumes) that dataset-import-center.js#processBatch()'s
   concurrency-limited worker-pool pattern is safe against the REAL engines
   this app actually uses — no lost updates on the shared ImportBatchRecord,
   no session-id collisions, no dropped or double-processed files — at real
   scale, not a toy N=3 example.

   WHY THIS IS EXPECTED TO PASS: every mutation a worker performs
   (createImportSession's counter, advanceSession's transitions,
   recordBatchItem's tallies) is a single, fully SYNCHRONOUS call with no
   `await` between its read and its write. JS's run-to-completion guarantee
   means two "concurrent" async workers can never interleave INSIDE one of
   those calls. This script is the empirical check on that architectural
   argument, run against the real modules, not a restated assertion of it. */
import { createImportSession, attachManualEntryFacts } from '../src/knowledge/datasets/import-session/import-session-engine.js';
import { advanceSession, registerArchiver } from '../src/knowledge/datasets/import-session/pipeline-scheduler.js';
import { createBatch, recordBatchItem, getBatch } from '../src/knowledge/datasets/import-session/import-batch-engine.js';
import { DATASET_TYPE } from '../src/knowledge/datasets/contracts/dataset-contract.js';

registerArchiver((s) => `archive-record:${s.id}`);

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); }
}

/** A faithful replica of dataset-import-center.js#processOneFile's real
 *  engine calls, with a real `await` gap standing in for the genuinely
 *  async hash/upload I/O — the exact shape that makes concurrency
 *  meaningful in the first place. */
async function simulateOneFile(i, batchId) {
  const created = createImportSession({
    domainType: 'nor', datasetType: DATASET_TYPE.OFFICIAL, filename: `file-${i}.pdf`,
    mimeType: 'application/pdf', sizeBytes: 1000, kind: 'pdf', knowledgeKind: 'document_fact',
    uploadedBy: 'stress', batchId,
  });
  attachManualEntryFacts(created.data.id, {
    value: `v${i}`, documentNumber: `d${i}`, senderOrigin: 's', notes: '',
  });
  await new Promise((r) => { setTimeout(r, Math.random() * 5); }); // simulated network jitter
  const outcome = advanceSession(created.data.id);
  recordBatchItem(batchId, created.data.id, {
    imported: outcome.ok, storageBytes: 1000, knowledgeProduced: outcome.ok && outcome.outcome === 'completed',
  });
  return { sessionId: created.data.id, ok: outcome.ok };
}

/** A faithful replica of processBatch()'s exact worker-pool algorithm:
 *  a shared `nextIndex` cursor, N concurrent async workers pulling from it. */
async function runConcurrentBatch(n, concurrency) {
  const batch = createBatch({ createdBy: 'stress', domainType: 'nor', totalFiles: n });
  const batchId = batch.data.id;
  let nextIndex = 0;
  const results = [];
  async function worker() {
    for (;;) {
      if (nextIndex >= n) return;
      const myIndex = nextIndex;
      nextIndex += 1;
      // eslint-disable-next-line no-await-in-loop
      results.push(await simulateOneFile(myIndex, batchId));
    }
  }
  const t0 = performance.now();
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  const ms = performance.now() - t0;
  return { batchId, results, ms };
}

console.log('\n[Concurrency correctness — real engines, real scale]');

for (const n of [25, 100, 500]) {
  // eslint-disable-next-line no-await-in-loop
  const { batchId, results, ms } = await runConcurrentBatch(n, 6);
  const uniqueSessionIds = new Set(results.map((r) => r.sessionId));
  const b = getBatch(batchId).data;
  check(`N=${n}, concurrency=6: exactly ${n} results, no dropped/duplicate work (${ms.toFixed(0)}ms)`, results.length === n);
  check(`N=${n}: ${n} unique session ids — no ID collisions under concurrent creation`, uniqueSessionIds.size === n);
  check(`N=${n}: batch.imported === ${n} — no lost updates on the shared batch counter`, b.imported === n);
  check(`N=${n}: batch.sessionIds.length === ${n} — the id list accumulated correctly under concurrency`, b.sessionIds.length === n);
  check(`N=${n}: every outcome reached a real terminal state`, results.every((r) => r.ok));
}

console.log(`\n${pass}/${pass + fail} checks passed.`);
process.exit(fail === 0 ? 0 : 1);
