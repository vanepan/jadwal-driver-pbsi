/* timeline-unassigned-lane-check.mjs — V1 UPDATE: Driver Timeline Resource
   Lanes + "Tanpa Driver" (unassigned) lane.

   REAL render test (headless Chromium, real style.css + platform.css) of
   js/timeline.js#renderDriverRows:
     • an assignment WITH a driver lands in that driver's lane (unchanged);
     • an assignment with NO driver (driver:'' — the v1.27.0 Self-Drive state
       — or legacy null/undefined) lands in ONE dedicated "Tanpa Driver" lane,
       rendered LAST, and is NEVER dropped;
     • a vehicle-but-no-driver assignment stays in the unassigned lane (driver
       and vehicle are independent) with its vehicle info preserved on the card;
     • the lane appears ONLY when there is at least one unassigned assignment
       (no permanently-empty fixed row);
     • reassigning a driver moves the block to the driver lane with NO duplicate
       and drops the now-empty unassigned lane;
     • overlapping unassigned assignments both stay visible and show NO spurious
       driver-conflict badge (write-path parity: driver:'' is not double-booked);
     • overnight time math is identical in the unassigned lane;
     • left label ↔ right slots stay 1:1 (one .driver-row owns both).

   Plus static checks that timeline-interactions.js maps the lane back to
   driver:'' on drag, and that the app.js filter contract keeps unassigned
   assignments for "Semua Driver" / vehicle / status while dropping them for a
   specific-driver filter.

   Reuses the timeline-autofocus harness (real CSS + async #v2TimelineSurface).
   Run: node scripts/timeline-unassigned-lane-check.mjs   (exit 0 = all pass)
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
const near = (a, b, tol = 2) => Math.abs(a - b) <= tol;
const src = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

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
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|favicon|firebase|permission|network/i.test(m.text())) errs.push('err: ' + m.text().slice(0, 200)); });
await page.setViewport({ width: 1280, height: 900 });
await page.goto(`http://localhost:${port}/scripts/timeline-autofocus-harness.html`, { waitUntil: 'networkidle0', timeout: 45000 });

const ANCHOR = '2026-09-15';

/* Load timeline.js once and stash shared render/query helpers on window. */
await page.evaluate(async () => {
  const tl = await import('/js/timeline.js');
  document.getElementById('v2TimelineSurface').classList.add('shown');
  const A = (o) => ({
    id: o.id, driver: o.driver, vehicle: o.vehicle ?? '',
    date: o.date, startTime: o.startTime, endTime: o.endTime,
    fullDay: !!o.fullDay, status: o.status || 'assigned',
    destination: 'Tes', purpose: o.id, pic: '', pax: 0,
  });
  window.__H = {
    tl,
    hw: () => tl.getHourWidth(),
    body: () => document.getElementById('timelineBody'),
    rows: () => [...document.getElementById('timelineBody').querySelectorAll('.driver-row')],
    uRow: () => document.getElementById('timelineBody').querySelector('.driver-row[data-lane="unassigned"]'),
    laneName: (rowEl) => rowEl?.querySelector('.driver-name')?.textContent.trim() || '',
    blk: (id) => document.getElementById('timelineBody').querySelector(`.assignment-block[data-id="${id}"]`),
    render: async (rows, anchor) => {
      tl.setAssignments(rows.map(A));
      tl.setCurrentDate(anchor);
      tl.renderTimeline();
      await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
    },
  };
});

/* ── Scenario 1: assigned / no-driver / vehicle-but-no-driver together ── */
console.log('\n[1 — assigned vs. Tanpa Driver vs. vehicle-without-driver]');
const r1 = await page.evaluate(async (ANCHOR) => {
  const H = window.__H;
  await H.render([
    { id: 'assigned',    driver: 'Andi', vehicle: 'Innova', date: ANCHOR, startTime: '09:00', endTime: '12:00' },
    { id: 'nodriver',     driver: '',    vehicle: '',       date: ANCHOR, startTime: '10:00', endTime: '12:00' },
    { id: 'vehnodriver',  driver: '',    vehicle: 'Avanza', date: ANCHOR, startTime: '13:00', endTime: '15:00' },
  ], ANCHOR);

  const all = H.rows();
  const uRow = H.uRow();
  const grab = (id) => {
    const el = H.blk(id);
    return el ? {
      left: parseFloat(el.style.left), width: parseFloat(el.style.width),
      cls: el.className, vehicle: el.dataset.vehicle,
      hasShape: !!el.querySelector('.block-vehicle-shape'),
      badge: el.querySelector('.block-status-badge--unassigned')?.textContent.trim() || '',
      conflict: !!el.querySelector('.block-status-badge--conflict'),
      inUnassigned: !!el.closest('.driver-row[data-lane="unassigned"]'),
      laneOf: H.laneName(el.closest('.driver-row')),
    } : null;
  };
  const uLabel = uRow?.querySelector('.driver-label');
  const drvLabel = all[0]?.querySelector('.driver-label');
  return {
    hw: H.hw(),
    rowCount: all.length,
    unassignedExists: !!uRow,
    unassignedIsLast: !!uRow && all[all.length - 1] === uRow,
    unassignedName: H.laneName(uRow),
    unassignedCount: uRow?.querySelector('.driver-lane-count')?.textContent.trim() || '',
    labelWidthMatches: !!uLabel && !!drvLabel && Math.abs(uLabel.offsetWidth - drvLabel.offsetWidth) <= 1,
    labelAndSlotsSameRow: !!uRow && uRow.children.length === 2
      && uRow.children[0].classList.contains('driver-label')
      && uRow.children[1].classList.contains('driver-slots'),
    assigned: grab('assigned'),
    nodriver: grab('nodriver'),
    vehnodriver: grab('vehnodriver'),
  };
}, ANCHOR);

const hw = r1.hw;
console.log('  [geometry]', JSON.stringify(r1));
check('lanes = Andi + Tanpa Driver (2 rows; harness has no seeded driver roster)', r1.rowCount === 2, r1);
check('a .driver-row[data-lane="unassigned"] exists', r1.unassignedExists, r1);
check('the unassigned lane is rendered LAST', r1.unassignedIsLast, r1);
check('its left label reads exactly "Tanpa Driver"', r1.unassignedName === 'Tanpa Driver', r1);
check('its count label reads "2 tugas"', r1.unassignedCount === '2 tugas', r1);
check('unassigned label width == a driver label width (1:1 alignment)', r1.labelWidthMatches, r1);
check('one .driver-row owns BOTH the left label and the right slots', r1.labelAndSlotsSameRow, r1);

check('assigned block is in Andi\'s lane, NOT the unassigned lane', r1.assigned && r1.assigned.laneOf === 'Andi' && !r1.assigned.inUnassigned, r1.assigned);
check('assigned block carries NO ⚠ Tanpa Driver badge / is-unassigned class', r1.assigned && r1.assigned.badge === '' && !/is-unassigned/.test(r1.assigned.cls), r1.assigned);

check('no-driver block is IN the unassigned lane', r1.nodriver && r1.nodriver.inUnassigned, r1.nodriver);
check('no-driver block left ≈ (10 days + 10:00)', r1.nodriver && near(r1.nodriver.left, (10 * 1440 + 600) / 60 * hw), r1.nodriver);
check('no-driver block width ≈ 2h (time math unchanged)', r1.nodriver && near(r1.nodriver.width, 2 * hw), r1.nodriver);
check('no-driver block has .is-unassigned + "⚠ Tanpa Driver" badge', r1.nodriver && /is-unassigned/.test(r1.nodriver.cls) && /Tanpa Driver/.test(r1.nodriver.badge), r1.nodriver);

check('vehicle-but-no-driver block stays in the unassigned lane (not a vehicle lane)', r1.vehnodriver && r1.vehnodriver.inUnassigned, r1.vehnodriver);
check('vehicle-but-no-driver block preserves its vehicle (data-vehicle + shape dot)', r1.vehnodriver && r1.vehnodriver.vehicle === 'Avanza' && r1.vehnodriver.hasShape, r1.vehnodriver);

/* ── Scenario 2: reassign a driver — no duplicate, lane drops ── */
console.log('\n[2 — assign a driver later: block moves, no duplicate, empty lane drops]');
const r2 = await page.evaluate(async (ANCHOR) => {
  const H = window.__H;
  await H.render([
    { id: 'assigned', driver: 'Andi', vehicle: '', date: ANCHOR, startTime: '09:00', endTime: '10:00' },
    { id: 'later',    driver: '',     vehicle: '', date: ANCHOR, startTime: '13:00', endTime: '15:00' },
  ], ANCHOR);
  const laterRowBefore = H.blk('later')?.closest('.driver-row');
  const before = {
    unassigned: !!H.uRow(),
    count: H.uRow()?.querySelector('.driver-lane-count')?.textContent.trim() || '',
    laterInUnassigned: !!laterRowBefore && laterRowBefore.matches('[data-lane="unassigned"]'),
  };
  await H.render([
    { id: 'assigned', driver: 'Andi', vehicle: '', date: ANCHOR, startTime: '09:00', endTime: '10:00' },
    { id: 'later',    driver: 'Andi', vehicle: '', date: ANCHOR, startTime: '13:00', endTime: '15:00' },
  ], ANCHOR);
  const after = {
    unassigned: !!H.uRow(),
    laterBlockCount: H.body().querySelectorAll('.assignment-block[data-id="later"]').length,
    laterLane: H.laneName(H.blk('later')?.closest('.driver-row')),
  };
  return { before, after };
}, ANCHOR);
console.log('  ', JSON.stringify(r2));
check('before: unassigned lane present with "1 tugas"', r2.before.unassigned && r2.before.count === '1 tugas', r2.before);
check('before: the block is in the unassigned lane', r2.before.laterInUnassigned, r2.before);
check('after: exactly ONE .assignment-block for the reassigned id (no duplicate)', r2.after.laterBlockCount === 1, r2.after);
check('after: it now sits in Andi\'s lane', r2.after.laterLane === 'Andi', r2.after);
check('after: the now-empty unassigned lane is gone', r2.after.unassigned === false, r2.after);

/* ── Scenario 3: no unassigned assignments → no lane ── */
console.log('\n[3 — every assignment has a driver: no "Tanpa Driver" lane at all]');
const r3 = await page.evaluate(async (ANCHOR) => {
  const H = window.__H;
  await H.render([
    { id: 'a', driver: 'Andi', vehicle: '', date: ANCHOR, startTime: '09:00', endTime: '10:00' },
    { id: 'b', driver: 'Budi', vehicle: '', date: ANCHOR, startTime: '11:00', endTime: '12:00' },
  ], ANCHOR);
  return { unassigned: !!H.uRow(), rowCount: H.rows().length };
}, ANCHOR);
console.log('  ', JSON.stringify(r3));
check('no .driver-row[data-lane="unassigned"] when nothing is unassigned', r3.unassigned === false, r3);
check('only the 2 driver lanes render', r3.rowCount === 2, r3);

/* ── Scenario 4: overlapping unassigned — both visible, no fake conflict ── */
console.log('\n[4 — overlapping Tanpa Driver assignments: both visible, no spurious ⚠ Konflik]');
const r4 = await page.evaluate(async (ANCHOR) => {
  const H = window.__H;
  await H.render([
    { id: 'u1', driver: '', vehicle: '', date: ANCHOR, startTime: '10:00', endTime: '13:00' },
    { id: 'u2', driver: '', vehicle: '', date: ANCHOR, startTime: '11:00', endTime: '14:00' },
    { id: 'u3', driver: '', vehicle: '', date: ANCHOR, startTime: '23:00', endTime: '02:00' }, // overnight
  ], ANCHOR);
  const uRow = H.uRow();
  const info = (id) => {
    const el = H.blk(id);
    return el ? {
      inUnassigned: !!el.closest('.driver-row[data-lane="unassigned"]'),
      conflict: !!el.querySelector('.block-status-badge--conflict'),
      spansMidnight: el.classList.contains('spans-midnight'),
      width: parseFloat(el.style.width),
    } : null;
  };
  return {
    count: uRow?.querySelector('.driver-lane-count')?.textContent.trim() || '',
    blockCount: uRow ? uRow.querySelectorAll('.assignment-block').length : 0,
    u1: info('u1'), u2: info('u2'), u3: info('u3'),
    hw: H.hw(),
  };
}, ANCHOR);
console.log('  ', JSON.stringify(r4));
check('all 3 unassigned blocks render in the one lane', r4.blockCount === 3 && r4.count === '3 tugas', r4);
check('neither overlapping unassigned block shows a driver-conflict badge', r4.u1 && r4.u2 && !r4.u1.conflict && !r4.u2.conflict, r4);
check('overnight unassigned = ONE block, spans-midnight, width ≈ 3h (time math intact)',
  r4.u3 && r4.u3.spansMidnight && near(r4.u3.width, 3 * r4.hw), r4.u3);

/* ── Scenario 4b: "N tugas" counts OPEN unassigned only, not completed history ── */
console.log('\n[4b — lane count excludes completed unassigned (historical), but the cards still render]');
const r4b = await page.evaluate(async (ANCHOR) => {
  const H = window.__H;
  await H.render([
    { id: 'open1', driver: '', vehicle: '', date: ANCHOR, startTime: '09:00', endTime: '11:00', status: 'assigned' },
    { id: 'open2', driver: '', vehicle: '', date: ANCHOR, startTime: '12:00', endTime: '14:00', status: 'started' },
    { id: 'doneA', driver: '', vehicle: '', date: ANCHOR, startTime: '15:00', endTime: '16:00', status: 'completed' },
    { id: 'doneB', driver: '', vehicle: '', date: ANCHOR, startTime: '16:30', endTime: '17:30', status: 'completed' },
  ], ANCHOR);
  const uRow = H.uRow();
  return {
    count: uRow?.querySelector('.driver-lane-count')?.textContent.trim() || '',
    blockCount: uRow ? uRow.querySelectorAll('.assignment-block').length : 0,
    doneStillRendered: !!H.blk('doneA') && !!H.blk('doneB'),
  };
}, ANCHOR);
console.log('  ', JSON.stringify(r4b));
check('"N tugas" = 2 (the two OPEN tasks: assigned + started) — completed excluded', r4b.count === '2 tugas', r4b);
check('all 4 unassigned cards still RENDER in the lane (completed history preserved)', r4b.blockCount === 4 && r4b.doneStillRendered, r4b);

/* ── Static: drag mapping + module contract + filter contract ── */
console.log('\n[5 — static: drag maps the lane back to driver:\'\' ; module contract]');
const tlSrc = src('js/timeline.js');
const tiSrc = src('js/timeline-interactions.js');
const appSrc = src('js/app.js');
const utilSrc = src('js/utils.js');

check('canonical isUnassignedAssignment lives in js/utils.js (pure, shared with the analytics engine)',
  /export function isUnassignedAssignment\(/.test(utilSrc));
check('timeline.js still exports isUnassignedAssignment (re-export from utils.js)',
  /export \{ isUnassignedAssignment \} from '\.\/utils\.js';/.test(tlSrc));
check('analytics-engine.js imports the canonical predicate from utils.js',
  /import \{[^}]*isUnassignedAssignment[^}]*\} from '\.\.\/utils\.js';/.test(src('js/analytics/analytics-engine.js')));
check('timeline.js renders the lane ONLY when unassignedAssignments.length > 0',
  /if \(unassignedAssignments\.length > 0\) \{/.test(tlSrc));
check('timeline.js tags the lane row with data-lane="unassigned"',
  /row\.dataset\.lane = 'unassigned'/.test(tlSrc));
check('timeline.js conflict badge now matches the write path (driver && checkConflict)',
  /\(assignment\.driver && checkConflict\(assignment\.driver,/.test(tlSrc));
check('timeline-interactions.js: dropping on the unassigned lane sets targetDriver = \'\'',
  /rowEl\.dataset\.lane === 'unassigned'/.test(tiSrc) && /targetDriver = '';/.test(tiSrc));

console.log('\n[6 — static: app.js filter contract keeps unassigned for Semua Driver / vehicle / status]');
check('specific-driver filter compares a.driver === filterDriver (drops driver:\'\' — correct)',
  /if \(filterDriver\)\s+active = active\.filter\(a => a\.driver === filterDriver\);/.test(appSrc));
check('vehicle filter is driver-agnostic (unassigned kept)',
  /if \(filterVehicle\) active = active\.filter\(a => a\.vehicle === filterVehicle\);/.test(appSrc));
check('status filter is driver-agnostic (unassigned kept when status matches)',
  /if \(filterStatus\)\s+active = active\.filter\(a => \(a\.status \|\| 'assigned'\) === filterStatus\);/.test(appSrc));

check('no unexpected console errors', errs.length === 0, errs);

await browser.close();
server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
