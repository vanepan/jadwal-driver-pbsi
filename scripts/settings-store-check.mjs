/* settings-store-check.mjs — Design System Program Phase 11 (Administration)

   Test-coverage debt item from the Phase 11 Administration audit
   (docs/DESIGN_SYSTEM_PROGRAM_PHASE_11_ADMINISTRATION_AUDIT.md): js/
   settings-store.js — the single source of truth every Settings-reading
   module (dispatch-intelligence-config.js, the notification runtime, the
   Settings UI itself) falls back to — had ZERO test coverage of any kind.

   Method: real boot of index.html (js/settings-store.js has real ES
   exports but imports js/firebase.js, which itself imports the Firebase
   SDK from a `https://` URL — importable only inside a real browser, not
   plain Node — so this is a Puppeteer DOM test, not a pure-node one, same
   constraint documented in engineering-foundation-check.mjs's header).

   database.rules.json's /settings node requires `auth != null` for .read
   and an admin token for .write; this harness only fakes a localStorage
   session (no real Firebase Auth), so per [[firebase-prod-in-local-testing]]
   the real initSettingsStore()/updateSetting() calls below hit PRODUCTION
   and are genuinely, fail-closed DENIED — exercised deliberately as real
   negative-path coverage, never risking a real production write.

   Run: node scripts/settings-store-check.mjs (exit 0 = pass) */

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

console.log('[Phase 11] settings-store.js — test-coverage debt (was zero)\n');

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
  const store = await import('/js/settings-store.js');
  const out = {};

  // ── listener registered BEFORE the first init — proves it fires on the
  //    real (denied) load's DEFAULTS fallback, not just on a later write ──
  let listenerCalls = 0;
  let lastListenerArg = null;
  store.registerSettingsChangeListener((s) => { listenerCalls++; lastListenerArg = s; });

  await store.initSettingsStore();
  out.listenerCalledOnceAfterFirstInit = listenerCalls === 1;
  out.listenerArgHasDefaults = lastListenerArg?.operations?.workStartMins === 540;

  // ── DEFAULTS fall-through: production denies the anonymous read, so
  //    every value below must resolve from the module's own DEFAULTS ──────
  out.settingsIsObject = typeof store.getSettings() === 'object' && store.getSettings() !== null;
  out.workStartMins = store.getSetting('operations.workStartMins');
  out.workEndMins = store.getSetting('operations.workEndMins');
  out.backupRetentionDays = store.getSetting('system.backupRetentionDays');
  out.recoveryBufferMinutes = store.getSetting('dispatch.recoveryBufferMinutes');
  out.enableTelegramFallback = store.getSetting('notifications.enableTelegramFallback');

  // ── dot-path edge cases ──────────────────────────────────────────────
  out.unknownTopLevelIsUndefined = store.getSetting('totallyUnknownKey.nested') === undefined;
  out.unknownNestedKeyIsUndefined = store.getSetting('operations.notARealKey') === undefined;
  const wholeSubtree = store.getSetting('operations');
  out.wholeSubtreeIsObjectWithExpectedKey = typeof wholeSubtree === 'object' && wholeSubtree?.workStartMins === 540;

  // ── idempotency: a second initSettingsStore() must not re-seed or
  //    re-notify listeners (settingsLoaded/settingsSubscribed guards) ─────
  await store.initSettingsStore();
  out.listenerNotCalledAgainOnSecondInit = listenerCalls === 1;
  out.settingsStableAfterSecondInit = store.getSetting('operations.workStartMins') === 540;

  // ── updateSetting() against production with no real auth: must be
  //    genuinely denied (fail-closed), never silently "succeed" ───────────
  let updateThrew = false;
  try {
    await store.updateSetting('operations.workStartMins', 999);
  } catch (_) {
    updateThrew = true;
  }
  out.updateSettingWasDenied = updateThrew;
  out.cacheUnchangedAfterDeniedUpdate = store.getSetting('operations.workStartMins') === 540;

  return out;
});

check('registerSettingsChangeListener() fires exactly once after the first initSettingsStore()', result.listenerCalledOnceAfterFirstInit);
check('the listener receives the DEFAULTS-backed settings object (real prod read denied, fail-closed)', result.listenerArgHasDefaults);
check('getSettings() returns an object', result.settingsIsObject);
check('getSetting(\'operations.workStartMins\') falls back to the coded default (540)', result.workStartMins === 540);
check('getSetting(\'operations.workEndMins\') falls back to the coded default (1020)', result.workEndMins === 1020);
check('getSetting(\'system.backupRetentionDays\') falls back to the coded default (30)', result.backupRetentionDays === 30);
check('getSetting(\'dispatch.recoveryBufferMinutes\') falls back to the coded default (60)', result.recoveryBufferMinutes === 60);
check('getSetting(\'notifications.enableTelegramFallback\') falls back to the coded default (true)', result.enableTelegramFallback === true);
check('an unknown top-level dot-path resolves to undefined, not a throw', result.unknownTopLevelIsUndefined);
check('an unknown nested key under a real branch resolves to undefined', result.unknownNestedKeyIsUndefined);
check('a dot-path resolving to a whole subtree returns that subtree, not just leaves', result.wholeSubtreeIsObjectWithExpectedKey);
check('a second initSettingsStore() call does not re-notify listeners (idempotent load guard)', result.listenerNotCalledAgainOnSecondInit);
check('settings remain stable/DEFAULTS-backed after a second initSettingsStore() call', result.settingsStableAfterSecondInit);
check('updateSetting() against production with no real admin auth is genuinely denied', result.updateSettingWasDenied);
check('a denied updateSetting() never optimistically mutates the local cache', result.cacheUnchangedAfterDeniedUpdate);

const fatal = errors.filter((e) =>
  /SyntaxError|ReferenceError|TypeError|is not a function|Failed to (load|fetch) module|Cannot use import|Unexpected token|does not provide an export/i.test(e)
);
check('zero fatal console errors (Firebase permission-denied noise is expected/informational)', fatal.length === 0, fatal.join(' | '));

await browser.close();
server.close();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
