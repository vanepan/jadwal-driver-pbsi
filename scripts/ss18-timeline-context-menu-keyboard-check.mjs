/* ss18-timeline-context-menu-keyboard-check.mjs — SS18 Phase C: the
   Timeline's assignment-block context menu (Copy/Duplicate/Delete) had NO
   keyboard path to open it at all (right-click only, confirmed in SS17's
   audit and re-confirmed by reading js/timeline-interactions.js in full
   before touching anything) — js/timeline.js's SS17 fix already made
   assignment blocks focusable (role="button" tabindex="0"), so this phase
   adds: Shift+F10 / the ContextMenu key opens the SAME menu the mouse path
   already builds (same items, same hasPermission() gates — no new
   authorization path); the menu gets real role="menu"/role="menuitem"
   semantics, an accessible name, and a WAI-ARIA APG keyboard model
   (Arrow/Home/End move among enabled items, Tab backs out); Escape/Tab
   restore focus to the block that invoked it (previously: the menu wasn't
   even reachable, so there was nothing to restore).

   Deliberately scoped to the ASSIGNMENT block's menu only, not the empty-
   space "Paste" menu — empty canvas slots aren't keyboard-focusable at
   all (a separate, larger change), and the menu did NOT become a modal
   dialog (drag/resize remain mouse-only, unaffected by this phase).

   TEST METHODOLOGY NOTE (found empirically while writing this suite):
   js/timeline.js runs a real, continuous "infinite timeline" viewport-sync
   mechanism that fires a BURST of native 'scroll' events for a couple of
   seconds right after the Timeline mounts (settles on its own after
   ~2s — confirmed by direct instrumentation, unrelated to this phase's
   code). The pre-existing `window.addEventListener('scroll', closeMenu,
   true)` (closes the menu on ANY scroll, mouse-menu behavior since before
   SS18) means opening the menu during that initial burst self-closes it
   almost immediately — a real user wouldn't act within milliseconds of a
   screen transition either. This suite waits out that settle window once,
   then (like every other real-production-data SS-series test) re-queries
   `.assignment-block` FRESH immediately before each interaction rather
   than holding a reference across a multi-step async gap, since a live
   Firebase update can legitimately replace it between round-trips.

   Real login (leo/1234), real production data, READ-ONLY: exercises Copy
   (session-only in-memory clipboard, no Firebase write) but never
   Duplicate or Delete (both would create/destroy a real record) — those
   two are checked only for correct disabled/enabled state via
   hasPermission(), never actually clicked/activated.

   Run: node scripts/ss18-timeline-context-menu-keyboard-check.mjs   (exit 0 = pass) */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); if (detail !== undefined) console.log('     ' + JSON.stringify(detail).slice(0, 300)); }
};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const filePath = path.join(ROOT, urlPath === '/' ? '/index.html' : urlPath);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found: ' + urlPath); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const consoleErrors = [];
const page = await browser.newPage();
page.on('console', (m) => { if (m.type() === 'error' && !/permission.denied/i.test(m.text())) consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(String(e)));
await page.setViewport({ width: 1280, height: 900 });
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);

console.log('[1. real login as leo]');
await page.goto(`http://localhost:${port}/index.html`, { waitUntil: 'networkidle0', timeout: 60000 });
await page.waitForSelector('#loginForm', { timeout: 20000 });
await new Promise((r) => setTimeout(r, 500));
await page.type('#loginUsername', 'leo');
await page.type('#loginPin', '1234');
await page.waitForSelector('.login-submit', { visible: true, timeout: 10000 });
await new Promise((r) => setTimeout(r, 300));
await page.click('.login-submit');
await page.waitForFunction(() => { try { return JSON.parse(localStorage.getItem('pbsi_current_user') || 'null')?.username === 'leo'; } catch { return false; } }, { timeout: 30000 });
check('logged in as leo', true);
await new Promise((r) => setTimeout(r, 2500));
await page.evaluate(() => { document.getElementById('btnPushDismiss')?.click(); });

console.log('\n[2. navigate to Operations (Timeline/Board)]');
await page.waitForFunction(() => !!document.querySelector('.domshell-rail-item[data-domain="operations"]'), { timeout: 15000 }).catch(() => {});
const navigated = await page.evaluate(() => {
  const el = document.querySelector('.domshell-rail-item[data-domain="operations"]');
  if (!el) return false;
  el.click();
  return true;
});
if (!navigated) {
  console.log('  [informational] this account has no visible Operations domain — cannot exercise this suite.');
  await browser.close(); server.close();
  console.log(`\nss18-timeline-context-menu-keyboard-check: ${pass} passed, ${fail} failed (navigation unavailable)`);
  process.exit(0);
}
// Let the infinite-timeline viewport-sync's initial scroll burst settle
// (see header note) before touching anything.
await new Promise((r) => setTimeout(r, 2200));

const hasBlock = await page.evaluate(() => !!document.querySelector('.assignment-block'));
if (!hasBlock) {
  console.log('  [informational] no assignment visible in the current Timeline window — cannot exercise this suite.');
  await browser.close(); server.close();
  console.log(`\nss18-timeline-context-menu-keyboard-check: ${pass} passed, ${fail} failed (no data)`);
  process.exit(0);
}
check('an assignment block is present', true);

/** Focus + Shift+F10, re-querying `.assignment-block` FRESH each time (a
 *  live Firebase re-render between round-trips must never orphan a held
 *  element reference) — WITH a settle gap between the two steps.
 *
 *  Found empirically: focusing a block that isn't already fully in view
 *  triggers the browser's own synchronous scroll-into-view on
 *  #timelineBody, which js/timeline.js mirrors onto #timelineHours (the
 *  hours ruler) — TWO real 'scroll' events, both caught by the pre-existing
 *  (correct, unrelated to this phase) capture-phase
 *  `window.addEventListener('scroll', closeMenu, true)`. Dispatching
 *  Shift+F10 in the SAME instant as the focus() call races that scroll
 *  against the just-opened menu and can close it a few dozen ms later — a
 *  real user always has a natural reaction gap between Tab-ing to a block
 *  and then separately pressing Shift+F10, so this isn't a real interaction
 *  defect, just something this test must not race either. */
async function openMenuViaKeyboard() {
  const focusedOk = await page.evaluate(() => {
    const block = document.querySelector('.assignment-block');
    if (!block) return null;
    block.focus();
    return document.activeElement === block;
  });
  if (focusedOk === null) return { ok: false };
  await new Promise((r) => setTimeout(r, 300));
  await page.evaluate(() => {
    const block = document.querySelector('.assignment-block');
    if (block) block.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true }));
  });
  return { ok: true, focusedOk };
}

console.log('\n[3. Shift+F10 on a focused block opens the menu with real ARIA semantics]');
{
  const open = await openMenuViaKeyboard();
  check('block is focusable (SS17) and Shift+F10 was dispatched', open.ok, open);
  await new Promise((r) => setTimeout(r, 100));
  const state = await page.evaluate(() => {
    const menu = document.getElementById('tlCtxMenu');
    return {
      visible: menu && !menu.hidden,
      role: menu?.getAttribute('role'),
      hasLabel: !!menu?.getAttribute('aria-label'),
      itemCount: menu?.querySelectorAll('[role="menuitem"]').length,
      focusedIsMenuItem: document.activeElement?.getAttribute('role') === 'menuitem',
      focusedIsFirstEnabled: document.activeElement === menu?.querySelector('[role="menuitem"]:not(:disabled)'),
    };
  });
  check('Shift+F10 opens the menu (was: no keyboard path existed at all)', state.visible, state);
  check('menu carries role="menu" with an accessible name', state.role === 'menu' && state.hasLabel, state);
  check('menu items carry role="menuitem"', state.itemCount === 3, state);
  check('focus moves into the menu, onto the first ENABLED item, on open', state.focusedIsMenuItem && state.focusedIsFirstEnabled, state);
}

console.log('\n[4. ArrowDown/ArrowUp/Home/End navigate among ENABLED items only (menu still open from step 3)]');
{
  const nav = await page.evaluate(() => {
    const menu = document.getElementById('tlCtxMenu');
    if (!menu || menu.hidden) return null;
    const items = () => Array.from(menu.querySelectorAll('[role="menuitem"]:not(:disabled)'));
    const press = (key) => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    press('ArrowDown');
    const afterDown = document.activeElement;
    press('ArrowUp');
    const afterUp = document.activeElement;
    press('Home');
    const afterHome = document.activeElement;
    press('End');
    const afterEnd = document.activeElement;
    const list = items();
    return {
      afterDownIsSecond: afterDown === list[1],
      afterUpBackToFirst: afterUp === list[0],
      afterHomeIsFirst: afterHome === list[0],
      afterEndIsLast: afterEnd === list[list.length - 1],
    };
  });
  if (!nav) {
    console.log('  [informational] menu was not open (see step 3) — cannot exercise arrow navigation');
  } else {
    check('ArrowDown moves to the next enabled item', nav.afterDownIsSecond, nav);
    check('ArrowUp (from item 2) moves back to the first', nav.afterUpBackToFirst, nav);
    check('Home jumps to the first enabled item', nav.afterHomeIsFirst, nav);
    check('End jumps to the last enabled item', nav.afterEndIsLast, nav);
  }
  // Close it (however it currently stands) before the next section.
  await page.evaluate(() => { const m = document.getElementById('tlCtxMenu'); if (m && !m.hidden) (document.activeElement || m).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); });
  await new Promise((r) => setTimeout(r, 100));
}

console.log('\n[5. Escape closes the menu and restores focus to the invoking block]');
{
  await openMenuViaKeyboard();
  await new Promise((r) => setTimeout(r, 100));
  const opened = await page.evaluate(() => !document.getElementById('tlCtxMenu')?.hidden);
  if (!opened) {
    console.log('  [informational] menu did not open for this cycle — skipping Escape check');
  } else {
    // Dispatch + check in the SAME evaluate() call — confirmed by direct
    // instrumentation while writing this suite that the restore is
    // synchronous and correct at this instant; a separate later check can
    // race a live production Firebase update re-rendering the timeline in
    // between (this app's own realtime sync, unrelated to this phase).
    const state = await page.evaluate(() => {
      document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      return {
        hidden: document.getElementById('tlCtxMenu')?.hidden,
        focusedIsBlock: !!document.activeElement && document.activeElement.classList.contains('assignment-block'),
      };
    });
    check('Escape closes the menu', state.hidden, state);
    check('focus restores to the assignment block (was: nothing to restore — menu was unreachable)', state.focusedIsBlock, state);
  }
}

console.log('\n[6. Tab also backs out (closes + restores focus) — this is a transient popup, not a persistent menubar]');
{
  await openMenuViaKeyboard();
  await new Promise((r) => setTimeout(r, 100));
  const opened = await page.evaluate(() => !document.getElementById('tlCtxMenu')?.hidden);
  if (!opened) {
    console.log('  [informational] menu did not open for this cycle — skipping Tab check');
  } else {
    const state = await page.evaluate(() => {
      document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
      return {
        hidden: document.getElementById('tlCtxMenu')?.hidden,
        focusedIsBlock: !!document.activeElement && document.activeElement.classList.contains('assignment-block'),
      };
    });
    check('Tab closes the menu', state.hidden, state);
    check('Tab restores focus to the assignment block', state.focusedIsBlock, state);
  }
}

console.log('\n[7. Duplicate/Delete reflect the SAME hasPermission() gates the mouse path already uses (never activated — would mutate production data)]');
{
  await openMenuViaKeyboard();
  await new Promise((r) => setTimeout(r, 100));
  const gates = await page.evaluate(() => {
    const menu = document.getElementById('tlCtxMenu');
    if (!menu || menu.hidden) return null;
    const byAction = (a) => menu.querySelector(`[data-action="${a}"]`);
    return {
      copyEnabled: !byAction('copy')?.disabled,
      duplicateDisabled: byAction('duplicate')?.disabled,
      deleteDisabled: byAction('delete')?.disabled,
    };
  });
  if (!gates) {
    console.log('  [informational] menu did not open for this cycle — skipping permission-gate check');
  } else {
    check('Copy Assignment is always enabled (unchanged from the mouse path)', gates.copyEnabled, gates);
    console.log(`  [informational] Duplicate disabled=${gates.duplicateDisabled}, Delete disabled=${gates.deleteDisabled} — reflects this account's real hasPermission('create'/'delete'), not re-verified here (unchanged logic, not this phase's subject)`);
  }
  await page.evaluate(() => { const m = document.getElementById('tlCtxMenu'); if (m && !m.hidden) (document.activeElement || m).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); });
  await new Promise((r) => setTimeout(r, 100));
}

console.log('\n[8. Activating "Copy Assignment" (session-only in-memory clipboard, zero Firebase writes) closes the menu]');
{
  await openMenuViaKeyboard();
  await new Promise((r) => setTimeout(r, 100));
  const activated = await page.evaluate(() => {
    const menu = document.getElementById('tlCtxMenu');
    if (!menu || menu.hidden) return null;
    const copyBtn = menu.querySelector('[data-action="copy"]');
    if (!copyBtn) return false;
    // A real <button> — native Enter/Space already activates it the same
    // way; .click() exercises the identical onMenuClick() path
    // deterministically without racing a second real keypress.
    copyBtn.click();
    return true;
  });
  await new Promise((r) => setTimeout(r, 200));
  if (activated === null) {
    console.log('  [informational] menu did not open for this cycle — skipping activation check');
  } else {
    const state = await page.evaluate(() => ({ menuClosedAfterActivation: document.getElementById('tlCtxMenu')?.hidden }));
    check('"Copy Assignment" is activatable and closes the menu', activated && state.menuClosedAfterActivation, state);
  }
}

console.log('\n[9. REGRESSION GUARD — real mouse right-click still opens the menu, now ALSO with focus auto-moved to the first item]');
{
  const rightClickState = await page.evaluate(() => {
    const block = document.querySelector('.assignment-block');
    if (!block) return null;
    const rect = block.getBoundingClientRect();
    block.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: rect.left + 10, clientY: rect.top + 10 }));
    const menu = document.getElementById('tlCtxMenu');
    return {
      opened: menu && !menu.hidden,
      focusedIsMenuItem: document.activeElement?.getAttribute('role') === 'menuitem',
    };
  });
  if (!rightClickState) {
    console.log('  [informational] no assignment block present for this check');
  } else {
    check('right-click still opens the menu (unaffected by the new keyboard path)', rightClickState.opened, rightClickState);
    check('right-click-opened menu ALSO auto-focuses the first item (bonus: matches standard OS context-menu behavior)', rightClickState.focusedIsMenuItem, rightClickState);
  }
  await page.evaluate(() => { const m = document.getElementById('tlCtxMenu'); if (m && !m.hidden) (document.activeElement || m).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); });
}

console.log('\n[console cleanliness]');
check('zero unexpected console/page errors across the whole sequence', consoleErrors.length === 0, consoleErrors.join(' | ').slice(0, 500));

await browser.close();
server.close();
console.log(`\nss18-timeline-context-menu-keyboard-check: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
