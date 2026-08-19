// Design System Program Phase 3 — Assignment Edit verification.
//
// Loads a standalone harness (scratch/assignment-form-harness.html) that
// imports the REAL js/assignments.js directly — NOT the full app.js/
// Firebase-auth-listener bootstrap. This is a deliberate, disclosed choice:
// an earlier attempt drove the real index.html/app.js bootstrap (same
// technique as scratch/verify-domain-shell-phase1a-smoke.js) with a
// localStorage-forced admin session, but hit the SAME standing limitation
// already documented for that script — real permission resolution in this
// app depends on Firebase-side data a permission-denied read can't provide
// in this environment, so hasPermission('edit') never actually resolved
// true through the real bootstrap. The standalone harness sidesteps this
// entirely: js/auth.js's hasPermission()/getCurrentUser() are pure
// localStorage reads with no Firebase dependency of their own — outside
// app.js's listeners, nothing ever overwrites/invalidates the injected
// session, so real permission logic genuinely runs. Real conflict-checking,
// real form validation, real save-feedback state machine; only the actual
// Firebase write is intercepted, at the exact seam assignments.js already
// exposes for this purpose (registerPersistCallback).

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const OUT_DIR = path.join(__dirname, 'save-feedback-verify');
fs.mkdirSync(OUT_DIR, { recursive: true });

const SYN_ASSIGNMENT = {
  id: 'sf-test-a1', driver: 'Dedi', phone: '0812', vehicle: 'Avanza A',
  date: new Date().toISOString().slice(0, 10), startTime: '08:00', endTime: '10:00',
  destination: 'Kemenpora', purpose: 'Antar Delegasi', pic: 'Grace', pax: 2, notes: '',
  fullDay: false, createdAt: new Date().toISOString(), createdBy: 'Admin Test', updatedAt: new Date().toISOString(),
  requestId: null, status: 'assigned', approvedAt: null, approvedBy: null,
  assignedAt: new Date().toISOString(), assignedBy: 'Admin Test',
  startedAt: null, startedBy: null, completedAt: null, completedBy: null,
  startOdometer: null, endOdometer: null, distanceTravelled: null,
};

async function boot(page) {
  await page.goto('http://localhost:8000/scratch/assignment-form-harness.html', { waitUntil: 'load' });
  await page.waitForFunction('window.__assignHarnessReady === true');
}

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  page.on('console', (msg) => { if (msg.type() === 'error' && !/Fetch Firebase data gagal/.test(msg.text())) pageErrors.push(msg.text()); });
  page.on('dialog', (d) => { pageErrors.push(`UNEXPECTED window.${d.type()}: ${d.message()}`); d.accept(); });

  await page.setViewport({ width: 1400, height: 1000 });
  await boot(page);

  const fail = [];

  // ── Seed a synthetic assignment + open Edit, real form, real widgets ──
  const openState = await page.evaluate(async (a) => {
    const mod = window.__assignMod;
    mod.setAssignments([a]);
    window.__sfCalls = [];
    mod.registerPersistCallback(async (records) => {
      window.__sfLastRecords = records;
      const mode = window.__sfMockMode || 'success';
      // A small artificial delay, matching a real Firebase round-trip —
      // without it the mock resolves inside the same microtask the click
      // handler runs in, leaving no real window to observe the SAVING state.
      await new Promise((r) => setTimeout(r, 250));
      if (mode === 'success') return { ok: true };
      if (mode === 'error') return { ok: false, error: new Error('Firebase write timeout setelah 15000ms (kemungkinan offline)') };
      if (mode === 'reject') throw new Error('Network failure (simulated)');
    });
    mod.openFormModal(a.id);
    const btn = document.getElementById('btnSaveForm');
    return {
      modalOpen: getComputedStyle(document.getElementById('modalForm')).display !== 'none',
      title: document.getElementById('modalFormTitle')?.textContent,
      driverValue: document.getElementById('fieldDriver')?.value,
      destinationValue: document.getElementById('fieldDestination')?.value,
      btnLabel: btn?.textContent,
    };
  }, SYN_ASSIGNMENT);
  if (!openState.modalOpen) fail.push('setup: edit modal did not open');
  if (openState.title !== 'Edit Jadwal') fail.push(`setup: expected title "Edit Jadwal", got ${openState.title}`);
  if (openState.destinationValue !== 'Kemenpora') fail.push(`setup: form not pre-filled correctly, destination=${openState.destinationValue}`);

  await page.screenshot({ path: path.join(OUT_DIR, 'assignment-edit-form.png') });

  // ── 1) IDLE -> SAVING -> SUCCESS (mocked persist, real form submit) ──
  await page.evaluate(() => { window.__sfMockMode = 'success'; });
  const clickPromise = page.click('#btnSaveForm');
  await new Promise((r) => setTimeout(r, 60)); // catch the SAVING frame before it resolves
  const savingState = await page.evaluate(() => {
    const btn = document.getElementById('btnSaveForm');
    return {
      state: btn?.dataset.sfState,
      ariaBusy: btn?.getAttribute('aria-busy'),
      disabled: btn?.disabled,
      cancelDisabled: document.getElementById('btnCancelForm')?.disabled,
      hasSpinner: !!btn?.querySelector('.sf-icon--spin'),
      minWidthSet: !!btn?.style.minWidth,
    };
  });
  await clickPromise;
  // Timeline: click(t=0) -> SAVING -> mock resolves at ~250ms -> SUCCESS
  // shown -> holds for SCENE_MS(550ms) -> ~800ms: onSuccess fires (closes
  // modal), pulse applied -> pulse's own .55s animation clears ~1350ms.
  // Sample mid-pulse (~1000ms) rather than only after it's already faded —
  // proves the pulse actually fired, not just that it isn't present later.
  await new Promise((r) => setTimeout(r, 1000));
  const pulseMidFlight = await page.evaluate(() => document.querySelector('.assignment-block[data-id="sf-test-a1"]')?.classList.contains('sf-pulse'));
  await new Promise((r) => setTimeout(r, 700));
  const afterSuccess = await page.evaluate(() => ({
    modalClosed: getComputedStyle(document.getElementById('modalForm')).display === 'none',
    pulseCleared: !document.querySelector('.assignment-block[data-id="sf-test-a1"]')?.classList.contains('sf-pulse'),
  }));

  if (savingState.state !== 'saving') fail.push(`1: expected saving state, got ${savingState.state}`);
  if (savingState.ariaBusy !== 'true') fail.push('1: aria-busy not set during saving');
  if (!savingState.disabled) fail.push('1: button not disabled during saving');
  if (!savingState.cancelDisabled) fail.push('1: Cancel button not disabled during saving (alsoDisable)');
  if (!savingState.hasSpinner) fail.push('1: no spinner icon shown during saving');
  if (!savingState.minWidthSet) fail.push('1: button min-width not fixed during saving (dimension stability)');
  if (!afterSuccess.modalClosed) fail.push('1: modal did not close after success (onSuccess did not fire correctly)');
  if (!pulseMidFlight) fail.push('1: affected record (.assignment-block[data-id]) was not pulsed after success');
  if (!afterSuccess.pulseCleared) fail.push('1: success pulse never cleared (one-shot animation did not end)');

  // ── 2) Duplicate-click prevention: fire two submits back to back, confirm exactly ONE persist call ──
  await page.evaluate((a) => {
    window.__sfPersistCallCount = 0;
  }, null);
  await page.evaluate(async (a) => {
    const mod = window.__assignMod;
    window.__sfPersistCallCount = 0;
    mod.registerPersistCallback(async (records) => {
      window.__sfPersistCallCount++;
      await new Promise((r) => setTimeout(r, 300)); // hold the write open so a second click can race it
      return { ok: true };
    });
    mod.openFormModal(a.id);
  }, SYN_ASSIGNMENT);
  await page.evaluate(() => {
    const btn = document.getElementById('btnSaveForm');
    btn.click(); btn.click(); btn.click(); // synchronous rapid-fire, same tick
  });
  await new Promise((r) => setTimeout(r, 900));
  const dupCount = await page.evaluate(() => window.__sfPersistCallCount);
  if (dupCount !== 1) fail.push(`2: expected exactly 1 persist call from a rapid triple-click, got ${dupCount}`);

  // ── 3) SAVING -> ERROR (mocked {ok:false}) — inline error, retry, data preserved ──
  await page.evaluate(async (a) => {
    const mod = window.__assignMod;
    mod.setAssignments([a]);
    mod.openFormModal(a.id);
  }, SYN_ASSIGNMENT);
  await page.evaluate(() => { window.__sfMockMode = 'error'; });
  // Re-register the slow-success callback with the error-aware one from setup.
  await page.evaluate(async () => {
    const mod = window.__assignMod;
    mod.registerPersistCallback(async () => ({ ok: false, error: new Error('Firebase write timeout setelah 15000ms (kemungkinan offline)') }));
  });
  await page.type('#fieldDestination', ' EDITED');
  await page.click('#btnSaveForm');
  await new Promise((r) => setTimeout(r, 400));
  const errorState = await page.evaluate(() => {
    const btn = document.getElementById('btnSaveForm');
    const err = document.getElementById('assignmentFormError');
    return {
      modalStillOpen: getComputedStyle(document.getElementById('modalForm')).display !== 'none',
      btnEnabled: !btn.disabled,
      btnLabel: btn.textContent,
      errorHidden: err.hidden,
      errorText: err.textContent,
      destinationPreserved: document.getElementById('fieldDestination').value,
      ariaDescribedBy: btn.getAttribute('aria-describedby'),
    };
  });
  await page.screenshot({ path: path.join(OUT_DIR, 'assignment-edit-error.png') });

  if (!errorState.modalStillOpen) fail.push('3: modal should stay open after a failed save');
  if (!errorState.btnEnabled) fail.push('3: Save button should be re-enabled immediately after error (retry)');
  if (errorState.errorHidden) fail.push('3: inline error region should be visible after failure');
  if (!/timeout|offline|Gagal/i.test(errorState.errorText)) fail.push(`3: error text not meaningful: "${errorState.errorText}"`);
  if (!errorState.destinationPreserved.includes('EDITED')) fail.push('3: entered data was not preserved after error');
  if (!errorState.ariaDescribedBy) fail.push('3: button missing aria-describedby linking to the error region');

  // ── 4) Retry (keyboard-reachable): click Save again with a success mock, confirm it now saves ──
  await page.evaluate(async () => {
    const mod = window.__assignMod;
    mod.registerPersistCallback(async () => ({ ok: true }));
  });
  await page.click('#btnSaveForm');
  await new Promise((r) => setTimeout(r, 700));
  const retryOk = await page.evaluate(() => getComputedStyle(document.getElementById('modalForm')).display === 'none');
  if (!retryOk) fail.push('4: retry after error did not succeed / modal did not close');

  // ── 5) Reduced motion: instant state, no animation, same end state ──
  await page.evaluate((a) => {
    document.documentElement.setAttribute('data-anim', 'off');
  });
  await page.evaluate(async (a) => {
    const mod = window.__assignMod;
    mod.setAssignments([a]);
    mod.registerPersistCallback(async () => ({ ok: true }));
    mod.openFormModal(a.id);
  }, SYN_ASSIGNMENT);
  const t0 = Date.now();
  await page.click('#btnSaveForm');
  await new Promise((r) => setTimeout(r, 150)); // reduced motion should already be done well before SCENE_MS (550ms)
  const reducedState = await page.evaluate(() => getComputedStyle(document.getElementById('modalForm')).display);
  const elapsed = Date.now() - t0;
  await page.evaluate(() => document.documentElement.removeAttribute('data-anim'));
  if (reducedState !== 'none') fail.push(`5: reduced-motion save did not settle quickly (modal still open after ${elapsed}ms)`);

  await browser.close();

  console.log(JSON.stringify({ openState, savingState, pulseMidFlight, afterSuccess, dupCount, errorState, retryOk, reducedState }, null, 2));
  console.log('\n--- PAGE ERRORS ---');
  console.log(pageErrors.length ? pageErrors : 'none');
  if (pageErrors.length) fail.push(`page errors / unexpected dialogs: ${pageErrors.join(' | ')}`);

  if (fail.length) {
    console.error('\nFAILURES:\n' + fail.map((f) => ' - ' + f).join('\n'));
    process.exitCode = 1;
  } else {
    console.log('\nAssignment Edit save-feedback migration verified.');
  }
})();
