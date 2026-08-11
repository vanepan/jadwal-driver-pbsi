/* run-with-emulator.mjs — RTDB Authorization Validation Suite (v1.30.7.1,
   Phase A: Emulator Harness Foundation)

   Entry point for `npm run test:rtdb-emulator`. Boots the REAL Firebase
   Realtime Database emulator (JVM-based) with `firebase.json`'s existing
   `emulators.database` config, runs every check in
   scripts/rtdb-emulator/*-check.mjs against it via
   `firebase emulators:exec`, then tears the emulator down and exits with
   the checks' combined exit code.

   This is the ONLY file in this suite that shells out to anything, and
   the ONLY place JAVA_HOME defensiveness needs to live: `firebase
   emulators:exec` is the process that needs Java on its OWN PATH to find
   and launch the emulator JAR. By the time the wrapped check scripts run,
   the emulator is already up and they only speak the RTDB wire protocol
   over HTTP via @firebase/rules-unit-testing — no Java involved on their
   side at all.

   Resolution order for a usable JDK, since this environment has none on
   the system PATH by default and `setx`-persisted env vars are invisible
   to shells already open when they were set:
     1. process.env.JAVA_HOME, if it points at a real jdk directory.
     2. The known local install path from this session's manual JDK setup.
     3. `where java` (Windows) / `which java` (POSIX), if java is already
        resolvable without JAVA_HOME.
   Any failure to resolve Java is reported with an actionable message
   rather than a raw ENOENT from the child process.

   Run: npm run test:rtdb-emulator (exit 0 = pass) */

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
    // .../<jdkHome>/bin/java(.exe) — walk up two segments to get JAVA_HOME.
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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const runAllChecks = path.join('scripts', 'rtdb-emulator', 'run-all-checks.mjs');

// On Windows, the global `firebase` CLI is a .cmd shim, which Node can
// only ever execute through a shell (spawnSync throws EINVAL otherwise —
// this is documented Node behavior, not fixable by naming firebase.cmd
// explicitly). But shell:true PLUS a separate args array runs the args
// through Node's own cmd.exe-quoting first, which does not correctly
// preserve `"node <path with spaces-free but multi-word>"` as one
// argument end to end — firebase-tools then sees it split into stray
// extra arguments ("Too many arguments"). Building the entire command as
// one string and letting cmd.exe parse it directly sidesteps both
// problems at once.
const fullCommand = `firebase emulators:exec --only database "node ${runAllChecks}"`;

const result = spawnSync(fullCommand, { stdio: 'inherit', env: childEnv, cwd: ROOT, shell: true });

if (result.error) {
  console.error(`[run-with-emulator] Failed to launch firebase CLI: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
