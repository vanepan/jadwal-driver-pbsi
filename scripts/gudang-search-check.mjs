/* gudang-search-check.mjs — Gudang V1.28.0, Phase 3 (Universal Search Foundation).

   Authorized by: Doc 1 Art.III / R-13 · Doc 2 §05/§12 · Doc 3 Ch.08 ·
   Doc 4 Art.IV — Phase 3 brief: Universal Search Engine, Deterministic
   search, Keyboard navigation, Search Result contracts, Action
   Resolution, Spotlight/Raycast interaction model.

   Same check()/throws() harness as scripts/gudang-foundation-check.mjs
   and scripts/gudang-item-check.mjs. Five parts:
     A. Alias-aware matching  — search-resolver.js's itemMatchesQuery(),
                                 pure, no Firebase (Doc 1 Art.III).
     B. Action Resolution     — action-resolver.js: known/available
                                 actions, resolveAction()'s four outcomes,
                                 primaryAction().
     C. Session engine        — search-session-engine.js: the Doc 2 §12
                                 keyboard table, event by event.
     D. Ownership              — the two new Phase 3 files own no
                                 persistence and import nothing forbidden.
     E. Regression             — Phase 1's search-resolver.js action
                                 surface is unchanged (still 'open' only);
                                 Phase 2's item-keyword-index.js is still
                                 unwired (dormant seam, see search-resolver
                                 header note).

   Deterministic. No live Firebase, no AI.
   Run: node scripts/gudang-search-check.mjs   (exit 0 = pass) */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { itemMatchesQuery, resolve } from '../js/gudang/search/search-resolver.js';
import { makeItem, ITEM_TYPE } from '../js/gudang/contracts/item-contract.js';
import { makeSearchResult, isSearchResult } from '../js/gudang/contracts/search-result-contract.js';
import {
  ACTION_OWNERSHIP, isKnownAction, isActionAvailable, resolveAction, primaryAction,
} from '../js/gudang/search/action-resolver.js';
import {
  createInitialSessionState, applySessionEvent,
} from '../js/gudang/search/search-session-engine.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0; let fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); }
}

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

function makeTisu(overrides = {}) {
  return makeItem({
    itemId: 'i-tisu', name: 'Tisu Gulung', itemType: ITEM_TYPE.CONSUMABLE, category: 'atk',
    aliases: ['Tissue', 'Roll Tissue'],
    ...overrides,
  });
}

/* ── Part A — Alias-aware matching ──────────────────────────────────── */
console.log('\n[Part A — itemMatchesQuery: reachable by name AND by common alias (Doc 1 Art.III)]');
{
  const tisu = makeTisu();
  check('matches by full name', itemMatchesQuery(tisu, 'Tisu Gulung'));
  check('matches by a partial, mid-word substring of the name (live-narrowing stays intact)', itemMatchesQuery(tisu, 'isu gul'));
  check('matches by a common alias, not just the canonical name', itemMatchesQuery(tisu, 'Tissue'));
  check('matches by a partial alias substring', itemMatchesQuery(tisu, 'oll tiss'));
  check('is case-insensitive', itemMatchesQuery(tisu, 'TISSUE'));
  check('does not match unrelated text', !itemMatchesQuery(tisu, 'sabun'));
  check('empty/whitespace query never matches', !itemMatchesQuery(tisu, '') && !itemMatchesQuery(tisu, '   '));

  const noAliases = makeTisu({ itemId: 'i-tisu2', aliases: [] });
  check('an item with zero aliases still matches by name, and throws nothing', itemMatchesQuery(noAliases, 'tisu') && !itemMatchesQuery(noAliases, 'nonexistent'));
}

/* ── Part B — Action Resolution ─────────────────────────────────────── */
console.log('\n[Part B — Action Resolution: names an intent, never performs it (Doc 4 Art.IV)]');
{
  check('ACTION_OWNERSHIP names all six Doc 1 Art.III actions', Object.keys(ACTION_OWNERSHIP).length === 6);
  check('only "open" is available today — no engine exists yet for the other five', Object.entries(ACTION_OWNERSHIP).filter(([, v]) => v.available).length === 1 && ACTION_OWNERSHIP.open.available === true);
  check('isKnownAction("issue") is true (named seam, Doc 1 Art.III)', isKnownAction('issue'));
  check('isKnownAction("teleport") is false', !isKnownAction('teleport'));
  check('isActionAvailable("open") is true', isActionAvailable('open'));
  check('isActionAvailable("issue") is false (Consumable Engine does not exist yet)', !isActionAvailable('issue'));

  const openResult = makeSearchResult({ ownerDomain: 'item', refId: 'i-tisu', label: 'Tisu Gulung', actions: ['open'] });
  const resolved = resolveAction(openResult, 'open');
  check('resolveAction() succeeds for an offered, available action', resolved.ok && resolved.data.type === 'open' && resolved.data.refId === 'i-tisu' && resolved.data.ownerEngine === 'item');
  check('resolveAction() result is frozen (inert data, not a live handle)', Object.isFrozen(resolved.data));

  const notOffered = resolveAction(openResult, 'issue');
  check('resolveAction() fails ACTION_NOT_OFFERED for an action this result never named', !notOffered.ok && notOffered.error.code === 'ACTION_NOT_OFFERED');

  const hypotheticallyOffered = makeSearchResult({ ownerDomain: 'item', refId: 'i-tisu', label: 'Tisu Gulung', actions: ['open', 'issue'] });
  const unavailable = resolveAction(hypotheticallyOffered, 'issue');
  check('resolveAction() fails ACTION_UNAVAILABLE even when offered, if no engine owns it yet', !unavailable.ok && unavailable.error.code === 'ACTION_UNAVAILABLE');

  const unknown = resolveAction(openResult, 'teleport');
  check('resolveAction() fails UNKNOWN_ACTION for an action Doc 1 Art.III never named', !unknown.ok && unknown.error.code === 'UNKNOWN_ACTION');

  const invalidResult = resolveAction({ not: 'a result' }, 'open');
  check('resolveAction() fails INVALID_RESULT for a malformed SearchResult, never throws', !invalidResult.ok && invalidResult.error.code === 'INVALID_RESULT');

  check('primaryAction() returns the first offered action', primaryAction(hypotheticallyOffered) === 'open');
  const noActions = makeSearchResult({ ownerDomain: 'item', refId: 'x', label: 'x', actions: [] });
  check('primaryAction() returns null when a result offers nothing (never throws)', primaryAction(noActions) === null);
}

/* ── Part C — Session engine: the Doc 2 §12 keyboard table ─────────── */
console.log('\n[Part C — Session engine: Ctrl+K / Up / Down / Enter / Tab / Esc]');
{
  const closed = createInitialSessionState();
  check('initial state is closed, empty, unfocused', closed.status === 'closed' && closed.results.length === 0 && closed.focusedIndex === -1);

  const afterCtrlK = applySessionEvent(closed, { type: 'key', key: 'k', ctrlKey: true });
  check('Ctrl+K opens Search from anywhere (Doc 2 §12)', afterCtrlK.state.status === 'open' && afterCtrlK.intent === null);

  const ctrlKAgain = applySessionEvent(afterCtrlK.state, { type: 'key', key: 'k', ctrlKey: true });
  check('Ctrl+K while already open is idempotent (no reset, no error)', ctrlKAgain.state.status === 'open');

  const oneResult = makeSearchResult({ ownerDomain: 'item', refId: 'i-tisu', label: 'Tisu Gulung', actions: ['open'] });
  const twoResults = [oneResult, makeSearchResult({ ownerDomain: 'location', refId: 'l1', label: 'Gudang Utama', actions: ['open'] })];
  const loaded = applySessionEvent(afterCtrlK.state, { type: 'resultsLoaded', query: 'g', results: twoResults });
  check('resultsLoaded focuses the first row automatically', loaded.state.focusedIndex === 0 && loaded.state.results.length === 2);

  const empty = applySessionEvent(afterCtrlK.state, { type: 'resultsLoaded', query: 'zzz', results: [] });
  check('resultsLoaded with zero results leaves focusedIndex at -1 (no crash on an empty state)', empty.state.focusedIndex === -1);

  const down1 = applySessionEvent(loaded.state, { type: 'key', key: 'ArrowDown' });
  check('ArrowDown moves focus to the next row', down1.state.focusedIndex === 1);
  const down2 = applySessionEvent(down1.state, { type: 'key', key: 'ArrowDown' });
  check('ArrowDown wraps around past the last row', down2.state.focusedIndex === 0);
  const up1 = applySessionEvent(loaded.state, { type: 'key', key: 'ArrowUp' });
  check('ArrowUp wraps backward from the first row to the last', up1.state.focusedIndex === 1);
  check('keys are ignored while the session is closed (except Ctrl+K)', applySessionEvent(closed, { type: 'key', key: 'ArrowDown' }).state.focusedIndex === -1);

  const enterResult = applySessionEvent(loaded.state, { type: 'key', key: 'Enter' });
  check('Enter on the focused row resolves its primary action', enterResult.intent?.ok === true && enterResult.intent.data.type === 'open' && enterResult.intent.data.refId === 'i-tisu');

  const singleActionRow = applySessionEvent(afterCtrlK.state, { type: 'resultsLoaded', query: 'g', results: [oneResult] });
  const tabNoop = applySessionEvent(singleActionRow.state, { type: 'key', key: 'Tab' });
  check('Tab is a no-op when a row has only one action (dormant seam, not an error)', tabNoop.state.actionFocusIndex === null);

  const multiActionRow = makeSearchResult({ ownerDomain: 'item', refId: 'i-tisu', label: 'Tisu Gulung', actions: ['open', 'issue'] });
  const loadedMulti = applySessionEvent(afterCtrlK.state, { type: 'resultsLoaded', query: 'g', results: [multiActionRow] });
  const tabbed = applySessionEvent(loadedMulti.state, { type: 'key', key: 'Tab' });
  check('Tab steps into a row\'s other actions when more than one exists (Doc 2 §12)', tabbed.state.actionFocusIndex === 0);
  const tabbedAgain = applySessionEvent(tabbed.state, { type: 'key', key: 'Tab' });
  check('Tab cycles through actions and wraps', tabbedAgain.state.actionFocusIndex === 1);
  const enterOnTabbed = applySessionEvent(tabbedAgain.state, { type: 'key', key: 'Enter' });
  check('Enter after Tab commits the REVEALED action, not the primary one', enterOnTabbed.intent?.ok === false && enterOnTabbed.intent.error.code === 'ACTION_UNAVAILABLE');

  const withQuery = applySessionEvent(afterCtrlK.state, { type: 'resultsLoaded', query: 'tisu', results: [oneResult] });
  const escClears = applySessionEvent(withQuery.state, { type: 'key', key: 'Escape' });
  check('Esc with a non-empty query clears the query first (Doc 2 §12: "clear the input, OR close")', escClears.state.status === 'open' && escClears.state.query === '' && escClears.state.results.length === 0);
  const escCloses = applySessionEvent(escClears.state, { type: 'key', key: 'Escape' });
  check('Esc again on an already-empty query closes the session', escCloses.state.status === 'closed');

  check('every result the reducer ever focuses satisfies isSearchResult (Search Result contract, Doc 3 Ch.08)', twoResults.every(isSearchResult));
}

/* ── Part D — Ownership: the two new files own no persistence ─────── */
console.log('\n[Part D — Ownership: action-resolver.js and search-session-engine.js own no persistence]');
{
  for (const rel of ['js/gudang/search/action-resolver.js', 'js/gudang/search/search-session-engine.js']) {
    const code = read(rel);
    check(`${rel} contains no storeFirebaseData/runNodeTransaction call`, !code.includes('storeFirebaseData') && !code.includes('runNodeTransaction'));
    check(`${rel} never imports firebase.js`, !code.includes("firebase.js'"));
    check(`${rel} never hardcodes a "gudang/..." RTDB path literal`, !/['"`]gudang\//.test(code));
  }
}

/* ── Part E — Regression: Phase 1/2 surfaces unchanged ─────────────── */
console.log('\n[Part E — Regression: Phase 1 action surface and Phase 2 seam are unchanged]');
{
  const itemResult = resolve({ domain: 'item', record: { itemId: 'i1', name: 'Tisu Gulung' } });
  check('resolve() still names "open" as the only action for an item (Phase 3 added no new action)', itemResult.actions.length === 1 && itemResult.actions[0] === 'open');

  const searchResolverCode = read('js/gudang/search/search-resolver.js');
  check('item-keyword-index.js remains unwired into search-resolver.js (see this phase\'s header note on why)', !searchResolverCode.includes('item-keyword-index'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
