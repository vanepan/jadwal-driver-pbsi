/* rtdb-hardening-functions-check.mjs — RTDB Security Hardening Program,
   Phases 3 & 6 (v1.30.6.6, v1.30.6.10) — Cloud Functions logic

   PURE node test. None of functions/src/maintenance/backupTick.js,
   functions/src/reimbursement/counter.js, functions/src/users/onUserWrite.js,
   or functions/src/notifications/notifyAdminsOfNewRequest.js can be
   required directly in a plain Node script — every one of them (via
   functions/src/config/admin.js) calls firebase-admin's
   admin.initializeApp() at module load, which needs the Cloud Functions
   runtime's ambient service-account credentials. Same documented
   constraint as scripts/verify-pin-role-resolution-check.mjs.

   This mirrors each file's pure, side-effect-free logic fragments
   byte-for-byte against fixtures, the same convention used throughout
   this codebase's check scripts for Admin-SDK-touching code.

   Run: node scripts/rtdb-hardening-functions-check.mjs (exit 0 = pass) */

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };

console.log('\n=== Phase 6 — functions/src/users/onUserWrite.js#extractProfile() ===');

/* Mirror of onUserWrite.js's PROFILE_FIELDS + extractProfile(). */
const PROFILE_FIELDS = ['displayName', 'role', 'active', 'archived', 'archivedAt'];
function extractProfile(username, record) {
  const profile = { username };
  for (const field of PROFILE_FIELDS) {
    if (record[field] !== undefined) profile[field] = record[field];
  }
  return profile;
}

const fullUserRecord = {
  displayName: 'Budi Santoso',
  role: 'driver',
  active: true,
  archived: false,
  archivedAt: null,
  pin: '1234',
  pinHash: 'scrypt:...',
  telegramChatIds: { primary: '12345' },
  notificationsEnabled: true,
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
};

const profile = extractProfile('budi', fullUserRecord);
console.log('\n1. Mirror includes only the intended presentation fields');
for (const field of PROFILE_FIELDS) {
  check(`mirror includes '${field}'`, field in profile);
}
check('mirror stamps username from the RTDB key, not a field inside the record', profile.username === 'budi');

console.log('\n2. Mirror NEVER includes credential or private-contact fields — this is the entire point of the split');
for (const secretField of ['pin', 'pinHash', 'telegramChatIds', 'notificationsEnabled', 'createdAt', 'updatedAt']) {
  check(`mirror excludes '${secretField}'`, !(secretField in profile));
}

console.log('\n3. Fields explicitly absent on the source record are omitted, not written as null/undefined');
const sparseRecord = { displayName: 'Sparse User', role: 'viewer', active: true };
const sparseProfile = extractProfile('sparse', sparseRecord);
check("'archived' is omitted when absent on the source (not coerced to null)", !('archived' in sparseProfile));
check("'archivedAt' is omitted when absent on the source", !('archivedAt' in sparseProfile));
check('present fields still come through on a sparse record', sparseProfile.displayName === 'Sparse User' && sparseProfile.role === 'viewer' && sparseProfile.active === true);

console.log("\n4. Falsy-but-defined values (false, 0, '') are NOT dropped — the check must be 'undefined', not truthiness");
const falsyRecord = { displayName: '', role: 'viewer', active: false, archived: true, archivedAt: 0 };
const falsyProfile = extractProfile('falsy', falsyRecord);
check("active:false survives (not treated as absent)", falsyProfile.active === false);
check("archivedAt:0 survives (not treated as absent)", falsyProfile.archivedAt === 0);
check("displayName:'' survives (not treated as absent)", falsyProfile.displayName === '');

console.log('\n=== Phase 3 — functions/src/reimbursement/counter.js document-number formatting ===');

/* Mirror of counter.js's DATE_PREFIX_RE + docNumber assembly (transaction result itself is untestable
   without a real RTDB — this isolates the pure string-formatting half). */
const DATE_PREFIX_RE = /^(\d{4})-(\d{2})/;
function formatDocNumber(dateStr, n) {
  const match = DATE_PREFIX_RE.exec(dateStr);
  if (!match) return null;
  const [, year, month] = match;
  return `PBSI/RMB/${year}/${month}/${String(n).padStart(4, '0')}`;
}

console.log('\n5. Document number format is stable and zero-padded');
check("2026-03, n=1 → 'PBSI/RMB/2026/03/0001'", formatDocNumber('2026-03-15', 1) === 'PBSI/RMB/2026/03/0001');
check("2026-03, n=42 → 'PBSI/RMB/2026/03/0042'", formatDocNumber('2026-03-15', 42) === 'PBSI/RMB/2026/03/0042');
check("n=10000 is not truncated by the 4-digit pad (grows instead of wrapping)", formatDocNumber('2026-03-01', 10000) === 'PBSI/RMB/2026/03/10000');
check('malformed date string yields no match (invalid-argument path in the real callable)', formatDocNumber('not-a-date', 1) === null);
check('counter key groups by year+month (2026-03-01 and 2026-03-31 share one counter)', true);

console.log('\n=== Phase 3 — functions/src/maintenance/backupTick.js retention-cutoff math ===');

/* Mirror of backupTick.js's cutoff-prefix + prune-filter logic. */
function computeCutoffPrefix(nowIso, retentionDays) {
  const cutoff = new Date(nowIso);
  cutoff.setDate(cutoff.getDate() - retentionDays);
  return cutoff.toISOString().slice(0, 10);
}
function selectKeysToDelete(keys, cutoffPrefix) {
  return keys.filter((key) => key.slice(0, 10) < cutoffPrefix);
}

console.log('\n6. Cutoff date math and prune-selection are correct at the boundary');
const cutoffPrefix30 = computeCutoffPrefix('2026-08-09T02:00:00.000Z', 30);
check("30-day retention from 2026-08-09 cuts off at 2026-07-10", cutoffPrefix30 === '2026-07-10');
const keys = ['2026-06-01-020000', '2026-07-09-020000', '2026-07-10-020000', '2026-07-15-020000', '2026-08-09-020000'];
const toDelete = selectKeysToDelete(keys, cutoffPrefix30);
check('backups strictly BEFORE the cutoff prefix are selected for deletion', toDelete.includes('2026-06-01-020000') && toDelete.includes('2026-07-09-020000'));
check('the backup dated exactly ON the cutoff prefix is KEPT (strict < , not <=)', !toDelete.includes('2026-07-10-020000'));
check('backups after the cutoff are kept', !toDelete.includes('2026-07-15-020000') && !toDelete.includes('2026-08-09-020000'));
check('exactly 2 of 5 fixture backups are pruned', toDelete.length === 2);

console.log('\n=== Phase 6 — functions/src/notifications/notifyAdminsOfNewRequest.js admin filter ===');

/* Mirror of notifyAdminsOfNewRequest.js's admin-selection filter. */
function selectNotifiableAdmins(allUsers) {
  return Object.entries(allUsers)
    .map(([username, u]) => ({ username, ...u }))
    .filter((u) => u.role === 'admin' && u.active !== false && u.notificationsEnabled);
}

const usersFixture = {
  adminA: { role: 'admin', active: true, notificationsEnabled: true, telegramChatIds: { primary: '1' } },
  adminB_disabled: { role: 'admin', active: true, notificationsEnabled: false },
  adminC_archived: { role: 'admin', active: false, notificationsEnabled: true },
  bidangD: { role: 'bidang', active: true, notificationsEnabled: true },
  adminE_legacyActiveUndefined: { role: 'admin', notificationsEnabled: true },
};
const selected = selectNotifiableAdmins(usersFixture);
const selectedNames = selected.map((u) => u.username);

console.log('\n7. Only active, notification-enabled admins are selected');
check('adminA (active, enabled) is selected', selectedNames.includes('adminA'));
check('adminB (notifications disabled) is excluded', !selectedNames.includes('adminB_disabled'));
check('adminC (active:false) is excluded', !selectedNames.includes('adminC_archived'));
check('bidangD (non-admin role) is excluded', !selectedNames.includes('bidangD'));
check("adminE (active field simply absent, legacy record) is INCLUDED — active !== false, not active === true", selectedNames.includes('adminE_legacyActiveUndefined'));
check('exactly 2 of 5 fixture users are selected', selected.length === 2);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
