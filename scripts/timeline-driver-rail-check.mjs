/* timeline-driver-rail-check.mjs — V1 HOTFIX regression: driver names in the
   sticky Timeline resource rail.

   Root cause it guards against: `.driver-row` is `display:flex` with no width,
   so its box collapsed to the #timelineBody flex-container width (~1284px)
   instead of spanning the full multi-day `.driver-slots` canvas (up to ~40k
   px since the continuous multi-day timeline, commit 0ef0eec). `position:
   sticky` on `.driver-label` pins only within its containing block (the row),
   so once the canvas was scrolled past ~one screen the label detached and
   scrolled out of view — and the board auto-scrolls ~19k px to "now" on every
   open, so every driver name sat off-screen left. Fix: `.driver-row {
   width: max-content }`.

   Renders js/timeline.js into a FAITHFUL reproduction of the production shell
   cascade (scripts/timeline-driver-rail-harness.html:
   .app-layout > .main-area(min-width:0) > .main-content > #v2TimelineSurface >
   #v2TimelineView.v2-view-container > .timeline-wrapper > #timelineBody), with
   the app.js#initV2DriverAvatars observer mounted, then asserts the rail stays
   pinned and readable at every scroll position and viewport.

   Run: node scripts/timeline-driver-rail-check.mjs   (exit 0 = all pass)
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
const src = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

const MIME = { '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml' };
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
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|favicon|firebase|permission|network/i.test(m.text())) errs.push('err: ' + m.text().slice(0, 160)); });

const ANCHOR = '2026-09-15';
const DRIVERS = ['Budi Santoso', 'Andi', 'Rudi'];

async function loadAt(w, h, theme) {
  await page.setViewport({ width: w, height: h });
  await page.goto(`http://localhost:${port}/scripts/timeline-driver-rail-harness.html`, { waitUntil: 'networkidle0', timeout: 45000 });
  return page.evaluate(async ({ ANCHOR, theme }) => {
    if (theme) document.documentElement.setAttribute('data-theme', theme);
    const tl = await import('/js/timeline.js');
    const body = document.getElementById('timelineBody');
    // faithful: app.js#initV2DriverAvatars MutationObserver
    const stamp = () => body.querySelectorAll('.driver-label:not([data-initials])').forEach(l => {
      const n = l.querySelector('.driver-name')?.textContent?.trim() || '';
      l.setAttribute('data-initials', n.split(/\s+/).slice(0, 2).map(x => (x[0] ?? '').toUpperCase()).join('') || '?');
    });
    new MutationObserver(stamp).observe(body, { childList: true });

    const A = (o) => ({ id: o.id, driver: o.driver, vehicle: '', date: o.date, startTime: o.s, endTime: o.e, fullDay: false, status: 'assigned', destination: 'Kantor', purpose: o.id, pic: '', pax: 0 });
    tl.setAssignments([
      A({ id: 'b1', driver: 'Budi Santoso', date: ANCHOR, s: '08:00', e: '11:00' }),
      A({ id: 'a1', driver: 'Andi',         date: ANCHOR, s: '09:30', e: '12:30' }),
      A({ id: 'r1', driver: 'Rudi',         date: ANCHOR, s: '13:00', e: '16:00' }),
      A({ id: 'u1', driver: '',             date: ANCHOR, s: '10:00', e: '12:00' }),
    ]);
    tl.setCurrentDate(ANCHOR);
    tl.renderTimeline();
    stamp();
    await new Promise(r => setTimeout(r, 1600));

    const rows = [...body.querySelectorAll('.driver-row')];
    const rowInfo = rows.map(r => ({
      lane: r.dataset.lane || r.querySelector('.driver-name')?.textContent.trim(),
      name: r.querySelector('.driver-name')?.textContent.trim(),
      boxW: Math.round(r.getBoundingClientRect().width),
      blockIds: [...r.querySelectorAll('.assignment-block')].map(b => b.dataset.id),
    }));

    const maxScroll = Math.max(0, body.scrollWidth - body.clientWidth);
    const measure = (sl) => {
      body.scrollLeft = sl;
      const hrs = document.getElementById('timelineHours'); if (hrs) hrs.scrollLeft = sl;
      void body.offsetWidth;
      const br = body.getBoundingClientRect();
      return {
        scrollLeft: Math.round(sl),
        pageHOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        labels: [...body.querySelectorAll('.driver-label')].map(l => {
          const r = l.getBoundingClientRect();
          const nameEl = l.querySelector('.driver-name');
          return {
            text: (l.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 24),
            xRelBody: Math.round(r.left - br.left),
            inView: r.left >= -1 && r.left < window.innerWidth,
            nameVisible: !!(nameEl && (nameEl.offsetWidth || nameEl.offsetHeight)),
          };
        }),
      };
    };

    return {
      timelineBodyClientW: Math.round(body.clientWidth),
      scrollW: Math.round(body.scrollWidth),
      rowInfo,
      samples: [measure(0), measure(3000), measure(18000), measure(maxScroll), measure(0)],
    };
  }, { ANCHOR, theme });
}

const allPinned = (m) => m.labels.length > 0 && m.labels.every(l => Math.abs(l.xRelBody) <= 1 && l.inView && l.nameVisible);

for (const [w, h, theme] of [[1440, 860, ''], [1024, 800, ''], [390, 780, ''], [1440, 860, 'dark']]) {
  const tag = `${w}x${h}${theme ? ' ' + theme : ''}`;
  console.log(`\n[viewport ${tag}]`);
  const r = await loadAt(w, h, theme);

  // ── DATA / DOM: names present, correct, one lane each ──
  const driverRows = r.rowInfo.filter(x => x.lane !== 'unassigned');
  check(`3 driver lanes with names ${JSON.stringify(DRIVERS)}`,
    driverRows.length === 3 && DRIVERS.every(n => driverRows.some(x => x.name === n)), r.rowInfo);
  check('each assignment sits in its own driver lane',
    r.rowInfo.find(x => x.name === 'Budi Santoso')?.blockIds.join() === 'b1'
    && r.rowInfo.find(x => x.name === 'Andi')?.blockIds.join() === 'a1'
    && r.rowInfo.find(x => x.name === 'Rudi')?.blockIds.join() === 'r1', r.rowInfo);
  check('"Tanpa Driver" is a separate lane, rendered LAST',
    r.rowInfo[r.rowInfo.length - 1].lane === 'unassigned' && r.rowInfo[r.rowInfo.length - 1].name === 'Tanpa Driver', r.rowInfo);

  // ── LAYOUT: the row box spans the full canvas (the actual fix) ──
  check('.driver-row box spans the scroll content, NOT the #timelineBody width (width:max-content)',
    r.rowInfo.every(x => x.boxW >= r.scrollW - 4) && r.rowInfo[0].boxW > r.timelineBodyClientW + 1000,
    { boxW: r.rowInfo[0].boxW, tbClientW: r.timelineBodyClientW, scrollW: r.scrollW });

  // ── STICKY: names pinned & readable at every scroll position ──
  const [s0, s3k, s18k, sMax, sBack] = r.samples;
  check('rail pinned at scrollLeft 0',      allPinned(s0),   s0.labels);
  check('rail pinned at scrollLeft 3000',   allPinned(s3k),  s3k.labels);
  check('rail pinned at scrollLeft 18000 (≈ where the board auto-scrolls on open)', allPinned(s18k), s18k.labels);
  check('rail pinned at max scrollLeft',    allPinned(sMax), sMax.labels);
  check('rail still pinned after scrolling back to 0', allPinned(sBack), sBack.labels);
  check('no page-level horizontal overflow at any scroll position',
    r.samples.every(m => !m.pageHOverflow), r.samples.map(m => m.pageHOverflow));
}

// ── STATIC drift guard ──
console.log('\n[static]');
const css = src('style.css');
check('style.css .driver-row carries width: max-content',
  /\.driver-row\s*\{[^}]*\bwidth:\s*max-content\b/s.test(css));

check('no unexpected console errors', errs.length === 0, errs);

await browser.close();
server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
