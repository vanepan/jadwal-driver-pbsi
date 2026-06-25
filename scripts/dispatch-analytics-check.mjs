/* dispatch-analytics-check.mjs — validates the Dispatch Intelligence Analytics
   engine (v1.17.0). Run: node scripts/dispatch-analytics-check.mjs (exit 0 = pass)

   The engine adds NO scoring — it AGGREGATES the existing override log /
   recommendation / capacity data into the executive analytics model. These
   assertions pin every section's math, the bidang/timeline joins, and the
   empty-data safety (a fresh system must produce a clean zeroed model, never
   throw / NaN). */

import { computeDispatchAnalyticsModel } from '../js/analytics/dispatch-analytics-engine.js';
import { buildDispatchAnalyticsDocDefinition, buildDispatchAnalyticsSheets } from '../js/exports/analytics/dispatch-analytics-export.js';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

const NOW = '2026-06-25T12:00:00';

const drivers = [
  { id: 'd1', name: 'Andi' },
  { id: 'd2', name: 'Budi' },
  { id: 'd3', name: 'Citra' },
];
const vehicles = [
  { id: 'v1', name: 'Avanza' },
  { id: 'v2', name: 'Innova' },
];
const requests = [
  { id: 'r1', requesterName: 'Bidang A', purpose: 'Bandara', createdAt: '2026-06-21T08:00:00', approvedAt: '2026-06-21T09:00:00' },
  { id: 'r2', requesterName: 'Bidang B', purpose: 'Hotel',   createdAt: '2026-06-22T08:00:00', approvedAt: '2026-06-22T09:00:00' },
  { id: 'r3', requesterName: 'Bidang A', purpose: 'Bandara', createdAt: '2026-06-23T08:00:00', approvedAt: '2026-06-23T09:00:00' },
  { id: 'r4', requesterName: 'Bidang A', purpose: 'Pelabuhan', createdAt: '2026-06-24T08:00:00', approvedAt: '2026-06-24T09:00:00' },
];
// outcomes: r1 ACCEPTED · r2 DRIVER_OVERRIDE · r3 VEHICLE_OVERRIDE · r4 FULL_OVERRIDE
const overrideLogs = [
  { recommendationId: 'r1', recommendedDriverId: 'd1', recommendedVehicleId: 'v1', selectedDriverId: 'd1', selectedVehicleId: 'v1', dispatchScore: 96, outcome: 'ACCEPTED', overridden: false, reason: '', approvedBy: 'admin', timestamp: '2026-06-21T09:00:00' },
  { recommendationId: 'r2', recommendedDriverId: 'd1', recommendedVehicleId: 'v2', selectedDriverId: 'd2', selectedVehicleId: 'v2', dispatchScore: 88, outcome: 'DRIVER_OVERRIDE', overridden: true, reason: 'Driver lebih senior', approvedBy: 'admin', timestamp: '2026-06-22T09:00:00' },
  { recommendationId: 'r3', recommendedDriverId: 'd2', recommendedVehicleId: 'v1', selectedDriverId: 'd2', selectedVehicleId: 'v2', dispatchScore: 72, outcome: 'VEHICLE_OVERRIDE', overridden: true, reason: 'Kapasitas lebih besar', approvedBy: 'admin', timestamp: '2026-06-23T09:00:00' },
  { recommendationId: 'r4', recommendedDriverId: 'd1', recommendedVehicleId: 'v1', selectedDriverId: 'd3', selectedVehicleId: 'v2', dispatchScore: 60, outcome: 'FULL_OVERRIDE', overridden: true, reason: 'Driver lebih senior', approvedBy: 'admin', timestamp: '2026-06-24T09:00:00' },
];
const requestRecommendations = {
  r1: { requestId: 'r1', recommendedDriverId: 'd1', recommendedVehicleId: 'v1', dispatchScore: 96, reasonSummary: 'Driver tersedia, beban rendah', generatedAt: '2026-06-21T07:59:00' },
  r2: { requestId: 'r2', recommendedDriverId: 'd1', recommendedVehicleId: 'v2', dispatchScore: 88, reasonSummary: 'Driver tersedia, beban rendah', generatedAt: '2026-06-22T07:59:00' },
  r3: { requestId: 'r3', recommendedDriverId: 'd2', recommendedVehicleId: 'v1', dispatchScore: 72, reasonSummary: 'Kapasitas sesuai', generatedAt: '2026-06-23T07:59:00' },
};
const assignments = [
  // Andi (d1) double-booked on one date → conflict-avoidance < 100
  { driverId: 'd1', driver: 'Andi', vehicle: 'Avanza', date: '2026-06-20', startTime: '08:00', endTime: '10:00', status: 'assigned' },
  { driverId: 'd1', driver: 'Andi', vehicle: 'Avanza', date: '2026-06-20', startTime: '09:00', endTime: '11:00', status: 'assigned' },
  { driverId: 'd2', driver: 'Budi', vehicle: 'Innova', date: '2026-06-20', startTime: '08:00', endTime: '10:00', status: 'assigned' },
];

const model = computeDispatchAnalyticsModel({
  overrideLogs, requestRecommendations, requests, drivers, vehicles, assignments, now: NOW,
});

/* ── §1 KPI ──────────────────────────────────────────────────────────── */
console.log('\n[§1 KPI]');
check('decisions = 4', model.totals.decisions === 4);
check('accepted = 1, overridden = 3', model.totals.accepted === 1 && model.totals.overridden === 3);
check('dispatchAccuracy = 25%', model.kpi.dispatchAccuracy === 25);
check('overrideRate = 75%', model.kpi.overrideRate === 75);
check('recommendationAcceptance = 25%', model.kpi.recommendationAcceptance === 25);
check('avgDispatchScore = round((96+88+72+60)/4)=79', model.kpi.avgDispatchScore === 79);
check('avgConfidence band derived from avg score (79 → 3★ Sedang)', model.kpi.avgConfidence.label === 'Sedang');
check('avgConfidence.stars is a mean (between 2 and 5)', model.kpi.avgConfidence.stars >= 2 && model.kpi.avgConfidence.stars <= 5);

/* ── §2 Confidence distribution ──────────────────────────────────────── */
console.log('\n[§2 Confidence distribution]');
const dist = model.confidenceDistribution;
check('5 rows (5★ → 1★)', dist.length === 5 && dist[0].stars === 5 && dist[4].stars === 1);
check('96 → 5★ bucket count 1', dist.find((r) => r.stars === 5).count === 1);
check('88 → 4★ bucket count 1', dist.find((r) => r.stars === 4).count === 1);
check('72 → 3★ bucket count 1', dist.find((r) => r.stars === 3).count === 1);
check('60 → 2★ bucket count 1', dist.find((r) => r.stars === 2).count === 1);
check('1★ bucket always empty (banding floors at 2★)', dist.find((r) => r.stars === 1).count === 0);
check('5★ percentage = 25%', dist.find((r) => r.stars === 5).percentage === 25);
check('5★ acceptanceRate = 100% (its one log was ACCEPTED)', dist.find((r) => r.stars === 5).acceptanceRate === 100);
check('2★ acceptanceRate = 0% (its log was FULL_OVERRIDE)', dist.find((r) => r.stars === 2).acceptanceRate === 0);

/* ── §3 Driver intelligence ──────────────────────────────────────────── */
console.log('\n[§3 Driver intelligence]');
const di = model.driverIntelligence;
const d1 = di.rows.find((r) => r.driverId === 'd1');
check('d1 resolved to name Andi', d1 && d1.driverName === 'Andi');
check('d1 recommended 3 times (r1,r2,r4)', d1.recommended === 3);
check('d1 accepted once (only r1 kept Andi)', d1.accepted === 1);
check('d1 acceptance = 33%', d1.acceptance === 33);
check('d1 overrideRate = 67%', d1.overrideRate === 67);
check('d1 avgScore = round((96+88+60)/3)=81', d1.avgScore === 81);
check('d1 conflictAvoidance < 100 (double-booked on 06-20)', d1.conflictAvoidance < 100);
check('d1 lastRecommendation is r4 timestamp', d1.lastRecommendation === new Date('2026-06-24T09:00:00').toISOString());
check('topRecommended ranks d1 first', di.rankings.topRecommended[0].id === 'd1');
check('mostOverridden ranks d1 first (2 overrides)', di.rankings.mostOverridden[0].id === 'd1' && di.rankings.mostOverridden[0].overridden === 2);
const d2 = di.rows.find((r) => r.driverId === 'd2');
check('d2 acceptance = 100% (recommended once, kept)', d2.acceptance === 100);

/* ── §4 Vehicle intelligence ─────────────────────────────────────────── */
console.log('\n[§4 Vehicle intelligence]');
const vi = model.vehicleIntelligence;
const v1 = vi.rows.find((r) => r.vehicleId === 'v1');
check('v1 resolved to Avanza', v1 && v1.vehicleName === 'Avanza');
check('v1 recommended 3 times (r1,r3,r4)', v1.recommended === 3);
check('v1 accepted once (only r1)', v1.accepted === 1);
check('v1 idle = 100 - utilization', v1.idle === Math.max(0, 100 - v1.utilization));
const v2 = vi.rows.find((r) => r.vehicleId === 'v2');
check('v2 acceptance = 100% (recommended once at r2, kept)', v2.acceptance === 100);

/* ── §5 Override analytics ───────────────────────────────────────────── */
console.log('\n[§5 Override analytics]');
const oa = model.overrideAnalytics;
check('reasonBreakdown accepted/driver/vehicle/full = 1/1/1/1',
  oa.reasonBreakdown.accepted === 1 && oa.reasonBreakdown.driver === 1 && oa.reasonBreakdown.vehicle === 1 && oa.reasonBreakdown.full === 1);
check('daily trend has 4 buckets (4 distinct days)', oa.trends.daily.length === 4);
check('daily buckets sorted ascending', oa.trends.daily[0].key < oa.trends.daily[3].key);
check('monthly trend has 1 bucket (2026-06)', oa.trends.monthly.length === 1 && oa.trends.monthly[0].key === '2026-06');
check('weekly trend produces ISO-week keys', /^\d{4}-W\d{2}$/.test(oa.trends.weekly[0].key));

/* ── §6 Bidang intelligence ──────────────────────────────────────────── */
console.log('\n[§6 Bidang intelligence]');
const bidang = model.bidangIntelligence;
const bA = bidang.find((b) => b.bidang === 'Bidang A');
check('Bidang A has 3 requests (r1,r3,r4)', bA && bA.requests === 3);
check('Bidang A acceptance = 33% (only r1 accepted)', bA.acceptanceRate === 33);
check('Bidang A topDestination = Bandara (2 of 3)', bA.topDestination === 'Bandara');
check('Bidang A conflictRate = 33% (one FULL_OVERRIDE of 3)', bA.conflictRate === 33);
check('Bidang B present with 1 request', bidang.find((b) => b.bidang === 'Bidang B').requests === 1);
check('bidang sorted by request count desc (A before B)', bidang[0].bidang === 'Bidang A');

/* ── §7 Recommendation quality ───────────────────────────────────────── */
console.log('\n[§7 Recommendation quality]');
const rq = model.recommendationQuality;
check('funnel has 4 rows', rq.funnel.length === 4);
check('ACCEPTED count 1 / 25%', rq.funnel[0].key === 'ACCEPTED' && rq.funnel[0].count === 1 && rq.funnel[0].percentage === 25);
check('FULL_OVERRIDE count 1', rq.funnel[3].key === 'FULL_OVERRIDE' && rq.funnel[3].count === 1);

/* ── §8 Timeline ─────────────────────────────────────────────────────── */
console.log('\n[§8 Timeline]');
check('timeline has 4 events', model.timeline.length === 4);
check('timeline sorted newest first (r4 first)', model.timeline[0].requestId === 'r4');
check('timeline resolves selected names (r1 → Andi / Avanza)',
  (() => { const e = model.timeline.find((x) => x.requestId === 'r1'); return e.driverName === 'Andi' && e.vehicleName === 'Avanza'; })());
check('timeline carries bidang join', model.timeline[0].bidang === 'Bidang A');

/* ── §9 Explainability ───────────────────────────────────────────────── */
console.log('\n[§9 Explainability]');
const ex = model.explainability;
check('topReasons aggregates reasonSummary (most frequent first)',
  ex.topReasons.length >= 1 && ex.topReasons[0].text === 'Driver tersedia, beban rendah' && ex.topReasons[0].count === 2);
check('adminOverrideReasons aggregates override reasons',
  ex.adminOverrideReasons.find((r) => r.text === 'Driver lebih senior').count === 2);
check('adminOverrideReasons excludes accepted (empty-reason) logs',
  !ex.adminOverrideReasons.some((r) => r.text === ''));

/* ── §10 Trends ──────────────────────────────────────────────────────── */
console.log('\n[§10 Trends]');
const tr = model.trends;
check('4 windows (7d/30d/90d/ytd)', tr.windows.length === 4 && tr.windows.map((w) => w.key).join(',') === '7d,30d,90d,ytd');
check('7d window includes all 4 logs (within last week of NOW)', tr.windows[0].total === 4);
check('7d acceptanceRate = 25%', tr.windows[0].acceptanceRate === 25);
check('7d window has a daily series', Array.isArray(tr.windows[0].series) && tr.windows[0].series.length === 4);

/* ── Empty-data safety ───────────────────────────────────────────────── */
console.log('\n[empty-data safety]');
let emptyModel = null; let threw = false;
try { emptyModel = computeDispatchAnalyticsModel({}); } catch { threw = true; }
check('empty input does not throw', !threw && !!emptyModel);
check('empty totals zeroed', emptyModel.totals.decisions === 0);
check('empty KPI zeroed, no NaN', emptyModel.kpi.dispatchAccuracy === 0 && !Number.isNaN(emptyModel.kpi.avgDispatchScore));
check('empty distribution still 5 rows', emptyModel.confidenceDistribution.length === 5);
check('empty driver/vehicle/bidang lists', emptyModel.driverIntelligence.rows.length === 0 && emptyModel.vehicleIntelligence.rows.length === 0 && emptyModel.bidangIntelligence.length === 0);
check('empty timeline + funnel still well-formed', emptyModel.timeline.length === 0 && emptyModel.recommendationQuality.funnel.length === 4);
check('null/garbage logs filtered safely (only object-shaped entries kept)', (() => {
  const m = computeDispatchAnalyticsModel({ overrideLogs: [null, 5, {}, { outcome: 'ACCEPTED', dispatchScore: 90 }] });
  return m.totals.decisions === 2; // null + the number 5 dropped; {} and the ACCEPTED record kept
})());

/* ── §11 Export builders (pure, PDF docDef + Excel sheets) ───────────── */
console.log('\n[§11 Export builders]');
const docDef = buildDispatchAnalyticsDocDefinition(model, { periodLabel: 'Semua riwayat', generatedBy: 'Admin', appVersion: '1.17.0' });
check('docDefinition has A4 page + content array', docDef.pageSize === 'A4' && Array.isArray(docDef.content) && docDef.content.length > 5);
check('docDefinition title is the dashboard name', docDef.content[0].text === 'Dispatch Intelligence Analytics');
check('docDefinition embeds tables (KPI etc.)', docDef.content.some((c) => c && c.table && Array.isArray(c.table.body)));
const sheets = buildDispatchAnalyticsSheets(model);
check('workbook has the expected sheets', sheets.length === 8 && sheets[0].name === 'Ringkasan');
check('Driver sheet has a header row + data rows', (() => { const s = sheets.find((x) => x.name === 'Driver'); return s && s.aoa[0][0] === 'Driver' && s.aoa.length > 1; })());
check('Bidang sheet carries the bidang join', (() => { const s = sheets.find((x) => x.name === 'Bidang'); return s && s.aoa.some((r) => r[0] === 'Bidang A'); })());
check('export builders are empty-safe (no throw on empty model)', (() => {
  try { const d = buildDispatchAnalyticsDocDefinition(computeDispatchAnalyticsModel({})); const sh = buildDispatchAnalyticsSheets(computeDispatchAnalyticsModel({})); return Array.isArray(d.content) && sh.length === 8; } catch { return false; }
})());

/* ── summary ─────────────────────────────────────────────────────────── */
console.log(`\n${fail === 0 ? '✓ PASS' : '✗ FAIL'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
