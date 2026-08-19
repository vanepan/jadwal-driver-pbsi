// Design System Program Phase 2 — Assignment Detail drawer migration
// verification. Drives the REAL exported js/modal.js functions (real
// hasPermission/canActOnAssignment/canCancelAssignment via a real
// localStorage session — never a mocked auth layer) against synthetic
// assignment data. No Firebase reads/writes: registered callbacks are spies,
// never the real app.js Firebase-touching implementations.

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const OUT_DIR = path.join(__dirname, 'modal-drawer-verify');
fs.mkdirSync(OUT_DIR, { recursive: true });

const ASSIGNMENTS = [
  { id: 'a1', driver: 'Dedi', phone: '0812', vehicle: 'Avanza A', date: '2026-08-20', startTime: '08:00', endTime: '10:00', destination: 'Kemenpora', purpose: 'Antar Delegasi', pic: 'Grace', pax: 2, status: 'assigned' },
  { id: 'a2', driver: 'Dedi', phone: '0812', vehicle: '', date: '2026-08-20', startTime: '08:00', endTime: '10:00', destination: 'Kemenpora', purpose: 'Antar Delegasi', pic: '', pax: 1, status: 'assigned' },
  { id: 'a3', driver: 'Grace', phone: '0813', vehicle: 'Avanza B', date: '2026-08-19', startTime: '08:00', endTime: '17:00', destination: 'RSCM', purpose: 'Antar Sampel', pic: '', pax: 1, status: 'completed', startOdometer: 1000, endOdometer: 1050, distanceTravelled: 50 },
];

function setSession(page, user) {
  return page.evaluate((u) => {
    if (u) localStorage.setItem('pbsi_current_user', JSON.stringify(u));
    else localStorage.removeItem('pbsi_current_user');
  }, user);
}

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  page.on('console', (msg) => { if (msg.type() === 'error') pageErrors.push(msg.text()); });
  page.on('dialog', (d) => d.accept()); // auto-accept confirm()/alert() throughout

  await page.setViewport({ width: 1400, height: 1000 });
  await page.goto('http://localhost:8000/scratch/modal-drawer-harness.html', { waitUntil: 'load' });
  await setSession(page, { username: 'admin1', name: 'Admin Test', role: 'admin' });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction('window.__modalHarnessReady === true');
  await page.evaluate((list) => window.__modal.setAssignments(list), ASSIGNMENTS);

  const fail = [];

  // ── 1) Open a1 (assigned, has vehicle) as admin — content + button matrix ──
  const r1 = await page.evaluate(() => {
    window.__modal.openDetailModal('a1');
    const overlay = document.getElementById('appDrawerOverlay');
    const get = (sel) => overlay?.querySelector(sel);
    return {
      overlayExists: !!overlay,
      title: get('.drawer__title')?.textContent,
      driverRow: get('#detailSummary')?.textContent.includes('Dedi'),
      destRow: get('#detailSummary')?.textContent.includes('Kemenpora'),
      startVisible: get('#btnStartAssignment')?.style.display !== 'none',
      completeVisible: get('#btnCompleteAssignment')?.style.display !== 'none',
      cancelVisible: get('#btnCancelAssignment')?.style.display !== 'none',
      editDisabled: get('#btnEditAssignment')?.disabled,
      odoAccordHidden: get('#accordOdo')?.classList.contains('accord-section--hidden'),
      dialogRole: get('.drawer')?.getAttribute('role'),
      ariaModal: get('.drawer')?.getAttribute('aria-modal'),
    };
  });
  await new Promise((r) => setTimeout(r, 350));
  await page.screenshot({ path: path.join(OUT_DIR, '1-open-admin-a1.png') });

  if (!r1.overlayExists) fail.push('1: drawer overlay did not mount');
  if (r1.title !== 'Detail Jadwal') fail.push(`1: title expected "Detail Jadwal", got ${r1.title}`);
  if (!r1.driverRow) fail.push('1: driver name missing from summary');
  if (!r1.destRow) fail.push('1: destination missing from summary');
  if (!r1.startVisible) fail.push('1: Start button should be visible for assigned+admin');
  if (!r1.completeVisible) fail.push('1: Complete button should be visible for admin');
  if (!r1.cancelVisible) fail.push('1: Cancel should be visible — admin can cancel an "assigned" status assignment');
  if (r1.editDisabled) fail.push('1: Edit should be enabled for admin on a non-cancelled assignment');
  if (!r1.odoAccordHidden) fail.push('1: Odometer accordion should be hidden (a1 has no odometer data)');
  if (r1.dialogRole !== 'dialog' || r1.ariaModal !== 'true') fail.push('1: missing role=dialog/aria-modal on the panel');

  // ── 2) Completed assignment (a3) — Odometer accordion visible with real data ──
  const r2 = await page.evaluate(() => {
    window.__modal.openDetailModal('a3');
    const overlay = document.getElementById('appDrawerOverlay');
    return {
      odoHidden: overlay.querySelector('#accordOdo').classList.contains('accord-section--hidden'),
      odoText: overlay.querySelector('#detailOdo').textContent,
      startVisible: overlay.querySelector('#btnStartAssignment').style.display !== 'none',
      completeDisabled: overlay.querySelector('#btnCompleteAssignment').disabled,
    };
  });
  if (r2.odoHidden) fail.push('2: Odometer accordion should be VISIBLE for a3 (has odometer data)');
  if (!/1.050|1050/.test(r2.odoText)) fail.push(`2: odometer rows missing expected distance, got: ${r2.odoText}`);
  if (r2.startVisible) fail.push('2: Start should be hidden once completed (status!==assigned)');
  if (!r2.completeDisabled) fail.push('2: Complete should be disabled once already completed');

  // ── 3) Focus trap + Escape + focus restore ──
  const focusBtnId = 'focusTestTrigger';
  await page.evaluate((id) => {
    const btn = document.createElement('button');
    btn.id = id; btn.textContent = 'trigger';
    document.body.appendChild(btn);
    btn.focus();
  }, focusBtnId);
  const r3 = await page.evaluate((id) => {
    window.__modal.openDetailModal('a1');
    const closeBtnFocused = document.activeElement?.classList.contains('drawer__close');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return { closeBtnFocused };
  }, focusBtnId);
  await new Promise((r) => setTimeout(r, 350));
  const r3b = await page.evaluate((id) => ({
    overlayGone: !document.getElementById('appDrawerOverlay'),
    focusRestored: document.activeElement?.id === id,
  }), focusBtnId);
  if (!r3.closeBtnFocused) fail.push('3: initial focus did not land on the close button');
  if (!r3b.overlayGone) fail.push('3: Escape did not close the drawer');
  if (!r3b.focusRestored) fail.push('3: focus was not restored to the triggering element after Escape');

  // ── 4) Source-highlight on open, cleared on close ──
  const r4 = await page.evaluate(() => {
    const row = document.createElement('div');
    row.id = 'sourceRow';
    document.body.appendChild(row);
    window.__modal.openDetailModal('a1', { sourceEl: row });
    const highlightedWhileOpen = row.classList.contains('drawer-source-highlight');
    window.__modal.closeDetailModal();
    return { highlightedWhileOpen };
  });
  await new Promise((r) => setTimeout(r, 350));
  const r4b = await page.evaluate(() => document.getElementById('sourceRow').classList.contains('drawer-source-highlight'));
  if (!r4.highlightedWhileOpen) fail.push('4: source element was not highlighted while drawer open');
  if (r4b) fail.push('4: source highlight was not cleared after close');

  // ── 5) Edit click -> spy invoked with correct id, drawer closes ──
  await page.evaluate(() => { window.__modalCalls.length = 0; window.__modal.openDetailModal('a1'); });
  await new Promise((r) => setTimeout(r, 350));
  await page.click('#appDrawerOverlay [data-drawer-action="edit"]');
  await new Promise((r) => setTimeout(r, 350));
  const r5 = await page.evaluate(() => ({ calls: window.__modalCalls, overlayGone: !document.getElementById('appDrawerOverlay') }));
  if (!r5.calls.some((c) => c.name === 'edit' && c.args[0] === 'a1')) fail.push(`5: edit callback not invoked correctly, got: ${JSON.stringify(r5.calls)}`);
  if (!r5.overlayGone) fail.push('5: drawer did not close after Edit');

  // ── 6) Delete click -> confirm() auto-accepted -> spy invoked, drawer closes ──
  await page.evaluate(() => { window.__modalCalls.length = 0; window.__modal.openDetailModal('a1'); });
  await new Promise((r) => setTimeout(r, 350));
  await page.click('#appDrawerOverlay [data-drawer-action="delete"]');
  await new Promise((r) => setTimeout(r, 350));
  const r6 = await page.evaluate(() => ({ calls: window.__modalCalls, overlayGone: !document.getElementById('appDrawerOverlay') }));
  if (!r6.calls.some((c) => c.name === 'delete' && c.args[0] === 'a1')) fail.push(`6: delete callback not invoked correctly, got: ${JSON.stringify(r6.calls)}`);
  if (!r6.overlayGone) fail.push('6: drawer did not close after Delete');

  // ── 7) Option A round-trip: Start (a1 HAS a vehicle) -> closes drawer, opens Odometer -> Kembali reopens drawer ──
  await page.evaluate(() => window.__modal.openDetailModal('a1'));
  await new Promise((r) => setTimeout(r, 350));
  await page.click('#appDrawerOverlay [data-drawer-action="start"]');
  await new Promise((r) => setTimeout(r, 350));
  const r7 = await page.evaluate(() => ({
    drawerGone: !document.getElementById('appDrawerOverlay'),
    odoOpen: getComputedStyle(document.getElementById('modalOdometer')).display !== 'none',
  }));
  if (!r7.drawerGone) fail.push('7: drawer should close before Odometer opens (Option A)');
  if (!r7.odoOpen) fail.push('7: Odometer modal did not open for a Start action on a vehicle-having assignment');
  await page.click('#btnCancelOdometer'); // "Kembali" — should reopen the same assignment's drawer
  await new Promise((r) => setTimeout(r, 350));
  const r7b = await page.evaluate(() => ({
    odoClosed: getComputedStyle(document.getElementById('modalOdometer')).display === 'none',
    drawerReopened: !!document.getElementById('appDrawerOverlay'),
    title: document.querySelector('#appDrawerOverlay .drawer__title')?.textContent,
  }));
  if (!r7b.odoClosed) fail.push('7b: Odometer modal did not close on Kembali');
  if (!r7b.drawerReopened) fail.push('7b: detail drawer did not reopen after Kembali (Option A contract broken)');

  // ── 8) Start with NO vehicle (a2) -> direct start, no Odometer, drawer closes ──
  await page.evaluate(() => { window.__modalCalls.length = 0; window.__modal.openDetailModal('a2'); });
  await new Promise((r) => setTimeout(r, 350));
  await page.click('#appDrawerOverlay [data-drawer-action="start"]');
  await new Promise((r) => setTimeout(r, 350));
  const r8 = await page.evaluate(() => ({
    calls: window.__modalCalls,
    odoOpen: getComputedStyle(document.getElementById('modalOdometer')).display !== 'none',
    drawerGone: !document.getElementById('appDrawerOverlay'),
  }));
  if (!r8.calls.some((c) => c.name === 'start' && c.args[0] === 'a2')) fail.push(`8: start callback not invoked for vehicle-less assignment, got: ${JSON.stringify(r8.calls)}`);
  if (r8.odoOpen) fail.push('8: Odometer should NOT open for a vehicle-less assignment');
  if (!r8.drawerGone) fail.push('8: drawer did not close after direct start');

  // ── 9) Driver role — sees own assignment's actions, not admin-only ones ──
  await setSession(page, { username: 'dedi', name: 'Dedi', role: 'driver' });
  await page.evaluate((list) => window.__modal.setAssignments(list), ASSIGNMENTS);
  const r9 = await page.evaluate(() => {
    window.__modal.openDetailModal('a1'); // a1.driver === 'Dedi'
    const overlay = document.getElementById('appDrawerOverlay');
    return {
      startVisible: overlay.querySelector('#btnStartAssignment').style.display !== 'none',
      deleteDisabled: overlay.querySelector('#btnDeleteAssignment').disabled,
      overrideVisible: overlay.querySelector('#btnOverrideOvertime').style.display !== 'none',
    };
  });
  if (!r9.startVisible) fail.push('9: driver should see Start on their own assignment');
  if (!r9.deleteDisabled) fail.push('9: driver should NOT be able to delete (admin-only)');
  if (r9.overrideVisible) fail.push('9: driver should never see Override Lembur (admin-only)');

  // Different driver's assignment — should NOT see Start
  const r9b = await page.evaluate(() => {
    window.__modal.openDetailModal('a3'); // driver: Grace
    return document.getElementById('appDrawerOverlay').querySelector('#btnStartAssignment').style.display !== 'none';
  });
  if (r9b) fail.push('9b: driver should NOT see Start on a different driver\'s assignment');

  // ── 10) Mobile bottom sheet ──
  await setSession(page, { username: 'admin1', name: 'Admin Test', role: 'admin' });
  await page.setViewport({ width: 390, height: 800 });
  const r10 = await page.evaluate(() => {
    window.__modal.openDetailModal('a1');
    const panel = document.querySelector('#appDrawerOverlay .drawer');
    return { grabberDisplay: getComputedStyle(document.querySelector('#appDrawerOverlay .drawer__grabber')).display };
  });
  await new Promise((r) => setTimeout(r, 350));
  const r10b = await page.evaluate(() => getComputedStyle(document.querySelector('#appDrawerOverlay .drawer')).transform);
  await page.screenshot({ path: path.join(OUT_DIR, '10-mobile-bottom-sheet.png') });
  if (r10.grabberDisplay === 'none') fail.push('10: drag-handle grabber should be visible on mobile');
  if (r10b.includes('matrix') && r10b.split(',')[5]?.trim() === '0)') { /* translateY(0) once open — fine */ }

  // ── 11) Old legacy DOM/CSS fully gone ──
  const r11 = await page.evaluate(() => ({
    oldModalDetailExists: !!document.getElementById('modalDetail'),
    oldExecDrawerClassUsed: !!document.querySelector('.exec-drawer, .exec-drawer-overlay'),
  }));
  if (r11.oldModalDetailExists) fail.push('11: legacy #modalDetail should not exist anywhere');
  if (r11.oldExecDrawerClassUsed) fail.push('11: legacy .exec-drawer* classes should not be used anywhere');

  await browser.close();

  console.log(JSON.stringify({ r1, r2, r3, r3b, r4, r4b, r5, r6, r7, r7b, r8, r9, r9b, r10, r11 }, null, 2));
  console.log('\n--- PAGE ERRORS ---');
  console.log(pageErrors.length ? pageErrors : 'none');
  if (pageErrors.length) fail.push(`page errors: ${pageErrors.join(' | ')}`);

  if (fail.length) {
    console.error('\nFAILURES:\n' + fail.map((f) => ' - ' + f).join('\n'));
    process.exitCode = 1;
  } else {
    console.log('\nAssignment Detail drawer migration verified.');
  }
})();
