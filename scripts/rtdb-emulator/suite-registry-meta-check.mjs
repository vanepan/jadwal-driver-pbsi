/* suite-registry-meta-check.mjs — RTDB Authorization Validation Suite
   (v1.30.7.5, Phase B refinement: explicit ordered suite registry)

   PURE Node filesystem check — no Firebase, no emulator needed at all
   (still run inside the same `emulators:exec`-wrapped batch as every other
   suite for orchestration simplicity, per explicit instruction to keep one
   execution path for all suites). Proves `suite-registry.mjs`'s
   `SUITE_REGISTRY` is trustworthy in BOTH directions before anything else
   in this batch runs (registered first in the registry itself):

     1. Every registered suite name actually exists as a file on disk —
        catches a typo'd or deleted entry in the registry.
     2. Every `*-check.mjs` file physically present in this directory
        appears somewhere in the registry — catches a new suite file that
        was written but never registered, which under the old filesystem-glob
        discovery would have silently started running with zero record of
        why, and under this registry model would otherwise silently NEVER
        run at all.

   This file's OWN filename is deliberately excluded from the "every file
   on disk must be registered" check target list logic below only in the
   trivial sense that it doesn't check itself — it's already unconditionally
   present in the registry above, in the same file, so it can't accidentally
   be an orphan by construction.

   Run: npm run test:rtdb-emulator (exit 0 = pass) */

import { readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { SUITE_REGISTRY } from './suite-registry.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };

console.log('\n=== Registry -> disk: every registered suite must exist as a real file ===');
for (const file of SUITE_REGISTRY) {
  check(`registered suite exists on disk: ${file}`, existsSync(path.join(DIR, file)));
}

console.log('\n=== Disk -> registry: every *-check.mjs file present must be registered (no orphans) ===');
const filesOnDisk = readdirSync(DIR).filter((f) => f.endsWith('-check.mjs'));
for (const file of filesOnDisk) {
  check(`on-disk suite is registered in SUITE_REGISTRY: ${file}`, SUITE_REGISTRY.includes(file));
}

console.log('\n=== Registry has no duplicate entries ===');
check('SUITE_REGISTRY has no duplicate filenames', new Set(SUITE_REGISTRY).size === SUITE_REGISTRY.length);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
