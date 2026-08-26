/* Hotfix verification (not a permanent regression suite). Exercises the
   REAL Assignment Detail drawer (js/modal.js) to prove two fixes:

   1. Reimbursement ownership gate — a driver clicking "Generate Form
      Reimbursement" on an assignment that is NOT theirs must be blocked
      BEFORE printReimbursementForm() is reached (proven by the button never
      flipping to its "Memproses..." busy state); on their OWN assignment it
      must proceed (button DOES flip to "Memproses...").
   2. Accordion spacing — every direct child of .drawer__body (the migrated
      canonical shell) must now be separated by the SAME gap, proving the
      old .accord-section{margin-bottom:8px}/.detail-actions{margin-top:8px}
      double-counting around #accordReimbursement is gone. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.join(REPO, p);
  if (!file.startsWith(REPO) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const url = `http://localhost:${port}/index.html`;

const results = [];
const check = (label, cond, extra) => { results.push({ label, ok: !!cond, extra }); };

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Permission denied|permission_denied/i.test(m.text())) pageErrors.push('console.error: ' + m.text()); });

await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
await new Promise((r) => setTimeout(r, 1500));

// Fake session: a DRIVER named "Budi" — matches auth.js's driverIdentityCandidates()
// (username/name, lowercased) against an assignment's plain `driver` name field.
await page.evaluate(() => {
  localStorage.setItem('pbsi_current_user', JSON.stringify({ id: 'u1', username: 'budi', name: 'Budi', role: 'driver', active: true }));
});

const setup = await page.evaluate(async () => {
  const mod = await import('/js/modal.js');
  const own = { id: 'own-1', driver: 'Budi', phone: '0800', vehicle: 'V1', date: '2026-08-26', startTime: '08:00', endTime: '10:00', fullDay: false, destination: 'X', purpose: 'Y', status: 'assigned', pax: 1 };
  const other = { id: 'other-1', driver: 'Siti', phone: '0800', vehicle: 'V1', date: '2026-08-26', startTime: '08:00', endTime: '10:00', fullDay: false, destination: 'X', purpose: 'Y', status: 'assigned', pax: 1 };
  mod.setAssignments([own, other]);
  return { ok: true };
});
check('test setup: modal.js imported + fixture assignments loaded', setup.ok);

async function openAndClickReimbursement(id) {
  return page.evaluate(async (assignmentId) => {
    const mod = await import('/js/modal.js');
    mod.openDetailModal(assignmentId);
    await new Promise((r) => setTimeout(r, 150));
    // Open the (now-collapsed-by-default) Reimbursement accordion first.
    const header = document.querySelector('#accordReimbursement .accord-header');
    header?.click();
    await new Promise((r) => setTimeout(r, 350)); // accordion max-height transition
    const btn = document.querySelector('[data-drawer-action="reimbursement"]');
    const before = btn ? btn.textContent.trim() : null;
    btn?.click();
    await new Promise((r) => setTimeout(r, 50)); // synchronous state change only — do NOT wait for the async PDF pipeline (no Firebase in this environment)
    const after = document.querySelector('[data-drawer-action="reimbursement"]')?.textContent.trim();
    mod.closeDetailModal();
    await new Promise((r) => setTimeout(r, 350));
    return { before, after, btnExisted: !!btn };
  }, id);
}

const ownResult = await openAndClickReimbursement('own-1');
check('own assignment: reimbursement button exists and is reachable', ownResult.btnExisted);
check('own assignment: click PROCEEDS (button flips to "Memproses...")', /memproses/i.test(ownResult.after || ''), ownResult);

const otherResult = await openAndClickReimbursement('other-1');
check('other driver\'s assignment: click is BLOCKED (button text unchanged, never reaches "Memproses...")', !/memproses/i.test(otherResult.after || '') && otherResult.after === otherResult.before, otherResult);

// ── Accordion spacing: every .drawer__body direct child gets the SAME gap ──
const spacing = await page.evaluate(async () => {
  const mod = await import('/js/modal.js');
  mod.openDetailModal('own-1');
  await new Promise((r) => setTimeout(r, 150));
  const body = document.querySelector('.drawer__body');
  const kids = Array.from(body.children).filter((el) => el.offsetParent !== null || getComputedStyle(el).display !== 'none');
  const gaps = [];
  for (let i = 1; i < kids.length; i++) {
    const prevRect = kids[i - 1].getBoundingClientRect();
    const rect = kids[i].getBoundingClientRect();
    gaps.push(Math.round((rect.top - prevRect.bottom) * 100) / 100);
  }
  mod.closeDetailModal();
  return { gaps, childIds: kids.map((k) => k.id || k.className) };
});
const uniqueGaps = [...new Set(spacing.gaps)];
check(
  'every top-level Assignment-Detail block (incl. reimbursement) is separated by the SAME gap (drawer\'s flex-gap only, no leftover legacy margin)',
  uniqueGaps.length === 1,
  spacing
);

check('zero page/console errors during the whole sequence', pageErrors.length === 0, pageErrors);

console.log('\n--- Reimbursement ownership + accordion spacing verification ---');
let failed = 0;
for (const r of results) {
  console.log(`  ${r.ok ? '✓' : '✗'} ${r.label}${(!r.ok && r.extra !== undefined) ? '  [detail: ' + JSON.stringify(r.extra) + ']' : ''}`);
  if (!r.ok) failed++;
}
console.log(`\n${results.length - failed} passed, ${failed} failed`);

await browser.close();
server.close();
process.exit(failed ? 1 : 0);
