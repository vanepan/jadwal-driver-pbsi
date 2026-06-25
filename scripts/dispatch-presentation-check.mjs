/* dispatch-presentation-check.mjs — validates the Auto Assignment Assistant
   presentation helpers (v1.16.4.12). Run: node scripts/dispatch-presentation-check.mjs
   (exit 0 = all pass)

   These helpers add NO scoring — they only re-express the engine's own values.
   The key invariants under test: confidence banding matches the spec, the score
   breakdown ALWAYS totals to the dispatch score, the explanation is derived from
   the engine booleans (never generated), and the AI↔Admin comparison flags only
   real changes. */

import {
  CONFIDENCE_BANDS,
  confidenceFromScore,
  buildScoreBreakdown,
  buildSubScoreRows,
  buildExplanation,
  buildComparison,
  buildTimeline,
} from '../js/services/dispatch-presentation.js';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

/* ── Confidence banding ──────────────────────────────────────────────── */
console.log('\n[confidence]');
check('bands defined (5/4/3/2 thresholds 95/85/70/0)',
  CONFIDENCE_BANDS.length === 4 && CONFIDENCE_BANDS[0].min === 95 && CONFIDENCE_BANDS[3].min === 0);
check('100 → 5★ Sangat Tinggi', (() => { const c = confidenceFromScore(100); return c.stars === 5 && c.label === 'Sangat Tinggi' && c.glyph === '★★★★★'; })());
check('95 → 5★ (inclusive)', confidenceFromScore(95).stars === 5);
check('94 → 4★ Tinggi', (() => { const c = confidenceFromScore(94); return c.stars === 4 && c.label === 'Tinggi' && c.glyph === '★★★★☆'; })());
check('85 → 4★ (inclusive)', confidenceFromScore(85).stars === 4);
check('84 → 3★ Sedang', (() => { const c = confidenceFromScore(84); return c.stars === 3 && c.label === 'Sedang' && c.glyph === '★★★☆☆'; })());
check('70 → 3★ (inclusive)', confidenceFromScore(70).stars === 3);
check('69 → 2★ Perlu Review', (() => { const c = confidenceFromScore(69); return c.stars === 2 && c.label === 'Perlu Review' && c.glyph === '★★☆☆☆'; })());
check('0 → 2★ Perlu Review', confidenceFromScore(0).stars === 2);
check('out-of-range clamps (120 → 5★, score 100)', (() => { const c = confidenceFromScore(120); return c.stars === 5 && c.score === 100; })());
check('non-numeric → 2★ (safe)', confidenceFromScore('abc').stars === 2);

/* ── Score breakdown totals correctly ────────────────────────────────── */
console.log('\n[score breakdown]');
const bd = buildScoreBreakdown({ driverScore: 90, vehicleScore: 100, dispatchScore: 94 }, { driver: 60, vehicle: 40 });
check('two rows: Driver + Kendaraan', bd.rows.length === 2 && bd.rows[0].label === 'Driver' && bd.rows[1].label === 'Kendaraan');
check('rows carry the engine sub-scores', bd.rows[0].score === 90 && bd.rows[1].score === 100);
check('weight % derived from weights (60/40)', bd.rows[0].weightPct === 60 && bd.rows[1].weightPct === 40);
check('points SUM EXACTLY to total (driver+vehicle = dispatchScore)',
  bd.rows[0].points + bd.rows[1].points === bd.total && bd.total === 94);
// Fuzz: for many weight/score combos the points must always total the score.
let totalsOk = true;
for (let ds = 0; ds <= 100; ds += 7) {
  for (let vs = 0; vs <= 100; vs += 11) {
    for (const [wd, wv] of [[60, 40], [50, 50], [70, 30], [1, 99], [100, 0]]) {
      const total = Math.round((ds * wd + vs * wv) / (wd + wv));
      const b = buildScoreBreakdown({ driverScore: ds, vehicleScore: vs, dispatchScore: total }, { driver: wd, vehicle: wv });
      if (b.rows[0].points + b.rows[1].points !== b.total) { totalsOk = false; }
    }
  }
}
check('breakdown ALWAYS totals exactly across fuzz (scores × weights)', totalsOk);
check('zero weights → safe 50/50 split that still totals', (() => {
  const b = buildScoreBreakdown({ driverScore: 80, vehicleScore: 60, dispatchScore: 70 }, { driver: 0, vehicle: 0 });
  return b.rows[0].points + b.rows[1].points === b.total;
})());

/* ── Sub-score rows (relabel engine breakdowns, no recompute) ─────────── */
console.log('\n[sub-score rows]');
const sub = buildSubScoreRows(
  { breakdown: { availability: 100, workload: 80, recency: 60, priority: 100 } },
  { breakdown: { availability: 100, capacityFit: 90, utilization: 80, health: 100 } },
);
check('driver sub-rows = availability/workload/recency/priority values',
  sub.driver.length === 4 && sub.driver[0].score === 100 && sub.driver[1].score === 80 && sub.driver[2].score === 60);
check('vehicle sub-rows = availability/capacityFit/utilization/health values',
  sub.vehicle.length === 4 && sub.vehicle[1].label === 'Kesesuaian Kapasitas' && sub.vehicle[1].score === 90);

/* ── Explanation (derived from engine booleans, never generated) ──────── */
console.log('\n[explanation]');
const good = buildExplanation(
  { available: true, conflict: false, status: 'NORMAL' },
  { available: true, overCapacity: false },
);
check('all-good → 5 items all ok', good.length === 5 && good.every((i) => i.ok));
check('good explanation mentions ketersediaan + kapasitas',
  good.some((i) => /tersedia/i.test(i.text)) && good.some((i) => /Kapasitas sesuai/i.test(i.text)));
const bad = buildExplanation(
  { available: false, conflict: true, status: 'OVERLOADED' },
  { available: true, overCapacity: true },
);
check('conflict driver → not-ok item', bad.find((i) => /konflik/i.test(i.text)).ok === false);
check('over-capacity vehicle → "Kapasitas kurang" not-ok', bad.find((i) => /Kapasitas kurang/i.test(i.text)).ok === false);
check('overloaded driver → beban kerja flagged not-ok', bad.find((i) => /Beban kerja/i.test(i.text)).ok === false);

/* ── Comparison (flags only real overrides) ──────────────────────────── */
console.log('\n[comparison]');
const same = buildComparison({ driver: 'Aria', vehicle: 'Innova' }, { driver: 'Aria', vehicle: 'Innova' });
check('selection = recommendation → no change', !same.anyChange && !same.driver.changed && !same.vehicle.changed);
const diffDriver = buildComparison({ driver: 'Aria', vehicle: 'Innova' }, { driver: 'Budi', vehicle: 'Innova' });
check('driver changed → driver.changed true, vehicle false', diffDriver.driver.changed && !diffDriver.vehicle.changed && diffDriver.anyChange);
check('comparison carries ai + admin names', diffDriver.driver.ai === 'Aria' && diffDriver.driver.admin === 'Budi');
const both = buildComparison({ driver: 'Aria', vehicle: 'Innova' }, { driver: 'Budi', vehicle: 'Hiace' });
check('both changed → both flagged', both.driver.changed && both.vehicle.changed);
check('case/space-insensitive (no false override)', !buildComparison({ driver: 'Aria' }, { driver: ' aria ' }).driver.changed);
check('empty selection → not an override (undecided)', !buildComparison({ driver: 'Aria', vehicle: 'Innova' }, { driver: '', vehicle: '' }).anyChange);

/* ── Timeline (reuses existing timestamps) ───────────────────────────── */
console.log('\n[timeline]');
const tl = buildTimeline({ createdAt: '2026-06-25T09:20:00', generatedAt: '2026-06-25T09:20:30', overridden: true });
check('pending timeline: created → generated → override → menunggu',
  tl.length === 4 && tl[0].key === 'created' && tl[1].key === 'generated' && tl[2].key === 'override' && tl[3].key === 'pending' && tl[3].done === false);
check('timeline formats HH:MM from ISO', tl[0].time === '09:20');
const tlApproved = buildTimeline({ createdAt: '2026-06-25T09:20:00', generatedAt: '2026-06-25T09:20:30', approvedAt: '2026-06-25T09:24:00' });
check('approved timeline ends with Disetujui (done)', tlApproved[tlApproved.length - 1].key === 'approved' && tlApproved[tlApproved.length - 1].done === true);
check('no override → no override row', !tlApproved.some((e) => e.key === 'override'));

/* ── Summary ─────────────────────────────────────────────────────────── */
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
