/* batch-performance-check.mjs — Node check for V2.1.2 Part P "Batch
   Processing Performance": REAL, executed batch simulations at 100, 500,
   1000, and 5000 synthetic files, driven through the actual controller
   pipeline (createDatasetImportController -> onChange -> processBatch ->
   processOneFile), the exact same code path a real drag-drop uses. Every
   Firebase Storage upload attempt genuinely fails under Node (no network
   resolution for the CDN import) and is caught — this doubles as a
   stress test of the "one file's Storage failure must never abort the
   batch" robustness fix. No network calls succeed; no production writes.
   Run: node scripts/batch-performance-check.mjs   (exit 0 = pass, can
   take a minute or two for the 5000-file case — real work, not mocked) */

import { setActiveRepository } from '../js/v2/knowledge/repository/knowledge-repository.js';
import { resetConnectorRegistry } from '../js/v2/knowledge/registry/connector-registry.js';
import { resetDatasetRegistry } from '../js/v2/knowledge/datasets/registry/dataset-registry.js';
import { resetImportSessionRepository } from '../js/v2/knowledge/datasets/import-session/repository/import-session-repository.js';
import { resetImportBatchRepository } from '../js/v2/knowledge/datasets/import-session/repository/import-batch-repository.js';
import { resetManualImportQueue } from '../js/v2/knowledge/acquisition/manual-import-queue-store.js';
import { resetFileStorageRegistry } from '../js/v2/file-storage/file-storage-registry.js';
import { createDatasetImportController } from '../js/v2/ui/dataset-import-center.js';
import { listImportSessions } from '../js/v2/knowledge/datasets/import-session/import-session-engine.js';
import { listBatches } from '../js/v2/knowledge/datasets/import-session/import-batch-engine.js';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

function makeFile(name, type, text) {
  return { name, type, size: text.length, arrayBuffer: async () => new TextEncoder().encode(text).buffer, text: async () => text };
}

async function runBatch(n) {
  setActiveRepository('memory');
  resetConnectorRegistry(); resetDatasetRegistry(); resetImportSessionRepository();
  resetImportBatchRepository(); resetManualImportQueue(); resetFileStorageRegistry();

  const ctrl = createDatasetImportController({ domainType: 'nor', lockDomainType: true });
  ctrl.onClick({ dataset: { act: 'dic-view', id: 'upload' } }, () => {});

  const files = Array.from({ length: n }, (_, i) => makeFile(`doc-${i}.json`, 'application/json', JSON.stringify({ value: `unique-content-${i}` })));

  const memBefore = process.memoryUsage().heapUsed;
  const startedAt = Date.now();

  let finished = false;
  const rerender = () => {}; // discard renders — this test measures the pipeline, not the DOM string cost
  const handled = ctrl.onChange({ target: { closest: (sel) => (sel.includes('dic-file-input') ? { dataset: {}, files } : null) } }, rerender);

  // processBatch is fire-and-forget from onChange's perspective (no
  // returned promise) — poll listImportSessions() until the count
  // stabilizes at n, matching how a real caller would only know
  // completion via the UI's own progress state, not a returned promise.
  let lastCount = -1;
  let stableTicks = 0;
  let iterations = 0;
  const MAX_ITERATIONS = 4000; // 50ms * 4000 = 200s safety ceiling — a real bug (infinite hang) must not hang this script forever
  while (stableTicks < 3 && iterations < MAX_ITERATIONS) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => { setTimeout(r, 50); });
    const count = listImportSessions({}).data.length;
    if (count === lastCount) stableTicks += 1; else stableTicks = 0;
    lastCount = count;
    if (count >= n) finished = true;
    iterations += 1;
  }

  const elapsedMs = Date.now() - startedAt;
  const memAfter = process.memoryUsage().heapUsed;

  return { handled, finished, elapsedMs, memDeltaMb: (memAfter - memBefore) / (1024 * 1024) };
}

for (const n of [100, 500, 1000, 5000]) {
  console.log(`\n[Batch of ${n} files]`);
  // eslint-disable-next-line no-await-in-loop
  const result = await runBatch(n);
  const sessions = listImportSessions({}).data;
  const batches = listBatches({}).data;

  check(`onChange accepted the ${n}-file selection`, result.handled === true);
  check(`exactly ${n} Import Sessions were created (no silent skipping, batch totals === imported totals)`, sessions.length === n);
  check(`every session has a real, distinct id (no collisions/overwrites under load)`, new Set(sessions.map((s) => s.id)).size === n);
  check(`exactly one Import Batch record was created for this selection`, batches.length === 1);
  check(`the batch's own totalFiles matches the real selection size`, batches[0].totalFiles === n);
  check(`the batch's sessionIds array has exactly ${n} real entries (no data loss)`, batches[0].sessionIds.length === n);
  check(`the batch reached a terminal state (completed) — the loop did not hang or die mid-batch`, batches[0].status === 'completed');
  console.log(`  (elapsed: ${result.elapsedMs}ms, heap delta: ${result.memDeltaMb.toFixed(1)}MB — informational, not asserted: CI hardware varies)`);
}

console.log(`\n${pass}/${pass + fail} checks passed.`);
process.exit(fail > 0 ? 1 : 0);
