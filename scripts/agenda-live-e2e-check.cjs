'use strict';

/* ============================================================
   agenda-live-e2e-check.cjs — V1.31 Agenda & To-Do, Phase C3.1

   THE real, authenticated-browser, Rules-enforced, end-to-end proof:
   real headless Chromium, loading the REAL index.html/js/app.js (not a
   bespoke harness page), driving the REAL C3 forms and buttons, signed
   in against a REAL Firebase Auth EMULATOR user (via the same
   signInWithToken() export js/auth.js's own production login path
   calls), writing through the REAL js/firebase.js helper functions to a
   REAL RTDB emulator, enforced by the REAL database.rules.json.

   Zero source files are modified to make this work. The ONE piece that
   would otherwise defeat the whole point — js/firebase.js hardcodes
   PRODUCTION config with no emulator-connect branch (confirmed: this
   phase's own recon found zero existing convention for this, and
   scripts/lib/firebase-stubs/ is a Node-only `require()` interception
   technique that cannot reach a browser's native `import` resolution) —
   is solved by THIS FILE'S OWN local static server rewriting the byte
   stream for exactly one path, /js/firebase.js, inserting
   connectDatabaseEmulator()/connectAuthEmulator() calls immediately
   after the two exact lines that call getDatabase()/getAuth() (see
   patchFirebaseJs() below). Every other file — including agenda-store.js,
   agenda-event-drawer.js, permission-service.js, app.js itself — is
   served byte-identical to disk. If those two exact source lines ever
   change, the patch is written to throw loudly rather than silently
   serve an unpatched, production-pointed copy.

   Test identities (Auth emulator users, custom claims minted directly —
   verifyPin.js's own token-issuing Cloud Function is NOT invoked; this
   phase's brief explicitly scopes "authenticate the browser" as a
   separate, programmatic precondition to "drive the actual UI", not a
   request to also re-prove the PIN-entry login form, which is already
   covered by its own, unrelated test suites):
     e2eOrganizer — role 'admin'. Creates the event/task, edits the event.
     e2ePic       — role 'admin'. Added as participant+PIC during
                    creation (the brief's own "choose PIC" step). Also
                    performs the real click-through RSVP flow.
     e2eDriver    — role 'driver', deliberately NOT agenda.manage/
                    agenda.view-holding (mirrors agenda-rules-security-
                    check.mjs's own asOrdinaryParticipant fixture
                    exactly). Added to the event's participants map by a
                    direct Admin SDK write AFTER the browser creates the
                    event (test setup only, clearly labeled — not part of
                    any "real UI flow" claim). Used for the negative
                    security proof via the REAL signed-in browser client
                    (not just the synthetic rules-unit-testing harness).

   A genuinely-discovered, reported (not silently worked around) product
   gap: every role that can currently SEE/OPEN the Agenda workspace list
   (agenda.view or agenda.kabid.view) in THIS scope also currently holds
   agenda.manage (Sarpras admin) — there is no role today that is both
   list-visible AND scope-bypass-write-denied for a sarpras_shared event
   without additional Custom-Role/individual-permission plumbing outside
   this phase's scope. So the interactive RSVP click-through below uses
   e2ePic (a legitimate PIC/participant, not a strictly non-privileged
   "ordinary participant") — the READ-ONLY-form / ordinary-participant
   boundary itself is proven separately, exhaustively, by the REAL
   signed-in e2eDriver session's direct store-function calls below, and
   by the 15 RSVP Rules-unit-test cases in agenda-rules-security-check.mjs.

   Run: node scripts/agenda-live-e2e-run-with-emulator.mjs (exit 0 = pass)
   Never invoke this file directly with plain `node` — it requires
   FIREBASE_DATABASE_EMULATOR_HOST/FIREBASE_AUTH_EMULATOR_HOST, which
   only `firebase emulators:exec` sets. */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

let pass = 0, fail = 0;
async function checkAsync(name, run) {
  try { await run(); pass++; console.log(`  ✓ ${name}`); }
  catch (err) { fail++; console.log(`  ✗ ${name} — ${err.stack || err.message}`); }
}

/** page.click(selector) resolves the element then clicks it in two separate
 *  steps; agenda-store.js's live Firebase listeners can re-render the whole
 *  workspace (innerHTML replace) in the narrow window between those two
 *  steps — a real, if narrow, timing window headless automation hits far
 *  more often than a human clicking at human speed. Retries on exactly the
 *  "Node is detached from document"/"not attached to the DOM"/"not
 *  clickable or not an Element" class of error (all symptoms of the SAME
 *  underlying race — a re-render swapping the node out from under
 *  Puppeteer between resolving the selector and computing a clickable
 *  point), re-resolving the selector fresh each attempt, rather than
 *  masking a different failure. */
async function clickRetry(page, selector, attempts = 4) {
  for (let i = 1; i <= attempts; i++) {
    try { await page.click(selector); return; }
    catch (err) {
      if (i === attempts || !/detached from document|not attached to the DOM|not clickable or not an Element/i.test(err.message)) throw err;
      await new Promise((r) => setTimeout(r, 250));
    }
  }
}

function httpGet(options) {
  return new Promise((resolve, reject) => {
    const req = http.request({ ...options, method: 'GET' }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.end();
  });
}

/** Same rigor as functions/scripts/phase-c-emulator/_lib/safety-guard.js's
 *  assertSafeEmulatorOrExit() (reused as-is for the DATABASE half below) —
 *  this is the AUTH-emulator equivalent, written locally rather than added
 *  to that shared file (it explicitly documents itself as a deliberate,
 *  narrow exception to this program's "no shared lib" convention for
 *  exactly the RTDB canary; adding an unrelated Auth check to it would
 *  widen that exception for every existing Phase C file, not just this
 *  one new one). Read-only network probe ONLY — never the Admin SDK, so
 *  this guard never depends on the thing it verifies. If this ever
 *  succeeds against a non-emulator, that is itself proof the target is a
 *  real Firebase Auth Emulator: the `{"authEmulator":{"ready":true}}`
 *  root-path response is unique to the emulator, production Auth has no
 *  such endpoint. */
async function assertSafeAuthEmulatorOrExit() {
  const raw = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  if (!raw) {
    console.error('\n[safety-guard] REFUSING TO PROCEED: FIREBASE_AUTH_EMULATOR_HOST is not set. This test must run inside `firebase emulators:exec --only auth,database ...` (see agenda-live-e2e-run-with-emulator.mjs) — never invoke this file directly with plain `node`.\n');
    process.exit(1);
  }
  const match = /^(127\.0\.0\.1|localhost|\[::1\])(?::(\d+))?$/.exec(raw);
  if (!match) {
    console.error(`\n[safety-guard] REFUSING TO PROCEED: FIREBASE_AUTH_EMULATOR_HOST="${raw}" does not look like a loopback "host:port" address.\n`);
    process.exit(1);
  }
  const host = match[1] === '[::1]' ? '::1' : match[1];
  const port = Number(match[2]);
  const firebaseJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'firebase.json'), 'utf8'));
  const configuredPort = firebaseJson?.emulators?.auth?.port;
  if (!Number.isInteger(configuredPort)) {
    console.error('\n[safety-guard] REFUSING TO PROCEED: firebase.json has no emulators.auth.port.\n');
    process.exit(1);
  }
  if (port !== configuredPort) {
    console.error(`\n[safety-guard] REFUSING TO PROCEED: FIREBASE_AUTH_EMULATOR_HOST points at port ${port}, but firebase.json's emulators.auth.port is ${configuredPort}.\n`);
    process.exit(1);
  }
  let res;
  try { res = await httpGet({ host, port, path: '/' }); }
  catch (err) { console.error(`\n[safety-guard] REFUSING TO PROCEED: canary GET to the Auth emulator failed — is it actually running at ${host}:${port}? (${err.message})\n`); process.exit(1); }
  let parsed;
  try { parsed = JSON.parse(res.body); } catch { parsed = null; }
  if (!parsed || !parsed.authEmulator || parsed.authEmulator.ready !== true) {
    console.error(`\n[safety-guard] REFUSING TO PROCEED: canary response from ${host}:${port} does not look like a healthy Auth Emulator: ${res.body.slice(0, 200)}\n`);
    process.exit(1);
  }
  console.log(`[safety-guard] Verified: FIREBASE_AUTH_EMULATOR_HOST=${raw} is a real, reachable, loopback Auth emulator. Safe to proceed.`);
}

/** Rewrites exactly the two lines in js/firebase.js that call
 *  getDatabase()/getAuth(), inserting the matching connect*Emulator()
 *  call immediately after each, plus the two extra named imports those
 *  calls need. Throws (loudly, not silently) if any of the four exact
 *  substrings is not found — a future edit to firebase.js's init code
 *  must not silently produce an unpatched, production-pointed harness. */
function patchFirebaseJs(source, dbPort, authPort) {
  const dbImportFrom = "import { getDatabase, onValue, ref, set, get, update, remove, runTransaction, goOffline, goOnline } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js';";
  const dbImportTo = "import { getDatabase, onValue, ref, set, get, update, remove, runTransaction, goOffline, goOnline, connectDatabaseEmulator } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js';";
  const authImportFrom = "import { getAuth, signInWithCustomToken, onAuthStateChanged, signOut, setPersistence, browserLocalPersistence } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';";
  const authImportTo = "import { getAuth, signInWithCustomToken, onAuthStateChanged, signOut, setPersistence, browserLocalPersistence, connectAuthEmulator } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';";
  const dbInitFrom = 'firebaseDb = getDatabase(firebaseApp);';
  const dbInitTo = `firebaseDb = getDatabase(firebaseApp);\n    connectDatabaseEmulator(firebaseDb, '127.0.0.1', ${dbPort});\n    window.__onValueCallCount = window.__onValueCallCount || 0;`;
  const authInitFrom = 'firebaseAuth = getAuth(firebaseApp);';
  const authInitTo = `firebaseAuth = getAuth(firebaseApp);\n  connectAuthEmulator(firebaseAuth, 'http://127.0.0.1:${authPort}', { disableWarnings: true });`;
  // Phase D listener-leak instrumentation (§15): count every onValue()
  // subscription attempt, test-harness-only, never touching the committed
  // file. subscribeNode() is the ONE call site every RTDB listener in this
  // app (Agenda included) funnels through.
  const subscribeFrom = 'return onValue(dbRef, onData, (error) => {';
  const subscribeTo = "window.__onValueCallCount = (window.__onValueCallCount || 0) + 1;\n  return onValue(dbRef, onData, (error) => {";

  for (const [label, from] of [
    ['db import', dbImportFrom], ['auth import', authImportFrom],
    ['db init', dbInitFrom], ['auth init', authInitFrom], ['subscribeNode', subscribeFrom],
  ]) {
    if (!source.includes(from)) throw new Error(`patchFirebaseJs: expected substring for "${label}" not found in js/firebase.js — the file changed since this patch was written. Refusing to serve an unpatched copy.`);
  }

  return source
    .replace(dbImportFrom, dbImportTo)
    .replace(authImportFrom, authImportTo)
    .replace(dbInitFrom, dbInitTo)
    .replace(authInitFrom, authInitTo)
    .replace(subscribeFrom, subscribeTo);
}

function startServer(dbPort, authPort) {
  const firebaseJsPatched = patchFirebaseJs(fs.readFileSync(path.join(ROOT, 'js', 'firebase.js'), 'utf8'), dbPort, authPort);
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    if (p === '/js/firebase.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript' });
      res.end(firebaseJsPatched);
      return;
    }
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); res.end('not found'); return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return server;
}

async function main() {
  const { assertSafeEmulatorOrExit } = require('../functions/scripts/phase-c-emulator/_lib/safety-guard');
  await assertSafeEmulatorOrExit();
  await assertSafeAuthEmulatorOrExit();

  // Only NOW, strictly after both guards resolve, may anything under
  // functions/src load (admin.initializeApp() happens at require-time).
  //
  // RTDB EMULATOR NAMESPACE FIX — found by running this exact test: with
  // "singleProjectMode" (firebase.json), the RTDB emulator only fully
  // activates/enforces database.rules.json for ONE namespace, and (per
  // database-debug.log) that namespace is "schedule-driver-pbsi-default-
  // rtdb" — derived from the REAL regional databaseURL the browser client
  // uses (js/firebase.js's real, untouched firebaseConfig). admin.
  // initializeApp() with no args (functions/src/config/admin.js, shared
  // production code — not edited) instead falls back to constructing a
  // LEGACY-style URL from the bare GCLOUD_PROJECT env var alone
  // ("https://schedule-driver-pbsi.firebaseio.com" -> namespace
  // "schedule-driver-pbsi"), an namespace the emulator activates but does
  // NOT enforce rules for. Left alone, the Admin SDK (and, transitively,
  // every functions/src/agenda/* trigger handler's own require('../config/
  // admin')) would silently read/write a DIFFERENT, unenforced logical
  // database than the one the real signed-in browser client uses — this
  // was confirmed directly: a real signed-in non-privileged browser
  // session could write agendaAudit (.write:false, unconditionally, for
  // everyone) without being denied, because that connection had drifted
  // onto the unenforced namespace. Setting FIREBASE_CONFIG here — a plain
  // environment nudge, the exact same mechanism firebase emulators:exec
  // already uses for FIREBASE_DATABASE_EMULATOR_HOST, not a code change —
  // BEFORE requiring the shared admin singleton makes admin.initializeApp()
  // pick up the correct, real, rules-enforced databaseURL instead of
  // guessing the legacy one.
  process.env.FIREBASE_CONFIG = JSON.stringify({
    databaseURL: 'https://schedule-driver-pbsi-default-rtdb.asia-southeast1.firebasedatabase.app',
    projectId: 'schedule-driver-pbsi',
    storageBucket: 'schedule-driver-pbsi.firebasestorage.app',
  });
  const { auth, db } = require('../functions/src/config/admin');
  const { makeChangeEvent } = require('../functions/scripts/phase-c-emulator/_lib/fixtures');
  const { onAgendaEventWrite } = require('../functions/src/agenda/onAgendaEventWrite');
  const { onAgendaEventIndexSync } = require('../functions/src/agenda/onAgendaEventIndexSync');
  const { onAgendaEventReminderSync } = require('../functions/src/agenda/onAgendaEventReminderSync');
  const { onAgendaTaskWrite } = require('../functions/src/agenda/onAgendaTaskWrite');
  const { onAgendaTaskIndexSync } = require('../functions/src/agenda/onAgendaTaskIndexSync');
  const { onAgendaTaskReminderSync } = require('../functions/src/agenda/onAgendaTaskReminderSync');
  const { agendaReminderId } = require('../functions/src/reminders/schedule');
  const puppeteer = require('puppeteer');

  const firebaseJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'firebase.json'), 'utf8'));
  const DB_PORT = firebaseJson.emulators.database.port;
  const AUTH_PORT = firebaseJson.emulators.auth.port;

  const ORGANIZER = 'e2eOrganizer';
  const PIC = 'e2ePic';
  const DRIVER = 'e2eDriver';
  // V1.31 picker-fix phase — a second REAL Sarpras candidate (reproduces the
  // reported "Leo missing" report against real data, not a hardcoded name)
  // and a REAL Kabid identity (Custom Role holding agenda.kabid.view/manage,
  // exactly the existing architecture — no new system role invented).
  const LEO = 'e2eLeo';
  const KABID = 'e2eKabid';
  const KABID_ROLE_ID = 'e2eKabidRole';

  console.log('\n=== [Setup] Seed Auth emulator identities + /userProfiles picker candidates ===');
  for (const uid of [ORGANIZER, PIC, DRIVER, LEO, KABID]) {
    await auth.createUser({ uid, email: `${uid}@example.test`, password: 'not-used-x1!' }).catch(() => {});
  }
  // V1.31 C5.2 — role:'admin' alone no longer implies Sarpras-staff Agenda
  // candidacy (production has admin accounts that are Kabid or system/
  // administrative, not staff) — candidacy is driven by the explicit,
  // authoritative agendaParticipantType field, mirrored from /users the
  // same way any other field is.
  await db.ref(`userProfiles/${ORGANIZER}`).set({ username: ORGANIZER, displayName: 'E2E Organizer', role: 'admin', active: true, agendaParticipantType: 'sarpras_staff' });
  await db.ref(`userProfiles/${PIC}`).set({ username: PIC, displayName: 'E2E Pic', role: 'admin', active: true, agendaParticipantType: 'sarpras_staff' });
  await db.ref(`userProfiles/${LEO}`).set({ username: LEO, displayName: 'E2E Leo', role: 'admin', active: true, agendaParticipantType: 'sarpras_staff' });
  await db.ref(`customRoles/${KABID_ROLE_ID}`).set({ name: 'Kabid Sarana dan Prasarana (E2E)', permissions: ['agenda.kabid.view', 'agenda.kabid.manage'], archived: false });
  await db.ref(`userProfiles/${KABID}`).set({ username: KABID, displayName: 'E2E Kabid Sarpras', role: KABID_ROLE_ID, active: true });
  // DRIVER deliberately NOT seeded into /userProfiles as role:'admin' —
  // they must never appear in the picker (mirrors production: a driver is
  // not Sarpras/Kabid staff and is never an invite candidate).
  const organizerToken = await auth.createCustomToken(ORGANIZER, { role: 'admin' });
  const picToken = await auth.createCustomToken(PIC, { role: 'admin' });
  const driverToken = await auth.createCustomToken(DRIVER, { role: 'driver' });
  // agendaKabid mirrors verifyPin.js#deriveExtraClaims()'s own real logic
  // (grants agendaKabid:true iff the session's role's permissions include
  // agenda.kabid.view/manage) — this custom token bypasses verifyPin.js
  // exactly like every other identity in this suite already does, not a
  // new/weaker path invented for Kabid.
  const kabidToken = await auth.createCustomToken(KABID, { role: KABID_ROLE_ID, agendaKabid: true });
  console.log('  identities ready:', ORGANIZER, PIC, DRIVER, LEO, KABID);

  const server = startServer(DB_PORT, AUTH_PORT);
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const url = `http://localhost:${port}/index.html`;
  console.log(`  static server (firebase.js patched for emulators) at ${url}`);

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'], protocolTimeout: 60000 });
  let eventId = null;
  let taskId = null;
  let currentPage = null;

  try {
    // ================================================================
    console.log('\n=== [Boot] Real index.html/app.js boot, unauthenticated, against the emulators ===');
    // ================================================================
    const bootCtx = await browser.createBrowserContext();
    const bootPage = await bootCtx.newPage();
    const bootErrors = [];
    bootPage.on('pageerror', (e) => bootErrors.push('pageerror: ' + e.message));
    bootPage.on('console', (m) => { if (m.type() === 'error') bootErrors.push('console.error: ' + m.text()); });
    await bootPage.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
    await bootPage.waitForFunction(() => document.body.classList.contains('app-ready'), { timeout: 20000 });
    await checkAsync('real app boot reaches app-ready against the (patched) emulator-pointed firebase.js', async () => {
      const ready = await bootPage.evaluate(() => document.body.classList.contains('app-ready'));
      if (!ready) throw new Error('app-ready never set');
    });
    const fatalBoot = bootErrors.filter((e) => /SyntaxError|ReferenceError|TypeError|is not a function|Failed to (load|fetch) module|Cannot use import|does not provide an export/i.test(e));
    await checkAsync('zero fatal module/boot errors on unauthenticated load', () => {
      if (fatalBoot.length) throw new Error(fatalBoot.join(' | '));
    });
    await bootCtx.close();

    // ================================================================
    console.log('\n=== [9/10] Organizer: authenticate, create event through the REAL UI ===');
    // ================================================================
    const orgCtx = await browser.createBrowserContext();
    const orgPage = await orgCtx.newPage();
    currentPage = orgPage;
    orgPage.on('pageerror', (e) => console.log('  [organizer page error]', e.message));
    orgPage.on('console', (m) => { if (m.type() === 'error') console.log('  [organizer console.error]', m.text()); });
    await orgPage.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
    await orgPage.waitForFunction(() => document.body.classList.contains('app-ready'), { timeout: 20000 });

    await orgPage.evaluate(async (token) => {
      const fb = await import('/js/firebase.js');
      await fb.signInWithToken(token);
    }, organizerToken);
    await orgPage.waitForFunction(() => {
      try { return JSON.parse(localStorage.getItem('pbsi_current_user') || 'null')?.username === 'e2eOrganizer'; }
      catch { return false; }
    }, { timeout: 20000 });
    await checkAsync('organizer: real signInWithToken() against the Auth emulator -> real onAuthStateChanged hydration', async () => {
      const u = await orgPage.evaluate(() => JSON.parse(localStorage.getItem('pbsi_current_user')));
      if (u.username !== ORGANIZER || u.role !== 'admin') throw new Error(`got ${JSON.stringify(u)}`);
    });

    await orgPage.waitForSelector('[data-agenda-action="create-event"]', { timeout: 15000 });
    await checkAsync('Agenda & To-do section rendered on Today for the organizer', async () => {
      const exists = await orgPage.evaluate(() => !!document.querySelector('[data-agenda-action="create-event"]'));
      if (!exists) throw new Error('create-event control not found');
    });

    const eventTitle = `E2E Rapat Koordinasi ${Date.now()}`;
    // Tomorrow, not today — 09:00 today can already be in the past by the
    // time this script actually runs, which would make the H1 (fire 1h
    // before start) reminder-sync trigger correctly decline to schedule a
    // future reminder for an already-past time, failing [11] for a reason
    // that has nothing to do with the code under test.
    const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
    const dateStr = tomorrow.toISOString().slice(0, 10);

    await clickRetry(orgPage, '[data-agenda-action="create-event"]');
    await orgPage.waitForSelector('[data-drawer-body] [data-field="title"]', { timeout: 10000 });
    await orgPage.type('[data-field="title"]', eventTitle, { delay: 5 });
    await orgPage.$eval('[data-field="date"]', (el, v) => { el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); }, dateStr);
    await orgPage.$eval('[data-field="startTime"]', (el) => { el.value = '09:00'; el.dispatchEvent(new Event('change', { bubbles: true })); });
    await orgPage.$eval('[data-field="endTime"]', (el) => { el.value = '10:00'; el.dispatchEvent(new Event('change', { bubbles: true })); });
    await orgPage.type('[data-field="location"]', 'Ruang E2E', { delay: 5 });

    // agenda-directory.js's own Firebase listener (userProfiles/customRoles)
    // resolves asynchronously and does NOT re-render an already-open picker
    // on late-arriving data (a real, narrow, pre-existing race — this waits
    // it out rather than opening the picker before it's populated).
    await orgPage.waitForFunction(async () => {
      const dir = await import('/js/agenda/agenda-directory.js');
      return dir.getAgendaCandidates().length > 0;
    }, { timeout: 15000 });
    await clickRetry(orgPage, '[data-drawer-action="picker:open"]');
    await orgPage.waitForSelector(`[data-drawer-action="picker:toggle:${PIC}"]`, { timeout: 10000 });
    await checkAsync('participant picker shows the seeded PIC candidate (real /userProfiles read via the emulator)', async () => {
      const exists = await orgPage.evaluate((u) => !!document.querySelector(`[data-drawer-action="picker:toggle:${u}"]`), PIC);
      if (!exists) throw new Error('candidate row not found');
    });
    await clickRetry(orgPage, `[data-drawer-action="picker:toggle:${PIC}"]`);
    await orgPage.waitForSelector(`[data-drawer-action="picker:togglepic:${PIC}"]:not([disabled])`, { timeout: 5000 });
    await clickRetry(orgPage, `[data-drawer-action="picker:togglepic:${PIC}"]`);
    await clickRetry(orgPage, '[data-drawer-action="picker:done"]');
    await orgPage.waitForSelector('[data-drawer-body] [data-field="title"]', { timeout: 5000 });

    await clickRetry(orgPage, '[data-drawer-action="event:save"]');
    await orgPage.waitForFunction(() => !document.getElementById('appDrawerOverlay'), { timeout: 15000 });

    await checkAsync('event landed in the REAL RTDB emulator with the right fields', async () => {
      const snap = await db.ref('agendaEvents').orderByChild('title').equalTo(eventTitle).once('value');
      const val = snap.val();
      if (!val) throw new Error('event not found in RTDB');
      eventId = Object.keys(val)[0];
      const rec = val[eventId];
      const expect = { title: eventTitle, scope: 'sarpras_shared', organizerUsername: ORGANIZER, createdBy: ORGANIZER, updatedBy: ORGANIZER };
      for (const [k, v] of Object.entries(expect)) if (rec[k] !== v) throw new Error(`field ${k}: expected ${v}, got ${rec[k]}`);
      if (!rec.id || !rec.startAt || !rec.endAt || !rec.createdAt || !rec.updatedAt) throw new Error(`missing a required field: ${JSON.stringify(rec)}`);
      if (!rec.participants || rec.participants[PIC]?.isPic !== true) throw new Error(`participants.${PIC}.isPic not true: ${JSON.stringify(rec.participants)}`);
    });

    // ================================================================
    console.log('\n=== [11] Derived-system: invoke the REAL C2 trigger logic on the REAL browser-produced record ===');
    // ================================================================
    // No Functions emulator is running (--only auth,database, matching this
    // repo's own established convention of proving trigger logic via direct
    // .run() invocation rather than a live Functions-emulator round trip —
    // see functions/scripts/phase-c-emulator/agenda-triggers-check.js's own
    // header). That means nothing populates agendaEventsByScope/* after the
    // browser's write UNTIL this step runs — in production the real deployed
    // trigger fires within ~1s of the write, so this mirrors that by running
    // it immediately, before checking the UI reflects the new event (exactly
    // like a real user would experience: write, then near-instant index
    // population, then their listener shows it).
    await checkAsync('trigger logic (fed the real record) produces exactly one audit row, action=created', async () => {
      const eventSnap = await db.ref(`agendaEvents/${eventId}`).once('value');
      const rec = eventSnap.val();
      await onAgendaEventWrite.run(makeChangeEvent({ params: { eventId }, before: null, after: rec, time: rec.createdAt }));
      await onAgendaEventIndexSync.run(makeChangeEvent({ params: { eventId }, before: null, after: rec, time: rec.createdAt }));
      await onAgendaEventReminderSync.run(makeChangeEvent({ params: { eventId }, before: null, after: rec, time: rec.createdAt }));
      const auditSnap = await db.ref('agendaAudit').orderByChild('entityId').equalTo(eventId).once('value');
      const rows = Object.values(auditSnap.val() || {});
      if (rows.length !== 1 || rows[0].action !== 'created' || rows[0].actorUsername !== ORGANIZER) throw new Error(`got ${JSON.stringify(rows)}`);
    });
    await checkAsync('index trigger populated agendaEventsByUser/agendaEventsByScope for the real record', async () => {
      const byUser = await db.ref(`agendaEventsByUser/${ORGANIZER}/${eventId}`).once('value');
      const byScope = await db.ref(`agendaEventsByScope/sarpras_shared/${eventId}`).once('value');
      if (!byUser.exists() || !byScope.exists()) throw new Error('index rows missing');
    });
    await checkAsync('reminder-sync trigger scheduled an H1 reminder row for the real record', async () => {
      const remId = agendaReminderId('agendaEvent', eventId, 'h1');
      const rem = await db.ref(`reminders/${remId}`).once('value');
      if (!rem.exists()) throw new Error('h1 reminder row missing');
    });

    await orgPage.waitForFunction((title) => document.body.textContent.includes(title), { timeout: 15000 }, eventTitle);
    await checkAsync('the organizer\'s own real Firebase listener rendered the new event into the Agenda list (no manual refresh), now that the index exists', async () => {
      const visible = await orgPage.evaluate((title) => document.body.textContent.includes(title), eventTitle);
      if (!visible) throw new Error('event title not found in DOM after listener propagation');
    });

    // ================================================================
    console.log('\n=== [12] Organizer: create task through the REAL UI ===');
    // ================================================================
    const taskTitle = `E2E Persiapan Rapat ${Date.now()}`;
    await clickRetry(orgPage, '[data-agenda-action="create-task"]');
    await orgPage.waitForSelector('[data-drawer-body] [data-field="title"]', { timeout: 10000 });
    await orgPage.type('[data-field="title"]', taskTitle, { delay: 5 });
    await orgPage.$eval('[data-field="dueDate"]', (el, v) => { el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); }, dateStr);
    await clickRetry(orgPage, '[data-drawer-action="task:priority:urgent"]');
    await orgPage.waitForFunction(async () => {
      const dir = await import('/js/agenda/agenda-directory.js');
      return dir.getAgendaCandidates().length > 0;
    }, { timeout: 15000 });
    await clickRetry(orgPage, '[data-drawer-action="picker:open"]');
    await orgPage.waitForSelector(`[data-drawer-action="picker:toggle:${PIC}"]`, { timeout: 10000 });
    await clickRetry(orgPage, `[data-drawer-action="picker:toggle:${PIC}"]`);
    await clickRetry(orgPage, '[data-drawer-action="picker:done"]');
    await orgPage.waitForSelector('[data-field="newChecklistLabel"]', { timeout: 5000 });
    // Checklist/Subtugas lives behind a <details><summary> disclosure,
    // collapsed by default — must open it before its fields are interactable.
    await clickRetry(orgPage, '.cal-disclosure summary');
    await orgPage.type('[data-field="newChecklistLabel"]', 'Siapkan materi', { delay: 5 });
    await clickRetry(orgPage, '[data-drawer-action="task:additem"]');
    await orgPage.waitForFunction(() => document.body.textContent.includes('Siapkan materi'), { timeout: 5000 });

    await clickRetry(orgPage, '[data-drawer-action="task:save"]');
    await orgPage.waitForFunction(() => !document.getElementById('appDrawerOverlay'), { timeout: 15000 });

    await checkAsync('task landed in the REAL RTDB emulator with the right fields', async () => {
      const snap = await db.ref('agendaTasks').orderByChild('title').equalTo(taskTitle).once('value');
      const val = snap.val();
      if (!val) throw new Error('task not found in RTDB');
      taskId = Object.keys(val)[0];
      const rec = val[taskId];
      if (rec.priority !== 'urgent') throw new Error(`priority: expected urgent, got ${rec.priority}`);
      if (!rec.responsible || !rec.responsible[PIC]) throw new Error(`responsible.${PIC} missing: ${JSON.stringify(rec.responsible)}`);
      if (!Array.isArray(rec.checklist) || rec.checklist[0]?.label !== 'Siapkan materi') throw new Error(`checklist wrong: ${JSON.stringify(rec.checklist)}`);
      if (rec.scope !== 'sarpras_shared' || rec.createdBy !== ORGANIZER || rec.updatedBy !== ORGANIZER) throw new Error(`attribution/scope wrong: ${JSON.stringify(rec)}`);
    });

    // Same reason as [11] above: no Functions emulator running, so the
    // task's own scope index needs the real trigger invoked directly
    // before the To-Do view (index-driven, like Agenda) can show it.
    await checkAsync('task trigger logic populates audit + agendaTasksByUser/ByScope + reminder for the real record', async () => {
      const taskSnap = await db.ref(`agendaTasks/${taskId}`).once('value');
      const rec = taskSnap.val();
      await onAgendaTaskWrite.run(makeChangeEvent({ params: { taskId }, before: null, after: rec, time: rec.createdAt }));
      await onAgendaTaskIndexSync.run(makeChangeEvent({ params: { taskId }, before: null, after: rec, time: rec.createdAt }));
      await onAgendaTaskReminderSync.run(makeChangeEvent({ params: { taskId }, before: null, after: rec, time: rec.createdAt }));
      const auditSnap = await db.ref('agendaAudit').orderByChild('entityId').equalTo(taskId).once('value');
      const rows = Object.values(auditSnap.val() || {});
      if (rows.length !== 1 || rows[0].action !== 'created') throw new Error(`audit: got ${JSON.stringify(rows)}`);
      const byScope = await db.ref(`agendaTasksByScope/sarpras_shared/${taskId}`).once('value');
      if (!byScope.exists()) throw new Error('agendaTasksByScope row missing');
    });

    await clickRetry(orgPage, '[data-agenda-action="set-mode:todo"]');
    await orgPage.waitForFunction((title) => document.body.textContent.includes(title), { timeout: 10000 }, taskTitle);
    await checkAsync('the To-Do view shows the new task via the real listener', async () => {
      const visible = await orgPage.evaluate((title) => document.body.textContent.includes(title), taskTitle);
      if (!visible) throw new Error('task title not found in To-Do view');
    });

    // Closes the master brief's own named task lifecycle
    // (create->responsible->priority->checklist->edit->COMPLETE->reminder
    // ->audit->index) — "complete" was the one transition not yet
    // exercised through the real UI (only proven via direct .run()
    // invocation in the Functions-emulator suite until now).
    const taskBeforeComplete = await db.ref(`agendaTasks/${taskId}`).once('value').then((s) => s.val());
    await clickRetry(orgPage, `[data-agenda-action="open-task:${taskId}"]`);
    await orgPage.waitForSelector('[data-drawer-action="task:complete"]', { timeout: 10000 });
    await clickRetry(orgPage, '[data-drawer-action="task:complete"]');
    await orgPage.waitForFunction(() => !document.getElementById('appDrawerOverlay'), { timeout: 15000 });
    await checkAsync('clicking "Tandai Selesai" through the real UI marks the real task done in RTDB', async () => {
      const snap = await db.ref(`agendaTasks/${taskId}`).once('value');
      const rec = snap.val();
      if (rec.status !== 'done') throw new Error(`status: expected done, got ${rec.status}`);
      if (rec.completedBy !== ORGANIZER || !rec.completedAt) throw new Error(`completedBy/completedAt not set: ${JSON.stringify(rec)}`);
    });
    await checkAsync('the real completion trigger produces a "completed" audit row (not a second "created")', async () => {
      const afterRec = await db.ref(`agendaTasks/${taskId}`).once('value').then((s) => s.val());
      await onAgendaTaskWrite.run(makeChangeEvent({ params: { taskId }, before: taskBeforeComplete, after: afterRec, time: afterRec.updatedAt }));
      const auditSnap = await db.ref('agendaAudit').orderByChild('entityId').equalTo(taskId).once('value');
      const rows = Object.values(auditSnap.val() || {});
      const completedRows = rows.filter((r) => r.action === 'completed');
      if (completedRows.length !== 1) throw new Error(`expected exactly one 'completed' audit row, got ${JSON.stringify(rows)}`);
    });

    await clickRetry(orgPage, '[data-agenda-action="set-mode:agenda"]');

    // ================================================================
    console.log('\n=== [13] Organizer: edit the event\'s title through the REAL UI ===');
    // ================================================================
    const editedTitle = `${eventTitle} (diubah)`;
    await orgPage.waitForSelector(`[data-agenda-action="open-event:${eventId}"]`, { timeout: 10000 });
    await clickRetry(orgPage, `[data-agenda-action="open-event:${eventId}"]`);
    await orgPage.waitForSelector('[data-drawer-body] [data-field="title"]', { timeout: 10000 });
    await orgPage.$eval('[data-field="title"]', (el) => { el.value = ''; });
    await orgPage.type('[data-field="title"]', editedTitle, { delay: 5 });
    const beforeEditSnap = await db.ref(`agendaEvents/${eventId}`).once('value');
    const updatedAtBefore = beforeEditSnap.val().updatedAt;
    await clickRetry(orgPage, '[data-drawer-action="event:save"]');
    await orgPage.waitForFunction(() => !document.getElementById('appDrawerOverlay'), { timeout: 15000 });

    await checkAsync('edit landed in the REAL RTDB emulator: title changed, updatedBy/updatedAt correct', async () => {
      const snap = await db.ref(`agendaEvents/${eventId}`).once('value');
      const rec = snap.val();
      if (rec.title !== editedTitle) throw new Error(`title: expected "${editedTitle}", got "${rec.title}"`);
      if (rec.updatedBy !== ORGANIZER) throw new Error(`updatedBy: ${rec.updatedBy}`);
      if (rec.updatedAt === updatedAtBefore) throw new Error('updatedAt did not change');
      if (rec.organizerUsername !== ORGANIZER || rec.createdBy !== ORGANIZER) throw new Error('immutable fields drifted');
    });
    await orgPage.waitForFunction((title) => document.body.textContent.includes(title), { timeout: 10000 }, editedTitle);
    await checkAsync('the UI shows the edited title via the real listener (no manual refresh)', async () => {
      const visible = await orgPage.evaluate((title) => document.body.textContent.includes(title), editedTitle);
      if (!visible) throw new Error('edited title not found in DOM');
    });

    // ================================================================
    console.log("\n=== [Setup for 14] Add e2eDriver as an ordinary (non-PIC) participant — test setup, direct Admin SDK write, labeled ===");
    // ================================================================
    await db.ref(`agendaEvents/${eventId}/participants/${DRIVER}`).set({ isPic: false, status: 'invited', invitedBy: ORGANIZER, invitedAt: new Date().toISOString() });

    // ================================================================
    console.log('\n=== [14a] e2ePic (participant/PIC): real click-through RSVP flow ===');
    // ================================================================
    const picCtx = await browser.createBrowserContext();
    const picPage = await picCtx.newPage();
    currentPage = picPage;
    await picPage.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
    await picPage.waitForFunction(() => document.body.classList.contains('app-ready'), { timeout: 20000 });
    await picPage.evaluate(async (token) => { const fb = await import('/js/firebase.js'); await fb.signInWithToken(token); }, picToken);
    await picPage.waitForFunction(() => {
      try { return JSON.parse(localStorage.getItem('pbsi_current_user') || 'null')?.username === 'e2ePic'; } catch { return false; }
    }, { timeout: 20000 });

    await picPage.waitForSelector(`[data-agenda-action="open-event:${eventId}"]`, { timeout: 15000 });
    await clickRetry(picPage, `[data-agenda-action="open-event:${eventId}"]`);
    await picPage.waitForSelector('.cal-rsvp-buttons', { timeout: 10000 });
    await checkAsync('RSVP block renders for the PIC participant, initial status = Belum merespons', async () => {
      const hint = await picPage.evaluate(() => document.querySelector('[data-rsvp-hint]')?.textContent || '');
      if (!hint.includes('belum merespons')) throw new Error(`got hint: "${hint}"`);
      const picBadge = await picPage.evaluate(() => !!document.querySelector('.cal-pill--pic'));
      if (!picBadge) throw new Error('PIC badge not shown next to Kehadiran Saya');
    });

    // Visual QA (§19) — desktop, mobile 390, dark mode. Actually read back afterward, not just generated.
    const scratchDir = path.join(ROOT, 'scratch');
    if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });
    const settle = () => new Promise((r) => setTimeout(r, 250));
    await picPage.setViewport({ width: 1440, height: 900 }); await settle();
    await picPage.screenshot({ path: path.join(scratchDir, 'agenda-c3-1-rsvp-desktop-light.png') });
    await picPage.setViewport({ width: 390, height: 844 }); await settle();
    await picPage.screenshot({ path: path.join(scratchDir, 'agenda-c3-1-rsvp-mobile-390.png') });
    await picPage.setViewport({ width: 1440, height: 900 }); await settle();
    await picPage.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark')); await settle();
    await picPage.screenshot({ path: path.join(scratchDir, 'agenda-c3-1-rsvp-desktop-dark.png') });
    await picPage.evaluate(() => document.documentElement.setAttribute('data-theme', 'light')); await settle();

    await clickRetry(picPage, '[data-drawer-action="event:rsvp:accepted"]');
    await picPage.waitForFunction(() => document.querySelector('[data-drawer-action="event:rsvp:accepted"]')?.getAttribute('aria-pressed') === 'true', { timeout: 10000 });
    await checkAsync('click Hadir -> RTDB participants.status = accepted, UI shows Hadir as active', async () => {
      const snap = await db.ref(`agendaEvents/${eventId}/participants/${PIC}/status`).once('value');
      if (snap.val() !== 'accepted') throw new Error(`RTDB status: ${snap.val()}`);
      const pressed = await picPage.evaluate(() => document.querySelector('[data-drawer-action="event:rsvp:accepted"]').getAttribute('aria-pressed'));
      if (pressed !== 'true') throw new Error(`aria-pressed: ${pressed}`);
    });

    const eventBeforeRsvp2 = await db.ref(`agendaEvents/${eventId}`).once('value');
    await clickRetry(picPage, '[data-drawer-action="event:rsvp:tentative"]');
    await picPage.waitForFunction(() => document.querySelector('[data-drawer-action="event:rsvp:tentative"]')?.getAttribute('aria-pressed') === 'true', { timeout: 10000 });
    await checkAsync('click Tentatif -> only MY status changed; title/date/location/organizer/PIC/other participants unchanged', async () => {
      const snap = await db.ref(`agendaEvents/${eventId}`).once('value');
      const rec = snap.val();
      if (rec.participants[PIC].status !== 'tentative') throw new Error(`my status: ${rec.participants[PIC].status}`);
      const before = eventBeforeRsvp2.val();
      for (const k of ['title', 'date', 'location', 'organizerUsername', 'startAt', 'endAt']) {
        if (rec[k] !== before[k]) throw new Error(`field ${k} changed: ${before[k]} -> ${rec[k]}`);
      }
      if (rec.participants[PIC].isPic !== true) throw new Error('my own isPic changed');
      if (JSON.stringify(rec.participants[DRIVER]) !== JSON.stringify(before.participants[DRIVER])) throw new Error("driver's participant entry changed");
    });
    await picCtx.close();

    // ================================================================
    console.log('\n=== [14b] e2eDriver (ordinary, non-PIC, role=driver): real signed-in negative security test ===');
    // ================================================================
    const drvCtx = await browser.createBrowserContext();
    const drvPage = await drvCtx.newPage();
    currentPage = drvPage;
    await drvPage.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
    await drvPage.waitForFunction(() => document.body.classList.contains('app-ready'), { timeout: 20000 });
    await drvPage.evaluate(async (token) => { const fb = await import('/js/firebase.js'); await fb.signInWithToken(token); }, driverToken);
    await drvPage.waitForFunction(() => {
      try { return JSON.parse(localStorage.getItem('pbsi_current_user') || 'null')?.username === 'e2eDriver'; } catch { return false; }
    }, { timeout: 20000 });

    await checkAsync('e2eDriver: real signed-in browser session, RSVP self-write (via the real exported store function) SUCCEEDS', async () => {
      const ok = await drvPage.evaluate(async (id) => {
        const store = await import('/js/agenda/agenda-store.js');
        try { await store.setMyRsvpStatus(id, 'declined'); return true; } catch (e) { return `denied:${e.message}`; }
      }, eventId);
      if (ok !== true) throw new Error(`expected success, got ${ok}`);
      const snap = await db.ref(`agendaEvents/${eventId}/participants/${DRIVER}/status`).once('value');
      if (snap.val() !== 'declined') throw new Error(`RTDB status: ${snap.val()}`);
    });

    await checkAsync('e2eDriver: real signed-in browser session cannot write agendaAudit (.write:false, unconditionally, for every identity — a control case proving Rules enforcement is genuinely active for THIS connection, not just the RSVP grant specifically)', async () => {
      const result = await drvPage.evaluate(async () => {
        const fb = await import('/js/firebase.js');
        try { await fb.storeFirebaseData('agendaAudit/e2eDriverForgedCanary', { forged: true }); return 'allowed'; }
        catch (e) { return `denied:${e.message}`; }
      });
      if (result === 'allowed') throw new Error('agendaAudit write was NOT denied — Rules enforcement is not active for this connection');
    });

    await checkAsync('e2eDriver: real signed-in browser session, direct title mutation via the real exported store function DENIED', async () => {
      const result = await drvPage.evaluate(async (id) => {
        const store = await import('/js/agenda/agenda-store.js');
        try { await store.updateEvent(id, { title: 'HACKED BY DRIVER' }); return 'allowed'; }
        catch (e) { return `denied:${e.message}`; }
      }, eventId);
      if (result === 'allowed') throw new Error('mutation was NOT denied');
      const snap = await db.ref(`agendaEvents/${eventId}/title`).once('value');
      if (snap.val() === 'HACKED BY DRIVER') throw new Error('title was actually mutated in RTDB despite the client call rejecting');
    });
    await drvCtx.close();

    // ================================================================
    console.log('\n=== [15] Listener lifecycle: mount-once, mode-switch and repeat-mount do not multiply subscriptions ===');
    // ================================================================
    await checkAsync('mode-switching (Agenda→Kalender→To-Do→Agenda) creates zero new onValue subscriptions', async () => {
      const before = await orgPage.evaluate(() => window.__onValueCallCount || 0);
      await clickRetry(orgPage, '[data-agenda-action="set-mode:calendar"]');
      await orgPage.waitForSelector('.cal-grid', { timeout: 5000 });
      await clickRetry(orgPage, '[data-agenda-action="set-mode:todo"]');
      await orgPage.waitForSelector('[data-agenda-action="set-todo-status:all"]', { timeout: 5000 });
      await clickRetry(orgPage, '[data-agenda-action="set-mode:agenda"]');
      await new Promise((r) => setTimeout(r, 300));
      const after = await orgPage.evaluate(() => window.__onValueCallCount || 0);
      if (after !== before) throw new Error(`onValue count grew from ${before} to ${after} on pure mode-switching (no Firebase listener should be created by a view-mode change)`);
    });
    await checkAsync('repeated real mount/pause cycles (leave Today, return — via the REAL exported mount/pause functions) do not multiply subscriptions, matching the documented "session-lived, pause re-render only" architecture', async () => {
      const before = await orgPage.evaluate(() => window.__onValueCallCount || 0);
      for (let i = 0; i < 5; i++) {
        await orgPage.evaluate(async () => {
          const ws = await import('/js/agenda/agenda-workspace.js');
          ws.closeAgendaWorkspace();
          ws.mountAgendaWorkspace();
        });
      }
      await new Promise((r) => setTimeout(r, 300));
      const after = await orgPage.evaluate(() => window.__onValueCallCount || 0);
      if (after !== before) throw new Error(`onValue count grew from ${before} to ${after} across 5 close/mount cycles — initAgendaStore()'s _initialized guard should make this a true no-op, matching Petty Cash/Overtime/Engineering's own documented pattern`);
      console.log(`      (bounded at ${after} live onValue subscriptions across the whole run — not growing, as documented: subscriptions are intentionally session-lived, only re-render registration pauses)`);
    });

    // ================================================================
    console.log('\n=== [16] Integration hardening: PDF export, real click-through, against the REAL RTDB-created event/task ===');
    // ================================================================
    {
      const diag = await orgPage.evaluate(() => {
        const el = document.querySelector('[data-agenda-action="export-pdf"]');
        if (!el) return { found: false };
        const r = el.getBoundingClientRect();
        return { found: true, rect: { x: r.x, y: r.y, width: r.width, height: r.height }, visible: !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length), scrollY: window.scrollY, bodyScrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth };
      });
      console.log('  [diag] export-pdf button state:', JSON.stringify(diag));
    }
    await clickRetry(orgPage, '[data-agenda-action="export-pdf"]');
    await orgPage.waitForSelector('[data-drawer-action^="export:preset:"]', { timeout: 10000 });
    // rolling_week (today..today+6), not the default this_week — robust
    // regardless of which weekday this suite happens to run on (the
    // created event/task are dated "tomorrow"; a Monday-first "this_week"
    // preset would miss them if today is a Sunday).
    await clickRetry(orgPage, '[data-drawer-action="export:preset:rolling_week"]');
    await clickRetry(orgPage, '[data-drawer-action="export:generate"]');
    await checkAsync('clicking "Buat PDF" runs the real pipeline end to end and opens the real document viewer (real pdfmake from cdnjs, not a mock)', async () => {
      await orgPage.waitForSelector('#docvFrame', { timeout: 20000 });
      const src = await orgPage.evaluate(() => document.getElementById('docvFrame').src);
      if (!src || !src.startsWith('blob:')) throw new Error(`expected a real blob: object URL, got "${src}"`);
    });
    await orgPage.screenshot({ path: path.join(ROOT, 'scratch', 'agenda-c3-1-pdf-export-viewer.png') });

    await checkAsync('the PDF identity transform holds against the REAL RTDB-created event/task (Sarpras staff dropped, non-Sarpras participant kept)', async () => {
      const resultJson = await orgPage.evaluate(async () => {
        const { buildAgendaPdfViewModel } = await import('/js/agenda/agenda-pdf-view-model.js');
        const { resolvePresetRange } = await import('/js/agenda/agenda-date-range.js');
        const store = await import('/js/agenda/agenda-store.js');
        const dir = await import('/js/agenda/agenda-directory.js');
        const events = store.getVisibleEvents();
        const tasks = store.getVisibleTasks();
        const usernames = new Set();
        events.forEach((e) => Object.keys(e.participants || {}).forEach((u) => usernames.add(u)));
        tasks.forEach((t) => Object.keys(t.responsible || {}).forEach((u) => usernames.add(u)));
        const directory = {};
        usernames.forEach((u) => { directory[u] = { displayName: dir.displayNameFor(u), class: dir.resolveParticipantClass(u) }; });
        const range = resolvePresetRange('rolling_week');
        const vm = buildAgendaPdfViewModel({ events, tasks, range, filters: { mode: 'semua' }, directory, now: Date.now() });
        return JSON.stringify(vm);
      });
      if (resultJson.includes('e2eOrganizer') || resultJson.includes('E2E Organizer')) throw new Error('organizer identity leaked into the real-data view-model');
      if (resultJson.includes('e2ePic') || resultJson.includes('E2E Pic')) throw new Error('PIC identity leaked into the real-data view-model');
      if (!resultJson.includes('"hasSarprasTeam":true')) throw new Error('expected the Sarpras-staff collapse flag on the real created event');
      if (!resultJson.includes('e2eDriver')) throw new Error('expected the non-Sarpras (role=driver, unclassified) participant to be shown individually, not collapsed');
    });

    await clickRetry(orgPage, '#docvClose');
    await orgPage.waitForFunction(() => !document.getElementById('docvOverlay')?.classList.contains('open'), { timeout: 5000 }).catch(() => {});

    // ================================================================
    console.log('\n=== [17] V1.31 Kabid invitation: Sarpras organizer invites Leo + Kabid via the REAL picker (§13) ===');
    // ================================================================
    const kabidEventTitle = `E2E Rapat Lintas Bagian ${Date.now()}`;
    await clickRetry(orgPage, '[data-agenda-action="create-event"]');
    await orgPage.waitForSelector('[data-drawer-body] [data-field="title"]', { timeout: 10000 });
    await orgPage.type('[data-field="title"]', kabidEventTitle, { delay: 5 });
    await orgPage.$eval('[data-field="date"]', (el, v) => { el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); }, dateStr);
    await orgPage.$eval('[data-field="startTime"]', (el) => { el.value = '13:00'; el.dispatchEvent(new Event('change', { bubbles: true })); });
    await orgPage.$eval('[data-field="endTime"]', (el) => { el.value = '14:00'; el.dispatchEvent(new Event('change', { bubbles: true })); });
    await orgPage.type('[data-field="location"]', 'Ruang Lintas Bagian', { delay: 5 });

    await clickRetry(orgPage, '[data-drawer-action="picker:open"]');
    await orgPage.waitForSelector(`[data-drawer-action="picker:toggle:${LEO}"]`, { timeout: 10000 });
    await checkAsync('the REAL picker shows BOTH the second Sarpras candidate (Leo) and the Kabid candidate, resolved from real /userProfiles + /customRoles — reproduces the reported "Leo missing" scenario against real data, root-caused as the picker not reacting to late directory data (fixed this phase)', async () => {
      const hasLeo = await orgPage.evaluate((u) => !!document.querySelector(`[data-drawer-action="picker:toggle:${u}"]`), LEO);
      const hasKabid = await orgPage.evaluate((u) => !!document.querySelector(`[data-drawer-action="picker:toggle:${u}"]`), KABID);
      if (!hasLeo) throw new Error('Leo candidate row not found in the real picker');
      if (!hasKabid) throw new Error('Kabid candidate row not found in the real picker');
    });
    await checkAsync('the real picker groups candidates under SARPRAS and KABID / UNDANGAN headers (§3, §15)', async () => {
      const text = await orgPage.evaluate(() => document.querySelector('[data-drawer-body]')?.textContent || '');
      if (!text.includes('SARPRAS')) throw new Error('SARPRAS group header missing');
      if (!text.includes('KABID')) throw new Error('KABID group header missing');
    });
    await clickRetry(orgPage, `[data-drawer-action="picker:toggle:${LEO}"]`);
    await orgPage.waitForSelector(`[data-drawer-action="picker:togglepic:${LEO}"]:not([disabled])`, { timeout: 5000 });
    await clickRetry(orgPage, `[data-drawer-action="picker:togglepic:${LEO}"]`);
    await clickRetry(orgPage, `[data-drawer-action="picker:toggle:${KABID}"]`);
    await clickRetry(orgPage, '[data-drawer-action="picker:done"]');
    await orgPage.waitForSelector('[data-drawer-body] [data-field="title"]', { timeout: 5000 });

    await clickRetry(orgPage, '[data-drawer-action="event:save"]');
    await orgPage.waitForFunction(() => !document.getElementById('appDrawerOverlay'), { timeout: 15000 });

    let kabidEventId = null;
    await checkAsync('the cross-scope event landed as ONE canonical /agendaEvents record — scope stays sarpras_shared, Leo is PIC, Kabid is a plain invited participant (§4, §11, §12-H)', async () => {
      const snap = await db.ref('agendaEvents').orderByChild('title').equalTo(kabidEventTitle).once('value');
      const val = snap.val();
      if (!val) throw new Error('event not found in RTDB');
      const ids = Object.keys(val);
      if (ids.length !== 1) throw new Error(`expected exactly one record for this title, found ${ids.length} (§12-J no-duplicate-event)`);
      kabidEventId = ids[0];
      const rec = val[kabidEventId];
      if (rec.scope !== 'sarpras_shared') throw new Error(`scope drifted: ${rec.scope}`);
      if (!rec.participants || rec.participants[LEO]?.isPic !== true) throw new Error(`participants.${LEO}.isPic not true: ${JSON.stringify(rec.participants)}`);
      if (!rec.participants[KABID] || rec.participants[KABID].isPic === true) throw new Error(`participants.${KABID} wrong: ${JSON.stringify(rec.participants && rec.participants[KABID])}`);
    });

    await checkAsync('trigger logic (fed the real cross-scope record) produces one audit row + populates BOTH agendaEventsByUser entries + the scope-widened agendaEventsByScope/kabid index — the SAME mechanism that makes the event visible in Kabid\'s calendar, no client-side copy, no second event (§5, §12-I)', async () => {
      const eventSnap = await db.ref(`agendaEvents/${kabidEventId}`).once('value');
      const rec = eventSnap.val();
      await onAgendaEventWrite.run(makeChangeEvent({ params: { eventId: kabidEventId }, before: null, after: rec, time: rec.createdAt }));
      await onAgendaEventIndexSync.run(makeChangeEvent({ params: { eventId: kabidEventId }, before: null, after: rec, time: rec.createdAt }));
      await onAgendaEventReminderSync.run(makeChangeEvent({ params: { eventId: kabidEventId }, before: null, after: rec, time: rec.createdAt }));
      const auditSnap = await db.ref('agendaAudit').orderByChild('entityId').equalTo(kabidEventId).once('value');
      const rows = Object.values(auditSnap.val() || {});
      if (rows.length !== 1 || rows[0].action !== 'created') throw new Error(`audit: got ${JSON.stringify(rows)}`);
      const byUserLeo = await db.ref(`agendaEventsByUser/${LEO}/${kabidEventId}`).once('value');
      const byUserKabid = await db.ref(`agendaEventsByUser/${KABID}/${kabidEventId}`).once('value');
      const byScopeShared = await db.ref(`agendaEventsByScope/sarpras_shared/${kabidEventId}`).once('value');
      const byScopeKabid = await db.ref(`agendaEventsByScope/kabid/${kabidEventId}`).once('value');
      if (!byUserLeo.exists()) throw new Error('agendaEventsByUser/Leo missing');
      if (!byUserKabid.exists()) throw new Error("agendaEventsByUser/Kabid missing — this is the SAME index that makes the event visible in Kabid's own calendar; no second write path exists for it");
      if (!byScopeShared.exists()) throw new Error('agendaEventsByScope/sarpras_shared missing');
      if (!byScopeKabid.exists()) throw new Error('agendaEventsByScope/kabid missing — the existing scope-widening logic in onAgendaEventIndexSync.js should index a Kabid participant into the kabid scope bucket too');
      const remId = agendaReminderId('agendaEvent', kabidEventId, 'h1');
      const rem = await db.ref(`reminders/${remId}`).once('value');
      if (!rem.exists()) throw new Error('h1 reminder row missing for the cross-scope event');
    });

    // ================================================================
    console.log('\n=== [18] Kabid session: REAL sign-in, calendar visibility, RSVP (§13, §7, §12-K) ===');
    // ================================================================
    const kabidCtx = await browser.createBrowserContext();
    const kabidPage = await kabidCtx.newPage();
    currentPage = kabidPage;
    kabidPage.on('pageerror', (e) => console.log('  [kabid page error]', e.message));
    await kabidPage.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
    await kabidPage.waitForFunction(() => document.body.classList.contains('app-ready'), { timeout: 20000 });
    await kabidPage.evaluate(async (token) => { const fb = await import('/js/firebase.js'); await fb.signInWithToken(token); }, kabidToken);
    await kabidPage.waitForFunction(() => {
      try { return JSON.parse(localStorage.getItem('pbsi_current_user') || 'null')?.username === 'e2eKabid'; } catch { return false; }
    }, { timeout: 20000 });
    await checkAsync('Kabid: real signInWithToken() against the Auth emulator -> real onAuthStateChanged hydration, Custom Role session (no new system role)', async () => {
      const u = await kabidPage.evaluate(() => JSON.parse(localStorage.getItem('pbsi_current_user')));
      if (u.username !== KABID || u.role !== KABID_ROLE_ID) throw new Error(`got ${JSON.stringify(u)}`);
    });

    await kabidPage.waitForFunction((title) => document.body.textContent.includes(title), { timeout: 20000 }, kabidEventTitle);
    await checkAsync("the SAME canonical event (created by the Sarpras organizer) is visible on Kabid's own real Agenda list — through the existing scope-index subscription, no duplicate record, no client-side copy (§5, §12-I)", async () => {
      const visible = await kabidPage.evaluate((title) => document.body.textContent.includes(title), kabidEventTitle);
      if (!visible) throw new Error('event title not visible in Kabid session DOM');
    });
    await kabidPage.screenshot({ path: path.join(ROOT, 'scratch', 'agenda-v1.31-kabid-agenda-visible.png') }).catch(() => {});
    await clickRetry(kabidPage, '[data-agenda-action="set-mode:calendar"]');
    await kabidPage.waitForSelector('.cal-grid', { timeout: 5000 });
    // Month view is deliberately dot/count-only (agenda-view-calendar.js's
    // own header — no title text fits a 390px month cell), so the title
    // check needs Week view, which renders real event labels per day.
    await clickRetry(kabidPage, '[data-agenda-action="set-calview:week"]');
    await checkAsync("the event also appears through Kabid's real Calendar view (same canonical record, different surface) (§13)", async () => {
      const visible = await kabidPage.evaluate((title) => document.body.textContent.includes(title), kabidEventTitle);
      if (!visible) throw new Error('event title not visible in Kabid Calendar view');
    });
    await clickRetry(kabidPage, '[data-agenda-action="set-mode:agenda"]');

    await kabidPage.waitForSelector(`[data-agenda-action="open-event:${kabidEventId}"]`, { timeout: 10000 });
    await clickRetry(kabidPage, `[data-agenda-action="open-event:${kabidEventId}"]`);
    await kabidPage.waitForSelector('.cal-rsvp-buttons', { timeout: 10000 });
    await checkAsync('invited Kabid gets the SAME participant RSVP block as any other participant — no new schema (§7)', async () => {
      const hint = await kabidPage.evaluate(() => document.querySelector('[data-rsvp-hint]')?.textContent || '');
      if (!hint.includes('belum merespons')) throw new Error(`got hint: "${hint}"`);
      const picBadge = await kabidPage.evaluate(() => !!document.querySelector('.cal-pill--pic'));
      if (picBadge) throw new Error('Kabid was invited as a plain participant, not PIC — no PIC badge should render');
    });
    await clickRetry(kabidPage, '[data-drawer-action="event:rsvp:accepted"]');
    await kabidPage.waitForFunction(() => document.querySelector('[data-drawer-action="event:rsvp:accepted"]')?.getAttribute('aria-pressed') === 'true', { timeout: 10000 });
    await checkAsync('Kabid clicking Hadir writes participants.status = accepted on the SAME canonical record via the existing RSVP write path — Kabid can update own RSVP (§7, §12-K)', async () => {
      const snap = await db.ref(`agendaEvents/${kabidEventId}/participants/${KABID}/status`).once('value');
      if (snap.val() !== 'accepted') throw new Error(`RTDB status: ${snap.val()}`);
    });
    await kabidPage.keyboard.press('Escape').catch(() => {});
    await orgPage.waitForFunction(() => !document.getElementById('appDrawerOverlay'), { timeout: 5000 }).catch(() => {});

    // ================================================================
    console.log('\n=== [19] Security (§8, §14, §12-L): existing scope model holds for a real authenticated session, no new bypass ===');
    // ================================================================
    await checkAsync('Kabid CANNOT read an unrelated sarpras_shared event they are not a participant/organizer of (the original [9/10] event) — no blanket admin-style access granted to the Kabid role', async () => {
      const result = await kabidPage.evaluate(async (id) => {
        const fb = await import('/js/firebase.js');
        return fb.readNode(`agendaEvents/${id}`);
      }, eventId);
      if (result.status !== 'denied') throw new Error(`expected denied, got ${JSON.stringify(result)}`);
    });

    // ================================================================
    console.log('\n=== [20] Kabid-created event: Kabid becomes organizer of a genuinely private kabid-scope event (§6, §14) ===');
    // ================================================================
    const kabidOwnTitle = `E2E Rapat Internal Kabid ${Date.now()}`;
    await clickRetry(kabidPage, '[data-agenda-action="create-event"]');
    await kabidPage.waitForSelector('[data-drawer-body] [data-field="title"]', { timeout: 10000 });
    await checkAsync("Kabid's own create-event drawer defaults to (and only offers) the kabid scope — writableScopes() derived from the SAME agenda.kabid.manage permission, no new role invented (§6)", async () => {
      const scopeVisible = await kabidPage.evaluate(() => !!document.querySelector('[data-field="scope"]'));
      if (scopeVisible) throw new Error('a scope selector rendered — Kabid should only have one writable scope, so it should stay hidden');
    });
    await kabidPage.type('[data-field="title"]', kabidOwnTitle, { delay: 5 });
    await kabidPage.$eval('[data-field="date"]', (el, v) => { el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); }, dateStr);
    await kabidPage.$eval('[data-field="startTime"]', (el) => { el.value = '15:00'; el.dispatchEvent(new Event('change', { bubbles: true })); });
    await kabidPage.$eval('[data-field="endTime"]', (el) => { el.value = '16:00'; el.dispatchEvent(new Event('change', { bubbles: true })); });
    await clickRetry(kabidPage, '[data-drawer-action="event:save"]');
    await kabidPage.waitForFunction(() => !document.getElementById('appDrawerOverlay'), { timeout: 15000 });

    let kabidOwnEventId = null;
    await checkAsync('Kabid-organized event landed as ONE canonical record with scope=kabid, organizer=Kabid — same event model, same write path as the Sarpras flow (§6)', async () => {
      const snap = await db.ref('agendaEvents').orderByChild('title').equalTo(kabidOwnTitle).once('value');
      const val = snap.val();
      if (!val) throw new Error('event not found in RTDB');
      const ids = Object.keys(val);
      if (ids.length !== 1) throw new Error(`expected exactly one record, found ${ids.length}`);
      kabidOwnEventId = ids[0];
      const rec = val[kabidOwnEventId];
      if (rec.scope !== 'kabid') throw new Error(`scope: expected kabid, got ${rec.scope}`);
      if (rec.organizerUsername !== KABID) throw new Error(`organizer: expected ${KABID}, got ${rec.organizerUsername}`);
    });

    await checkAsync("an UNRELATED Sarpras admin (e2ePic — not a participant, not organizer) CANNOT read Kabid's private kabid-scope event — the existing scope boundary holds for a real authenticated session, not just the Rules-unit-test suite (§14, §12-L)", async () => {
      const kabidPicCtx = await browser.createBrowserContext();
      const kabidPicPage = await kabidPicCtx.newPage();
      try {
        await kabidPicPage.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
        await kabidPicPage.waitForFunction(() => document.body.classList.contains('app-ready'), { timeout: 20000 });
        await kabidPicPage.evaluate(async (token) => { const fb = await import('/js/firebase.js'); await fb.signInWithToken(token); }, picToken);
        await kabidPicPage.waitForFunction(() => {
          try { return JSON.parse(localStorage.getItem('pbsi_current_user') || 'null')?.username === 'e2ePic'; } catch { return false; }
        }, { timeout: 20000 });
        const result = await kabidPicPage.evaluate(async (id) => {
          const fb = await import('/js/firebase.js');
          return fb.readNode(`agendaEvents/${id}`);
        }, kabidOwnEventId);
        if (result.status !== 'denied') throw new Error(`expected denied, got ${JSON.stringify(result)}`);
      } finally {
        await kabidPicCtx.close();
      }
    });
    await kabidCtx.close();

  } catch (err) {
    console.error('\n[FATAL]', err.stack || err.message);
    if (currentPage) {
      try {
        const dumpDir = path.join(ROOT, 'scratch');
        if (!fs.existsSync(dumpDir)) fs.mkdirSync(dumpDir, { recursive: true });
        await currentPage.screenshot({ path: path.join(dumpDir, 'agenda-c3-1-FAILURE.png') });
        const html = await currentPage.evaluate(() => document.body.innerHTML.slice(0, 20000));
        fs.writeFileSync(path.join(dumpDir, 'agenda-c3-1-FAILURE.html'), html);
        console.error('[FATAL] dumped scratch/agenda-c3-1-FAILURE.png + .html');
      } catch (dumpErr) { console.error('[FATAL] could not dump diagnostics:', dumpErr.message); }
    }
    throw err;
  } finally {
    await browser.close();
    server.close();
  }

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });
