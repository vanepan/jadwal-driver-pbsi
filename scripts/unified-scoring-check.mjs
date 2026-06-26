/* unified-scoring-check.mjs — validates the Unified Scoring System (v1.17.3).
   Run: node scripts/unified-scoring-check.mjs   (exit 0 = pass)

   The platform-wide invariant: higher score = better, 100 = best, 0 = worst, no
   exceptions. These assertions pin the band scale, labels, color semantics, the
   normalize/invert helpers, the normalized capacity (driver + vehicle) score,
   the reused confidence mapping (no second scale), empty + corrupt inputs, and a
   regression that no band/color interpretation is inverted. */

import {
  clampScore,
  normalizeScore,
  invertScore,
  SCORE_BANDS,
  scoreBand,
  scoreBandInfo,
  scoreLabel,
  scoreLabelId,
  scoreColor,
  scoreColorVar,
  capacityScore,
  confidenceFromScore,
} from '../js/services/unified-scoring.js';
import { confidenceFromScore as presentationConfidence } from '../js/services/dispatch-presentation.js';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

/* ── clamp / normalize / invert ───────────────────────────────────────── */
console.log('\n[clamp / normalize / invert]');
check('clampScore clamps high', clampScore(150) === 100);
check('clampScore clamps low', clampScore(-20) === 0);
check('clampScore rounds', clampScore(72.6) === 73);
check('normalizeScore maps range', normalizeScore(5, { min: 0, max: 10 }) === 50);
check('normalizeScore clamps out-of-range', normalizeScore(20, { min: 0, max: 10 }) === 100);
check('normalizeScore invert flag', normalizeScore(2, { min: 0, max: 10, invert: true }) === 80);
check('normalizeScore degenerate range → 0', normalizeScore(5, { min: 10, max: 10 }) === 0);
check('invertScore 0 → 100', invertScore(0) === 100);
check('invertScore 100 → 0', invertScore(100) === 0);
check('invertScore 30 → 70', invertScore(30) === 70);
check('invert is symmetric', invertScore(invertScore(42)) === 42);

/* ── Feature 1 — band scale + labels ──────────────────────────────────── */
console.log('\n[Feature 1 — band scale]');
check('8 bands defined', SCORE_BANDS.length === 8);
check('100 → excellent', scoreBand(100) === 'excellent' && scoreLabel(100) === 'Excellent');
check('95 → very-good', scoreBand(95) === 'very-good' && scoreLabel(95) === 'Very Good');
check('85 → good', scoreBand(85) === 'good' && scoreLabel(85) === 'Good');
check('75 → fair', scoreBand(75) === 'fair' && scoreLabel(75) === 'Fair');
check('65 → average', scoreBand(65) === 'average' && scoreLabel(65) === 'Average');
check('50 → poor', scoreBand(50) === 'poor' && scoreLabel(50) === 'Poor');
check('30 → bad', scoreBand(30) === 'bad' && scoreLabel(30) === 'Bad');
check('10 → critical', scoreBand(10) === 'critical' && scoreLabel(10) === 'Critical');
check('0 → critical', scoreBand(0) === 'critical');
check('id labels present', scoreLabelId(95) === 'Sangat Baik' && scoreLabelId(0) === 'Kritis');
check('bandInfo never null for garbage', scoreBandInfo('xyz').key === 'critical');
// Monotonic: a higher score is never a worse band index.
let monotonicBand = true;
for (let s = 0; s < 100; s++) {
  const hi = SCORE_BANDS.findIndex((b) => b.key === scoreBand(s + 1));
  const lo = SCORE_BANDS.findIndex((b) => b.key === scoreBand(s));
  if (hi > lo) { monotonicBand = false; break; } // higher score must have ≤ index (better band)
}
check('band is monotonic (higher score → better-or-equal band)', monotonicBand);

/* ── Feature 7 — color semantics ──────────────────────────────────────── */
console.log('\n[Feature 7 — color semantics]');
check('95 → ok (green)', scoreColor(95) === 'ok');
check('90 → ok (green) inclusive', scoreColor(90) === 'ok');
check('80 → info (blue)', scoreColor(80) === 'info');
check('70 → info (blue) inclusive', scoreColor(70) === 'info');
check('60 → warn (orange)', scoreColor(60) === 'warn');
check('50 → warn (orange) inclusive', scoreColor(50) === 'warn');
check('40 → danger (red)', scoreColor(40) === 'danger');
check('0 → danger (red)', scoreColor(0) === 'danger');
check('scoreColorVar uses design token', scoreColorVar(95) === 'var(--ok)' && scoreColorVar(10) === 'var(--danger)');
// Monotonic: a higher score is never a worse color.
const toneRank = { danger: 0, warn: 1, info: 2, ok: 3 };
let monotonicColor = true;
for (let s = 0; s < 100; s++) {
  if (toneRank[scoreColor(s + 1)] < toneRank[scoreColor(s)]) { monotonicColor = false; break; }
}
check('color is monotonic (higher score → better-or-equal color)', monotonicColor);

/* ── Feature 2 / 3 — capacity normalization ───────────────────────────── */
console.log('\n[Feature 2/3 — capacity score]');
check('idle (0% util) → 100 (best)', capacityScore(0) === 100);
check('balanced (10% util) → 90', capacityScore(10) === 90);
check('busy (30% util) → 70', capacityScore(30) === 70);
check('near overload (70% util) → 30', capacityScore(70) === 30);
check('overloaded (100% util) → 0 (worst)', capacityScore(100) === 0);
check('capacity score higher = better (anti-inversion)', capacityScore(20) > capacityScore(80));
check('driver + vehicle share one capacity fn (no dup)', capacityScore(45) === invertScore(45));

/* ── Feature 8 — confidence mapping (reused, not re-implemented) ───────── */
console.log('\n[Feature 8 — confidence mapping]');
check('confidenceFromScore is the SAME function as presentation', confidenceFromScore === presentationConfidence);
check('95 → 5 stars Sangat Tinggi', confidenceFromScore(95).stars === 5);
check('60 → 2 stars Perlu Review', confidenceFromScore(60).stars === 2);
check('confidence higher score → ≥ stars (no inversion)', confidenceFromScore(90).stars >= confidenceFromScore(70).stars);

/* ── Feature 9 — historical compatibility (interpretation only) ───────── */
console.log('\n[Feature 9 — historical compatibility]');
check('legacy float score interpreted, not mutated', scoreLabel(82.4) === 'Good' && scoreBand(82.4) === 'good');
check('legacy out-of-range score clamped safely', scoreColor(140) === 'ok' && scoreLabel(140) === 'Excellent');

/* ── Empty / corrupt inputs ───────────────────────────────────────────── */
console.log('\n[Empty / corrupt inputs]');
check('null score safe', scoreBand(null) === 'critical' && scoreColor(null) === 'danger' && capacityScore(null) === 100);
check('undefined score safe', scoreLabel(undefined) === 'Critical');
check('string score safe', scoreColor('abc') === 'danger');
check('NaN score safe', clampScore(NaN) === 0);
check('normalizeScore no-args safe', normalizeScore() === 0);

/* ── Summary ──────────────────────────────────────────────────────────── */
console.log(`\n${'─'.repeat(48)}`);
console.log(`Unified Scoring: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
