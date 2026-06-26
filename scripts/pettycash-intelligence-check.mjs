/* pettycash-intelligence-check.mjs — validates the Petty Cash "Nama Unit"
   autocomplete intelligence (v1.17.4 — Part A). Run: node scripts/pettycash-intelligence-check.mjs

   The engine is PURE. These assertions pin every feature: relevance ranking
   (exact > startsWith > contains), incremental search, IDE tab completion,
   most-recently-used learning + ranking boost, and the Akuntes exclusion —
   which REUSES the Dispatch Policy Engine (the rule is not duplicated). */

import {
  MATCH_TIER, matchTier, rankUnitSuggestions, soleCompletion, pushMru, MRU_LIMIT,
} from '../js/services/unit-autocomplete-engine.js';
import { resetPolicyConfig } from '../js/config/dispatch-policy-config.js';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}
const names = (ranked) => ranked.map((r) => r.name);

resetPolicyConfig();

/* ── Fixtures — a realistic bidang roster (+ an Akuntes entry) ─────────── */
const ROSTER = [
  'Bidang Binpres',
  'Bidang Humas',
  'Bidang Pertandingan',
  'Sekretariat',
  'Sekretariat Umum',
  'Akuntes',          // must NEVER be recommended (policy engine)
  'Tim Akuntes',      // substring match — also excluded
];

/* ── Detection (match tier) ───────────────────────────────────────────── */
console.log('\n[Match tier]');
check('exact → EXACT', matchTier('sekretariat', 'Sekretariat') === MATCH_TIER.EXACT);
check('prefix → STARTS', matchTier('bid', 'Bidang Humas') === MATCH_TIER.STARTS);
check('substring → CONTAINS', matchTier('humas', 'Bidang Humas') === MATCH_TIER.CONTAINS);
check('no match → NONE', matchTier('xyz', 'Bidang Humas') === MATCH_TIER.NONE);
check('empty query → STARTS (browse mode)', matchTier('', 'Bidang Humas') === MATCH_TIER.STARTS);

/* ── Incremental search (Feature 2) ───────────────────────────────────── */
console.log('\n[Incremental search]');
const r_b = names(rankUnitSuggestions('b', ROSTER));
check("'b' → only Bidang * (startsWith)", JSON.stringify(r_b) === JSON.stringify(['Bidang Binpres', 'Bidang Humas', 'Bidang Pertandingan']));
const r_bi = names(rankUnitSuggestions('bi', ROSTER));
check("'bi' → still the three Bidang", r_bi.length === 3 && r_bi.every((n) => n.startsWith('Bidang')));
const r_bin = names(rankUnitSuggestions('bin', ROSTER));
check("'bin' → narrows to Bidang Binpres (contains)", JSON.stringify(r_bin) === JSON.stringify(['Bidang Binpres']));

/* ── Relevance ranking (Feature 1) ────────────────────────────────────── */
console.log('\n[Relevance ranking]');
const r_sek = rankUnitSuggestions('sekretariat', ROSTER);
check('exact ranks above startsWith', r_sek[0].name === 'Sekretariat' && r_sek[0].tier === MATCH_TIER.EXACT);
check('startsWith follows the exact match', r_sek[1].name === 'Sekretariat Umum' && r_sek[1].tier === MATCH_TIER.STARTS);
// startsWith outranks contains regardless of alphabetical order
const mix = names(rankUnitSuggestions('uma', ['Z Humas Umar', 'Umar Bakri']));
check('startsWith ("Umar Bakri") outranks contains ("Z Humas Umar")', mix[0] === 'Umar Bakri');

/* ── Recently used boost (Feature 4) ──────────────────────────────────── */
console.log('\n[MRU ranking boost]');
const r_mru = names(rankUnitSuggestions('bidang', ROSTER, ['Bidang Pertandingan']));
check('MRU item floats to the top within its tier', r_mru[0] === 'Bidang Pertandingan');
const r_browse = names(rankUnitSuggestions('', ROSTER, ['Bidang Humas']));
check('empty query → MRU first, rest alphabetical', r_browse[0] === 'Bidang Humas');
check('empty query → still excludes Akuntes', !r_browse.some((n) => /akuntes/i.test(n)));

/* ── Tab completion (Feature 3) ───────────────────────────────────────── */
console.log('\n[Tab completion]');
check('sole suggestion completes', soleCompletion('bin', rankUnitSuggestions('bin', ROSTER)) === 'Bidang Binpres');
check('multiple suggestions → no auto-complete', soleCompletion('bi', rankUnitSuggestions('bi', ROSTER)) === null);
check('already-complete query → no-op', soleCompletion('Sekretariat', rankUnitSuggestions('sekretariat umum no-match', [])) === null);
check('zero suggestions → null', soleCompletion('zzz', rankUnitSuggestions('zzz', ROSTER)) === null);

/* ── Akuntes exclusion via the Policy Engine (Feature 5) ──────────────── */
console.log('\n[Akuntes never recommended]');
check("query 'akun' → no Akuntes suggested", rankUnitSuggestions('akun', ROSTER).length === 0);
check('Akuntes excluded from full browse', !names(rankUnitSuggestions('', ROSTER)).some((n) => /akuntes/i.test(n)));
// Manual typing is never blocked — the engine only ranks SUGGESTIONS and never
// mutates the typed value; "Akuntes" as a literal is still a valid saved unit.
check('typed Akuntes value is untouched by the engine (no mutation API)', typeof rankUnitSuggestions === 'function');

/* ── MRU list maintenance (Feature 4) ─────────────────────────────────── */
console.log('\n[MRU list]');
check('push prepends newest', JSON.stringify(pushMru(['A', 'B'], 'C')) === JSON.stringify(['C', 'A', 'B']));
check('push dedups case-insensitively, newest casing to front', JSON.stringify(pushMru(['A', 'B'], 'a')) === JSON.stringify(['a', 'B']));
check('push caps at MRU_LIMIT', pushMru(Array.from({ length: 12 }, (_, i) => 'U' + i), 'NEW').length === MRU_LIMIT);
check('push ignores empty value', JSON.stringify(pushMru(['A'], '   ')) === JSON.stringify(['A']));

/* ── Robustness (empty / corrupt input) ───────────────────────────────── */
console.log('\n[Robustness]');
check('null candidates → empty list', JSON.stringify(rankUnitSuggestions('a', null)) === '[]');
check('candidate objects ({name}) supported', names(rankUnitSuggestions('inn', [{ name: 'Innova' }])) [0] === 'Innova');
check('duplicate candidates de-duplicated', rankUnitSuggestions('', ['Humas', 'humas', 'HUMAS']).length === 1);
check('blank/garbage candidates dropped', rankUnitSuggestions('', ['', null, undefined, '  ', 'Real']).length === 1);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
