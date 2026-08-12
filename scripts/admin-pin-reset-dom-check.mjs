/* admin-pin-reset-dom-check.mjs — v1.30.9.3 Secure Admin PIN Reset UX.

   DOM test. Serves the static app, loads the REAL js/admin.js in headless
   Chromium against scripts/admin-pin-reset-harness.html (the real
   #modalUserForm + the two new Reset PIN dialogs, copied verbatim from
   index.html — same reasoning as user-management-role-picker-dom-check.mjs:
   admin.js's DOM lookups are all null-guarded, nothing else needs mounting).

   Deliberately NEVER clicks #btnConfirmResetPin (the button that calls
   js/firebase.js#callResetUserCredential): that would be a REAL network
   call to the production Cloud Function (see docs/CREDENTIAL_SECURITY_
   PATCH_v1.30.6.2.md and the "js/firebase.js always hits real production"
   trap this codebase has hit before). Everything up to that call is real
   DOM interaction (clicks, real event listeners); the post-success result
   dialog is exercised instead via admin.js's own
   __openResetPinResultForTest() test seam — the same bypass-Firebase
   pattern users.js#__seedUsersForTest() / custom-roles-store.js#
   __seedCustomRolesForTest() already established for exactly this reason.

   Proves the actual architectural decision this version makes: an existing
   PIN is NEVER read into the DOM (even a legacy-plaintext record — the
   seeded "legacy" user below carries a real plaintext `pin` field on
   purpose, mirroring the known production data-hygiene finding in
   docs/PRODUCTION_RTDB_DEPLOYMENT_REPORT_v1.30.9.2.md §7); only a freshly
   generated credential can ever be revealed, and only once.

   Run: node scripts/admin-pin-reset-dom-check.mjs (exit 0 = pass) */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };

// ── Source-level regression guard (no browser needed) ──────────────────────
// The list-card "Reset PIN" action (Manajemen User list, separate from Edit
// User) used to reset instantly with no confirmation and put the raw new
// PIN straight into a toast (`di-reset menjadi ${newPin}`). This version
// routes it through the exact same openResetPinConfirm()/masked-result-
// dialog flow as Edit User. Asserted at the source level because the list
// card's own render path isn't part of this minimal harness.
const adminSrc = fs.readFileSync(path.join(ROOT, 'js', 'admin.js'), 'utf8');
check('list-card Reset PIN no longer puts the raw new PIN into a toast', !adminSrc.includes('di-reset menjadi'));
check('list-card Reset PIN routes through openResetPinConfirm(returnToEdit: false)', /action === 'reset'\)[\s\S]{0,700}openResetPinConfirm\(username, \{ returnToEdit: false \}\)/.test(adminSrc));

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const consoleMessages = [];
const consoleErrors = [];
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
page.on('console', (m) => {
  consoleMessages.push(m.text());
  if (m.type() === 'error') consoleErrors.push('console.error: ' + m.text());
});
page.on('dialog', async (dialog) => { await dialog.accept(); });

await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
await page.evaluateOnNewDocument(() => {
  localStorage.setItem('pbsi_current_user', JSON.stringify({
    id: 'admin-test', username: 'admin-test', name: 'Admin Test', role: 'admin', active: true,
  }));
});

await page.goto(`http://localhost:${port}/scripts/admin-pin-reset-harness.html`, { waitUntil: 'networkidle0', timeout: 45000 });

const LEGACY_PIN = '9999';   // the seeded "legacy plaintext" user's stored PIN — must NEVER surface anywhere
const TYPED_PIN = '1357';    // typed into Create User's PIN field
const GENERATED_PIN = '4826'; // the "freshly generated" PIN fed through __openResetPinResultForTest

const result = await page.evaluate(async (LEGACY_PIN, TYPED_PIN, GENERATED_PIN) => {
  const usersStore = await import('/js/users.js');
  const admin = await import('/js/admin.js');

  // One migrated user (pinHash only — nothing to leak, nothing plaintext at
  // all) and one LEGACY user still carrying a plaintext `pin` field, mirroring
  // the real production data-hygiene finding this version was scoped around.
  usersStore.__seedUsersForTest([
    { username: 'migrated-user', displayName: 'Migrated User', role: 'viewer', active: true, pinHash: 'scrypt:16384:8:1:aa:bb' },
    { username: 'legacy-user', displayName: 'Legacy User', role: 'viewer', active: true, pin: LEGACY_PIN },
  ]);

  await admin.initAdminUI();

  const out = {};

  // ── Create User: masked by default, eye reveals what was typed ─────────
  admin.openUserFormModal();
  const pinInput = document.getElementById('userFieldPin');
  const pinToggle = document.getElementById('btnToggleUserFieldPin');
  out.createDefaultMasked = pinInput.type === 'password';
  out.createGroupVisible = document.getElementById('userFieldPinGroup').style.display !== 'none';
  out.credentialGroupHiddenOnCreate = document.getElementById('userCredentialGroup').style.display === 'none';
  out.toggleAriaPressedInitial = pinToggle.getAttribute('aria-pressed');

  pinInput.value = TYPED_PIN;
  let formSubmitted = false;
  const form = document.getElementById('userForm');
  const submitGuard = (e) => { formSubmitted = true; e.preventDefault(); };
  form.addEventListener('submit', submitGuard);

  pinToggle.click();
  out.revealShowsTypedValue = pinInput.type === 'text' && pinInput.value === TYPED_PIN;
  out.toggleAriaPressedRevealed = pinToggle.getAttribute('aria-pressed');
  out.toggleAriaLabelRevealed = pinToggle.getAttribute('aria-label');
  out.eyeClickDidNotSubmitForm = formSubmitted === false;

  pinToggle.click();
  out.hideAfterSecondClick = pinInput.type === 'password';
  form.removeEventListener('submit', submitGuard);

  // Closing (Batal) must re-mask, even though nothing was ever revealed
  // again here — this proves the reset-on-close path itself, not just the
  // toggle.
  pinToggle.click(); // reveal once more
  document.getElementById('btnCancelUserForm').click();
  out.closeResetsMask = pinInput.type === 'password';

  // ── Edit User: NEVER shows/prefills an existing PIN, migrated or legacy ─
  admin.openUserFormModal('legacy-user');
  out.editHidesPinInputGroup = document.getElementById('userFieldPinGroup').style.display === 'none';
  out.editShowsCredentialGroup = document.getElementById('userCredentialGroup').style.display !== 'none';
  out.editPinInputStaysEmpty = document.getElementById('userFieldPin').value === '';
  out.editModalNeverContainsLegacyPin = !document.getElementById('modalUserForm').innerHTML.includes(LEGACY_PIN);
  out.editShowsStoredLabel = document.getElementById('userCredentialGroup').textContent.includes('PIN tersimpan');

  // ── Reset PIN confirmation (Edit User entry point) — pure DOM, zero network ─
  document.getElementById('btnResetPinFromEdit').click();
  out.editModalClosedOnResetTrigger = document.getElementById('modalUserForm').style.display === 'none';
  out.confirmDialogOpened = document.getElementById('modalResetPinConfirm').style.display !== 'none';
  out.confirmDialogTitle = document.querySelector('#modalResetPinConfirm .modal-title').textContent;
  out.confirmDialogBody = document.querySelector('#modalResetPinConfirm .cancel-warning').textContent;
  out.confirmHasBatalButton = document.getElementById('btnCancelResetPin').textContent.trim();
  out.confirmHasResetButton = document.getElementById('btnConfirmResetPin').textContent.trim();
  out.confirmButtonsAreType = document.getElementById('btnCancelResetPin').type === 'button'
    && document.getElementById('btnConfirmResetPin').type === 'button';

  document.getElementById('btnCancelResetPin').click(); // "Batal" — no network call
  out.batalClosesConfirm = document.getElementById('modalResetPinConfirm').style.display === 'none';
  out.batalReopensEditUser = document.getElementById('modalUserForm').style.display !== 'none'
    && document.getElementById('modalUserFormTitle').textContent === 'Edit User'
    && document.getElementById('userFieldUsername').value === 'legacy-user';
  admin.openUserFormModal(); // back to a clean Create-mode slate for the rest of the checks

  // ── Reset PIN result dialog — via the test seam, never a real network call ─
  admin.__openResetPinResultForTest(GENERATED_PIN, 'legacy-user', true);
  const resultInput = document.getElementById('resetPinResultValue');
  const resultToggle = document.getElementById('btnToggleResetPinReveal');
  out.resultDialogOpened = document.getElementById('modalResetPinResult').style.display !== 'none';
  out.resultMaskedByDefault = resultInput.type === 'password';
  out.resultValueIsExactPin = resultInput.value === GENERATED_PIN;
  out.resultInputNotInForm = resultInput.closest('form') === null; // structural: cannot ever submit anything

  resultToggle.click();
  out.resultRevealShowsExactPin = resultInput.type === 'text' && resultInput.value === GENERATED_PIN;
  resultToggle.click();
  out.resultHiddenAgain = resultInput.type === 'password';

  // Explicit copy — only after the admin clicks, and copies the exact PIN.
  let copiedValue = null;
  const originalClipboard = navigator.clipboard;
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: (v) => { copiedValue = v; return Promise.resolve(); } },
  });
  document.getElementById('btnCopyResetPin').click();
  await new Promise((r) => setTimeout(r, 20));
  out.copyOnlyAfterExplicitClick = copiedValue === GENERATED_PIN;
  if (originalClipboard) {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: originalClipboard });
  }

  document.getElementById('btnDoneResetPin').click(); // "Selesai" — destroys plaintext state
  out.doneClosesResultDialog = document.getElementById('modalResetPinResult').style.display === 'none';
  out.doneClearsInputValue = resultInput.value === '';
  out.doneReMasksInput = resultInput.type === 'password';
  out.doneReopensEditUser = document.getElementById('modalUserForm').style.display !== 'none'
    && document.getElementById('userFieldUsername').value === 'legacy-user';

  // ── Switching users resets masking (Edit → Edit) ────────────────────────
  admin.openUserFormModal('migrated-user');
  out.switchingUserStillMasksCreateField = document.getElementById('userFieldPin').type === 'password';
  out.switchingUserShowsCredentialGroup = document.getElementById('userCredentialGroup').style.display !== 'none';

  return out;
}, LEGACY_PIN, TYPED_PIN, GENERATED_PIN);

// ── A. Create User ──────────────────────────────────────────────────────
check('Create User: PIN field exists and is masked by default', result.createDefaultMasked);
check('Create User: PIN group is visible, credential group is hidden', result.createGroupVisible && result.credentialGroupHiddenOnCreate);
check('Create User: eye starts aria-pressed=false', result.toggleAriaPressedInitial === 'false');
check('Create User: eye reveals exactly what was typed', result.revealShowsTypedValue);
check('Create User: eye sets aria-pressed=true and an updated aria-label when revealed', result.toggleAriaPressedRevealed === 'true' && typeof result.toggleAriaLabelRevealed === 'string' && result.toggleAriaLabelRevealed.length > 0);
check('Create User: eye click never submits the form', result.eyeClickDidNotSubmitForm);
check('Create User: second click re-masks', result.hideAfterSecondClick);
check('Create User: closing (Batal) resets the field back to masked', result.closeResetsMask);

// ── B. Edit User ────────────────────────────────────────────────────────
check('Edit User: PIN input group is hidden', result.editHidesPinInputGroup);
check('Edit User: credential group ("PIN tersimpan" + Reset PIN) is shown instead', result.editShowsCredentialGroup);
check('Edit User: the PIN input itself stays empty (never prefilled)', result.editPinInputStaysEmpty);
check('Edit User: the LEGACY plaintext PIN never appears anywhere in the modal DOM', result.editModalNeverContainsLegacyPin);
check('Edit User: credential row reads "PIN tersimpan"', result.editShowsStoredLabel);

// ── C. Reset PIN confirmation + result dialog ──────────────────────────
check('Reset PIN: clicking it closes Edit User first (no stacked modals)', result.editModalClosedOnResetTrigger);
check('Reset PIN: confirmation dialog opens', result.confirmDialogOpened);
check('Reset PIN: confirmation title is "Reset PIN?"', result.confirmDialogTitle === 'Reset PIN?');
check('Reset PIN: confirmation body matches the required copy', result.confirmDialogBody === 'PIN lama tidak dapat dipulihkan. Sistem akan membuat PIN baru untuk pengguna ini.');
check('Reset PIN: has a "Batal" button', result.confirmHasBatalButton === 'Batal');
check('Reset PIN: has a "Reset PIN" button', result.confirmHasResetButton === 'Reset PIN');
check('Reset PIN: both confirmation buttons are type="button" (cannot submit any form)', result.confirmButtonsAreType);
check('Reset PIN: "Batal" performs no operation and closes the dialog', result.batalClosesConfirm);
check('Reset PIN: "Batal" reopens Edit User for the same user', result.batalReopensEditUser);

check('Result dialog: opens after a (simulated) successful reset', result.resultDialogOpened);
check('Result dialog: the new PIN is masked by default', result.resultMaskedByDefault);
check('Result dialog: the underlying value is the exact generated PIN', result.resultValueIsExactPin);
check('Result dialog: the PIN field is NOT inside any <form> (cannot ever be submitted)', result.resultInputNotInForm);
check('Result dialog: eye reveals the exact PIN', result.resultRevealShowsExactPin);
check('Result dialog: eye hides it again', result.resultHiddenAgain);
check('Result dialog: "Salin PIN" copies the exact PIN, only after an explicit click', result.copyOnlyAfterExplicitClick);
check('Result dialog: "Selesai" closes the dialog', result.doneClosesResultDialog);
check('Result dialog: closing clears the underlying value (destroys plaintext state)', result.doneClearsInputValue);
check('Result dialog: closing re-masks the (now-empty) field', result.doneReMasksInput);
check('Result dialog: closing reopens Edit User for the same user', result.doneReopensEditUser);

// ── D/E. Switching users + structural regression ───────────────────────
check('Switching to another user keeps the Create-mode field masked', result.switchingUserStillMasksCreateField);
check('Switching to another Edit target still shows the credential row (not an input)', result.switchingUserShowsCredentialGroup);

// ── Security: the PIN values used in this run never leaked into console output ─
const leaked = consoleMessages.filter((m) => m.includes(LEGACY_PIN) || m.includes(GENERATED_PIN));
check('none of the test PIN values ever appeared in console output', leaked.length === 0);
if (leaked.length) leaked.forEach((m) => console.log('   ✗ leaked:', m));

const fatal = consoleErrors.filter((e) =>
  /SyntaxError|ReferenceError|TypeError|is not a function|Failed to (load|fetch) module|Cannot use import|Unexpected token|does not provide an export/i.test(e)
);
check('zero fatal console errors (Firebase permission-denied noise is expected/informational)', fatal.length === 0);
if (fatal.length) fatal.forEach((e) => console.log('   ✗ fatal:', e));

console.log(`\n${pass} passed, ${fail} failed\n`);

await browser.close();
server.close();
process.exit(fail === 0 ? 0 : 1);
