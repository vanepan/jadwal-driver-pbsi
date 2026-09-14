/* userprofiles-mirror-backfill.mjs — V1.31 C5.2 Production Data Remediation

   One-time repair for a broken invariant: functions/src/users/onUserWrite.js
   mirrors /users/{username} -> /userProfiles/{username} on every WRITE to
   /users/{username}, but a user whose record was never re-written since that
   trigger went live (v1.30.6.10) has no mirror at all. Discovered via the
   Agenda & To-Do participant picker (which reads ONLY /userProfiles) showing
   "Leo missing" — Leo turned out to be one of 21 real /users accounts with
   no /userProfiles projection, not a picker defect.

   SAFETY MODEL:
   - Dry-run by default. Requires the literal flag --execute to write anything.
   - Hard-aborts unless .firebaserc's default project is exactly
     'schedule-driver-pbsi' (never runs against the wrong project).
   - Uses the REAL extractProfile() (imported from
     functions/src/users/profile-fields.js — extracted this phase out of
     onUserWrite.js, which still owns the trigger effect, so this exact
     transformation is importable from a plain Node script without dragging
     in onUserWrite.js's require('../config/admin') and its eager, outside-
     the-Functions-runtime-throwing admin.database() call) — the only
     fields that can ever land in a created profile are the ones that
     function already copies today: displayName/role/active/archived/
     archivedAt. It never touches pin/pinHash/notificationsEnabled/
     telegramChatIds/createdAt/updatedAt.
   - Writes ONLY /userProfiles/{username} for usernames confirmed (on a FRESH
     read taken immediately before the write) to still have no profile.
     Never overwrites/merges into an existing profile. Never touches /users
     or any other node. Uses `firebase database:update /userProfiles <patch>`
     (a PATCH — RTDB `update` only ever touches the keys present in the
     patch object; sibling keys not in the patch are left byte-identical),
     the same CLI-based production-write mechanism already used for the
     documented odometer repair (2026-09-10) — no new credential/service-
     account plumbing introduced.
   - Every write is verified with a fresh post-write read and diffed against
     the expected extractProfile() output before being reported as OK.

   Run (dry run, default):  node scripts/userprofiles-mirror-backfill.mjs
   Run (execute):           node scripts/userprofiles-mirror-backfill.mjs --execute
   Requires PATH to include a JDK-free `firebase` CLI already logged in with
   write access to the project (no emulator involved — this targets real
   production data by design). */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXPECTED_PROJECT = 'schedule-driver-pbsi';
const EXECUTE = process.argv.includes('--execute');

// ---- 1. Hard project-identity assertion — abort on anything else ----
const firebaserc = JSON.parse(fs.readFileSync(path.join(ROOT, '.firebaserc'), 'utf8'));
const actualProject = firebaserc?.projects?.default;
if (actualProject !== EXPECTED_PROJECT) {
  console.error(`[ABORT] .firebaserc default project is "${actualProject}", expected "${EXPECTED_PROJECT}". Refusing to run.`);
  process.exit(1);
}
console.log(`[safety] project OK: ${actualProject}`);

// ---- 2. The REAL transformation logic — imported, never reimplemented ----
const { extractProfile } = await import(pathToFileURL(path.join(ROOT, 'functions', 'src', 'users', 'profile-fields.js')));

function dbGet(nodePath) {
  const tmp = path.join(os.tmpdir(), `c52-${nodePath.replace(/\//g, '_')}-${Date.now()}.json`);
  const res = spawnSync('firebase', ['database:get', `/${nodePath}`, '-o', tmp], { cwd: ROOT, shell: true, encoding: 'utf8' });
  if (res.status !== 0) throw new Error(`firebase database:get /${nodePath} failed: ${res.stderr || res.stdout}`);
  const raw = fs.readFileSync(tmp, 'utf8').trim();
  fs.unlinkSync(tmp);
  return raw === 'null' || raw === '' ? {} : JSON.parse(raw);
}

// RTDB does not preserve write-time key order on read, so verification
// must compare by key/value, never by JSON.stringify() equality (which is
// order-sensitive and produces false-positive mismatches on real,
// correct data — caught during this phase's own execution).
function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  const ak = Object.keys(a).sort(), bk = Object.keys(b).sort();
  if (JSON.stringify(ak) !== JSON.stringify(bk)) return false;
  return ak.every((k) => a[k] === b[k]);
}

function computeOrphans(users, profiles) {
  return Object.keys(users)
    .filter((username) => !(username in profiles))
    .sort((a, b) => a.localeCompare(b));
}

function redactedRow(username, record, profileExists) {
  const derived = profileExists ? null : extractProfile(username, record);
  return {
    username,
    role: record.role,
    active: record.active === true,
    profile_exists: profileExists,
    would_create: !profileExists,
    derived_fields: derived ? JSON.stringify(derived) : '(unchanged)',
  };
}

function printTable(rows) {
  const cols = ['username', 'role', 'active', 'profile_exists', 'would_create', 'derived_fields'];
  console.log(cols.join(' | '));
  for (const r of rows) console.log(cols.map((c) => String(r[c])).join(' | '));
}

// ---- 3. DRY-RUN PASS (always runs, even with --execute — establishes the plan) ----
const usersDry = dbGet('users');
const profilesDry = dbGet('userProfiles');
const orphansDry = computeOrphans(usersDry, profilesDry);

console.log(`\n=== DRY RUN ===`);
const rows = Object.keys(usersDry).sort().map((u) => redactedRow(u, usersDry[u], u in profilesDry));
printTable(rows);

const wouldCreate = rows.filter((r) => r.would_create);
const wouldSkip = rows.filter((r) => !r.would_create);
// extractProfile()'s own field list is a closed, hardcoded set that never
// includes credential-shaped names — this check exists so a FUTURE edit to
// that list can never silently smuggle a secret through this script unseen.
const CREDENTIAL_FIELD_NAMES = ['pin', 'pinhash', 'password', 'secret', 'token'];
let credentialLeakRisk = 'NONE';
for (const r of wouldCreate) {
  const fields = Object.keys(JSON.parse(r.derived_fields));
  const bad = fields.filter((f) => CREDENTIAL_FIELD_NAMES.some((c) => f.toLowerCase().includes(c)));
  if (bad.length) credentialLeakRisk = `RISK: ${r.username} would carry field(s) ${bad.join(',')}`;
}

console.log(`\nTOTAL USERS: ${Object.keys(usersDry).length}`);
console.log(`TOTAL PROFILES: ${Object.keys(profilesDry).length}`);
console.log(`ORPHANS: ${orphansDry.length}`);
console.log(`WOULD CREATE: ${wouldCreate.length}`);
console.log(`WOULD SKIP: ${wouldSkip.length}`);
console.log(`CREDENTIAL LEAK RISK: ${credentialLeakRisk}`);
console.log(`EXPECTED WRITES: /userProfiles/{${wouldCreate.map((r) => r.username).join(', ')}}`);

if (!EXECUTE) {
  console.log(`\n[dry-run only] Pass --execute to perform the writes above. No writes were made.`);
  process.exit(0);
}

// ---- 4. EXECUTE PASS — only reached with --execute ----
console.log(`\n=== EXECUTING — re-reading fresh immediately before write ===`);
const usersFresh = dbGet('users');
const profilesFresh = dbGet('userProfiles');
const orphansFresh = computeOrphans(usersFresh, profilesFresh);

const patch = {};
for (const username of orphansFresh) {
  patch[username] = extractProfile(username, usersFresh[username]);
}

if (Object.keys(patch).length === 0) {
  console.log('[execute] Nothing to write — no orphans on the fresh read (already backfilled?).');
  process.exit(0);
}

const patchFile = path.join(os.tmpdir(), `c52-userProfiles-patch-${Date.now()}.json`);
fs.writeFileSync(patchFile, JSON.stringify(patch, null, 2));
console.log(`[execute] Writing ${Object.keys(patch).length} profile(s) via PATCH update at /userProfiles ...`);
const writeRes = spawnSync('firebase', ['database:update', '/userProfiles', patchFile, '--force'], { cwd: ROOT, shell: true, encoding: 'utf8', stdio: 'inherit' });
fs.unlinkSync(patchFile);
if (writeRes.status !== 0) {
  console.error('[execute] Write FAILED — see firebase CLI output above.');
  process.exit(1);
}

// ---- 5. Post-write verification ----
const profilesAfter = dbGet('userProfiles');
console.log('\n=== POST-WRITE VERIFICATION ===');
let allOk = true;
for (const username of Object.keys(patch)) {
  const expected = patch[username];
  const actual = profilesAfter[username];
  const ok = deepEqual(actual, expected);
  allOk = allOk && ok;
  console.log(`  ${ok ? '✓' : '✗'} ${username} — ${ok ? 'matches extractProfile() output' : 'MISMATCH, expected ' + JSON.stringify(expected) + ' got ' + JSON.stringify(actual)}`);
}
for (const username of Object.keys(profilesFresh)) {
  const unchanged = deepEqual(profilesAfter[username], profilesFresh[username]);
  if (!unchanged) { allOk = false; console.log(`  ✗ PRE-EXISTING profile ${username} was modified — this must never happen`); }
}
console.log(allOk ? '\nALL VERIFIED OK.' : '\nVERIFICATION FAILED — see ✗ lines above.');
process.exit(allOk ? 0 : 1);
