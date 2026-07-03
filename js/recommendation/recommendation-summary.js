/* ============================================================
   RECOMMENDATION-SUMMARY.JS — Fleet Recommendation Engine (v1.19.7)

   The executive summarisation layer over the Fleet Recommendation Engine. It
   arranges the enriched recommendations into the three executive views the
   sprint delivers:

     • Fleet Recommendation Board — Critical / Upcoming / Optimization /
       Completed / Healthy buckets.
     • Priority Timeline — recommendations grouped into recommended execution
       windows (Immediate → Later).
     • Executive Decision Support — the highest-priority / most-valuable /
       biggest-downtime-reduction / optimization / lowest-effort insights.

   ── PURE DERIVATION ONLY ─────────────────────────────────────────────────────
   Computes NO prediction. It only SELECTS and GROUPS the recommendations the
   Fleet Recommendation Engine already distilled from the certified model. No new
   score, no fabricated reasoning, no AI text. Deterministic + node-testable.

   API (all pure):
     recommendationBoard(model)   → { critical, upcoming, optimization, completed, healthy, counts, isHealthyFleet }
     recommendationTimeline(model)→ Array<{ key,label,note,order,recs }>
     decisionSupport(model)       → Insight[]   (executiveInsights() shape — reuses ExecutiveInsightCards)
     noRecommendationState(model) → { healthy, title, messages[] }
   ============================================================ */

'use strict';

import { TIMELINE_BUCKETS } from './recommendation-priority.js';
import { buildFleetRecommendations, fleetOptimizations } from './fleet-recommendation-engine.js';

function num(v) { return typeof v === 'number' && Number.isFinite(v) ? v : 0; }

/* ── Fleet Recommendation Board ───────────────────────────────────────────────
   Buckets the certified recommendations for an at-a-glance board:
     • critical     — priority critical / high (danger): act now,
     • upcoming     — preventive / monitoring pressure (medium & watch),
     • optimization — fleet optimization opportunities,
     • completed    — reserved (execution history is not persisted yet → empty),
     • healthy      — vehicles needing no action (positive read).
*/
export function recommendationBoard(model) {
  const recs = buildFleetRecommendations(model);
  const critical = [];
  const upcoming = [];
  const healthy = [];

  for (const r of recs) {
    if (r.priority.key === 'critical' || r.priority.key === 'high') critical.push(r);
    else if (r.category === 'none') healthy.push(r);
    else upcoming.push(r); // preventive (medium) + monitoring (watch)
  }

  const optimization = fleetOptimizations(model);
  // Execution history is not persisted in this layer, so "completed" is honestly
  // empty (never fabricated) — the board renders a neutral, positive placeholder.
  const completed = Object.freeze([]);

  const counts = Object.freeze({
    critical: critical.length,
    upcoming: upcoming.length,
    optimization: optimization.length,
    completed: 0,
    healthy: healthy.length,
    total: recs.length,
  });

  return Object.freeze({
    critical: Object.freeze(critical),
    upcoming: Object.freeze(upcoming),
    optimization,
    completed,
    healthy: Object.freeze(healthy),
    counts,
    // A truly healthy fleet has no critical AND no upcoming action pending.
    isHealthyFleet: critical.length === 0 && upcoming.length === 0,
  });
}

/* ── Priority Timeline ────────────────────────────────────────────────────────
   Groups every ACTIONABLE recommendation into its recommended execution window,
   preserving the canonical Immediate → Today → This Week → Next Week → Later
   order. Healthy (no-action) recommendations are excluded — a timeline is for
   things to DO. Every window is returned (even when empty) so the horizon reads
   completely; the presentation layer decides how to show an empty window. */
export function recommendationTimeline(model) {
  const actionable = [
    ...buildFleetRecommendations(model).filter((r) => r.actionable && r.category !== 'none'),
    ...fleetOptimizations(model),
  ];
  const byBucket = new Map(TIMELINE_BUCKETS.map((b) => [b.key, []]));
  for (const r of actionable) {
    const key = r.timeline && r.timeline.key;
    (byBucket.get(key) || byBucket.get('later')).push(r);
  }
  return Object.freeze(TIMELINE_BUCKETS.map((b) => Object.freeze({
    key: b.key, label: b.label, note: b.note, order: b.order,
    recs: Object.freeze((byBucket.get(b.key) || []).slice()),
  })));
}

/* ── Executive Decision Support ───────────────────────────────────────────────
   Fleet-wide decision insights an executive reads in seconds. Each is a
   SELECTION over the already-derived recommendations (no new logic) and returns
   the executiveInsights() shape so the SAME ExecutiveInsightCards presentation
   renders them. Only insights with supporting data are returned. */
export function decisionSupport(model) {
  const recs = buildFleetRecommendations(model);
  const actionable = recs.filter((r) => r.actionable && r.category !== 'none');
  const opt = fleetOptimizations(model);
  const out = [];

  // Highest Priority Recommendation — the most urgent actionable item.
  if (actionable.length) {
    const top = actionable[0]; // already urgency-sorted
    out.push({
      id: 'top-priority', key: 'highestPriority', title: 'Prioritas Tertinggi',
      subject: top.vehicleName, value: top.priority.label,
      detail: top.title,
      tone: top.priority.tone, icon: 'alert', vehicleId: top.vehicleId || '',
    });
  }

  // Biggest Downtime Reduction — the most valuable maintenance/availability
  // action (highest impact, then confidence). Answers "most valuable".
  const downtime = actionable
    .filter((r) => r.category === 'maintenance' || r.category === 'availability' || r.category === 'utilization')
    .sort((a, b) => impactRank(b) - impactRank(a) || num(b.confidence.score) - num(a.confidence.score))[0];
  if (downtime) {
    out.push({
      id: 'downtime', key: 'biggestDowntimeReduction', title: 'Reduksi Downtime Terbesar',
      subject: downtime.vehicleName, value: downtime.estimatedImpact.label,
      detail: downtime.expectedBenefit,
      tone: downtime.estimatedImpact.tone, icon: 'tool-wrench', vehicleId: downtime.vehicleId || '',
    });
  }

  // Fleet Optimization Opportunity — the top optimization (positive).
  if (opt.length) {
    out.push({
      id: 'optimization', key: 'fleetOptimization', title: 'Peluang Optimasi Armada',
      subject: opt[0].vehicleName, value: 'Peluang',
      detail: opt[0].reason,
      tone: 'ok', icon: 'analytics', vehicleId: '',
    });
  }

  // Lowest Effort Improvement — a real benefit at the lowest urgency (preventive /
  // monitoring), most-confident first. Answers "lowest effort".
  const lowEffort = actionable
    .filter((r) => r.category === 'preventive' || r.category === 'monitoring')
    .sort((a, b) => num(b.confidence.score) - num(a.confidence.score))[0];
  if (lowEffort && (!out.length || lowEffort.vehicleId !== out[0].vehicleId)) {
    out.push({
      id: 'low-effort', key: 'lowestEffort', title: 'Perbaikan Termudah',
      subject: lowEffort.vehicleName, value: lowEffort.categoryLabel,
      detail: 'Perbaikan berdampak dengan usaha minimal.',
      tone: 'info', icon: 'check', vehicleId: lowEffort.vehicleId || '',
    });
  }

  return Object.freeze(out.map((o) => Object.freeze(o)));
}

function impactRank(r) {
  const k = r && r.estimatedImpact && r.estimatedImpact.key;
  return k === 'high' ? 3 : k === 'medium' ? 2 : k === 'low' ? 1 : 0;
}

/* ── No Recommendation State ──────────────────────────────────────────────────
   When no operational action is required, return a POSITIVE enterprise message
   (spec: "Fleet operating normally… maintain regular monitoring"), never an
   alarmist or empty void. */
export function noRecommendationState(model) {
  const board = recommendationBoard(model);
  return Object.freeze({
    healthy: board.isHealthyFleet,
    title: 'Armada Beroperasi Normal',
    messages: Object.freeze([
      'Tidak ada intervensi yang direkomendasikan selama jendela prediksi saat ini.',
      'Seluruh kendaraan diproyeksikan tetap siap beroperasi.',
      'Pertahankan pemantauan rutin untuk deteksi dini.',
    ]),
  });
}

export default {
  recommendationBoard,
  recommendationTimeline,
  decisionSupport,
  noRecommendationState,
};
