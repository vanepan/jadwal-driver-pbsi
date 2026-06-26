/* ============================================================
   VEHICLE-ASSET-ANALYTICS.JS — Vehicle Asset Intelligence (v1.18.0)

   ASSET-only fleet analytics (Feature 12). This is NOT dispatch analytics — it
   never touches the Dispatch Analytics Engine, recommendation accuracy, capacity,
   scoring, or any operational metric. It only describes the fleet as a set of
   ASSETS: composition by type, age distribution, fuel / transmission mix,
   document completeness, and tax status.

   It consumes ALREADY-NORMALIZED asset records produced by vehicle-asset-service
   (the single source of truth) — it duplicates no derivation. Every distribution
   is returned as an array of { key, label, count, pct } buckets so the dashboard
   renders them uniformly.

   PURE: no DOM, no Firebase, no `window`. Node-testable.
   ============================================================ */

'use strict';

import { vehicleTypeInfo } from '../config/vehicle-asset-config.js';

function pct(count, total) {
  if (!total) return 0;
  return Math.round((count / total) * 1000) / 10; // one decimal
}

/** Tally a list of records by a key-extractor into ordered { key,label,count,pct }. */
function distribution(records, keyOf, labelOf, order) {
  const counts = new Map();
  for (const r of records) {
    const k = keyOf(r);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const total = records.length;
  const keys = order
    ? order.filter((k) => counts.has(k)).concat([...counts.keys()].filter((k) => !order.includes(k)))
    : [...counts.keys()];
  return keys.map((k) => ({
    key: k,
    label: labelOf ? labelOf(k) : k,
    count: counts.get(k) || 0,
    pct: pct(counts.get(k) || 0, total),
  }));
}

/** Age bucket for a model year relative to `now`. Unknown year → 'unknown'. */
function ageBucket(year, nowYear) {
  const y = parseInt(year, 10);
  if (!Number.isFinite(y) || y < 1950 || y > nowYear + 1) return 'unknown';
  const age = nowYear - y;
  if (age <= 2) return '0-2';
  if (age <= 5) return '3-5';
  if (age <= 10) return '6-10';
  return '10+';
}

const AGE_LABELS = { '0-2': '0–2 thn', '3-5': '3–5 thn', '6-10': '6–10 thn', '10+': '> 10 thn', unknown: 'Tdk diketahui' };
const AGE_ORDER = ['0-2', '3-5', '6-10', '10+', 'unknown'];

/**
 * Compute the asset-only fleet analytics for a set of NORMALIZED asset records
 * (from vehicle-asset-service). Retired vehicles are included by default because
 * fleet composition is an inventory view; pass { excludeRetired:true } to drop
 * them. `now` controls the age reference year.
 *
 * @param {Object} input
 * @param {Array<Object>} input.vehicles   normalized assets (with .type, .fuel, .transmission, .year, .documents, .tax)
 * @param {string|Date|number} [input.now]
 * @returns {{ totals:Object, composition:Array, ageDistribution:Array,
 *             fuelDistribution:Array, transmissionDistribution:Array,
 *             documentCompleteness:Array, taxStatus:Array }}
 */
export function computeFleetAnalytics(input = {}) {
  const vehicles = Array.isArray(input.vehicles) ? input.vehicles.filter((v) => v && typeof v === 'object') : [];
  const nowYear = new Date(input.now || Date.now()).getFullYear() || new Date().getFullYear();
  const total = vehicles.length;

  // Feature 12 — Fleet composition (by type)
  const composition = distribution(
    vehicles,
    (v) => v.type || 'mobil',
    (k) => vehicleTypeInfo(k).label,
    ['mobil', 'motor', 'ambulance'],
  );

  // Age distribution
  const ageDistribution = distribution(
    vehicles,
    (v) => ageBucket(v.year, nowYear),
    (k) => AGE_LABELS[k] || k,
    AGE_ORDER,
  );

  // Fuel distribution (unknown → 'Tdk diketahui')
  const fuelDistribution = distribution(
    vehicles,
    (v) => (v.fuel && String(v.fuel).trim()) || 'unknown',
    (k) => (k === 'unknown' ? 'Tdk diketahui' : k),
  );

  // Transmission distribution
  const transmissionDistribution = distribution(
    vehicles,
    (v) => (v.transmission && String(v.transmission).trim()) || 'unknown',
    (k) => (k === 'unknown' ? 'Tdk diketahui' : k),
  );

  // Document completeness buckets (Complete ≥80 / Partial 40–79 / Minimal <40)
  const documentCompleteness = distribution(
    vehicles,
    (v) => {
      const c = v.documents ? v.documents.completeness : 0;
      if (c >= 80) return 'complete';
      if (c >= 40) return 'partial';
      return 'minimal';
    },
    (k) => ({ complete: 'Lengkap (≥80%)', partial: 'Sebagian (40–79%)', minimal: 'Minim (<40%)' }[k] || k),
    ['complete', 'partial', 'minimal'],
  );

  // Tax status (valid / due soon / expired / unknown)
  const taxStatus = distribution(
    vehicles,
    (v) => (v.tax && v.tax.status) || 'unknown',
    (k) => ({ valid: 'Berlaku', due_soon: 'Jatuh Tempo', expired: 'Kedaluwarsa', unknown: 'Tdk diketahui' }[k] || k),
    ['valid', 'due_soon', 'expired', 'unknown'],
  );

  return {
    totals: { vehicles: total, referenceYear: nowYear },
    composition,
    ageDistribution,
    fuelDistribution,
    transmissionDistribution,
    documentCompleteness,
    taxStatus,
  };
}
