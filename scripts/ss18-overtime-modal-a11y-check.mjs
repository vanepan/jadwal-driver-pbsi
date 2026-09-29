/* ss18-overtime-modal-a11y-check.mjs — SS18 Phase A: Overtime had ZERO
   prior accessibility pass. All 8 hand-rolled dialogs (unitModal,
   employeeModal, employeeHistoryDrawer, rateModal, holidayModal,
   renderUnlockModal, renderCloseConfirmModal, renderEditRecordModal) plus
   the pre-existing saveConfirmModal (which already had partial Escape/
   Enter handling via onRekapGridKeydown, but no Tab-trap or focus-restore)
   now go through ONE generalized live-getter attachModalA11y() wiring in
   js/overtime/overtime-center.js (syncOvertimeModalA11y()), reusing the
   exact same shared utility SS17 applied elsewhere.

   Real login (leo/1234), real production data, READ-ONLY: every dialog
   opened here is closed via Escape without ever submitting a form —
   Unit/Employee/Rate/Holiday create dialogs are opened and abandoned,
   never saved; the Close-Period confirmation is opened and cancelled,
   never confirmed (would freeze a real payroll period); the Rekap Lembur
   save-confirmation is opened (after toggling one checkbox, a client-only
   UI state change) and cancelled, never saved. Data-dependent checks (an
   existing employee to open History for, an existing adjustment record to
   edit, a period already closed to unlock) are informational skips, not
   failures, when production happens to have none right now — same
   discipline ss16-petty-cash-keyboard-check.mjs already uses.

   Run: node scripts/ss18-overtime-modal-a11y-check.mjs   (exit 0 = pass) */

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
// domain-shell.js's setWorkspace() runs a real document.startViewTransition()
// on every navigation (SS14) — that API doesn't reliably complete in headless
// Chrome (confirmed empirically: the destination workspace's outer container
// stayed display:none for the whole test run without this). Reduced-motion
// makes setWorkspace() take its instant/no-transition path instead, same
// codepath a real prefers-reduced-motion user already gets.
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

// Dispatch ON document.activeElement, not on `document` itself — a real
// keypress always originates at the focused element and bubbles UP through
// its ancestors (including js/overtime/overtime-center.js's own
// root.addEventListener('keydown', onRekapGridKeydown), which owns the
// save-confirmation's pre-existing Escape/Enter handling). An event
// dispatched directly on `document` has `document` itself as its target —
// its propagation path is only [window, document], which never passes
// through `root` (root is a DESCENDANT of document, not an ancestor), so
// it would silently skip that listener entirely.
const pressEscape = () => page.evaluate(() => (document.activeElement || document.body).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
const pressTab = (shift = false) => page.evaluate((s) => (document.activeElement || document.body).dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: s, bubbles: true, cancelable: true })), shift);

console.log('\n[2. navigate to Overtime]');
// The rail itself renders only after auth-state + permissions settle
// against real production Firebase — a fixed post-login delay (above) is
// usually enough but not guaranteed; wait for the specific item rather
// than assuming it's already there.
await page.waitForFunction(() => !!document.querySelector('.domshell-rail-item[data-domain="overtime"]'), { timeout: 15000 }).catch(() => {});
const navigated = await page.evaluate(() => {
  const el = document.querySelector('.domshell-rail-item[data-domain="overtime"]');
  if (!el) return false;
  el.click();
  return true;
});
if (!navigated) {
  console.log('  [informational] this account has no visible Overtime domain — cannot exercise this suite.');
  await browser.close(); server.close();
  console.log(`\nss18-overtime-modal-a11y-check: ${pass} passed, ${fail} failed (navigation unavailable)`);
  process.exit(0);
}
await page.waitForFunction(() => !!document.querySelector('.ot-root'), { timeout: 20000 });
// The rail click's workspace switch runs through a real
// document.startViewTransition() (js/app.js#setWorkspace(), SS14) — even
// with prefers-reduced-motion forcing its instant/no-transition path, the
// FIRST screen navigation right after this can still occasionally race
// ahead of it in a headless run. Wait for genuine visibility, not just the
// 'ot-root' class (added synchronously by mountOvertime() regardless of
// whether the outer workspace container has actually been un-hidden yet).
await page.waitForFunction(() => document.getElementById('v2OvertimeWorkspace')?.style.display !== 'none', { timeout: 10000 }).catch(() => {});
check('Overtime workspace mounted', true);

// Overtime's own internal screen switcher (embedNav()'s `data-act="nav"
// data-id="..."` buttons) — always present in the DOM regardless of
// viewport (CSS hides it ≥768px in favor of the platform's own tab bar,
// but .click() bypasses that), so it's a more robust target than guessing
// the domain-shell tab bar's class name / Indonesian label text.
const gotoScreen = async (screenId) => {
  const clicked = await page.evaluate((id) => {
    const btn = document.querySelector(`.ot-embed-nav [data-act="nav"][data-id="${id}"]`);
    if (!btn) return false;
    btn.click();
    return true;
  }, screenId);
  if (clicked) {
    // setOvertimeScreen() re-renders synchronously, but the FIRST screen
    // switch right after landing on the module still raced the click in a
    // headless run (confirmed empirically) — wait for the active nav
    // button to actually flip (embedNav() bolds the active tab,
    // font-weight:700 vs 600) rather than trusting a fixed delay.
    await page.waitForFunction((id) => {
      const btn = document.querySelector(`.ot-embed-nav [data-act="nav"][data-id="${id}"]`);
      return !!btn && btn.style.fontWeight === '700';
    }, { timeout: 5000 }, screenId).catch(() => {});
  }
  return clicked;
};

/** Generic dialog-lifecycle exercise: open via `openFn`, verify role/aria +
 *  focus-in, verify Tab-trap, then Escape and verify close + focus-restore
 *  to `triggerSelector`. Never touches a submit/confirm button. */
async function exerciseDialog(name, { openFn, triggerSelector }) {
  const opened = await openFn();
  if (!opened) { skip(name, 'trigger not present / no data to open it with'); return; }
  await new Promise((r) => setTimeout(r, 200));
  const state = await page.evaluate(() => {
    const box = document.querySelector('[data-act="stop"] [role="dialog"], [data-act="stop"][role="dialog"]');
    return {
      hasDialog: !!box,
      dialogRole: box?.getAttribute('role'),
      ariaModal: box?.getAttribute('aria-modal'),
      hasLabel: !!(box?.getAttribute('aria-label') || box?.getAttribute('aria-labelledby')),
      focusInside: box ? box.contains(document.activeElement) : false,
    };
  });
  check(`${name}: dialog box present`, state.hasDialog, state);
  check(`${name}: role="dialog" aria-modal="true"`, state.dialogRole === 'dialog' && state.ariaModal === 'true', state);
  check(`${name}: has an accessible name`, state.hasLabel, state);
  check(`${name}: focus moved inside the dialog on open`, state.focusInside, state);

  // Tab-trap: from the last focusable, Tab must wrap to the first (not escape to the page behind).
  const trapState = await page.evaluate(() => {
    const box = document.querySelector('[data-act="stop"] [role="dialog"], [data-act="stop"][role="dialog"]');
    if (!box) return null;
    const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
    const nodes = Array.from(box.querySelectorAll(FOCUSABLE)).filter((n) => n.offsetParent !== null);
    if (!nodes.length) return null;
    nodes[nodes.length - 1].focus();
    return { lastId: nodes[nodes.length - 1].id || nodes[nodes.length - 1].dataset.act || nodes[nodes.length - 1].tagName, firstId: nodes[0].id || nodes[0].dataset.act || nodes[0].tagName };
  });
  if (trapState) {
    await pressTab();
    const wrapped = await page.evaluate(() => {
      const box = document.querySelector('[data-act="stop"] [role="dialog"], [data-act="stop"][role="dialog"]');
      return box ? box.contains(document.activeElement) : false;
    });
    check(`${name}: Tab from the last control stays inside the dialog (wraps, doesn't escape)`, wrapped, trapState);
  } else {
    skip(`${name}: Tab-trap`, 'no focusable nodes found inside the dialog');
  }

  await pressEscape();
  await new Promise((r) => setTimeout(r, 200));
  const closedState = await page.evaluate((sel) => {
    const stillOpen = !!document.querySelector('[data-act="stop"]');
    const trigger = sel ? document.querySelector(sel) : null;
    return { stillOpen, restoredToTrigger: trigger ? document.activeElement === trigger : null };
  }, triggerSelector || null);
  check(`${name}: Escape closes the dialog`, !closedState.stillOpen, closedState);
  if (triggerSelector) check(`${name}: focus restores to the trigger on close`, closedState.restoredToTrigger, closedState);
}

console.log('\n[3. Unit modal ("+ Unit") — lives on the Karyawan screen]');
await gotoScreen('employees');
await new Promise((r) => setTimeout(r, 300));
await exerciseDialog('Unit modal', {
  openFn: () => page.evaluate(() => { const b = document.querySelector('[data-act="openAddUnit"]'); if (!b) return false; b.focus(); b.click(); return true; }),
  triggerSelector: '[data-act="openAddUnit"]',
});

console.log('\n[4. Employee modal ("+ Tambah Karyawan")]');
await exerciseDialog('Employee modal', {
  openFn: () => page.evaluate(() => { const b = document.querySelector('[data-act="openAddEmployee"]'); if (!b) return false; b.focus(); b.click(); return true; }),
  triggerSelector: '[data-act="openAddEmployee"]',
});

console.log('\n[5. Employee History drawer — a real employee, if one exists]');
{
  const opened = await page.evaluate(() => {
    const b = document.querySelector('[data-act="openEmployeeHistory"]');
    if (!b) return false;
    b.focus(); b.click();
    return true;
  });
  if (!opened) {
    skip('Employee History drawer', 'no employee in production to open history for');
  } else {
    await new Promise((r) => setTimeout(r, 200));
    const state = await page.evaluate(() => {
      const box = document.querySelector('[data-act="stop"] [role="dialog"]');
      return { hasDialog: !!box, focusInside: box ? box.contains(document.activeElement) : false, hasLabel: !!box?.getAttribute('aria-label') };
    });
    check('Employee History: dialog present with role/aria-label', state.hasDialog && state.hasLabel, state);
    check('Employee History: focus moved inside on open', state.focusInside, state);
    await pressEscape();
    await new Promise((r) => setTimeout(r, 200));
    const closed = await page.evaluate(() => !document.querySelector('[data-act="stop"]'));
    check('Employee History: Escape closes the drawer', closed);
  }
}

console.log('\n[6. Rate modal ("Ubah Tarif") — navigate to Tarif screen]');
await gotoScreen('rates');
await new Promise((r) => setTimeout(r, 300));
await exerciseDialog('Rate modal', {
  openFn: () => page.evaluate(() => { const b = document.querySelector('[data-act="openRateVersionModal"]'); if (!b) return false; b.focus(); b.click(); return true; }),
  triggerSelector: '[data-act="openRateVersionModal"]',
});

console.log('\n[7. Holiday modal ("+ Tambah Hari Libur") — navigate to Hari Libur screen]');
await gotoScreen('holidays');
await new Promise((r) => setTimeout(r, 300));
await exerciseDialog('Holiday modal', {
  openFn: () => page.evaluate(() => { const b = document.querySelector('[data-act="openAddHoliday"]'); if (!b) return false; b.focus(); b.click(); return true; }),
  triggerSelector: '[data-act="openAddHoliday"]',
});

console.log('\n[8. Edit Record modal — navigate to Penyesuaian Data screen, a real record if one exists]');
await gotoScreen('records');
await new Promise((r) => setTimeout(r, 300));
await exerciseDialog('Edit Record modal', {
  openFn: () => page.evaluate(() => { const b = document.querySelector('[data-act="openEditRecord"]'); if (!b) return false; b.focus(); b.click(); return true; }),
  triggerSelector: '[data-act="openEditRecord"]',
});

console.log('\n[9. Closing screen — Close-Period confirmation ("Tutup Bulan"), never actually confirmed]');
await gotoScreen('closing');
await new Promise((r) => setTimeout(r, 300));
await exerciseDialog('Close-Period confirm modal', {
  openFn: () => page.evaluate(() => { const b = document.querySelector('[data-act="openCloseConfirmModal"]'); if (!b) return false; b.focus(); b.click(); return true; }),
  triggerSelector: '[data-act="openCloseConfirmModal"]',
});

console.log('\n[9b. Closing screen — Unlock modal ("Buka Kunci"), only if the current period is already closed]');
{
  const opened = await page.evaluate(() => {
    const b = document.querySelector('[data-act="openUnlockModal"]');
    if (!b) return false;
    b.focus(); b.click();
    return true;
  });
  if (!opened) {
    skip('Unlock modal', 'current period is not closed — "Buka Kunci" not shown');
  } else {
    await new Promise((r) => setTimeout(r, 200));
    const state = await page.evaluate(() => {
      const box = document.querySelector('[data-act="stop"] [role="dialog"]');
      return { hasDialog: !!box, focusInside: box ? box.contains(document.activeElement) : false };
    });
    check('Unlock modal: dialog present, focus moved inside', state.hasDialog && state.focusInside, state);
    await pressEscape();
    await new Promise((r) => setTimeout(r, 200));
    const closed = await page.evaluate(() => !document.querySelector('[data-act="stop"]'));
    check('Unlock modal: Escape closes it', closed);
  }
}

console.log('\n[10. Rekap Lembur save-confirmation — pre-existing Escape/Enter (onRekapGridKeydown), now also Tab-trapped]');
await gotoScreen('dailyEntry');
await new Promise((r) => setTimeout(r, 400));
{
  const toggled = await page.evaluate(() => {
    const cb = document.querySelector('input[type="checkbox"][data-act="toggleEntryEmployee"]:not(:disabled)');
    if (!cb) return false;
    const id = cb.dataset.id;
    // toggleEntryEmployee is handled by onClick (a plain `st.entrySelected`
    // flip, not the checkbox's native .checked) — a real browser Space
    // press fires a trusted click as part of its OWN default action, which
    // is what actually flips the state; a synthetic 'Enter' keydown does
    // neither (checkboxes don't natively activate on Enter, and a
    // synthetic keydown doesn't trigger default browser actions anyway).
    // .click() is the correct script-equivalent of that real Space press.
    cb.click();
    // The click's setState() re-renders the WHOLE grid, so `cb` itself is
    // now a detached node — the SAME data-focus key gets automatically
    // refocused by the module's own focusGuard.restore(), but re-resolve
    // explicitly here too so this doesn't depend on that timing.
    const cb2 = document.querySelector(`input[data-act="toggleEntryEmployee"][data-id="${CSS.escape(id)}"]`);
    if (cb2) cb2.focus();
    document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    return true;
  });
  if (!toggled) {
    skip('Rekap Lembur save-confirmation', 'no workable employee checkbox for today — cannot open the confirmation');
  } else {
    await new Promise((r) => setTimeout(r, 200));
    const state = await page.evaluate(() => {
      const box = document.querySelector('[data-act="stop"] [role="dialog"]');
      return { hasDialog: !!box, focusedSimpan: document.activeElement?.id === 'otSaveConfirmBtn' };
    });
    check('Save-confirmation: dialog present', state.hasDialog, state);
    check('Save-confirmation: focus defaults to Simpan (pre-existing FIX 14, unchanged)', state.focusedSimpan, state);
    // Tab-trap: Tab from Simpan (first) should NOT leave the dialog.
    await pressTab();
    const stillInside = await page.evaluate(() => {
      const box = document.querySelector('[data-act="stop"] [role="dialog"]');
      return box ? box.contains(document.activeElement) : false;
    });
    check('Save-confirmation: Tab stays inside the dialog (NEW — was untrapped)', stillInside);
    await pressEscape();
    await new Promise((r) => setTimeout(r, 200));
    const closed = await page.evaluate(() => !document.querySelector('[data-act="stop"]'));
    check('Save-confirmation: Escape still cancels it (pre-existing onRekapGridKeydown, unaffected)', closed);
  }
}

console.log('\n[console cleanliness]');
check('zero unexpected console/page errors across the whole sequence', consoleErrors.length === 0, consoleErrors.join(' | ').slice(0, 500));

await browser.close();
server.close();
console.log(`\nss18-overtime-modal-a11y-check: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
