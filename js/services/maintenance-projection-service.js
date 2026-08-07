'use strict';

/* ============================================================
   MAINTENANCE-PROJECTION-SERVICE.JS — Vehicle Core Phase 6 (v1.29.17)

   Deterministic maintenance due-date / due-distance projection. Consumes the
   ALREADY-NORMALIZED maintenance timeline (computeMaintenanceTimeline, in
   maintenance-service.js) plus the vehicle's current odometer — it recomputes
   NOTHING about a maintenance record itself. It only projects the next due
   point per category from data maintenance-service.js already derives on
   every record (recommendedIntervalKm/Days, present since v1.18.1 but never
   read past storage until this phase).

   NOT a prediction engine: no risk score, no signals, no probability. Every
   number traces to exactly one completed record's date/odometer + one
   interval constant. This is intentionally the deterministic counterpart to
   js/engines/prediction-engine.js's probabilistic `maintenanceRisk` — the two
   answer different questions ("when is the next scheduled service due?" vs.
   "how likely is an unscheduled failure?") and neither reads the other.

   Only categories that carry a real interval (recommendedIntervalKm > 0 or
   recommendedIntervalDays > 0) can ever be projected — purely corrective
   categories (brake, engine, transmission, …) have no scheduled cadence and
   are correctly never projected.

   PURE: no DOM, no Firebase, no `window`. Node-testable.
   ============================================================ */

import { MAINTENANCE_IMPACTS, MAINTENANCE_DUE_SOON_KM } from '../config/maintenance-config.js';
import { DUE_SOON_DAYS } from '../config/vehicle-asset-config.js';

function num(v) {
  if (v == null || v === '') return null; // Number(null)===0 / Number('')===0 would silently fabricate a reading
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function daysUntil(dateStr, now) {
  if (!dateStr) return null;
  const t = new Date(dateStr).getTime();
  const n = new Date(now || Date.now()).getTime();
  if (!Number.isFinite(t) || !Number.isFinite(n)) return null;
  return Math.ceil((t - n) / 86400000);
}

function addDays(dateStr, days) {
  const t = new Date(dateStr).getTime();
  if (!Number.isFinite(t)) return null;
  return new Date(t + days * 86400000).toISOString().slice(0, 10);
}

function fmtKm(n) {
  return n == null ? '—' : `${Math.round(n).toLocaleString('id-ID')} km`;
}

const STATUS_RANK = Object.freeze({ overdue: 0, due_soon: 1, on_track: 2, unknown: 3 });
const STATUS_META = Object.freeze({
  overdue:  Object.freeze({ label: 'Terlambat', tone: 'danger' }),
  due_soon: Object.freeze({ label: 'Segera',    tone: 'warn' }),
  on_track: Object.freeze({ label: 'Terjadwal', tone: 'ok' }),
  unknown:  Object.freeze({ label: 'Tdk diketahui', tone: 'muted' }),
});

/** The worse (more urgent) of two per-signal statuses; a missing signal defers to the other. */
function worseStatus(a, b) {
  if (a == null) return b;
  if (b == null) return a;
  return STATUS_RANK[a] <= STATUS_RANK[b] ? a : b;
}

/** Service priority — status escalated by the record's own impact classification
 *  (already derived by maintenance-service.js; no new severity scale invented). */
function priorityFor(status, impact) {
  const severe = impact === 'major' || impact === 'critical';
  if (status === 'overdue') return severe ? 'critical' : 'high';
  if (status === 'due_soon') return severe ? 'high' : 'medium';
  if (status === 'on_track') return 'low';
  return 'none';
}

/**
 * Project the next due point for ONE category from its latest COMPLETED
 * record. Returns `null` when the category carries no scheduled interval at
 * all (both recommendedIntervalKm and recommendedIntervalDays are 0).
 * @param {Object} record  a normalized maintenance record (normalizeMaintenanceRecord output)
 * @param {number|string|null} currentOdometer  vehicle.odometer (raw store value)
 * @param {Date|string|number} now
 */
export function projectCategoryDue(record, currentOdometer, now) {
  if (!record || typeof record !== 'object') return null;

  const intervalKm = num(record.recommendedIntervalKm) || 0;
  const intervalDays = num(record.recommendedIntervalDays) || 0;
  if (intervalKm <= 0 && intervalDays <= 0) return null;

  const lastOdo = num(record.odometer);
  const curOdoRaw = num(currentOdometer);
  // A raw odometer of 0 (or absent) reads as "no reliable reading yet" for this
  // fleet, not literally zero km — mirrors validateMaintenanceRecord's own
  // "Odometer is 0 — verify this is correct" warning for the same field.
  const curOdo = curOdoRaw != null && curOdoRaw > 0 ? curOdoRaw : null;

  const nextDueOdometer = (intervalKm > 0 && lastOdo != null) ? lastOdo + intervalKm : null;
  const remainingKm = (nextDueOdometer != null && curOdo != null) ? Math.round(nextDueOdometer - curOdo) : null;

  const nextDueDate = intervalDays > 0 ? addDays(record.date, intervalDays) : null;
  const remainingDays = nextDueDate != null ? daysUntil(nextDueDate, now) : null;

  const kmStatus = remainingKm == null ? null
    : remainingKm <= 0 ? 'overdue'
    : remainingKm <= MAINTENANCE_DUE_SOON_KM ? 'due_soon'
    : 'on_track';
  const dayStatus = remainingDays == null ? null
    : remainingDays <= 0 ? 'overdue'
    : remainingDays <= DUE_SOON_DAYS ? 'due_soon'
    : 'on_track';
  const status = worseStatus(kmStatus, dayStatus) || 'unknown';
  const meta = STATUS_META[status];

  const basis = [
    `Servis terakhir: ${record.categoryLabel || record.category} pada ${record.date}`,
    lastOdo != null ? fmtKm(lastOdo) : null,
  ].filter(Boolean).join(' · ');
  const interval = [
    intervalKm > 0 ? fmtKm(intervalKm) : null,
    intervalDays > 0 ? `${intervalDays} hari` : null,
  ].filter(Boolean).join(' / ');
  const reason = `${basis}. Interval ${interval}.`;

  return Object.freeze({
    category: record.category,
    categoryLabel: record.categoryLabel || record.category,
    impact: record.impact,
    status, label: meta.label, tone: meta.tone,
    priority: priorityFor(status, record.impact),
    nextDueDate, nextDueOdometer,
    remainingDays, remainingKm,
    reason,
    basis: Object.freeze({
      lastDate: record.date,
      lastOdometer: lastOdo,
      intervalKm: intervalKm || null,
      intervalDays: intervalDays || null,
    }),
  });
}

/**
 * Project the next due point per scheduled category across a vehicle's
 * maintenance timeline (one entry per category, latest COMPLETED record
 * only), sorted most urgent first: overdue > due_soon > on_track > unknown,
 * ties broken by impact severity then soonest remaining days.
 * @param {Array} timeline  computeMaintenanceTimeline() output (normalized, newest-first, excludes cancelled)
 * @param {number|string|null} currentOdometer
 * @param {Date|string|number} now
 * @returns {Array}
 */
export function computeMaintenanceProjections(timeline, currentOdometer, now) {
  if (!Array.isArray(timeline)) return [];

  // Newest-first input ⇒ the first COMPLETED record seen per category is its latest.
  const latestByCategory = new Map();
  for (const r of timeline) {
    if (!r || r.status !== 'completed') continue;
    if (!latestByCategory.has(r.category)) latestByCategory.set(r.category, r);
  }

  const items = [];
  for (const record of latestByCategory.values()) {
    const projection = projectCategoryDue(record, currentOdometer, now);
    if (projection) items.push(projection);
  }

  return items.sort((a, b) => {
    const rankDiff = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (rankDiff !== 0) return rankDiff;
    const impactDiff = MAINTENANCE_IMPACTS.indexOf(b.impact) - MAINTENANCE_IMPACTS.indexOf(a.impact);
    if (impactDiff !== 0) return impactDiff;
    const aDays = a.remainingDays == null ? Infinity : a.remainingDays;
    const bDays = b.remainingDays == null ? Infinity : b.remainingDays;
    return aDays - bDays;
  });
}

const NO_DATA_HEADLINE = Object.freeze({
  category: null, categoryLabel: null, impact: null,
  status: 'no_data', label: 'Belum Ada Data', tone: 'muted', priority: 'none',
  nextDueDate: null, nextDueOdometer: null, remainingDays: null, remainingKm: null,
  reason: 'Belum ada riwayat servis terjadwal untuk memproyeksikan perawatan berikutnya.',
  basis: null,
});

/**
 * The single headline projection consumed by the drawer + inventory card: the
 * most urgent scheduled category, or a "no data" placeholder when the vehicle
 * has no completed maintenance in any scheduled category yet.
 * @param {Array} timeline  computeMaintenanceTimeline() output
 * @param {number|string|null} currentOdometer
 * @param {Date|string|number} now
 * @returns {{headline:Object, items:Array}}
 */
export function computeVehicleMaintenanceProjection(timeline, currentOdometer, now) {
  const items = computeMaintenanceProjections(timeline, currentOdometer, now);
  return Object.freeze({ headline: items.length ? items[0] : NO_DATA_HEADLINE, items });
}

console.info('Maintenance projection service module loaded');
