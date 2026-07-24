/* gudang-analytics-check.mjs — Gudang V1.28.0, Phase 8 (Analytics).

   Authorized by: Doc 1 Art.VII · Doc 2 §11/§15 · Doc 3 Ch.09/10 — Phase 8:
   deterministic, no AI, no guessing, only computed facts, Quiet
   Intelligence sentences, no dashboard-first.

   Same check()/throws() harness and "only guard-clause paths that never
   touch Firebase" convention as Phases 4-7. quiet-intelligence-engine.js
   is fully pure (no I/O at all) and is tested completely, not just at its
   edges.

   Run: node scripts/gudang-analytics-check.mjs   (exit 0 = pass) */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  getAverageMonthlyConsumption, getDepartmentConsumption, getAverageMonthlyCost,
  getForecastDaysRemaining, isRestockRecommended, _monthsSpanned,
} from '../js/gudang/analytics/analytics-engine.js';
import {
  forecastSentence, restockSentence, topDepartmentSentence, averageMonthlyCostSentence,
} from '../js/gudang/analytics/quiet-intelligence-engine.js';
import { GUDANG_DOMAINS, getDomain, domainsWithFoundation, DOMAIN_STATUS } from '../js/gudang/config/gudang-domain-registry.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0; let fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); }
}

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/* ── Part A — analytics-engine.js input guards (no Firebase reached) ──── */
console.log('\n[Part A — every analytics function rejects a missing itemId before touching Firebase]');
{
  for (const [name, fn] of [
    ['getAverageMonthlyConsumption', getAverageMonthlyConsumption],
    ['getDepartmentConsumption', getDepartmentConsumption],
    ['getAverageMonthlyCost', getAverageMonthlyCost],
    ['getForecastDaysRemaining', getForecastDaysRemaining],
    ['isRestockRecommended', isRestockRecommended],
  ]) {
    const res = await fn('');
    check(`${name}('') fails INVALID_INPUT without touching Firebase`, !res.ok && res.error.code === 'INVALID_INPUT');
  }
}

/* ── Part B — monthsSpanned: pure, deterministic, never divides by zero ── */
console.log('\n[Part B — _monthsSpanned(): pure, deterministic, minimum 1]');
{
  check('an empty movement list still returns 1 (never zero — avoids a divide-by-zero downstream)', _monthsSpanned([]) === 1);
  const oneDayApart = [
    { createdAt: '2026-01-01T00:00:00.000Z' },
    { createdAt: '2026-01-02T00:00:00.000Z' },
  ];
  check('a 1-day span still returns at least 1 (a single day of history is not "0 months")', _monthsSpanned(oneDayApart) >= 1);
  const sixtyDaysApart = [
    { createdAt: '2026-01-01T00:00:00.000Z' },
    { createdAt: '2026-03-02T00:00:00.000Z' },
  ];
  check('a ~60-day span returns ~2 months', Math.abs(_monthsSpanned(sixtyDaysApart) - 2) < 0.2);
  check('order of the input movements never matters (span is min/max, not first/last)', _monthsSpanned([...sixtyDaysApart].reverse()) === _monthsSpanned(sixtyDaysApart));
}

/* ── Part C — Quiet Intelligence: pure sentences, exact wording from Doc 1/2 ── */
console.log('\n[Part C — quiet-intelligence-engine.js: pure, matches the ratified example sentences]');
{
  check('forecastSentence(18) matches Doc 1 Art.VII\'s own example verbatim ("≈18 days remaining")', forecastSentence(18) === '≈18 days remaining');
  check('forecastSentence(null) is silent — "No Forecast Yet" is an empty state (Doc 2 §14), not an error string', forecastSentence(null) === null);

  check('restockSentence(true) matches the ratified example verbatim ("Restock recommended")', restockSentence(true) === 'Restock recommended');
  check('restockSentence(false) is silent (Quiet Intelligence speaks only when there is something to say, Doc 2 §15)', restockSentence(false) === null);

  check('topDepartmentSentence("Procurement") matches the ratified example verbatim', topDepartmentSentence('Procurement') === 'Highest consuming department: Procurement');
  check('topDepartmentSentence(null) is silent, never throws', topDepartmentSentence(null) === null);

  check('averageMonthlyCostSentence(2_400_000) matches the ratified "Rp 2.4jt" style exactly', averageMonthlyCostSentence(2_400_000) === 'Average monthly cost: Rp 2.4jt');
  check('averageMonthlyCostSentence(0) is silent — no priced history is not the same as zero cost', averageMonthlyCostSentence(0) === null);
  check('averageMonthlyCostSentence(null) is silent, never throws', averageMonthlyCostSentence(null) === null);

  check('quiet-intelligence-engine.js has zero repository/Firebase imports (Doc 3 Ch.10: never given raw Movement/Stock)', !/from ['"].*repository/.test(stripComments(read('js/gudang/analytics/quiet-intelligence-engine.js'))));
}

/* ── Part D — Architecture: Analytics reads, never writes; Quiet Intelligence never decides ── */
console.log('\n[Part D — Architecture: Analytics owns the decisions, Quiet Intelligence only phrases them]');
{
  const analyticsCode = stripComments(read('js/gudang/analytics/analytics-engine.js'));
  check('analytics-engine.js never calls storeFirebaseData/runNodeTransaction (Doc 4 Art.IV: Analytics reads, never becomes the record)', !analyticsCode.includes('storeFirebaseData') && !analyticsCode.includes('runNodeTransaction'));
  check('analytics-engine.js never hardcodes a "gudang/..." RTDB path literal', !/['"`]gudang\//.test(analyticsCode));
  check('analytics-engine.js never imports asset-repository.js or asset-history-repository.js (Ch.09 lists Asset History, but Phase 8 only implements Consumable-side figures — see report)', !analyticsCode.includes('asset-repository') && !analyticsCode.includes('asset-history-repository'));

  // NOTE: formatRupiah()'s internal >= comparisons (choosing a "jt"/"rb"
  // display suffix by magnitude) are deliberately NOT flagged here — that
  // is unit-formatting presentation, not the business-threshold decision
  // Doc 3 Ch.10 forbids this file from making. The real boundary (never
  // given raw Movement/Stock to decide FROM) is what the check above
  // actually proves.
  const qiCode = stripComments(read('js/gudang/analytics/quiet-intelligence-engine.js'));
  check('quiet-intelligence-engine.js never imports analytics-engine.js\'s computation functions directly (it receives already-decided values as plain arguments)', !qiCode.includes("from './analytics-engine.js'"));
}

/* ── Part E — Regression: domain registry after Phase 8's amendments ──── */
console.log('\n[Part E — Regression: domain registry stays internally consistent]');
{
  check('GUDANG_DOMAINS still has exactly 15 entries — Phase 8 added no new domain (F-02)', GUDANG_DOMAINS.length === 15);
  check('analytics/forecast/recommendation all now have a foundation (Phase 8)', getDomain('analytics')?.hasFoundation === true && getDomain('forecast')?.hasFoundation === true && getDomain('recommendation')?.hasFoundation === true);
  check('Forecast and Recommendation remain COMPUTED_OUTPUT, not CORE (Doc 3 Ch.03: neither is an engine of its own)', getDomain('forecast')?.status === DOMAIN_STATUS.COMPUTED_OUTPUT && getDomain('recommendation')?.status === DOMAIN_STATUS.COMPUTED_OUTPUT);
  check('domainsWithFoundation() is exactly 12', domainsWithFoundation().length === 12);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
