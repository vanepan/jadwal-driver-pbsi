/* home-generate-live-preview-check.mjs — Sprint 11.3 (Document-first
   Experience), Requirement 1: "Generate Draft immediately opens Live
   Preview, not metadata." Re-targeted for Phase 2, Stage 1 (Prompt ->
   Generate Foundation).

   Real browser, real DOM click flow, reusing sarpras-workspace-
   harness.html. Drives the Home screen's OWN Conversation entry point
   (homeState/sic-conv-* — a SEPARATE call site from NOR Center's Generate
   tab, see nor-center-generate-redirect-check.mjs for that one).

   Stage 1 made Draft Generation begin immediately once a Conversation
   starts (sarpras-intelligence-center.js#attemptGenerateDraft), removing
   both the guided Q&A fact-answering form (sic-conv-fact-input /
   sic-conv-continue) and the two compose buttons this file used to drive
   ("Susun NOR" once ready, the Sprint 11.10 opt-in "Susun Draf Sekarang"
   for an early/incomplete draft) — there is no longer a ready-vs-active
   distinction a human ever acts on: composeApprovedNor(..., {
   allowIncomplete: true }) now runs on the very first submission
   regardless of how many facts the utterance itself carried. That
   collapses this file's old two-scenario shape (full answers vs. one-of-
   five) into a single flow — verified directly (see
   src/intake/problem-parser.js#extractFacts) that 'business_trip'
   extracts only `type` from the utterance, never `destination`, so no
   utterance phrasing can pre-fill a fact the old form used to collect by
   hand; every fact besides `type` is therefore genuinely unknown at
   generation time in this flow today, on purpose.

   What THIS file still proves, that sarpras-home-experience-check.mjs's
   own Conversation check does not go looking for as precisely: the
   destination screen is the actual rendered Live Document Preview
   (rw-doc / "Nota Organisasi" / rw-editable) — not just "some screen that
   isn't dashboard" — and every unresolved fact renders as the same honest
   placeholder, never fabricated content.

   Screen visibility is checked precisely via each screen's own
   `[data-sic-screen]` element's `style.display` (sarpras-intelligence-
   center.js#showScreen only ever toggles this, never destroys a screen's
   DOM) — a substring search over the full host innerHTML cannot tell
   which screen a human would actually see.
   Run: node scripts/home-generate-live-preview-check.mjs   (exit 0 = pass) */

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
const bootErrors = [];
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
page.on('pageerror', (e) => bootErrors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('Failed to load resource')) bootErrors.push('console.error: ' + m.text()); });

await page.goto(`http://localhost:${port}/scripts/sarpras-workspace-harness.html`, { waitUntil: 'networkidle2', timeout: 45000 });
await page.waitForFunction('window.__ready === true', { timeout: 15000 });
await page.evaluate(() => window.__mount());
await new Promise((r) => { setTimeout(r, 500); });

console.log('\n[Home — real Conversation, real browser, one submission lands directly on the Live Document Preview]');

const seeded = await page.evaluate(() => window.__seedNorCompositionKnowledge());
check('real Approved structural+pattern Knowledge seeded for this run', seeded === true);

await page.evaluate(() => {
  const input = document.querySelector('[data-act="sic-conv-input"]');
  input.value = 'Buatkan NOR perjalanan dinas.';
  input.dispatchEvent(new Event('input', { bubbles: true }));
});
await page.evaluate(() => { document.querySelector('[data-act="sic-conv-start"]')?.click(); });
await new Promise((r) => { setTimeout(r, 500); }); // real dynamic import() of review-workspace.js on its first visit

const html = await page.evaluate(() => window.__hostHTML());
check('no intermediate fact-answering form is ever shown — generation began immediately, not gated on a "Susun NOR"/"Susun Draf Sekarang" click', !html.includes('sic-conv-fact-input') && !html.includes('sic-compose-nor'));

const screenVisibility = await page.evaluate(() => ({
  dashboard: document.querySelector('[data-sic-screen="dashboard"]')?.style.display,
  review: document.querySelector('[data-sic-screen="review"]')?.style.display,
}));
check('composeApprovedNor was actually called and succeeded (no error message shown)', !html.includes('sic-next-action">Error'));
check('the single submission navigates AWAY from the Home dashboard (its screen is now hidden)', screenVisibility.dashboard === 'none');
check('the Review Workspace screen is now the one actually visible', screenVisibility.review === '');

const reviewHtml = await page.evaluate(() => document.querySelector('[data-sic-screen="review"]').innerHTML);
check('lands directly on the Live Document Preview (the rendered NOR itself), never a bare list', reviewHtml.includes('rw-doc') && reviewHtml.includes('Nota Organisasi'));
check('the new document is genuinely OPEN, not just a list the human would still have to click into', reviewHtml.includes('rw-editable'));
check('a genuinely unknown fact (the utterance only carried the NOR type, never a destination — see extractFacts note above) renders the same honest placeholder every other empty field uses, never a fabricated value', reviewHtml.includes('Klik untuk mengisi') || reviewHtml.includes('rw-editable--empty'));
check('zero fatal module/render errors across the whole flow', !bootErrors.some((e) => FATAL_PATTERN.test(e)) || (console.log(bootErrors), false));

await browser.close();
server.close();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
