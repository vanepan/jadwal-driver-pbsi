/* agenda-c53-kabid-provisioning.mjs — V1.31 C5.3 Kabid Provisioning

   Drives the REAL production app (real Firebase, unpatched) through the
   REAL, canonical Role Management + User Management UI flows to:
     1. Clone a new Custom Role from "Viewer" (the smallest existing base
        grant set: just driver.schedule.view), rename it to "Kabid Sarana
        dan Prasarana", and edit its permissions down to exactly
        agenda.kabid.view + agenda.kabid.manage.
     2. Assign that Custom Role to /users/sarpras via the real Edit User
        form (writes /users/sarpras.role, nothing else).

   Deliberately does NOT hand-write a /customRoles record or a raw
   /users/sarpras.role value via the CLI — every write in this script goes
   through the same application code path a real admin clicking through
   the UI would use (createCustomRoleFromClone / updateCustomRole /
   updateUser), so there is no risk of inventing an undocumented schema.

   SAFETY: no Agenda event/task is created or touched. Does not modify
   Evan/Grace/Leo/admin's records. Aborts loudly (no write attempted) if
   the pre-flight read of /users/sarpras doesn't match reviewed evidence,
   or if an equivalent Kabid Custom Role already exists.

   Run: node scripts/agenda-c53-kabid-provisioning.mjs */

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8937;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const ROLE_NAME = 'Kabid Sarana dan Prasarana';
const REQUIRED_PERMS = ['agenda.kabid.view', 'agenda.kabid.manage'];
const CLONE_SOURCE_PERM = 'driver.schedule.view'; // Viewer's only base grant — must be unchecked

function dbGet(nodePath) {
  const tmp = path.join(os.tmpdir(), `c53-${nodePath.replace(/\//g, '_')}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  const res = spawnSync('firebase', ['database:get', `/${nodePath}`, '-o', tmp], { cwd: ROOT, shell: true, encoding: 'utf8' });
  if (res.status !== 0) throw new Error(`firebase database:get /${nodePath} failed: ${res.stderr || res.stdout}`);
  const raw = fs.readFileSync(tmp, 'utf8').trim();
  fs.unlinkSync(tmp);
  return raw === 'null' || raw === '' ? null : JSON.parse(raw);
}

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(req.url.split('?')[0]);
      const filePath = path.join(ROOT, urlPath === '/' ? '/index.html' : urlPath);
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('not found: ' + urlPath); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.listen(PORT, () => resolve(server));
  });
}

async function main() {
  console.log('=== PREFLIGHT (read-only) ===');
  const firebaserc = JSON.parse(fs.readFileSync(path.join(ROOT, '.firebaserc'), 'utf8'));
  if (firebaserc?.projects?.default !== 'schedule-driver-pbsi') {
    throw new Error(`[ABORT] wrong project: ${firebaserc?.projects?.default}`);
  }
  console.log('  project OK: schedule-driver-pbsi');

  const sarprasBefore = dbGet('users/sarpras');
  if (!sarprasBefore) throw new Error('[ABORT] /users/sarpras does not exist');
  if (sarprasBefore.active !== true) throw new Error(`[ABORT] /users/sarpras.active is not true: ${JSON.stringify(sarprasBefore)}`);
  if (sarprasBefore.role !== 'admin') throw new Error(`[ABORT] /users/sarpras.role is not 'admin' (already changed?): ${sarprasBefore.role}`);
  if (sarprasBefore.displayName !== 'Kepala Bidang Sarana dan Prasarana') throw new Error(`[ABORT] displayName mismatch: ${sarprasBefore.displayName}`);
  if (sarprasBefore.agendaParticipantType !== 'kabid') throw new Error(`[ABORT] agendaParticipantType is not 'kabid': ${sarprasBefore.agendaParticipantType}`);
  console.log('  /users/sarpras matches reviewed evidence: active, role=admin, displayName correct, agendaParticipantType=kabid');

  const customRolesBefore = dbGet('customRoles') || {};
  const existingKabidRole = Object.entries(customRolesBefore).find(([, r]) => r && r.archived !== true && Array.isArray(r.permissions) &&
    REQUIRED_PERMS.every((p) => r.permissions.includes(p)) && r.permissions.length === REQUIRED_PERMS.length && r.name === ROLE_NAME);
  if (existingKabidRole) {
    throw new Error(`[ABORT] an equivalent Kabid Custom Role already exists: ${existingKabidRole[0]} — will not create a duplicate. Re-run with the assignment-only path if this is expected.`);
  }
  // A prior run's clone step can leave an inert, never-assigned "Viewer
  // (Copy)" role behind if the rename-during-clone step didn't stick
  // (discovered this phase — see the Role Management section below). If
  // exactly that leftover shape exists, reuse it via the rename+edit flow
  // instead of creating a second orphaned clone (idempotency, §22).
  const reusableLeftover = Object.entries(customRolesBefore).find(([, r]) => r && r.archived !== true && r.clonedFromId === 'viewer' &&
    Array.isArray(r.permissions) && r.permissions.length === 1 && r.permissions[0] === CLONE_SOURCE_PERM && r.name !== ROLE_NAME);
  console.log(`  /customRoles: no existing equivalent Kabid role found. Reusable leftover clone: ${reusableLeftover ? reusableLeftover[0] : 'none'}`);

  const server = await startServer();
  let browser, page;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    page.on('pageerror', (err) => console.error('[pageerror]', String(err)));
    page.on('console', (msg) => { if (msg.type() === 'error' || msg.type() === 'warning') console.log('[console]', msg.type(), msg.text()); });

    console.log('\n=== [Login] real production, as admin ===');
    await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.waitForSelector('#loginForm', { timeout: 15000 });
    await new Promise((r) => setTimeout(r, 500));
    await page.type('#loginUsername', 'admin');
    await page.type('#loginPin', '1234');
    await page.waitForSelector('.login-submit', { visible: true, timeout: 10000 });
    await new Promise((r) => setTimeout(r, 300));
    await page.click('.login-submit');
    await page.waitForFunction(() => { try { return JSON.parse(localStorage.getItem('pbsi_current_user') || 'null')?.username === 'admin'; } catch { return false; } }, { timeout: 30000 });
    console.log('  logged in as admin');
    await new Promise((r) => setTimeout(r, 1000));
    // The "Aktifkan Notifikasi" push soft-ask (js/push.js) appends a fixed
    // banner straight to document.body, positioned bottom-right — it can
    // overlap real UI controls in that screen region (discovered this
    // phase: it silently ate the Role Management "Simpan" click). Dismiss
    // it once, up front, same as a real admin clicking its own close (x).
    const dismissedPushAsk = await page.evaluate(() => {
      const btn = document.getElementById('btnPushDismiss');
      if (btn) { btn.click(); return true; }
      return false;
    });
    console.log(`  dismissed push notification soft-ask banner: ${dismissedPushAsk}`);
    await new Promise((r) => setTimeout(r, 300));

    await fs.promises.mkdir(path.join(ROOT, 'scratch'), { recursive: true });

    // Real production discovery (this phase): the app now boots into a
    // "Domain Shell" nav (js/shell/domain-shell.js) — Role Management and
    // User Management both live under the "Control" domain's tab bar
    // (data-domain="control" -> [data-top="roles"|"users"]), NOT the older
    // #btnRoleManagement/#btnUserMgmt sidebar buttons (those are a mobile-
    // only legacy entry point, confirmed hidden at desktop width). The tab
    // bar depends on an async permission/module load that can race the
    // click on a real (non-emulator) login, so this retries.
    console.log('\n=== [Navigate] Control domain, wait for tab bar (handles the real async-permission race) ===');
    await page.waitForFunction(() => !!document.querySelector('[data-domain="control"]'), { timeout: 20000 });
    let tabsReady = false;
    for (let attempt = 1; attempt <= 6 && !tabsReady; attempt++) {
      await page.click('[data-domain="control"]');
      try {
        await page.waitForFunction(() => document.querySelectorAll('[data-top]').length > 1, { timeout: 4000 });
        tabsReady = true;
      } catch {
        console.log(`  attempt ${attempt}: Control tab bar not ready, retrying...`);
        await page.click('[data-domain="today"]');
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
    if (!tabsReady) throw new Error('[ABORT] Control domain tab bar never became ready after 6 attempts');
    // Landing on Control defaults to the Users tab, which on its FIRST
    // visit kicks off initCustomRolesStore()'s async load + a
    // registerCustomRolesChangeListener() callback that re-renders the
    // (separate, older) admin-panel state once that data arrives. That
    // re-render races a right-away click over to the Roles tab and can
    // silently snap the view back to Users. Letting it settle first avoids
    // fighting that race instead of trying to out-click it.
    console.log('  letting the Users-tab first-visit custom-roles load settle...');
    await new Promise((r) => setTimeout(r, 6000));

    console.log('\n=== [Role Management] Roles tab ===');
    let roleListReady = false;
    for (let attempt = 1; attempt <= 4 && !roleListReady; attempt++) {
      await page.click('[data-top="roles"]');
      try {
        await page.waitForSelector('.rm-role-list', { timeout: 8000 });
        roleListReady = true;
      } catch {
        console.log(`  attempt ${attempt}: .rm-role-list not ready (view may have snapped back to Users), retrying...`);
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
    if (!roleListReady) throw new Error('[ABORT] .rm-role-list never appeared after 4 attempts on the Roles tab');

    // Helper: click a role list item and verify the selection actually
    // stuck (the list can re-render shortly after mount as matrix/
    // permission-count data finishes loading, silently snapping
    // selectedRoleId back to its 'admin' default right after a click).
    async function selectRoleAndVerify(roleId, expectedLabel) {
      let ok = false;
      for (let attempt = 1; attempt <= 5 && !ok; attempt++) {
        await page.click(`[data-rm-role="${roleId}"]`);
        await new Promise((r) => setTimeout(r, 600));
        ok = await page.evaluate((label) => {
          const active = document.querySelector('.rm-role-item--active .rm-role-item__label');
          return active && active.textContent.trim().toLowerCase() === label.toLowerCase();
        }, expectedLabel);
        if (!ok) console.log(`  attempt ${attempt}: "${expectedLabel}" selection did not stick, retrying...`);
      }
      return ok;
    }

    let workingRoleId;
    if (reusableLeftover) {
      console.log(`  reusing leftover clone "${reusableLeftover[1].name}" (${reusableLeftover[0]}) instead of creating a new one`);
      workingRoleId = reusableLeftover[0];
      if (!(await selectRoleAndVerify(workingRoleId, reusableLeftover[1].name))) {
        throw new Error(`[ABORT] could not get the leftover role "${reusableLeftover[1].name}" to stay selected`);
      }
    } else {
      if (!(await selectRoleAndVerify('viewer', 'Viewer'))) {
        throw new Error('[ABORT] could not get Viewer to stay selected after 5 attempts');
      }
      console.log('  Viewer role confirmed selected');
      await page.waitForSelector('[data-rm-action="clone-open"]', { timeout: 10000 });
      await page.click('[data-rm-action="clone-open"]');
      await page.waitForSelector('#rmCloneName', { timeout: 10000 });
      // Deliberately does NOT try to rename during the clone step — the
      // clone modal's #rmCloneName input, discovered this phase, does not
      // reliably propagate page.type() keystrokes into the app's own
      // clonePrompt.name state before clone-confirm reads it (a real,
      // reproducible glitch: the input visibly shows the typed text but
      // the created record still gets the untouched default name). Fully
      // sidestepped by accepting whatever default name the clone gets,
      // then renaming via the separately-proven #rmNameInput edit path
      // (below) in the SAME pass as the permission changes.
      await page.click('[data-rm-action="clone-confirm"]');
      await page.waitForFunction(() => {
        const active = document.querySelector('.rm-role-item--active');
        return active && active.querySelector('.rm-role-type-badge');
      }, { timeout: 10000 });
      workingRoleId = await page.evaluate(() => document.querySelector('.rm-role-item--active')?.dataset.rmRole);
      console.log(`  clone created and selected: ${workingRoleId}`);
    }

    console.log('\n=== [Role Management] rename to the approved name via the edit path ===');
    await page.waitForSelector('#rmNameInput', { timeout: 10000 });
    let renamed = false;
    for (let attempt = 1; attempt <= 5 && !renamed; attempt++) {
      await page.evaluate(() => { const el = document.getElementById('rmNameInput'); el.focus(); el.select(); });
      await page.keyboard.type(ROLE_NAME);
      await new Promise((r) => setTimeout(r, 300));
      renamed = await page.evaluate((name) => document.getElementById('rmNameInput')?.value === name, ROLE_NAME);
      if (!renamed) console.log(`  attempt ${attempt}: rename did not stick (got "${await page.evaluate(() => document.getElementById('rmNameInput')?.value)}"), retrying...`);
    }
    if (!renamed) throw new Error(`[ABORT] could not get #rmNameInput to hold "${ROLE_NAME}" after 5 attempts`);
    console.log(`  #rmNameInput confirmed holding "${ROLE_NAME}"`);

    console.log('\n=== [Role Management] adjust permissions: unset driver.schedule.view, set agenda.kabid.view + agenda.kabid.manage ===');
    const sourceChecked = await page.evaluate((permId) => {
      const el = document.querySelector(`input[data-rm-permission-id="${permId}"]`);
      return el ? el.checked : null;
    }, CLONE_SOURCE_PERM);
    console.log(`  ${CLONE_SOURCE_PERM} currently checked: ${sourceChecked}`);
    if (sourceChecked) await page.click(`input[data-rm-permission-id="${CLONE_SOURCE_PERM}"]`);
    for (const permId of REQUIRED_PERMS) {
      const el = await page.$(`input[data-rm-permission-id="${permId}"]`);
      if (!el) throw new Error(`[ABORT] permission checkbox not found in DOM: ${permId}`);
      const checked = await page.evaluate((e) => e.checked, el);
      if (!checked) await el.click();
    }
    const staged = await page.evaluate((perms) => perms.map((p) => ({ id: p, checked: document.querySelector(`input[data-rm-permission-id="${p}"]`)?.checked })), [CLONE_SOURCE_PERM, ...REQUIRED_PERMS]);
    console.log('  staged checkbox state:', JSON.stringify(staged));
    if (staged[0].checked !== false || staged[1].checked !== true || staged[2].checked !== true) {
      throw new Error(`[ABORT] permission staging did not reach the expected state: ${JSON.stringify(staged)}`);
    }
    await page.screenshot({ path: path.join(ROOT, 'scratch', 'agenda-c53-role-permissions-staged.png') });

    console.log('\n=== [Role Management] Save -> Review -> Confirm ===');
    const saveDiag = await page.evaluate(() => {
      const el = document.querySelector('[data-rm-action="save"]');
      if (!el) return 'NOT FOUND';
      const r = el.getBoundingClientRect();
      return { display: getComputedStyle(el).display, disabled: el.disabled, rect: { x: r.x, y: r.y, w: r.width, h: r.height }, errorText: document.querySelector('.rm-error')?.textContent || null };
    });
    console.log('  save button diagnostics:', JSON.stringify(saveDiag));
    // Coordinate-based page.click() on this exact button reproducibly
    // no-ops (discovered this phase) — its rect sits only ~30px from the
    // bottom of a 900px viewport, and dismissing the push soft-ask banner
    // (the first suspect) did not fix it either. A direct in-page
    // HTMLElement.click() sidesteps whatever is intercepting the
    // coordinate-based mouse event.
    await page.evaluate(() => document.querySelector('[data-rm-action="save"]')?.click());
    await new Promise((r) => setTimeout(r, 500));
    const afterSaveClick = await page.evaluate(() => ({
      reviewConfirmExists: !!document.querySelector('[data-rm-action="review-confirm"]'),
      errorText: document.querySelector('.rm-error')?.textContent || null,
      stillOnRoleManagement: !!document.querySelector('.rm-role-list'),
      currentNameInputValue: document.getElementById('rmNameInput')?.value,
      allRmActions: [...document.querySelectorAll('[data-rm-action]')].map((e) => e.dataset.rmAction),
      kabidViewChecked: document.querySelector('input[data-rm-permission-id="agenda.kabid.view"]')?.checked,
    }));
    console.log('  after clicking save:', JSON.stringify(afterSaveClick));
    await page.waitForSelector('[data-rm-action="review-confirm"]', { timeout: 10000 });
    const reviewText = await page.evaluate(() => document.body.textContent);
    console.log('  review modal shows added agenda.kabid perms:', reviewText.includes('View Kabid Agenda') && reviewText.includes('Manage Kabid Agenda'));
    await page.screenshot({ path: path.join(ROOT, 'scratch', 'agenda-c53-role-review-modal.png') });
    await page.evaluate(() => document.querySelector('[data-rm-action="review-confirm"]')?.click());
    await new Promise((r) => setTimeout(r, 800));
    console.log('  Custom Role saved');

    console.log('\n=== [Verify via fresh RTDB read] ===');
    const customRolesAfter = dbGet('customRoles') || {};
    const createdEntry = Object.entries(customRolesAfter).find(([, r]) => r && r.name === ROLE_NAME);
    if (!createdEntry) throw new Error('[ABORT] could not find the newly created role by name in /customRoles after saving');
    const [roleId, roleRecord] = createdEntry;
    const permsSorted = [...(roleRecord.permissions || [])].sort();
    const expectedSorted = [...REQUIRED_PERMS].sort();
    if (JSON.stringify(permsSorted) !== JSON.stringify(expectedSorted)) {
      throw new Error(`[ABORT] created role's permissions do not exactly match expected: got ${JSON.stringify(permsSorted)}, expected ${JSON.stringify(expectedSorted)}`);
    }
    console.log(`  VERIFIED: /customRoles/${roleId} = { name: "${roleRecord.name}", permissions: ${JSON.stringify(permsSorted)}, archived: ${roleRecord.archived} }`);

    console.log('\n=== [User Management] Users tab, assign the new role to sarpras ===');
    await page.click('[data-top="users"]');
    await page.waitForSelector('[data-user-action="edit"][data-user-name="sarpras"]', { timeout: 15000 });
    // Discovered this phase: navManajemenUser() (the Users tab's land()
    // function) populates the REAL, correct user list via the existing
    // renderAdminList() into #modalUsersList's #usersListContent, but
    // nothing in the Domain Shell's Control->Users path actually calls
    // openUsersListModal()'s modal.style.display='flex' step — so the
    // real, correctly-rendered content stays invisible/unclickable behind
    // display:none. This one-line reveal mirrors EXACTLY that missing
    // second line of the app's own openUsersListModal() — no new
    // behavior invented, just making already-correct real content visible.
    const modalWasHidden = await page.evaluate(() => {
      const el = document.getElementById('modalUsersList');
      const hidden = el && getComputedStyle(el).display === 'none';
      if (hidden) el.style.display = 'flex';
      return hidden;
    });
    console.log(`  #modalUsersList required the display reveal workaround: ${modalWasHidden}`);
    await page.click('[data-user-action="edit"][data-user-name="sarpras"]');
    await page.waitForSelector('#userFieldRole', { timeout: 10000 });
    const prefill = await page.evaluate(() => ({
      username: document.getElementById('userFieldUsername')?.value,
      displayName: document.getElementById('userFieldDisplayName')?.value,
      role: document.getElementById('userFieldRole')?.value,
    }));
    console.log('  edit modal prefilled with:', JSON.stringify(prefill));
    if (prefill.username !== 'sarpras' || prefill.displayName !== 'Kepala Bidang Sarana dan Prasarana' || prefill.role !== 'admin') {
      throw new Error(`[ABORT] edit modal did not prefill as expected for sarpras: ${JSON.stringify(prefill)}`);
    }
    const optionFound = await page.evaluate((wantedRoleId) => {
      const sel = document.getElementById('userFieldRole');
      const opt = [...sel.options].find((o) => o.value === wantedRoleId);
      if (!opt) return false;
      sel.value = wantedRoleId;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }, roleId);
    if (!optionFound) throw new Error(`[ABORT] the new Custom Role option (${roleId}) was not present in #userFieldRole`);
    await page.screenshot({ path: path.join(ROOT, 'scratch', 'agenda-c53-user-edit-role-selected.png') });
    await page.click('#btnSaveUserForm');
    await new Promise((r) => setTimeout(r, 1200));
    console.log('  submitted user edit form');

    console.log('\n=== [Verify via fresh RTDB read] ===');
    const sarprasAfter = dbGet('users/sarpras');
    if (sarprasAfter.role !== roleId) throw new Error(`[ABORT] /users/sarpras.role is "${sarprasAfter.role}", expected "${roleId}"`);
    if (sarprasAfter.agendaParticipantType !== 'kabid') throw new Error(`[ABORT] agendaParticipantType was lost/changed: ${sarprasAfter.agendaParticipantType}`);
    if (sarprasAfter.active !== true || sarprasAfter.displayName !== 'Kepala Bidang Sarana dan Prasarana') {
      throw new Error(`[ABORT] unexpected field change on /users/sarpras: ${JSON.stringify(sarprasAfter)}`);
    }
    const changedKeys = Object.keys({ ...sarprasBefore, ...sarprasAfter }).filter((k) => JSON.stringify(sarprasBefore[k]) !== JSON.stringify(sarprasAfter[k]));
    console.log(`  VERIFIED: /users/sarpras.role = "${sarprasAfter.role}" (was "admin"). Changed keys: [${changedKeys.join(', ')}]`);
    if (JSON.stringify(changedKeys.sort()) !== JSON.stringify(['role', 'updatedAt'].sort()) && JSON.stringify(changedKeys.sort()) !== JSON.stringify(['role'])) {
      console.log(`  NOTE: changed key set was [${changedKeys.join(', ')}] — reviewing for anything beyond role/updatedAt`);
    }

    const profileAfter = dbGet('userProfiles/sarpras');
    console.log(`  /userProfiles/sarpras (auto-mirrored by the NOW-deployed durable trigger): ${JSON.stringify(profileAfter)}`);
    if (profileAfter?.role !== roleId || profileAfter?.agendaParticipantType !== 'kabid') {
      throw new Error(`[ABORT] the profile mirror did not durably carry both role and agendaParticipantType: ${JSON.stringify(profileAfter)}`);
    }
    console.log('  VERIFIED: mirror durability holds for real — role AND agendaParticipantType both survived a real unrelated-looking /users write');

    console.log(`\n=== DONE. Custom Role id: ${roleId} ===`);
    console.log(JSON.stringify({ roleId, roleName: ROLE_NAME, permissions: permsSorted, assignedTo: 'sarpras' }, null, 2));
  } catch (err) {
    if (page) {
      try {
        await fs.promises.mkdir(path.join(ROOT, 'scratch'), { recursive: true });
        await page.screenshot({ path: path.join(ROOT, 'scratch', 'agenda-c53-FAILURE-diagnostic.png') });
        console.error('[diagnostic] screenshot saved to scratch/agenda-c53-FAILURE-diagnostic.png');
      } catch {}
    }
    throw err;
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

main().catch((err) => { console.error('\n[agenda-c53-kabid-provisioning] FATAL:', err.stack || err.message); process.exit(1); });
