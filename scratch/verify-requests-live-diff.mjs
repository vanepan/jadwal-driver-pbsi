// Phase 8.3 — Requests live-update diffing. Real browser check against the
// real js/requests.js (unmodified import, no Firebase/auth network calls —
// see the harness header comment). Same static-server + Puppeteer pattern as
// scratch/verify-command-palette-motion.mjs (Phase 8.1).
import puppeteer from 'puppeteer';
import http from 'http';
import { readFileSync } from 'fs';
import path from 'path';

const ROOT = process.cwd();
const server = http.createServer((req, res) => {
  if (req.url === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  const p = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(ROOT, p);
  try {
    const body = readFileSync(file);
    const ext = path.extname(file);
    const type = { '.css': 'text/css', '.html': 'text/html', '.js': 'application/javascript' }[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    res.end(body);
  } catch (e) {
    res.writeHead(404); res.end('not found');
  }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

let pass = 0, fail = 0;
function check(label, cond, extra = '') {
  if (cond) { pass++; console.log(`OK   ${label}${extra ? ' ' + extra : ''}`); }
  else { fail++; console.log(`FAIL ${label}${extra ? ' ' + extra : ''}`); }
}

function durationSeconds(cssDurationStr) {
  return parseFloat(cssDurationStr);
}

function req(id, overrides = {}) {
  return {
    id, status: 'pending', requesterId: 'u1', requesterName: 'Bidang A',
    startDate: '2026-08-21', endDate: '2026-08-21', startTime: '08:00', endTime: '10:00',
    fullDay: false, purpose: `Keperluan ${id}`, notes: '', pax: 2,
    driver: '', vehicle: '', recommendedDriver: '', recommendedVehicle: '', dispatchScore: 0,
    comments: [], createdAt: '2026-08-21T00:00:00.000Z', updatedAt: '2026-08-21T00:00:00.000Z',
    ...overrides,
  };
}

const browser = await puppeteer.launch({ headless: 'new' });

async function freshPage() {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  await page.setViewport({ width: 1024, height: 800 });
  await page.goto(`http://localhost:${port}/scratch/requests-live-diff-harness.html`, { waitUntil: 'load' });
  await page.waitForFunction('window.__requestsHarnessReady === true');
  return { page, errors };
}

// ── Tag every currently-rendered card with a stable marker so later
// evaluate() calls (same page/JS realm, not reloaded) can prove DOM-node
// identity survived a re-render — this is the plan's §26 core requirement. ──
async function tagCards(page) {
  await page.evaluate(() => {
    document.querySelectorAll('.request-card').forEach((el, i) => {
      if (!el.__testTag) el.__testTag = `tag-${Math.random().toString(36).slice(2)}`;
    });
  });
}

async function cardTags(page) {
  return page.evaluate(() => {
    const out = {};
    document.querySelectorAll('.request-card').forEach((el) => {
      out[el.dataset.requestId] = el.__testTag || null;
    });
    return out;
  });
}

async function cardOrder(page) {
  return page.evaluate(() => [...document.querySelectorAll('.request-card')].map((el) => el.dataset.requestId));
}

// ── 1. Initial render (bulk populate) — no entrance animation on any card ──
{
  const { page, errors } = await freshPage();
  await page.evaluate((requests) => window.__requestsTestApi.setRequests(requests), [req('r1'), req('r2'), req('r3')]);
  await page.evaluate(() => window.__requestsTestApi.renderRequestsList());
  const info = await page.evaluate(() => ({
    count: document.querySelectorAll('.request-card').length,
    enterCount: document.querySelectorAll('.request-card--enter').length,
    order: [...document.querySelectorAll('.request-card')].map((el) => el.dataset.requestId),
  }));
  check('initial render: 3 cards', info.count === 3, `(got ${info.count})`);
  check('initial render: order matches input', JSON.stringify(info.order) === JSON.stringify(['r1', 'r2', 'r3']));
  check('initial render: no entrance animation on bulk populate', info.enterCount === 0, `(got ${info.enterCount})`);
  check('no console errors', errors.length === 0, errors.join('; '));
}

// ── 2. Idempotent re-render — same data twice → zero node identity changes ──
{
  const { page, errors } = await freshPage();
  await page.evaluate((requests) => window.__requestsTestApi.setRequests(requests), [req('r1'), req('r2'), req('r3')]);
  await page.evaluate(() => window.__requestsTestApi.renderRequestsList());
  await tagCards(page);
  const before = await cardTags(page);

  await page.evaluate((requests) => window.__requestsTestApi.setRequests(requests), [req('r1'), req('r2'), req('r3')]);
  await page.evaluate(() => window.__requestsTestApi.renderRequestsList());
  const after = await cardTags(page);

  check('idempotent re-render: r1 identity preserved', before.r1 === after.r1 && before.r1 !== null);
  check('idempotent re-render: r2 identity preserved', before.r2 === after.r2 && before.r2 !== null);
  check('idempotent re-render: r3 identity preserved', before.r3 === after.r3 && before.r3 !== null);
  check('no console errors', errors.length === 0, errors.join('; '));
}

// ── 3. child_changed: one request's content changes; siblings untouched ──
{
  const { page, errors } = await freshPage();
  await page.evaluate((requests) => window.__requestsTestApi.setRequests(requests), [req('r1'), req('r2'), req('r3')]);
  await page.evaluate(() => window.__requestsTestApi.renderRequestsList());
  await tagCards(page);
  const before = await cardTags(page);

  await page.evaluate((requests) => window.__requestsTestApi.setRequests(requests), [req('r1'), req('r2', { purpose: 'Keperluan BERUBAH', notes: 'catatan baru' }), req('r3')]);
  await page.evaluate(() => window.__requestsTestApi.renderRequestsList());
  const after = await cardTags(page);
  const r2Text = await page.evaluate(() => document.querySelector('[data-request-id="r2"] .request-title')?.textContent);

  check('child_changed: r2 outer node identity preserved (same node, content swapped)', before.r2 === after.r2 && before.r2 !== null);
  check('child_changed: r2 content actually updated', r2Text === 'Keperluan BERUBAH', `(got "${r2Text}")`);
  check('child_changed: r1 sibling untouched', before.r1 === after.r1);
  check('child_changed: r3 sibling untouched', before.r3 === after.r3);
  check('no console errors', errors.length === 0, errors.join('; '));
}

// ── 4. child_added: new card appears with entrance motion, others untouched ──
{
  const { page, errors } = await freshPage();
  await page.evaluate((requests) => window.__requestsTestApi.setRequests(requests), [req('r1'), req('r2')]);
  await page.evaluate(() => window.__requestsTestApi.renderRequestsList());
  await tagCards(page);
  const before = await cardTags(page);

  await page.evaluate((requests) => window.__requestsTestApi.setRequests(requests), [req('r1'), req('r2'), req('r3')]);
  await page.evaluate(() => window.__requestsTestApi.renderRequestsList());
  const info = await page.evaluate(() => ({
    count: document.querySelectorAll('.request-card').length,
    r3HasEnter: document.querySelector('[data-request-id="r3"]')?.classList.contains('request-card--enter'),
    r1HasEnter: document.querySelector('[data-request-id="r1"]')?.classList.contains('request-card--enter'),
  }));
  const after = await cardTags(page);

  check('child_added: card count now 3', info.count === 3, `(got ${info.count})`);
  check('child_added: new card gets entrance motion', info.r3HasEnter === true);
  check('child_added: unaffected sibling gets no entrance motion', info.r1HasEnter === false);
  check('child_added: r1 identity preserved', before.r1 === after.r1);
  check('child_added: r2 identity preserved', before.r2 === after.r2);
  check('no console errors', errors.length === 0, errors.join('; '));
}

// ── 5. child_removed: card disappears, siblings untouched, no orphaned nodes ──
{
  const { page, errors } = await freshPage();
  await page.evaluate((requests) => window.__requestsTestApi.setRequests(requests), [req('r1'), req('r2'), req('r3')]);
  await page.evaluate(() => window.__requestsTestApi.renderRequestsList());
  await tagCards(page);
  const before = await cardTags(page);

  await page.evaluate((requests) => window.__requestsTestApi.setRequests(requests), [req('r1'), req('r3')]);
  await page.evaluate(() => window.__requestsTestApi.renderRequestsList());
  const info = await page.evaluate(() => ({
    count: document.querySelectorAll('.request-card').length,
    r2Present: !!document.querySelector('[data-request-id="r2"]'),
  }));
  const after = await cardTags(page);

  check('child_removed: card count now 2', info.count === 2, `(got ${info.count})`);
  check('child_removed: removed card gone from DOM', info.r2Present === false);
  check('child_removed: r1 sibling untouched', before.r1 === after.r1);
  check('child_removed: r3 sibling untouched', before.r3 === after.r3);
  check('no console errors', errors.length === 0, errors.join('; '));
}

// ── 6. Reordering: incoming array order changes → DOM order follows, nodes moved not recreated ──
{
  const { page, errors } = await freshPage();
  await page.evaluate((requests) => window.__requestsTestApi.setRequests(requests), [req('r1'), req('r2'), req('r3')]);
  await page.evaluate(() => window.__requestsTestApi.renderRequestsList());
  await tagCards(page);
  const before = await cardTags(page);

  await page.evaluate((requests) => window.__requestsTestApi.setRequests(requests), [req('r3'), req('r1'), req('r2')]);
  await page.evaluate(() => window.__requestsTestApi.renderRequestsList());
  const order = await cardOrder(page);
  const after = await cardTags(page);

  check('reorder: DOM order follows incoming array order', JSON.stringify(order) === JSON.stringify(['r3', 'r1', 'r2']), `(got ${JSON.stringify(order)})`);
  check('reorder: r1 node moved, not recreated', before.r1 === after.r1);
  check('reorder: r2 node moved, not recreated', before.r2 === after.r2);
  check('reorder: r3 node moved, not recreated', before.r3 === after.r3);
  check('no console errors', errors.length === 0, errors.join('; '));
}

// ── 7. Rapid updates in immediate succession converge correctly ──
{
  const { page, errors } = await freshPage();
  await page.evaluate((requests) => window.__requestsTestApi.setRequests(requests), [req('r1')]);
  await page.evaluate(() => window.__requestsTestApi.renderRequestsList());

  await page.evaluate(() => {
    const api = window.__requestsTestApi;
    api.setRequests([req0('r1'), req0('r2')]);
    function req0(id) { return { id, status: 'pending', requesterId: 'u1', requesterName: 'Bidang A', startDate: '2026-08-21', endDate: '2026-08-21', startTime: '08:00', endTime: '10:00', fullDay: false, purpose: `P ${id}`, notes: '', pax: 1, comments: [], createdAt: '2026-08-21T00:00:00.000Z', updatedAt: '2026-08-21T00:00:00.000Z' }; }
    api.renderRequestsList();
    api.setRequests([req0('r1'), req0('r2'), req0('r3')]);
    api.renderRequestsList();
    api.setRequests([req0('r2'), req0('r3')]); // r1 removed mid-burst
    api.renderRequestsList();
    api.setRequests([req0('r2'), req0('r3'), req0('r4')]);
    api.renderRequestsList();
  });
  const info = await page.evaluate(() => ({
    order: [...document.querySelectorAll('.request-card')].map((el) => el.dataset.requestId),
    r1Present: !!document.querySelector('[data-request-id="r1"]'),
  }));
  check('rapid updates: final order correct after burst', JSON.stringify(info.order) === JSON.stringify(['r2', 'r3', 'r4']), `(got ${JSON.stringify(info.order)})`);
  check('rapid updates: mid-burst-removed card stays gone', info.r1Present === false);
  check('no console errors', errors.length === 0, errors.join('; '));
}

// ── 8. Listener dedup: many redundant re-renders never double-bind a click handler ──
{
  const { page, errors } = await freshPage();
  await page.evaluate((requests) => window.__requestsTestApi.setRequests(requests), [req('r1')]);
  for (let i = 0; i < 5; i++) {
    await page.evaluate((requests) => window.__requestsTestApi.setRequests(requests), [req('r1')]);
    await page.evaluate(() => window.__requestsTestApi.renderRequestsList());
  }
  await page.click('[data-request-id="r1"] [data-request-action="approve-direct"]');
  const counts = await page.evaluate(() => window.__requestsTestApi.getCounts());
  check('listener dedup: approve fires exactly once after 5 redundant renders', counts.approveCount === 1, `(got ${counts.approveCount})`);
  check('no console errors', errors.length === 0, errors.join('; '));
}

// ── 9. Focus continuity: focus survives an in-place content update of the same card ──
{
  const { page, errors } = await freshPage();
  await page.evaluate((requests) => window.__requestsTestApi.setRequests(requests), [req('r1'), req('r2')]);
  await page.evaluate(() => window.__requestsTestApi.renderRequestsList());
  await page.focus('[data-request-id="r1"] [data-request-action="approve-direct"]');

  await page.evaluate((requests) => window.__requestsTestApi.setRequests(requests), [req('r1', { notes: 'edited while focused' }), req('r2')]);
  await page.evaluate(() => window.__requestsTestApi.renderRequestsList());

  const focusInfo = await page.evaluate(() => ({
    activeAction: document.activeElement?.dataset?.requestAction,
    activeRequestId: document.activeElement?.closest('.request-card')?.dataset?.requestId,
  }));
  check('focus continuity: focus restored to the same action on the same card', focusInfo.activeAction === 'approve-direct' && focusInfo.activeRequestId === 'r1', JSON.stringify(focusInfo));
  check('no console errors', errors.length === 0, errors.join('; '));
}

// ── 10. Scroll continuity: updating an off-screen card doesn't move scroll position ──
{
  const { page, errors } = await freshPage();
  const many = Array.from({ length: 30 }, (_, i) => req(`r${i}`));
  await page.evaluate((requests) => window.__requestsTestApi.setRequests(requests), many);
  await page.evaluate(() => window.__requestsTestApi.renderRequestsList());
  await page.evaluate(() => { document.getElementById('requestsListContent').scrollTop = 300; });
  const scrollBefore = await page.evaluate(() => document.getElementById('requestsListContent').scrollTop);

  const changed = many.map((r, i) => i === 25 ? req('r25', { purpose: 'CHANGED off-screen' }) : r);
  await page.evaluate((requests) => window.__requestsTestApi.setRequests(requests), changed);
  await page.evaluate(() => window.__requestsTestApi.renderRequestsList());
  const scrollAfter = await page.evaluate(() => document.getElementById('requestsListContent').scrollTop);

  check('scroll continuity: unrelated update does not reset scroll position', scrollBefore > 0 && scrollBefore === scrollAfter, `(before ${scrollBefore}, after ${scrollAfter})`);
  check('no console errors', errors.length === 0, errors.join('; '));
}

// ── 11. Empty states: 1→0 and 0→1, no duplicate empty-state markup ──
{
  const { page, errors } = await freshPage();
  await page.evaluate((requests) => window.__requestsTestApi.setRequests(requests), [req('r1')]);
  await page.evaluate(() => window.__requestsTestApi.renderRequestsList());

  await page.evaluate(() => window.__requestsTestApi.setRequests([]));
  await page.evaluate(() => window.__requestsTestApi.renderRequestsList());
  const emptyInfo = await page.evaluate(() => ({
    emptyCount: document.querySelectorAll('.empty-request-state').length,
    cardCount: document.querySelectorAll('.request-card').length,
  }));
  check('empty state: 1→0 shows exactly one empty message', emptyInfo.emptyCount === 1 && emptyInfo.cardCount === 0, JSON.stringify(emptyInfo));

  // Idempotent repeat call while already empty — no duplicate empty divs.
  await page.evaluate(() => window.__requestsTestApi.renderRequestsList());
  const emptyRepeat = await page.evaluate(() => document.querySelectorAll('.empty-request-state').length);
  check('empty state: repeat call while empty stays at exactly one message', emptyRepeat === 1, `(got ${emptyRepeat})`);

  await page.evaluate((requests) => window.__requestsTestApi.setRequests(requests), [req('r1'), req('r2')]);
  await page.evaluate(() => window.__requestsTestApi.renderRequestsList());
  const refillInfo = await page.evaluate(() => ({
    emptyCount: document.querySelectorAll('.empty-request-state').length,
    cardCount: document.querySelectorAll('.request-card').length,
  }));
  check('empty state: 0→1 clears the empty message and shows cards', refillInfo.emptyCount === 0 && refillInfo.cardCount === 2, JSON.stringify(refillInfo));
  check('no console errors', errors.length === 0, errors.join('; '));
}

// ── 12. Reduced motion / [data-anim="off"] collapse the entrance animation ──
{
  const { page, errors } = await freshPage();
  await page.evaluate(() => { document.documentElement.setAttribute('data-anim', 'off'); });
  await page.evaluate((requests) => window.__requestsTestApi.setRequests(requests), [req('r1')]);
  await page.evaluate(() => window.__requestsTestApi.renderRequestsList());
  await page.evaluate((requests) => window.__requestsTestApi.setRequests(requests), [req('r1'), req('r2')]);
  await page.evaluate(() => window.__requestsTestApi.renderRequestsList());
  const dur = await page.evaluate(() => getComputedStyle(document.querySelector('[data-request-id="r2"]')).animationDuration);
  check('[data-anim="off"] collapses the new-card entrance animation', durationSeconds(dur) <= 0.001, `(got ${dur})`);
  check('no console errors', errors.length === 0, errors.join('; '));
}
{
  const page2 = await browser.newPage();
  await page2.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  const errors = [];
  page2.on('pageerror', (e) => errors.push(String(e)));
  await page2.goto(`http://localhost:${port}/scratch/requests-live-diff-harness.html`, { waitUntil: 'load' });
  await page2.waitForFunction('window.__requestsHarnessReady === true');
  await page2.evaluate((requests) => window.__requestsTestApi.setRequests(requests), [req('r1')]);
  await page2.evaluate(() => window.__requestsTestApi.renderRequestsList());
  await page2.evaluate((requests) => window.__requestsTestApi.setRequests(requests), [req('r1'), req('r2')]);
  await page2.evaluate(() => window.__requestsTestApi.renderRequestsList());
  const dur = await page2.evaluate(() => getComputedStyle(document.querySelector('[data-request-id="r2"]')).animationDuration);
  check('prefers-reduced-motion collapses the new-card entrance animation', durationSeconds(dur) <= 0.001, `(got ${dur})`);
  check('no console errors (reduced motion page)', errors.length === 0, errors.join('; '));
}

// ── 13. Notification deep-link highlight (existing behavior, must not regress) ──
{
  const { page, errors } = await freshPage();
  await page.evaluate((requests) => window.__requestsTestApi.setRequests(requests), [req('r1'), req('r2'), req('r3')]);
  await page.evaluate((id) => window.__requestsTestApi.openRequestsListModal(id), 'r2');
  const highlighted = await page.evaluate(() => document.querySelector('[data-request-id="r2"]').classList.contains('request-card--highlight'));
  check('deep-link highlight: target card gets the highlight class on open', highlighted === true);
  check('no console errors', errors.length === 0, errors.join('; '));
}

// ── 14. Hostile review: same card changed 3x in immediate succession ──
{
  const { page, errors } = await freshPage();
  await page.evaluate((requests) => window.__requestsTestApi.setRequests(requests), [req('r1'), req('r2')]);
  await page.evaluate(() => window.__requestsTestApi.renderRequestsList());
  await tagCards(page);
  const before = await cardTags(page);

  await page.evaluate((rs) => { rs.forEach((r) => { window.__requestsTestApi.setRequests(r); window.__requestsTestApi.renderRequestsList(); }); }, [
    [req('r1', { notes: 'edit 1' }), req('r2')],
    [req('r1', { notes: 'edit 2' }), req('r2')],
    [req('r1', { notes: 'edit 3' }), req('r2')],
  ]);
  const noteText = await page.evaluate(() => document.querySelector('[data-request-id="r1"] .request-notes')?.textContent);
  const after = await cardTags(page);
  check('hostile: 3x rapid child_changed on same card converges to final value', noteText === 'edit 3', `(got "${noteText}")`);
  check('hostile: same-card node identity preserved across 3x rapid changes', before.r1 === after.r1);
  check('hostile: unaffected sibling untouched across 3x rapid changes', before.r2 === after.r2);
  check('no console errors', errors.length === 0, errors.join('; '));
}

// ── 15. Hostile review: comment action still reaches the registered callback ──
{
  const { page, errors } = await freshPage();
  await page.evaluate((requests) => window.__requestsTestApi.setRequests(requests), [req('r1', { comments: [{ id: 'c1' }] })]);
  await page.evaluate(() => window.__requestsTestApi.renderRequestsList());
  await page.click('[data-request-id="r1"] [data-request-action="comment"]');
  const counts = await page.evaluate(() => window.__requestsTestApi.getCounts());
  check('hostile: comment button reaches its callback after a diff-based render', counts.commentCount === 1, `(got ${counts.commentCount})`);
  check('no console errors', errors.length === 0, errors.join('; '));
}

// ── 16. Dark theme parity ──
{
  const { page, errors } = await freshPage();
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await page.evaluate((requests) => window.__requestsTestApi.setRequests(requests), [req('r1'), req('r2')]);
  await page.evaluate(() => window.__requestsTestApi.renderRequestsList());
  await page.evaluate((requests) => window.__requestsTestApi.setRequests(requests), [req('r1'), req('r2'), req('r3', { status: 'approved' })]);
  await page.evaluate(() => window.__requestsTestApi.renderRequestsList());
  const info = await page.evaluate(() => ({
    count: document.querySelectorAll('.request-card').length,
    approvedBorder: getComputedStyle(document.querySelector('[data-request-id="r3"]')).borderColor,
  }));
  check('dark theme: diff-based render still produces 3 cards', info.count === 3, `(got ${info.count})`);
  check('dark theme: status-driven styling still applies (non-empty border color)', !!info.approvedBorder && info.approvedBorder !== '', info.approvedBorder);
  check('no console errors', errors.length === 0, errors.join('; '));
}

// ── 17. Mobile viewport: no horizontal overflow after a diff-based update ──
for (const vw of [375, 390, 430, 1440]) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.setViewport({ width: vw, height: 800 });
  await page.goto(`http://localhost:${port}/scratch/requests-live-diff-harness.html`, { waitUntil: 'load' });
  await page.waitForFunction('window.__requestsHarnessReady === true');
  await page.evaluate((requests) => window.__requestsTestApi.setRequests(requests), [req('r1'), req('r2')]);
  await page.evaluate(() => window.__requestsTestApi.renderRequestsList());
  await page.evaluate((requests) => window.__requestsTestApi.setRequests(requests), [req('r1'), req('r2'), req('r3', { purpose: 'Keperluan yang sangat panjang sekali untuk menguji overflow horizontal pada kartu request ini' })]);
  await page.evaluate(() => window.__requestsTestApi.renderRequestsList());
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  check(`mobile ${vw}px: no horizontal overflow after diff-based update`, overflow === false);
  check(`no console errors (${vw}px)`, errors.length === 0, errors.join('; '));
  await page.close();
}

// ── 18. Performance sanity: a single-record update against a 100-item list
//        touches far less than a full rebuild would (MEASURED, not inferred). ──
{
  const { page, errors } = await freshPage();
  const hundred = Array.from({ length: 100 }, (_, i) => req(`p${i}`));
  await page.evaluate((requests) => window.__requestsTestApi.setRequests(requests), hundred);
  const initialMs = await page.evaluate(() => {
    const t0 = performance.now();
    window.__requestsTestApi.renderRequestsList();
    return performance.now() - t0;
  });

  const oneChanged = hundred.map((r, i) => i === 50 ? req('p50', { purpose: 'CHANGED' }) : r);
  await page.evaluate((requests) => window.__requestsTestApi.setRequests(requests), oneChanged);
  const singleUpdateInfo = await page.evaluate(() => {
    // takeRecords() (not the async callback) — the callback delivers on a
    // microtask, so disconnect() right after a synchronous call would
    // silently drop pending records before they're ever counted.
    const observer = new MutationObserver(() => {});
    observer.observe(document.getElementById('requestsListContent'), { childList: true, subtree: true, attributes: true, characterData: true });
    const t0 = performance.now();
    window.__requestsTestApi.renderRequestsList();
    const ms = performance.now() - t0;
    const mutationCount = observer.takeRecords().length;
    observer.disconnect();
    return { ms, mutationCount };
  });

  console.log(`   [measured] initial 100-card render: ${initialMs.toFixed(2)}ms; single-record update: ${singleUpdateInfo.ms.toFixed(2)}ms, ${singleUpdateInfo.mutationCount} DOM mutation records`);
  check('perf: single-record update against 100 items is faster than the initial full render', singleUpdateInfo.ms < initialMs, `(update ${singleUpdateInfo.ms.toFixed(2)}ms vs initial ${initialMs.toFixed(2)}ms)`);
  check('perf: single-record update touches a small, bounded number of DOM mutations (not O(100))', singleUpdateInfo.mutationCount < 20, `(got ${singleUpdateInfo.mutationCount})`);
  check('no console errors', errors.length === 0, errors.join('; '));
}

await browser.close();
server.close();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
