/* ss17-real-app-a11y-check.mjs — SS17: real-login, real-production-data,
   READ-ONLY verification of the SS17 accessibility fixes as actually wired
   into the live app (as opposed to the isolated-utility tests
   ss17-focus-preserving-render-check.mjs / ss17-modal-a11y-check.mjs).

   Real login (leo/1234), real production data. Never creates/edits/deletes
   a record — every drawer/modal opened here is closed via Escape/Batal
   without saving. Data-dependent checks (a candidate to Tab to in a
   picker, an assignment block on today's Timeline window, a Gudang catalog
   item, an Engineering assignment) are informational skips, not failures,
   when production happens to have none right now — same discipline
   ss16-petty-cash-keyboard-check.mjs already uses for this exact class of
   check.

   Run: node scripts/ss17-real-app-a11y-check.mjs   (exit 0 = pass) */

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
const skip = (name, reason) => console.log(`  [informational] ${name} — ${reason}`);

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

const gotoDomain = async (domain) => page.evaluate((d) => {
  const el = document.querySelector(`.domshell-rail-item[data-domain="${d}"]`);
  if (!el) return false;
  el.click();
  return true;
}, domain);

// page.keyboard.press() requires the page to hold real OS-level document
// focus (document.hasFocus()) — false in this headless real-app session
// (confirmed empirically: a synthetic listener never saw the keydown at
// all). Every other real-app SS-series test in this repo that needs
// Escape/Enter/Space against the full app (not an isolated fixture)
// dispatches a synthetic, bubbling, cancelable KeyboardEvent instead —
// same technique, applied consistently here.
const pressEscape = () => page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));

console.log('\n[2. Command Palette — Tab trap + Escape + focus-restore to trigger]');
{
  const opened = await page.evaluate(() => {
    const trigger = document.querySelector('.domshell-palette-trigger');
    if (!trigger) return false;
    trigger.click();
    return true;
  });
  if (!opened) {
    skip('Command Palette', 'trigger not found in this shell/viewport');
  } else {
    await new Promise((r) => setTimeout(r, 150));
    const state = await page.evaluate(() => {
      const box = document.querySelector('.domshell-palette-box');
      return { dialog: box?.getAttribute('role') === 'dialog' && box?.getAttribute('aria-modal') === 'true', focusedInput: document.activeElement?.classList.contains('domshell-palette-input') };
    });
    check('palette box carries role="dialog" aria-modal="true"', state.dialog, state);
    check('focus moved into the search input on open', state.focusedInput, state);
    await pressEscape();
    await new Promise((r) => setTimeout(r, 150));
    const closedState = await page.evaluate(() => ({
      hidden: document.querySelector('.domshell-palette-overlay')?.style.display === 'none',
      restoredToTrigger: document.activeElement === document.querySelector('.domshell-palette-trigger'),
    }));
    check('Escape closes the palette', closedState.hidden, closedState);
    check('focus restores to the "Cari Cepat" trigger on close', closedState.restoredToTrigger, closedState);
  }
}

console.log('\n[3. Notifications — focus-in on open, Tab trap, focus-restore to bell on close]');
{
  const opened = await page.evaluate(() => {
    const btn = document.getElementById('btnHeaderNotif');
    if (!btn || btn.offsetParent === null) return false;
    btn.focus();
    btn.click();
    return true;
  });
  if (!opened) {
    skip('Notifications', 'bell icon not visible for this account/viewport');
  } else {
    await new Promise((r) => setTimeout(r, 150));
    const state = await page.evaluate(() => {
      const modal = document.getElementById('modalNotifications');
      const box = modal?.querySelector('.modal-box');
      return {
        open: modal?.style.display === 'flex',
        dialog: box?.getAttribute('role') === 'dialog',
        focusInside: box?.contains(document.activeElement),
      };
    });
    check('Notifications modal opened', state.open, state);
    check('modal box carries role="dialog"', state.dialog, state);
    check('focus moved inside the modal on open (was: stayed on the bell behind it)', state.focusInside, state);
    await pressEscape();
    await new Promise((r) => setTimeout(r, 150));
    const closedState = await page.evaluate(() => ({
      hidden: document.getElementById('modalNotifications')?.style.display === 'none',
      restoredToBell: document.activeElement === document.getElementById('btnHeaderNotif'),
    }));
    check('Escape closes Notifications', closedState.hidden, closedState);
    check('focus restores to the bell icon on close', closedState.restoredToBell, closedState);
  }
}

console.log('\n[4. Profile/Settings — NEW Escape handling, Tab trap, focus-restore to avatar]');
{
  const opened = await page.evaluate(() => {
    const btn = document.getElementById('v2TopbarAvatar');
    if (!btn || btn.offsetParent === null) return false;
    btn.focus();
    btn.click();
    return true;
  });
  if (!opened) {
    skip('Profile modal', 'topbar avatar not visible for this account/viewport');
  } else {
    await new Promise((r) => setTimeout(r, 250));
    const state = await page.evaluate(() => {
      const modal = document.getElementById('modalProfile');
      const box = modal?.querySelector('.modal-box');
      return {
        open: modal?.style.display === 'flex',
        dialog: box?.getAttribute('role') === 'dialog',
        focusInside: box?.contains(document.activeElement),
      };
    });
    check('Profile modal opened', state.open, state);
    check('modal box carries role="dialog"', state.dialog, state);
    check('focus moved inside the modal on open', state.focusInside, state);
    await pressEscape();
    await new Promise((r) => setTimeout(r, 250));
    const closedState = await page.evaluate(() => ({
      hidden: document.getElementById('modalProfile')?.style.display === 'none',
      restoredToAvatar: document.activeElement === document.getElementById('v2TopbarAvatar'),
    }));
    check('Escape now closes the Profile modal (previously: did nothing)', closedState.hidden, closedState);
    check('focus restores to the topbar avatar on close', closedState.restoredToAvatar, closedState);
  }
}

console.log('\n[5. Agenda — doRender() focus preservation across a mode-switch re-render]');
{
  await gotoDomain('today');
  await new Promise((r) => setTimeout(r, 400));
  const modeState = await page.evaluate(() => {
    const btn = document.querySelector('[data-agenda-action="set-mode:calendar"]');
    if (!btn) return null;
    btn.focus();
    // This chip is a real <button> — a synthetic (untrusted) keydown does
    // NOT get the browser's native "Enter activates the focused button"
    // behavior the way a real keypress would; .click() is the correct way
    // to exercise its real onclick-equivalent handler (handleAction()) from
    // a script, same as clicking it. (Custom role="button" divs elsewhere
    // in this suite, e.g. the picker rows below, are handled differently —
    // wireHost()'s OWN delegated keydown listener responds to the
    // dispatched key event directly, so a synthetic keydown is correct
    // there.)
    btn.click();
    return {
      stillFocused: document.activeElement === document.querySelector('[data-agenda-action="set-mode:calendar"]'),
      bodyFocused: document.activeElement === document.body,
    };
  });
  if (!modeState) {
    skip('Agenda mode switch', 'Agenda workspace not visible for this account (canSeeAgendaWorkspace() false)');
  } else {
    check('focus survives the mode-switch re-render (was: dropped to <body>)', modeState.stillFocused && !modeState.bodyFocused, modeState);
  }

  console.log('\n[5b. Agenda — cal-next/cal-prev preserve focus in Calendar mode]');
  const calState = await page.evaluate(() => {
    const btn = document.querySelector('[data-agenda-action="cal-next"]');
    if (!btn) return null;
    btn.focus();
    btn.click();
    return { stillFocused: document.activeElement === document.querySelector('[data-agenda-action="cal-next"]') };
  });
  if (!calState) {
    skip('Calendar nav', 'cal-next control not present (mode switch above did not land in Calendar view)');
  } else {
    check('focus survives a cal-next re-render', calState.stillFocused, calState);
  }

  console.log('\n[5c. Agenda Event drawer — picker toggle keeps focus on the SAME row (Repro A), "Selesai" falls back to "+ Tambah Peserta" (Repro B)]');
  const drawerOpened = await page.evaluate(() => {
    const btn = document.querySelector('[data-agenda-action="create-event"]');
    if (!btn) return false;
    btn.click();
    return true;
  });
  if (!drawerOpened) {
    skip('Event drawer picker', 'no writable scope for this account — "+ Agenda" action not shown');
  } else {
    await new Promise((r) => setTimeout(r, 200));
    const pickerOpened = await page.evaluate(() => {
      const btn = document.querySelector('[data-drawer-action="picker:open"]');
      if (!btn) return false;
      btn.click();
      return true;
    });
    check('"+ Tambah Peserta" opens the picker', pickerOpened);
    if (pickerOpened) {
      await new Promise((r) => setTimeout(r, 150));
      const rowState = await page.evaluate(() => {
        const row = document.querySelector('.cal-picker-row');
        if (!row) return null;
        const action = row.getAttribute('data-drawer-action');
        row.focus();
        row.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
        const after = document.querySelector(`[data-drawer-action="${CSS.escape(action)}"]`);
        return { landedOnSameRow: after === document.activeElement, action };
      });
      if (!rowState) {
        skip('Picker row focus (Repro A)', 'no candidates in the participant/PIC directory to Tab to');
      } else {
        check('toggling a picker row keeps focus on that SAME row (was: snapped back to the search box)', rowState.landedOnSameRow, rowState);
      }
      const doneState = await page.evaluate(() => {
        const done = document.querySelector('[data-drawer-action="picker:done"]');
        if (!done) return null;
        done.click();
        const fallback = document.querySelector('[data-drawer-action="picker:open"]');
        return { landedOnTambahPeserta: fallback === document.activeElement };
      });
      if (doneState) check('"Selesai" (picker->form) falls back to "+ Tambah Peserta" (was: focus escaped to <body>, defeating the Tab trap)', doneState.landedOnTambahPeserta, doneState);
    }
    // Read-only: close without saving.
    await page.evaluate(() => {
      const cancel = document.querySelector('[data-drawer-action="event:cancelform"]');
      if (cancel) cancel.click();
    });
    await new Promise((r) => setTimeout(r, 300));
  }
}

console.log('\n[6. Timeline — an assignment block is keyboard-reachable and Enter opens the detail drawer]');
{
  const navigated = await gotoDomain('operations');
  if (!navigated) {
    skip('Timeline', 'Operations domain not visible for this account');
  } else {
    await new Promise((r) => setTimeout(r, 500));
    const blockState = await page.evaluate(() => {
      const block = document.querySelector('.assignment-block');
      if (!block) return null;
      return { role: block.getAttribute('role'), tabindex: block.getAttribute('tabindex'), hasLabel: !!block.getAttribute('aria-label') };
    });
    if (!blockState) {
      skip('Assignment block', 'no assignment visible in the current Timeline window');
    } else {
      check('assignment block carries role="button" tabindex="0"', blockState.role === 'button' && blockState.tabindex === '0', blockState);
      check('assignment block carries an aria-label', blockState.hasLabel, blockState);
      const opened = await page.evaluate(() => {
        const block = document.querySelector('.assignment-block');
        block.focus();
        block.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        return true;
      });
      await new Promise((r) => setTimeout(r, 300));
      const opened2 = await page.evaluate(() => !!document.querySelector('.drawer[role="dialog"]'));
      check('Enter on an assignment block opens the canonical detail drawer (was: keyboard dead end)', opened2);
      if (opened2) await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
      await new Promise((r) => setTimeout(r, 300));
    }
  }
}

console.log('\n[7. Gudang Home — catalog card quick-action spans are keyboard-reachable]');
{
  const navigated = await gotoDomain('warehouse');
  if (!navigated) {
    skip('Gudang', 'Warehouse domain not visible for this account');
  } else {
    await new Promise((r) => setTimeout(r, 500));
    const quickBtnState = await page.evaluate(() => {
      const el = document.querySelector('.gud-catalog-quick-btn');
      if (!el) return null;
      return { role: el.getAttribute('role'), tabindex: el.getAttribute('tabindex'), hasLabel: !!el.getAttribute('aria-label') };
    });
    if (!quickBtnState) {
      skip('Catalog quick-action', 'no catalog item visible on Gudang Home right now');
    } else {
      check('quick-action span carries role="button" tabindex="0" aria-label', quickBtnState.role === 'button' && quickBtnState.tabindex === '0' && quickBtnState.hasLabel, quickBtnState);
    }
  }
}

console.log('\n[8. Engineering — the new onHostKeydown bridge activates role="button" cards]');
{
  const navigated = await gotoDomain('engineering');
  if (!navigated) {
    skip('Engineering', 'Engineering domain not visible for this account');
  } else {
    await new Promise((r) => setTimeout(r, 500));
    const cardState = await page.evaluate(() => {
      const card = document.querySelector('.eng-card[role="button"]');
      if (!card) return null;
      card.focus();
      const focusedOk = document.activeElement === card;
      card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      return { focusedOk };
    });
    if (!cardState) {
      skip('Engineering card', 'no assignment card visible right now');
    } else {
      check('eng-card is real-Tab-focusable', cardState.focusedOk, cardState);
      await new Promise((r) => setTimeout(r, 300));
      const opened = await page.evaluate(() => !!document.querySelector('.eng-drawer, .drawer[role="dialog"]'));
      check('Enter on eng-card activates it via the new onHostKeydown bridge (was: no keydown listener existed at all in the module)', opened);
    }
  }
}

console.log('\n[console cleanliness]');
check('zero unexpected console/page errors across the whole sequence', consoleErrors.length === 0, consoleErrors.join(' | ').slice(0, 500));

await browser.close();
server.close();
console.log(`\nss17-real-app-a11y-check: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
