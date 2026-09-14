/* agenda-classification-profile-sync.mjs — V1.31 C5.2 Final Execution
   (follow-up, discovered mid-execution — not part of the original plan)

   WHY THIS SCRIPT EXISTS: functions/src/users/onUserWrite.js is still
   running its DEPLOYED version in production (this phase explicitly does
   not deploy Functions), whose PROFILE_FIELDS allowlist predates
   agendaParticipantType. So when the classification write
   (agenda-classification-write.mjs) touched /users/{evan,grace,leo,
   sarpras,admin}, the REAL, currently-deployed trigger fired (as
   designed) and regenerated each /userProfiles/{username} — but using
   the OLD field list, silently omitting agendaParticipantType from the
   mirror even though it is now correctly present on /users (the source
   of truth). Confirmed by reading all 5 profiles fresh after the writes:
   none carry the field.

   This script closes that specific gap WITHOUT deploying Functions: for
   exactly these 5 usernames, it re-derives the expected profile via the
   REAL, unmodified extractProfile() (imported from
   functions/src/users/profile-fields.js — the same source of truth the
   backfill script uses) from a FRESH read of /users, diffs it against the
   FRESH current /userProfiles record, and if (and only if) they differ,
   writes a narrow PATCH containing only the differing keys. It never
   touches any field extractProfile() wouldn't also produce, and it is a
   bridging measure, not a replacement for eventually deploying the
   updated trigger — once that deploy happens, this script becomes a
   no-op for these users (their profiles will already match).

   SAFETY MODEL: identical to the sibling scripts — dry-run by default,
   --execute required, project-id hard assertion, fresh-read-then-diff,
   narrow PATCH only, verified after.

   Run (dry run, default):  node scripts/agenda-classification-profile-sync.mjs
   Run (execute):           node scripts/agenda-classification-profile-sync.mjs --execute */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXPECTED_PROJECT = 'schedule-driver-pbsi';
const EXECUTE = process.argv.includes('--execute');
const TARGETS = ['evan', 'grace', 'leo', 'sarpras', 'admin'];

const firebaserc = JSON.parse(fs.readFileSync(path.join(ROOT, '.firebaserc'), 'utf8'));
if (firebaserc?.projects?.default !== EXPECTED_PROJECT) {
  console.error(`[ABORT] .firebaserc default project is "${firebaserc?.projects?.default}", expected "${EXPECTED_PROJECT}".`);
  process.exit(1);
}
console.log(`[safety] project OK: ${EXPECTED_PROJECT}`);

const { extractProfile } = await import(pathToFileURL(path.join(ROOT, 'functions', 'src', 'users', 'profile-fields.js')));

// RTDB does not preserve write-time key order on read, so verification
// must compare by key/value, never by JSON.stringify() equality.
function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  const ak = Object.keys(a).sort(), bk = Object.keys(b).sort();
  if (JSON.stringify(ak) !== JSON.stringify(bk)) return false;
  return ak.every((k) => a[k] === b[k]);
}

function dbGet(nodePath) {
  const tmp = path.join(os.tmpdir(), `c52sync-${nodePath.replace(/\//g, '_')}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  const res = spawnSync('firebase', ['database:get', `/${nodePath}`, '-o', tmp], { cwd: ROOT, shell: true, encoding: 'utf8' });
  if (res.status !== 0) throw new Error(`firebase database:get /${nodePath} failed: ${res.stderr || res.stdout}`);
  const raw = fs.readFileSync(tmp, 'utf8').trim();
  fs.unlinkSync(tmp);
  return raw === 'null' || raw === '' ? null : JSON.parse(raw);
}

console.log('\n=== DRY RUN (diff against fresh /users source of truth) ===');
const plan = [];
for (const username of TARGETS) {
  const usersRecord = dbGet(`users/${username}`);
  const currentProfile = dbGet(`userProfiles/${username}`);
  const expectedProfile = extractProfile(username, usersRecord || {});
  const diffKeys = Object.keys(expectedProfile).filter((k) => JSON.stringify(currentProfile?.[k]) !== JSON.stringify(expectedProfile[k]));
  plan.push({ username, currentProfile, expectedProfile, diffKeys });
  console.log(`  ${username}: current=${JSON.stringify(currentProfile)}`);
  console.log(`  ${username}: expected=${JSON.stringify(expectedProfile)}`);
  console.log(`  ${username}: would patch keys = [${diffKeys.join(', ')}]`);
}

const needsWrite = plan.filter((p) => p.diffKeys.length > 0);
console.log(`\nTOTAL TARGETS: ${TARGETS.length}`);
console.log(`ALREADY IN SYNC: ${TARGETS.length - needsWrite.length}`);
console.log(`NEED PATCH: ${needsWrite.length}`);

if (!EXECUTE) {
  console.log('\n[dry-run only] Pass --execute to perform the patches above. No writes were made.');
  process.exit(0);
}

if (needsWrite.length === 0) {
  console.log('\n[execute] Nothing to do — all 5 profiles already match extractProfile() output.');
  process.exit(0);
}

console.log('\n=== EXECUTING ===');
let allOk = true;
for (const item of needsWrite) {
  const patch = {};
  for (const k of item.diffKeys) patch[k] = item.expectedProfile[k];
  const patchFile = path.join(os.tmpdir(), `c52sync-patch-${item.username}-${Date.now()}.json`);
  fs.writeFileSync(patchFile, JSON.stringify(patch));
  console.log(`  patching /userProfiles/${item.username} with [${item.diffKeys.join(', ')}] ...`);
  const res = spawnSync('firebase', ['database:update', `/userProfiles/${item.username}`, patchFile, '--force'], { cwd: ROOT, shell: true, encoding: 'utf8', stdio: 'inherit' });
  fs.unlinkSync(patchFile);
  if (res.status !== 0) { console.error(`  ✗ write FAILED for ${item.username}`); allOk = false; continue; }

  const after = dbGet(`userProfiles/${item.username}`);
  const matches = deepEqual(after, item.expectedProfile);
  allOk = allOk && matches;
  console.log(`  ${matches ? '✓' : '✗'} ${item.username} — profile now ${JSON.stringify(after)}${matches ? '' : ' (does NOT match expected ' + JSON.stringify(item.expectedProfile) + ')'}`);
}

console.log(allOk ? '\nALL SYNCED PROFILES VERIFIED OK.' : '\nSOME SYNC WRITES FAILED OR MISMATCHED — see ✗ lines above.');
process.exit(allOk ? 0 : 1);
