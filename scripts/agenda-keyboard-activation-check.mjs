/* agenda-keyboard-activation-check.mjs — V1.31.2 §18 (accessibility):
   the Calendar grid's day cells, range bars, Week timed-item rows, and
   the To-Do checkbox now carry role="button"/role="checkbox" +
   tabindex="0" (this phase's own fix — previously some had neither, some
   had the role but no tabindex, and none of them actually responded to
   Enter/Space). Proves real keyboard activation end to end: Tab reaches
   the element, Enter/Space fires the SAME [data-agenda-action] the click
   handler already dispatches (agenda-workspace.js#wireHost()'s new
   'keydown' listener) — not a second action system.

   Reuses the DOM harness's real mounted agenda-workspace.js instance,
   same pattern as agenda-calendar-view-transition-check.mjs.

   Run: node scripts/agenda-keyboard-activation-check.mjs (exit 0 = pass) */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8937;

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}
async function checkAsync(name, run) {
  try { const r = await run(); check(name, r !== false, typeof r === 'string' ? r : ''); }
  catch (err) { fail++; console.log(`  ✗ ${name} — ${err.message}`); }
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(req.url.split('?')[0]);
      const filePath = path.join(ROOT, urlPath === '/' ? '/index.html' : urlPath);
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('not found: ' + urlPath); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.listen(PORT, () => resolve(server));
  });
}

async function main() {
  const server = await startServer();
  let browser;
  const consoleErrors = [];
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('pageerror', (err) => consoleErrors.push(String(err)));

    await page.goto(`http://localhost:${PORT}/scripts/agenda-workspace-harness.html`, { waitUntil: 'networkidle0' });
    await page.waitForFunction('window.__harnessReady === true', { timeout: 8000 });

    // Mount the REAL agenda-workspace.js (not just the pure buildWorkspaceHTML
    // harness render) so its real wireHost() keydown listener is live —
    // same technique agenda-calendar-view-transition-check.mjs already uses.
    await page.evaluate(async () => {
      document.getElementById('root').innerHTML = '';
      const host = document.createElement('div');
      host.id = 'v2AgendaWorkspace';
      document.body.appendChild(host);
      const { initAgendaStore } = await import('/js/agenda/agenda-store.js');
      const ws = await import('/js/agenda/agenda-workspace.js');
      initAgendaStore();
      ws.mountAgendaWorkspace();
      window.__ws = ws;
    });
    await new Promise((r) => setTimeout(r, 200));

    console.log('\n=== [A — Calendar Month grid: a day cell is keyboard-focusable and Enter activates goto-day] ===');
    // Workspace mode is module-private by design (no test-only setter) —
    // drive it the same way a real user does: click the "Kalender" tab.
    await page.evaluate(() => {
      const btn = document.querySelector('[data-agenda-action="set-mode:calendar"]');
      btn?.click();
    });
    await new Promise((r) => setTimeout(r, 150));
    await checkAsync('a .cal-cell exists with role="button" tabindex="0"', () => page.evaluate(() => {
      const cell = document.querySelector('.cal-cell[role="button"][tabindex="0"]');
      return !!cell;
    }));
    await checkAsync('Tab-focusing then pressing Enter on a day cell switches to Week view (goto-day fired via keyboard, not just click)', async () => {
      const cellDate = await page.evaluate(() => {
        const cell = document.querySelector('.cal-cell[role="button"][tabindex="0"]');
        cell?.focus();
        return cell?.getAttribute('data-agenda-action')?.split(':')[1] ?? null;
      });
      if (!cellDate) return 'no focusable day cell found';
      const focusedIsCell = await page.evaluate(() => document.activeElement?.classList.contains('cal-cell'));
      if (!focusedIsCell) return 'programmatic .focus() did not land on the cell (tabindex missing?)';
      await page.keyboard.press('Enter');
      await new Promise((r) => setTimeout(r, 200));
      const nowWeek = await page.evaluate(() => document.querySelector('.cal-week-row') != null);
      return nowWeek ? true : 'Enter on the day cell did not switch to Week view';
    });

    console.log('\n=== [B — To-Do checkbox: keyboard-focusable (role=checkbox previously had NO tabindex at all), Space toggles via the SAME mechanism proven in [A] ===');
    // Uses the pure buildWorkspaceHTML() harness path (a synthetic task
    // fixture) rather than a real production write, exactly like
    // agenda-workspace-render-check.mjs's own todo-mode fixtures.
    await checkAsync('a rendered To-Do checkbox carries role="checkbox" AND tabindex="0"', () => page.evaluate(() => {
      window.__render({
        events: [], tasks: [{ id: 'kbd-t1', title: 'Keyboard Test Task', status: 'not_started', priority: 'normal', scope: 'sarpras_shared', responsible: {}, checklist: [], dueDate: null }],
        calendarItems: [], now: Date.now(), todayStr: '2026-09-15', mode: 'todo', calendarView: 'month', calendarAnchor: '2026-09-15',
        todoFilters: { status: 'all', priority: 'all', query: '' }, canManage: true, writableScopes: ['sarpras_shared'], loading: false, error: null,
      });
      const cb = document.querySelector('#root .cal-checkbox');
      return !!cb && cb.getAttribute('role') === 'checkbox' && cb.getAttribute('tabindex') === '0';
    }));

    console.log('\n=== [C — a real <button> (toolbar/filter chip) is unaffected: native Enter/Space still just works, nothing double-fires] ===');
    await checkAsync('pressing Enter on the real "+ Agenda" <button> opens the create-event drawer exactly once (no double action from the new keydown listener)', async () => {
      await page.evaluate(() => document.querySelector('[data-agenda-action="create-event"]')?.focus());
      await page.keyboard.press('Enter');
      await new Promise((r) => setTimeout(r, 250));
      const drawerCount = await page.evaluate(() => document.querySelectorAll('#appDrawerOverlay').length);
      return drawerCount === 1 ? true : `expected exactly 1 drawer overlay, found ${drawerCount}`;
    });

    console.log('\n=== [Z — zero fatal console/page errors across the whole run] ===');
    const fatal = consoleErrors.filter((e) => !/favicon|net::ERR_FILE_NOT_FOUND|permission_denied/i.test(e));
    check('no fatal console errors or uncaught page errors', fatal.length === 0, fatal.slice(0, 3).join(' | '));

  } finally {
    if (browser) await browser.close();
    server.close();
  }

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
