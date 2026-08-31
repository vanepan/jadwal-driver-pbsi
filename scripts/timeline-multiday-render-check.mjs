/* timeline-multiday-render-check.mjs — V1 FOLLOW-UP (Phase 2 + Phase 3).

   REAL render test (headless Chromium, real style.css + platform.css) of the
   CONTINUOUS multi-day timeline canvas in js/timeline.js:
     • the board renders a contiguous window of days (not one calendar day);
     • an overnight assignment is ONE block, ONE data-id, spanning the
       midnight gridline continuously — no duplicate record (Part I/2/3);
     • same-day blocks are byte-for-byte unaffected;
     • clipping happens ONLY at the WINDOW edge (« / » chevrons);
     • no page-level horizontal overflow — #timelineBody owns the scroll.

   Reuses the timeline-autofocus harness (real CSS + async #v2TimelineSurface).
   Run: node scripts/timeline-multiday-render-check.mjs   (exit 0 = all pass)
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
const r = await page.evaluate(async (ANCHOR) => {
  const tl = await import('/js/timeline.js');
  document.getElementById('v2TimelineSurface').classList.add('shown');

  const A = (o) => ({
    id: o.id, driver: o.driver, vehicle: o.vehicle ?? '',
    date: o.date, startTime: o.startTime, endTime: o.endTime,
    fullDay: !!o.fullDay, status: o.status || 'assigned',
    destination: 'Tes', purpose: o.id, pic: '', pax: 0,
  });

  tl.setAssignments([
    A({ id: 'sameday',  driver: 'Andi', date: ANCHOR,        startTime: '09:00', endTime: '17:00' }),
    A({ id: 'ovn',      driver: 'Budi', date: ANCHOR,        startTime: '23:30', endTime: '01:30' }),
    A({ id: 'longovn',  driver: 'Cici', date: ANCHOR,        startTime: '22:00', endTime: '05:00' }),
    A({ id: 'preclip',  driver: 'Deni', date: '2026-09-04',  startTime: '22:00', endTime: '02:00' }), // starts before window start (2026-09-05)
    A({ id: 'postclip', driver: 'Euis', date: '2026-09-25',  startTime: '22:00', endTime: '02:00' }), // ends after window end
  ]);
  tl.setCurrentDate(ANCHOR);
  tl.renderTimeline();
  await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));

  const hourWidth = tl.getHourWidth();
  const body = document.getElementById('timelineBody');
  const hoursCells = document.querySelectorAll('#timelineHours .hour-cell');
  const dayStartCells = document.querySelectorAll('#timelineHours .hour-cell--daystart');

  const grab = (id) => {
    const els = document.querySelectorAll(`.assignment-block[data-id="${id}"]`);
    const el = els[0];
    if (!el) return { count: els.length };
    return {
      count: els.length,
      left: parseFloat(el.style.left),
      width: parseFloat(el.style.width),
      cls: el.className,
      spansMidnight: el.classList.contains('spans-midnight'),
      clipPrev: el.classList.contains('continues-prev-day'),
      clipNext: el.classList.contains('continues-next-day'),
      midnightX: el.style.getPropertyValue('--midnight-x'),
      label: el.querySelector('.block-time')?.textContent || '',
    };
  };

  return {
    hourWidth,
    tlDays: body.style.getPropertyValue('--tl-days'),
    hourCellCount: hoursCells.length,
    dayStartCount: dayStartCells.length,
    dayStartFirstLabel: dayStartCells[0]?.dataset.day || '',
    bodyScrollWidth: body.scrollWidth,
    bodyClientWidth: body.clientWidth,
    docScrollW: document.documentElement.scrollWidth,
    docClientW: document.documentElement.clientWidth,
    bodyElScrollW: document.body.scrollWidth,
    bodyElClientW: document.body.clientWidth,
    sameday: grab('sameday'),
    ovn: grab('ovn'),
    longovn: grab('longovn'),
    preclip: grab('preclip'),
    postclip: grab('postclip'),
  };
}, ANCHOR);

const hw = r.hourWidth;
const DAY_PX = 24 * hw;
console.log('\n[geometry]', JSON.stringify(r));

console.log('\n[1 — the canvas is a contiguous multi-day window]');
check('--tl-days is 21 (anchor ± 10 days)', r.tlDays === '21', { tlDays: r.tlDays });
check('hour ruler has 21×24 + 1 end-cap = 505 cells', r.hourCellCount === 505, { n: r.hourCellCount });
check('21 day-start divider cells (one per day)', r.dayStartCount === 21, { n: r.dayStartCount });
check('day-start cell carries a date marker', /\d/.test(r.dayStartFirstLabel), { label: r.dayStartFirstLabel });
check('#timelineBody is the horizontal scroller (scrollWidth >> clientWidth)', r.bodyScrollWidth > r.bodyClientWidth + 1000, r);

console.log('\n[2 — NO page-level horizontal overflow (the body owns the scroll)]');
check('document element does not scroll horizontally', r.docScrollW <= r.docClientW + 1, { s: r.docScrollW, c: r.docClientW });
check('<body> does not scroll horizontally', r.bodyElScrollW <= r.bodyElClientW + 1, { s: r.bodyElScrollW, c: r.bodyElClientW });

console.log('\n[3 — same-day block is completely unaffected by the multi-day model]');
// day index of ANCHOR within window = 10 (window starts at anchor-10)
check('same-day left ≈ (10 days + 09:00)', near(r.sameday.left, (10 * 1440 + 540) / 60 * hw), r.sameday);
check('same-day width ≈ 8h', near(r.sameday.width, 8 * hw), r.sameday);
check('same-day block is NOT spans-midnight / NOT clipped', !r.sameday.spansMidnight && !r.sameday.clipPrev && !r.sameday.clipNext, r.sameday);

console.log('\n[4 — overnight = ONE continuous block, ONE id, crossing the day seam]');
check('exactly ONE .assignment-block for the overnight id (no duplicate record — Part I)', r.ovn.count === 1, r.ovn);
check('overnight left ≈ (10 days + 23:30)', near(r.ovn.left, (10 * 1440 + 1410) / 60 * hw), r.ovn);
check('overnight width ≈ 2h real span (NOT clipped at 24:00)', near(r.ovn.width, 2 * hw), r.ovn);
check('overnight is marked .spans-midnight (continuous, not split)', r.ovn.spansMidnight === true, r.ovn);
check('overnight is NOT window-clipped', !r.ovn.clipPrev && !r.ovn.clipNext, r.ovn);
check('overnight has a --midnight-x seam tick at ≈ 30min from its left edge', near(parseFloat(r.ovn.midnightX), 0.5 * hw, 2), { midnightX: r.ovn.midnightX });
check('overnight label shows the TRUE times 23:30–01:30', /23:30/.test(r.ovn.label) && /01:30/.test(r.ovn.label), r.ovn);
check('long overnight (22:00→05:00) width ≈ 7h, one block, spans-midnight', r.longovn.count === 1 && near(r.longovn.width, 7 * hw) && r.longovn.spansMidnight, r.longovn);

console.log('\n[5 — clipping happens ONLY at the window edge]');
check('an assignment starting BEFORE the window is left-clipped (left = 0, .continues-prev-day «)', near(r.preclip.left, 0) && r.preclip.clipPrev === true, r.preclip);
check('an assignment ending AFTER the window is right-clipped (.continues-next-day »)', r.postclip.clipNext === true, r.postclip);
check('the right-clipped block does not overflow the canvas', r.postclip.left + r.postclip.width <= 21 * DAY_PX + 1, { end: r.postclip.left + r.postclip.width, canvas: 21 * DAY_PX });

console.log('\n[6 — the exported canvas helpers (used by timeline-interactions.js drag/resize/paste)]');
const helpers = await page.evaluate(async (ANCHOR) => {
  const tl = await import('/js/timeline.js');
  tl.setCurrentDate(ANCHOR);          // window start = ANCHOR − 10 days
  const winStart = tl.getWindowStartDate();
  // absolute canvas minute = dayIndex*1440 + minuteOfDay
  const dt1 = tl.canvasMinutesToDateTime(10 * 1440 + 540);   // day idx 10 (= ANCHOR), 09:00
  const dt2 = tl.canvasMinutesToDateTime(11 * 1440 + 30);    // day idx 11, 00:30
  const dt3 = tl.canvasMinutesToDateTime(0);                 // window start, 00:00
  return {
    winStart,
    idxAnchor: tl.dateToDayIndex(ANCHOR),
    dt1, dt2, dt3,
  };
}, ANCHOR);
check('getWindowStartDate() = anchor − 10 days', helpers.winStart === '2026-09-05', helpers);
check('dateToDayIndex(anchor) = 10', helpers.idxAnchor === 10, helpers);
check('canvasMinutesToDateTime(10d+09:00) → { anchor, 540 }', helpers.dt1.date === ANCHOR && helpers.dt1.minutes === 540, helpers.dt1);
check('canvasMinutesToDateTime(11d+00:30) → { anchor+1, 30 } (resolves the real day, not day 0)', helpers.dt2.date === '2026-09-16' && helpers.dt2.minutes === 30, helpers.dt2);
check('canvasMinutesToDateTime(0) → { windowStart, 0 }', helpers.dt3.date === '2026-09-05' && helpers.dt3.minutes === 0, helpers.dt3);

console.log('\n[7 — timeline-interactions.js uses the canvas helpers, not a day-0 assumption]');
const fs2 = await import('node:fs');
const iSrc = fs2.readFileSync(new URL('../js/timeline-interactions.js', import.meta.url), 'utf-8');
check('imports canvasMinutesToDateTime + dateToDayIndex from timeline.js',
  /import \{[^}]*canvasMinutesToDateTime[^}]*dateToDayIndex[^}]*\} from '\.\/timeline\.js';/.test(iSrc));
check('drag resolves the drop target via canvasMinutesToDateTime (day + minute-of-day)',
  /const dt = canvasMinutesToDateTime\(absStart\);/.test(iSrc) && /targetDate = dt\.date;/.test(iSrc));
check('drag persists the resolved targetDate (updateAssignmentDirect date: d.targetDate)',
  /updateAssignmentDirect\(d\.id, \{\s*driver: d\.targetDriver, date: d\.targetDate/.test(iSrc));
check('resize anchors on the block\'s ABSOLUTE canvas start (startAbsFixed via dateToDayIndex)',
  /startAbsFixed: dateToDayIndex\(assignment\.date\) \* 1440 \+ timeToMinutes\(assignment\.startTime\)/.test(iSrc));
check('resize is capped at ≤ one overnight (start + 1439), never a +2-day span',
  /r\.startAbsFixed \+ 1439/.test(iSrc));
check('paste resolves the drop day from the pointer (ctx.date) + allows an overnight roll-over',
  /date: \(ctx && ctx\.date\) \|\| getCurrentDate\(\)/.test(iSrc) && /wrapDayMinutes\(startMin \+ \(durationMinutes/.test(iSrc));

check('no unexpected console errors', errs.length === 0, errs);

await browser.close();
server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
