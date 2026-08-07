/* prediction-explainability-check.mjs — Fleet Explainability & Prediction
   Analytics (js/prediction/explainability.js, v1.19.6).
   PURE node test. This module backs the vehicle detail drawer's Explainability
   Drawer, the Fleet Heatmap, and Executive Insights — used across three
   presentation surfaces (vehicle-detail-drawer.js, vehicle-prediction-
   dashboard.js, prediction-explainability-panel.js) — but had ZERO direct test
   coverage before this file (Vehicle Core Phase 9 test-hardening audit): every
   other suite only exercised it incidentally through a different module's own
   fixtures. Drives every exported function with real certified-projection-
   shaped fixtures and asserts on actual computed values, not just "does it
   run" — including the dominant-risk selection, contribution banding/sorting,
   confidence/coverage bands, historical-trend branches, the 3-day/7-day
   urgency window, limitations composition, fleet heatmap ordering, executive
   insight selection, the WeakMap memoization guarantee, and malformed-input
   safety (this module is read directly by presentation code with no upstream
   validation layer of its own).
   Run: node scripts/prediction-explainability-check.mjs (exit 0 = pass) */

import {
  dominantRisk, contributingFactors, confidenceAnalytics, historicalComparison,
  predictionMethodology, predictionWindow, dataCoverage, limitations,
  operationalNotes, fleetHeatmap, executiveInsights, confWord, confTone,
} from '../js/prediction/explainability.js';

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };

/* A HIGH-maintenance-risk certified projection: maintenance dominates (82 >
   55 > 40), 3 signals with distinct weights/reasons, an upward utilization
   trend. */
const projHigh = {
  maintenanceRisk: {
    score: 82, level: 'HIGH', confidence: 78, confidenceLevel: 'MEDIUM', tone: 'danger', levelLabelId: 'Tinggi',
    reasons: ['Servis rem terlambat 12 hari'],
    signals: [
      { id: 'maintenance', weight: 45, reason: 'Proyeksi servis rem lewat jadwal.' },
      { id: 'operational', weight: 35, reason: 'Kesehatan operasional menurun.' },
      { id: 'age', weight: 20 }, // no reason ⇒ neutral in-range explanation
    ],
  },
  administrativeRisk: { score: 40, level: 'LOW', confidence: 90, confidenceLevel: 'HIGH', tone: 'ok', levelLabelId: 'Rendah', reasons: [], signals: [] },
  availabilityForecast: { score: 55, level: 'ELEVATED', confidence: 60, confidenceLevel: 'MEDIUM', tone: 'warn', levelLabelId: 'Waspada', reasons: [], signals: [] },
  utilizationTrend: { available: true, current: 72, previous: 60 },
};

/* A LOW-everything projection with no prior utilization snapshot. */
const projLow = {
  maintenanceRisk: { score: 10, level: 'LOW', confidence: 20, confidenceLevel: 'LOW', tone: 'ok', levelLabelId: 'Rendah', reasons: [], signals: [] },
  administrativeRisk: { score: 5, level: 'LOW', confidence: 25, confidenceLevel: 'LOW', tone: 'ok', levelLabelId: 'Rendah', reasons: [], signals: [] },
  availabilityForecast: { score: 8, level: 'LOW', confidence: 15, confidenceLevel: 'LOW', tone: 'ok', levelLabelId: 'Rendah', reasons: [], signals: [] },
  utilizationTrend: { available: false },
};

/* A "nothing to explain" projection — high confidence everywhere, no signals. */
const projPerfect = {
  maintenanceRisk: { score: 5, level: 'LOW', confidence: 95, confidenceLevel: 'HIGH', tone: 'ok', levelLabelId: 'Rendah', reasons: [], signals: [] },
  administrativeRisk: { score: 5, level: 'LOW', confidence: 95, confidenceLevel: 'HIGH', tone: 'ok', levelLabelId: 'Rendah', reasons: [], signals: [] },
  availabilityForecast: { score: 5, level: 'LOW', confidence: 95, confidenceLevel: 'HIGH', tone: 'ok', levelLabelId: 'Rendah', reasons: [], signals: [] },
};

/* ── confWord / confTone ─────────────────────────────────────────────────── */
console.log('\n[confWord / confTone]');
{
  check('HIGH ⇒ Tinggi / ok', confWord('HIGH') === 'Tinggi' && confTone('HIGH') === 'ok');
  check('MEDIUM ⇒ Sedang / info', confWord('MEDIUM') === 'Sedang' && confTone('MEDIUM') === 'info');
  check('LOW ⇒ Rendah / warn', confWord('LOW') === 'Rendah' && confTone('LOW') === 'warn');
  check('unknown level falls back to Rendah / warn (never throws)', confWord('BOGUS') === 'Rendah' && confTone(undefined) === 'warn');
}

/* ── dominantRisk ─────────────────────────────────────────────────────────── */
console.log('\n[dominantRisk]');
{
  const d = dominantRisk(projHigh);
  check('picks the highest-score risk (maintenance 82 > availability 55 > admin 40)', d.kind === 'maintenance' && d.title === 'Perawatan' && d.pred.score === 82);
  check('tie / all-equal defaults to the first kind (maintenance)', dominantRisk({
    maintenanceRisk: { score: 50 }, administrativeRisk: { score: 50 }, availabilityForecast: { score: 50 },
  }).kind === 'maintenance');
  check('null projection does not throw, defaults to maintenance/empty pred', dominantRisk(null).kind === 'maintenance' && Object.keys(dominantRisk(null).pred).length === 0);
  check('missing risk fields treated as score 0, not thrown', dominantRisk({}).pred && dominantRisk({}).kind === 'maintenance');
}

/* ── contributingFactors ─────────────────────────────────────────────────── */
console.log('\n[contributingFactors — signals from the DOMINANT risk only]');
{
  const f = contributingFactors(projHigh);
  check('exactly the 3 dominant-risk signals (not administrative/availability)', f.length === 3);
  check('sorted by contribution desc (45, 35, 20)', f[0].contribution === 45 && f[1].contribution === 35 && f[2].contribution === 20);
  check('known signal id maps to its executive label', f[0].label === 'Proyeksi Perawatan' && f[1].label === 'Kesehatan Operasional');
  check('importance band: 45 ⇒ Tinggi, 35 ⇒ Tinggi, 20 ⇒ Sedang (33/18 thresholds)', f[0].importanceKey === 'high' && f[1].importanceKey === 'high' && f[2].importanceKey === 'medium');
  check('signal WITH a reason surfaces it verbatim', f[0].explanation === 'Proyeksi servis rem lewat jadwal.');
  check('signal with NO reason gets a neutral in-range explanation mentioning its label', f[2].explanation.includes('Usia Kendaraan') && f[2].explanation.includes('normal'));
  check('every factor inherits the dominant risk tone (danger)', f.every((x) => x.tone === 'danger'));
  check('no signal evidence ⇒ empty array, not a throw', contributingFactors(projPerfect).length === 0 && Array.isArray(contributingFactors(undefined)) && contributingFactors(undefined).length === 0);
}

/* ── confidenceAnalytics ──────────────────────────────────────────────────── */
console.log('\n[confidenceAnalytics]');
{
  const ca = confidenceAnalytics(projHigh);
  check('score/level/tone read straight from the dominant risk (never recomputed)', ca.score === 78 && ca.level === 'MEDIUM' && ca.levelWord === 'Sedang' && ca.tone === 'info');
  check('coveragePct mirrors score exactly (confidence IS the coverage measure)', ca.coveragePct === ca.score);
  check('factorsUsed counts the dominant risk signals (3)', ca.factorsUsed === 3);
  check('missingFactors = 100 - score (22)', ca.missingFactors === 22);
  check('windowLabel matches predictionWindow (urgent maintenance ⇒ 3 Hari)', ca.windowLabel === '3 Hari');
}

/* ── historicalComparison ─────────────────────────────────────────────────── */
console.log('\n[historicalComparison]');
{
  const up = historicalComparison(projHigh);
  check('available trend: current/previous/delta computed correctly (72-60=12, up, ok)', up.available === true && up.current === 72 && up.previous === 60 && up.deltaPct === 12 && up.direction === 'up' && up.tone === 'ok');
  const down = historicalComparison({ utilizationTrend: { available: true, current: 40, previous: 60 } });
  check('downward trend ⇒ direction down, tone warn, -20 delta', down.direction === 'down' && down.tone === 'warn' && down.deltaPct === -20);
  const flat = historicalComparison({ utilizationTrend: { available: true, current: 50, previous: 50 } });
  check('flat trend (delta 0) ⇒ direction flat, tone info, stable message', flat.direction === 'flat' && flat.tone === 'info' && flat.message.includes('stabil'));
  const none = historicalComparison(projLow);
  check('no previous snapshot ⇒ available:false, never fabricates a prior value', none.available === false && none.previous === null && none.deltaPct === null);
}

/* ── predictionMethodology (static) ──────────────────────────────────────── */
console.log('\n[predictionMethodology]');
{
  const m = predictionMethodology();
  check('returns a stable, non-empty methods list with no signal/weight leakage', Array.isArray(m.methods) && m.methods.length === 4 && !JSON.stringify(m).match(/weight|threshold/i));
}

/* ── predictionWindow ─────────────────────────────────────────────────────── */
console.log('\n[predictionWindow]');
{
  check('HIGH maintenance risk ⇒ urgent 3-day window', predictionWindow(projHigh).days === 3 && predictionWindow(projHigh).label === '3 Hari');
  check('non-maintenance-dominant or non-HIGH/CRITICAL ⇒ standard 7-day window', predictionWindow(projLow).days === 7);
  const critAdmin = { maintenanceRisk: { score: 10 }, administrativeRisk: { score: 90, level: 'CRITICAL' }, availabilityForecast: { score: 5 } };
  check('CRITICAL but administrative (not maintenance) ⇒ still 7-day (urgency is maintenance-specific)', predictionWindow(critAdmin).days === 7);
}

/* ── dataCoverage ─────────────────────────────────────────────────────────── */
console.log('\n[dataCoverage — 70/40 word bands]');
{
  check('coverage 78 ⇒ Baik / ok (>=70)', dataCoverage(projHigh).coverageWord === 'Baik' && dataCoverage(projHigh).coverageTone === 'ok');
  const mid = { maintenanceRisk: { score: 1, confidence: 50, confidenceLevel: 'MEDIUM', signals: [] }, administrativeRisk: {}, availabilityForecast: {} };
  check('coverage 50 ⇒ Cukup / warn (40<=x<70)', dataCoverage(mid).coverageWord === 'Cukup' && dataCoverage(mid).coverageTone === 'warn');
  check('coverage 20 ⇒ Terbatas / danger (<40)', dataCoverage(projLow).coverageWord === 'Terbatas' && dataCoverage(projLow).coverageTone === 'danger');
}

/* ── limitations ──────────────────────────────────────────────────────────── */
console.log('\n[limitations — composed from confidence level + coverage]');
{
  check('MEDIUM confidence, coverage>=60 ⇒ exactly one MEDIUM-confidence caveat', limitations(projHigh).length === 1 && limitations(projHigh)[0].includes('sedang'));
  const lo = limitations(projLow);
  check('LOW confidence + coverage<60 ⇒ BOTH caveats present', lo.length === 2 && lo[0].includes('berkembang') && lo[1].includes('lengkap'));
  check('high confidence + high coverage ⇒ the single positive "no limitations" message', limitations(projPerfect).length === 1 && limitations(projPerfect)[0].includes('Tidak ada keterbatasan'));
}

/* ── operationalNotes ─────────────────────────────────────────────────────── */
console.log('\n[operationalNotes]');
{
  const noMsg = operationalNotes(projHigh);
  check('HIGH risk, no recommendation supplied ⇒ generic action note + the risk\'s own reason', noMsg[0].includes('Direkomendasikan') && noMsg[1] === 'Servis rem terlambat 12 hari');
  const withMsg = operationalNotes(projHigh, 'Jadwalkan servis segera.');
  check('HIGH risk WITH a recommendation message ⇒ uses it verbatim as the first note', withMsg[0] === 'Jadwalkan servis segera.');
  const elevated = { maintenanceRisk: { score: 1 }, administrativeRisk: { score: 1 }, availabilityForecast: { score: 60, level: 'ELEVATED' } };
  check('ELEVATED (not HIGH/CRITICAL) ⇒ the "monitor" note, not the action note', operationalNotes(elevated)[0].includes('Pantau'));
  check('LOW risk ⇒ the routine-monitoring note', operationalNotes(projLow)[0].includes('Tidak ada tindakan mendesak'));
  const noReason = { maintenanceRisk: { score: 90, level: 'CRITICAL', reasons: [] }, administrativeRisk: {}, availabilityForecast: {} };
  check('no reasons on the dominant risk ⇒ single note, no undefined appended', operationalNotes(noReason).length === 1);
}

/* ── fleetHeatmap ─────────────────────────────────────────────────────────── */
console.log('\n[fleetHeatmap]');
{
  const model = {
    vehicles: [
      { id: 'v1', name: 'Alpha', ...projHigh },
      { id: 'v2', name: 'Beta', ...projLow },
      { id: 'v3', name: 'Charlie', ...projPerfect },
    ],
  };
  const hm = fleetHeatmap(model);
  check('one cell per vehicle', hm.length === 3);
  check('HIGH-risk vehicle ⇒ danger tone, Kritis, first (most-concerning-first ordering)', hm[0].id === 'v1' && hm[0].tone === 'danger' && hm[0].statusWord === 'Kritis');
  check('LOW-risk vehicles ⇒ ok tone, Aman, tie-broken alphabetically by name (Beta before Charlie)', hm[1].name === 'Beta' && hm[2].name === 'Charlie' && hm[1].tone === 'ok' && hm[2].tone === 'ok');
  check('headline mentions the dominant risk title for the critical vehicle', hm[0].headline.toLowerCase().includes('perawatan'));
  check('empty/null model ⇒ empty array, never throws', fleetHeatmap(null).length === 0 && fleetHeatmap({}).length === 0);
}

/* ── executiveInsights ────────────────────────────────────────────────────── */
console.log('\n[executiveInsights — fleet-wide selection, no new business logic]');
{
  const model = {
    vehicles: [
      { id: 'v1', name: 'Alpha', ...projHigh },
      { id: 'v2', name: 'Beta', ...projLow },
      { id: 'v3', name: 'Charlie', ...projPerfect },
    ],
  };
  const insights = executiveInsights(model);
  const byKey = Object.fromEntries(insights.map((i) => [i.key, i]));
  check('highestConfidence ⇒ Charlie (95%, the highest confidenceAnalytics score in the fleet)', byKey.highestConfidence && byKey.highestConfidence.subject === 'Charlie' && byKey.highestConfidence.value === '95%');
  check('lowestConfidence ⇒ Beta (20%), distinct vehicle from the highest', byKey.lowestConfidence && byKey.lowestConfidence.subject === 'Beta');
  check('mostInfluentialFactor ⇒ the single highest-contribution signal fleet-wide (45%, Alpha)', byKey.mostInfluentialFactor && byKey.mostInfluentialFactor.value === '45%' && byKey.mostInfluentialFactor.detail.includes('Alpha'));
  check('highestOperationalRisk ⇒ Alpha (HIGH), only surfaced because it clears the HIGH/CRITICAL/ELEVATED gate', byKey.highestOperationalRisk && byKey.highestOperationalRisk.subject === 'Alpha');
  check('a fleet with only LOW risk everywhere omits highestOperationalRisk entirely (no gate-bypass)',
    !Object.fromEntries(executiveInsights({ vehicles: [{ id: 'x', name: 'X', ...projLow }] }).map((i) => [i.key, i])).highestOperationalRisk);
  check('single-vehicle fleet: highConf === lowConf ⇒ lowestConfidence is NOT duplicated',
    executiveInsights({ vehicles: [{ id: 'x', name: 'X', ...projHigh }] }).filter((i) => i.key === 'lowestConfidence').length === 0);
  check('empty fleet ⇒ empty array, never throws', executiveInsights({ vehicles: [] }).length === 0 && executiveInsights(null).length === 0);
}

/* ── Memoization contract (the file's own documented guarantee) ─────────── */
console.log('\n[Memoization — same frozen projection reference ⇒ same derived reference]');
{
  check('contributingFactors returns the SAME array reference for the same projection object', contributingFactors(projHigh) === contributingFactors(projHigh));
  check('confidenceAnalytics returns the SAME object reference for the same projection object', confidenceAnalytics(projHigh) === confidenceAnalytics(projHigh));
  check('a DIFFERENT (structurally-equal) projection object is NOT cache-confused with the first', contributingFactors(projHigh) !== contributingFactors({ ...projHigh }));
  // Non-object inputs bypass the WeakMap by design (would throw as a key otherwise) — must still work.
  check('non-object input bypasses the cache safely (no throw)', Array.isArray(contributingFactors('not-an-object')));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
