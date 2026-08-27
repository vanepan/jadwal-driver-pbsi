/* notifications-panel-check.mjs — Design System Program Phase 11 (Administration)

   Regression check for four Notifications audit findings, all fixed in
   this phase:

     - D2: in-panel notification cards were read-only — deep-linking only
       ever worked via an actual OS push tap. A server-outbox card that
       carries entityKind/entityId (the same fields
       functions/src/notifications/model.js already persists on every
       record) is now clickable, reusing js/app.js's existing
       pbsi:push-nav handler rather than duplicating navigation logic.
     - D3: this module had no logout teardown — resetNotificationsSync()
       now exists and is wired into js/app.js's onAuthLost.
     - D4: #modalNotifications had no Escape-key close handler, unlike ~7
       other modals in js/app.js.
     - D6: every server-outbox card hardcoded 'notif-priority-normal' — a
       class with no matching CSS rule anywhere, so every card rendered
       with no priority accent regardless of the real event.
       serverNotifPriority() now derives a real high/medium/low tier from
       the event type (functions/src/notifications/registry.js's
       exhaustive 15-type list).

   Method: real unauthenticated boot of index.html (js/notifications.js
   has real ES exports, dynamically imported directly — no need for the
   app.js-no-exports workaround other Phase 11 checks use).
   __setServerNotifsForTest() bypasses the real RTDB subscription.

   Run: node scripts/notifications-panel-check.mjs (exit 0 = pass) */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); if (detail !== undefined) console.log('     • ' + String(detail).slice(0, 300)); }
};

console.log('[Phase 11] Notifications panel — D2 click-to-navigate, D3 logout teardown, D4 Escape key, D6 real priority tiers\n');

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  const content = fs.readFileSync(file);
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Content-Length': content.length });
  res.end(content);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const errors = [];
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
await page.evaluateOnNewDocument(() => {
  localStorage.setItem('pbsi_current_user', JSON.stringify({
    id: 'admin-test', username: 'admin-test', name: 'Admin Test', role: 'admin', active: true,
  }));
});
await page.goto(`http://localhost:${port}/index.html`, { waitUntil: 'networkidle0', timeout: 45000 });

const result = await page.evaluate(async () => {
  const notif = await import('/js/notifications.js');
  notif.initNotificationUI();

  const out = {};

  // ── D2: a navigable server card renders clickable, click closes the
  //    modal and dispatches pbsi:push-nav with the right view/id ──────────
  notif.__setServerNotifsForTest([
    { id: 'evt-1', type: 'assignment.created', title: 'Assignment Baru', body: 'Test', createdAt: new Date().toISOString(), entityKind: 'assignment', entityId: 'ASG-123' },
    { id: 'evt-2', type: 'engineering.published', title: 'No Entity Yet', body: 'Test', createdAt: new Date().toISOString(), entityKind: null, entityId: null },
  ]);
  notif.openNotificationsModal();
  await new Promise((r) => setTimeout(r, 50));

  const cards = [...document.querySelectorAll('.notif-card')];
  const navigableCard = cards.find((c) => c.dataset.id === 'evt-1');
  const nonNavigableCard = cards.find((c) => c.dataset.id === 'evt-2');
  out.navigableCardHasClickableClass = navigableCard?.classList.contains('notif-card--clickable');
  out.navigableCardHasButtonRole = navigableCard?.getAttribute('role') === 'button';
  out.nonNavigableCardHasNoClickableClass = !!nonNavigableCard && !nonNavigableCard.classList.contains('notif-card--clickable');

  let navEventDetail = null;
  window.addEventListener('pbsi:push-nav', (ev) => { navEventDetail = ev.detail; });
  navigableCard.click();
  await new Promise((r) => setTimeout(r, 350)); // modal close animation, if any
  out.modalClosedAfterNavClick = document.getElementById('modalNotifications')?.style.display === 'none';
  out.navEventDispatchedWithCorrectView = navEventDetail?.view === 'assignment';
  out.navEventDispatchedWithCorrectId = navEventDetail?.id === 'ASG-123';

  // Clicking the action buttons (Tandai dibaca / Arsipkan) must NOT trigger
  // navigation — the stopPropagation()/target-check guard must hold.
  notif.openNotificationsModal();
  await new Promise((r) => setTimeout(r, 50));
  navEventDetail = null;
  const archiveBtn = document.querySelector('.notif-card[data-id="evt-1"] [data-notif-action="archive"]');
  archiveBtn?.click();
  await new Promise((r) => setTimeout(r, 50));
  out.actionButtonClickDidNotTriggerNav = navEventDetail === null;

  // ── D4: Escape closes the notifications modal ───────────────────────────
  notif.openNotificationsModal();
  await new Promise((r) => setTimeout(r, 50));
  out.modalOpenBeforeEscape = document.getElementById('modalNotifications')?.style.display === 'flex';
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await new Promise((r) => setTimeout(r, 50));
  out.modalClosedAfterEscape = document.getElementById('modalNotifications')?.style.display === 'none';

  // Escape must be a no-op when the modal is already closed (no crash, no
  // side effect on some other modal).
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  out.escapeWhenClosedDidNotThrow = true; // reaching here means it didn't throw

  // ── D3: resetNotificationsSync() exists and clears runtime state ────────
  out.resetFnExists = typeof notif.resetNotificationsSync === 'function';
  notif.setNotificationData({ pendingRequests: 0, recentLogs: [] }); // establishes a "subscribed" uid via getCurrentUser() being null->still exercises the reset path
  const beforeReset = notif.getNotificationRuntimeInfo();
  notif.resetNotificationsSync();
  const afterReset = notif.getNotificationRuntimeInfo();
  out.resetClearsRecipientUid = afterReset.recipientUid === null;
  out.resetClearsServerCount = afterReset.serverCount === 0;

  // ── D6: a real high/medium/low priority tier, not a dead 'normal' class ──
  notif.__setServerNotifsForTest([
    { id: 'evt-cancelled', type: 'assignment.cancelled', title: 'Dibatalkan', body: 'Test', createdAt: new Date().toISOString() },
    { id: 'evt-rejected', type: 'engineering.rejected', title: 'Ditolak', body: 'Test', createdAt: new Date().toISOString() },
    { id: 'evt-created', type: 'assignment.created', title: 'Baru', body: 'Test', createdAt: new Date().toISOString() },
    { id: 'evt-published', type: 'engineering.published', title: 'Dipublikasikan', body: 'Test', createdAt: new Date().toISOString() },
    { id: 'evt-postponed', type: 'engineering.postponed', title: 'Ditunda', body: 'Test', createdAt: new Date().toISOString() },
    { id: 'evt-joined', type: 'engineering.joined', title: 'Bergabung', body: 'Test', createdAt: new Date().toISOString() },
    { id: 'evt-completed', type: 'assignment.completed', title: 'Selesai', body: 'Test', createdAt: new Date().toISOString() },
  ]);
  notif.openNotificationsModal();
  await new Promise((r) => setTimeout(r, 50));
  const priorityClassOf = (id) => {
    const el = document.querySelector(`.notif-card[data-id="${id}"]`);
    const cls = [...(el?.classList || [])].find((c) => c.startsWith('notif-priority-'));
    return cls || null;
  };
  out.cancelledIsHigh = priorityClassOf('evt-cancelled') === 'notif-priority-high';
  out.rejectedIsHigh = priorityClassOf('evt-rejected') === 'notif-priority-high';
  out.createdIsMedium = priorityClassOf('evt-created') === 'notif-priority-medium';
  out.publishedIsMedium = priorityClassOf('evt-published') === 'notif-priority-medium';
  out.postponedIsMedium = priorityClassOf('evt-postponed') === 'notif-priority-medium';
  out.joinedIsLow = priorityClassOf('evt-joined') === 'notif-priority-low';
  out.completedIsLow = priorityClassOf('evt-completed') === 'notif-priority-low';
  out.noCardStillUsesTheDeadNormalClass = ![...document.querySelectorAll('.notif-card')]
    .some((c) => c.classList.contains('notif-priority-normal'));

  return out;
});

check('a server card with entityKind+entityId renders with the clickable class', result.navigableCardHasClickableClass);
check('a navigable card carries role="button" for keyboard/AT users', result.navigableCardHasButtonRole);
check('a server card with no entity does NOT render clickable (nothing to navigate to)', result.nonNavigableCardHasNoClickableClass);
check('clicking a navigable card closes the notifications modal', result.modalClosedAfterNavClick);
check('clicking a navigable card dispatches pbsi:push-nav with the correct view', result.navEventDispatchedWithCorrectView);
check('clicking a navigable card dispatches pbsi:push-nav with the correct id', result.navEventDispatchedWithCorrectId);
check('clicking an action button (Arsipkan) does not also trigger navigation', result.actionButtonClickDidNotTriggerNav);
check('modal is open before Escape is pressed (sanity)', result.modalOpenBeforeEscape);
check('Escape closes the notifications modal', result.modalClosedAfterEscape);
check('pressing Escape when nothing is open does not throw', result.escapeWhenClosedDidNotThrow);
check('resetNotificationsSync() is exported', result.resetFnExists);
check('resetNotificationsSync() clears the tracked recipient uid', result.resetClearsRecipientUid);
check('resetNotificationsSync() clears the cached server notification count', result.resetClearsServerCount);
check('assignment.cancelled renders notif-priority-high', result.cancelledIsHigh);
check('engineering.rejected renders notif-priority-high', result.rejectedIsHigh);
check('assignment.created renders notif-priority-medium', result.createdIsMedium);
check('engineering.published renders notif-priority-medium', result.publishedIsMedium);
check('engineering.postponed renders notif-priority-medium (a timing change needing awareness, not just FYI)', result.postponedIsMedium);
check('engineering.joined renders notif-priority-low', result.joinedIsLow);
check('assignment.completed renders notif-priority-low', result.completedIsLow);
check('no server card still uses the dead notif-priority-normal class', result.noCardStillUsesTheDeadNormalClass);

const fatal = errors.filter((e) =>
  /SyntaxError|ReferenceError|TypeError|is not a function|Failed to (load|fetch) module|Cannot use import|Unexpected token|does not provide an export/i.test(e)
);
check('zero fatal console errors (Firebase permission-denied noise is expected/informational)', fatal.length === 0, fatal.join(' | '));

await browser.close();
server.close();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
