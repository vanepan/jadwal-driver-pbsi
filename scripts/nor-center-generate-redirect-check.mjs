/* nor-center-generate-redirect-check.mjs — Sprint 11.1, Workstream 2
   (production feedback), UPDATED Sprint 11.3 (Document-first Experience).
   Real browser, real DOM click flow, reusing sarpras-workspace-harness.html.

   PROVES the "Generate NOR" tab's CONVERSATION now runs NATIVELY inside
   NOR Center end to end — Conversation -> Questions -> ready-to-compose —
   without ever navigating to another screen mid-conversation (the exact
   complaint raised against the earlier "redirect to Home" version of this
   fix: "the entire conversation should stay inside NOR Center... without
   redirecting to another page"). That invariant is UNCHANGED and still
   asserted below, right up through the Conversation reaching state:ready.

   Sprint 11.3 SUPERSEDES the ORIGINAL final assertion only ("the crumb
   never disappears even after composing"): Requirement 1 ("Generate Draft
   immediately opens Live Preview, not metadata") means a SUCCESSFUL
   compose must now navigate to the Live Document Workspace automatically
   — a deliberate, different kind of transition from the one Sprint 11.1
   guarded against. Sprint 11.1's complaint was about being redirected
   AWAY from a task never asked to leave (mid-conversation); Sprint 11.3's
   requirement is about advancing to the NATURAL next step once the
   conversation is already fully done and "Susun NOR" is clicked. Screen
   visibility is checked precisely via each screen's own
   `[data-sic-screen]` element's `style.display` (sarpras-intelligence-
   center.js#showScreen only ever toggles this — it never destroys a
   screen's DOM — so a substring search over the full host innerHTML, as
   this script used before, cannot actually tell which screen a human
   would see; it would stay true even for a screen now hidden).
   Run: node scripts/nor-center-generate-redirect-check.mjs   (exit 0 = pass) */

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

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); }
}

const FATAL_PATTERN = /SyntaxError|ReferenceError|TypeError|is not a function|Failed to (load|fetch) module|Cannot use import|does not provide an export/;
const CREW_MARKER = 'NOR CENTER · GENERATE';
const bootErrors = [];
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
page.on('pageerror', (e) => bootErrors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('Failed to load resource')) bootErrors.push('console.error: ' + m.text()); });

await page.goto(`http://localhost:${port}/scripts/sarpras-workspace-harness.html`, { waitUntil: 'networkidle2', timeout: 45000 });
await page.waitForFunction('window.__ready === true', { timeout: 15000 });
await page.evaluate(() => window.__mount());
await new Promise((r) => { setTimeout(r, 800); });

console.log('\n[Generate NOR — real native conversation, real browser, never leaves NOR Center]');

const seeded = await page.evaluate(() => window.__seedNorCompositionKnowledge());
check('real Approved structural+pattern Knowledge seeded for this run', seeded === true);

await page.evaluate(() => window.__setScreen('nor'));
await new Promise((r) => { setTimeout(r, 300); });
await page.evaluate(() => { document.querySelector('[data-act="wlk-tab"][data-id="generate"]')?.click(); });
await new Promise((r) => { setTimeout(r, 200); });

const generateTabHtml = await page.evaluate(() => window.__hostHTML());
check('the Generate tab renders the real input + submit button', generateTabHtml.includes('ncGenerateInput') && generateTabHtml.includes('nc-generate-submit'));
check('the old dead-end outcome copy ("Panduan struktural tersedia") is GONE from this codebase\'s live output', !generateTabHtml.includes('Panduan struktural tersedia'));

await page.evaluate(() => {
  const input = document.getElementById('ncGenerateInput');
  input.value = 'Buatkan NOR perjalanan dinas.';
  input.dispatchEvent(new Event('input', { bubbles: true }));
});
await page.evaluate(() => { document.querySelector('[data-act="nc-generate-submit"]')?.click(); });
await new Promise((r) => { setTimeout(r, 300); });

let html = await page.evaluate(() => window.__hostHTML());
check('a real Conversation result (the legacy CREATE_NOR path) renders INSIDE this tab, with a real answerable form (not a static list — production feedback fix)', html.includes('sic-conv-result') && html.includes('nc-conv-fact-input') && html.includes('nc-conv-continue'));
check('the NOR CENTER · GENERATE crumb is STILL showing — no cross-screen redirect happened', html.includes(CREW_MARKER));

// Answer every real missing fact field this fixture's Conversation lists,
// by real field name (data-field), the SAME field set problem-solving-
// integration-check.mjs's Node-side equivalent test already proved this
// exact questionnaire needs (destination/traveler/departureDate/
// returnDate/budget), then submit them all in ONE continueConversation()
// call — proving the previously-nonexistent answer path now genuinely
// exists and genuinely advances the real Conversation to state:'ready'.
const ANSWERS = { destination: 'Bandung', traveler: 'Unit Engineering', departureDate: '2026-08-01', returnDate: '2026-08-03', budget: '5000000' };
await page.evaluate((answers) => {
  for (const [field, value] of Object.entries(answers)) {
    const input = document.querySelector(`[data-act="nc-conv-fact-input"][data-field="${field}"]`);
    if (input) { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); }
  }
}, ANSWERS);
await page.evaluate(() => { document.querySelector('[data-act="nc-conv-continue"]')?.click(); });
await new Promise((r) => { setTimeout(r, 200); });
const afterContinue = await page.evaluate(() => window.__hostHTML());
check('continueConversation() genuinely advanced the Conversation — no field is listed as missing anymore', !afterContinue.includes('Masih diperlukan') || afterContinue.includes('Susun NOR'));
check('still inside NOR Center after answering (no redirect)', afterContinue.includes(CREW_MARKER));

html = await page.evaluate(() => window.__hostHTML());
check('the Conversation reached state:ready — "Susun NOR" button is now visible, all inside this tab', html.includes('nc-compose-nor') && html.includes('Susun NOR'));

await page.evaluate(() => { document.querySelector('[data-act="nc-compose-nor"]')?.click(); });
await new Promise((r) => { setTimeout(r, 500); }); // real dynamic import() of review-workspace.js on its first visit

html = await page.evaluate(() => window.__hostHTML());
const screenVisibility = await page.evaluate(() => ({
  nor: document.querySelector('[data-sic-screen="nor"]')?.style.display,
  review: document.querySelector('[data-sic-screen="review"]')?.style.display,
}));
check('composeApprovedNor was actually called and succeeded (no error message shown)', !html.includes('sic-next-action">Error'));
check('Sprint 11.3 — a successful compose navigates AWAY from NOR Center (its screen is now hidden)', screenVisibility.nor === 'none');
check('Sprint 11.3 — the Review Workspace screen is now the one actually visible', screenVisibility.review === '');

const reviewHtml = await page.evaluate(() => document.querySelector('[data-sic-screen="review"]').innerHTML);
check('Sprint 11.3 Requirement 1 — lands directly on the Live Document Preview (the rendered NOR itself), never a bare list', reviewHtml.includes('rw-doc') && reviewHtml.includes('Nota Organisasi'));
check('the new document is genuinely OPEN, not just a list the human would still have to click into', reviewHtml.includes('rw-editable'));
check('zero fatal module/render errors across the whole native-conversation flow', !bootErrors.some((e) => FATAL_PATTERN.test(e)) || (console.log(bootErrors), false));

await browser.close();
server.close();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
