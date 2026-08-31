/* timeline-continuous-scroll-check.mjs — V1 FOLLOW-UP (Phase 3).

   REAL browser test of the CONTINUOUS / infinite timeline:
     • horizontal scroll moves the header date with the viewport (Part 10);
     • crossing midnight continues into the next day — no reset (Part 9);
     • the window extends near either edge (infinite feel, bounded DOM —
       Part 12) and the on-screen position is preserved on prepend (Part 13);
     • Prev / Next / calendar / "Hari Ini" are SMOOTH-SCROLL shortcuts with
       real intermediate positions (Part 6/7/14/15/16);
     • a manual scroll DURING an auto-animation cancels it (Part 7).

   Run: node scripts/timeline-continuous-scroll-check.mjs   (exit 0 = all pass)
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

const boot = await page.evaluate(async () => {
  const tl = await import('/js/timeline.js');
  window.__tl = tl;
  document.getElementById('v2TimelineSurface').classList.add('shown');

  const pad = (n) => String(n).padStart(2, '0');
  const d = new Date();
  const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const off = (base, n) => { const x = new Date(base + 'T00:00:00'); x.setDate(x.getDate() + n); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };
  window.__today = today; window.__off = off;

  const A = (o) => ({
    id: o.id, driver: o.driver, vehicle: '', date: o.date,
    startTime: o.startTime, endTime: o.endTime, fullDay: false,
    status: 'assigned', destination: 'X', purpose: o.id, pic: '', pax: 0,
  });
  // One assignment per day for a week, each at a DISTINCT hour, so every
  // day-nav has its own focus target and Prev/Next visibly move.
  const hours = ['08:00', '11:00', '14:00', '17:00', '20:00', '07:00', '13:00'];
  window.__seed = () => {
    const list = hours.map((h, i) => A({
      id: `day${i}`, driver: `Drv${i}`, date: off(today, i),
      startTime: h, endTime: `${pad(parseInt(h) + 1)}:00`,
    }));
    tl.setAssignments(list);
  };
  window.__seed();
  tl.setCurrentDate(today);
  tl.renderTimeline();
  if (!window.__wired) { tl.initDateControls(); window.__wired = true; }
  await new Promise(res => setTimeout(res, 1200)); // let auto-focus animation finish

  const hw = tl.getHourWidth();
  return { hw, dayPx: 24 * hw };
});
const DAY = boot.dayPx;
const HW = boot.hw;

/** fresh, deterministic 21-day window centred on today; waits out auto-focus */
async function reset() {
  await page.evaluate(async () => {
    window.__seed();
    window.__tl.setCurrentDate(window.__today);
    window.__tl.renderTimeline();
    await new Promise(r => setTimeout(r, 1150));
  });
}
/** simulate a USER scroll: claim manual control (touchmove → cancels any
 *  running tween + sets userMovedTimeline), set scrollLeft, fire scroll,
 *  wait for the rAF viewport sync. */
async function userScrollTo(px) {
  return page.evaluate(async (px) => {
    const body = document.getElementById('timelineBody');
    body.dispatchEvent(new Event('touchmove'));
    body.scrollLeft = px;
    body.dispatchEvent(new Event('scroll'));
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise(r => setTimeout(r, 50));
    return {
      label: document.getElementById('timelineDateLabel').textContent,
      dateInput: document.getElementById('filterDate').value,
      scrollLeft: body.scrollLeft,
      tlDays: parseInt(body.style.getPropertyValue('--tl-days'), 10),
    };
  }, px);
}

console.log('\n[1 — the header date AND the calendar picker follow the scroll viewport (Part 10)]');
await reset();
const at10 = await userScrollTo(10 * DAY + 10 * HW);
const at11 = await userScrollTo(11 * DAY + 10 * HW);
const at13 = await userScrollTo(13 * DAY + 10 * HW);
check('scrolling +1 day changes the header text', at11.label !== at10.label, { a: at10.label, b: at11.label });
check('scrolling +3 days changes it again (distinct from +1)', at13.label !== at11.label, { b: at11.label, c: at13.label });
const at10back = await userScrollTo(10 * DAY + 10 * HW);
check('scrolling back restores the original header text', at10back.label === at10.label, { back: at10back.label, orig: at10.label });
check('the #filterDate calendar input tracks a plain scroll too (not just Prev/Next/Today)',
  at11.dateInput !== at10.dateInput && at13.dateInput !== at11.dateInput && at10back.dateInput === at10.dateInput,
  { d10: at10.dateInput, d11: at11.dateInput, d13: at13.dateInput, back: at10back.dateInput });
check('#filterDate holds a valid YYYY-MM-DD after scrolling', /^\d{4}-\d{2}-\d{2}$/.test(at13.dateInput), { v: at13.dateInput });

// the viewport-date callback (app.js uses it to refresh the PBSI datepicker
// trigger text — the styled "Sen, 31 Agu 2026" control in the top header)
await reset();
const cb = await page.evaluate(async (DAY) => {
  const tl = window.__tl;
  const fired = [];
  tl.registerViewportDateCallback((d) => fired.push(d));
  const body = document.getElementById('timelineBody');
  body.dispatchEvent(new Event('touchmove'));
  for (const idx of [11, 12, 14]) {
    body.scrollLeft = idx * DAY + 8 * (DAY / 24);
    body.dispatchEvent(new Event('scroll'));
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise(r => setTimeout(r, 45));
  }
  tl.registerViewportDateCallback(null);
  return { fired, count: fired.length, allValidDates: fired.every(d => /^\d{4}-\d{2}-\d{2}$/.test(d)) };
}, DAY);
check('registerViewportDateCallback fires on a plain scroll across day boundaries (drives the header date-picker refresh)',
  cb.count >= 2 && cb.allValidDates, cb);

console.log('\n[2 — crossing midnight is continuous, no reset / no window rebuild (Part 9)]');
await reset();
const preMid  = await userScrollTo(11 * DAY + 12 * HW);
const nearMid = await userScrollTo(11 * DAY + 23.5 * HW);
const postMid = await userScrollTo(12 * DAY + 12 * HW);
check('scrollLeft strictly increases across the midnight boundary (no snap-back)',
  nearMid.scrollLeft > preMid.scrollLeft && postMid.scrollLeft > nearMid.scrollLeft,
  { pre: preMid.scrollLeft, near: nearMid.scrollLeft, post: postMid.scrollLeft });
check('the header advanced across midnight (day before ≠ day after), not reset', preMid.label !== postMid.label, { pre: preMid.label, post: postMid.label });
check('crossing a day did NOT rebuild the whole window (still 21 days)', postMid.tlDays === 21, { days: postMid.tlDays });

console.log('\n[3 — the window extends near an edge, DOM stays bounded (Part 12)]');
await reset();
const before3 = (await userScrollTo(10 * DAY)).tlDays;
const rightEdge = await userScrollTo(18 * DAY);
check('scrolling toward the right edge GREW the window', rightEdge.tlDays > before3, { before: before3, after: rightEdge.tlDays });
check('the window stays bounded (≤ 63 days) after repeated extends', rightEdge.tlDays <= 63, { days: rightEdge.tlDays });

console.log('\n[4 — on-screen position is preserved when days are PREPENDED (Part 13)]');
await reset();
const prep = await page.evaluate(async (DAY) => {
  const body = document.getElementById('timelineBody');
  const lm = () => document.querySelector('.assignment-block[data-id="day3"]'); // landmark block, id stable across re-render
  const settle = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 60))));

  body.dispatchEvent(new Event('touchmove')); // claim manual control

  // A) park at day index 4 — safely inside the window, no extend
  body.scrollLeft = 4 * DAY;
  body.dispatchEvent(new Event('scroll'));
  await settle();
  const daysBefore = parseInt(body.style.getPropertyValue('--tl-days'), 10);
  const xA = lm().getBoundingClientRect().left;

  // B) scroll to day index 2 — inside the LEFT trigger → prepend + compensate
  body.scrollLeft = 2 * DAY;
  body.dispatchEvent(new Event('scroll'));
  await settle();
  const daysAfter = parseInt(body.style.getPropertyValue('--tl-days'), 10);
  const xB = lm().getBoundingClientRect().left;

  // With a CORRECT prepend compensation, moving the view from the day-4 region
  // to the day-2 region shifts the landmark right by exactly 2 days of px —
  // the same as it would with no prepend at all. A missing/wrong compensation
  // would add (daysAdded × DAY) of jump on top.
  return { daysBefore, daysAfter, shiftSeen: xB - xA, expected: 2 * DAY };
}, DAY);
check('prepend grew the window on the left', prep.daysAfter > prep.daysBefore, prep);
check('the landmark shifted by exactly the scrolled distance — the prepend did NOT jump the view (Part 13)',
  Math.abs(prep.shiftSeen - prep.expected) <= 4, prep);

console.log('\n[5 — Prev / Next are SMOOTH-SCROLL shortcuts with real intermediate positions (Part 6/7/14/24)]');
await reset();
const smooth = await page.evaluate(async () => {
  const body = document.getElementById('timelineBody');
  const start = body.scrollLeft;
  // navigate forward 3 days at once via the calendar so the target is far and distinct
  const input = document.getElementById('filterDate');
  input.value = window.__off(window.__today, 3);
  input.dispatchEvent(new Event('change'));
  const samples = [];
  for (let i = 0; i < 26; i++) { await new Promise(r => requestAnimationFrame(r)); samples.push(body.scrollLeft); }
  await new Promise(r => setTimeout(r, 300));
  const end = body.scrollLeft;
  const distinct = new Set(samples.map(v => Math.round(v))).size;
  const lo = Math.min(start, end), hi = Math.max(start, end);
  const intermediate = samples.some(v => v > lo + 6 && v < hi - 6);
  return { start, end, distinct, intermediate };
});
check('the nav moved the scroll position', Math.abs(smooth.end - smooth.start) > 40, smooth);
check('the move was ANIMATED — ≥5 distinct scrollLeft samples, not one jump', smooth.distinct >= 5, smooth);
check('a frame sits strictly BETWEEN start and end (a real intermediate position — Part 24)', smooth.intermediate === true, smooth);

console.log('\n[6 — a manual scroll DURING the animation cancels it, no fight-back (Part 7)]');
await reset();
const interrupt = await page.evaluate(async () => {
  const body = document.getElementById('timelineBody');
  const wrapper = document.querySelector('.timeline-wrapper');
  const input = document.getElementById('filterDate');
  input.value = window.__off(window.__today, 4);
  input.dispatchEvent(new Event('change'));           // start a long smooth animation
  await new Promise(r => requestAnimationFrame(r));
  await new Promise(r => requestAnimationFrame(r));
  await new Promise(r => requestAnimationFrame(r));
  const midAnim = body.scrollLeft;
  wrapper.dispatchEvent(new WheelEvent('wheel', { deltaY: -260, bubbles: true, cancelable: true }));
  const afterWheel = body.scrollLeft;
  await new Promise(r => setTimeout(r, 400));
  const settled = body.scrollLeft;
  return { midAnim, afterWheel, settled };
});
check('the wheel gesture moved the timeline immediately', interrupt.afterWheel !== interrupt.midAnim, interrupt);
check('the cancelled animation did NOT resume / drag it back toward the old target', Math.abs(interrupt.settled - interrupt.afterWheel) < 40, interrupt);

console.log('\n[7 — "Hari Ini" returns to today + now (Part 16)]');
await reset();
const todayBtn = await page.evaluate(async () => {
  const body = document.getElementById('timelineBody');
  const input = document.getElementById('filterDate');
  input.value = window.__off(window.__today, 4);
  input.dispatchEvent(new Event('change'));
  await new Promise(r => setTimeout(r, 1100));
  const away = document.getElementById('timelineDateLabel').textContent;
  const btn = document.getElementById('btnToday');
  const wasDisabled = btn.disabled;
  btn.click();
  await new Promise(r => setTimeout(r, 1100));
  const home = document.getElementById('timelineDateLabel').textContent;
  const tl = window.__tl;
  const hw = tl.getHourWidth();
  const d = new Date();
  const nowPx = (tl.dateToDayIndex(window.__today) * 1440 + d.getHours() * 60 + d.getMinutes()) / 60 * hw;
  const inView = nowPx >= body.scrollLeft - 6 && nowPx <= body.scrollLeft + body.clientWidth + 6;
  return { away, home, wasDisabled, inView, nowPx, sl: body.scrollLeft, cw: body.clientWidth };
});
check('"Hari Ini" was enabled after navigating 4 days away from today', todayBtn.wasDisabled === false, todayBtn);
check('"Hari Ini" moved the header back to today (different from the away date)', todayBtn.home !== todayBtn.away, todayBtn);
check('after "Hari Ini" the current-time position is inside the viewport (scrolled to ~now, not 00:00)', todayBtn.inView === true, todayBtn);

console.log('\n[8 — calendar picker is a scroll shortcut (Part 15)]');
await reset();
const cal = await page.evaluate(async () => {
  const input = document.getElementById('filterDate');
  const before = document.getElementById('timelineDateLabel').textContent;
  input.value = window.__off(window.__today, 5);
  input.dispatchEvent(new Event('change'));
  await new Promise(r => setTimeout(r, 1100));
  return { before, after: document.getElementById('timelineDateLabel').textContent };
});
check('picking a date 5 days out scrolled the viewport there (header changed)', cal.after !== cal.before && /\d/.test(cal.after), cal);

check('no unexpected console errors across the whole run', errs.length === 0, errs);

await browser.close();
server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
