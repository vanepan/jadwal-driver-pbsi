/* timeline-responsive-check.mjs — V1 FOLLOW-UP (Phase 3), Part 20/21.

   The continuous multi-day timeline must stay usable at every width:
     • NO page-level horizontal overflow — #timelineBody owns the h-scroll;
     • the header date label stays visible;
     • an assignment card is not clipped by its row (top/bottom);
     • the per-day markers render;
     • a scroll still moves the header viewport date.

   Run: node scripts/timeline-responsive-check.mjs   (exit 0 = all pass)
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

const WIDTHS = [320, 375, 390, 430, 475, 768, 1024, 1440];
for (const w of WIDTHS) {
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|favicon|firebase|permission|network/i.test(m.text())) errs.push('err: ' + m.text().slice(0, 160)); });
  await page.setViewport({ width: w, height: 780 });
  await page.goto(`http://localhost:${port}/scripts/timeline-autofocus-harness.html`, { waitUntil: 'networkidle0', timeout: 45000 });

  const r = await page.evaluate(async () => {
    const tl = await import('/js/timeline.js');
    document.getElementById('v2TimelineSurface').classList.add('shown');
    const pad = (n) => String(n).padStart(2, '0');
    const d = new Date();
    const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const A = (o) => ({ id: o.id, driver: o.driver, vehicle: '', date: o.date, startTime: o.s, endTime: o.e, status: 'assigned', destination: 'X', purpose: o.id, pic: '', pax: 0 });
    tl.setAssignments([
      A({ id: 'r1', driver: 'A', date: today, s: '09:00', e: '17:00' }),
      A({ id: 'r2', driver: 'B', date: today, s: '23:00', e: '02:00' }), // overnight
    ]);
    tl.setCurrentDate(today);
    tl.renderTimeline();
    if (!window.__wired) { tl.initDateControls(); window.__wired = true; }
    await new Promise(res => setTimeout(res, 900));

    const body = document.getElementById('timelineBody');
    const label = document.getElementById('timelineDateLabel');
    const labelRect = label.getBoundingClientRect();
    const row = document.querySelector('.driver-row');
    const rowRect = row ? row.getBoundingClientRect() : null;
    const blk = document.querySelector('.assignment-block[data-id="r1"]');
    const blkRect = blk ? blk.getBoundingClientRect() : null;

    // scroll the viewport forward a day and see the header change
    const label0 = label.textContent;
    body.dispatchEvent(new Event('touchmove'));
    body.scrollLeft += 24 * tl.getHourWidth() + 5 * tl.getHourWidth();
    body.dispatchEvent(new Event('scroll'));
    await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
    await new Promise(res => setTimeout(res, 50));
    const label1 = label.textContent;

    return {
      docScrollW: document.documentElement.scrollWidth,
      docClientW: document.documentElement.clientWidth,
      bodyScrollW: body.scrollWidth,
      bodyClientW: body.clientWidth,
      labelVisible: labelRect.width > 20 && labelRect.height > 6 && labelRect.top < 780,
      blockWithinRow: !!(blkRect && rowRect && blkRect.top >= rowRect.top - 1 && blkRect.bottom <= rowRect.bottom + 1),
      dayMarkers: document.querySelectorAll('#timelineHours .hour-cell--daystart').length,
      headerFollowedScroll: label1 !== label0,
    };
  });

  console.log(`\n[@${w}px]`);
  check(`@${w}: no document-level horizontal overflow`, r.docScrollW <= r.docClientW + 1, { s: r.docScrollW, c: r.docClientW });
  check(`@${w}: #timelineBody owns the horizontal scroll (scrollWidth > clientWidth)`, r.bodyScrollW > r.bodyClientW + 100, r);
  check(`@${w}: the header date label is visible`, r.labelVisible, r);
  check(`@${w}: the assignment card is not clipped by its row (top/bottom)`, r.blockWithinRow, r);
  check(`@${w}: per-day markers render (${r.dayMarkers})`, r.dayMarkers >= 15, r);
  check(`@${w}: scrolling a day forward moved the header viewport date`, r.headerFollowedScroll, r);
  check(`@${w}: no console/page errors`, errs.length === 0, errs);
  await page.close();
}

await browser.close();
server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
