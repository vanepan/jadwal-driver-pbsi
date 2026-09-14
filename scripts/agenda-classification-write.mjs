/* agenda-classification-write.mjs — V1.31 C5.2 Final Execution

   Writes the explicitly-approved agendaParticipantType field to exactly 5
   /users/{username} records. This field is Agenda picker presentation/
   eligibility metadata ONLY — it carries zero authorization meaning, is
   never read by agenda-permissions.js, database.rules.json,
   verifyPin.js, or scopeClassifier.js, and does not touch role, active,
   displayName, credentials, or any other existing field.

   SAFETY MODEL:
   - Dry-run by default. Requires the literal flag --execute to write.
   - Hard-aborts unless .firebaserc's default project is exactly
     'schedule-driver-pbsi'.
   - Fresh-reads each of the 5 target /users records immediately before
     writing and aborts (reporting exactly why) if any materially differs
     from the reviewed evidence (missing, inactive, or a displayName that
     doesn't match what was reviewed) — never writes into a record whose
     identity has moved out from under this plan.
   - Each write is a narrow PATCH — firebase database:update on the
     user's OWN node with a body containing only {agendaParticipantType},
     which merges (never replaces the whole object). One user, one call,
     so there is no ambiguity about multi-location update semantics for a
     real production write.
   - Every write is verified with a fresh read immediately after, diffing
     the full record against its pre-write snapshot to prove ONLY
     agendaParticipantType changed.

   Run (dry run, default):  node scripts/agenda-classification-write.mjs
   Run (execute):           node scripts/agenda-classification-write.mjs --execute */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXPECTED_PROJECT = 'schedule-driver-pbsi';
const EXECUTE = process.argv.includes('--execute');

const PLAN = [
  { username: 'evan', expectedDisplayName: 'Evan', value: 'sarpras_staff' },
  { username: 'grace', expectedDisplayName: 'Grace', value: 'sarpras_staff' },
  { username: 'leo', expectedDisplayName: 'Leovando', value: 'sarpras_staff' },
  { username: 'sarpras', expectedDisplayName: 'Kepala Bidang Sarana dan Prasarana', value: 'kabid' },
  { username: 'admin', expectedDisplayName: 'Sarpras Admin', value: 'system' },
];

const firebaserc = JSON.parse(fs.readFileSync(path.join(ROOT, '.firebaserc'), 'utf8'));
const actualProject = firebaserc?.projects?.default;
if (actualProject !== EXPECTED_PROJECT) {
  console.error(`[ABORT] .firebaserc default project is "${actualProject}", expected "${EXPECTED_PROJECT}". Refusing to run.`);
  process.exit(1);
}
console.log(`[safety] project OK: ${actualProject}`);

function dbGet(nodePath) {
  const tmp = path.join(os.tmpdir(), `c52w-${nodePath.replace(/\//g, '_')}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  const res = spawnSync('firebase', ['database:get', `/${nodePath}`, '-o', tmp], { cwd: ROOT, shell: true, encoding: 'utf8' });
  if (res.status !== 0) throw new Error(`firebase database:get /${nodePath} failed: ${res.stderr || res.stdout}`);
  const raw = fs.readFileSync(tmp, 'utf8').trim();
  fs.unlinkSync(tmp);
  return raw === 'null' || raw === '' ? null : JSON.parse(raw);
}

function redact(record) {
  if (!record) return record;
  const { pin, pinHash, ...rest } = record;
  return rest;
}

// ---- Preflight: verify every target still matches reviewed evidence ----
console.log('\n=== PREFLIGHT ===');
const preflight = [];
let abort = false;
for (const item of PLAN) {
  const record = dbGet(`users/${item.username}`);
  const exists = record != null;
  const active = exists && record.active === true;
  const nameMatches = exists && record.displayName === item.expectedDisplayName;
  const alreadySet = exists && record.agendaParticipantType === item.value;
  const ok = exists && active && nameMatches;
  if (!ok) abort = true;
  preflight.push({ username: item.username, exists, active, nameMatches, alreadySet, current: redact(record) });
  console.log(`  ${ok ? 'OK' : 'MISMATCH'} /users/${item.username} — exists=${exists} active=${active} displayNameMatches=${nameMatches}${alreadySet ? ' (agendaParticipantType already set to the planned value)' : ''}`);
}

if (abort) {
  console.error('\n[ABORT] One or more target accounts no longer match the reviewed production evidence. No writes attempted.');
  console.error(JSON.stringify(preflight, null, 2));
  process.exit(1);
}

console.log('\nAll 5 targets verified present, active, and displayName-matched.');
console.log('\nPLANNED WRITES:');
for (const item of PLAN) console.log(`  /users/${item.username}/agendaParticipantType = "${item.value}"`);

if (!EXECUTE) {
  console.log('\n[dry-run only] Pass --execute to perform the writes above. No writes were made.');
  process.exit(0);
}

// ---- Execute: one narrow PATCH per user, verified individually ----
console.log('\n=== EXECUTING ===');
let allOk = true;
for (const item of PLAN) {
  const before = dbGet(`users/${item.username}`);
  const patchFile = path.join(os.tmpdir(), `c52w-patch-${item.username}-${Date.now()}.json`);
  fs.writeFileSync(patchFile, JSON.stringify({ agendaParticipantType: item.value }));
  console.log(`  writing /users/${item.username} (merge-patch, agendaParticipantType only) ...`);
  const res = spawnSync('firebase', ['database:update', `/users/${item.username}`, patchFile, '--force'], { cwd: ROOT, shell: true, encoding: 'utf8', stdio: 'inherit' });
  fs.unlinkSync(patchFile);
  if (res.status !== 0) { console.error(`  ✗ write FAILED for ${item.username}`); allOk = false; continue; }

  const after = dbGet(`users/${item.username}`);
  const changedKeys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})].filter((k) => JSON.stringify(before?.[k]) !== JSON.stringify(after?.[k])));
  const onlyExpectedChanged = changedKeys.size === 1 && changedKeys.has('agendaParticipantType');
  const valueCorrect = after?.agendaParticipantType === item.value;
  const ok = onlyExpectedChanged && valueCorrect;
  allOk = allOk && ok;
  console.log(`  ${ok ? '✓' : '✗'} ${item.username} — changed keys: [${[...changedKeys].join(', ')}], agendaParticipantType now "${after?.agendaParticipantType}"`);
}

console.log(allOk ? '\nALL 5 CLASSIFICATION WRITES VERIFIED OK.' : '\nSOME WRITES FAILED OR CHANGED MORE THAN EXPECTED — see ✗ lines above.');
process.exit(allOk ? 0 : 1);
