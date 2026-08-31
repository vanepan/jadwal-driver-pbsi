/* overnight-conflict-dom-check.mjs — V1 ADDITION, Phase 1.

   REAL runtime test (headless Chromium) of the datetime-span rewrite of
   checkConflict / checkVehicleConflict in js/assignments.js. These are the
   riskiest Phase 1 change: they dropped the `a.date !== date` early-return
   and now compare the FULL datetime span (via assignmentSpan, the single
   source of truth) so an overnight window is measured to its real end
   instant on the next calendar day.

   Verifies BOTH that same-day behaviour is unchanged AND that overnight /
   cross-midnight overlaps are now detected.

   Run: node scripts/overnight-conflict-dom-check.mjs   (exit 0 = all pass)
*/

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); if (detail !== undefined) console.log('     ' + JSON.stringify(detail)); }
};

const MIME = { '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, r));
const port = server.address().port;

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|favicon|firebase|permission_denied|network/i.test(m.text())) errs.push('err: ' + m.text().slice(0, 200)); });

await page.goto(`http://localhost:${port}/scripts/overnight-conflict-harness.html`, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForFunction('window.__ready === true', { timeout: 30000 });

/* Each case: seed the module's assignment list, then ask checkConflict()
   for a candidate window. `expect` is the expected boolean. */
async function conflict({ seed, driver = 'Budi', start, end, date, excludeId = null }) {
  return page.evaluate((seed, driver, start, end, date, excludeId) => {
    window.__a.setAssignments(seed);
    return window.__a.checkConflict(driver, start, end, date, excludeId);
  }, seed, driver, start, end, date, excludeId);
}
async function vehicleConflict({ seed, vehicle = 'B 1234 XY', start, end, date, excludeId = null }) {
  return page.evaluate((seed, vehicle, start, end, date, excludeId) => {
    window.__a.setAssignments(seed);
    return window.__a.checkVehicleConflict(vehicle, start, end, date, excludeId);
  }, seed, vehicle, start, end, date, excludeId);
}

const A = (o) => ({
  id: o.id || ('a' + Math.random().toString(36).slice(2)),
  driver: o.driver ?? 'Budi', vehicle: o.vehicle ?? 'B 1234 XY',
  date: o.date, startTime: o.startTime, endTime: o.endTime,
  status: o.status ?? 'assigned',
});

console.log('\n[1 — same-day behaviour is UNCHANGED]');
check('same-day overlap → conflict',
  await conflict({ seed: [A({ date: '2026-09-01', startTime: '09:00', endTime: '12:00' })], start: '10:00', end: '14:00', date: '2026-09-01' }) === true);
check('same-day, back-to-back (no overlap) → no conflict',
  await conflict({ seed: [A({ date: '2026-09-01', startTime: '09:00', endTime: '12:00' })], start: '12:00', end: '15:00', date: '2026-09-01' }) === false);
check('same time window, DIFFERENT driver → no conflict',
  await conflict({ seed: [A({ driver: 'Andi', date: '2026-09-01', startTime: '09:00', endTime: '12:00' })], driver: 'Budi', start: '09:00', end: '12:00', date: '2026-09-01' }) === false);
check('overlapping but the existing one is CANCELLED → no conflict',
  await conflict({ seed: [A({ date: '2026-09-01', startTime: '09:00', endTime: '12:00', status: 'cancelled' })], start: '10:00', end: '11:00', date: '2026-09-01' }) === false);
check('overlapping but it is the SAME assignment being edited (excludeId) → no conflict',
  await conflict({ seed: [A({ id: 'edit-me', date: '2026-09-01', startTime: '09:00', endTime: '12:00' })], start: '09:30', end: '11:30', date: '2026-09-01', excludeId: 'edit-me' }) === false);

console.log('\n[2 — adjacent calendar days no longer falsely skip, but still do not falsely collide]');
check('two plain same-day windows one day apart → no conflict',
  await conflict({ seed: [A({ date: '2026-09-01', startTime: '09:00', endTime: '17:00' })], start: '09:00', end: '17:00', date: '2026-09-02' }) === false);
check('Sep-1 evening 20:00–23:59 vs Sep-2 morning 00:00–04:00 → no conflict (1-min gap, genuinely disjoint)',
  await conflict({ seed: [A({ date: '2026-09-01', startTime: '20:00', endTime: '23:59' })], start: '00:00', end: '04:00', date: '2026-09-02' }) === false);

console.log('\n[3 — NEW: cross-midnight overlaps ARE detected]');
check('NEW overnight 23:30→01:30 (Sep-1) vs EXISTING Sep-2 00:30–02:00 → conflict',
  await conflict({ seed: [A({ date: '2026-09-02', startTime: '00:30', endTime: '02:00' })], start: '23:30', end: '01:30', date: '2026-09-01' }) === true);
check('EXISTING overnight 23:30→01:30 (Sep-1) vs NEW Sep-2 01:00–03:00 → conflict',
  await conflict({ seed: [A({ date: '2026-09-01', startTime: '23:30', endTime: '01:30' })], start: '01:00', end: '03:00', date: '2026-09-02' }) === true);
check('NEW overnight 23:30→01:30 (Sep-1) vs EXISTING same-night 22:00–23:00 → no conflict (disjoint)',
  await conflict({ seed: [A({ date: '2026-09-01', startTime: '22:00', endTime: '23:00' })], start: '23:30', end: '01:30', date: '2026-09-01' }) === false);
check('NEW overnight 23:30→01:30 (Sep-1) vs EXISTING same-night 21:00–23:45 → conflict (overlaps 23:30–23:45)',
  await conflict({ seed: [A({ date: '2026-09-01', startTime: '21:00', endTime: '23:45' })], start: '23:30', end: '01:30', date: '2026-09-01' }) === true);
check('two overnight windows on consecutive start dates that do NOT actually overlap → no conflict',
  await conflict({ seed: [A({ date: '2026-09-01', startTime: '23:00', endTime: '02:00' })], start: '23:30', end: '01:00', date: '2026-09-02' }) === false);
check('overnight overlap but DIFFERENT driver → no conflict',
  await conflict({ seed: [A({ driver: 'Andi', date: '2026-09-02', startTime: '00:30', endTime: '02:00' })], driver: 'Budi', start: '23:30', end: '01:30', date: '2026-09-01' }) === false);
check('overnight overlap but the existing one is CANCELLED → no conflict',
  await conflict({ seed: [A({ date: '2026-09-02', startTime: '00:30', endTime: '02:00', status: 'cancelled' })], start: '23:30', end: '01:30', date: '2026-09-01' }) === false);

console.log('\n[4 — checkVehicleConflict mirrors the same datetime-span logic]');
check('overnight vehicle double-book across midnight → conflict',
  await vehicleConflict({ seed: [A({ vehicle: 'B 1234 XY', date: '2026-09-02', startTime: '00:30', endTime: '02:00' })], vehicle: 'B 1234 XY', start: '23:30', end: '01:30', date: '2026-09-01' }) === true);
check('overnight, DIFFERENT vehicle → no conflict',
  await vehicleConflict({ seed: [A({ vehicle: 'B 9999 ZZ', date: '2026-09-02', startTime: '00:30', endTime: '02:00' })], vehicle: 'B 1234 XY', start: '23:30', end: '01:30', date: '2026-09-01' }) === false);
check('plain same-day vehicle overlap still flagged (unchanged)',
  await vehicleConflict({ seed: [A({ vehicle: 'B 1234 XY', date: '2026-09-01', startTime: '08:00', endTime: '10:00' })], vehicle: 'B 1234 XY', start: '09:00', end: '11:00', date: '2026-09-01' }) === true);

check('no unexpected console errors', errs.length === 0, errs);

await browser.close();
server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
