/* sarpras-workspace-dom-check.mjs — DOM integration test for the four
   Sarpras Intelligence workspaces added in V2.0.18 (Dashboard was already
   real; NOR Center, Archive Center, Knowledge Center, Learning Dashboard).
   Run: node scripts/sarpras-workspace-dom-check.mjs   (exit 0 = pass)

   Mirrors organizational-memory-dom-check.mjs's pattern exactly: a local
   static server + puppeteer, asserting zero fatal boot errors and that
   mounting/switching screens never throws — this is the only way to catch
   a broken dynamic import() or a runtime TypeError in these presentation
   files (they were only syntax/import-checked under bare Node before this). */
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
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

const FATAL_PATTERN = /SyntaxError|ReferenceError|TypeError|is not a function|Failed to (load|fetch) module|Cannot use import|does not provide an export/;

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
console.log('\n[Sarpras Intelligence — V2.0.18 workspace completion, browser]');
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

const dashboardHtml = await page.evaluate(() => window.__hostHTML());
// Sprint 0 (Presentation Truth) — the Dashboard is now an Executive
// Briefing by default (Normal Mode); the old static roadmap only renders
// under Developer Mode (see below), never unconditionally again.
check('Dashboard renders the Executive Briefing (Normal Mode default)', dashboardHtml.includes('sic-brief-list') && !dashboardHtml.includes('sic-roadmap'));

for (const screenId of ['nor', 'archive', 'knowledge', 'learning']) {
  bootErrors.length = 0;
  await page.evaluate((id) => window.__setScreen(id), screenId);
  // dynamic import() is async; give the module a tick to resolve and mount.
  await new Promise((r) => setTimeout(r, 300));
  const html = await page.evaluate(() => window.__hostHTML());
  const text = await page.evaluate(() => window.__hostText());
  check(`"${screenId}" screen mounts with zero fatal errors`, !bootErrors.some((e) => FATAL_PATTERN.test(e)));
  check(`"${screenId}" screen renders non-empty content`, html.length > 200);
  check(`"${screenId}" screen contains no literal "Coming Soon" text`, !text.includes('Coming Soon') && !text.includes('segera hadir'));

  // Click through every internal tab this nested workspace exposes (its
  // own .nc-tab / .wlk-tab bar) — this is the only way to exercise render
  // paths beyond each workspace's default first tab.
  const tabIds = await page.evaluate(() => [...document.querySelectorAll('#host .nc-tab, #host .wlk-tab')].map((b) => b.dataset.id));
  for (const tabId of tabIds) {
    bootErrors.length = 0;
    await page.evaluate((id) => {
      const btn = [...document.querySelectorAll('#host .nc-tab, #host .wlk-tab')].find((b) => b.dataset.id === id);
      if (btn) btn.click();
    }, tabId);
    check(`"${screenId}" -> "${tabId}" tab renders with zero fatal errors`, !bootErrors.some((e) => FATAL_PATTERN.test(e)));
  }
}

console.log('\n[Phase 2 — Unified Import Workspace, Utilities menu, dropzone drag state]');
bootErrors.length = 0;
await page.evaluate((id) => window.__setScreen(id), 'archive');
await new Promise((r) => setTimeout(r, 300));
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('#host .wlk-tab')].find((b) => b.dataset.id === 'import');
  if (btn) btn.click();
});
await new Promise((r) => setTimeout(r, 200));
let importHtml = await page.evaluate(() => window.__hostHTML());
check('Dataset Import Center defaults to the unified workspace (Upload + Needs Attention visible, no forced tab click)', importHtml.includes('dic-dropzone') && importHtml.includes('Perlu Perhatian'));
check('the unified workspace mounts with zero fatal errors', !bootErrors.some((e) => FATAL_PATTERN.test(e)));

await page.evaluate(() => {
  const btn = document.querySelector('#host [data-act="dic-utilities-toggle"]');
  if (btn) btn.click();
});
await new Promise((r) => setTimeout(r, 100));
importHtml = await page.evaluate(() => window.__hostHTML());
check('Utilities menu opens and reveals Dataset Browser / Laporan Impor / Riwayat Batch (moved out of the main tab bar, not deleted)', importHtml.includes('Dataset Browser') && importHtml.includes('Laporan Impor') && importHtml.includes('Riwayat Batch'));

const dragActiveAfterEnter = await page.evaluate(() => {
  const zone = document.querySelector('#host [data-act="dic-dropzone"]');
  if (!zone) return null;
  zone.dispatchEvent(new Event('dragenter', { bubbles: true }));
  return zone.classList.contains('dic-dropzone--active');
});
check('dragenter adds the dropzone active-drag visual state', dragActiveAfterEnter === true);
const dragActiveAfterLeave = await page.evaluate(() => {
  const zone = document.querySelector('#host [data-act="dic-dropzone"]');
  zone.dispatchEvent(new Event('dragleave', { bubbles: true }));
  return zone.classList.contains('dic-dropzone--active');
});
check('dragleave removes the dropzone active-drag visual state', dragActiveAfterLeave === false);
check('no fatal errors during Utilities/drag interaction', !bootErrors.some((e) => FATAL_PATTERN.test(e)));

// Sprint 0 (Presentation Truth) — ONE shared Normal/Developer toggle now
// lives in the outer shell (sarpras-intelligence-center.js's mode bar),
// not a per-workspace "dic-mode" button; every workspace (Dataset Import
// Center included) reads the SAME platform-wide flag.
bootErrors.length = 0;
const modeToggleExists = await page.evaluate(() => !!document.querySelector('#host [data-act="sic-mode"]'));
check('the ONE shared Normal/Developer mode toggle is present in the outer shell', modeToggleExists === true);
const devActivated = await page.evaluate(() => {
  const btn = [...document.querySelectorAll('#host [data-act="sic-mode"]')].find((b) => b.dataset.id === 'developer');
  if (!btn) return null;
  btn.click();
  const active = document.querySelector('#host [data-act="sic-mode"][data-id="developer"]');
  return active && active.classList.contains('sic-mode-btn--active');
});
check('clicking Developer marks it active (mode switch handled, no fatal error)', devActivated === true && !bootErrors.some((e) => FATAL_PATTERN.test(e)));
const persisted = await page.evaluate(() => { try { return localStorage.getItem('sarpras.presentationMode'); } catch { return null; } });
check('the chosen presentation mode is persisted to localStorage', persisted === 'developer');
// Sprint 1 (Autonomy Closure, Part 1) — the old static roadmap is REMOVED
// entirely (it was itself a second, duplicated dashboard identity).
// Developer Mode's additive content is now real technical diagnostics.
await page.evaluate((id) => window.__setScreen(id), 'dashboard');
await new Promise((r) => setTimeout(r, 100));
const devDashboardHtml = await page.evaluate(() => window.__hostHTML());
check('Developer Mode reveals real Technical Diagnostics, not a duplicated roadmap', devDashboardHtml.includes('Diagnostik Teknis') && !devDashboardHtml.includes('sic-roadmap'));
check('the Executive Briefing itself is still present in Developer Mode (one identity, additive)', devDashboardHtml.includes('sic-brief-list'));
// Reset back to normal so the preference does not leak into other checks.
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('#host [data-act="sic-mode"]')].find((b) => b.dataset.id === 'normal');
  if (btn) btn.click();
});

// Phase 2.5 Part 3+7 — event-driven synchronization: creating a Draft
// KnowledgeItem fires ONE Repository Event, and the mounted Knowledge
// Center re-renders (coalesced) without any manual refresh or tab-switch.
console.log('\n[Phase 2.5 — Knowledge Center re-renders live on a knowledge event]');
bootErrors.length = 0;
await page.evaluate((id) => window.__setScreen(id), 'knowledge');
await new Promise((r) => setTimeout(r, 300));
const seededOk = await page.evaluate(() => window.__createKnowledgeItem('dom-sync-1'));
check('a Draft KnowledgeItem was created through the facade', seededOk === true);
// Wait past the 100ms coalescing window, WITHOUT switching tabs or re-mounting.
await new Promise((r) => setTimeout(r, 250));
const knowledgeText = await page.evaluate(() => window.__hostText());
check('Knowledge Center reflects the new Draft item live (event-driven re-render, no manual refresh)', /Draft/i.test(knowledgeText) && knowledgeText.length > 200);
check('the knowledge event propagation caused no fatal error', !bootErrors.some((e) => FATAL_PATTERN.test(e)));
const secondSeed = await page.evaluate(() => window.__createKnowledgeItem('dom-sync-1'));
check('re-creating the same deterministic-id item is idempotent (no duplicate created)', secondSeed === false);

// Sprint 1 (Autonomy Closure, Part 3/10) — the Executive Briefing
// previously had ZERO live listeners; a change made anywhere in the
// platform never reflected here without navigating away and back.
// registerRepositoryListener (Knowledge) is the one event source in this
// codebase already confirmed to fire on a LOCAL write (not just remote
// RTDB snapshots — see the Knowledge Center test right above, which
// exercises the exact same mechanism), so it's the one usable here
// without a real second browser tab / RTDB round-trip. The
// registerImportSessionChangeListener/registerImportBatchChangeListener
// wiring this sprint ALSO adds to the Dashboard, and the widened
// Archive/NOR Center gates, are deliberately remote-snapshot-only by
// existing architecture (import-session-repository.js's own header) —
// verified structurally instead, in sarpras-workspace-completion-check.mjs.
console.log('\n[Sprint 1 (Autonomy Closure) Part 3/10 — Dashboard updates live, no navigation]');
bootErrors.length = 0;
await page.evaluate((id) => window.__setScreen(id), 'dashboard');
await new Promise((r) => setTimeout(r, 150));
const dashboardBefore = await page.evaluate(() => window.__hostText());
const dashboardSeeded = await page.evaluate(() => window.__createKnowledgeItem('sprint1-dashboard-live'));
check('a Draft KnowledgeItem was created for the dashboard live-update check', dashboardSeeded === true);
// Wait past the 100ms coalescing window, WITHOUT navigating away and back.
await new Promise((r) => setTimeout(r, 300));
const dashboardAfter = await page.evaluate(() => window.__hostText());
check('Dashboard reflects the new Knowledge Item live (event-driven re-render, no manual refresh)', dashboardBefore !== dashboardAfter);
check('no fatal errors during the live dashboard update', !bootErrors.some((e) => FATAL_PATTERN.test(e)));

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
