/* ============================================================
   RECOMMENDATION-ACCURACY-ENGINE.JS — Recommendation Accuracy Engine
   (v1.17.1)

   Extends v1.17.0 Dispatch Intelligence Analytics with ONE question:

     "How ACCURATE is the Dispatch Intelligence recommendation over time?"

   (v1.17.0 answered only "how MANY recommendations were generated".)

   It sits BETWEEN persistence and the Dispatch Analytics dashboard as a second,
   read-only analytics model. It changes NO operational behaviour — no approval,
   no recommendation, no scoring, no schema. Read-only intelligence.

   ── SINGLE SOURCE OF TRUTH ──────────────────────────────────────────────────
   This engine adds NO new business logic. Every metric is built by REUSING the
   calculations the subsystem already owns and only AGGREGATING / RESHAPING them:
     - acceptance / accuracy / per-driver / per-vehicle  → override-workflow-service.js
       (computeOverrideStats / computeAllDriverAccuracy / computeAllVehicleAccuracy /
        computeDriverAccuracy / computeVehicleAccuracy / OVERRIDE_OUTCOME)
     - confidence banding (the SAME 4-band scale as the approval panel)
                                                          → dispatch-presentation.js
       (confidenceFromScore — no second confidence scale is created here)
     - dispatch score                                    → the value the Dispatch
       Scoring Engine already stored on each recommendation / decision (NOT re-scored;
       historical availability state is not persisted, so re-running the engine would
       be dishonest — the stored output IS the engine's output).
     - executive insights                                → the analytics insight
       contract ({ type, title, description, source, priority }); each finding is a
       VERIFIED observation derived from the metrics above (no generated AI text).

   CONFIDENCE OF A RECOMMENDATION: banded from the RECOMMENDED dispatch score (the
   recommendation store, joined recommendationId → requestId), falling back to the
   decision's stored score for legacy logs without a recommendation record. (For an
   ACCEPTED decision the two scores are identical; they differ only on an override —
   which is exactly what "False High Confidence" measures.)

   PURE: no DOM, no Firebase, no `window`. Every input is passed in, so the whole
   model is node-testable (scripts/recommendation-accuracy-check.mjs).
   ============================================================ */

'use strict';

import {
  OVERRIDE_OUTCOME,
  computeOverrideStats,
  computeAllDriverAccuracy,
  computeAllVehicleAccuracy,
  computeDriverAccuracy,
  computeVehicleAccuracy,
} from '../services/override-workflow-service.js';
import { confidenceFromScore } from '../services/dispatch-presentation.js';

/* ── small numeric / time helpers (utility, not business logic) ─────────── */

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function rate(part, whole) { return whole > 0 ? Math.round((part / whole) * 100) : 0; }
function mean(list) { return list.length ? Math.round(list.reduce((s, n) => s + n, 0) / list.length) : 0; }
function mean1(list) { return list.length ? Math.round((list.reduce((s, n) => s + n, 0) / list.length) * 10) / 10 : 0; }
function ms(v) { const t = v ? Date.parse(v) : NaN; return Number.isNaN(t) ? 0 : t; }
function normName(v) { return String(v == null ? '' : v).trim().toLowerCase(); }

function dayKey(v) {
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function monthKey(v) { return dayKey(v).slice(0, 7); }
function monthLabel(key) {
  const [y, m] = String(key).split('-');
  const mo = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'][Number(m) - 1] || '';
  return mo ? `${mo} ${y}` : String(key);
}
function shiftDays(date, delta) {
  const d = new Date(date);
  d.setDate(d.getDate() + delta);
  d.setHours(0, 0, 0, 0);
  return d;
}

/* ── identity resolution (id → display name) ──────────────────────────── */

function buildNameIndex(records, idKeys, nameKey) {
  const byId = new Map();
  for (const r of (Array.isArray(records) ? records : [])) {
    if (!r || typeof r !== 'object') continue;
    const name = r[nameKey] != null ? String(r[nameKey]) : '';
    for (const k of idKeys) {
      if (r[k] != null && r[k] !== '') byId.set(String(r[k]), name);
    }
  }
  return byId;
}
function resolveName(index, id, fallbackLabel) {
  if (id == null || id === '') return fallbackLabel;
  const hit = index.get(String(id));
  return hit || String(id);
}

/* ── recommendation join (recommendationId → recommended score / reason) ── */

function normalizeRecs(recs) {
  if (Array.isArray(recs)) return recs.filter((r) => r && typeof r === 'object');
  if (recs && typeof recs === 'object') return Object.values(recs).filter((r) => r && typeof r === 'object');
  return [];
}

/** Map requestId → recommendation record (for recommended-score banding). */
function buildRecIndex(recs) {
  const byId = new Map();
  for (const r of recs) {
    const id = r.requestId != null ? String(r.requestId) : '';
    if (id) byId.set(id, r);
  }
  return byId;
}

/** The confidence the recommendation CARRIED — the RECOMMENDED dispatch score
 *  (falls back to the decision's stored score for legacy logs). */
function recScore(log, recIndex) {
  const rec = recIndex.get(String(log.recommendationId));
  const rs = rec ? Number(rec.dispatchScore) : NaN;
  return Number.isFinite(rs) ? rs : num(log.dispatchScore);
}

/** The score difference an override caused: recommended − selected (drop > 0
 *  means the admin chose a lower-scoring dispatch). NaN-safe. */
function scoreDrop(log, recIndex) {
  return recScore(log, recIndex) - num(log.dispatchScore);
}

/* ── main entry ───────────────────────────────────────────────────────── */

/**
 * Compute the complete Recommendation Accuracy model.
 *
 * @param {Object} input
 * @param {Array<Object>} input.overrideLogs            the admin decision log (source of truth)
 * @param {Object|Array}  [input.requestRecommendations] stored recommendation map (by requestId) or array
 * @param {Array<Object>} [input.requests]              request records (bidang join — optional)
 * @param {Array<Object>} [input.drivers]              driver registry (id → name)
 * @param {Array<Object>} [input.vehicles]             vehicle registry (id → name)
 * @param {Date|string}   [input.now]                  "today" reference (default: real now)
 * @returns {Object} the accuracy model (one block per spec feature 1–10)
 */
export function computeRecommendationAccuracyModel(input = {}) {
  const logs = (Array.isArray(input.overrideLogs) ? input.overrideLogs : []).filter((l) => l && typeof l === 'object');
  const recIndex = buildRecIndex(normalizeRecs(input.requestRecommendations));
  const now = input.now ? new Date(input.now) : new Date();

  const driverIndex = buildNameIndex(input.drivers, ['id', 'driverId'], 'name');
  const vehicleIndex = buildNameIndex(input.vehicles, ['id', 'vehicleId'], 'name');

  return {
    generatedAt: new Date().toISOString(),
    totals: buildTotals(logs),
    kpi: buildOverallKpi(logs, recIndex, now),                        // Feature 1
    driverAccuracy: buildEntityAccuracy(logs, recIndex, 'driver', driverIndex),   // Feature 2
    vehicleAccuracy: buildEntityAccuracy(logs, recIndex, 'vehicle', vehicleIndex), // Feature 3
    calibration: buildCalibration(logs, recIndex),                   // Feature 4
    severity: buildSeverity(logs, recIndex, driverIndex, vehicleIndex), // Feature 5
    reasonAnalytics: buildReasonAnalytics(logs),                     // Feature 6
    falseHighConfidence: buildFalseHighConfidence(logs, recIndex, driverIndex, vehicleIndex), // Feature 7
    unexpectedAcceptance: buildUnexpectedAcceptance(logs, recIndex, driverIndex, vehicleIndex), // Feature 8
    learningTrend: buildLearningTrend(logs, recIndex, now),          // Feature 9
    insights: buildInsights(logs, recIndex, driverIndex, vehicleIndex), // Feature 10
  };
}

/* ── outcome tallies (one pass helper) ────────────────────────────────── */

function tallyOutcomes(logs) {
  const t = { total: logs.length, accepted: 0, driver: 0, vehicle: 0, full: 0 };
  for (const l of logs) {
    if (l.outcome === OVERRIDE_OUTCOME.ACCEPTED) t.accepted++;
    else if (l.outcome === OVERRIDE_OUTCOME.DRIVER_OVERRIDE) t.driver++;
    else if (l.outcome === OVERRIDE_OUTCOME.VEHICLE_OVERRIDE) t.vehicle++;
    else if (l.outcome === OVERRIDE_OUTCOME.FULL_OVERRIDE) t.full++;
  }
  return t;
}

function buildTotals(logs) {
  const s = computeOverrideStats(logs);
  return { decisions: s.total, accepted: s.accepted, overridden: s.overridden };
}

/* ── Feature 1 — Overall Recommendation Accuracy ──────────────────────── */

/** The KPI summary over a set of logs (reused for current/previous period). */
function periodSummary(logs, recIndex) {
  const s = computeOverrideStats(logs);            // single source: override service
  const t = tallyOutcomes(logs);
  const scores = logs.map((l) => recScore(l, recIndex));
  const avgScore = mean(scores);
  return {
    decisions: s.total,
    // Recommendation Accuracy == Acceptance Rate (recommendations accepted as-is).
    recommendationAccuracy: s.acceptanceRate,
    acceptanceRate: s.acceptanceRate,
    overrideRate: rate(s.overridden, s.total),
    driverOverrideRate: rate(t.driver + t.full, s.total),   // driver changed (alone or with vehicle)
    vehicleOverrideRate: rate(t.vehicle + t.full, s.total), // vehicle changed (alone or with driver)
    fullOverrideRate: rate(t.full, s.total),
    avgDispatchScore: avgScore,
  };
}

function buildOverallKpi(logs, recIndex, now) {
  const cur = periodSummary(logs, recIndex);
  const scores = logs.map((l) => recScore(l, recIndex));
  const avgStars = logs.length ? mean1(logs.map((l) => confidenceFromScore(recScore(l, recIndex)).stars)) : 0;
  const conf = confidenceFromScore(cur.avgDispatchScore);

  // Previous-period comparison: trailing 30 days vs the 30 days before that.
  const curFrom = shiftDays(now, -29).getTime();
  const prevFrom = shiftDays(now, -59).getTime();
  const curLogs = logs.filter((l) => ms(l.timestamp) >= curFrom);
  const prevLogs = logs.filter((l) => ms(l.timestamp) >= prevFrom && ms(l.timestamp) < curFrom);
  const curP = periodSummary(curLogs, recIndex);
  const prevP = periodSummary(prevLogs, recIndex);

  return {
    ...cur,
    avgConfidence: { stars: avgStars, label: conf.label, glyph: conf.glyph, score: cur.avgDispatchScore },
    sampleSize: cur.decisions,
    previousPeriod: {
      label: '30 hari terakhir vs 30 hari sebelumnya',
      current: curP,
      previous: prevP,
      delta: {
        recommendationAccuracy: curP.recommendationAccuracy - prevP.recommendationAccuracy,
        acceptanceRate: curP.acceptanceRate - prevP.acceptanceRate,
        overrideRate: curP.overrideRate - prevP.overrideRate,
        avgDispatchScore: curP.avgDispatchScore - prevP.avgDispatchScore,
      },
    },
  };
}

/* ── Feature 2 & 3 — Driver / Vehicle Recommendation Accuracy ─────────── */

/**
 * Per-entity recommendation accuracy. ONE common engine for both driver and
 * vehicle (no duplicated code) — the `side` selects the override-service helpers
 * and the id/field names.
 * @param {string} side  'driver' | 'vehicle'
 */
function buildEntityAccuracy(logs, recIndex, side, nameIndex) {
  const isDriver = side === 'driver';
  const idField = isDriver ? 'recommendedDriverId' : 'recommendedVehicleId';
  const selField = isDriver ? 'selectedDriverId' : 'selectedVehicleId';
  const accuracyAll = isDriver ? computeAllDriverAccuracy(logs) : computeAllVehicleAccuracy(logs);
  const accuracyOne = isDriver ? computeDriverAccuracy : computeVehicleAccuracy;
  const idKey = isDriver ? 'driverId' : 'vehicleId';
  const fallback = isDriver ? 'Driver tidak dikenal' : 'Kendaraan tidak dikenal';

  const rows = accuracyAll.map((a) => {
    const id = a[idKey];
    const one = accuracyOne(logs, id);                 // { recommended, accepted, accuracy }
    const mine = logs.filter((l) => String(l[idField]) === String(id));
    // Full acceptance = of this entity's recommendations, how many were taken
    // AS-IS (whole dispatch ACCEPTED). Distinct from `accuracy` (this side kept,
    // even if the OTHER side changed).
    const fullyAccepted = mine.filter((l) => l.outcome === OVERRIDE_OUTCOME.ACCEPTED).length;
    const overrides = mine.filter((l) => String(l[selField]) !== String(id));
    const drops = overrides.map((l) => Math.abs(scoreDrop(l, recIndex)));
    return {
      id: String(id),
      name: resolveName(nameIndex, id, fallback),
      recommendations: one.recommended,
      accepted: one.accepted,
      overridden: one.recommended - one.accepted,
      accuracyPct: one.accuracy,                       // kept-rate (single source: override service)
      acceptancePct: rate(fullyAccepted, one.recommended),
      avgDispatchScore: mean(mine.map((l) => recScore(l, recIndex))),
      avgConfidenceStars: mine.length ? mean1(mine.map((l) => confidenceFromScore(recScore(l, recIndex)).stars)) : 0,
      avgOverrideDifference: mean1(drops),             // avg score the override gave up
    };
  });

  // Ranking: accuracy desc → recommendations desc → name (deterministic).
  const ranked = [...rows].sort((a, b) =>
    b.accuracyPct - a.accuracyPct || b.recommendations - a.recommendations || a.name.localeCompare(b.name, 'id'));
  ranked.forEach((r, i) => { r.ranking = i + 1; });

  return { rows: ranked };
}

/* ── Feature 4 — Confidence Calibration ───────────────────────────────── */

function starLabel(stars) {
  return ({ 5: 'Sangat Tinggi', 4: 'Tinggi', 3: 'Sedang', 2: 'Perlu Review', 1: 'Rendah' })[stars] || '';
}

function buildCalibration(logs, recIndex) {
  // 5★ → 2★ (confidenceFromScore floors at 2★, so 1★ is empty by definition and
  // is omitted from the calibration scale).
  const rows = [5, 4, 3, 2].map((s) => ({
    stars: s, glyph: '★'.repeat(s) + '☆'.repeat(5 - s), label: starLabel(s),
    generated: 0, accepted: 0, overridden: 0, scores: [],
  }));
  const byStars = new Map(rows.map((r) => [r.stars, r]));
  for (const l of logs) {
    const band = confidenceFromScore(recScore(l, recIndex));
    const row = byStars.get(band.stars);
    if (!row) continue;
    row.generated++;
    if (l.outcome === OVERRIDE_OUTCOME.ACCEPTED) row.accepted++; else row.overridden++;
    row.scores.push(recScore(l, recIndex));
  }
  return {
    buckets: rows.map((r) => ({
      stars: r.stars, glyph: r.glyph, label: r.label,
      generated: r.generated, accepted: r.accepted, overridden: r.overridden,
      acceptancePct: rate(r.accepted, r.generated),
      avgDispatchScore: mean(r.scores),
    })),
  };
}

/* ── Feature 5 — Override Severity ────────────────────────────────────── */

const SEVERITY_BANDS = Object.freeze([
  { key: 'minor', label: 'Minor', min: 0 },
  { key: 'medium', label: 'Medium', min: 5 },
  { key: 'major', label: 'Major', min: 15 },
  { key: 'critical', label: 'Critical', min: 30 },
]);

function severityBand(diff) {
  const d = Math.abs(diff);
  let band = SEVERITY_BANDS[0];
  for (const b of SEVERITY_BANDS) if (d >= b.min) band = b;
  return band;
}

function buildSeverity(logs, recIndex, driverIndex, vehicleIndex) {
  const overrides = logs.filter((l) => l.overridden || l.outcome !== OVERRIDE_OUTCOME.ACCEPTED);
  const counts = { minor: 0, medium: 0, major: 0, critical: 0 };
  const combined = [];
  const driverDiffs = [];   // diffs on decisions where the driver changed
  const vehicleDiffs = [];  // diffs on decisions where the vehicle changed
  const cases = [];

  for (const l of overrides) {
    const diff = Math.abs(scoreDrop(l, recIndex));
    combined.push(diff);
    const band = severityBand(diff);
    counts[band.key]++;
    const driverChanged = l.outcome === OVERRIDE_OUTCOME.DRIVER_OVERRIDE || l.outcome === OVERRIDE_OUTCOME.FULL_OVERRIDE;
    const vehicleChanged = l.outcome === OVERRIDE_OUTCOME.VEHICLE_OVERRIDE || l.outcome === OVERRIDE_OUTCOME.FULL_OVERRIDE;
    if (driverChanged) driverDiffs.push(diff);
    if (vehicleChanged) vehicleDiffs.push(diff);
    cases.push({
      requestId: String(l.recommendationId || ''),
      outcome: l.outcome,
      severity: band.key,
      severityLabel: band.label,
      recommendedScore: Math.round(recScore(l, recIndex)),
      selectedScore: Math.round(num(l.dispatchScore)),
      combinedDifference: Math.round(diff),
      driverName: resolveName(driverIndex, l.selectedDriverId, '—'),
      vehicleName: resolveName(vehicleIndex, l.selectedVehicleId, '—'),
      reason: l.reason != null ? String(l.reason) : '',
      timestamp: l.timestamp || '',
    });
  }

  const total = overrides.length;
  return {
    totalOverrides: total,
    avgDriverDifference: mean1(driverDiffs),
    avgVehicleDifference: mean1(vehicleDiffs),
    avgCombinedDifference: mean1(combined),
    categories: SEVERITY_BANDS.map((b) => ({
      key: b.key, label: b.label, count: counts[b.key], percentage: rate(counts[b.key], total),
    })),
    worstCases: cases.sort((a, b) => b.combinedDifference - a.combinedDifference || ms(b.timestamp) - ms(a.timestamp)).slice(0, 10),
  };
}

/* ── Feature 6 — Override Reason Analytics ────────────────────────────── */

/** Keyword → reason category. Free-text override reasons are bucketed into the
 *  executive categories; anything unmatched is "Lainnya". */
const REASON_CATEGORIES = Object.freeze([
  { key: 'maintenance', label: 'Maintenance', kw: ['servis', 'service', 'maintenance', 'perawatan', 'rusak', 'perbaikan', 'bengkel'] },
  { key: 'driver_unavailable', label: 'Driver Tidak Tersedia', kw: ['driver tidak', 'sopir tidak', 'cuti', 'sakit', 'izin', 'tidak tersedia', 'unavailable', 'berhalangan'] },
  { key: 'schedule_conflict', label: 'Konflik Jadwal', kw: ['konflik', 'bentrok', 'jadwal', 'overlap', 'tumpang', 'conflict', 'bertabrakan'] },
  { key: 'admin_preference', label: 'Preferensi Admin', kw: ['preferensi', 'permintaan', 'senior', 'familiar', 'lebih cocok', 'pilihan', 'khusus', 'kapasitas'] },
]);

function categorizeReason(reason) {
  const t = normName(reason);
  if (!t) return { key: 'other', label: 'Lainnya' };
  for (const c of REASON_CATEGORIES) {
    if (c.kw.some((k) => t.includes(k))) return { key: c.key, label: c.label };
  }
  return { key: 'other', label: 'Lainnya' };
}

function buildReasonAnalytics(logs) {
  const overrides = logs.filter((l) => l.overridden || l.outcome !== OVERRIDE_OUTCOME.ACCEPTED);
  const withReason = overrides.filter((l) => String(l.reason || '').trim());

  // Top raw reasons (exact text).
  const rawCounts = new Map();
  for (const l of withReason) {
    const t = String(l.reason).trim();
    rawCounts.set(t, (rawCounts.get(t) || 0) + 1);
  }
  const topReasons = [...rawCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'id'))
    .slice(0, 10)
    .map(([text, count]) => ({ text, count, percentage: rate(count, withReason.length) }));

  // Category breakdown (Maintenance / Driver Unavailable / Schedule Conflict /
  // Admin Preference / Other) over ALL overrides (unreasoned → Lainnya).
  const catDefs = [...REASON_CATEGORIES.map((c) => ({ key: c.key, label: c.label })), { key: 'other', label: 'Lainnya' }];
  const catCounts = new Map(catDefs.map((c) => [c.key, 0]));
  const monthBuckets = new Map();
  for (const l of overrides) {
    const cat = categorizeReason(l.reason);
    catCounts.set(cat.key, (catCounts.get(cat.key) || 0) + 1);
    const mk = monthKey(l.timestamp);
    if (!mk) continue;
    if (!monthBuckets.has(mk)) monthBuckets.set(mk, { key: mk, total: 0, cats: new Map() });
    const b = monthBuckets.get(mk);
    b.total++;
    b.cats.set(cat.key, (b.cats.get(cat.key) || 0) + 1);
  }
  const categories = catDefs.map((c) => ({
    key: c.key, label: c.label, count: catCounts.get(c.key) || 0,
    percentage: rate(catCounts.get(c.key) || 0, overrides.length),
  })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'id'));

  const monthlyTrend = [...monthBuckets.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((b) => {
      let topKey = ''; let topN = -1;
      for (const [k, n] of b.cats.entries()) if (n > topN) { topN = n; topKey = k; }
      const topDef = catDefs.find((c) => c.key === topKey);
      return { key: b.key, label: monthLabel(b.key), total: b.total, topCategory: topDef ? topDef.label : '—' };
    });

  return { totalOverrides: overrides.length, reasonedOverrides: withReason.length, topReasons, categories, monthlyTrend };
}

/* ── Feature 7 — False High Confidence ────────────────────────────────── */

function buildFalseHighConfidence(logs, recIndex, driverIndex, vehicleIndex) {
  const fiveStar = logs.filter((l) => confidenceFromScore(recScore(l, recIndex)).stars === 5);
  const overridden = fiveStar.filter((l) => l.outcome !== OVERRIDE_OUTCOME.ACCEPTED);
  const worstCases = overridden
    .map((l) => ({
      requestId: String(l.recommendationId || ''),
      outcome: l.outcome,
      recommendedScore: Math.round(recScore(l, recIndex)),
      selectedScore: Math.round(num(l.dispatchScore)),
      drop: Math.round(Math.abs(scoreDrop(l, recIndex))),
      driverName: resolveName(driverIndex, l.selectedDriverId, '—'),
      vehicleName: resolveName(vehicleIndex, l.selectedVehicleId, '—'),
      reason: l.reason != null ? String(l.reason) : '',
      timestamp: l.timestamp || '',
    }))
    .sort((a, b) => b.drop - a.drop || ms(b.timestamp) - ms(a.timestamp))
    .slice(0, 10);
  return {
    total: fiveStar.length,
    overridden: overridden.length,
    falseHighConfidencePct: rate(overridden.length, fiveStar.length),
    worstCases,
  };
}

/* ── Feature 8 — Unexpected Acceptance ────────────────────────────────── */

function buildUnexpectedAcceptance(logs, recIndex, driverIndex, vehicleIndex) {
  // Conservative-scoring signal: 3★ + 2★ recommendations that were accepted as-is.
  const lowConf = logs.filter((l) => confidenceFromScore(recScore(l, recIndex)).stars <= 3);
  const accepted = lowConf.filter((l) => l.outcome === OVERRIDE_OUTCOME.ACCEPTED);
  const cases = accepted
    .map((l) => ({
      requestId: String(l.recommendationId || ''),
      stars: confidenceFromScore(recScore(l, recIndex)).stars,
      recommendedScore: Math.round(recScore(l, recIndex)),
      driverName: resolveName(driverIndex, l.selectedDriverId, '—'),
      vehicleName: resolveName(vehicleIndex, l.selectedVehicleId, '—'),
      timestamp: l.timestamp || '',
    }))
    .sort((a, b) => a.recommendedScore - b.recommendedScore || ms(b.timestamp) - ms(a.timestamp))
    .slice(0, 10);
  return {
    totalLowConfidence: lowConf.length,
    accepted: accepted.length,
    acceptancePct: rate(accepted.length, lowConf.length),
    cases,
  };
}

/* ── Feature 9 — Learning Trend ───────────────────────────────────────── */

function windowSummary(logs, recIndex) {
  const s = computeOverrideStats(logs);
  const scores = logs.map((l) => recScore(l, recIndex));
  const stars = logs.map((l) => confidenceFromScore(recScore(l, recIndex)).stars);
  return {
    total: s.total,
    recommendationAccuracy: s.acceptanceRate,
    acceptanceRate: s.acceptanceRate,
    overrideRate: rate(s.overridden, s.total),
    avgDispatchScore: mean(scores),
    avgConfidenceStars: stars.length ? mean1(stars) : 0,
  };
}

/** Monthly series of accuracy/score within a date-filtered set. */
function monthlySeries(logs, recIndex) {
  const buckets = new Map();
  for (const l of logs) {
    const k = monthKey(l.timestamp);
    if (!k) continue;
    if (!buckets.has(k)) buckets.set(k, { key: k, total: 0, accepted: 0, scores: [] });
    const b = buckets.get(k);
    b.total++;
    if (l.outcome === OVERRIDE_OUTCOME.ACCEPTED) b.accepted++;
    b.scores.push(recScore(l, recIndex));
  }
  return [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key)).map((b) => ({
    key: b.key, label: monthLabel(b.key), total: b.total,
    recommendationAccuracy: rate(b.accepted, b.total),
    overrideRate: rate(b.total - b.accepted, b.total),
    avgDispatchScore: mean(b.scores),
  }));
}

function buildLearningTrend(logs, recIndex, now) {
  const today = now instanceof Date ? now : new Date(now);
  const startOfYear = new Date(today.getFullYear(), 0, 1);
  const defs = [
    { key: '7d', label: '7 Hari', from: shiftDays(today, -6) },
    { key: '30d', label: '30 Hari', from: shiftDays(today, -29) },
    { key: '90d', label: '90 Hari', from: shiftDays(today, -89) },
    { key: 'ytd', label: 'YTD', from: startOfYear },
  ];
  return {
    windows: defs.map((w) => {
      const fromMs = w.from.getTime();
      const inWindow = logs.filter((l) => ms(l.timestamp) >= fromMs);
      return {
        key: w.key, label: w.label,
        ...windowSummary(inWindow, recIndex),
        series: monthlySeries(inWindow, recIndex),
      };
    }),
  };
}

/* ── Feature 10 — Executive Insights ──────────────────────────────────── */

/** Build executive findings (analytics insight contract). Each is a VERIFIED
 *  observation derived from the metrics above — no generated AI text. */
function buildInsights(logs, recIndex, driverIndex, vehicleIndex) {
  const out = [];
  if (!logs.length) return out;

  const overall = periodSummary(logs, recIndex);
  const drivers = buildEntityAccuracy(logs, recIndex, 'driver', driverIndex).rows;
  const vehicles = buildEntityAccuracy(logs, recIndex, 'vehicle', vehicleIndex).rows;
  const cal = buildCalibration(logs, recIndex).buckets;
  const reasons = buildReasonAnalytics(logs);
  const fhc = buildFalseHighConfidence(logs, recIndex, driverIndex, vehicleIndex);

  // Top driver accuracy.
  const topDriver = drivers.filter((d) => d.recommendations >= 2).sort((a, b) => b.accuracyPct - a.accuracyPct)[0];
  if (topDriver && topDriver.accuracyPct >= 80) {
    out.push({
      category: 'efficiency', type: 'success', priority: 3, source: 'Akurasi Driver',
      title: `${topDriver.name} menjaga akurasi ${topDriver.accuracyPct}%`,
      description: `Driver ${topDriver.name} mempertahankan akurasi rekomendasi ${topDriver.accuracyPct}% dari ${topDriver.recommendations} rekomendasi.`,
    });
  }

  // Most-overridden vehicle.
  const worstVehicle = vehicles.filter((v) => v.recommendations >= 2).sort((a, b) => b.overridden - a.overridden)[0];
  if (worstVehicle && worstVehicle.overridden > 0) {
    out.push({
      category: 'warning', type: 'warning', priority: 2, source: 'Override Kendaraan',
      title: `${worstVehicle.name} paling sering di-override`,
      description: `Rekomendasi ${worstVehicle.name} paling sering di-override (${worstVehicle.overridden} dari ${worstVehicle.recommendations}).`,
    });
  }

  // 5★ accuracy.
  const fiveStar = cal.find((b) => b.stars === 5);
  if (fiveStar && fiveStar.generated > 0) {
    out.push({
      category: 'trend', type: fiveStar.acceptancePct >= 90 ? 'success' : 'warning', priority: 3, source: 'Kalibrasi Confidence',
      title: `Rekomendasi ★★★★★ ${fiveStar.acceptancePct}% akurat`,
      description: `Rekomendasi confidence ★★★★★ tetap ${fiveStar.acceptancePct}% diterima tanpa perubahan (${fiveStar.generated} rekomendasi).`,
    });
  }

  // Dominant override reason category.
  const topCat = reasons.categories.find((c) => c.count > 0);
  if (topCat && topCat.percentage >= 25) {
    out.push({
      category: 'warning', type: 'info', priority: 2, source: 'Alasan Override',
      title: `${topCat.label} ${topCat.percentage}% dari override`,
      description: `${topCat.label} menyumbang ${topCat.percentage}% dari seluruh override yang tercatat.`,
    });
  }

  // False high confidence alarm.
  if (fhc.total > 0 && fhc.falseHighConfidencePct >= 10) {
    out.push({
      category: 'warning', type: 'warning', priority: 1, source: 'False High Confidence',
      title: `${fhc.falseHighConfidencePct}% rekomendasi ★★★★★ di-override`,
      description: `${fhc.overridden} dari ${fhc.total} rekomendasi confidence tertinggi tetap di-override — tinjau kalibrasi skor.`,
    });
  }

  // Overall headline.
  out.push({
    category: 'efficiency', type: overall.recommendationAccuracy >= 75 ? 'success' : 'info', priority: 3, source: 'Akurasi Keseluruhan',
    title: `Akurasi rekomendasi ${overall.recommendationAccuracy}%`,
    description: `Secara keseluruhan ${overall.recommendationAccuracy}% rekomendasi diterima tanpa perubahan dari ${overall.decisions} keputusan.`,
  });

  return out.sort((a, b) => a.priority - b.priority).slice(0, 8);
}
