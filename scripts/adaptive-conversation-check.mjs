/* adaptive-conversation-check.mjs — Phase 11, Sprint 11.2 ("Adaptive
   Conversation").

   The "ask only for missing facts" pipeline (problem-parser.js's own
   extraction -> startConversation's additionalFacts merge -> the Question
   Optimizer) already existed before this sprint (Sprint 11.1 production
   feedback) — see problem-solving-integration-check.mjs's own "a fact
   problem-parser.js already extracted is never re-asked" scenario. This
   sprint closed exactly two real, verified gaps, and this script proves
   both, plus the negative controls that prove neither fabricates a fact:

   1. PURE — problem-parser.js#parseProblem now extracts `quantity` (a
      number) anchored DIRECTLY next to the item keyword it already
      matched — the first non-closed-vocabulary fact this file has ever
      extracted. Never a bare "first number in the sentence" grab (that
      would misread a date or budget figure as quantity).
   2. INTEGRATION — that extracted quantity flows all the way through
      beginProblemSolving() into the real Conversation's gatheredFacts,
      and is never re-asked in missingFacts.
   3. REAL BROWSER — nor-center.js's Generate tab AND
      sarpras-intelligence-center.js's Home screen (the two documented
      twins) both render the known-facts summary as labeled checkmarks
      ("✓ Barang: Kursi"), never the old raw `field: value` debug list.

   Run: node scripts/adaptive-conversation-check.mjs   (exit 0 = pass) */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

import { parseProblem } from '../js/v2/problem-intelligence/problem-parser.js';
import { setKnowledgeBackend } from '../js/v2/knowledge/services/knowledge-service.js';
import { resetConversationRepository } from '../src/conversation/repository/conversation-repository.js';
import { beginProblemSolving } from '../js/v2/problem-solving/services/problem-solving-service.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0; let fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); }
}

/* ══ Part 1 — pure: quantity extraction is anchored, never a bare number grab ══ */

console.log('\n[Part 1 — parseProblem now extracts quantity, anchored to the matched item keyword]');
{
  const r = parseProblem('Buatkan NOR pembelian 20 kursi ruang pengadaan.');
  check('category is business_trip (the "NOR"+creation-phrase rule still outscores procurement\'s, per Sprint 11.1)', r.category === 'business_trip');
  check('type resolves to Pengadaan', r.extractedFacts.type === 'Pengadaan');
  check('item resolves to Kursi (unchanged, pre-existing behavior)', r.extractedFacts.item === 'Kursi');
  check('quantity resolves to the number 20 (new this sprint)', r.extractedFacts.quantity === 20);
}

console.log('\n[Part 1 — quantity extraction covers the reverse phrasing and the procurement category directly]');
{
  const reverse = parseProblem('Mau beli kursi sebanyak 15 untuk ruang rapat.');
  check('"kursi sebanyak 15" -> quantity 15 (number AFTER the item keyword)', reverse.category === 'procurement' && reverse.extractedFacts.quantity === 15);

  const unitWord = parseProblem('Mau membeli 3 unit laptop untuk divisi IT.');
  check('"3 unit laptop" -> quantity 3 (unit word between number and item)', unitWord.extractedFacts.item === 'Laptop' && unitWord.extractedFacts.quantity === 3);
}

console.log('\n[Part 1 — negative controls: a quantity is NEVER fabricated from an unrelated number]');
{
  const noItem = parseProblem('Mau beli untuk ruang rapat, budget sekitar 20 juta.');
  check('no recognizable item keyword at all -> item AND quantity both stay honestly absent (quantity is never attempted without an anchor)', !noItem.extractedFacts.item && noItem.extractedFacts.quantity === undefined);

  const dateNearItem = parseProblem('Mau beli kursi tanggal 20 Januari untuk ruang rapat.');
  check('a date sitting near the item keyword is NEVER misread as quantity (the exact false-positive risk this design avoids)', dateNearItem.extractedFacts.item === 'Kursi' && dateNearItem.extractedFacts.quantity === undefined);

  const distantNumber = parseProblem('Mau beli kursi untuk acara yang akan berlangsung 20 hari lagi.');
  check('a number far from the item keyword (not immediately adjacent) is never captured', distantNumber.extractedFacts.item === 'Kursi' && distantNumber.extractedFacts.quantity === undefined);
}

/* ══ Part 2 — integration: the extracted quantity is never re-asked ══ */

setKnowledgeBackend('memory');
resetConversationRepository();

console.log('\n[Part 2 — the real Conversation pipeline never asks for a quantity the utterance already gave]');
{
  const result = beginProblemSolving('Buatkan NOR pembelian 20 kursi ruang pengadaan.', 'evan');
  check('beginProblemSolving succeeds', result.ok);
  check('a real Conversation was started (not the generic Problem Conversation fallback)', !!result.data.conversation);
  const c = result.data.conversation;
  check('gatheredFacts.quantity is already 20 — carried in from problem-parser.js\'s own extraction', c && c.gatheredFacts.quantity === 20);
  check('missingFacts does NOT ask for "quantity" again', c && !(c.missingFacts || []).some((q) => q.field === 'quantity'));
  check('missingFacts still honestly asks for the genuinely unknown fields (purpose, budget)',
    c && ['purpose', 'budget'].every((f) => (c.missingFacts || []).some((q) => q.field === f)));
}

resetConversationRepository();

/* ══ Part 3 — real browser: both documented UI twins show the labeled summary ══ */

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

const FATAL_PATTERN = /SyntaxError|ReferenceError|TypeError|is not a function|Failed to (load|fetch) module|Cannot use import|does not provide an export/;
const bootErrors = [];
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
page.on('pageerror', (e) => bootErrors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('Failed to load resource')) bootErrors.push('console.error: ' + m.text()); });

await page.goto(`http://localhost:${port}/scripts/sarpras-workspace-harness.html`, { waitUntil: 'networkidle2', timeout: 45000 });
await page.waitForFunction('window.__ready === true', { timeout: 15000 });
await page.evaluate(() => window.__mount());
await new Promise((r) => { setTimeout(r, 800); });

console.log('\n[Part 3 — NOR Center\'s Generate tab shows a labeled, checkmark known-facts summary]');
{
  const seeded = await page.evaluate(() => window.__seedNorCompositionKnowledge());
  check('real Approved structural+pattern Knowledge seeded for this run', seeded === true);

  await page.evaluate(() => window.__setScreen('nor'));
  await new Promise((r) => { setTimeout(r, 300); });
  await page.evaluate(() => { document.querySelector('[data-act="wlk-tab"][data-id="generate"]')?.click(); });
  await new Promise((r) => { setTimeout(r, 200); });

  await page.evaluate(() => {
    const input = document.getElementById('ncGenerateInput');
    input.value = 'Buatkan NOR pembelian 20 kursi ruang pengadaan.';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.evaluate(() => { document.querySelector('[data-act="nc-generate-submit"]')?.click(); });
  await new Promise((r) => { setTimeout(r, 300); });

  const html = await page.evaluate(() => window.__hostHTML());
  check('shows the "Sudah diketahui" sub-header (new this sprint)', html.includes('Sudah diketahui'));
  check('shows a labeled checkmark for the NOR type ("✓ Jenis NOR: Pengadaan")', html.includes('✓ Jenis NOR: Pengadaan'));
  check('shows a labeled checkmark for the item ("✓ Barang: Kursi")', html.includes('✓ Barang: Kursi'));
  check('shows a labeled checkmark for the quantity ("✓ Jumlah: 20")', html.includes('✓ Jumlah: 20'));
  check('the old raw debug list ("item: Kursi") is GONE from this codebase\'s live output', !html.includes('>item: Kursi<'));
  check('still asks for the genuinely missing field ("Tujuan Penggunaan")', html.includes('Tujuan Penggunaan'));
}

console.log('\n[Part 3 — sarpras-intelligence-center.js\'s Home-screen twin shows the identical summary]');
{
  await page.evaluate(() => window.__setScreen('dashboard'));
  await new Promise((r) => { setTimeout(r, 200); });

  await page.evaluate(() => {
    const input = document.querySelector('[data-act="sic-conv-input"]');
    input.value = 'Buatkan NOR pembelian 20 kursi ruang pengadaan.';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.evaluate(() => { document.querySelector('[data-act="sic-conv-start"]')?.click(); });
  await new Promise((r) => { setTimeout(r, 300); });

  const html = await page.evaluate(() => window.__hostHTML());
  check('shows the "Sudah diketahui" sub-header on the Home screen twin too', html.includes('Sudah diketahui'));
  check('shows a labeled checkmark for the item on the Home screen twin ("✓ Barang: Kursi")', html.includes('✓ Barang: Kursi'));
  check('shows a labeled checkmark for the quantity on the Home screen twin ("✓ Jumlah: 20")', html.includes('✓ Jumlah: 20'));
}

check('no fatal boot/runtime error occurred anywhere in this run', !bootErrors.some((e) => FATAL_PATTERN.test(e)) || (() => { console.log(bootErrors.join('\n')); return false; })());

await browser.close();
server.close();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
