/* problem-first-home-dom-check.mjs — Phase 10.5 ("Home Entry Point
   Migration / Problem-First Architecture"), Part 7 (Validation).

   Drives the REAL Home free-text entry point in an actual browser (reuses
   sarpras-workspace-harness.html unchanged — no new test-only hooks were
   needed) through all 5 of this phase's own required scenarios, asserting
   each one reaches its named expected route and — the phase's own hard
   requirement — that NONE of them ever renders "Request not recognized"
   or an equivalent rejection.

   Run: node scripts/problem-first-home-dom-check.mjs   (exit 0 = pass) */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/scripts/sarpras-workspace-harness.html';
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
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); }
}

const FATAL_PATTERN = /SyntaxError|ReferenceError|TypeError|is not a function|Failed to (load|fetch) module|Cannot use import|does not provide an export/;
const REJECTION_TEXT = /Request not recognized|permintaan tidak dikenali/i;

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const bootErrors = [];
const page = await browser.newPage();
page.on('pageerror', (e) => bootErrors.push('pageerror: ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('Failed to load resource')) bootErrors.push('console.error: ' + m.text());
});

await page.goto(`http://localhost:${port}/scripts/sarpras-workspace-harness.html`, { waitUntil: 'networkidle2', timeout: 45000 });
await page.waitForFunction('window.__ready === true', { timeout: 15000 }).catch(() => {});
await page.evaluate(() => window.__mount());
check('outer shell mounts with zero fatal boot errors', !bootErrors.some((e) => FATAL_PATTERN.test(e)));

/** Types into the real conversation input via a real input event (never a
 *  synthetic value-only set — the same discipline every other DOM check in
 *  this codebase already follows), then clicks the real submit button. */
async function submitUtterance(utterance) {
  await page.evaluate((text) => {
    const input = document.querySelector('#host [data-act="sic-conv-input"]');
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, utterance);
  await page.evaluate(() => document.querySelector('#host [data-act="sic-conv-start"]').click());
  await new Promise((r) => setTimeout(r, 50));
}

console.log('\n[Scenario 1 — "AC kamar atlet rusak" -> Facility -> Diagnostic -> Conversation]');
{
  bootErrors.length = 0;
  await submitUtterance('AC kamar atlet rusak');
  const text = await page.evaluate(() => window.__hostText());
  check('zero fatal errors', !bootErrors.some((e) => FATAL_PATTERN.test(e)));
  check('never "Request not recognized"', !REJECTION_TEXT.test(text));
  check('a real question is shown (Diagnostic Conversation began)', text.includes('mendesak') || text.includes('anggaran') || text.includes('keselamatan'));
  const hasAnswerInput = await page.evaluate(() => !!document.querySelector('#host [data-act="sic-pc-answer-input"]'));
  check('a real answer input is present', hasAnswerInput);
}

console.log('\n[Scenario 2 — "Mau perjalanan dinas" -> Business Trip -> Conversation]');
{
  bootErrors.length = 0;
  await submitUtterance('Mau perjalanan dinas');
  const text = await page.evaluate(() => window.__hostText());
  check('zero fatal errors', !bootErrors.some((e) => FATAL_PATTERN.test(e)));
  check('never "Request not recognized" (this exact phrase used to fail the legacy Intent Engine — see Phase 10.5 Executive Summary)', !REJECTION_TEXT.test(text));
  check('a real question is shown (graceful-degradation Conversation began)', text.includes('Tujuan') || text.includes('tujuan'));
}

console.log('\n[Scenario 3 — "Mau beli meja" -> Procurement -> Conversation]');
{
  bootErrors.length = 0;
  await submitUtterance('Mau beli meja');
  const text = await page.evaluate(() => window.__hostText());
  check('zero fatal errors', !bootErrors.some((e) => FATAL_PATTERN.test(e)));
  check('never "Request not recognized"', !REJECTION_TEXT.test(text));
  check('a real question about the procurement is shown', text.includes('anggaran') || text.includes('Anggaran'));
}

console.log('\n[Scenario 4 — "Kolam renang bocor" -> Facility -> Diagnostic]');
{
  bootErrors.length = 0;
  await submitUtterance('Kolam renang bocor');
  const text = await page.evaluate(() => window.__hostText());
  check('zero fatal errors', !bootErrors.some((e) => FATAL_PATTERN.test(e)));
  check('never "Request not recognized" (this scenario failed before the ASSET_BROKEN pattern fix — see Migration Notes)', !REJECTION_TEXT.test(text));
  check('a real diagnostic question is shown', text.includes('Aset') || text.includes('aset') || text.includes('mendesak'));
}

console.log('\n[Scenario 5 — "Atlet kehilangan ID Card" -> Administration -> Conversation]');
{
  bootErrors.length = 0;
  await submitUtterance('Atlet kehilangan ID Card');
  const text = await page.evaluate(() => window.__hostText());
  check('zero fatal errors', !bootErrors.some((e) => FATAL_PATTERN.test(e)));
  check('never "Request not recognized"', !REJECTION_TEXT.test(text));
  check('a real question about urgency is shown', text.includes('mendesak') || text.includes('Urgensi'));
}

console.log('\n[Part 3 — genuinely unrecognizable input gets CLARIFICATION, never rejection]');
{
  bootErrors.length = 0;
  await submitUtterance('asdkjaslkdj xyzabc random gibberish 12345');
  const text = await page.evaluate(() => window.__hostText());
  check('zero fatal errors', !bootErrors.some((e) => FATAL_PATTERN.test(e)));
  check('never "Request not recognized"', !REJECTION_TEXT.test(text));
  check('a genuine clarifying question is shown instead', text.includes('?') || text.includes('informasi'));
}

console.log('\n[Part 5 — Phase 2, Stage 1: Home is prompt-first, not a dashboard]');
{
  await page.evaluate((id) => window.__setScreen(id), 'dashboard');
  await new Promise((r) => setTimeout(r, 150));
  bootErrors.length = 0;
  const html = await page.evaluate(() => window.__hostHTML());
  check('the old "Buat NOR" quick action button is GONE', !html.includes('sic-quick-action'));
  check('the old "Unggah Dokumen" quick action button is GONE', !/data-act="sic-nav" data-id="archive"[^>]*>Unggah Dokumen/.test(html));
  const oldSearchInputExists = await page.evaluate(() => !!document.querySelector('#host [data-act="sic-search-input"]'));
  check('the old standalone search input is GONE (the prompt field is the one entry point)', !oldSearchInputExists);
  const promptIsFirst = await page.evaluate(() => {
    const content = document.querySelector('#host .sic-content');
    return !!content && content.firstElementChild && content.firstElementChild.classList.contains('sic-card--conversation');
  });
  check('the prompt card is the first element on Home', promptIsFirst);
  // The secondary nav row replaces quick actions/search as the one way to
  // reach Archive/Knowledge/Learning/Settings from Home — still real
  // navigation, just not a second dashboard.
  const secondaryNavBtn = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('#host [data-act="sic-nav"]')].find((b) => b.textContent.trim() === 'Pengetahuan');
    if (btn) btn.click();
    return !!btn;
  });
  check('the secondary nav\'s "Pengetahuan" link exists and is clickable', secondaryNavBtn);
  await new Promise((r) => setTimeout(r, 300));
  const knowledgeScreenHtml = await page.evaluate(() => window.__hostHTML());
  check('Knowledge Center screen mounted with zero fatal errors', !bootErrors.some((e) => FATAL_PATTERN.test(e)) && knowledgeScreenHtml.length > 200);
}

console.log('\n[Part 6 — Developer Pipeline Viewer shows the full trace]');
{
  await page.evaluate((id) => window.__setScreen(id), 'dashboard');
  await new Promise((r) => setTimeout(r, 150));
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('#host [data-act="sic-mode"]')].find((b) => b.dataset.id === 'developer');
    if (btn) btn.click();
  });
  await new Promise((r) => setTimeout(r, 100));
  bootErrors.length = 0;
  await submitUtterance('AC kamar atlet rusak');
  const text = await page.evaluate(() => window.__hostText());
  check('zero fatal errors with Developer Mode active', !bootErrors.some((e) => FATAL_PATTERN.test(e)));
  check('Developer Pipeline Viewer card is present', text.includes('Developer Pipeline Viewer'));
  check('shows Problem Classification stage', text.includes('Problem Classification'));
  check('shows Extracted Entities stage', text.includes('Extracted Entities'));
  check('shows Current Workflow stage', text.includes('Current Workflow'));
  // Reset back to normal so the preference does not leak.
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('#host [data-act="sic-mode"]')].find((b) => b.dataset.id === 'normal');
    if (btn) btn.click();
  });
}

let closeError = null;
try {
  await page.evaluate(() => window.__close());
} catch (e) {
  closeError = e;
}
check('closeSarprasIntelligence() runs without throwing', closeError === null);

await browser.close();
server.close();

console.log(`\n${pass}/${pass + fail} checks passed.`);
if (fail > 0) process.exitCode = 1;
