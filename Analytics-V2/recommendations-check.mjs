/* ============================================================
   recommendations-check.mjs — Sprint 5 Recommendation Engine validation

   Verifies recommendations are deterministic, traceable (source-tagged),
   explainable, prioritized, and never fabricated from empty data.

   Run:  node Analytics-V2/recommendations-check.mjs   (exit 0 = pass)
   ============================================================ */

import { computeAnalyticsModel } from '../js/analytics/analytics-engine.js';
import { generateRecommendations } from '../js/analytics/analytics-recommendations.js';

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
// High open + cancellation + idle vehicle (Hiace unused) → should yield risk + optimization recs.
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
const recs = model.recommendations;

let fail = 0;
const check = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fail++; };

check(Array.isArray(recs) && recs.length > 0, `model.recommendations populated (${recs.length})`);
check(recs.every(r => r.source && r.source.length > 0), 'every recommendation names a source (traceable)');
check(recs.every(r => ['action', 'warning', 'optimization'].includes(r.type)), 'every recommendation has a valid type');
check(recs.every(r => [1, 2, 3].includes(r.priority)), 'every recommendation has a valid priority (1–3)');
check(recs.every(r => r.title && r.description), 'every recommendation is explainable (title + description)');

const sortedOk = recs.every((it, i) => i === 0 || recs[i - 1].priority <= it.priority);
check(sortedOk, 'recommendations sorted by priority ascending (deterministic)');

const again = generateRecommendations(model);
check(JSON.stringify(again) === JSON.stringify(recs), 'generateRecommendations is deterministic (stable across runs)');

const sources = new Set(recs.map(r => r.source));
check(sources.has('Open Rate'), 'advises on backlog (Open Rate)');
check(sources.has('Cancelled Assignments'), 'advises on cancellations (Cancelled Assignments)');
check(sources.has('Inactive Resources'), 'advises on fleet utilization (Inactive Resources)');
check(recs.some(r => r.priority === 1), 'at least one operational-risk (priority 1) recommendation');

const emptyModel = computeAnalyticsModel({ ...ctx, assignments: [], requests: [] });
check(Array.isArray(emptyModel.recommendations) && emptyModel.recommendations.length === 0, 'no recommendations fabricated from empty data');

console.log(fail === 0 ? '\nRECOMMENDATIONS OK — deterministic, traceable, prioritized, actionable.' : `\nRECOMMENDATIONS FAILED — ${fail} check(s).`);
process.exit(fail === 0 ? 0 : 1);
