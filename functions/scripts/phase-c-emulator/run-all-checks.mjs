/* run-all-checks.mjs — RTDB Authorization Validation Suite (v1.30.7.x,
   Phase C: Cloud Function & Server-Side Authorization Validation)

   Orchestrator only — no security assertions of its own. Structurally
   identical to scripts/rtdb-emulator/run-all-checks.mjs (same three
   guarantees: existence checked up front, each suite spawned inside its
   own try/catch so one crash can't silently abort the batch, a final
   reconciliation confirms nothing registered was silently skipped) —
   only the registry import and the executed file extension differ
   (`.js`/CJS test files here, since they live under functions/ and must
   resolve `require('firebase-admin')` against functions/node_modules).

   Not invoked directly — run via `npm run test:functions-emulator`. */

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
