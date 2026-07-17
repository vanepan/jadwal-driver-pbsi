/* startup-stability-check.mjs — Hotfix Sprint SS1 (v1.27.1): Intermittent
   Splash Screen Freeze.
   Run: node scripts/startup-stability-check.mjs   (exit 0 = all pass)

   Root cause: js/auth.js's _hydrateFromFirebaseUser() awaited Firebase's
   user.getIdTokenResult() (a network call, no built-in timeout) INSIDE
   onAuthStateChanged's try/finally — and _authReadyResolve() only runs in
   that finally block. A stalled token refresh on a flaky connection at
   cold-start meant authReady() never resolved, which meant initAuthUI()
   never resolved, which meant app.js's DOMContentLoaded handler never
   reached its last line (`document.body.classList.add('app-ready')`) —
   freezing the startup splash (index.html: `body:not(.app-ready) {
   visibility: hidden }`) forever.

   Two kinds of checks:

   A) A REAL runtime proof that the `Promise.race(promise, timeout)` idiom
      itself actually unblocks a promise that never settles — pure JS, no
      Firebase import, so it runs directly.

   B) STATIC source-pattern checks confirming each of the four guards this
      hotfix added is actually present in the shipped files. js/auth.js and
      js/app.js import (transitively) from js/firebase.js, which imports the
      Firebase SDK via `https://` URL specifiers Node's ESM loader cannot
      resolve, and firebase.js's config is the real production project — so,
      per this repo's established convention (see e.g.
      scripts/self-drive-assignment-check.mjs's own header), these files are
      checked by source pattern, not executed. The real-browser regression
      check for the normal (fast) boot path lives in scripts/smoke-boot.mjs
      (`app-ready reached` / `splash removed` assertions). */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

/* ════════════════════════════════════════════════════════════════════════
   A) REAL runtime proof — the race-timeout idiom actually unblocks
   ════════════════════════════════════════════════════════════════════════ */
console.log('\n[Promise.race timeout idiom: proof it unblocks a promise that never settles]');

const neverSettles = new Promise(() => {}); // simulates a hung network call
const start = Date.now();
await Promise.race([
  neverSettles,
  new Promise(resolve => setTimeout(resolve, 50)),
]);
const elapsed = Date.now() - start;
check('race resolves via the timeout branch, not the hung promise (~50ms, not forever)', elapsed < 2000);

/* ════════════════════════════════════════════════════════════════════════
   B) STATIC source-pattern checks — the four guards this hotfix added
   ════════════════════════════════════════════════════════════════════════ */

console.log('\n[js/auth.js: _hydrateFromFirebaseUser — bounded getIdTokenResult() (root cause fix)]');
const authSrc = src('js/auth.js');
check('getIdTokenResult() is raced against a timeout, not awaited bare', /Promise\.race\(\[\s*user\.getIdTokenResult\(\)/.test(authSrc));
check('a hung token refresh still falls through to the existing catch (cached-role fallback)', /getIdTokenResult timeout/.test(authSrc));

console.log('\n[js/auth.js: initAuthUI — bounded authReady() gate]');
check('authReady() is raced against a timeout before updateAuthUI() runs', /await Promise\.race\(\[\s*authReady\(\),\s*new Promise\(resolve => setTimeout\(resolve, 8000\)\),\s*\]\);\s*updateAuthUI\(\);/.test(authSrc));

console.log('\n[js/app.js: warm-start startAuthenticatedSession() — bounded]');
const appSrc = src('js/app.js');
check('the returning-user startAuthenticatedSession() call is raced against a timeout', /if \(getCurrentUser\(\)\) \{\s*await Promise\.race\(\[\s*startAuthenticatedSession\(\),\s*new Promise\(resolve => setTimeout\(resolve, 8000\)\),\s*\]\);\s*\}/.test(appSrc));

console.log('\n[index.html: last-resort splash failsafe, independent of js/app.js]');
const indexSrc = src('index.html');
check('a failsafe setTimeout forces .app-ready if it is still missing', /window\.setTimeout\(function \(\) \{\s*if \(document\.body && !document\.body\.classList\.contains\('app-ready'\)\)/.test(indexSrc));
check('the failsafe script tag appears BEFORE js/app.js is loaded (independent of its module chain)', indexSrc.indexOf("app-ready timeout after 15s") < indexSrc.indexOf('src="js/app.js'));
check('the failsafe also removes #app-splash (matches the normal dismissal path)', /var splash = document\.getElementById\('app-splash'\);\s*if \(splash\) splash\.remove\(\);/.test(indexSrc));

/* ── Summary ─────────────────────────────────────────────────────────── */
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
