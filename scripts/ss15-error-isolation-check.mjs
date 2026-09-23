/* ss15-error-isolation-check.mjs — SS15 error-isolation hardening across
   three independent, unrelated call sites found during the SS15 navigation
   and export failure-surface audit. Grouped into one focused suite rather
   than three near-empty ones (each is a small, static, source-level fix).

   PART A — js/app.js#navAnalyticsPettyCash(): a dynamic module import +
   mount with NO try/catch at all. A failed chunk load (network blip,
   post-deploy hash mismatch) used to: set analyticsPettyMounted = true
   BEFORE the await (so the module claims to be mounted even though it
   isn't), never assign _fnMountAnalyticsPettyCash/_fnClose.../_fnRefresh...,
   throw an unhandled rejection, and leave stale/blank content in
   #v2AnalyticsPettyWorkspace with zero user feedback — while
   analyticsPettyMounted stuck at true also means a later navigation-away
   would (harmlessly, via `&&`) skip calling a close fn that was never
   assigned, and a later refresh call would silently no-op forever. Fixed to
   match the ALREADY-CORRECT sibling pattern used by
   renderDriverWellnessSection() elsewhere in this file: try/catch, an
   honest "Gagal memuat" fallback in the host element, and resetting the
   mounted flag on failure so the app doesn't claim a dead module is alive.

   PART B — js/analytics/views/analytics-executive-view.js and
   analytics-petty-cash-view.js: three separate PDF/Excel export button
   handlers (`exec-export-pdf`, `pc-export-pdf`, `pc-export-excel`) caught
   failures with `.catch(err => console.error(...))` ONLY — no loading
   state anywhere on these buttons to begin with, and on failure NOTHING
   reaches the user: click, wait, silence. Reproducible any time the
   underlying window.export*() function rejects (network failure, a Cloud
   Function error). Fixed to match the ALREADY-CORRECT sibling pattern at
   petty-cash-center.js#doPrintNor (try/catch + showToast(..., 'error')).

   Both parts are pure static source checks — no DOM/Firebase/browser
   dependency, consistent with this project's "no real I/O in headless
   scripts" convention.

   Run: node scripts/ss15-error-isolation-check.mjs   (exit 0 = pass) */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); if (detail !== undefined) console.log('     ' + JSON.stringify(detail)); }
};

console.log('[Part A — js/app.js#navAnalyticsPettyCash() isolates a failed dynamic import/mount]');
const appSrc = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf-8');
const navStart = appSrc.indexOf('async function navAnalyticsPettyCash()');
const navEnd = appSrc.indexOf('\n}', navStart) + 2;
const navBody = appSrc.slice(navStart, navEnd);

check('navAnalyticsPettyCash: found', navStart !== -1);
check('wraps the dynamic import + mount in try/catch',
  /try \{[\s\S]*?await loadPettyCashAnalyticsView\(\)[\s\S]*?await _fnMountAnalyticsPettyCash\([\s\S]*?\} catch \(err\) \{/.test(navBody));
check('resets analyticsPettyMounted to false on failure (does not keep claiming a dead module is mounted)',
  /catch \(err\) \{[\s\S]*?analyticsPettyMounted = false;/.test(navBody));
check('writes an honest "Gagal memuat" fallback into the actual host element on failure',
  /catch \(err\) \{[\s\S]*?getElementById\('v2AnalyticsPettyWorkspace'\)[\s\S]*?Gagal memuat/.test(navBody));
check('logs the failure (not a silent swallow)', /catch \(err\) \{[\s\S]*?console\.warn\('\[AnalyticsPettyCash\] mount failed', err\)/.test(navBody));

console.log('\n[Part B — export-button failures now reach the user, not just the console]');
const execSrc = fs.readFileSync(path.join(ROOT, 'js/analytics/views/analytics-executive-view.js'), 'utf-8');
const pcSrc = fs.readFileSync(path.join(ROOT, 'js/analytics/views/analytics-petty-cash-view.js'), 'utf-8');

check('analytics-executive-view.js imports showToast', /import \{ showToast \} from '\.\.\/\.\.\/components\/toast\.js';/.test(execSrc));
check('exec-export-pdf failure shows an error toast (not just console.error)',
  /exec-export-pdf[\s\S]*?catch\(err => \{[\s\S]*?console\.error\('\[AnalyticsExecutive\] PDF export failed', err\);[\s\S]*?showToast\('Gagal membuat PDF', 'error'\);/.test(execSrc));

check('analytics-petty-cash-view.js imports showToast', /import \{ showToast \} from '\.\.\/\.\.\/components\/toast\.js';/.test(pcSrc));
check('pc-export-pdf failure shows an error toast',
  /pc-export-pdf[\s\S]*?catch\(err => \{[\s\S]*?console\.error\('\[AnalyticsPettyCash\] PDF export failed', err\);[\s\S]*?showToast\('Gagal membuat PDF', 'error'\);/.test(pcSrc));
check('pc-export-excel failure shows a DIFFERENT, correctly-worded error toast',
  /pc-export-excel[\s\S]*?catch\(err => \{[\s\S]*?console\.error\('\[AnalyticsPettyCash\] Excel export failed', err\);[\s\S]*?showToast\('Gagal membuat Excel', 'error'\);/.test(pcSrc));

console.log('\n[Reference — the sibling patterns these fixes were matched against still exist unchanged]');
check('renderDriverWellnessSection (the reference fallback pattern) is unchanged',
  /catch \(err\) \{\s*\n\s*console\.warn\('\[DriverWellness\] render failed', err\);/.test(appSrc));
const pettyCashCenterSrc = fs.readFileSync(path.join(ROOT, 'js/petty-cash/petty-cash-center.js'), 'utf-8');
check("doPrintNor (the reference toast-on-export-failure pattern) is unchanged",
  /toast\('Gagal membuat PDF', 'error'\)/.test(pettyCashCenterSrc));

console.log(`\nss15-error-isolation-check: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
