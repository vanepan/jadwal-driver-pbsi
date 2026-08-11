/* run-with-emulator.mjs — RTDB Authorization Validation Suite (v1.30.7.x,
   Phase C: Cloud Function & Server-Side Authorization Validation)

   Entry point for `npm run test:functions-emulator`. Boots the REAL
   Firebase Realtime Database emulator (JVM-based) with `firebase.json`'s
   existing `emulators.database` config, runs every check in
   functions/scripts/phase-c-emulator/*.js against it via
   `firebase emulators:exec`, then tears the emulator down and exits with
   the checks' combined exit code. Structurally a copy of
   scripts/rtdb-emulator/run-with-emulator.mjs (same JAVA_HOME resolution,
   same Windows spawnSync(fullCommandString, {shell:true}) fix for the
   `.cmd`-shim quoting bug already diagnosed there) — the only two
   differences are the extra directory depth (this file sits one level
   deeper: functions/scripts/phase-c-emulator/, not scripts/rtdb-emulator/)
   and the wrapped target (run-all-checks.mjs in THIS directory).

   Deliberately a SEPARATE command from `npm run test:rtdb-emulator`, not
   merged into that suite's registry — Phase A/B connect to the emulator
   via @firebase/rules-unit-testing's initializeTestEnvironment(); Phase C
   connects via the ambient FIREBASE_DATABASE_EMULATOR_HOST env var and
   the real firebase-admin SDK. Interleaving the two connection mechanisms
   in one process/registry would blur exactly the kind of "which
   mechanism produced this write" question this program's safety
   discipline exists to keep unambiguous.

   Run: npm run test:functions-emulator (exit 0 = pass) */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

// firebase-tools >=14 requires a JDK 21+ runtime for the RTDB emulator.
const FALLBACK_JDK_HOME = path.join(os.homedir(), '.jdk', 'jdk-21.0.12+8');

function looksLikeJdkHome(dir) {
  if (!dir) return false;
  const javaBin = process.platform === 'win32' ? 'java.exe' : 'java';
  return existsSync(path.join(dir, 'bin', javaBin));
}

function findJavaOnPath() {
  const finder = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(finder, ['java'], { encoding: 'utf8' });
  if (result.status === 0 && result.stdout.trim()) {
    const javaBinPath = result.stdout.trim().split(/\r?\n/)[0];
    return path.dirname(path.dirname(javaBinPath));
  }
  return null;
}

function resolveJavaHome() {
  if (looksLikeJdkHome(process.env.JAVA_HOME)) return process.env.JAVA_HOME;
  if (looksLikeJdkHome(FALLBACK_JDK_HOME)) return FALLBACK_JDK_HOME;
  const onPath = findJavaOnPath();
  if (looksLikeJdkHome(onPath)) return onPath;
  return null;
}

const javaHome = resolveJavaHome();
if (!javaHome) {
  console.error(
    '\n[run-with-emulator] Could not locate a Java installation. The ' +
    'Firebase Realtime Database emulator requires a JRE/JDK on PATH.\n' +
    'Set JAVA_HOME to a valid JDK directory and retry.\n'
  );
  process.exit(1);
}

console.log(`[run-with-emulator] Using JAVA_HOME=${javaHome}`);

const childEnv = {
  ...process.env,
  JAVA_HOME: javaHome,
  PATH: `${path.join(javaHome, 'bin')}${path.delimiter}${process.env.PATH || ''}`,
};

// This file lives at functions/scripts/phase-c-emulator/ — one directory
// deeper than scripts/rtdb-emulator/ — so the repo root is THREE levels
// up, not two.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const runAllChecks = path.join('functions', 'scripts', 'phase-c-emulator', 'run-all-checks.mjs');

const fullCommand = `firebase emulators:exec --only database "node ${runAllChecks}"`;

const result = spawnSync(fullCommand, { stdio: 'inherit', env: childEnv, cwd: ROOT, shell: true });

if (result.error) {
  console.error(`[run-with-emulator] Failed to launch firebase CLI: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
