/* suite-registry-meta-check.mjs — RTDB Authorization Validation Suite
   (v1.30.7.x, Phase C: Cloud Function & Server-Side Authorization
   Validation)

   PURE Node filesystem check — no Firebase, no emulator, no Admin SDK.
   Mirrors scripts/rtdb-emulator/suite-registry-meta-check.mjs exactly.
   Proves suite-registry.mjs's SUITE_REGISTRY is trustworthy in BOTH
   directions:

     1. Every registered suite name exists as a file on disk.
     2. Every top-level *-check.js file physically present in this
        directory appears somewhere in the registry (non-recursive scan,
        matching Phase A/B's precedent — _lib/ is infrastructure, not a
        place ordinary new check files get dropped, and its one check
        file, safety-guard-meta-check.js, is deliberately hand-registered
        instead, documented in suite-registry.mjs itself).

   Run: npm run test:functions-emulator (exit 0 = pass) */

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

console.log('\n=== Disk -> registry: every top-level *-check.js file present must be registered (no orphans) ===');
const filesOnDisk = readdirSync(DIR).filter((f) => f.endsWith('-check.js'));
for (const file of filesOnDisk) {
  check(`on-disk suite is registered in SUITE_REGISTRY: ${file}`, SUITE_REGISTRY.includes(file));
}

console.log('\n=== Registry has no duplicate entries ===');
check('SUITE_REGISTRY has no duplicate filenames', new Set(SUITE_REGISTRY).size === SUITE_REGISTRY.length);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
