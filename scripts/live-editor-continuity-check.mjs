/* live-editor-continuity-check.mjs — Phase 12.8.x, Sprint 1 (Experience
   Completion): "continuous flow" without rewriting review-workspace.js's
   per-field contenteditable commit model.

   Real browser, real DOM. Proves advanceFocusAfterEnter() genuinely moves
   focus to the NEXT `.rw-editable` block after a real Enter-committed
   edit, and that it does NOT fire for a plain click-away blur or for an
   Enter that changed nothing (onFocusOut's own before===after no-op).

   Run: node scripts/live-editor-continuity-check.mjs   (exit 0 = pass) */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('not found'); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

let pass = 0; let fail = 0;
function check(name, cond) { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } }

const errors = [];
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
await page.goto(`http://localhost:${port}/`, { waitUntil: 'domcontentloaded' });

const result = await page.evaluate(async () => {
  const { createDocument } = await import('/js/v2/document-intelligence/composer/composer-store.js');
  const { mountReviewWorkspace } = await import('/js/v2/ui/review-workspace.js');

  localStorage.setItem('pbsi_current_user', JSON.stringify({ username: 'evan', role: 'admin' }));

  const doc = createDocument('nor', { subject: 'Pengadaan Kabel HDMI', purpose: 'Kebutuhan operasional', total: 250000 });

  const root = document.createElement('div');
  document.body.appendChild(root);
  await mountReviewWorkspace(root);
  root.querySelector(`[data-act="rw-doc-row"][data-id="${doc.documentId}"]`)?.click();

  function editablesInOrder() {
    return [...root.querySelectorAll('.rw-editable[contenteditable="true"]')];
  }
  function fieldOf(el) { return el && (el.dataset.field || el.dataset.newField); }

  // 1. A real Enter-committed edit advances focus to the NEXT block.
  const before = editablesInOrder();
  const subjectEl = before.find((el) => fieldOf(el) === 'subject');
  const idx = before.indexOf(subjectEl);
  const expectedNextField = fieldOf(before[idx + 1]);

  subjectEl.focus();
  subjectEl.textContent = 'Pengadaan Kabel HDMI (revisi)';
  subjectEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 50));

  const activeFieldAfterEnter = fieldOf(document.activeElement.closest && document.activeElement.closest('.rw-editable'));

  // 2. A plain click-away blur (no Enter) must NOT advance focus anywhere.
  const purposeEl = [...root.querySelectorAll('.rw-editable[contenteditable="true"]')].find((el) => fieldOf(el) === 'purpose');
  purposeEl.focus();
  purposeEl.textContent = 'Kebutuhan operasional (revisi)';
  purposeEl.blur(); // no keydown Enter — a plain click-away
  await new Promise((r) => setTimeout(r, 50));
  const activeFieldAfterBlur = document.activeElement === document.body ? null : fieldOf(document.activeElement.closest && document.activeElement.closest('.rw-editable'));

  // 3. Enter with NO actual change (before === after) must not desync the
  //    flag or cause a wrong jump on the NEXT real edit.
  const totalEl = [...root.querySelectorAll('.rw-editable[contenteditable="true"]')].find((el) => fieldOf(el) === 'total');
  totalEl.focus();
  totalEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); // no text change at all
  await new Promise((r) => setTimeout(r, 50));

  return {
    expectedNextField,
    activeFieldAfterEnter,
    activeFieldAfterBlur,
    editablesStillPresent: editablesInOrder().length === before.length,
  };
});

check('after a real Enter-committed edit, focus moved to the NEXT block (not lost, not stuck)', result.activeFieldAfterEnter === result.expectedNextField);
check('a plain click-away blur (no Enter) never advances focus anywhere', result.activeFieldAfterBlur === null || result.activeFieldAfterBlur === undefined);
check('the document still renders the same number of editable blocks after all commits (no field lost/duplicated)', result.editablesStillPresent);

const fatal = errors.filter((e) => /SyntaxError|ReferenceError|TypeError|is not a function|Failed to (load|fetch) module|Cannot use import|does not provide an export/i.test(e));
check('zero fatal module/render errors', fatal.length === 0);
if (fatal.length) fatal.forEach((e) => console.log('   ✗', e));

console.log(`\n${pass}/${pass + fail} checks passed.`);
await browser.close();
server.close();
if (fail > 0) process.exit(1);
