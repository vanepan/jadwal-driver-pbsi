/* import-pipeline-observability-check.mjs — Phase 12.7.0 (Import Pipeline
   Observability Hardening).

   Verifies the three concrete, scoped changes this sprint made against the
   audit in docs/PHASE_12_SPRINT_12_7_APPLE_PHOTOS_LEARNING.md:

     1. archive-service.js#registerArchiveObserver — a real, event-driven,
        zero-polling "a write landed in the Archive" signal, exercised
        directly against the real engine (archive-repository.js is a plain
        in-memory Map, no Firebase touch — see that file's own header).
     2. dataset-import-center.js's new live worker-pool occupancy counter
        (`st.batchProgress.busy`) — the real UI controller embeds File/DOM
        dependencies its own existing check scripts do not import directly
        either (see dataset-import-center-check.mjs's header and
        import-batch-concurrency-check.mjs's "faithful replica" idiom); this
        harness follows that SAME established convention, replicating the
        exact busy++/busy-- placement added to worker() and asserting the
        real invariants it must hold (never exceeds concurrency, always
        settles back to 0).
     3. The "worker" terminology disambiguation — a static, doc-only claim,
        checked the same way knowledge-acquisition-dom-check.mjs already
        checks doc-only prose elsewhere in this codebase: read the real file
        text, assert the clarifying comment is actually present.

   No OCR, no AI, no production writes.
   Run: node scripts/import-pipeline-observability-check.mjs   (exit 0 = pass) */

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  archiveDocument, registerArchiveObserver, resetArchiveObservers, ARCHIVE_OBSERVER_EVENT,
} from '../src/organizational-memory/services/archive-service.js';
import { resetArchiveRepository } from '../src/organizational-memory/repository/archive-repository.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); }
}

/* ══ Part 1 — registerArchiveObserver, against the real engine ═══════════ */

console.log('\n[Archive Observer — real event, real engine, zero polling]');
{
  resetArchiveRepository();
  resetArchiveObservers();

  const events = [];
  registerArchiveObserver((record, event) => events.push({ id: record.id, event }));

  const created = archiveDocument({
    id: 'arc-1', sourceDomainType: 'nor', sourceId: 'nor-1', sourceType: 'nor',
    documentNumber: 'D/001', documentHash: 'hash-1',
  });
  check('archiveDocument (create) succeeds', created.ok === true);
  check('observer fired exactly once for the create', events.length === 1);
  check('observer received the CREATED event', events[0] && events[0].event === ARCHIVE_OBSERVER_EVENT.CREATED);
  check('observer received the real record id', events[0] && events[0].id === 'arc-1');

  const appended = archiveDocument({
    id: 'arc-1', sourceDomainType: 'nor', sourceId: 'nor-1', sourceType: 'nor',
    documentNumber: 'D/001', documentHash: 'hash-1-rev2',
  });
  check('a second archiveDocument for the same id appends a version', appended.ok === true && appended.op === 'append');
  check('observer fired again for the append', events.length === 2);
  check('observer received the VERSION_APPENDED event', events[1] && events[1].event === ARCHIVE_OBSERVER_EVENT.VERSION_APPENDED);
}

console.log('\n[Archive Observer — a throwing observer never breaks the write]');
{
  resetArchiveRepository();
  resetArchiveObservers();
  let goodObserverFired = false;
  registerArchiveObserver(() => { throw new Error('a badly-written observer'); });
  registerArchiveObserver(() => { goodObserverFired = true; });

  const result = archiveDocument({
    id: 'arc-2', sourceDomainType: 'nor', sourceId: 'nor-2', sourceType: 'nor',
    documentNumber: 'D/002', documentHash: 'hash-2',
  });
  check('the write itself still succeeds despite a throwing observer', result.ok === true);
  check('a later, well-behaved observer still runs after the throwing one', goodObserverFired === true);
}

console.log('\n[Archive Observer — a failed write never notifies]');
{
  resetArchiveRepository();
  resetArchiveObservers();
  let fired = 0;
  registerArchiveObserver(() => { fired += 1; });

  // Missing required fields (documentHash) — makeArchiveRecord/isArchiveRecord
  // will refuse this, so repoCreate must fail and no observer should fire.
  const invalid = archiveDocument({
    id: '', sourceDomainType: 'nor', sourceId: 'nor-3', sourceType: 'nor', documentNumber: 'D/003',
  });
  check('an invalid seed is honestly rejected, not silently written', invalid.ok === false);
  check('no observer fires for a write that never actually happened', fired === 0);
}

console.log('\n[Archive Observer — reset helper is a genuine teardown]');
{
  resetArchiveObservers();
  let fired = 0;
  registerArchiveObserver(() => { fired += 1; });
  resetArchiveObservers();
  archiveDocument({
    id: 'arc-4', sourceDomainType: 'nor', sourceId: 'nor-4', sourceType: 'nor',
    documentNumber: 'D/004', documentHash: 'hash-4',
  });
  check('resetArchiveObservers() genuinely clears prior registrations', fired === 0);
}

/* ══ Part 2 — live worker-pool occupancy (faithful replica, see header) ═══ */

console.log('\n[Worker-pool occupancy — faithful replica of the exact busy++/busy-- placement]');

async function simulateBusyTracking(n, concurrency, { throwOnIndex = null } = {}) {
  const progress = { busy: 0, peak: 0, processed: 0 };
  let nextIndex = 0;
  async function worker() {
    for (;;) {
      if (nextIndex >= n) return;
      const myIndex = nextIndex;
      nextIndex += 1;
      progress.busy += 1;
      progress.peak = Math.max(progress.peak, progress.busy);
      try {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve, reject) => {
          setTimeout(() => (myIndex === throwOnIndex ? reject(new Error('simulated failure')) : resolve()), Math.random() * 5);
        });
      } catch {
        // mirrors dataset-import-center.js#worker()'s try/catch around
        // processOneFile — the decrement below still runs regardless.
      } finally {
        progress.busy -= 1;
      }
      progress.processed += 1;
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return progress;
}

for (const [n, concurrency] of [[20, 4], [50, 8], [5, 8]]) {
  // eslint-disable-next-line no-await-in-loop
  const { busy, peak, processed } = await simulateBusyTracking(n, concurrency);
  check(`N=${n}, concurrency=${concurrency}: busy settles back to 0 when done`, busy === 0);
  check(`N=${n}, concurrency=${concurrency}: peak occupancy never exceeds min(concurrency, N)`, peak <= Math.min(concurrency, n));
  check(`N=${n}, concurrency=${concurrency}: peak occupancy genuinely reflects real parallelism (>1 when N>concurrency)`, n >= concurrency ? peak > 1 : true);
  check(`N=${n}, concurrency=${concurrency}: every file processed exactly once`, processed === n);
}

{
  // eslint-disable-next-line no-await-in-loop
  const { busy } = await simulateBusyTracking(10, 4, { throwOnIndex: 3 });
  check('a thrown error mid-file still decrements busy (finally, not just the happy path)', busy === 0);
}

/* ══ Part 3 — the "worker" disambiguation is real, present prose ══════════ */

console.log('\n[Terminology disambiguation — the doc-only fix is actually present]');
{
  const workerRuntimeSrc = fs.readFileSync(path.join(repoRoot, 'src/file-storage/worker-runtime.js'), 'utf8');
  const schedulerSrc = fs.readFileSync(path.join(repoRoot, 'src/knowledge/datasets/import-session/pipeline-scheduler.js'), 'utf8');
  const dicSrc = fs.readFileSync(path.join(repoRoot, 'src/ui/dataset-import-center.js'), 'utf8');

  check('worker-runtime.js documents the three-way "worker" collision', /three genuinely different things/.test(workerRuntimeSrc));
  check('pipeline-scheduler.js cross-references the disambiguation', /NOT a Worker thread/.test(schedulerSrc));
  check('dataset-import-center.js cross-references the disambiguation', /NOT a browser Worker thread/.test(dicSrc));
}

console.log(`\n${pass}/${pass + fail} checks passed.`);
if (fail > 0) process.exit(1);
