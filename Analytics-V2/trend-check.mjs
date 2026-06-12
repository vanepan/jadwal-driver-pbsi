/* ============================================================
   trend-check.mjs — Sprint 6 Trend Engine validation

   Verifies the Trend Engine is deterministic, computes correct direction /
   percent / tone, isolates the previous period (no current-period leakage),
   handles missing history gracefully, and never perturbs existing KPIs.

   Run:  node Analytics-V2/trend-check.mjs   (exit 0 = pass)
   ============================================================ */

import { computeAnalyticsModel } from '../js/analytics/analytics-engine.js';
import { generateTrends } from '../js/analytics/analytics-trends.js';
import { derivePreviousPeriod } from '../js/analytics/analytics-period.js';

const normalizeAssignmentStatus = (a) => {
  const s = a.status;
  if (!s || s === 'aktif') return { ...a, status: 'assigned' };
  if (s === 'selesai') return { ...a, status: 'completed' };
  return a;
};

const drivers = [{ name: 'Igo', active: true }, { name: 'Bayu', active: true }];
const vehicles = [{ name: 'Innova' }, { name: 'Fortuner' }];

// now = 2026-06-30. 7d current window = [06-24 .. 06-30];
// previous equivalent window = [06-17 .. 06-23]; anything ≤ 06-16 is out of both.
const NOW = '2026-06-30T12:00:00Z';
const assignments = [
  // Current window (4): 3 completed + 1 scheduled → compRate 75%, openRate 25%
  { driver: 'Igo',  vehicle: 'Innova',   date: '2026-06-24', status: 'completed' },
  { driver: 'Bayu', vehicle: 'Fortuner', date: '2026-06-25', status: 'completed' },
  { driver: 'Igo',  vehicle: 'Innova',   date: '2026-06-26', status: 'completed' },
  { driver: 'Bayu', vehicle: 'Fortuner', date: '2026-06-30', status: 'assigned'  },
  // Previous window (2): 1 completed + 1 scheduled → compRate 50%, openRate 50%
  { driver: 'Igo',  vehicle: 'Innova',   date: '2026-06-18', status: 'completed' },
  { driver: 'Bayu', vehicle: 'Fortuner', date: '2026-06-20', status: 'assigned'  },
  // Out of both windows — must never leak into either period.
  { driver: 'Igo',  vehicle: 'Innova',   date: '2026-06-01', status: 'completed' },
];

const baseCtx = {
  assignments, requests: [], drivers, vehicles,
  filters: { dateRange: '7d', driver: '', vehicle: '', bidang: '' },
  aliases: { destinations: {}, bidang: {}, drivers: {}, vehicles: {} },
  dismissed: { destinations: {}, bidang: {}, drivers: {}, vehicles: {} },
  normalizeAssignmentStatus, now: NOW,
};

let fail = 0;
const check = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fail++; };

// ── Period foundation ──────────────────────────────────────────────────────
const prev = derivePreviousPeriod('7d', NOW);
check(prev.available && prev.windowEnd === '2026-06-23', `derivePreviousPeriod(7d) → windowEnd 2026-06-23 (got ${prev.windowEnd})`);
check(derivePreviousPeriod('all', NOW).available === false, "derivePreviousPeriod('all') → unavailable (no comparison)");

// ── Build current + previous models the same way app.js does ───────────────
const previousModel = computeAnalyticsModel({ ...baseCtx, now: prev.prevNow, windowEnd: prev.windowEnd });
const currentModel  = computeAnalyticsModel({ ...baseCtx, previousModel });

// ── Previous-period isolation ──────────────────────────────────────────────
check(currentModel.kpis.total === 4, `current period isolates 4 assignments (got ${currentModel.kpis.total})`);
check(previousModel.kpis.total === 2, `previous period isolates 2 assignments, no leakage (got ${previousModel.kpis.total})`);

// ── Trend correctness ──────────────────────────────────────────────────────
const t = currentModel.trends;
check(t && typeof t === 'object', 'currentModel.trends populated');
check(t.totalAssignments.direction === 'up' && t.totalAssignments.delta === 2 && t.totalAssignments.percentChange === 100,
  `totalAssignments: up, delta 2, +100% (got ${t.totalAssignments.direction}/${t.totalAssignments.delta}/${t.totalAssignments.percentChange})`);
check(t.totalAssignments.tone === 'neutral', 'totalAssignments tone neutral (informational, directionless)');
check(t.completionRate.direction === 'up' && t.completionRate.percentChange === 50 && t.completionRate.tone === 'positive',
  `completionRate: up +50%, tone positive (got ${t.completionRate.direction}/${t.completionRate.percentChange}/${t.completionRate.tone})`);
check(t.openRate.direction === 'down' && t.openRate.percentChange === -50 && t.openRate.tone === 'positive',
  `openRate: down -50%, tone positive (lower is better) (got ${t.openRate.direction}/${t.openRate.percentChange}/${t.openRate.tone})`);
check(t.cancellationRate.percentChange === null && t.cancellationRate.direction === 'neutral',
  'cancellationRate: 0→0 → neutral, percentChange null');

// ── Determinism ────────────────────────────────────────────────────────────
const again = generateTrends(currentModel, previousModel);
check(JSON.stringify(again) === JSON.stringify(currentModel.trends), 'generateTrends deterministic (stable across runs)');

// ── Missing history (no prior-period activity) ─────────────────────────────
const emptyPrev = computeAnalyticsModel({ ...baseCtx, assignments: [], now: prev.prevNow, windowEnd: prev.windowEnd });
const trendsNoHistory = generateTrends(currentModel, emptyPrev);
check(trendsNoHistory.completionRate.percentChange === null, 'missing history → rate percentChange null (no divide-by-zero)');
check(trendsNoHistory.totalAssignments.direction === 'up', 'missing history → totalAssignments still reflects new activity (up)');

// ── Additive: trends never perturb existing KPIs ───────────────────────────
const baseline = computeAnalyticsModel({ ...baseCtx });   // no previousModel, no windowEnd
check(JSON.stringify(baseline.kpis) === JSON.stringify(currentModel.kpis), 'KPIs identical with/without trend computation (additive only)');
check(JSON.stringify(baseline.trends) === '{}', 'no previous period ⇒ trends is empty (never fabricated)');

// ── Trend-aware insights/recommendations only when evidence exists ─────────
check(currentModel.insights.some(i => i.source && i.source.includes('(Trend)')), 'trend-aware insight emitted when trend data exists');
check(baseline.insights.every(i => !i.source || !i.source.includes('(Trend)')), 'no trend insight without a previous period');
check(currentModel.recommendations.some(r => r.source && r.source.includes('(Trend)')), 'trend-aware recommendation emitted when trend data exists');

console.log(fail === 0 ? '\nTRENDS OK — deterministic, isolated, correctly signed, additive.' : `\nTRENDS FAILED — ${fail} check(s).`);
process.exit(fail === 0 ? 0 : 1);
