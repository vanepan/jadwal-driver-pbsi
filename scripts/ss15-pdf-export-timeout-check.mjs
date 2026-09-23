/* ss15-pdf-export-timeout-check.mjs — SS15 hardening for
   js/docs/pdf-exporter.js's PdfmakeBackend.exportToPdf().

   v1.28.11's own documented incident (js/config.js changelog) root-caused a
   REAL production hang: "Cetak / PDF" showed "Menyiapkan PDF..." forever,
   with no download, no print dialog, no error. Root cause: pdfmake's
   internal DocMeasure/extendTableWidths mutates the `widths:` array it's
   handed; against a frozen array this throws — but it throws deep inside
   getBlob()'s ASYNC internal measurement pipeline, AFTER exportToPdf()'s
   synchronous try/catch has already returned. Neither resolve() nor
   reject() is ever called, so the Promise — and every await above it —
   hangs forever; no finally anywhere up the chain can run, because finally
   never runs on a promise that never settles.

   That release fixed only the ONE trigger site (templates/nor.js's frozen
   arrays were spread into fresh copies before being handed to pdfmake).
   The exporter itself had no general safeguard — ANY OTHER pdfmake-internal
   throw in ANY template (bad image data, an invalid font reference, a
   malformed table) reproduces the identical permanent hang.

   Fix: exportToPdf() now races getBlob() against a bounded timeout
   (PDF_EXPORT_TIMEOUT_MS, matching the project's existing 30s convention —
   see gudang-item-image.js's STORAGE_TIMEOUT_MS) with a `settled` guard so
   whichever settles first wins and the other is a no-op. This guarantees
   the returned Promise ALWAYS eventually settles, so callers' finally
   blocks release their loading state and the user gets an honest,
   retryable error instead of an infinite spinner.

   [1] static  — the timeout/settled-guard pattern is wired into
       exportToPdf(), and the happy path (getBlob resolves normally) is
       unchanged.
   [2] dynamic — proves the settle-race pattern itself actually converts a
       "callback never invoked" hang (the exact production failure shape)
       into a bounded rejection, in total isolation with a fake pdfMake
       (this module does real DOM script-injection via
       document.createElement('script') to lazy-load the real pdfmake CDN
       bundle — never imported/executed here, same "no real I/O in headless
       scripts" convention as every other ss1x-*-check.mjs).

   Run: node scripts/ss15-pdf-export-timeout-check.mjs   (exit 0 = pass) */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); if (detail !== undefined) console.log('     ' + JSON.stringify(detail)); }
};

console.log('[1 — static: exportToPdf() wires a bounded timeout race with a settled guard]');
const src = fs.readFileSync(path.join(ROOT, 'js/docs/pdf-exporter.js'), 'utf-8');

check('a PDF_EXPORT_TIMEOUT_MS constant exists, matching the project\'s existing 30s timeout convention', /const PDF_EXPORT_TIMEOUT_MS = 30000;/.test(src));

const backendBody = src.slice(src.indexOf('class PdfmakeBackend'), src.indexOf('class PuppeteerBackend'));
check('a setTimeout races against getBlob()', /setTimeout\(\(\) => \{[\s\S]*?\}, PDF_EXPORT_TIMEOUT_MS\)/.test(backendBody));
check('the timeout path rejects with an honest, user-facing message (not a silent swallow)', /reject\(new Error\('Pembuatan PDF melebihi batas waktu/.test(backendBody));
check('a `settled` guard exists so only the FIRST of (timeout, success, sync throw) wins', /let settled = false;/.test(backendBody));
check('the timer is cleared on a successful settle (no dangling timer after a fast export)', /clearTimeout\(timer\)/.test(backendBody));
check('the happy path (getBlob calls back) still resolves the blob', /pdfMake\.createPdf\(definition\)\.getBlob\(blob => settleResolve\(blob\)\)/.test(backendBody));
check('a synchronous throw from createPdf() still rejects (pre-existing behavior preserved)', /catch \(err\) \{\s*\n\s*settleReject\(err\);/.test(backendBody));

console.log('\n[2 — dynamic (isolated): the settle-race pattern converts a "callback never invoked" hang into a bounded rejection]');

// Mirrors exportToPdf()'s exact shape with an injectable timeout, against a
// fake pdfMake whose getBlob() callback is (deliberately) never invoked —
// the precise shape of the documented production incident: an internal
// throw inside pdfmake's own async pipeline that never reaches the
// callback at all.
function makeExportToPdf(timeoutMs) {
  return function exportToPdf(pdfMakeLike) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error('Pembuatan PDF melebihi batas waktu. Coba lagi.'));
      }, timeoutMs);
      const settleResolve = (blob) => { if (settled) return; settled = true; clearTimeout(timer); resolve(blob); };
      const settleReject = (err) => { if (settled) return; settled = true; clearTimeout(timer); reject(err); };
      try {
        pdfMakeLike.createPdf().getBlob((blob) => settleResolve(blob));
      } catch (err) {
        settleReject(err);
      }
    });
  };
}

console.log('  -- the documented incident shape: getBlob() never invokes its callback --');
{
  const exportToPdf = makeExportToPdf(20); // short timeout for a fast test, same pattern as the real 30000ms
  const hangingPdfMake = { createPdf: () => ({ getBlob: () => { /* never calls back — the exact incident */ } }) };
  const start = Date.now();
  let rejected = false, err = null;
  try { await exportToPdf(hangingPdfMake); } catch (e) { rejected = true; err = e; }
  const elapsed = Date.now() - start;
  check('the promise eventually REJECTS instead of hanging forever', rejected);
  check('it settles at (approximately) the timeout boundary, not instantly and not never', elapsed >= 15 && elapsed < 2000, elapsed);
  check('the rejection carries an honest, actionable message', !!err && /batas waktu/.test(err.message), err && err.message);
}

console.log('  -- the happy path: getBlob() resolves well within the timeout --');
{
  const exportToPdf = makeExportToPdf(5000);
  const fastPdfMake = { createPdf: () => ({ getBlob: (cb) => setTimeout(() => cb('fake-blob'), 5) }) };
  const result = await exportToPdf(fastPdfMake);
  check('a normal, fast export still resolves with the blob (timeout does not interfere)', result === 'fake-blob', result);
}

console.log('  -- a synchronous throw from createPdf() still rejects immediately (pre-existing behavior) --');
{
  const exportToPdf = makeExportToPdf(5000);
  const throwingPdfMake = { createPdf: () => { throw new Error('bad docDefinition'); } };
  let rejected = false, err = null;
  const start = Date.now();
  try { await exportToPdf(throwingPdfMake); } catch (e) { rejected = true; err = e; }
  check('rejects immediately, not after waiting for the timeout', rejected && (Date.now() - start) < 200);
  check('propagates the original error message', err && err.message === 'bad docDefinition', err && err.message);
}

console.log('  -- a late getBlob() callback firing AFTER the timeout already rejected is a safe no-op --');
{
  const exportToPdf = makeExportToPdf(20);
  let lateCallback;
  const lateCallingPdfMake = { createPdf: () => ({ getBlob: (cb) => { lateCallback = cb; } }) };
  let rejected = false;
  try { await exportToPdf(lateCallingPdfMake); } catch (_e) { rejected = true; }
  check('timed out as expected', rejected);
  let threw = false;
  try { lateCallback('too-late-blob'); } catch (_e) { threw = true; } // must not throw (e.g. "resolve called twice")
  check('invoking the callback after timeout does not throw (settled guard makes it a harmless no-op)', !threw);
}

console.log(`\nss15-pdf-export-timeout-check: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
