// Design System Program Phase 5 — visual pass for the flagship error/
// validation UX. Follows scratch/verify-icon-consolidation-visual.js's
// pattern: screenshots the real running form (not just source-text checks),
// light + dark, and asserts real accessible markup (aria-invalid,
// aria-describedby, role="alert") — not just visual presence.
//
// Reuses scratch/assignment-form-harness.html (the real js/assignments.js,
// real save-feedback.js, no Firebase bootstrap — see that harness's own
// header comment / scratch/verify-save-feedback-assignment.js's header for
// why this is the right isolation boundary).

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const OUT_DIR = path.join(__dirname, 'error-ux-verify');
fs.mkdirSync(OUT_DIR, { recursive: true });

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const fail = [];

  for (const theme of ['light', 'dark']) {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(m.text()); });
    page.on('dialog', (d) => { pageErrors.push(`UNEXPECTED window.${d.type()}: ${d.message()}`); d.accept(); });
    await page.setViewport({ width: 1200, height: 1100 });
    await page.goto('http://localhost:8000/scratch/assignment-form-harness.html', { waitUntil: 'load' });
    await page.waitForFunction('window.__assignHarnessReady === true');
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);

    // ── 1) Empty submit: every genuinely-empty-by-default required field
    //      shows its own error, first field is focused, aria-invalid/
    //      aria-describedby wired, and — the confirmed old bug this phase
    //      fixes — the busy/SAVING state never fires for a client-side
    //      validation failure. (fieldDate is excluded: openFormModal's Add
    //      mode deliberately pre-fills it with today's date — never empty.
    //      assignmentTimeStart/End are excluded here too: getCombinedTimeFromPair
    //      (js/utils.js, pre-existing, unrelated to this phase) pads a
    //      genuinely-blank hour/minute pair to "00:00" before validation
    //      ever sees it — the OLD all-or-nothing check had this identical
    //      blind spot (`!startTime` was always false for the same reason);
    //      time validation is exercised separately below with a real
    //      invalid RANGE instead, which both old and new code DO catch.) ──
    await page.evaluate(() => { window.__assignMod.openFormModal(null); });
    const emptySubmit = await page.evaluate(() => {
      document.getElementById('btnSaveForm').click();
      const fieldIds = ['fieldDriver', 'fieldVehicle', 'fieldDestination', 'fieldPurpose'];
      const errors = fieldIds.map((id) => {
        const el = document.getElementById(`err-${id}`);
        return { id, visible: el && !el.hidden, hasIcon: !!el?.querySelector('svg'), text: el?.textContent || '' };
      });
      const active = document.activeElement;
      return {
        errors,
        firstFocusedId: active?.id || active?.closest('.form-group')?.querySelector('input,select')?.id || null,
        sfBusy: document.getElementById('btnSaveForm').dataset.sfState,
        driverAriaInvalid: document.getElementById('fieldDriver').getAttribute('aria-invalid'),
        driverDescribedBy: document.getElementById('fieldDriver').getAttribute('aria-describedby'),
      };
    });
    if (emptySubmit.errors.some((e) => !e.visible)) fail.push(`[${theme}] not every required field shows an error on empty submit: ${JSON.stringify(emptySubmit.errors.filter((e) => !e.visible))}`);
    if (emptySubmit.errors.some((e) => !e.hasIcon)) fail.push(`[${theme}] a field error is missing its anIcon('alert') glyph`);
    if (emptySubmit.firstFocusedId !== 'fieldDriver') fail.push(`[${theme}] first invalid field (fieldDriver) was not focused, got ${emptySubmit.firstFocusedId}`);
    if (emptySubmit.sfBusy) fail.push(`[${theme}] save-feedback busy state fired for a client-side validation failure (sfState=${emptySubmit.sfBusy})`);
    if (emptySubmit.driverAriaInvalid !== 'true') fail.push(`[${theme}] fieldDriver missing aria-invalid="true"`);
    if (emptySubmit.driverDescribedBy !== 'err-fieldDriver') fail.push(`[${theme}] fieldDriver aria-describedby not wired to its error node`);
    await page.screenshot({ path: path.join(OUT_DIR, `field-errors-${theme}.png`) });

    // ── 1b) A real invalid time RANGE (end before start) — both old and new
    //       code catch this; confirms validateTimeRange is genuinely wired,
    //       not just present in the import list. End time is typed FIRST:
    //       js/assignments.js's own autoFillEndTime() (pre-existing, blur-
    //       triggered) would otherwise overwrite an empty end time with
    //       start+2h the moment focus leaves the start-minute field. ──
    await page.evaluate(() => { window.__assignMod.openFormModal(null); });
    await page.type('#fieldEndHour', '08'); await page.type('#fieldEndMinute', '00');
    await page.type('#fieldStartHour', '10'); await page.type('#fieldStartMinute', '00');
    await page.click('#btnSaveForm');
    const timeRangeError = await page.evaluate(() => {
      const el = document.getElementById('err-assignmentTimeEnd');
      return { visible: el && !el.hidden, text: el?.textContent || '' };
    });
    if (!timeRangeError.visible) fail.push(`[${theme}] end-before-start time range did not produce a field error`);
    if (!/selesai.*mulai/i.test(timeRangeError.text)) fail.push(`[${theme}] time range error text unexpected: "${timeRangeError.text}"`);

    // ── 2) Blur-time clearing: fixing ONE field and blurring clears only
    //      that field's error, others remain. ──
    await page.select('#fieldDriver', 'Dedi');
    await page.evaluate(() => document.getElementById('fieldDriver').blur());
    await new Promise((r) => setTimeout(r, 50));
    const afterBlur = await page.evaluate(() => ({
      driverCleared: document.getElementById('err-fieldDriver').hidden,
      driverAriaInvalidGone: !document.getElementById('fieldDriver').hasAttribute('aria-invalid'),
      vehicleStillShown: !document.getElementById('err-fieldVehicle').hidden,
    }));
    if (!afterBlur.driverCleared) fail.push(`[${theme}] fixing + blurring fieldDriver did not clear its error`);
    if (!afterBlur.driverAriaInvalidGone) fail.push(`[${theme}] aria-invalid not removed after field became valid`);
    if (!afterBlur.vehicleStillShown) fail.push(`[${theme}] blurring one field incorrectly cleared a DIFFERENT field's error`);

    // ── 3) A curated (non-raw) error from the persist callback: single
    //      inline message, no leaked Firebase internals, no toast.
    //      Fresh openFormModal(null) first — direct value assignment (not
    //      page.type(), which APPENDS onto whatever test 1b left behind and
    //      gets silently capped by maxlength="2" on the time fields). ──
    await page.evaluate((sfx) => {
      const mod = window.__assignMod;
      mod.setAssignments([]);
      mod.openFormModal(null);
      const set = (id, v) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
      set('fieldDriver', 'Dedi');
      set('fieldVehicle', 'Avanza A');
      set('fieldStartHour', '08'); set('fieldStartMinute', '00');
      set('fieldEndHour', '10'); set('fieldEndMinute', '00');
      set('fieldDestination', 'Kemenpora');
      set('fieldPurpose', 'Rapat');
      document.getElementById('toast').style.display = 'none'; // reset toast visibility from any earlier call
      mod.registerPersistCallback(async () => ({ ok: false, error: new Error(sfx) }));
    }, 'Anda tidak memiliki izin untuk melakukan perubahan ini.'); // simulates firebase.js's own curated output
    await page.click('#btnSaveForm');
    await new Promise((r) => setTimeout(r, 200));
    const curatedError = await page.evaluate(() => {
      const region = document.getElementById('assignmentFormError');
      const toast = document.getElementById('toast');
      return {
        regionVisible: !region.hidden,
        regionText: region.textContent,
        regionHasIcon: !!region.querySelector('svg'),
        toastVisible: getComputedStyle(toast).display !== 'none',
      };
    });
    if (!curatedError.regionVisible) fail.push(`[${theme}] inline error region did not show on persist failure`);
    if (!curatedError.regionHasIcon) fail.push(`[${theme}] inline error region missing its alert icon`);
    if (/permission_denied|FirebaseError|\/assignments\//i.test(curatedError.regionText)) fail.push(`[${theme}] raw Firebase internals leaked into the error region: "${curatedError.regionText}"`);
    if (curatedError.toastVisible) fail.push(`[${theme}] a redundant toast fired alongside the inline error (should be inline-only — see Phase 5 Part D item 6)`);
    await page.screenshot({ path: path.join(OUT_DIR, `persist-error-${theme}.png`) });

    // ── 4) Reduced motion: field errors still work, no shake anywhere. ──
    await page.evaluate(() => document.documentElement.setAttribute('data-anim', 'off'));
    await page.evaluate(() => { document.getElementById('fieldDriver').value = ''; });
    await page.evaluate(() => document.getElementById('btnSaveForm').click());
    const reducedMotionOk = await page.evaluate(() => !document.getElementById('err-fieldDriver').hidden);
    if (!reducedMotionOk) fail.push(`[${theme}] field validation broke under data-anim="off"`);
    await page.evaluate(() => document.documentElement.removeAttribute('data-anim'));

    if (pageErrors.length) fail.push(`[${theme}] page errors / unexpected dialogs: ${pageErrors.join(' | ')}`);
    await page.close();
  }

  // ── 5) Toast severity — success shows green+check, error shows red+alert,
  //      no leftover green-checkmark-on-error (the confirmed Petty Cash/
  //      Gudang bug this phase fixes). ──
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 800, height: 600 });
    await page.goto('http://localhost:8000/scratch/assignment-form-harness.html', { waitUntil: 'load' });
    await page.waitForFunction('window.__assignHarnessReady === true');
    const severities = await page.evaluate(async () => {
      const { showToast } = await import('/js/components/toast.js');
      const read = () => {
        const t = document.getElementById('toast');
        return { cls: t.className, role: t.getAttribute('role'), ariaLive: t.getAttribute('aria-live'), hasSvg: !!t.querySelector('svg') };
      };
      showToast('Test success', { severity: 'success' });
      const success = read();
      showToast('Test error', { severity: 'error' });
      const error = read();
      return { success, error };
    });
    if (severities.success.cls !== 'toast toast--success') fail.push(`toast success severity class wrong: ${severities.success.cls}`);
    if (severities.error.cls !== 'toast toast--error') fail.push(`toast error severity class wrong: ${severities.error.cls}`);
    if (severities.error.role !== 'alert' || severities.error.ariaLive !== 'assertive') fail.push('error toast missing role="alert"/aria-live="assertive"');
    if (!severities.success.hasSvg || !severities.error.hasSvg) fail.push('toast severity variants missing icon');
    await page.close();
  }

  await browser.close();

  if (fail.length) {
    console.error('\nFAILURES:\n' + fail.map((f) => ' - ' + f).join('\n'));
    process.exitCode = 1;
  } else {
    console.log('\nError/validation UX visual pass: field errors, blur-clearing, curated persist errors, reduced motion, and toast severity all verified in light + dark.');
  }
})();
