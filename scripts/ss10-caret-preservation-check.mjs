/* ss10-caret-preservation-check.mjs — SS10 mobile input hardening.

   Engineering's and Gudang's search/filter inputs re-render their whole
   screen on every keystroke (the established, accepted app-wide pattern
   for live search — see js/ui/focus-preserving-render.js), then
   restoreFocus() re-focuses the freshly-recreated input. Both modules'
   restoreFocus() used to unconditionally call
   `el.setSelectionRange(el.value.length, el.value.length)` — the caret
   ALWAYS jumped to the end of the string after every character, making it
   impossible to edit/fix a character in the middle of a query on mobile.

   The fix: onInput now captures the input's real selectionStart/End into
   st._focusSel BEFORE render() destroys the node; restoreFocus() uses
   that captured range instead of guessing "end". This script verifies:

     [1] static — both files actually capture st._focusSel in onInput and
         actually consume it (not el.value.length) in restoreFocus.
     [2] behavioral — the restore ALGORITHM itself, applied to a real
         <input> in a real browser, lands the caret at the captured
         position, not the end — and that the OLD algorithm (kept here
         only as the negative control) demonstrably did jump to the end.

   Pure static check + a minimal isolated-DOM browser check (no app boot,
   no login — the algorithm is identical regardless of which module's
   render() called it, so one isolated proof covers both wirings, backed
   by the static check confirming both actually call it).

   Run: node scripts/ss10-caret-preservation-check.mjs   (exit 0 = pass) */

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

console.log('\n[1 — static: both modules capture + consume the real selection]');
const eng = fs.readFileSync(path.join(ROOT, 'js/engineering/ui/engineering-center.js'), 'utf-8');
const gud = fs.readFileSync(path.join(ROOT, 'js/gudang/ui/gudang-center.js'), 'utf-8');

check('engineering onInput captures selectionStart/End for eng-search',
  /ds\.act === 'eng-search'.*st\._focusSel = \{ start: t\.selectionStart, end: t\.selectionEnd \}/.test(eng));
check('engineering onInput captures selectionStart/End for eng-hsearch',
  /ds\.act === 'eng-hsearch'.*st\._focusSel = \{ start: t\.selectionStart, end: t\.selectionEnd \}/.test(eng));
check('engineering onInput captures selectionStart/End for eng-personnel-search',
  /ds\.act === 'eng-personnel-search'.*st\._focusSel = \{ start: t\.selectionStart, end: t\.selectionEnd \}/.test(eng));
check('engineering restoreFocus reads st._focusSel (not a bare value.length jump-to-end)',
  /const sel = st\._focusSel;[\s\S]{0,200}el\.setSelectionRange\(start, end\)/.test(eng));

check('gudang onInput captures selectionStart/End for every live input (before the act dispatch)',
  /st\._focusSel = \{ start: t\.selectionStart, end: t\.selectionEnd \};/.test(gud));
check('gudang restoreFocus reads st._focusSel (not a bare value.length jump-to-end)',
  /const sel = st\._focusSel;[\s\S]{0,200}el\.setSelectionRange\(start, end\)/.test(gud));

// Both old buggy one-liners must be GONE, not just "a new one added nearby".
check('engineering restoreFocus no longer has the old unconditional end-of-string jump',
  !/el\.focus\(\); try \{ const n = el\.value\.length; el\.setSelectionRange\(n, n\); \} catch/.test(eng));
check('gudang restoreFocus no longer has the old unconditional end-of-string jump',
  !/el\.focus\(\); try \{ const n = el\.value\.length; el\.setSelectionRange\(n, n\); \} catch/.test(gud));

console.log('\n[2 — behavioral: the restore algorithm actually preserves a mid-string caret]');
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setContent('<input id="i" value="">');

const result = await page.evaluate(() => {
  const el = document.getElementById('i');
  // Simulate: user typed "ABC|XYZ" (caret after C, position 3), then a
  // character is inserted making the live value "ABCDXYZ" with the
  // intended caret still sitting right after the inserted "D" (position 4)
  // — the exact "editing mid-query" scenario the bug broke.
  el.value = 'ABCDXYZ';
  const capturedSel = { start: 4, end: 4 };

  // NEW algorithm (as shipped in both restoreFocus() functions).
  el.focus();
  const n1 = el.value.length;
  const newStart = capturedSel.start != null ? Math.min(capturedSel.start, n1) : n1;
  const newEnd = capturedSel.end != null ? Math.min(capturedSel.end, n1) : n1;
  el.setSelectionRange(newStart, newEnd);
  const newCaret = el.selectionStart;

  // OLD algorithm (the bug being fixed — kept here only as a negative
  // control proving the test actually distinguishes the two).
  el.focus();
  const n2 = el.value.length;
  el.setSelectionRange(n2, n2);
  const oldCaret = el.selectionStart;

  return { newCaret, oldCaret, valueLength: el.value.length };
});

check('OLD algorithm (pre-fix) really did jump to end-of-string — confirms this is a real regression, not a strawman',
  result.oldCaret === result.valueLength, result);
check('NEW algorithm restores the caret to the real captured mid-string position (4), not the end (7)',
  result.newCaret === 4, result);

await browser.close();

console.log(`\nss10-caret-preservation-check: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
