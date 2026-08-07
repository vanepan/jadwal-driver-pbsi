'use strict';

/* ============================================================
   REMINDER-ENGINE.JS — Vehicle Core Phase 7 (v1.29.18)

   Answers ONE question: "of everything already known about a vehicle, what
   deserves the admin's attention right now, and why?" It performs NO business
   calculation of its own — every due date, remaining-day count, remaining-km
   count and maintenance priority is read verbatim from vehicle-asset-service's
   normalized asset (deriveDocStatus for STNK/tax/insurance; maintenance-
   projection-service's computeVehicleMaintenanceProjection for maintenance,
   already attached at asset.maintenanceProjection). This engine only DECIDES
   WHEN one of those already-computed facts is worth surfacing as a reminder,
   and in what order.

   Four reminder types, matching the Vehicle Core Phase 7 brief exactly:
     annual_tax    — asset.tax (deriveDocStatus over annualTaxDue||stnkExpiry,
                     the SAME fallback vehicle-asset-service.js already uses)
     five_year_tax — deriveDocStatus(asset.fiveYearTaxDue) — reuses the exact
                     same exported classifier STNK/tax/insurance already use;
                     fiveYearTaxDue itself had no derived status anywhere in
                     the app before this phase (drawer only showed the raw
                     date), so this is new SURFACING, not a new business rule.
     insurance     — asset.insurance (deriveDocStatus over insuranceExpiry)
     maintenance   — asset.maintenanceProjection.items (one entry per
                     scheduled category; priority is READ from each item,
                     never recomputed)

   Reminder STATUS is a 4-state vocabulary (Overdue / Due Soon / Upcoming /
   Completed) mapped 1:1 from the existing source classifications — no new
   thresholds:
     overdue   ← doc 'expired'   | projection 'overdue'
     due_soon  ← doc 'due_soon'  | projection 'due_soon'
     upcoming  ← doc 'valid'     | projection 'on_track'
     completed ← the vehicle itself is archived or retired — there is no
                 further obligation to track, independent of the underlying
                 date. This is the one status not already named elsewhere;
                 it reuses vehicle-asset-service's OWN 'archived'/'retired'
                 facts rather than inventing a date-based rule.
   'unknown' (no date on file — deriveDocStatus's own 4th state) is preserved
   but filtered out of every list this engine returns: an engine that only
   "determines what deserves attention" cannot recommend action on a field
   nobody has ever filled in — that gap belongs to Document Completeness
   (already tracked by computeDocumentCompleteness), not to reminders.

   Priority is likewise READ, never invented, for maintenance (each projection
   item already carries `.priority` from maintenance-projection-service.js's
   priorityFor()). Compliance types (tax/insurance) had no priority axis
   before this engine — compliancePriority() below applies the SAME
   status→urgency shape priorityFor() already established (overdue=critical,
   due_soon=high, upcoming=low, completed=none), just without an impact/
   severity axis (a legal document lapse has no "minor/major" distinction the
   way a maintenance category does).

   PURE: no DOM, no Firebase, no `window`, no setInterval/scheduler. Reads
   normalized assets (vehicle-asset-service.normalizeVehicleAsset output)
   ONLY — never a raw store record, never re-derives a due date, never
   triggers a Firebase read. Node-testable.
   ============================================================ */

import { deriveDocStatus } from './vehicle-asset-service.js';

/* ── Reminder type registry ───────────────────────────────────────────── */

export const REMINDER_TYPES = Object.freeze(['annual_tax', 'five_year_tax', 'insurance', 'maintenance']);

const REMINDER_TYPE_REGISTRY = Object.freeze({
  annual_tax:    Object.freeze({ label: 'Pajak Tahunan',   action: 'Perpanjang pajak tahunan (STNK) sebelum jatuh tempo.' }),
  five_year_tax: Object.freeze({ label: 'Pajak 5 Tahunan', action: 'Perpanjang STNK 5 tahunan (ganti plat) sebelum jatuh tempo.' }),
  insurance:     Object.freeze({ label: 'Asuransi',        action: 'Perpanjang polis asuransi sebelum masa berlaku berakhir.' }),
  maintenance:   Object.freeze({ label: 'Perawatan',       action: 'Jadwalkan servis sesuai proyeksi perawatan.' }),
});

/** Registry entry for a reminder type (never null — falls back to maintenance). */
export function reminderTypeInfo(key) {
  return REMINDER_TYPE_REGISTRY[key] || REMINDER_TYPE_REGISTRY.maintenance;
}

/* ── Reminder status vocabulary ───────────────────────────────────────── */

const STATUS_RANK = Object.freeze({ overdue: 0, due_soon: 1, upcoming: 2, completed: 3, unknown: 4 });
const STATUS_META = Object.freeze({
  overdue:   Object.freeze({ label: 'Terlambat', tone: 'danger' }),
  due_soon:  Object.freeze({ label: 'Segera',    tone: 'warn' }),
  upcoming:  Object.freeze({ label: 'Terjadwal', tone: 'ok' }),
  completed: Object.freeze({ label: 'Selesai',   tone: 'muted' }),
  unknown:   Object.freeze({ label: 'Tdk diketahui', tone: 'muted' }),
});

const PRIORITY_RANK = Object.freeze({ critical: 0, high: 1, medium: 2, low: 3, none: 4 });

/** Map a doc-status ('valid'/'due_soon'/'expired'/'unknown') to a reminder status. */
function fromDocStatus(status) {
  if (status === 'expired') return 'overdue';
  if (status === 'due_soon') return 'due_soon';
  if (status === 'valid') return 'upcoming';
  return 'unknown';
}

/** Map a maintenance-projection status ('overdue'/'due_soon'/'on_track'/'unknown') to a reminder status. */
function fromProjectionStatus(status) {
  if (status === 'overdue') return 'overdue';
  if (status === 'due_soon') return 'due_soon';
  if (status === 'on_track') return 'upcoming';
  return 'unknown';
}

/** Compliance urgency ladder — same SHAPE as maintenance-projection-service's
 *  priorityFor(), applied to a domain (legal documents) that has no severity/
 *  impact axis of its own. */
function compliancePriority(reminderStatus) {
  if (reminderStatus === 'overdue') return 'critical';
  if (reminderStatus === 'due_soon') return 'high';
  if (reminderStatus === 'upcoming') return 'low';
  return 'none';
}

function complianceReason(typeLabel, days) {
  if (days == null) return `${typeLabel} belum memiliki tanggal jatuh tempo yang tercatat.`;
  if (days < 0) return `${typeLabel} telah melewati masa berlaku ${Math.abs(days)} hari.`;
  if (days === 0) return `${typeLabel} jatuh tempo hari ini.`;
  return `${typeLabel} jatuh tempo dalam ${days} hari.`;
}

/**
 * Build one compliance reminder (annual_tax / five_year_tax / insurance).
 * @param {Object} asset  normalized vehicle asset
 * @param {string} typeKey
 * @param {{status:string, days:number|null}} doc  a deriveDocStatus() result
 * @param {string|null} dueDate  the raw date string the doc status was derived from
 * @param {boolean} inactive  asset.archived || asset.status === 'retired'
 * @returns {Object|null}  null when there is no date on file (nothing to remind about)
 */
function buildComplianceReminder(asset, typeKey, doc, dueDate, inactive) {
  const info = reminderTypeInfo(typeKey);
  const status = inactive ? 'completed' : fromDocStatus(doc.status);
  if (status === 'unknown') return null;
  const meta = STATUS_META[status];
  return Object.freeze({
    type: typeKey,
    typeLabel: info.label,
    vehicleId: asset.id,
    vehicleName: asset.name,
    plateNumber: asset.plateNumber,
    dueDate: dueDate || null,
    remainingDays: doc.days,
    remainingKm: null,
    category: null,
    categoryLabel: null,
    status,
    statusLabel: meta.label,
    tone: meta.tone,
    priority: inactive ? 'none' : compliancePriority(status),
    reason: complianceReason(info.label, doc.days),
    recommendedAction: info.action,
  });
}

/**
 * Build one maintenance reminder from an already-projected category
 * (maintenance-projection-service.js's computeMaintenanceProjections() output).
 * @param {Object} asset  normalized vehicle asset
 * @param {Object} item  one entry of asset.maintenanceProjection.items
 * @param {boolean} inactive
 * @returns {Object|null}
 */
function buildMaintenanceReminder(asset, item, inactive) {
  const status = inactive ? 'completed' : fromProjectionStatus(item.status);
  if (status === 'unknown') return null;
  const meta = STATUS_META[status];
  const info = reminderTypeInfo('maintenance');
  return Object.freeze({
    type: 'maintenance',
    typeLabel: info.label,
    vehicleId: asset.id,
    vehicleName: asset.name,
    plateNumber: asset.plateNumber,
    dueDate: item.nextDueDate || null,
    remainingDays: item.remainingDays,
    remainingKm: item.remainingKm,
    category: item.category,
    categoryLabel: item.categoryLabel,
    status,
    statusLabel: meta.label,
    tone: meta.tone,
    priority: inactive ? 'none' : item.priority,
    reason: item.reason,
    recommendedAction: `Jadwalkan servis ${item.categoryLabel}.`,
  });
}

/** Sort reminders most urgent first: status rank, then priority rank, then
 *  soonest remainingDays (nulls last) — the exact ordering idiom
 *  computeMaintenanceProjections() already established, applied fleet-wide. */
function sortReminders(a, b) {
  const s = STATUS_RANK[a.status] - STATUS_RANK[b.status];
  if (s !== 0) return s;
  const p = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  if (p !== 0) return p;
  const aDays = a.remainingDays == null ? Infinity : a.remainingDays;
  const bDays = b.remainingDays == null ? Infinity : b.remainingDays;
  return aDays - bDays;
}

/**
 * Compute every reminder for ONE normalized vehicle asset (annual tax,
 * five-year tax, insurance, and one per scheduled maintenance category),
 * sorted most urgent first. 'unknown' (no date on file) entries are omitted.
 * @param {Object} asset  vehicle-asset-service.normalizeVehicleAsset() output
 * @returns {Array<Object>}
 */
export function computeVehicleReminders(asset) {
  if (!asset || typeof asset !== 'object') return [];
  const inactive = asset.archived === true || asset.status === 'retired';

  const reminders = [];
  reminders.push(buildComplianceReminder(
    asset, 'annual_tax', asset.tax, asset.annualTaxDue || asset.stnkExpiry || null, inactive));
  reminders.push(buildComplianceReminder(
    asset, 'five_year_tax', deriveDocStatus(asset.fiveYearTaxDue), asset.fiveYearTaxDue || null, inactive));
  reminders.push(buildComplianceReminder(
    asset, 'insurance', asset.insurance, asset.insuranceExpiry || null, inactive));

  const projItems = (asset.maintenanceProjection && asset.maintenanceProjection.items) || [];
  for (const item of projItems) {
    reminders.push(buildMaintenanceReminder(asset, item, inactive));
  }

  return reminders.filter(Boolean).sort(sortReminders);
}

/**
 * Compute reminders across a fleet of normalized vehicle assets (e.g.
 * computeFleetAssetModel().vehicles), flattened and sorted fleet-wide most
 * urgent first.
 * @param {Array<Object>} vehicles  normalized assets
 * @returns {Array<Object>}
 */
export function computeFleetReminders(vehicles) {
  const list = Array.isArray(vehicles) ? vehicles : [];
  const all = [];
  for (const asset of list) {
    for (const r of computeVehicleReminders(asset)) all.push(r);
  }
  return all.sort(sortReminders);
}

/** The subset that actually needs action now (overdue or due soon) — the
 *  subset a dashboard/attention surface should lead with. Reminder Engine
 *  still owns this filter; the caller never re-decides urgency. */
export function needsAttention(reminders) {
  const list = Array.isArray(reminders) ? reminders : [];
  return list.filter((r) => r.status === 'overdue' || r.status === 'due_soon');
}

/**
 * A compact, pre-ordered summary for dashboard/panel consumption: counts per
 * status plus a capped, already-sorted "top" slice. The caller renders this
 * verbatim — it never re-sorts, re-filters by priority, or recomputes counts.
 * @param {Array<Object>} reminders  computeFleetReminders() (or a single
 *   vehicle's computeVehicleReminders()) output
 * @param {number} [cap=5]
 */
export function summarizeReminders(reminders, cap = 5) {
  const list = Array.isArray(reminders) ? reminders : [];
  const overdue = list.filter((r) => r.status === 'overdue').length;
  const dueSoon = list.filter((r) => r.status === 'due_soon').length;
  const upcoming = list.filter((r) => r.status === 'upcoming').length;
  const completed = list.filter((r) => r.status === 'completed').length;
  const top = needsAttention(list).slice(0, cap);
  return Object.freeze({
    total: list.length,
    overdueCount: overdue,
    dueSoonCount: dueSoon,
    upcomingCount: upcoming,
    completedCount: completed,
    top,
  });
}

console.info('Reminder engine module loaded');
