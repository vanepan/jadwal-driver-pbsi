/* ============================================================
   SCENARIO-COMPARISON.JS — Scenario Simulation Engine (v1.19.8)

   Turns a SimulationRun (current model + simulated model) into the executive
   comparison the panel and drawer present: the Current-vs-Simulation metric
   deltas, the recommendation changes, the executive impact summary, and the
   simulation timeline.

   ── PURE DERIVATION ONLY ─────────────────────────────────────────────────────
   Computes NO prediction. It only ARRANGES two already-certified models produced
   by the Prediction Service, reusing the PURE Fleet Explainability layer (dominant
   risk / confidence) and the Fleet Recommendation Engine (per-vehicle
   recommendation) — never a prediction engine. Deterministic + node-testable.

   API (all pure):
     buildComparison(run)   → { ok, metrics, recommendationChanges, byId,
                                impact, timeline, confidence, window }
   ============================================================ */

'use strict';

import { dominantRisk, confidenceAnalytics } from '../prediction/explainability.js';
import { buildVehicleRecommendation } from '../recommendation/fleet-recommendation-engine.js';
import { priorityRank } from '../recommendation/recommendation-priority.js';

function arr(v) { return Array.isArray(v) ? v : []; }
function num(v) { return typeof v === 'number' && Number.isFinite(v) ? v : 0; }
function round(v) { return Math.round(num(v)); }
function avg(list) { const a = list.filter((x) => typeof x === 'number' && Number.isFinite(x)); return a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0; }

const isCrit = (v) => { const l = dominantRisk(v).pred.level; return l === 'HIGH' || l === 'CRITICAL'; };
const isWatch = (v) => !isCrit(v) && dominantRisk(v).pred.level === 'ELEVATED';
const isHealthy = (v) => !isCrit(v) && !isWatch(v);
const availableNext = (v) => { const l = (v.availabilityForecast || {}).level; return l === 'LOW' || l === 'MODERATE'; };
const maintNeed = (v) => { const l = (v.maintenanceRisk || {}).level; return l === 'HIGH' || l === 'CRITICAL'; };

/* Fleet-level statistics — the same tallies the dashboard headlines, so the
   comparison never disagrees with the page it sits on. */
function fleetStats(model) {
  const vehicles = arr(model && model.vehicles).filter(Boolean);
  const total = vehicles.length;
  const healthy = vehicles.filter(isHealthy).length;
  const available = vehicles.filter(availableNext).length;
  const maint = vehicles.filter(maintNeed).length;
  const util = avg(vehicles.map((v) => (v.utilizationTrend || {}).current));
  const downtime = avg(vehicles.map((v) => num((v.availabilityForecast || {}).score)));
  const readiness = avg(vehicles.map((v) => 100 - num(dominantRisk(v).pred.score)));
  // Fleet's most urgent recommendation priority (rank 0 = most urgent).
  let topRank = null; let topLabel = 'Informasional'; let topTone = 'ok';
  for (const v of vehicles) {
    const rec = buildVehicleRecommendation(v);
    if (rec && (topRank == null || rec.rank < topRank)) { topRank = rec.rank; topLabel = rec.priority.label; topTone = rec.priority.tone; }
  }
  return {
    total,
    fleetHealth: total ? round((healthy / total) * 100) : 0,
    availability: total ? round((available / total) * 100) : 0,
    utilization: round(util),
    downtimeRisk: round(downtime),
    maintenance: maint,
    readiness: round(readiness),
    topPriorityRank: topRank == null ? priorityRank('informational') : topRank,
    topPriorityLabel: topLabel,
    topPriorityTone: topTone,
  };
}

/* Build one comparison metric. `higherIsBetter` decides the tone of a change;
   `neutral` metrics (utilisation) only report the direction. */
function metric(key, label, cur, sim, opts = {}) {
  const unit = opts.unit || '';
  const delta = round(sim) - round(cur);
  const dir = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
  let tone = 'info';
  if (!opts.neutral && delta !== 0) {
    const good = opts.higherIsBetter ? delta > 0 : delta < 0;
    tone = good ? 'ok' : 'danger';
  }
  const sign = delta > 0 ? '+' : '';
  return {
    key, label,
    current: `${round(cur)}${unit}`,
    simulated: `${round(sim)}${unit}`,
    delta, deltaText: dir === 'flat' ? 'Tetap' : `${sign}${delta}${unit}`,
    direction: dir, tone,
  };
}

/* ── Recommendation change (per vehicle) ─────────────────────────────────────── */

function recSnapshot(projection) {
  const rec = buildVehicleRecommendation(projection);
  if (!rec) return null;
  return {
    category: rec.category, categoryLabel: rec.categoryLabel,
    priorityKey: rec.priority.key, priorityLabel: rec.priority.label, priorityTone: rec.priority.tone,
    priorityRank: rec.rank,
    confidenceScore: rec.confidence.score, confidenceWord: rec.confidence.levelWord,
    benefit: rec.expectedBenefit, impactLabel: rec.estimatedImpact.label, impactTone: rec.estimatedImpact.tone,
    title: rec.title,
  };
}

function changeFor(curV, simV) {
  const before = recSnapshot(curV);
  const after = recSnapshot(simV);
  if (!before || !after) return null;
  const changed = {
    priority: before.priorityKey !== after.priorityKey,
    confidence: before.confidenceWord !== after.confidenceWord,
    benefit: before.benefit !== after.benefit,
    impact: before.impactLabel !== after.impactLabel,
    category: before.category !== after.category,
  };
  const any = Object.values(changed).some(Boolean);
  // Direction of the priority move (rank 0 = most urgent → a lower rank is worse).
  const priorityDir = after.priorityRank < before.priorityRank ? 'worse'
    : after.priorityRank > before.priorityRank ? 'better' : 'same';
  return {
    vehicleId: String(simV.id != null ? simV.id : simV.name),
    vehicleName: String(simV.name || '—'),
    before, after, changed, any, priorityDir,
  };
}

/* ── Impact summary + timeline ───────────────────────────────────────────────── */

function impactSummary(run, metrics, targetChange) {
  const scenario = run.scenario;
  const title = scenario ? scenario.describe(run.params, run.targetName) : 'Simulasi skenario';
  const lines = [];
  const wanted = ['fleetHealth', 'availability', 'downtimeRisk', 'maintenance', 'readiness'];
  for (const m of metrics) {
    if (wanted.includes(m.key) && m.direction !== 'flat') {
      lines.push({ label: m.label, value: m.deltaText, tone: m.tone });
    }
  }
  if (targetChange && targetChange.changed.priority) {
    lines.push({
      label: 'Rekomendasi',
      value: `${targetChange.before.priorityLabel} → ${targetChange.after.priorityLabel}`,
      tone: targetChange.priorityDir === 'worse' ? 'danger' : targetChange.priorityDir === 'better' ? 'ok' : 'info',
    });
  }
  const conf = run.simMeta && run.simMeta.predictionConfidence;
  const curConf = run.currentMeta && run.currentMeta.predictionConfidence;
  if (conf && curConf) {
    lines.push({
      label: 'Keyakinan',
      value: conf.score === curConf.score ? 'Tidak berubah' : `${curConf.score}% → ${conf.score}%`,
      tone: 'info',
    });
  }
  if (!lines.length) lines.push({ label: 'Dampak', value: 'Tidak ada perubahan berarti', tone: 'ok' });
  return { title, lines };
}

/* Qualitative horizon narrative. Only the 7-day figures are certified; the 14/30
   day steps describe whether the effect compounds or eases — never a fabricated
   per-day number. */
function simulationTimeline(run, metrics) {
  const primary = metrics.find((m) => m.key === 'readiness') || metrics.find((m) => m.key === 'fleetHealth');
  const dir = primary ? primary.direction : 'flat';
  const tone = primary ? primary.tone : 'info';
  const worse = dir === 'down' && tone === 'danger';
  const better = tone === 'ok' && dir !== 'flat';
  const scenario = run.scenario;
  return [
    { when: 'Hari Ini', tone: 'info', title: 'Kondisi saat ini', detail: 'Baseline sebelum skenario diterapkan.' },
    { when: 'Titik Simulasi', tone: scenario ? (scenario.tone || 'info') : 'info', title: 'Skenario diterapkan',
      detail: scenario ? scenario.describe(run.params, run.targetName) : '—' },
    { when: '7 Hari', tone, title: 'Proyeksi tersimulasi',
      detail: primary ? `${primary.label} ${primary.simulated} (${primary.deltaText}).` : 'Proyeksi diperbarui.' },
    { when: '14 Hari', tone, title: worse ? 'Tekanan berlanjut' : better ? 'Perbaikan bertahan' : 'Tren stabil',
      detail: worse ? 'Dampak diproyeksikan berlanjut bila skenario dijalankan.'
        : better ? 'Perbaikan diproyeksikan bertahan.' : 'Tidak ada perubahan tren yang berarti.' },
    { when: '30 Hari', tone, title: worse ? 'Risiko terakumulasi' : better ? 'Kesiapan membaik' : 'Pemantauan rutin',
      detail: worse ? 'Tanpa tindakan, risiko cenderung terakumulasi.'
        : better ? 'Kesiapan armada cenderung membaik.' : 'Lanjutkan pemantauan rutin.' },
  ];
}

/**
 * Build the full comparison for a SimulationRun.
 * @param {Object} run  runSimulation() output
 * @returns {Object}
 */
export function buildComparison(run) {
  if (!run || !run.simModel || run.ok === false) {
    return {
      ok: false,
      error: (run && run.error) || { code: 'NO_RESULT', message: 'Simulasi tidak menghasilkan proyeksi.' },
      metrics: [], recommendationChanges: [], byId: {},
      impact: { title: run && run.scenario ? run.scenario.describe(run.params, run.targetName) : 'Simulasi',
        lines: [{ label: 'Status', value: 'Proyeksi tersimulasi belum tersedia', tone: 'warn' }] },
      timeline: [], confidence: null, window: '7 Hari',
    };
  }

  const cur = fleetStats(run.currentModel);
  const sim = fleetStats(run.simModel);

  const metrics = [
    metric('fleetHealth', 'Fleet Health', cur.fleetHealth, sim.fleetHealth, { unit: '%', higherIsBetter: true }),
    metric('availability', 'Ketersediaan', cur.availability, sim.availability, { unit: '%', higherIsBetter: true }),
    metric('utilization', 'Utilisasi', cur.utilization, sim.utilization, { unit: '%', neutral: true }),
    metric('downtimeRisk', 'Risiko Downtime', cur.downtimeRisk, sim.downtimeRisk, { unit: '', higherIsBetter: false }),
    metric('maintenance', 'Prakiraan Perawatan', cur.maintenance, sim.maintenance, { unit: '', higherIsBetter: false }),
    metric('readiness', 'Kesiapan Operasional', cur.readiness, sim.readiness, { unit: '%', higherIsBetter: true }),
  ];
  // Recommendation Priority — a labelled metric (not numeric).
  const prioDir = sim.topPriorityRank < cur.topPriorityRank ? 'up'
    : sim.topPriorityRank > cur.topPriorityRank ? 'down' : 'flat';
  metrics.push({
    key: 'recommendationPriority', label: 'Prioritas Rekomendasi',
    current: cur.topPriorityLabel, simulated: sim.topPriorityLabel,
    delta: 0, deltaText: prioDir === 'flat' ? 'Tetap' : (prioDir === 'up' ? 'Meningkat' : 'Menurun'),
    direction: prioDir,
    tone: prioDir === 'up' ? 'danger' : prioDir === 'down' ? 'ok' : 'info',
  });

  // Recommendation changes: the target vehicle always, plus any other vehicle
  // whose recommendation changed (fleet-wide scenarios). Deterministic order.
  const simById = new Map(arr(run.simModel.vehicles).map((v) => [String(v.id != null ? v.id : v.name), v]));
  const curById = new Map(arr(run.currentModel.vehicles).map((v) => [String(v.id != null ? v.id : v.name), v]));
  const changes = [];
  const byId = {};
  const seen = new Set();
  const pushChange = (id) => {
    if (seen.has(id)) return;
    const c = simById.has(id) && curById.has(id) ? changeFor(curById.get(id), simById.get(id)) : null;
    if (!c) return;
    seen.add(id);
    byId[id] = c;
    changes.push(c);
  };
  if (run.targetId && run.targetId !== 'all' && run.scenario && run.scenario.scope === 'vehicle') pushChange(run.targetId);
  for (const id of simById.keys()) {
    if (!curById.has(id)) continue; // new (simulated) vehicles have no "before"
    const c = changeFor(curById.get(id), simById.get(id));
    if (c && c.any) pushChange(id);
  }
  // Rank the changed ones most-urgent-after first (target stays first if present).
  const targetFirst = changes.filter((c) => c.vehicleId === run.targetId);
  const rest = changes.filter((c) => c.vehicleId !== run.targetId)
    .sort((a, b) => a.after.priorityRank - b.after.priorityRank || a.vehicleName.localeCompare(b.vehicleName));
  const ordered = [...targetFirst, ...rest];

  const targetChange = byId[run.targetId] || ordered[0] || null;
  const impact = impactSummary(run, metrics, targetChange);
  const timeline = simulationTimeline(run, metrics);

  const cc = run.currentMeta && run.currentMeta.predictionConfidence;
  const sc = run.simMeta && run.simMeta.predictionConfidence;
  const confidence = (cc && sc) ? {
    current: cc, simulated: sc, changed: cc.score !== sc.score || cc.level !== sc.level,
  } : null;

  return { ok: true, metrics, recommendationChanges: ordered, byId, impact, timeline, confidence, window: '7 Hari' };
}

export default { buildComparison };
