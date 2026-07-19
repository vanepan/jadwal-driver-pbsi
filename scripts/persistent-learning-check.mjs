/* persistent-learning-check.mjs — Phase 11, Sprint 11.9 real-browser
   verification of the WIRING: a reviewer edit made in the mounted app
   becomes a persistent Candidate that the dashboard renders, survives
   re-projection (the refresh mechanism), and promotes to real Knowledge
   through the existing human gate.

   The engine's full logic is unit-covered by reviewer-edit-rehydration-
   check.mjs (Node). This script proves the INTEGRATION: mounting the real
   Sarpras Intelligence shell registers the composer change listener, so a
   real editSection() (the same call onFocusOut makes) fires the projection
   and the persistent Candidate appears in the dashboard's "Menunggu
   Tinjauan" — rendered from persistent organizational memory, not session
   memory.

   NOTE ON DURABILITY: an actual cross-page-reload test needs the RTDB
   backend (the durable source the projection re-derives from), which this
   Firebase-free environment cannot exercise — the same credential-free
   limitation every browser check in this repo documents. What IS proven
   here is the exact mechanism that makes durability work: the Candidate is
   RE-PROJECTED idempotently from the persisted ComposerDocument on every
   composer change / mount, so when RTDB rehydrates the document after a real
   reload, the Candidate returns unchanged.
   Run: node scripts/persistent-learning-check.mjs   (exit 0 = pass) */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

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
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

const errors = [];
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
await page.goto(`http://localhost:${port}/scripts/sarpras-workspace-harness.html`, { waitUntil: 'networkidle2', timeout: 45000 });
await page.waitForFunction('typeof window.__mount === "function" && typeof window.__editComposerSection === "function"', { timeout: 15000 });

const result = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // Mount the real shell — this registers the composer change listener that
  // projects persistent reviewer-edit learning (Sprint 11.9 wiring).
  window.__mount();
  await sleep(400);

  // A real ComposerDocument + a real reusable wording edit (opening phrase
  // preference), through the real composer-store — the SAME putRecord ->
  // notifyChange path a live inline edit takes.
  const docId = window.__createComposerDoc({ openingLine: 'Pengajuan Pembelian sarana kantor' });
  const edited = window.__editComposerSection(docId, 'openingLine', 'Permohonan Pembelian sarana kantor');
  await sleep(200); // let the change listener's projection run

  const expectedId = `nor:correction:reviewer-edit:${docId}:openingLine`;
  const queueAfterEdit = window.__candidateQueueIds();
  const itemAfterEdit = window.__knowledgeItem(expectedId);

  // Navigate to the Learning Dashboard -> Antrean so "Menunggu Tinjauan"
  // (persistent memory) renders, and confirm the candidate is shown there.
  window.__setScreen('learning');
  await sleep(300);
  const host = document.getElementById('host');
  host.querySelector('.wlk-tab[data-id="queues"]')?.click();
  await sleep(200);
  const dashboardShowsQueue = /Menunggu Tinjauan \((\d+)\)/.test(host.textContent);
  const queueCountShown = (host.textContent.match(/Menunggu Tinjauan \((\d+)\)/) || [])[1];

  // Simulate a hydration/refresh event: re-project from the persisted
  // document. Must be idempotent (no duplicate, no churn) and the candidate
  // must still be present — the mechanism behind "survives refresh".
  const reproj1 = window.__rehydrateLearning();
  const reproj2 = window.__rehydrateLearning();
  const queueAfterReproject = window.__candidateQueueIds();
  const itemAfterReproject = window.__knowledgeItem(expectedId);

  // Human gate: approve it through the existing governed pipeline.
  const approved = window.__approveKnowledge(expectedId);
  const itemAfterApprove = window.__knowledgeItem(expectedId);
  // A further re-projection must NOT overwrite the approved record.
  window.__rehydrateLearning();
  const itemAfterApproveReproject = window.__knowledgeItem(expectedId);

  return {
    edited,
    expectedId,
    candidateCreated: queueAfterEdit.includes(expectedId),
    itemAfterEdit,
    dashboardShowsQueue,
    queueCountShown,
    reprojCreatedZero: reproj1.created === 0 && reproj2.created === 0,
    stillPresentAfterReproject: queueAfterReproject.includes(expectedId),
    itemUnchangedAfterReproject: itemAfterReproject && itemAfterReproject.value === 'Permohonan Pembelian sarana kantor',
    approved,
    itemAfterApprove,
    approvedNotOverwritten: itemAfterApproveReproject && itemAfterApproveReproject.state === 'approved' && itemAfterApproveReproject.value === 'Permohonan Pembelian sarana kantor',
  };
});

console.log('\n[Sprint 11.9 — reviewer edit becomes persistent Candidate learning, wired end-to-end in the mounted app]');
check('the reviewer edit committed through the real composer-store', result.edited === true);
check('the composer change listener projected a persistent Candidate (no manual call)', result.candidateCreated === true);
check('the Candidate is a writing_style CANDIDATE preserving the original AI output', result.itemAfterEdit
  && result.itemAfterEdit.kind === 'writing_style' && result.itemAfterEdit.state === 'candidate'
  && result.itemAfterEdit.originalAiOutput === 'Pengajuan Pembelian sarana kantor');
check('the Learning Dashboard renders it in "Menunggu Tinjauan" (persistent organizational memory)', result.dashboardShowsQueue && Number(result.queueCountShown) >= 1);
check('re-projection (the refresh mechanism) creates NOTHING new — idempotent', result.reprojCreatedZero === true);
check('the Candidate is still present after re-projection (survives the hydration cycle)', result.stillPresentAfterReproject === true);
check('re-projection did not churn the Candidate\'s value', result.itemUnchangedAfterReproject === true);
check('the Candidate promotes to Approved through the existing human-gated pipeline', result.approved === true && result.itemAfterApprove.state === 'approved');
check('a later re-projection NEVER overwrites the Approved organizational record', result.approvedNotOverwritten === true);

const fatal = errors.filter((e) => /SyntaxError|ReferenceError|TypeError|is not a function|Failed to (load|fetch) module|Cannot use import|Unexpected token|does not provide an export/i.test(e));
check('zero fatal module/render errors across the flow', fatal.length === 0);
if (fatal.length) fatal.forEach((e) => console.log('   ✗', e));

await page.close();
await browser.close();
server.close();

console.log(`\n${pass}/${pass + fail} checks passed.`);
process.exit(fail > 0 ? 1 : 0);
