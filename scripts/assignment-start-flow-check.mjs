/* assignment-start-flow-check.mjs — V1 bug fix (Driver "Mulai Tugas"
   first-click).

   REPORTED: pressing "Mulai Tugas" did not start the assignment on the
   first pass — the driver had to open it, enter the odometer, and press
   "Mulai Tugas" AGAIN before the trip went active.

   ROOT CAUSE (traced): the modal → odometer → confirm → start-callback
   chain is functionally correct and fires the start action EXACTLY ONCE
   on the first confirm (this test proves it). The remaining failure was
   in js/app.js's registerStartCallback / registerCompleteCallback: a
   silent `if (idx === -1) return;` when this module's own `assignments`
   array was momentarily out of sync (a Firebase snapshot landing between
   opening the drawer and confirming the odometer) — no toast, nothing,
   exactly "the first click did nothing." Plus the odometer confirm button
   read "Mulai Assignment" — a second copy of the drawer's own "Mulai
   Tugas" CTA.

   FIX: modal.js threads the resolved assignment object through the
   start/complete callbacks as a 3rd arg; app.js uses it as a fallback so
   the FIRST confirm always takes effect (and never bails silently — it
   toasts if the trip is genuinely unresolvable). Confirm button relabelled
   "Konfirmasi & Mulai".

   Browser test — js/modal.js can't load under plain Node (transitive
   Firebase import). Deterministic.
   Run: node scripts/assignment-start-flow-check.mjs   (exit 0 = pass) */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const check = (name, cond, detail) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); if (detail !== undefined) console.log('     ' + JSON.stringify(detail)); } };

const MIME = { '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, r));
const port = server.address().port;
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
page.on('console', m => { const t = m.text(); if (m.type() === 'error' && !/permission_denied|Failed to load resource|firebase|gstatic/i.test(t)) errs.push('err: ' + t.slice(0, 200)); });
await page.setViewport({ width: 1100, height: 850 });
await page.evaluateOnNewDocument(() => {
  window.AUTH_DIRECT_PIN = true;
  localStorage.setItem('pbsi_auth_direct_pin', 'true');
  localStorage.setItem('pbsi_current_user', JSON.stringify({ id: 'd1', username: 'budi', name: 'Budi', role: 'driver', active: true }));
});
await page.goto(`http://localhost:${port}/scripts/assignment-start-flow-harness.html`, { waitUntil: 'networkidle2', timeout: 45000 });
await new Promise(r => setTimeout(r, 1500));

const out = await page.evaluate(async () => {
  const log = [];
  const modal = await import('/js/modal.js');
  const today = new Date().toISOString().slice(0, 10);
  const asg = {
    id: 'A1', driver: 'Budi', vehicle: 'Avanza 1', date: today,
    startTime: '08:00', endTime: '17:00', destination: 'Test', purpose: 'Test', status: 'assigned', pax: 1,
  };
  modal.setAssignments([asg]);

  // Spy on the start callback: record every invocation + its args.
  const calls = [];
  modal.registerStartCallback((id, odo, assignment) => {
    calls.push({ id, odo: JSON.parse(JSON.stringify(odo || {})), gotAssignment: !!assignment, assignmentId: assignment && assignment.id });
    // mimic app.js: transition the trip
    asg.status = 'started';
    asg.startOdometer = odo && odo.startOdometer != null ? odo.startOdometer : null;
  });
  modal.initModalHandlers();

  // ── FIRST attempt: open → "Mulai Tugas" → odometer → confirm ──
  modal.openDetailModal('A1');
  await new Promise(r => setTimeout(r, 300));
  const drawer = document.getElementById('appDrawerOverlay');
  const startBtn = drawer && drawer.querySelector('[data-drawer-action="start"]');
  log.push('drawer opened + start btn shown: ' + !!(startBtn && getComputedStyle(startBtn).display !== 'none'));

  startBtn.click(); // ONE click
  await new Promise(r => setTimeout(r, 400));
  const odo = document.getElementById('modalOdometer');
  const odoShownAfterOneClick = getComputedStyle(odo).display !== 'none';
  const confirmBtn = document.getElementById('btnConfirmOdometer');
  const confirmLabel = confirmBtn.textContent.trim();

  document.getElementById('odoInput').value = '45010';
  document.getElementById('odoInput').dispatchEvent(new Event('input', { bubbles: true }));
  confirmBtn.click(); // ONE confirm click
  await new Promise(r => setTimeout(r, 500));

  return {
    log,
    odoShownAfterOneClick,
    confirmLabel,
    callCount: calls.length,
    firstCall: calls[0] || null,
    statusAfterFirstConfirm: asg.status,
    odoModalClosed: getComputedStyle(odo).display === 'none',
    drawerClosed: !document.getElementById('appDrawerOverlay'),
    odoHint: (document.getElementById('odoHint').textContent || '').trim(),
  };
});

console.log('\n[Driver "Mulai Tugas" — single pass]');
out.log.forEach(l => console.log('   · ' + l));
check('one "Mulai Tugas" click opens the odometer dialog', out.odoShownAfterOneClick === true, out);
check('the odometer confirm button is "Konfirmasi & Mulai" (not a 2nd "Mulai Assignment" CTA)', /Konfirmasi/.test(out.confirmLabel), out.confirmLabel);
check('one odometer confirm click fires the start action EXACTLY ONCE', out.callCount === 1, out);
check('the start callback receives the odometer value on the first confirm', out.firstCall && out.firstCall.odo && out.firstCall.odo.startOdometer === 45010, out.firstCall);
check('the start callback also receives the resolved assignment object (3rd arg — the stale-array fallback)', out.firstCall && out.firstCall.gotAssignment === true && out.firstCall.assignmentId === 'A1', out.firstCall);
check('the assignment is ACTIVE after the FIRST confirm — no second attempt', out.statusAfterFirstConfirm === 'started', out);
check('the odometer dialog and the detail drawer both close on confirm', out.odoModalClosed && out.drawerClosed, out);
check('no validation hint / error was shown for a valid odometer', out.odoHint === '', out.odoHint);
check('no non-permission console/page errors', errs.length === 0, errs);

await browser.close();
server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
