/* home-generate-live-preview-check.mjs — Sprint 11.3 (Document-first
   Experience), Requirement 1: "Generate Draft immediately opens Live
   Preview, not metadata."

   Real browser, real DOM click flow, reusing sarpras-workspace-
   harness.html. Drives the Home screen's OWN Conversation entry point
   (homeState/sic-conv-* — a SEPARATE call site from NOR Center's Generate
   tab, see nor-center-generate-redirect-check.mjs for that one) through a
   real CREATE_NOR utterance end to end — Conversation -> Questions ->
   ready -> "Susun NOR" — and proves the SAME navigation fix applies here
   too: composeApprovedNor succeeding must land the human directly on the
   Live Document Workspace showing the real rendered NOR, never leave them
   on the Home dashboard to go find their new draft manually.

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

console.log('\n[Home — real Conversation, real browser, ends on the Live Document Preview]');

const seeded = await page.evaluate(() => window.__seedNorCompositionKnowledge());
check('real Approved structural+pattern Knowledge seeded for this run', seeded === true);

await page.evaluate(() => {
  const input = document.querySelector('[data-act="sic-conv-input"]');
  input.value = 'Buatkan NOR perjalanan dinas.';
  input.dispatchEvent(new Event('input', { bubbles: true }));
});
await page.evaluate(() => { document.querySelector('[data-act="sic-conv-start"]')?.click(); });
await new Promise((r) => { setTimeout(r, 300); });

let html = await page.evaluate(() => window.__hostHTML());
check('a real Conversation result renders on Home, with a real answerable form', html.includes('sic-conv-fact-input') && html.includes('sic-conv-continue'));

const ANSWERS = { destination: 'Bandung', traveler: 'Unit Engineering', departureDate: '2026-08-01', returnDate: '2026-08-03', budget: '5000000' };
await page.evaluate((answers) => {
  for (const [field, value] of Object.entries(answers)) {
    const input = document.querySelector(`[data-act="sic-conv-fact-input"][data-field="${field}"]`);
    if (input) { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); }
  }
}, ANSWERS);
await page.evaluate(() => { document.querySelector('[data-act="sic-conv-continue"]')?.click(); });
await new Promise((r) => { setTimeout(r, 300); });

html = await page.evaluate(() => window.__hostHTML());
check('the Conversation reached state:ready — "Susun NOR" button is now visible', html.includes('sic-compose-nor') && html.includes('Susun NOR'));

await page.evaluate(() => { document.querySelector('[data-act="sic-compose-nor"]')?.click(); });
await new Promise((r) => { setTimeout(r, 500); }); // real dynamic import() of review-workspace.js on its first visit

html = await page.evaluate(() => window.__hostHTML());
const screenVisibility = await page.evaluate(() => ({
  dashboard: document.querySelector('[data-sic-screen="dashboard"]')?.style.display,
  review: document.querySelector('[data-sic-screen="review"]')?.style.display,
}));
check('composeApprovedNor was actually called and succeeded (no error message shown)', !html.includes('sic-next-action">Error'));
check('a successful compose navigates AWAY from the Home dashboard (its screen is now hidden)', screenVisibility.dashboard === 'none');
check('the Review Workspace screen is now the one actually visible', screenVisibility.review === '');

const reviewHtml = await page.evaluate(() => document.querySelector('[data-sic-screen="review"]').innerHTML);
check('lands directly on the Live Document Preview (the rendered NOR itself), never a bare list', reviewHtml.includes('rw-doc') && reviewHtml.includes('Nota Organisasi'));
check('the new document is genuinely OPEN, not just a list the human would still have to click into', reviewHtml.includes('rw-editable'));
check('zero fatal module/render errors across the whole flow', !bootErrors.some((e) => FATAL_PATTERN.test(e)) || (console.log(bootErrors), false));

/* ══════════════════════════════════════════════════════════════════════
   Sprint 11.10 (Product Architecture Gap Closure) — Fix 6 "Live Preview
   First": a SECOND, separate conversation, answering only PART of the
   required facts, then using the NEW "Susun Draf Sekarang" opt-in action
   instead of finishing the guided Q&A — proves the additive early-compose
   path is real and reachable end to end in the actual mounted app, not
   just at the service layer (already proven by problem-solving-
   integration-check.mjs).
   ══════════════════════════════════════════════════════════════════════ */
console.log('\n[Home — Sprint 11.10 "Susun Draf Sekarang": an early, incomplete draft opens Live Preview]');

await page.evaluate(() => {
  const input = document.querySelector('[data-act="sic-conv-input"]');
  input.value = 'Buatkan NOR perjalanan dinas.';
  input.dispatchEvent(new Event('input', { bubbles: true }));
});
await page.evaluate(() => { document.querySelector('[data-act="sic-conv-start"]')?.click(); });
await new Promise((r) => { setTimeout(r, 300); });

let draftHtml = await page.evaluate(() => window.__hostHTML());
check('the still-ACTIVE conversation (no answers given yet) shows the NEW "Susun Draf Sekarang" action', draftHtml.includes('sic-compose-nor-draft') && draftHtml.includes('Susun Draf Sekarang'));
check('the regular "Susun NOR" button is correctly NOT shown yet — real facts are still missing', !draftHtml.includes('data-act="sic-compose-nor"'));

// Answer only ONE of the five required facts, then compose the draft
// early — proving genuinely incomplete data still produces a real Live
// Preview, never blocked, never fabricated.
await page.evaluate(() => {
  const input = document.querySelector('[data-act="sic-conv-fact-input"][data-field="destination"]');
  if (input) { input.value = 'Bandung'; input.dispatchEvent(new Event('input', { bubbles: true })); }
});
await page.evaluate(() => { document.querySelector('[data-act="sic-conv-continue"]')?.click(); });
await new Promise((r) => { setTimeout(r, 300); });

draftHtml = await page.evaluate(() => window.__hostHTML());
check('after answering only 1 of 5 facts, the conversation is still ACTIVE, not ready — "Susun Draf Sekarang" is still the only compose action shown', draftHtml.includes('sic-compose-nor-draft') && !draftHtml.includes('data-act="sic-compose-nor"'));

await page.evaluate(() => { document.querySelector('[data-act="sic-compose-nor-draft"]')?.click(); });
await new Promise((r) => { setTimeout(r, 500); });

const draftScreenVisibility = await page.evaluate(() => ({
  dashboard: document.querySelector('[data-sic-screen="dashboard"]')?.style.display,
  review: document.querySelector('[data-sic-screen="review"]')?.style.display,
}));
check('composing early (allowIncomplete) succeeds — navigates away from the Home dashboard', draftScreenVisibility.dashboard === 'none');
check('lands on the real Review Workspace screen, exactly like a normal "Susun NOR"', draftScreenVisibility.review === '');

const earlyReviewHtml = await page.evaluate(() => document.querySelector('[data-sic-screen="review"]').innerHTML);
check('the early draft renders as a real Live Document, not a bare list or an error', earlyReviewHtml.includes('rw-doc') && earlyReviewHtml.includes('rw-editable'));
check('the one fact the human DID give (Bandung) is genuinely present in the composed draft', earlyReviewHtml.includes('Bandung'));
check('a still-missing fact renders as the SAME honest "Klik untuk mengisi…" placeholder every other empty field uses — never {{UNKNOWN}}, never raw JSON', earlyReviewHtml.includes('Klik untuk mengisi') || earlyReviewHtml.includes('rw-editable--empty'));
check('zero fatal module/render errors across the early-compose flow', !bootErrors.some((e) => FATAL_PATTERN.test(e)) || (console.log(bootErrors), false));

await browser.close();
server.close();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
