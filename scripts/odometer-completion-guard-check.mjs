/* odometer-completion-guard-check.mjs — V1 completion / start odometer guard.

   Real headless render of the #modalOdometer flow (js/modal.js, real style.css)
   driven through the exported openOdometerModalForTest + initModalHandlers:

   COMPLETE ("Selesaikan"):
     • KM Awal is a READ-ONLY preview (#odoPreviewStart), NOT an editable input;
       the single input is KM Akhir.
     • distance updates live = KM Akhir − KM Awal.
     • KM Akhir < KM Awal ⇒ hard block (no callback fires).
     • KM Akhir == KM Awal ⇒ distance 0, allowed.
     • a suspicious derived distance (> operations.odometerWarnJumpKm, default
       2000) ⇒ the acknowledgement checkbox appears and Confirm is disabled
       until it is checked; then completion proceeds. Never a hard block.

   START ("Mulai Tugas") with NO recorded vehicle odometer:
     • the field is editable (nothing authoritative to lock to).

   START locked + "Koreksi odometer" override is covered by the static
   assertions in scripts/self-drive-assignment-check.mjs (the vehicle store has
   no headless seed seam).

   Run: node scripts/odometer-completion-guard-check.mjs   (exit 0 = all pass)
*/

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const check = (n, c, detail) => {
  if (c) { pass++; console.log(`  ✓ ${n}`); }
  else { fail++; console.log(`  ✗ ${n}`); if (detail !== undefined) console.log('     ' + JSON.stringify(detail)); }
};
const srcOf = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

const MIME = { '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml' };
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
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|favicon|firebase|permission|network/i.test(m.text())) errs.push('err: ' + m.text().slice(0, 160)); });
await page.setViewport({ width: 1024, height: 800 });
await page.goto(`http://localhost:${port}/scripts/odometer-completion-guard-harness.html`, { waitUntil: 'networkidle0', timeout: 45000 });

const boot = await page.evaluate(async () => {
  const m = await import('/js/modal.js');
  m.initModalHandlers();
  window.__M = m;
  return { hasOpen: typeof m.openOdometerModalForTest === 'function' };
});
check('modal.js exports openOdometerModalForTest', boot.hasOpen);

/* helper run in the page: open a COMPLETE dialog for an assignment with a known
   startOdometer, type a KM Akhir, read state, optionally click confirm. */
async function completeFlow(startOdometer, endValue, { checkAck = false, clickConfirm = true } = {}) {
  return page.evaluate(async ({ startOdometer, endValue, checkAck, clickConfirm }) => {
    let captured = null;
    const asg = { id: 'T1', driver: 'Igo', vehicle: 'B 1 XY', date: '2026-09-01', startTime: '08:00', endTime: '10:00', status: 'started', startOdometer };
    window.__M.openOdometerModalForTest('complete', 'T1', asg, (id, odoData) => { captured = { id, odoData }; });
    await new Promise(r => setTimeout(r, 30));

    const input = document.getElementById('odoInput');
    const confirmBtn = document.getElementById('btnConfirmOdometer');
    const sanityWrap = document.getElementById('odoSanityWrap');
    const sanityAck  = document.getElementById('odoSanityAck');

    const startIsEditableInput = !input.hasAttribute('readonly')
      && document.getElementById('odoInputLabel').textContent.trim() === 'KM AKHIR';

    input.value = String(endValue);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 20));

    const distText = document.getElementById('odoPreviewDistance').textContent.trim();
    const startPreview = document.getElementById('odoPreviewStart').textContent.trim();
    const sanityShown = !sanityWrap.hidden;
    const confirmDisabledBefore = confirmBtn.disabled;

    if (checkAck && !sanityAck.checked) { sanityAck.click(); await new Promise(r => setTimeout(r, 20)); }
    const confirmDisabledAfterAck = confirmBtn.disabled;

    if (clickConfirm) { confirmBtn.click(); await new Promise(r => setTimeout(r, 20)); }
    const hint = document.getElementById('odoHint').textContent.trim();
    const modalOpen = document.getElementById('modalOdometer').style.display !== 'none';

    return { startIsEditableInput, startPreview, distText, sanityShown, confirmDisabledBefore, confirmDisabledAfterAck, captured, hint, modalOpen };
  }, { startOdometer, endValue, checkAck, clickConfirm });
}

/* ══ 1 — normal completion: 22.390 → 22.491 = 101 km ══ */
console.log('\n[1 — normal completion 22.390 → 22.491]');
const r1 = await completeFlow(22390, 22491);
check('KM Awal is a read-only preview (22.390), the input is KM AKHIR', r1.startIsEditableInput && /22[.,]390/.test(r1.startPreview), r1);
check('distance shows 101 km, live', /^101\b/.test(r1.distText.replace(/[.,]/g, m => m)) || r1.distText.startsWith('101'), r1.distText);
check('no sanity gate for a normal distance', r1.sanityShown === false, r1);
check('completion proceeds — callback fired with endOdometer 22491, modal closed', r1.captured?.odoData?.endOdometer === 22491 && !r1.modalOpen, r1);

/* ══ 2 — same odometer: 22.390 → 22.390 = 0 km ══ */
console.log('\n[2 — same odometer → 0 km, allowed]');
const r2 = await completeFlow(22390, 22390);
check('distance 0 km', r2.distText.startsWith('0'), r2.distText);
check('completion proceeds (endOdometer 22390)', r2.captured?.odoData?.endOdometer === 22390 && !r2.modalOpen, r2);

/* ══ 3 — lower ending odometer: 22.390 → 22.000 ⇒ BLOCKED ══ */
console.log('\n[3 — KM Akhir < KM Awal ⇒ blocked, stays incomplete]');
const r3 = await completeFlow(22390, 22000);
check('no callback fired (completion blocked)', r3.captured === null, r3);
check('modal stays open', r3.modalOpen === true, r3);
check('hint explains the odometer went backwards', /mundur/i.test(r3.hint), r3.hint);

/* ══ 4 — suspicious distance ⇒ explicit acknowledgement required ══ */
console.log('\n[4 — suspicious distance (> 2000 km default) ⇒ ack checkbox]');
const r4a = await completeFlow(10000, 13000, { checkAck: false, clickConfirm: true }); // 3000 km jump
check('sanity acknowledgement checkbox appears', r4a.sanityShown === true, r4a);
check('Confirm is DISABLED before the box is checked', r4a.confirmDisabledBefore === true, r4a);
check('clicking Confirm without the ack does nothing (no callback, modal open)', r4a.captured === null && r4a.modalOpen === true, r4a);

const r4b = await completeFlow(10000, 13000, { checkAck: true, clickConfirm: true });
check('checking the box re-enables Confirm', r4b.confirmDisabledAfterAck === false, r4b);
check('completion then proceeds (endOdometer 13000)', r4b.captured?.odoData?.endOdometer === 13000 && !r4b.modalOpen, r4b);

/* ══ 5 — START with no recorded vehicle odometer ⇒ editable ══ */
console.log('\n[5 — START, vehicle has no odometer ⇒ field editable]');
const r5 = await page.evaluate(async () => {
  window.__M.openOdometerModalForTest('start', 'S1', { id: 'S1', driver: 'Igo', vehicle: '', date: '2026-09-01', startTime: '08:00', endTime: '10:00', status: 'assigned' }, () => {});
  await new Promise(r => setTimeout(r, 30));
  const input = document.getElementById('odoInput');
  return {
    label: document.getElementById('odoInputLabel').textContent.trim(),
    readonly: input.hasAttribute('readonly'),
    lockHidden: document.getElementById('odoLock').hidden,
    correctBtnHidden: document.getElementById('btnOdoCorrect').hidden,
  };
});
check('label is KM AWAL', r5.label === 'KM AWAL', r5);
check('field is editable (no lock) when the vehicle has no recorded odometer', r5.readonly === false && r5.lockHidden === true && r5.correctBtnHidden === true, r5);

/* ══ 6 — static: app.js writes the odometer_corrected audit event on a start override ══ */
console.log('\n[6 — static: audit trail for a corrected start odometer]');
const appSrc = srcOf('js/app.js');
check("registerStartCallback logs action 'odometer_corrected' when odoData.odometerCorrected",
  /if \(odoData\.odometerCorrected\) \{[\s\S]*?action: 'odometer_corrected'/.test(appSrc));
check('the audit metadata preserves before/after + reason (evidence not erased)',
  /before: odoData\.previousStartOdometer \?\? null/.test(appSrc) && /after: assignments\[idx\]\.startOdometer/.test(appSrc) && /reason: odoData\.correctionReason/.test(appSrc));

check('no unexpected console errors', errs.length === 0, errs);

await browser.close();
server.close();
console.log(`\nodometer-completion-guard-check: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
