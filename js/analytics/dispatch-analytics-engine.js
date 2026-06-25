/* ============================================================
   DISPATCH-ANALYTICS-ENGINE.JS — Dispatch Intelligence Analytics
   (v1.17.0)

   The executive analytics layer over the COMPLETED Dispatch Intelligence
   subsystem. It transforms the decision history the subsystem already records
   (override logs, request recommendations, capacity snapshots) plus the live
   request / assignment / driver / vehicle data into one read-only analytics
   model — the source for the Dispatch Intelligence Analytics dashboard.

   READ-ONLY OVER THE ENGINES. This module adds NO scoring and NO recommendation
   logic. It REUSES the existing calculation functions as the single source of
   truth for every metric and only AGGREGATES + RESHAPES their output:
     - override acceptance / accuracy  → override-workflow-service.js
     - confidence banding              → dispatch-presentation.js (confidenceFromScore)
     - capacity / utilization / status → driver-capacity-engine.js + vehicle-capacity-engine.js

   PURE: no DOM, no Firebase, no `window`. Every input is passed in, so the whole
   model is node-testable (scripts/dispatch-analytics-check.mjs).

   HISTORICAL vs CURRENT-STATE (honesty): recommendation / acceptance / override /
   score / confidence metrics are HISTORICAL (from the override log). Capacity /
   utilization / idle are CURRENT-STATE derivations from the capacity engines over
   live assignments (the override log does not persist per-decision capacity).
   Conflict-avoidance is computed from the assignment history (real double-booking
   detection). Each metric is labeled accordingly; each still has one source.
   ============================================================ */

'use strict';

import {
  OVERRIDE_OUTCOME,
  computeOverrideStats,
  computeAllDriverAccuracy,
  computeAllVehicleAccuracy,
} from '../services/override-workflow-service.js';
import { confidenceFromScore } from '../services/dispatch-presentation.js';
import { calculateDriverCapacity } from '../services/driver-capacity-engine.js';
import { calculateVehicleCapacity } from '../services/vehicle-capacity-engine.js';

/* ── small numeric / time helpers ─────────────────────────────────────── */

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function rate(part, whole) { return whole > 0 ? Math.round((part / whole) * 100) : 0; }
function mean(list) { return list.length ? Math.round(list.reduce((s, n) => s + n, 0) / list.length) : 0; }

/** Epoch ms of an ISO/date value; NaN-safe (0 when unparseable). */
function ms(v) { const t = v ? Date.parse(v) : NaN; return Number.isNaN(t) ? 0 : t; }

/** Local-day ISO (yyyy-mm-dd), timezone-safe. */
function dayKey(v) {
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

/** ISO-week key (yyyy-Www) for a date — Monday-based, deterministic. */
function weekKey(v) {
  const d = v instanceof Date ? new Date(v) : new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (t.getUTCDay() + 6) % 7;            // Mon=0 … Sun=6
  t.setUTCDate(t.getUTCDate() - dayNum + 3);          // nearest Thursday
  const firstThursday = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((t - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Month key (yyyy-mm). */
function monthKey(v) { return dayKey(v).slice(0, 7); }

/** "HH:MM" → minutes since midnight; null when malformed. */
function timeToMinutes(t) {
  const m = /^(\d{2}):(\d{2})$/.exec(String(t || ''));
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function normName(v) { return String(v == null ? '' : v).trim().toLowerCase(); }

/* ── identity resolution (id → display name) ──────────────────────────── */

function buildNameIndex(records, idKeys, nameKey) {
  const byId = new Map();
  for (const r of (Array.isArray(records) ? records : [])) {
    if (!r || typeof r !== 'object') continue;
    const name = r[nameKey] != null ? String(r[nameKey]) : '';
    for (const k of idKeys) {
      if (r[k] != null && r[k] !== '') byId.set(String(r[k]), { name, record: r });
    }
    if (name) byId.set(`name:${normName(name)}`, { name, record: r });
  }
  return byId;
}

function resolveName(index, id, fallbackLabel) {
  if (id == null || id === '') return fallbackLabel;
  const hit = index.get(String(id)) || index.get(`name:${normName(id)}`);
  return hit && hit.name ? hit.name : String(id);
}

/* ── conflict-avoidance from real assignment history ──────────────────── */

/**
 * Share of an entity's assignments that are NOT double-booked (no same-day time
 * overlap with another of its assignments). A real signal from existing data —
 * not a fabricated metric. Returns 100 when the entity has 0/1 assignments.
 * @param {Array<Object>} list  the entity's own (already-filtered) assignments
 */
function conflictAvoidance(list) {
  const items = (Array.isArray(list) ? list : []).filter((a) => a && a.status !== 'cancelled');
  if (items.length < 2) return 100;
  const byDate = new Map();
  for (const a of items) {
    const d = String(a.date || a.startDate || '').slice(0, 10);
    if (!d) continue;
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d).push(a);
  }
  const conflicted = new Set();
  for (const sameDay of byDate.values()) {
    for (let i = 0; i < sameDay.length; i++) {
      for (let j = i + 1; j < sameDay.length; j++) {
        if (overlaps(sameDay[i], sameDay[j])) { conflicted.add(sameDay[i]); conflicted.add(sameDay[j]); }
      }
    }
  }
  return rate(items.length - conflicted.size, items.length);
}

function overlaps(a, b) {
  if (a.fullDay || b.fullDay) return true;                 // a full-day blocks the whole date
  const as = timeToMinutes(a.startTime); const ae = timeToMinutes(a.endTime);
  const bs = timeToMinutes(b.startTime); const be = timeToMinutes(b.endTime);
  if (as == null || ae == null || bs == null || be == null) return true; // unknown times = assume blocking
  return as < be && bs < ae;
}

/* ── generic time-bucket trend builder ────────────────────────────────── */

function bucketTrend(logs, keyFn, labelFn) {
  const buckets = new Map();
  for (const l of logs) {
    const k = keyFn(l.timestamp);
    if (!k) continue;
    if (!buckets.has(k)) buckets.set(k, { key: k, total: 0, accepted: 0, overridden: 0, scores: [] });
    const b = buckets.get(k);
    b.total++;
    if (l.outcome === OVERRIDE_OUTCOME.ACCEPTED) b.accepted++; else b.overridden++;
    b.scores.push(num(l.dispatchScore));
  }
  return [...buckets.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((b) => ({
      key: b.key,
      label: labelFn ? labelFn(b.key) : b.key,
      total: b.total,
      accepted: b.accepted,
      overridden: b.overridden,
      acceptanceRate: rate(b.accepted, b.total),
      overrideRate: rate(b.overridden, b.total),
      avgScore: mean(b.scores),
    }));
}

/* ── main entry ───────────────────────────────────────────────────────── */

/**
 * Compute the complete Dispatch Intelligence Analytics model.
 *
 * @param {Object} input
 * @param {Array<Object>} input.overrideLogs           the admin decision log (source of truth)
 * @param {Object|Array}  [input.requestRecommendations] stored recommendation map (by requestId) or array
 * @param {Array<Object>} [input.requests]             request records (bidang + destination join)
 * @param {Array<Object>} [input.drivers]              driver registry (id → name)
 * @param {Array<Object>} [input.vehicles]             vehicle registry (id → name)
 * @param {Array<Object>} [input.assignments]          operational assignments (current capacity / conflict)
 * @param {Array<Object>} [input.capacityHistory]      capacity snapshots (context)
 * @param {Date|string}   [input.now]                  "today" reference (default: real now)
 * @returns {Object} the analytics model (see module header)
 */
export function computeDispatchAnalyticsModel(input = {}) {
  const logs = (Array.isArray(input.overrideLogs) ? input.overrideLogs : []).filter((l) => l && typeof l === 'object');
  const recs = normalizeRecs(input.requestRecommendations);
  const requests = Array.isArray(input.requests) ? input.requests : [];
  const assignments = Array.isArray(input.assignments) ? input.assignments : [];
  const now = input.now ? new Date(input.now) : new Date();

  const driverIndex = buildNameIndex(input.drivers, ['id', 'driverId'], 'name');
  const vehicleIndex = buildNameIndex(input.vehicles, ['id', 'vehicleId'], 'name');
  const requestById = new Map(requests.filter((r) => r && r.id != null).map((r) => [String(r.id), r]));

  return {
    generatedAt: new Date().toISOString(),
    totals: buildTotals(logs),
    kpi: buildKpi(logs),
    confidenceDistribution: buildConfidenceDistribution(logs),
    driverIntelligence: buildDriverIntelligence(logs, driverIndex, assignments, now),
    vehicleIntelligence: buildVehicleIntelligence(logs, vehicleIndex, assignments, now),
    overrideAnalytics: buildOverrideAnalytics(logs),
    bidangIntelligence: buildBidangIntelligence(logs, requestById),
    recommendationQuality: buildRecommendationQuality(logs),
    timeline: buildTimeline(logs, requestById, recs, driverIndex, vehicleIndex),
    explainability: buildExplainability(logs, recs),
    trends: buildTrends(logs, now),
  };
}

/** Normalize the recommendation store (map by requestId OR array) → array. */
function normalizeRecs(recs) {
  if (Array.isArray(recs)) return recs.filter((r) => r && typeof r === 'object');
  if (recs && typeof recs === 'object') return Object.values(recs).filter((r) => r && typeof r === 'object');
  return [];
}

/* ── §1 Totals + KPI ──────────────────────────────────────────────────── */

function buildTotals(logs) {
  const s = computeOverrideStats(logs);
  return { decisions: s.total, accepted: s.accepted, overridden: s.overridden };
}

function buildKpi(logs) {
  const s = computeOverrideStats(logs);                 // single source: override service
  const scores = logs.map((l) => num(l.dispatchScore));
  const avgScore = mean(scores);
  const conf = confidenceFromScore(avgScore);           // single source: presentation banding
  const avgStars = logs.length
    ? Math.round((logs.reduce((sum, l) => sum + confidenceFromScore(num(l.dispatchScore)).stars, 0) / logs.length) * 10) / 10
    : 0;
  return {
    // Accepted Recommendations / Total Recommendations.
    dispatchAccuracy: s.acceptanceRate,
    // Override Decisions / Approved Requests (each decision is one approval).
    overrideRate: rate(s.overridden, s.total),
    // Recommendations accepted without changes (== fully ACCEPTED outcome).
    recommendationAcceptance: s.acceptanceRate,
    avgDispatchScore: avgScore,
    avgConfidence: { stars: avgStars, label: conf.label, glyph: conf.glyph, score: avgScore },
    sampleSize: s.total,
  };
}

/* ── §2 Confidence distribution ───────────────────────────────────────── */

function buildConfidenceDistribution(logs) {
  // 5-star scaffold (5 → 1). confidenceFromScore is the single source of truth;
  // it floors at 2★ ("Perlu Review"), so the 1★ bucket is always empty by
  // definition — the row is kept for the full visual scale.
  const rows = [5, 4, 3, 2, 1].map((stars) => ({
    stars,
    glyph: '★'.repeat(stars) + '☆'.repeat(5 - stars),
    label: starLabel(stars),
    count: 0,
    accepted: 0,
  }));
  const byStars = new Map(rows.map((r) => [r.stars, r]));
  for (const l of logs) {
    const band = confidenceFromScore(num(l.dispatchScore));
    const row = byStars.get(band.stars);
    if (!row) continue;
    row.count++;
    if (l.outcome === OVERRIDE_OUTCOME.ACCEPTED) row.accepted++;
  }
  const total = logs.length;
  return rows.map((r) => ({
    stars: r.stars,
    glyph: r.glyph,
    label: r.label,
    count: r.count,
    percentage: rate(r.count, total),
    acceptanceRate: rate(r.accepted, r.count),
  }));
}

function starLabel(stars) {
  return ({ 5: 'Sangat Tinggi', 4: 'Tinggi', 3: 'Sedang', 2: 'Perlu Review', 1: 'Rendah' })[stars] || '';
}

/* ── §3 Driver intelligence ───────────────────────────────────────────── */

function buildDriverIntelligence(logs, driverIndex, assignments, now) {
  const accuracy = computeAllDriverAccuracy(logs);       // single source: override service
  const rows = accuracy.map((a) => {
    const mine = logs.filter((l) => String(l.recommendedDriverId) === a.driverId);
    const name = resolveName(driverIndex, a.driverId, 'Driver tidak dikenal');
    const cap = calculateDriverCapacity(a.driverId, assignments, { now, aliases: [name] });
    const driverAssignments = assignments.filter(
      (x) => x && (String(x.driverId) === a.driverId || normName(x.driver) === normName(name)),
    );
    return {
      driverId: a.driverId,
      driverName: name,
      recommended: a.recommended,
      accepted: a.accepted,
      acceptance: a.accuracy,
      overrideRate: rate(a.recommended - a.accepted, a.recommended),
      avgScore: mean(mine.map((l) => num(l.dispatchScore))),
      capacityUtilization: cap.utilizationPercent,
      capacityStatus: cap.status,
      conflictAvoidance: conflictAvoidance(driverAssignments),
      lastRecommendation: mine.reduce((max, l) => Math.max(max, ms(l.timestamp)), 0) || null,
    };
  });

  const lastIso = (t) => (t ? new Date(t).toISOString() : '');
  return {
    rows: rows.map((r) => ({ ...r, lastRecommendation: lastIso(r.lastRecommendation) })),
    rankings: {
      topRecommended: rankSlice(rows, (a, b) => b.recommended - a.recommended || a.driverName.localeCompare(b.driverName, 'id')),
      mostAccepted: rankSlice(rows, (a, b) => b.accepted - a.accepted || b.acceptance - a.acceptance || a.driverName.localeCompare(b.driverName, 'id')),
      mostOverridden: rankSlice(
        rows.filter((r) => r.recommended - r.accepted > 0),
        (a, b) => (b.recommended - b.accepted) - (a.recommended - a.accepted) || a.driverName.localeCompare(b.driverName, 'id'),
      ),
    },
  };
}

function rankSlice(rows, cmp, n = 5) {
  return [...rows].sort(cmp).slice(0, n).map((r) => ({
    id: r.driverId || r.vehicleId,
    name: r.driverName || r.vehicleName,
    recommended: r.recommended,
    accepted: r.accepted,
    acceptance: r.acceptance,
    overridden: r.recommended - r.accepted,
    avgScore: r.avgScore,
  }));
}

/* ── §4 Vehicle intelligence ──────────────────────────────────────────── */

function buildVehicleIntelligence(logs, vehicleIndex, assignments, now) {
  const accuracy = computeAllVehicleAccuracy(logs);
  const rows = accuracy.map((a) => {
    const mine = logs.filter((l) => String(l.recommendedVehicleId) === a.vehicleId);
    const name = resolveName(vehicleIndex, a.vehicleId, 'Kendaraan tidak dikenal');
    const cap = calculateVehicleCapacity(a.vehicleId, assignments, { now, identities: [name, a.vehicleId] });
    const vehAssignments = assignments.filter((x) => x && normName(x.vehicle) === normName(name));
    return {
      vehicleId: a.vehicleId,
      vehicleName: name,
      recommended: a.recommended,
      accepted: a.accepted,
      acceptance: a.accuracy,
      overrideRate: rate(a.recommended - a.accepted, a.recommended),
      avgScore: mean(mine.map((l) => num(l.dispatchScore))),
      utilization: cap.utilizationPercent,
      idle: Math.max(0, 100 - cap.utilizationPercent),
      capacityStatus: cap.status,
      conflictAvoidance: conflictAvoidance(vehAssignments),
      lastRecommendation: mine.reduce((max, l) => Math.max(max, ms(l.timestamp)), 0) || null,
    };
  });
  const lastIso = (t) => (t ? new Date(t).toISOString() : '');
  return {
    rows: rows.map((r) => ({ ...r, lastRecommendation: lastIso(r.lastRecommendation) })),
    rankings: {
      topRecommended: rankSlice(rows, (a, b) => b.recommended - a.recommended || a.vehicleName.localeCompare(b.vehicleName, 'id')),
      mostAccepted: rankSlice(rows, (a, b) => b.accepted - a.accepted || b.acceptance - a.acceptance || a.vehicleName.localeCompare(b.vehicleName, 'id')),
      mostOverridden: rankSlice(
        rows.filter((r) => r.recommended - r.accepted > 0),
        (a, b) => (b.recommended - b.accepted) - (a.recommended - a.accepted) || a.vehicleName.localeCompare(b.vehicleName, 'id'),
      ),
    },
  };
}

/* ── §5 Override analytics ────────────────────────────────────────────── */

function buildOverrideAnalytics(logs) {
  const breakdown = { accepted: 0, driver: 0, vehicle: 0, full: 0 };
  for (const l of logs) {
    if (l.outcome === OVERRIDE_OUTCOME.ACCEPTED) breakdown.accepted++;
    else if (l.outcome === OVERRIDE_OUTCOME.DRIVER_OVERRIDE) breakdown.driver++;
    else if (l.outcome === OVERRIDE_OUTCOME.VEHICLE_OVERRIDE) breakdown.vehicle++;
    else if (l.outcome === OVERRIDE_OUTCOME.FULL_OVERRIDE) breakdown.full++;
  }
  return {
    reasonBreakdown: breakdown,
    trends: {
      daily: bucketTrend(logs, dayKey),
      weekly: bucketTrend(logs, weekKey),
      monthly: bucketTrend(logs, monthKey),
    },
  };
}

/* ── §6 Bidang intelligence ───────────────────────────────────────────── */

function buildBidangIntelligence(logs, requestById) {
  const groups = new Map();
  for (const l of logs) {
    const req = requestById.get(String(l.recommendationId));
    const bidang = (req && req.requesterName) ? String(req.requesterName) : 'Tidak diketahui';
    const destination = (req && (req.purpose || req.destination)) ? String(req.purpose || req.destination) : '';
    if (!groups.has(bidang)) groups.set(bidang, { bidang, total: 0, accepted: 0, full: 0, scores: [], stars: [], dests: new Map() });
    const g = groups.get(bidang);
    g.total++;
    if (l.outcome === OVERRIDE_OUTCOME.ACCEPTED) g.accepted++;
    if (l.outcome === OVERRIDE_OUTCOME.FULL_OVERRIDE) g.full++;
    g.scores.push(num(l.dispatchScore));
    g.stars.push(confidenceFromScore(num(l.dispatchScore)).stars);
    if (destination) g.dests.set(destination, (g.dests.get(destination) || 0) + 1);
  }
  return [...groups.values()]
    .sort((a, b) => b.total - a.total || a.bidang.localeCompare(b.bidang, 'id'))
    .map((g) => ({
      bidang: g.bidang,
      requests: g.total,
      accepted: g.accepted,
      overridden: g.total - g.accepted,
      acceptanceRate: rate(g.accepted, g.total),
      overrideRate: rate(g.total - g.accepted, g.total),
      avgScore: mean(g.scores),
      avgConfidenceStars: g.stars.length ? Math.round((g.stars.reduce((s, n) => s + n, 0) / g.stars.length) * 10) / 10 : 0,
      topDestination: topKey(g.dests),
      // FULL_OVERRIDE share = "the system got both driver AND vehicle wrong".
      conflictRate: rate(g.full, g.total),
    }));
}

function topKey(map) {
  let best = ''; let bestN = -1;
  for (const [k, v] of map.entries()) if (v > bestN || (v === bestN && k.localeCompare(best, 'id') < 0)) { best = k; bestN = v; }
  return best;
}

/* ── §7 Recommendation quality funnel ─────────────────────────────────── */

function buildRecommendationQuality(logs) {
  const counts = { ACCEPTED: 0, DRIVER_OVERRIDE: 0, VEHICLE_OVERRIDE: 0, FULL_OVERRIDE: 0 };
  for (const l of logs) if (counts[l.outcome] != null) counts[l.outcome]++;
  const total = logs.length;
  const def = [
    { key: 'ACCEPTED', label: 'Diterima' },
    { key: 'DRIVER_OVERRIDE', label: 'Driver Diubah' },
    { key: 'VEHICLE_OVERRIDE', label: 'Kendaraan Diubah' },
    { key: 'FULL_OVERRIDE', label: 'Keduanya Diubah' },
  ];
  return {
    total,
    funnel: def.map((d) => ({ key: d.key, label: d.label, count: counts[d.key], percentage: rate(counts[d.key], total) })),
  };
}

/* ── §8 Dispatch timeline ─────────────────────────────────────────────── */

function buildTimeline(logs, requestById, recs, driverIndex, vehicleIndex, limit = 40) {
  const recByReq = new Map(recs.filter((r) => r && r.requestId != null).map((r) => [String(r.requestId), r]));
  const events = [];
  for (const l of logs) {
    const req = requestById.get(String(l.recommendationId));
    const rec = recByReq.get(String(l.recommendationId));
    const bidang = (req && req.requesterName) ? String(req.requesterName) : '';
    const driverName = resolveName(driverIndex, l.selectedDriverId, '—');
    const vehicleName = resolveName(vehicleIndex, l.selectedVehicleId, '—');
    const generatedAt = (rec && rec.generatedAt) || (req && req.createdAt) || l.timestamp;
    events.push({
      requestId: String(l.recommendationId),
      bidang,
      driverName,
      vehicleName,
      outcome: l.outcome,
      overridden: !!l.overridden,
      score: num(l.dispatchScore),
      generatedAt: generatedAt || '',
      decidedAt: l.timestamp || '',
      approvedAt: (req && req.approvedAt) || l.timestamp || '',
      approvedBy: l.approvedBy || (req && req.approvedBy) || '',
    });
  }
  return events.sort((a, b) => ms(b.decidedAt) - ms(a.decidedAt)).slice(0, limit);
}

/* ── §9 Explainability ────────────────────────────────────────────────── */

function buildExplainability(logs, recs) {
  const topReasons = tallyStrings(recs.map((r) => r && r.reasonSummary));
  const adminOverrideReasons = tallyStrings(
    logs.filter((l) => l.overridden).map((l) => l && l.reason),
  );
  return { topReasons, adminOverrideReasons };
}

function tallyStrings(values, limit = 8) {
  const counts = new Map();
  for (const v of values) {
    const t = String(v == null ? '' : v).trim();
    if (!t) continue;
    counts.set(t, (counts.get(t) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'id'))
    .slice(0, limit)
    .map(([text, count]) => ({ text, count }));
}

/* ── §10 Trend dashboard (windows) ────────────────────────────────────── */

function buildTrends(logs, now) {
  const today = now instanceof Date ? now : new Date(now);
  const startOfYear = new Date(today.getFullYear(), 0, 1);
  const windows = [
    { key: '7d', label: '7 Hari', from: shiftDays(today, -6) },
    { key: '30d', label: '30 Hari', from: shiftDays(today, -29) },
    { key: '90d', label: '90 Hari', from: shiftDays(today, -89) },
    { key: 'ytd', label: 'YTD', from: startOfYear },
  ];
  return {
    windows: windows.map((w) => {
      const fromMs = w.from.getTime();
      const inWindow = logs.filter((l) => ms(l.timestamp) >= fromMs);
      const s = computeOverrideStats(inWindow);
      const scores = inWindow.map((l) => num(l.dispatchScore));
      const stars = inWindow.map((l) => confidenceFromScore(num(l.dispatchScore)).stars);
      return {
        key: w.key,
        label: w.label,
        total: s.total,
        acceptanceRate: s.acceptanceRate,
        overrideRate: rate(s.overridden, s.total),
        avgScore: mean(scores),
        avgConfidenceStars: stars.length ? Math.round((stars.reduce((a, b) => a + b, 0) / stars.length) * 10) / 10 : 0,
        series: bucketTrend(inWindow, dayKey),
      };
    }),
  };
}

function shiftDays(date, delta) {
  const d = new Date(date);
  d.setDate(d.getDate() + delta);
  d.setHours(0, 0, 0, 0);
  return d;
}
