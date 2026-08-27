/* users-lifecycle-check.mjs — Design System Program Phase 11 (Administration)

   Test-coverage debt item from the Phase 11 Administration audit: js/
   users.js's archiveUser()/restoreUser()/deleteUser() and the last-active-
   admin lockout guard (duplicated across updateUser()/deactivateUser()/
   archiveUser()) had zero test coverage of any kind.

   Method: js/users.js imports js/firebase.js (real CDN ESM imports —
   browser-only, see engineering-foundation-check.mjs's header for why this
   can't be plain Node), so this is a real-boot Puppeteer DOM test.
   __seedUsersForTest() (already shipped, same convention as custom-roles-
   store.js#__seedCustomRolesForTest()) sets loadState = LOADED, so
   getUserByUsername() resolves every assertion below from the seeded
   in-memory cache WITHOUT a real network call — meaning every guard
   (unknown user / last-admin lockout / archived-immutability / must-be-
   archived-before-delete) is exercised as REAL, deterministic logic, not a
   race against a denied Firebase read. Only the guards' own THROWN errors
   are asserted; a seeded scenario that should pass its guard and reach the
   real (denied, no auth here — see [[firebase-prod-in-local-testing]])
   updateFirebaseData()/storeFirebaseData() call is asserted by confirming
   the error it throws is NOT the guard's own message, never by expecting
   the write to actually succeed.

   Run: node scripts/users-lifecycle-check.mjs (exit 0 = pass) */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); if (detail !== undefined) console.log('     • ' + String(detail).slice(0, 300)); }
};

console.log('[Phase 11] js/users.js — lifecycle + last-admin-guard test-coverage debt (was zero)\n');

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  const content = fs.readFileSync(file);
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Content-Length': content.length });
  res.end(content);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const errors = [];
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
await page.evaluateOnNewDocument(() => {
  localStorage.setItem('pbsi_current_user', JSON.stringify({
    id: 'admin-test', username: 'admin-test', name: 'Admin Test', role: 'admin', active: true,
  }));
});
await page.goto(`http://localhost:${port}/index.html`, { waitUntil: 'networkidle0', timeout: 45000 });

const result = await page.evaluate(async () => {
  const users = await import('/js/users.js');
  const out = {};

  const seed = (list) => users.__seedUsersForTest(list);
  const errMsg = async (p) => { try { await p; return null; } catch (e) { return e.message; } };

  /* ── getActiveAdminCount(): pure counting logic ── */
  seed([
    { username: 'admin-1', displayName: 'Admin 1', role: 'admin', active: true },
    { username: 'admin-2', displayName: 'Admin 2', role: 'admin', active: true },
    { username: 'admin-3-inactive', displayName: 'Admin 3', role: 'admin', active: false },
    { username: 'admin-4-archived', displayName: 'Admin 4', role: 'admin', active: true, archived: true },
    { username: 'viewer-1', displayName: 'Viewer', role: 'viewer', active: true },
  ]);
  out.activeAdminCountExcludesInactiveAndArchived = users.getActiveAdminCount() === 2;

  /* ── archiveUser(): unknown user ── */
  out.archiveUnknownUserThrows = await errMsg(users.archiveUser('nobody-here'));

  /* ── archiveUser(): last active admin lockout ── */
  seed([{ username: 'sole-admin', displayName: 'Sole Admin', role: 'admin', active: true }]);
  out.archiveSoleAdminThrows = await errMsg(users.archiveUser('sole-admin'));

  /* ── archiveUser(): NOT blocked with 2 active admins (reaches the real,
     denied write — proves the guard let it through, not that the write
     itself succeeded) ── */
  seed([
    { username: 'admin-a', displayName: 'Admin A', role: 'admin', active: true },
    { username: 'admin-b', displayName: 'Admin B', role: 'admin', active: true },
  ]);
  out.archiveOneOfTwoAdminsErrorIsNotTheLockoutMessage = await errMsg(users.archiveUser('admin-a'));

  /* ── archiveUser(): a non-admin is never subject to the lockout, even
     as the only user in the whole seeded list ── */
  seed([{ username: 'lone-viewer', displayName: 'Lone Viewer', role: 'viewer', active: true }]);
  out.archiveLoneNonAdminErrorIsNotTheLockoutMessage = await errMsg(users.archiveUser('lone-viewer'));

  /* ── restoreUser(): unknown user ── */
  out.restoreUnknownUserThrows = await errMsg(users.restoreUser('nobody-here'));

  /* ── restoreUser(): no lockout guard at all — an archived sole admin can
     always be restored (verifies the error is the Firebase denial, not a
     guard rejecting the call before it even reaches the write) ── */
  seed([{ username: 'sole-admin', displayName: 'Sole Admin', role: 'admin', active: false, archived: true }]);
  out.restoreArchivedSoleAdminErrorIsNotAGuardMessage = await errMsg(users.restoreUser('sole-admin'));

  /* ── deleteUser(): unknown user ── */
  out.deleteUnknownUserThrows = await errMsg(users.deleteUser('nobody-here'));

  /* ── deleteUser(): must be archived first ── */
  seed([{ username: 'not-archived-user', displayName: 'X', role: 'viewer', active: true }]);
  out.deleteNonArchivedUserThrows = await errMsg(users.deleteUser('not-archived-user'));

  /* ── deleteUser(): an archived user passes the guard (reaches the real,
     denied delete — the error must NOT be the "must be archived" message) ── */
  seed([{ username: 'archived-user', displayName: 'X', role: 'viewer', active: false, archived: true }]);
  out.deleteArchivedUserErrorIsNotTheArchivedGuardMessage = await errMsg(users.deleteUser('archived-user'));

  /* ── deactivateUser(): last active admin lockout ── */
  seed([{ username: 'sole-admin', displayName: 'Sole Admin', role: 'admin', active: true }]);
  out.deactivateSoleAdminThrows = await errMsg(users.deactivateUser('sole-admin'));

  /* ── deactivateUser(): unknown user ── */
  out.deactivateUnknownUserThrows = await errMsg(users.deactivateUser('nobody-here'));

  /* ── updateUser(): last active admin — both the role-change-away and the
     active:false paths are independently guarded ── */
  seed([{ username: 'sole-admin', displayName: 'Sole Admin', role: 'admin', active: true }]);
  out.updateUserDemoteSoleAdminThrows = await errMsg(users.updateUser({ username: 'sole-admin', role: 'viewer' }));
  seed([{ username: 'sole-admin', displayName: 'Sole Admin', role: 'admin', active: true }]);
  out.updateUserDeactivateSoleAdminThrows = await errMsg(users.updateUser({ username: 'sole-admin', active: false }));

  /* ── updateUser(): archived users are immutable at the data layer,
     independent of any UI read-only presentation ── */
  seed([{ username: 'archived-user', displayName: 'X', role: 'viewer', active: false, archived: true }]);
  out.updateArchivedUserThrows = await errMsg(users.updateUser({ username: 'archived-user', displayName: 'Renamed' }));

  return out;
});

check('getActiveAdminCount() excludes inactive and archived admins', result.activeAdminCountExcludesInactiveAndArchived);

check('archiveUser(unknown username) throws "User tidak ditemukan."',
  result.archiveUnknownUserThrows === 'User tidak ditemukan.', result.archiveUnknownUserThrows);
check('archiveUser(the sole active admin) throws the last-admin lockout message',
  result.archiveSoleAdminThrows === 'Tidak dapat mengarsipkan admin terakhir.', result.archiveSoleAdminThrows);
check('archiveUser(one of two active admins) is NOT blocked by the lockout (reaches the real write)',
  !!result.archiveOneOfTwoAdminsErrorIsNotTheLockoutMessage
    && result.archiveOneOfTwoAdminsErrorIsNotTheLockoutMessage !== 'Tidak dapat mengarsipkan admin terakhir.',
  result.archiveOneOfTwoAdminsErrorIsNotTheLockoutMessage);
check('archiveUser(a lone non-admin user) is NOT subject to the admin lockout',
  !!result.archiveLoneNonAdminErrorIsNotTheLockoutMessage
    && result.archiveLoneNonAdminErrorIsNotTheLockoutMessage !== 'Tidak dapat mengarsipkan admin terakhir.',
  result.archiveLoneNonAdminErrorIsNotTheLockoutMessage);

check('restoreUser(unknown username) throws "User tidak ditemukan."',
  result.restoreUnknownUserThrows === 'User tidak ditemukan.', result.restoreUnknownUserThrows);
check('restoreUser(an archived sole admin) has NO lockout guard (error is the real write denial, not a guard)',
  !!result.restoreArchivedSoleAdminErrorIsNotAGuardMessage
    && !/admin terakhir/.test(result.restoreArchivedSoleAdminErrorIsNotAGuardMessage),
  result.restoreArchivedSoleAdminErrorIsNotAGuardMessage);

check('deleteUser(unknown username) throws "User tidak ditemukan."',
  result.deleteUnknownUserThrows === 'User tidak ditemukan.', result.deleteUnknownUserThrows);
check('deleteUser(a NOT-yet-archived user) throws the must-archive-first message',
  result.deleteNonArchivedUserThrows === 'User harus diarsipkan sebelum dapat dihapus permanen.', result.deleteNonArchivedUserThrows);
check('deleteUser(an already-archived user) passes the guard (error is the real write denial, not the archive guard)',
  !!result.deleteArchivedUserErrorIsNotTheArchivedGuardMessage
    && result.deleteArchivedUserErrorIsNotTheArchivedGuardMessage !== 'User harus diarsipkan sebelum dapat dihapus permanen.',
  result.deleteArchivedUserErrorIsNotTheArchivedGuardMessage);

check('deactivateUser(the sole active admin) throws the last-admin lockout message',
  result.deactivateSoleAdminThrows === 'Tidak dapat menonaktifkan admin terakhir.', result.deactivateSoleAdminThrows);
check('deactivateUser(unknown username) throws "User tidak ditemukan" (no trailing period here — a pre-existing, harmless inconsistency vs. its siblings, not a Phase 11 finding)',
  result.deactivateUnknownUserThrows === 'User tidak ditemukan', result.deactivateUnknownUserThrows);

check('updateUser() demoting the sole active admin\'s role throws the last-admin message',
  result.updateUserDemoteSoleAdminThrows === 'Tidak dapat mengubah role admin terakhir.', result.updateUserDemoteSoleAdminThrows);
check('updateUser() deactivating the sole active admin throws the last-admin message',
  result.updateUserDeactivateSoleAdminThrows === 'Tidak dapat menonaktifkan admin terakhir.', result.updateUserDeactivateSoleAdminThrows);
check('updateUser() on an archived user throws the immutability message (data-layer guarantee, not just a UI mode)',
  result.updateArchivedUserThrows === 'User yang diarsipkan tidak dapat diubah. Pulihkan terlebih dahulu.', result.updateArchivedUserThrows);

const fatal = errors.filter((e) =>
  /SyntaxError|ReferenceError|TypeError|is not a function|Failed to (load|fetch) module|Cannot use import|Unexpected token|does not provide an export/i.test(e)
);
check('zero fatal console errors (Firebase permission-denied noise is expected/informational)', fatal.length === 0, fatal.join(' | '));

await browser.close();
server.close();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
