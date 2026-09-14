/* agenda-live-e2e-run-with-emulator.mjs — V1.31 Agenda & To-Do, Phase C3.1

   Entry point for the real authenticated-browser Agenda E2E. Boots the
   REAL Firebase Auth + Realtime Database emulators (JVM-based, via
   firebase.json's emulators.auth/emulators.database config — the auth
   emulator was added in this phase specifically for this test; see
   docs/AGENDA_TODO_PHASE_C3_1... for why) and runs
   scripts/agenda-live-e2e-check.cjs against them via
   `firebase emulators:exec`, then tears the emulators down and exits
   with the check's exit code.

   Deliberately its OWN runner, not a change to
   scripts/rtdb-emulator/run-with-emulator.mjs or
   functions/scripts/phase-c-emulator/run-with-emulator.mjs — those two
   existing runners are wired into registries that assume `--only
   database` only; changing their emulator target to add `auth` would
   affect every suite in both registries for a need only this one new
   check has. The JDK-resolution logic below is intentionally duplicated
   from those two files rather than factored into a shared module — this
   mirrors the fact that those two files ALREADY duplicate the identical
   block between themselves; a third copy is consistent with, not a
   departure from, this repo's established convention for this kind of
   small standalone runner.

   Run: node scripts/agenda-live-e2e-run-with-emulator.mjs (exit 0 = pass) */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

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
    '\n[agenda-live-e2e] Could not locate a Java installation. The Firebase ' +
    'emulators require a JRE/JDK on PATH.\nSet JAVA_HOME to a valid JDK ' +
    'directory and retry.\n'
  );
  process.exit(1);
}

console.log(`[agenda-live-e2e] Using JAVA_HOME=${javaHome}`);

const childEnv = {
  ...process.env,
  JAVA_HOME: javaHome,
  PATH: `${path.join(javaHome, 'bin')}${path.delimiter}${process.env.PATH || ''}`,
};

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checkFile = path.join('scripts', 'agenda-live-e2e-check.cjs');

// Same Windows shell-quoting rationale as the two existing runners this
// file otherwise mirrors (see their own comments) — build one command
// string and let cmd.exe parse it, rather than a separate args array.
const fullCommand = `firebase emulators:exec --only auth,database "node ${checkFile}"`;

const result = spawnSync(fullCommand, { stdio: 'inherit', env: childEnv, cwd: ROOT, shell: true });

if (result.error) {
  console.error(`[agenda-live-e2e] Failed to launch firebase CLI: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
