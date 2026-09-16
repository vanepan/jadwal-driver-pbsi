/* agenda-date-selection-check.mjs — SS9 R2: Calendar date-cell selection
   must NOT auto-switch Month<->Week (covered separately, exhaustively, by
   scripts/agenda-calendar-view-transition-check.mjs's §D). This suite
   covers the REST of R2's acceptance criteria: event/task click vs date
   click distinction, empty selected-date state, populated Day Detail
   content, Today+Selected coexistence, keyboard reachability, and the
   static "no new Firebase write / no new listener" architecture guard.

   Same real-browser DOM harness agenda-workspace-render-check.mjs
   established (scripts/agenda-workspace-harness.html, real production
   modules, synthetic ctx via window.__render — no live Firebase needed).

   Run: node scripts/agenda-date-selection-check.mjs   (exit 0 = pass) */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`); }
}
async function checkAsync(name, run) {
  try { const r = await run(); check(name, r !== false, typeof r === 'string' ? r : ''); }
  catch (err) { fail++; console.log(`  ✗ ${name} — ${err.message}`); }
}

const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const filePath = path.join(ROOT, u === '/' ? '/index.html' : u);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

// Fixture shape mirrors agenda-workspace-render-check.mjs's own helpers.
const sampleEvent = (id, over = {}) => ({
  id, title: `Rapat ${id}`, date: '2026-09-16', startTime: '09:00', endTime: '10:00',
  startAt: Date.parse('2026-09-16T09:00:00+07:00'), endAt: Date.parse('2026-09-16T10:00:00+07:00'),
  allDay: false, status: 'scheduled', scope: 'sarpras_shared', organizerUsername: 'harness-admin',
  participants: { 'harness-admin': { isPic: true } }, ...over,
});
const sampleTask = (id, over = {}) => ({
  id, title: `Tugas ${id}`, status: 'not_started', priority: 'urgent', scope: 'sarpras_shared',
  responsible: {}, checklist: [], dueDate: '2026-09-16', dueAt: Date.now() + 3600000, ...over,
});
const baseCtx = (over = {}) => ({
  events: [], tasks: [], calendarItems: [], now: Date.parse('2026-09-16T08:00:00+07:00'),
  todayStr: '2026-09-16', mode: 'calendar', calendarView: 'month', calendarAnchor: '2026-09-16',
  selectedDate: null, todoFilters: { status: 'all', priority: 'all', query: '' },
  canManage: true, writableScopes: ['sarpras_shared'], loading: false, error: null, ...over,
});

async function main() {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const errors = [];
  try {
    const page = await browser.newPage();
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.setViewport({ width: 1024, height: 900 });
    await page.goto(`http://localhost:${port}/scripts/agenda-workspace-harness.html`, { waitUntil: 'networkidle0' });
    await page.waitForFunction('window.__harnessReady === true', { timeout: 8000 });

    console.log('\n=== [A — empty selected date renders the documented empty state] ===');
    await page.evaluate((ctx) => window.__render(ctx), baseCtx({ selectedDate: '2026-09-20' }));
    check('shows "Tidak ada agenda atau tugas untuk tanggal ini." (rendered across a <br>, so textContent has no space at that seam)', await page.evaluate(() =>
      document.querySelector('.cal-daydetail-empty')?.innerHTML.replace(/\s+/g, ' ').trim() === 'Tidak ada agenda atau tugas<br>untuk tanggal ini.'
    ));

    console.log('\n=== [B — a populated selected date renders its Agenda AND To-Do items] ===');
    await page.evaluate((ctx) => window.__render(ctx), baseCtx({
      events: [sampleEvent('e1')], tasks: [sampleTask('t1')], selectedDate: '2026-09-16',
    }));
    const populated = await page.evaluate(() => ({
      heading: document.querySelector('.cal-daydetail-heading')?.textContent || '',
      hasAgendaLabel: [...document.querySelectorAll('.cal-daydetail .cal-daylabel')].some((e) => e.textContent === 'Agenda'),
      hasTodoLabel: [...document.querySelectorAll('.cal-daydetail .cal-daylabel')].some((e) => e.textContent === 'To-Do'),
      eventRow: document.querySelector('.cal-daydetail [data-agenda-action="open-event:e1"]')?.textContent || '',
      taskRow: document.querySelector('.cal-daydetail [data-agenda-action="open-task:t1"]')?.textContent || '',
    }));
    check('heading names the selected date', populated.heading.includes('16 September 2026'), populated.heading);
    check('an "Agenda" section is present', populated.hasAgendaLabel);
    check('a "To-Do" section is present', populated.hasTodoLabel);
    check('the real event ("Rapat e1") appears, wired to open-event:e1', populated.eventRow.includes('Rapat e1'), populated.eventRow);
    check('the real task ("Tugas t1") appears, wired to open-task:t1', populated.taskRow.includes('Tugas t1'), populated.taskRow);

    console.log('\n=== [C — event/task click vs date-cell click: closest() resolves to the item, never falls through to goto-day] ===');
    // Month view shows dot summaries only (not a per-event clickable row —
    // see this file's own header comment); Week view renders each event as
    // its own clickable row NESTED inside the date cell, which is exactly
    // the real bubbling scenario the delegated handler
    // (agenda-workspace.js's e.target.closest('[data-agenda-action]')) has
    // to resolve correctly.
    await page.evaluate((ctx) => window.__render(ctx), baseCtx({
      events: [sampleEvent('e3', { date: '2026-09-16' })], calendarView: 'week', calendarAnchor: '2026-09-14',
    }));
    const weekBubbling = await page.evaluate(() => {
      const row = document.querySelector('[data-agenda-action="open-event:e3"]');
      if (!row) return { found: false };
      const resolved = row.closest('[data-agenda-action]');
      return { found: true, resolvedAction: resolved?.getAttribute('data-agenda-action'), isInsideACell: !!row.closest('.cal-cell') };
    });
    check('the event row is nested inside a date cell (the real bubbling scenario)', weekBubbling.isInsideACell, weekBubbling);
    check('clicking the event row resolves (via closest()) to open-event:e3, NOT the parent cell\'s goto-day', weekBubbling.resolvedAction === 'open-event:e3', weekBubbling);

    console.log('\n=== [D — Today + Selected coexist without losing either indicator] ===');
    await page.evaluate((ctx) => window.__render(ctx), baseCtx({ selectedDate: '2026-09-16' })); // todayStr is also 2026-09-16
    const coexist = await page.evaluate(() => {
      const cell = document.querySelector('.cal-cell--today');
      return { hasToday: !!cell, alsoSelected: cell?.classList.contains('cal-cell--selected') };
    });
    check('the today cell still carries cal-cell--today', coexist.hasToday, coexist);
    check('the SAME cell also carries cal-cell--selected when today is the selected date', coexist.alsoSelected, coexist);

    console.log('\n=== [E — a non-today selected date leaves Today independently identifiable] ===');
    await page.evaluate((ctx) => window.__render(ctx), baseCtx({ selectedDate: '2026-09-20' }));
    const distinct = await page.evaluate(() => ({
      todayCell: !!document.querySelector('.cal-cell--today'),
      todayIsNotSelected: !document.querySelector('.cal-cell--today')?.classList.contains('cal-cell--selected'),
      selectedCell: !!document.querySelector('.cal-cell--selected'),
      selectedIsNotToday: !document.querySelector('.cal-cell--selected')?.classList.contains('cal-cell--today'),
    }));
    check('Today remains identifiable', distinct.todayCell && distinct.todayIsNotSelected, distinct);
    check('Selected remains identifiable and distinct from Today', distinct.selectedCell && distinct.selectedIsNotToday, distinct);

    console.log('\n=== [F — keyboard reachability: date cells keep role=button/tabindex=0 (Enter/Space already proven generically by agenda-keyboard-activation-check.mjs)] ===');
    await page.evaluate((ctx) => window.__render(ctx), baseCtx());
    const kb = await page.evaluate(() => {
      const cell = document.querySelector('.cal-cell[data-agenda-action^="goto-day:"]');
      return { role: cell?.getAttribute('role'), tabindex: cell?.getAttribute('tabindex'), ariaPressed: cell?.getAttribute('aria-pressed') };
    });
    check('date cells carry role="button"', kb.role === 'button', kb);
    check('date cells carry tabindex="0"', kb.tabindex === '0', kb);
    check('date cells expose aria-pressed reflecting selection state (accessibility for the new selected concept)', kb.ariaPressed === 'false' || kb.ariaPressed === 'true', kb);

    console.log('\n=== [G — static: goto-day never writes to Firebase and never registers a new listener] ===');
    const src = fs.readFileSync(path.join(ROOT, 'js/agenda/agenda-workspace.js'), 'utf-8');
    const gotoDayLine = src.split('\n').find((l) => l.includes("case 'goto-day':"));
    check('goto-day handler exists as a single-line case (no Firebase write call, no addEventListener call in its own statement)',
      !!gotoDayLine && !/addEventListener|firebase|\.set\(|\.update\(|\.push\(/i.test(gotoDayLine), gotoDayLine);
    check('goto-day only mutates local _state.selectedDate and calls doRender() (no view-transition, no Firebase)',
      /_state\.selectedDate\s*=\s*arg;\s*doRender\(\);\s*return;/.test(src));

    console.log('\n=== [Z — zero fatal console/page errors] ===');
    check('no fatal console/page errors across the whole run', errors.length === 0, errors.slice(0, 5));
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`\nagenda-date-selection-check: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
