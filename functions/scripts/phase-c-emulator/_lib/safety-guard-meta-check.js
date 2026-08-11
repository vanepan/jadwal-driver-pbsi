'use strict';

/* ============================================================
   _lib/safety-guard-meta-check.js — RTDB Authorization Validation Suite
   (v1.30.7.x, Phase C: Cloud Function & Server-Side Authorization
   Validation)

   Proves safety-guard.js itself is trustworthy BEFORE any test in this
   suite relies on it — registered first in suite-registry.mjs. Two
   directions:

     1. NEGATIVE — a deliberately bad FIREBASE_DATABASE_EMULATOR_HOST
        (unset, a non-loopback host, a mismatched port) must make the
        guard exit non-zero. Run in a CHILD process, not in-process:
        assertSafeEmulatorOrExit() calls process.exit(1) on failure by
        design (never a bare throw a wrapping try/catch could swallow —
        see safety-guard.js's own header), which would kill THIS
        process's own test run if called in-process. spawnSync with a
        deliberately bad env is the only way to observe that exit
        behavior without ending the meta-check itself.

     2. POSITIVE — called normally (in-process, against the real running
        emulator this whole suite already depends on) it must resolve
        without exiting.

   Run: npm run test:functions-emulator (exit 0 = pass) */

const { spawnSync } = require('node:child_process');
const path = require('node:path');

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };

const GUARD_PATH = path.join(__dirname, 'safety-guard.js');

function runChildWithEnv(envOverrides) {
  const env = { ...process.env };
  for (const [k, v] of Object.entries(envOverrides)) {
    if (v === undefined) delete env[k];
    else env[k] = v;
  }
  return spawnSync(
    process.execPath,
    ['-e', `require(${JSON.stringify(GUARD_PATH)}).assertSafeEmulatorOrExit().then(() => { console.log('GUARD_RESOLVED'); process.exit(0); })`],
    { env, encoding: 'utf8' },
  );
}

async function main() {
  console.log('\n=== NEGATIVE — the guard must reject bad emulator hosts (run in a child process; the guard exits the process on failure by design) ===');

  check(
    'FIREBASE_DATABASE_EMULATOR_HOST unset -> child exits non-zero',
    runChildWithEnv({ FIREBASE_DATABASE_EMULATOR_HOST: undefined }).status !== 0,
  );
  check(
    'FIREBASE_DATABASE_EMULATOR_HOST pointed at a non-loopback host -> child exits non-zero',
    runChildWithEnv({ FIREBASE_DATABASE_EMULATOR_HOST: 'production-project.firebaseio.com:443' }).status !== 0,
  );
  check(
    'FIREBASE_DATABASE_EMULATOR_HOST with a MISMATCHED port (loopback, but not firebase.json\'s configured port) -> child exits non-zero',
    runChildWithEnv({ FIREBASE_DATABASE_EMULATOR_HOST: '127.0.0.1:59999' }).status !== 0,
  );

  console.log('\n=== POSITIVE — the guard must resolve against the real, currently-running emulator ===');
  const { assertSafeEmulatorOrExit } = require('./safety-guard');
  try {
    await assertSafeEmulatorOrExit();
    pass++; console.log('  ✓ assertSafeEmulatorOrExit() resolves in-process against the real emulator, does not exit');
  } catch (err) {
    fail++; console.log(`  ✗ assertSafeEmulatorOrExit() unexpectedly threw: ${err.message}`);
  }

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
