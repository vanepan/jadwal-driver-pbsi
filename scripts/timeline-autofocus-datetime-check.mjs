/* timeline-autofocus-datetime-check.mjs — V1 FOLLOW-UP (Phase 2).

   REAL test of the OVERNIGHT-AWARE, datetime-driven auto-focus:
     • pickRelevantAssignment() (PURE, exported) now ranks by ABSOLUTE
       datetime via assignmentSpan() — A active / B next upcoming / C nearest
       previous / D none — so an overnight trip that STARTED YESTERDAY but is
       still running NOW is correctly "active" (Part 4/5), not treated as a
       finished "yesterday" assignment;
     • on first open the timeline auto-scrolls (SMOOTHLY — real intermediate
       positions, Part 6) so that assignment's block lands in the viewport.

   Run: node scripts/timeline-autofocus-datetime-check.mjs   (exit 0 = all pass)
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
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|favicon|firebase|permission|network/i.test(m.text())) errs.push('err: ' + m.text().slice(0, 200)); });
await page.setViewport({ width: 1280, height: 900 });
await page.goto(`http://localhost:${port}/scripts/timeline-autofocus-harness.html`, { waitUntil: 'networkidle0', timeout: 45000 });

/* ── 1. pickRelevantAssignment() — pure datetime ranking (Part 4/5) ────── */
console.log('\n[1 — pickRelevantAssignment ranks by ABSOLUTE datetime]');
const pure = await page.evaluate(async () => {
  const tl = await import('/js/timeline.js');
  const A = (o) => ({ id: o.id, driver: 'D', vehicle: '', date: o.date, startTime: o.s, endTime: o.e, status: o.status || 'assigned' });

  // "now" = 2026-09-01 00:30. An overnight trip started 2026-08-31 23:30 and
  // ends 2026-09-01 01:30 → ACTIVE right now, even though its date is YESTERDAY.
  const now = new Date(2026, 8, 1, 0, 30, 0);

  const overnightActive = A({ id: 'ovn-active', date: '2026-08-31', s: '23:30', e: '01:30' });
  const laterUpcoming   = A({ id: 'upcoming',   date: '2026-09-01', s: '02:00', e: '03:00' });
  const earlierPast     = A({ id: 'past',       date: '2026-08-31', s: '08:00', e: '10:00' });
  const cancelledNow    = A({ id: 'cxl',        date: '2026-08-31', s: '23:00', e: '02:00', status: 'cancelled' });

  const r1 = tl.pickRelevantAssignment([earlierPast, laterUpcoming, overnightActive, cancelledNow], now);
  const r2 = tl.pickRelevantAssignment([earlierPast, laterUpcoming], now);            // no active → next upcoming
  const r3 = tl.pickRelevantAssignment([earlierPast], now);                           // only past → nearest previous
  const r4 = tl.pickRelevantAssignment([cancelledNow], now);                          // only a cancelled one → none
  const r5 = tl.pickRelevantAssignment([], now);

  return {
    activePick: r1 && r1.assignment.id,
    activeFocusDate: r1 && r1.focusDate,
    upcomingPick: r2 && r2.assignment.id,
    previousPick: r3 && r3.assignment.id,
    cancelledOnly: r4,
    empty: r5,
  };
});
check('an overnight trip started YESTERDAY but running NOW is picked as ACTIVE (A)', pure.activePick === 'ovn-active', pure);
check('its focusDate is the real START date (2026-08-31), not "today"', pure.activeFocusDate === '2026-08-31', pure);
check('with no active trip → the NEXT upcoming is picked (B)', pure.upcomingPick === 'upcoming', pure);
check('with only past trips → the NEAREST previous is picked (C)', pure.previousPick === 'past', pure);
check('a cancelled assignment is never picked', pure.cancelledOnly === null, pure);
check('an empty list → null (D — caller falls back to "now")', pure.empty === null, pure);

/* ── 2. real auto-focus scroll to a genuinely-active trip ─────────────────
   Built relative to the ACTUAL clock so it is unambiguously active NOW.
   When `now` is within ~2h of midnight this record naturally straddles the
   day boundary (endDate > date) — exactly the "started on another calendar
   day but active now" case; auto-focus must still land it in view. */
console.log('\n[2 — the board auto-scrolls (smoothly) to the active trip, in view]');
const focus = await page.evaluate(async () => {
  const tl = await import('/js/timeline.js');
  document.getElementById('v2TimelineSurface').classList.add('shown');
  const body = document.getElementById('timelineBody');

  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const hhmm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

  const now = new Date();
  const start = new Date(now.getTime() - 90 * 60000); // active: started 90 min ago
  const end   = new Date(now.getTime() + 90 * 60000); // ends in 90 min
  const A = (o) => ({ id: o.id, driver: o.driver, vehicle: '', date: o.date, startTime: o.s, endTime: o.e, status: 'assigned', destination: 'X', purpose: o.id, pic: '', pax: 0 });

  // `date` = the START day; if `end` rolls into the next calendar day the
  // record is a genuine overnight one (endTime < startTime).
  const activeNow = A({ id: 'live', driver: 'Live', date: fmt(start), s: hhmm(start), e: hhmm(end) });
  const straddlesMidnight = fmt(start) !== fmt(end);
  const far = A({ id: 'far', driver: 'Far', date: fmt(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 6)), s: '10:00', e: '11:00' });

  tl.setAssignments([activeNow, far]);
  tl.setCurrentDate(fmt(now));

  const samples = [];
  tl.renderTimeline();
  for (let i = 0; i < 45; i++) { await new Promise(r => requestAnimationFrame(r)); samples.push(body.scrollLeft); }
  await new Promise(r => setTimeout(r, 250));

  const blk = document.querySelector('.assignment-block[data-id="live"]');
  const bodyRect = body.getBoundingClientRect();
  const blkRect = blk ? blk.getBoundingClientRect() : null;
  const inViewport = blkRect ? (blkRect.right > bodyRect.left + 40 && blkRect.left < bodyRect.right - 4) : false;
  const blockCount = document.querySelectorAll('.assignment-block[data-id="live"]').length;

  const distinct = new Set(samples.map(v => Math.round(v))).size;
  const first = samples[0], last = samples[samples.length - 1];
  const lo = Math.min(first, last), hi = Math.max(first, last);
  const hasIntermediate = samples.some(v => v > lo + 6 && v < hi - 6);

  return { blockRendered: !!blk, blockCount, inViewport, straddlesMidnight, distinct, first, last, hasIntermediate };
});
check('the active trip renders as exactly ONE block', focus.blockRendered && focus.blockCount === 1, focus);
check('after auto-focus the active block is within the timeline viewport', focus.inViewport, focus);
check('the auto-focus SCROLL was animated — multiple distinct scrollLeft samples', focus.distinct >= 4, focus);
check('the auto-focus scroll had a real intermediate position (smooth, not a teleport — Part 6)', focus.hasIntermediate, focus);
if (focus.straddlesMidnight) console.log('     (note: this run\'s "now" was near midnight — the active trip genuinely straddled the day boundary)');

check('no unexpected console errors', errs.length === 0, errs);

await browser.close();
server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
