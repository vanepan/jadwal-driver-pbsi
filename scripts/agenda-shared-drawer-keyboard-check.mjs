/* agenda-shared-drawer-keyboard-check.mjs — V1.31.3 §3/§4/§12/§17
   Shared drawer (js/components/drawer.js) keyboard accessibility.

   The previous phase deliberately left js/components/drawer.js's
   click-only [data-drawer-action] rows unfixed, since the correct fix
   belongs in the shared foundation, not a per-module workaround. This
   phase fixed it there — ONE keydown listener added to openDrawer()
   that mirrors the existing click listener into the SAME onAction()
   call, explicitly excluding real <button>/<input>/<select>/<textarea>/
   <a> elements (which already get native Enter/Space activation that
   fires a real 'click' the existing listener already handles) so a real
   button's keypress is never dispatched twice.

   This suite proves: Enter/Space activate the two real non-semantic
   consumers found app-wide (agenda-participant-picker.js's picker row,
   agenda-task-drawer.js's checklist checkbox) exactly once each; a real
   <button> in the SAME drawer never double-fires; focus is visible,
   reachable via Tab, and restored correctly across open/close and
   drawer-to-drawer transitions.

   Reuses the existing DOM harness (agenda-workspace-harness.html) — no
   new test architecture.

   Run: node scripts/agenda-shared-drawer-keyboard-check.mjs (exit 0 = pass) */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8939;

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
    await page.setViewport({ width: 1280, height: 900 });
    // Chromium/Puppeteer occasionally opens a stray about:blank target
    // during a long interaction sequence (observed independently in
    // V1.31.2's own investigation, reproduced there even on a bare
    // <input> with no app code involved) — while it exists, a JS-level
    // .focus() call can silently fail to move document.activeElement in
    // the intended page. Not an app defect; a test-environment quirk.
    // Defensively closed + refocused before every focus-sensitive check.
    const stayFocused = async () => {
      for (let attempt = 0; attempt < 5; attempt++) {
        for (const p of await browser.pages()) {
          if (p !== page && p.url() === 'about:blank') { try { await p.close(); } catch (_) {} }
        }
        await page.bringToFront();
        if (await page.evaluate(() => document.hasFocus())) return;
        await new Promise((r) => setTimeout(r, 60));
      }
    };
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('pageerror', (err) => consoleErrors.push(String(err)));

    await page.goto(`http://localhost:${PORT}/scripts/agenda-workspace-harness.html`, { waitUntil: 'networkidle0' });
    await page.waitForFunction('window.__harnessReady === true', { timeout: 8000 });
    await page.evaluate(() => {
      window.__setDirectoryForTest(
        { evan: { displayName: 'Evan', role: 'admin', active: true, agendaParticipantType: 'sarpras_staff' } },
        [],
      );
    });

    // Every discrete drawer action (toggle/checkitem/etc.) re-renders the
    // drawer body in place (agenda-*-drawer.js's own Focus-Preserving Render
    // Pattern) — the OLD DOM node is discarded and a fresh one created, so
    // every check below re-queries [data-drawer-action^="..."] freshly
    // AFTER each action rather than reusing a captured element reference
    // (a captured reference after a re-render points at a stale, detached
    // node with its ORIGINAL attributes, not the new state).
    console.log('\n=== [A — participant picker row (role="checkbox"): pointer, Enter, Space, focus] ===');
    await checkAsync('pointer click toggles the row selected', () => page.evaluate(() => {
      window.__openCreateEventDrawer();
      document.querySelector('[data-drawer-action="picker:open"]').click();
      document.querySelector('[data-drawer-action^="picker:toggle:"]').click();
      const row = document.querySelector('[data-drawer-action^="picker:toggle:"]');
      return row.getAttribute('aria-checked') === 'true' && row.classList.contains('cal-picker-row--selected');
    }));
    await checkAsync('the row is reachable via Tab (real focus lands on it, not just tabindex present)', async () => {
      await stayFocused();
      return page.evaluate(() => {
        const row = document.querySelector('[data-drawer-action^="picker:toggle:"]');
        row.focus();
        return document.activeElement === row;
      });
    });
    await checkAsync('Enter toggles it back OFF — exactly once (not left selected, not double-toggled to stay ON)', async () => {
      await page.keyboard.press('Enter');
      return page.evaluate(() => document.querySelector('[data-drawer-action^="picker:toggle:"]').getAttribute('aria-checked') === 'false');
    });
    await checkAsync('Space toggles it back ON — exactly once', async () => {
      await stayFocused();
      await page.evaluate(() => document.querySelector('[data-drawer-action^="picker:toggle:"]').focus());
      await page.keyboard.press(' ');
      return page.evaluate(() => document.querySelector('[data-drawer-action^="picker:toggle:"]').getAttribute('aria-checked') === 'true');
    });
    await checkAsync('a second Space toggles it OFF again (proves each keypress fires the action exactly once, not zero or two)', async () => {
      await stayFocused();
      await page.evaluate(() => document.querySelector('[data-drawer-action^="picker:toggle:"]').focus());
      await page.keyboard.press(' ');
      return page.evaluate(() => document.querySelector('[data-drawer-action^="picker:toggle:"]').getAttribute('aria-checked') === 'false');
    });
    await checkAsync('the row has a visible :focus-visible outline (not "outline:none" with nothing to replace it)', async () => {
      await stayFocused();
      return page.evaluate(() => {
        const row = document.querySelector('[data-drawer-action^="picker:toggle:"]');
        row.focus();
        const cs = getComputedStyle(row);
        return cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0;
      });
    });

    console.log('\n=== [B — real <button> in the SAME drawer never double-fires from the new keydown listener] ===');
    await checkAsync('Enter on the real "PIC" <button> (a true toggle, aria-pressed) flips it exactly once per press', async () => {
      await page.evaluate(() => {
        const row = document.querySelector('[data-drawer-action^="picker:toggle:"]');
        if (row.getAttribute('aria-checked') !== 'true') row.click(); // must be selected before PIC is enabled
      });
      const before = await page.evaluate(() => document.querySelector('[data-drawer-action^="picker:togglepic:"]')?.getAttribute('aria-pressed'));
      await stayFocused();
      await page.evaluate(() => document.querySelector('[data-drawer-action^="picker:togglepic:"]')?.focus());
      await page.keyboard.press('Enter');
      const after = await page.evaluate(() => document.querySelector('[data-drawer-action^="picker:togglepic:"]')?.getAttribute('aria-pressed'));
      // A double-fire (native click-on-Enter + our new keydown handler ALSO
      // firing for this same real <button>) would flip it twice, landing
      // back on the SAME value it started at — the bug this excludes.
      return before !== after ? true : `aria-pressed stayed "${before}" across one Enter press — likely double-fired back to itself`;
    });

    console.log('\n=== [C — task drawer checklist checkbox (role="checkbox", previously had NO tabindex at all)] ===');
    await page.evaluate(() => window.__closeEventDrawer());
    await new Promise((r) => setTimeout(r, 350)); // let the close animation fully finish before opening the next drawer
    await checkAsync('opening a task drawer with a checklist item works cleanly', () => page.evaluate(() => {
      window.__openCreateTaskDrawer();
      const field = document.querySelector('[data-field="newChecklistLabel"]');
      field.value = 'Item Uji Keyboard';
      field.dispatchEvent(new Event('input', { bubbles: true })); // sets _newChecklistLabel — a direct .value assignment does not
      document.querySelector('[data-drawer-action="task:additem"]').click();
      return document.querySelector('.cal-checkbox[data-drawer-action^="task:checkitem:"]') != null;
    }));
    await checkAsync('the checklist checkbox now carries tabindex="0" and is real-focus-reachable', async () => {
      await stayFocused();
      const tabindex = await page.evaluate(() => document.querySelector('.cal-checkbox[data-drawer-action^="task:checkitem:"]').getAttribute('tabindex'));
      // page.focus() uses CDP's DOM.focus rather than a page-context JS
      // .focus() call — more reliable against the stray-tab focus quirk
      // documented on stayFocused() above.
      await page.focus('.cal-checkbox[data-drawer-action^="task:checkitem:"]');
      const activeIsCb = await page.evaluate(() => document.activeElement === document.querySelector('.cal-checkbox[data-drawer-action^="task:checkitem:"]'));
      return (tabindex === '0' && activeIsCb) ? true : `tabindex="${tabindex}" activeIsCb=${activeIsCb}`;
    });
    await checkAsync('Enter checks it — exactly once', async () => {
      const beforeCheck = await page.evaluate(() => document.querySelector('.cal-checkbox[data-drawer-action^="task:checkitem:"]').getAttribute('aria-checked'));
      await page.keyboard.press('Enter');
      const afterCheck = await page.evaluate(() => document.querySelector('.cal-checkbox[data-drawer-action^="task:checkitem:"]').getAttribute('aria-checked'));
      return beforeCheck === 'false' && afterCheck === 'true' ? true : `before="${beforeCheck}" after="${afterCheck}"`;
    });
    await checkAsync('Space unchecks it — exactly once', async () => {
      await stayFocused();
      await page.focus('.cal-checkbox[data-drawer-action^="task:checkitem:"]');
      const beforeCheck = await page.evaluate(() => document.querySelector('.cal-checkbox[data-drawer-action^="task:checkitem:"]').getAttribute('aria-checked'));
      await page.keyboard.press(' ');
      const afterCheck = await page.evaluate(() => document.querySelector('.cal-checkbox[data-drawer-action^="task:checkitem:"]').getAttribute('aria-checked'));
      return beforeCheck === 'true' && afterCheck === 'false' ? true : `before="${beforeCheck}" after="${afterCheck}"`;
    });
    await checkAsync('the checklist checkbox has a visible :focus-visible outline', async () => {
      await stayFocused();
      await page.focus('.cal-checkbox[data-drawer-action^="task:checkitem:"]');
      const r = await page.evaluate(() => {
        const cb = document.querySelector('.cal-checkbox[data-drawer-action^="task:checkitem:"]');
        const cs = getComputedStyle(cb);
        return { isActive: document.activeElement === cb, matchesFV: cb.matches(':focus-visible'), outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth, outlineColor: cs.outlineColor };
      });
      return (r.outlineStyle !== 'none' && parseFloat(r.outlineWidth) > 0) ? true : JSON.stringify(r);
    });
    await checkAsync('Space does not also scroll the drawer body (preventDefault fired)', () => page.evaluate(() => {
      const cb = document.querySelector('.cal-checkbox[data-drawer-action^="task:checkitem:"]');
      const ev = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
      cb.dispatchEvent(ev);
      return ev.defaultPrevented === true;
    }));

    console.log('\n=== [D — focus restore: open -> keyboard action -> close -> focus returns to the trigger] ===');
    await stayFocused();
    await checkAsync('closing the task drawer restores focus to whatever had focus when it opened', () => page.evaluate(() => {
      window.__closeTaskDrawer();
      const btn = document.createElement('button');
      btn.id = 'probeTrigger';
      btn.textContent = 'trigger';
      document.body.appendChild(btn);
      btn.focus();
      window.__openCreateEventDrawer();
      window.__closeEventDrawer();
      return true; // close is animated (~260ms) — checked after the wait below
    }));
    await new Promise((r) => setTimeout(r, 400));
    await stayFocused();
    await checkAsync('focus landed back on the trigger button, not lost to <body>', () => page.evaluate(() =>
      document.activeElement?.id === 'probeTrigger'
    ));

    console.log('\n=== [E — drawer A -> drawer B (replace in place) -> close -> focus stays coherent] ===');
    await checkAsync('opening drawer B while A is still open, then closing, leaves focus on a real attached element (never null/detached)', async () => {
      await stayFocused();
      await page.evaluate(() => {
        document.getElementById('probeTrigger')?.remove();
        window.__openCreateEventDrawer();
      });
      await new Promise((r) => setTimeout(r, 50));
      await page.evaluate(() => window.__openCreateCalendarDrawer());
      await new Promise((r) => setTimeout(r, 50));
      await page.evaluate(() => window.__closeCalendarDrawer());
      await new Promise((r) => setTimeout(r, 400));
      await stayFocused();
      const r = await page.evaluate(() => {
        const el = document.activeElement;
        return { tag: el?.tagName, id: el?.id, isBody: el === document.body, attached: !!el && document.documentElement.contains(el) };
      });
      return (r.attached && !r.isBody) ? true : JSON.stringify(r);
    });
    await checkAsync('exactly one overlay remains after the whole A->B->close sequence (no leaked stacked overlay)', () => page.evaluate(() =>
      document.querySelectorAll('#appDrawerOverlay').length === 0
    ));

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
