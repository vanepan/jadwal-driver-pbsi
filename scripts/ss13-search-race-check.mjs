/* ss13-search-race-check.mjs — SS13 search race hardening.

   js/gudang/ui/gudang-center.js#driveSearchQuery() awaits searchAndResolve()
   (a real Firebase read whenever st.data isn't preloaded yet, e.g. right
   after mount) with NO guard against being superseded. Three concrete ways
   a stale resolve could overwrite a newer one, all previously unguarded:

     1) Ordinary rapid typing: an OLDER keystroke's lookup is slower (cold
        Firebase read) than a NEWER keystroke's (preloaded/cached), so the
        older one's 'resultsLoaded' dispatch lands last and overwrites the
        newer, correct results.
     2) applyRecentSearchQuery() (a Recent-Searches row click) deliberately
        bypasses the debounce for an IMMEDIATE re-search, but never
        cancelled a still-pending debounced keystroke's timer — that timer
        could fire afterward and overwrite the click's results with an
        already-abandoned typed query.
     3) closeGudangSearch() cancels the pending TIMER, but a lookup already
        in flight (past the debounce, awaiting the network) has no way to
        be cancelled — its resolve could still land after close and
        silently reopen/repopulate a dropdown the user already dismissed.

   Fix: _latestSearchQuery, a module-level "what query is the user actually
   waiting on right now" (null = no live search pending), written
   synchronously at every request/close site. driveSearchQuery() only
   applies a resolve when it still matches — otherwise it's dropped as
   stale. Same shape as _themeRequested (js/app.js, this same SS13 pass).

   [1] static  — the guard is wired into gudang-center.js at all 5 sites.
   [2] dynamic — this file's import chain can reach real production
       Firebase (js/gudang/repository/*.js -> firebase.js) whenever
       st.data isn't preloaded, so the REAL module is deliberately never
       imported/executed here (see this project's own recorded constraint:
       headless scripts hitting production RTDB is a known hazard). Instead
       this proves the GUARD PATTERN itself is correct under adversarial
       promise ordering, in total isolation — a minimal reimplementation of
       exactly driveSearchQuery()'s shape (record-then-await-then-check),
       fed fake resolvers with controllable, out-of-order delays.

   Run: node scripts/ss13-search-race-check.mjs   (exit 0 = pass) */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); if (detail !== undefined) console.log('     ' + JSON.stringify(detail)); }
};

console.log('[1 — static: the guard is wired into gudang-center.js]');
const src = fs.readFileSync(path.join(ROOT, 'js/gudang/ui/gudang-center.js'), 'utf-8');
check('a module-level _latestSearchQuery tracks the live query', /let _latestSearchQuery = null;/.test(src));
check('setGudangSearch() records the request synchronously before debouncing the resolve',
  /_latestSearchQuery = q;\s*\n\s*\/\/ v1\.29\.0 Feature 2 \(debounce\)/.test(src));
check('openRecentSearchesView() clears it (no live query pending in the Recent Searches view)',
  /function openRecentSearchesView\(\) \{[\s\S]{0,200}_latestSearchQuery = null;/.test(src));
check('closeGudangSearch() clears it (a still-in-flight resolve must not reopen a closed search)',
  /export function closeGudangSearch\(\) \{[\s\S]{0,200}_latestSearchQuery = null;/.test(src));
check('applyRecentSearchQuery() cancels any pending debounce timer before its own immediate search',
  /function applyRecentSearchQuery\(query\) \{[\s\S]{0,500}clearTimeout\(searchDebounceTimer\)/.test(src));
check('applyRecentSearchQuery() records ITS query as the latest before driving the search',
  /function applyRecentSearchQuery\(query\) \{[\s\S]{0,600}_latestSearchQuery = query;/.test(src));
check('driveSearchQuery() drops a resolve that no longer matches the latest requested query',
  /async function driveSearchQuery\(query\) \{[\s\S]{0,600}if \(query !== _latestSearchQuery\) return;/.test(src));

console.log('\n[2 — dynamic (isolated): the guard pattern is correct under adversarial promise ordering]');

// A minimal stand-in for searchAndResolve(): resolves after `delayMs`,
// returning results tagged with the query so a wrong-result overwrite is
// unambiguously detectable.
const fakeSearchAndResolve = (query, delayMs) =>
  new Promise((resolve) => setTimeout(() => resolve({ ok: true, data: [`results-for:${query}`] }), delayMs));

function makeSession() {
  let latestQuery = null;
  let appliedResults = null; // what actually got "rendered" — the thing under test
  let applyCount = 0;
  async function driveSearchQuery(query, delayMs) {
    const res = await fakeSearchAndResolve(query, delayMs);
    if (query !== latestQuery) return; // the fix under test
    appliedResults = res.data;
    applyCount++;
  }
  return {
    request(query, delayMs) { latestQuery = query; return driveSearchQuery(query, delayMs); },
    close() { latestQuery = null; },
    get appliedResults() { return appliedResults; },
    get applyCount() { return applyCount; },
  };
}

console.log('  -- A (slow, older) then B (fast, newer): B must win, A must be dropped --');
{
  const s = makeSession();
  const pA = s.request('A', 150); // older request, slower resolve
  const pB = s.request('B', 20);  // newer request, faster resolve
  await Promise.all([pA, pB]);
  check('final applied results are B\'s (the newer query), not A\'s (the older, slower one)',
    JSON.stringify(s.appliedResults) === JSON.stringify(['results-for:B']), s.appliedResults);
  check('exactly one apply happened (the stale A resolve was dropped, not just ignored-but-still-counted twice)',
    s.applyCount === 1, s.applyCount);
}

console.log('  -- B (fast, newer) resolves, THEN A (slow, older) resolves even later --');
{
  const s = makeSession();
  const pA = s.request('A', 300);
  const pB = s.request('B', 10);
  await pB;
  check('B applied first, correctly', JSON.stringify(s.appliedResults) === JSON.stringify(['results-for:B']), s.appliedResults);
  await pA; // let the stale one resolve too
  check('after A\'s later resolve, results are STILL B\'s (A did not clobber it on arrival)',
    JSON.stringify(s.appliedResults) === JSON.stringify(['results-for:B']), s.appliedResults);
  check('still exactly one apply total', s.applyCount === 1, s.applyCount);
}

console.log('  -- session closes while a lookup is in flight: the late resolve must not reopen it --');
{
  const s = makeSession();
  const p = s.request('X', 60);
  s.close(); // user closed the search before X's lookup finished
  await p;
  check('closed session: X\'s late resolve applied NOTHING (still null)', s.appliedResults === null, s.appliedResults);
  check('zero applies after close', s.applyCount === 0, s.applyCount);
}

console.log('  -- no race at all (single request): still applies normally --');
{
  const s = makeSession();
  await s.request('solo', 5);
  check('a single, uncontested request still applies its own result', JSON.stringify(s.appliedResults) === JSON.stringify(['results-for:solo']), s.appliedResults);
}

console.log(`\nss13-search-race-check: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
