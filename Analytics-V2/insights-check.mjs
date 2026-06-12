/* ============================================================
   insights-check.mjs — Sprint 4 Insight Engine validation

   Verifies the Insight Engine is deterministic, prioritized, and
   traceable (every insight names a source metric), and that it never
   invents insights from empty data.

   Run:  node Analytics-V2/insights-check.mjs   (exit 0 = pass)
   ============================================================ */

import { computeAnalyticsModel } from '../js/analytics/analytics-engine.js';
import { generateInsights } from '../js/analytics/analytics-insights.js';

const normalizeAssignmentStatus = (a) => {
  const s = a.status;
  if (!s || s === 'aktif') return { ...a, status: 'assigned' };
  if (s === 'selesai') return { ...a, status: 'completed' };
  return a;
};

const drivers = [
  { name: 'Igo', active: true }, { name: 'Bayu', active: true },
  { name: 'Rendi', active: true }, { name: 'Dewi', active: true },
];
const vehicles = [{ name: 'Innova' }, { name: 'Fortuner' }, { name: 'Hiace' }];
const requests = [
  { id: 'r1', requesterName: 'Bidang Perencanaan', startDate: '2026-06-01', driver: 'Igo', vehicle: 'Innova' },
  { id: 'r2', requesterName: 'Bidang Umum', startDate: '2026-06-02', driver: 'Bayu', vehicle: 'Fortuner' },
];
// Mostly-open + a cancellation + concentration on Igo → should yield warnings.
const assignments = [
  { driver: 'Igo', vehicle: 'Innova', date: '2026-06-01', status: 'completed', requestId: 'r1', destination: 'Cipayung', distanceTravelled: 40 },
  { driver: 'Igo', vehicle: 'Innova', date: '2026-06-02', status: 'assigned', requestId: 'r1', destination: 'Cipayung', distanceTravelled: 0 },
  { driver: 'Igo', vehicle: 'Innova', date: '2026-06-03', status: 'assigned', requestId: 'r1', destination: 'Cipayung', distanceTravelled: 0 },
  { driver: 'Igo', vehicle: 'Innova', date: '2026-06-04', status: 'started', requestId: 'r1', destination: 'Cipayung', distanceTravelled: 0 },
  { driver: 'Bayu', vehicle: 'Fortuner', date: '2026-06-02', status: 'cancelled', requestId: 'r2', destination: 'Bandara', distanceTravelled: 0 },
];

const ctx = {
  assignments, requests, drivers, vehicles,
  filters: { dateRange: 'all', driver: '', vehicle: '', bidang: '' },
  aliases: { destinations: {}, bidang: {}, drivers: {}, vehicles: {} },
  dismissed: { destinations: {}, bidang: {}, drivers: {}, vehicles: {} },
  normalizeAssignmentStatus, now: '2026-06-09T10:00:00Z',
};

const model = computeAnalyticsModel(ctx);
const insights = model.insights;

let fail = 0;
const check = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fail++; };

// 1. Engine attaches insights to the model.
check(Array.isArray(insights) && insights.length > 0, `model.insights populated (${insights.length} insights)`);

// 2. Every insight is traceable + well-formed.
const validType = i => ['info', 'success', 'warning'].includes(i.type);
const validPrio = i => [1, 2, 3].includes(i.priority);
check(insights.every(i => i.source && i.source.length > 0), 'every insight names a source metric (traceable)');
check(insights.every(validType), 'every insight has a valid type');
check(insights.every(validPrio), 'every insight has a valid priority (1–3)');
check(insights.every(i => i.title && i.description), 'every insight has title + description (explainable)');

// 3. Deterministic ordering by priority ascending.
const sortedOk = insights.every((it, i) => i === 0 || insights[i - 1].priority <= it.priority);
check(sortedOk, 'insights sorted by priority ascending (deterministic)');

// 4. Determinism: two runs produce identical output.
const again = generateInsights(model);
check(JSON.stringify(again) === JSON.stringify(insights), 'generateInsights is deterministic (stable across runs)');

// 5. Expected findings present for this scenario.
const sources = new Set(insights.map(i => i.source));
check(sources.has('Open Rate'), 'detects high open backlog (Open Rate)');
check(sources.has('Cancelled Assignments'), 'detects cancellation (Cancelled Assignments)');
check(insights.some(i => i.priority === 1), 'at least one critical (priority 1) finding');

// 6. Empty data → no fabricated insights.
const emptyModel = computeAnalyticsModel({ ...ctx, assignments: [], requests: [] });
check(Array.isArray(emptyModel.insights) && emptyModel.insights.length === 0, 'no insights fabricated from empty data');

console.log(fail === 0 ? '\nINSIGHTS OK — deterministic, traceable, prioritized.' : `\nINSIGHTS FAILED — ${fail} check(s).`);
process.exit(fail === 0 ? 0 : 1);
