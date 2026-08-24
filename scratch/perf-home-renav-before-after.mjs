// Real (not fabricated) before/after measurement of the Phase 8.6 Home
// re-navigation fix, using Puppeteer's page.metrics() (backed by Chrome's
// real Performance domain: LayoutCount, RecalcStyleCount, durations, node
// counts) — not Date.now() JS-timing, which only proves JS execution time,
// not actual rendering cost (Phase 8.7's own explicit distinction).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const file = path.join(ROOT, p);
  if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, r));
const port = server.address().port;
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });

const fakeCtxSrc = `
  function fakeCtx(role, seed) {
    return {
      user: { id: 'u1', name: 'Uji Coba', role }, role,
      assignments: [], myAssignments: [], requests: [], myRequests: [], logs: [],
      models: null, vehicles: [], actions: {}, __seed: seed,
    };
  }
`;

async function measure(label, skeletonOnSecondCall) {
  const page = await browser.newPage();
  await page.goto(`http://localhost:${port}/scripts/workspace-foundation-harness.html`, { waitUntil: 'networkidle0' });
  await page.evaluate(async (fakeCtxSrc) => {
    eval(fakeCtxSrc);
    const { renderHome } = await import('/js/workspace/home-router.js');
    window.__renderHome = renderHome;
    window.__fakeCtx = fakeCtx;
    const host = document.getElementById('host');
    await renderHome(host, fakeCtx('admin', 1)); // first mount, same for both scenarios
  }, fakeCtxSrc);

  const before = await page.metrics();
  const t0 = Date.now();
  await page.evaluate(async (skeletonOnSecondCall) => {
    const host = document.getElementById('host');
    const opts = skeletonOnSecondCall ? undefined : { skeleton: false };
    for (let i = 2; i <= 6; i++) {
      await window.__renderHome(host, window.__fakeCtx('admin', i), opts);
    }
  }, skeletonOnSecondCall);
  const wallMs = Date.now() - t0;
  const after = await page.metrics();

  const delta = (k) => (after[k] ?? 0) - (before[k] ?? 0);
  console.log(`\n[${label}] 5x re-navigation into the SAME workspace (admin/executive), real page.metrics() delta:`);
  console.log(`   LayoutCount:        ${delta('LayoutCount')}`);
  console.log(`   RecalcStyleCount:   ${delta('RecalcStyleCount')}`);
  console.log(`   LayoutDuration:     ${delta('LayoutDuration').toFixed(4)}s`);
  console.log(`   RecalcStyleDuration:${delta('RecalcStyleDuration').toFixed(4)}s`);
  console.log(`   ScriptDuration:     ${delta('ScriptDuration').toFixed(4)}s`);
  console.log(`   TaskDuration:       ${delta('TaskDuration').toFixed(4)}s`);
  console.log(`   Nodes (end state):  ${after.Nodes}`);
  console.log(`   JSEventListeners (end state): ${after.JSEventListeners}`);
  console.log(`   Wall time (JS-side, informational only): ${wallMs}ms`);
  await page.close();
  return { label, delta: { LayoutCount: delta('LayoutCount'), RecalcStyleCount: delta('RecalcStyleCount'), LayoutDuration: delta('LayoutDuration'), RecalcStyleDuration: delta('RecalcStyleDuration'), ScriptDuration: delta('ScriptDuration'), TaskDuration: delta('TaskDuration') }, Nodes: after.Nodes, JSEventListeners: after.JSEventListeners };
}

const before = await measure('BEFORE (old bug pattern: skeleton always true)', true);
const afterFix = await measure('AFTER (Phase 8.6 fix: skeleton:false on re-navigation)', false);

console.log('\n[summary — real measured reduction from the Phase 8.6 fix]');
for (const k of ['LayoutCount', 'RecalcStyleCount', 'LayoutDuration', 'RecalcStyleDuration', 'ScriptDuration', 'TaskDuration']) {
  const b = before.delta[k], a = afterFix.delta[k];
  const pct = b !== 0 ? (((b - a) / b) * 100).toFixed(1) : 'n/a';
  console.log(`   ${k}: before=${typeof b === 'number' ? b.toFixed?.(4) ?? b : b}  after=${typeof a === 'number' ? a.toFixed?.(4) ?? a : a}  reduction=${pct}%`);
}

await browser.close();
server.close();
