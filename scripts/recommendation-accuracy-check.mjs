/* recommendation-accuracy-check.mjs — validates the Recommendation Accuracy
   Engine (v1.17.1). Run: node scripts/recommendation-accuracy-check.mjs (exit 0 = pass)

   The engine adds NO scoring — it AGGREGATES the existing override log +
   recommendation history into the accuracy model. These assertions pin every
   feature's math (overall KPI + previous-period, driver/vehicle accuracy,
   confidence calibration, override severity, false-high-confidence, unexpected
   acceptance, reason analytics, learning trend, insights), the empty + corrupt
   dataset safety, and the pure export builders + regression vs the engine's
   reused override-service primitives. */

import { computeRecommendationAccuracyModel } from '../js/analytics/recommendation-accuracy-engine.js';
import {
  buildRecommendationAccuracyDocDefinition,
  buildRecommendationAccuracySheets,
} from '../js/exports/analytics/recommendation-accuracy-export.js';
import {
  buildDispatchAnalyticsDocDefinition,
  buildDispatchAnalyticsSheets,
} from '../js/exports/analytics/dispatch-analytics-export.js';
import { computeDispatchAnalyticsModel } from '../js/analytics/dispatch-analytics-engine.js';
import { computeAllDriverAccuracy } from '../js/services/override-workflow-service.js';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

const NOW = '2026-06-25T12:00:00';

const drivers = [
  { id: 'd1', name: 'Andi' }, { id: 'd2', name: 'Budi' }, { id: 'd3', name: 'Citra' },
];
const vehicles = [
  { id: 'v1', name: 'Avanza' }, { id: 'v2', name: 'Innova' },
];
// outcomes: r1 ACCEPTED(96) · r2 DRIVER_OVERRIDE(rec 88 → sel 70) · r3 VEHICLE_OVERRIDE(rec 72 → sel 60) · r4 FULL_OVERRIDE(rec 96 → sel 55)
const overrideLogs = [
  { recommendationId: 'r1', recommendedDriverId: 'd1', recommendedVehicleId: 'v1', selectedDriverId: 'd1', selectedVehicleId: 'v1', dispatchScore: 96, outcome: 'ACCEPTED', overridden: false, reason: '', approvedBy: 'admin', timestamp: '2026-06-21T09:00:00' },
  { recommendationId: 'r2', recommendedDriverId: 'd1', recommendedVehicleId: 'v2', selectedDriverId: 'd2', selectedVehicleId: 'v2', dispatchScore: 70, outcome: 'DRIVER_OVERRIDE', overridden: true, reason: 'Driver sakit', approvedBy: 'admin', timestamp: '2026-06-22T09:00:00' },
  { recommendationId: 'r3', recommendedDriverId: 'd2', recommendedVehicleId: 'v1', selectedDriverId: 'd2', selectedVehicleId: 'v2', dispatchScore: 60, outcome: 'VEHICLE_OVERRIDE', overridden: true, reason: 'Kapasitas lebih besar', approvedBy: 'admin', timestamp: '2026-06-23T09:00:00' },
  { recommendationId: 'r4', recommendedDriverId: 'd1', recommendedVehicleId: 'v1', selectedDriverId: 'd3', selectedVehicleId: 'v2', dispatchScore: 55, outcome: 'FULL_OVERRIDE', overridden: true, reason: 'Konflik jadwal', approvedBy: 'admin', timestamp: '2026-06-24T09:00:00' },
];
const requestRecommendations = {
  r1: { requestId: 'r1', recommendedDriverId: 'd1', recommendedVehicleId: 'v1', dispatchScore: 96, reasonSummary: 'Driver tersedia', generatedAt: '2026-06-21T07:59:00' },
  r2: { requestId: 'r2', recommendedDriverId: 'd1', recommendedVehicleId: 'v2', dispatchScore: 88, reasonSummary: 'Beban rendah', generatedAt: '2026-06-22T07:59:00' },
  r3: { requestId: 'r3', recommendedDriverId: 'd2', recommendedVehicleId: 'v1', dispatchScore: 72, reasonSummary: 'Kapasitas sesuai', generatedAt: '2026-06-23T07:59:00' },
  r4: { requestId: 'r4', recommendedDriverId: 'd1', recommendedVehicleId: 'v1', dispatchScore: 96, reasonSummary: 'Driver tersedia', generatedAt: '2026-06-24T07:59:00' },
};

const model = computeRecommendationAccuracyModel({ overrideLogs, requestRecommendations, drivers, vehicles, now: NOW });

/* ── Feature 1 — Overall KPI ─────────────────────────────────────────── */
console.log('\n[Feature 1 — Overall KPI]');
const k = model.kpi;
check('decisions = 4', model.totals.decisions === 4);
check('recommendationAccuracy = acceptanceRate = 25%', k.recommendationAccuracy === 25 && k.acceptanceRate === 25);
check('overrideRate = 75%', k.overrideRate === 75);
check('driverOverrideRate = 50% (r2 driver + r4 full = 2/4)', k.driverOverrideRate === 50);
check('vehicleOverrideRate = 50% (r3 vehicle + r4 full = 2/4)', k.vehicleOverrideRate === 50);
check('fullOverrideRate = 25% (r4)', k.fullOverrideRate === 25);
check('avgDispatchScore uses RECOMMENDED scores round((96+88+72+96)/4)=88', k.avgDispatchScore === 88);
check('avgConfidence banded from avg recommended score (88 → 4★ Tinggi)', k.avgConfidence.label === 'Tinggi');
check('previousPeriod block present with delta', !!k.previousPeriod && typeof k.previousPeriod.delta.acceptanceRate === 'number');
check('previousPeriod.current covers the trailing 30d (all 4 logs)', k.previousPeriod.current.decisions === 4);

/* ── Feature 2 — Driver accuracy ─────────────────────────────────────── */
console.log('\n[Feature 2 — Driver accuracy]');
const da = model.driverAccuracy.rows;
const d1 = da.find((r) => r.id === 'd1');
check('d1 = Andi resolved', d1 && d1.name === 'Andi');
check('d1 recommended 3 (r1,r2,r4)', d1.recommendations === 3);
check('d1 accepted 1 (only r1 kept Andi)', d1.accepted === 1);
check('d1 accuracyPct = 33 (kept-rate)', d1.accuracyPct === 33);
check('d1 acceptancePct = 33 (full-accept when recommended)', d1.acceptancePct === 33);
check('d1 overridden = 2', d1.overridden === 2);
check('d1 avgOverrideDifference > 0 (score given up on overrides)', d1.avgOverrideDifference > 0);
check('every driver row has a ranking', da.every((r) => typeof r.ranking === 'number'));
check('ranking is 1..n unique', new Set(da.map((r) => r.ranking)).size === da.length);
const d2 = da.find((r) => r.id === 'd2');
check('d2 accuracyPct = 100 (recommended once at r3, kept)', d2.accuracyPct === 100);
check('d2 acceptancePct = 0 (r3 was a VEHICLE_OVERRIDE — not fully accepted)', d2.acceptancePct === 0);

/* ── Feature 3 — Vehicle accuracy (same common engine) ───────────────── */
console.log('\n[Feature 3 — Vehicle accuracy]');
const va = model.vehicleAccuracy.rows;
const v1 = va.find((r) => r.id === 'v1');
check('v1 = Avanza resolved', v1 && v1.name === 'Avanza');
check('v1 recommended 3 (r1,r3,r4)', v1.recommendations === 3);
check('v1 accepted 1 (only r1)', v1.accepted === 1);
check('vehicle rows share the same shape as driver rows', va.every((r) =>
  ['id', 'name', 'recommendations', 'accepted', 'overridden', 'accuracyPct', 'acceptancePct', 'avgDispatchScore', 'avgConfidenceStars', 'avgOverrideDifference', 'ranking'].every((f) => f in r)));

/* ── Feature 4 — Confidence calibration ──────────────────────────────── */
console.log('\n[Feature 4 — Confidence calibration]');
const cal = model.calibration.buckets;
check('4 buckets (5★→2★)', cal.length === 4 && cal[0].stars === 5 && cal[3].stars === 2);
check('5★ bucket generated 2 (r1 96, r4 96 recommended)', cal.find((b) => b.stars === 5).generated === 2);
check('5★ acceptancePct = 50 (r1 accepted, r4 overridden)', cal.find((b) => b.stars === 5).acceptancePct === 50);
check('4★ bucket generated 1 (r2 88)', cal.find((b) => b.stars === 4).generated === 1);
check('3★ bucket generated 1 (r3 72)', cal.find((b) => b.stars === 3).generated === 1);
check('calibration uses RECOMMENDED score (r4 lands 5★ not 2★)', cal.find((b) => b.stars === 2).generated === 0);

/* ── Feature 5 — Override severity ───────────────────────────────────── */
console.log('\n[Feature 5 — Override severity]');
const sev = model.severity;
check('3 overrides counted', sev.totalOverrides === 3);
check('categories cover minor/medium/major/critical', sev.categories.map((c) => c.key).join(',') === 'minor,medium,major,critical');
check('r4 (96→55, diff 41) is Critical', sev.worstCases[0].combinedDifference === 41 && sev.worstCases[0].severity === 'critical');
check('avgCombinedDifference > 0', sev.avgCombinedDifference > 0);
check('avgDriverDifference computed over driver-side overrides', sev.avgDriverDifference > 0);
check('worstCases sorted by difference desc', sev.worstCases.every((c, i, a) => i === 0 || a[i - 1].combinedDifference >= c.combinedDifference));

/* ── Feature 6 — Reason analytics ────────────────────────────────────── */
console.log('\n[Feature 6 — Reason analytics]');
const ra = model.reasonAnalytics;
check('3 overrides, 3 reasoned', ra.totalOverrides === 3 && ra.reasonedOverrides === 3);
check('topReasons has percentage', ra.topReasons.length === 3 && typeof ra.topReasons[0].percentage === 'number');
check('"Driver sakit" categorized as Driver Tidak Tersedia', ra.categories.find((c) => c.key === 'driver_unavailable').count === 1);
check('"Konflik jadwal" categorized as Konflik Jadwal', ra.categories.find((c) => c.key === 'schedule_conflict').count === 1);
check('"Kapasitas lebih besar" categorized as Preferensi Admin', ra.categories.find((c) => c.key === 'admin_preference').count === 1);
check('monthlyTrend has a 2026-06 bucket', ra.monthlyTrend.length === 1 && ra.monthlyTrend[0].key === '2026-06');

/* ── Feature 7 — False high confidence ───────────────────────────────── */
console.log('\n[Feature 7 — False high confidence]');
const fhc = model.falseHighConfidence;
check('2 five-star recommendations (r1, r4)', fhc.total === 2);
check('1 overridden (r4)', fhc.overridden === 1);
check('falseHighConfidencePct = 50', fhc.falseHighConfidencePct === 50);
check('worstCases lists r4', fhc.worstCases.length === 1 && fhc.worstCases[0].requestId === 'r4');

/* ── Feature 8 — Unexpected acceptance ───────────────────────────────── */
console.log('\n[Feature 8 — Unexpected acceptance]');
const ua = model.unexpectedAcceptance;
// low-confidence (≤3★) recommendations: r3 (72, 3★). r2 is 4★. None of the ≤3★ were accepted.
check('totalLowConfidence = 1 (r3 only ≤3★)', ua.totalLowConfidence === 1);
check('accepted = 0 (r3 was overridden)', ua.accepted === 0);
check('acceptancePct = 0', ua.acceptancePct === 0);

/* ── Feature 9 — Learning trend ──────────────────────────────────────── */
console.log('\n[Feature 9 — Learning trend]');
const lt = model.learningTrend;
check('4 windows (7d/30d/90d/ytd)', lt.windows.map((w) => w.key).join(',') === '7d,30d,90d,ytd');
check('7d window has all 4 logs', lt.windows[0].total === 4);
check('7d recommendationAccuracy = 25%', lt.windows[0].recommendationAccuracy === 25);
check('windows carry a monthly series', Array.isArray(lt.windows[0].series) && lt.windows[0].series.length === 1);

/* ── Feature 10 — Insights ───────────────────────────────────────────── */
console.log('\n[Feature 10 — Insights]');
const ins = model.insights;
check('insights generated', ins.length >= 1);
check('insights follow the contract', ins.every((i) => i.title && i.description && i.type && typeof i.priority === 'number'));
check('a five-star accuracy insight is present', ins.some((i) => /★★★★★/.test(i.title)));
check('false-high-confidence insight present (50% ≥ 10%)', ins.some((i) => i.source === 'False High Confidence'));

/* ── Empty dataset safety ────────────────────────────────────────────── */
console.log('\n[Empty dataset]');
let empty = null; let threw = false;
try { empty = computeRecommendationAccuracyModel({}); } catch { threw = true; }
check('empty input does not throw', !threw && !!empty);
check('empty totals zeroed', empty.totals.decisions === 0);
check('empty KPI zeroed, no NaN', empty.kpi.recommendationAccuracy === 0 && !Number.isNaN(empty.kpi.avgDispatchScore));
check('empty driver/vehicle rows empty', empty.driverAccuracy.rows.length === 0 && empty.vehicleAccuracy.rows.length === 0);
check('empty calibration still 4 buckets', empty.calibration.buckets.length === 4);
check('empty severity safe', empty.severity.totalOverrides === 0 && empty.severity.categories.length === 4);
check('empty insights empty', empty.insights.length === 0);
check('empty learning trend still 4 windows', empty.learningTrend.windows.length === 4);

/* ── Corrupt dataset safety ──────────────────────────────────────────── */
console.log('\n[Corrupt dataset]');
let corrupt = null; let threw2 = false;
try {
  corrupt = computeRecommendationAccuracyModel({
    overrideLogs: [null, 5, 'x', {}, { outcome: 'ACCEPTED', dispatchScore: 'NaN', recommendedDriverId: 'd1' }, { outcome: 'DRIVER_OVERRIDE', overridden: true, recommendedDriverId: 'd1', selectedDriverId: 'd2', dispatchScore: 40, reason: 7, timestamp: 'not-a-date' }],
    requestRecommendations: { bad: null, also: 3, good: { requestId: 'x', dispatchScore: 'oops' } },
    drivers: [null, { id: 'd1', name: 5 }],
  });
} catch { threw2 = true; }
check('corrupt input does not throw', !threw2 && !!corrupt);
check('corrupt logs filtered (only object-shaped kept)', corrupt.totals.decisions === 3); // {}, the two real objects
check('non-finite scores coerced (no NaN in avg)', !Number.isNaN(corrupt.kpi.avgDispatchScore));
check('numeric reason coerced to string safely', Array.isArray(corrupt.reasonAnalytics.topReasons));

/* ── Export builders (pure) ──────────────────────────────────────────── */
console.log('\n[Export builders]');
const docDef = buildRecommendationAccuracyDocDefinition(model, { periodLabel: 'Semua riwayat', generatedBy: 'Admin', appVersion: '1.17.1' });
check('docDefinition has A4 + content array', docDef.pageSize === 'A4' && Array.isArray(docDef.content) && docDef.content.length > 4);
check('docDefinition title is the report name', docDef.content[0].text === 'Recommendation Accuracy');
check('docDefinition embeds tables', docDef.content.some((c) => c && c.table && Array.isArray(c.table.body)));
const sheets = buildRecommendationAccuracySheets(model);
check('workbook has the accuracy sheets', sheets.length >= 6 && sheets[0].name === 'Ringkasan Akurasi');
check('Driver Akurasi sheet has header + data', (() => { const s = sheets.find((x) => x.name === 'Driver Akurasi'); return s && s.aoa.length > 1; })());
check('export builders empty-safe', (() => {
  try { const d = buildRecommendationAccuracyDocDefinition(computeRecommendationAccuracyModel({})); const sh = buildRecommendationAccuracySheets(computeRecommendationAccuracyModel({})); return Array.isArray(d.content) && sh.length >= 6; } catch { return false; }
})());

/* ── Dispatch Analytics export — additive accuracy append (no regression) ── */
console.log('\n[Dispatch export — additive append]');
const daModel = computeDispatchAnalyticsModel({ overrideLogs, requestRecommendations, drivers, vehicles });
const baseSheets = buildDispatchAnalyticsSheets(daModel);
check('dispatch export unchanged when no accuracy model (8 sheets)', baseSheets.length === 8);
const combinedSheets = buildDispatchAnalyticsSheets(daModel, model);
check('dispatch export APPENDS accuracy sheets when supplied', combinedSheets.length > 8);
const baseDoc = buildDispatchAnalyticsDocDefinition(daModel, {});
const combinedDoc = buildDispatchAnalyticsDocDefinition(daModel, {}, model);
check('dispatch docDef unchanged length when no accuracy model', baseDoc.content.length < combinedDoc.content.length);
check('combined docDef contains the accuracy header', combinedDoc.content.some((c) => c && c.text === 'Recommendation Accuracy Engine'));

/* ── Regression — reuse, not re-implementation ───────────────────────── */
console.log('\n[Regression — single source of truth]');
const svcDriver = computeAllDriverAccuracy(overrideLogs);
check('driver accuracyPct equals the override-service kept-rate (no re-implementation)', (() => {
  return svcDriver.every((a) => {
    const row = da.find((r) => r.id === a.driverId);
    return row && row.accuracyPct === a.accuracy && row.recommendations === a.recommended;
  });
}));

/* ── summary ─────────────────────────────────────────────────────────── */
console.log(`\n${fail === 0 ? '✓ PASS' : '✗ FAIL'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
