/* intelligence-authority-emulator-e2e.mjs — C4E runner.

   Boots the REAL Realtime Database emulator (firebase.json's existing
   emulators.database config) via `firebase emulators:exec --only
   database`, runs scripts/_intelligence-authority-e2e-inner.cjs against
   it (real production-wired Intelligence callable handlers, real
   corpus-esm analysis pipeline, real stores), then tears the emulator
   down. Zero production contact — the inner harness's safety guard
   refuses to load a functions/src module unless
   FIREBASE_DATABASE_EMULATOR_HOST points at the local emulator.

   Structurally a copy of functions/scripts/phase-c-emulator/
   run-with-emulator.mjs (same JAVA_HOME resolution + Windows shell fix).

   Run:  node scripts/intelligence-authority-emulator-e2e.mjs   (exit 0 = pass)
*/

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const FALLBACK_JDK_HOME = path.join(os.homedir(), '.jdk', 'jdk-21.0.12+8');
const javaBin = process.platform === 'win32' ? 'java.exe' : 'java';
const looksLikeJdkHome = (d) => !!d && existsSync(path.join(d, 'bin', javaBin));
function findJavaOnPath() {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['java'], { encoding: 'utf8' });
  if (r.status === 0 && r.stdout.trim()) return path.dirname(path.dirname(r.stdout.trim().split(/\r?\n/)[0]));
  return null;
}
const javaHome = [process.env.JAVA_HOME, FALLBACK_JDK_HOME, findJavaOnPath()].find(looksLikeJdkHome);
if (!javaHome) {
  console.error('\n[c4e] No JDK found — the RTDB emulator needs a JRE/JDK. Set JAVA_HOME.\n');
  process.exit(1);
}
console.log(`[c4e] JAVA_HOME=${javaHome}`);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const childEnv = {
  ...process.env,
  JAVA_HOME: javaHome,
  PATH: `${path.join(javaHome, 'bin')}${path.delimiter}${process.env.PATH || ''}`,
  MSYS_NO_PATHCONV: '1',
};
const inner = path.join('scripts', '_intelligence-authority-e2e-inner.cjs');
const cmd = `firebase emulators:exec --only database --project schedule-driver-pbsi "node ${inner}"`;
const result = spawnSync(cmd, { stdio: 'inherit', env: childEnv, cwd: ROOT, shell: true });
if (result.error) { console.error(`[c4e] launch failed: ${result.error.message}`); process.exit(1); }
process.exit(result.status ?? 1);
