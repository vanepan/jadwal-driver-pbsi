/* run-all-checks.mjs — RTDB Authorization Validation Suite (v1.30.7.5,
   Phase B refinement: explicit ordered suite registry)

   Orchestrator only — no security assertions of its own (the meta-check's
   registry-integrity assertions are the one exception, and those live in
   suite-registry-meta-check.mjs, not here). Runs every suite listed in
   `suite-registry.mjs`'s `SUITE_REGISTRY`, IN ORDER, as an independent
   child process (inherited stdio, so each one's own `✓`/`✗`/summary
   output prints directly), so the whole family of emulator-dependent
   check scripts can share ONE emulator boot/teardown cycle (this file is
   itself the command `firebase emulators:exec` wraps — see
   run-with-emulator.mjs).

   Previously discovered suites implicitly via `readdirSync(...).filter(f
   => f.endsWith('-check.mjs'))` — replaced per explicit instruction with
   this registry so the expected suite inventory is an explicit, reviewable
   list rather than "whatever happens to match a filename pattern on disk."
   Three guarantees this file now provides, verified in this order:

     1. Existence, before running anything: every registered suite must be
        a real file, checked up front — fail fast rather than discovering
        a missing suite mid-batch.
     2. Every suite executes: each entry is spawned inside its own
        try/catch, so a thrown error from the spawn call itself (not just a
        nonzero exit code, which is a normal/expected outcome for a failing
        check) can never silently abort the loop before later suites run.
     3. No registered suite is silently skipped: a final reconciliation
        confirms every registry entry produced an actual execution record.

   Not invoked directly — run via `npm run test:rtdb-emulator`. */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { SUITE_REGISTRY } from './suite-registry.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));

console.log(`[run-all-checks] Verifying ${SUITE_REGISTRY.length} registered suite(s) exist before running anything...`);
const missing = SUITE_REGISTRY.filter((file) => !existsSync(path.join(DIR, file)));
if (missing.length > 0) {
  console.error(`[run-all-checks] REGISTRY ERROR: registered suite(s) not found on disk, aborting before running anything:\n  - ${missing.join('\n  - ')}`);
  process.exit(1);
}

console.log(`[run-all-checks] Running ${SUITE_REGISTRY.length} registered suite(s), in order, against the live RTDB emulator:\n  - ${SUITE_REGISTRY.join('\n  - ')}\n`);

const executed = [];
for (const file of SUITE_REGISTRY) {
  console.log(`\n──────────────────────────────────────────────────────────────\n${file}\n──────────────────────────────────────────────────────────────`);
  try {
    const result = spawnSync(process.execPath, [path.join(DIR, file)], { stdio: 'inherit' });
    executed.push({ file, status: result.error ? null : result.status, error: result.error || null });
  } catch (err) {
    // A thrown error here (as opposed to a normal nonzero exit code, which
    // spawnSync returns rather than throws) must not abort the loop before
    // the remaining registered suites get a chance to run.
    executed.push({ file, status: null, error: err });
  }
}

let anyFailed = false;
for (const { file, status, error } of executed) {
  if (error) {
    console.error(`[run-all-checks] SUITE DID NOT EXECUTE: ${file} — ${error.message}`);
    anyFailed = true;
  } else if (status !== 0) {
    anyFailed = true;
  }
}

const skipped = SUITE_REGISTRY.filter((file) => !executed.some((e) => e.file === file));
if (skipped.length > 0) {
  console.error(`[run-all-checks] REGISTRY ERROR: suite(s) registered but never executed: ${skipped.join(', ')}`);
  anyFailed = true;
}

console.log(`\n[run-all-checks] Executed ${executed.length}/${SUITE_REGISTRY.length} registered suites.`);
process.exit(anyFailed ? 1 : 0);
