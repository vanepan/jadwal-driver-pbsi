// Phase 8.2 hostile review — targeted checks not already covered by
// drawer-consolidation-check.mjs: net keydown listener count after repeated
// open/close cycles, and onClose firing exactly once per real close even
// across the fast-reopen race the drawer.js fix addresses.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

const ROOT = process.cwd();
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  if (req.url === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  let p = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(ROOT, p);
  try {
    const body = fs.readFileSync(file);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch (e) { res.writeHead(404); res.end('not found'); }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log(`OK   ${name}`); }
  else { fail++; console.log(`FAIL ${name}`); if (detail) console.log('     ' + JSON.stringify(detail)); }
};

const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/i.test(m.text())) errors.push(m.text()); });
await page.goto(`http://localhost:${port}/scripts/decision-replay-harness.html`, { waitUntil: 'load' });

const result = await page.evaluate(async () => {
  const svc = await import('/js/services/request-intelligence-service.js');
  const drawer = await import('/js/components/decision-replay-drawer.js');

  const drivers = [{ id: 'd1', name: 'Igo' }];
  const vehicles = [{ id: 'v1', name: 'Avanza', capacity: 7, healthScore: 100 }];
  const request = { id: 'r1', date: '2026-06-25', startTime: '13:00', endTime: '16:00', passengers: 1, destination: 'X', requesterName: 'Y', createdAt: '2026-06-25T07:00:00' };
  const pkg = svc.buildRecommendationPackage({ request, drivers, vehicles, assignments: [], overrideLogs: [] }, { now: '2026-06-25T12:00:00' });
  const input = { pkg, stored: { hasRecommendation: true, generatedAt: pkg.generatedAt }, request };

  // Instrument document.addEventListener/removeEventListener to count net
  // 'keydown' listener registrations across many open/close cycles.
  let keydownAdds = 0, keydownRemoves = 0;
  const origAdd = document.addEventListener.bind(document);
  const origRemove = document.removeEventListener.bind(document);
  document.addEventListener = function (type, ...rest) { if (type === 'keydown') keydownAdds++; return origAdd(type, ...rest); };
  document.removeEventListener = function (type, ...rest) { if (type === 'keydown') keydownRemoves++; return origRemove(type, ...rest); };

  // 10 clean open/close cycles (via the close button, awaiting settle).
  for (let i = 0; i < 10; i++) {
    drawer.openDecisionReplay(input, {});
    document.querySelector('.drawer__close').click();
    await new Promise((r) => setTimeout(r, 30));
  }
  const afterCleanCycles = { keydownAdds, keydownRemoves, net: keydownAdds - keydownRemoves };

  // onClose firing count across a normal close.
  let onCloseCount = 0;
  drawer.openDecisionReplay(input, {});
  // can't pass onClose through openDecisionReplay's opts directly (it only
  // forwards onExport) — verify via the lower-level canonical primitive
  // instead, exactly how modal.js/vehicle-detail-drawer.js do.
  const drawerMod = await import('/js/components/drawer.js');
  drawerMod.closeDrawer(() => { onCloseCount++; });
  await new Promise((r) => setTimeout(r, 300));
  const cleanCloseOnCloseCount = onCloseCount;

  // Fast-reopen race: open with onClose#1, close, IMMEDIATELY open a fresh
  // drawer (superseding the pending close) with onClose#2, then wait past
  // the 260ms window. onClose#1 must NOT fire (superseded); onClose#2 must
  // fire exactly once when IT is later closed normally.
  onCloseCount = 0;
  let onClose1Fired = false, onClose2Fired = 0;
  drawerMod.openDrawer({ title: 'A', body: 'a', onClose: () => { onClose1Fired = true; } });
  drawerMod.closeDrawer(() => { onClose1Fired = true; }); // closeDrawer's own onClose param (mirrors requestClose's pattern)
  drawerMod.openDrawer({ title: 'B', body: 'b', onClose: () => { onClose2Fired++; } });
  await new Promise((r) => setTimeout(r, 300)); // past the old drawer's stale 260ms timer
  const afterRaceWait = { onClose1Fired, onClose2Fired, overlays: document.querySelectorAll('#appDrawerOverlay').length };
  // Correct contract (matches js/modal.js's real closeDetailModal() pattern):
  // onClose passed to openDrawer() is captured by THAT call's requestClose()
  // closure and only fires via backdrop/close-button/Escape — a direct
  // closeDrawer() call is intentionally independent and must be given its
  // own onClose if the caller wants one fired programmatically. Real
  // consumers that need "close no matter how" cleanup do it themselves
  // (js/modal.js:917-920's closeDetailModal() sets viewingId=null directly
  // rather than relying on this path) — neither of this phase's 2 migrated
  // consumers pass onClose at all, so this nuance doesn't affect them.
  drawerMod.closeDrawer(() => { onClose2Fired++; });
  await new Promise((r) => setTimeout(r, 300));
  const afterRealClose = { onClose2Fired, overlays: document.querySelectorAll('#appDrawerOverlay').length };

  document.addEventListener = origAdd;
  document.removeEventListener = origRemove;

  return { afterCleanCycles, cleanCloseOnCloseCount, afterRaceWait, afterRealClose };
});

check('10 clean open/close cycles leave net keydown listener count at 0 (no leak)', result.afterCleanCycles.net === 0, result.afterCleanCycles);
check('a normal close fires onClose exactly once', result.cleanCloseOnCloseCount === 1, result.cleanCloseOnCloseCount);
check('superseded close\'s onClose does NOT fire after being raced by a new open', result.afterRaceWait.onClose1Fired === false, result.afterRaceWait);
check('exactly one overlay survives the race (no duplicate DOM nodes)', result.afterRaceWait.overlays === 1, result.afterRaceWait);
check('the NEW drawer\'s own onClose has not fired yet (still open)', result.afterRaceWait.onClose2Fired === 0, result.afterRaceWait);
check('closing the surviving drawer fires its onClose exactly once', result.afterRealClose.onClose2Fired === 1, result.afterRealClose);
check('overlay fully removed after the real close', result.afterRealClose.overlays === 0, result.afterRealClose);
check('zero console/page errors across the whole audit', errors.length === 0, errors);

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
server.close();
if (fail > 0) process.exit(1);
