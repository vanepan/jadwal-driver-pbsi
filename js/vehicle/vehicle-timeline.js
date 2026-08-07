'use strict';

/* ============================================================
   VEHICLE-TIMELINE.JS — Vehicle Core Phase 8 (Unified Timeline)

   Assembles ONE chronological timeline per vehicle from event streams that
   already exist — this file owns no business logic, invents no timestamp,
   and recalculates nothing. Owners calculate; this file only assembles.

   REUSES js/gudang/activity/activity-engine.js (v1.29.6) — that engine was
   deliberately built domain-ignorant ("zero knowledge of Gudang, Items, or
   Movements") specifically so a future Vehicle Timeline could reuse it
   unmodified (js/config.js's own v1.29.6 changelog entry). This is the
   FIRST cross-domain import of it; the engine itself needed zero changes,
   confirming that design held up.

   SOURCES (every one already computed elsewhere; nothing here re-derives a
   due date, a health score, a compliance status, or a reminder priority):
     - Vehicle Created            asset.acquisitionDate || asset.createdAt
     - Vehicle Archived           asset.archived + asset.updatedAt (the only
                                   timestamp signal exposed on a normalized
                                   asset for this transition — see below)
     - Status Change              asset.status + asset.statusInfo + asset.updatedAt
     - Annual/Five-Year Tax,
       Insurance, Other Renewal   asset.complianceHistory[] (typed by rec.type)
     - Maintenance Performed      asset.maintenanceTimeline[] (status==='completed')
     - Maintenance Due            asset.maintenanceProjection (via reminder-engine's
                                   own maintenance branch — see below)
     - Reminder Generated         computeVehicleReminders(asset) (reminder-engine.js)
     - Custom / future events     asset.timeline[] entries buildVehicleTimeline()
                                   already merges in verbatim from the raw
                                   store's v.timeline[] — the SAME extension
                                   point vehicle-asset-service.js documents as
                                   "future-ready"; passed through here unchanged.

   MAINTENANCE DUE vs. REMINDER GENERATED — a deliberate non-duplication
   decision: reminder-engine.js's maintenance branch reads asset.
   maintenanceProjection.items VERBATIM (same reference, never recomputed —
   test-verified in reminder-engine-check.mjs). Building a SEPARATE adapter
   that also reads asset.maintenanceProjection.items directly would show the
   exact same real-world fact twice on one timeline. Instead, ONE reminder
   adapter below reads computeVehicleReminders(asset) once and labels each
   entry MAINTENANCE_DUE (type:'maintenance') or REMINDER_GENERATED (the
   other three types) by the reminder's own `type` field — one read, two
   labels, zero duplicate rows.

   VEHICLE RESTORED — defined in the vocabulary below (Future Ready: the
   event model must accommodate it) but never emitted this phase. Traced:
   vehicles-store.js#restoreVehicle only writes `archivedAt: null` and
   `updatedAt` — no dedicated "restoredAt" field exists, and vehicles-store.js
   is on the release's Do-Not-Modify list, so no new write path can be added
   to capture it. Emitting a synthetic "Restored" event from `archived===false`
   would be indistinguishable from "never archived at all" — that's inventing
   a timestamp, not reading one, so it is correctly left unpopulated (same
   discipline gudang-activities.js already uses for its own dormant types:
   defined in the vocabulary, not fabricated from absent data).

   DETERMINISTIC ORDERING: activity-engine's sortActivitiesDesc is a plain
   stable numeric sort on `when` — ties preserve INSERTION order, which this
   file's own concatenation order would otherwise make arbitrary. Before
   sorting, events are pre-sorted by `id` (stable, reproducible regardless of
   which source array was concatenated first) — same-timestamp ties then
   resolve alphabetically by id, not by accident of source order (brief:
   "If two events have the same timestamp, use deterministic ordering").

   PURE: no DOM, no Firebase, no `window`. Node-testable.
   ============================================================ */

import { createActivityEntry, sortActivitiesDesc } from '../gudang/activity/activity-engine.js';
import { complianceTypeInfo } from '../config/compliance-config.js';
import { computeVehicleReminders } from '../services/reminder-engine.js';

/* ── Event vocabulary ─────────────────────────────────────────────────── */

export const TIMELINE_EVENT = Object.freeze({
  VEHICLE_CREATED: 'vehicle_created',
  VEHICLE_ARCHIVED: 'vehicle_archived',
  // Future-ready — see file header. No adapter below ever emits this today.
  VEHICLE_RESTORED: 'vehicle_restored',
  STATUS_CHANGE: 'status_change',
  ANNUAL_TAX_RENEWAL: 'annual_tax_renewal',
  FIVE_YEAR_TAX_RENEWAL: 'five_year_tax_renewal',
  INSURANCE_RENEWAL: 'insurance_renewal',
  OTHER_COMPLIANCE: 'other_compliance',
  MAINTENANCE_PERFORMED: 'maintenance_performed',
  MAINTENANCE_DUE: 'maintenance_due',
  REMINDER_GENERATED: 'reminder_generated',
  // Passthrough of asset.timeline[]'s own future-ready custom entries.
  CUSTOM: 'custom',
});

/** Human label per compliance ledger type — reuses compliance-config.js's OWN
 *  timelineTitle verbatim (already exactly "STNK Diperpanjang" / "STNK 5
 *  Tahunan Diperpanjang" / "Asuransi Diperpanjang" / "Pembayaran Lainnya" —
 *  no new label invented). */
const COMPLIANCE_EVENT_TYPE = Object.freeze({
  annual_tax: TIMELINE_EVENT.ANNUAL_TAX_RENEWAL,
  five_year_tax: TIMELINE_EVENT.FIVE_YEAR_TAX_RENEWAL,
  insurance: TIMELINE_EVENT.INSURANCE_RENEWAL,
  other: TIMELINE_EVENT.OTHER_COMPLIANCE,
});

/** Synthetic keys buildVehicleTimeline() (vehicle-asset-service.js) already
 *  produces on asset.timeline — everything else on that array came from the
 *  raw store's OWN future-ready v.timeline[] passthrough, i.e. a genuine
 *  custom entry this file should carry forward untouched. */
const SYNTHETIC_TIMELINE_KEYS = new Set(['registered', 'tax_paid', 'compliance', 'stnk', 'insurance', 'maintenance', 'retired']);

function str(v) { return v == null ? '' : String(v).trim(); }

/** Local, presentation-only formatter (no thousands separators would read as
 *  a raw number) — mirrors the SAME pattern every other Vehicle Core file
 *  already keeps as its own small local helper (fleet-dashboard.js,
 *  vehicle-detail-drawer.js, vehicle-reminder-panel.js each define their own
 *  `esc`/date helper rather than sharing one) — not a new convention. */
function fmtRupiah(n) {
  const num = Number(n);
  return Number.isFinite(num) ? num.toLocaleString('id-ID') : str(n);
}

function fmtDateID(s) {
  if (!s) return '';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? str(s) : d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Tones stay within execDrawerTimeline's own accepted set (ok/warn/danger/
 *  info) — anything else already falls back to 'info' there, but resolving
 *  it here keeps the ActivityEntry.meta.tone value self-consistent for the
 *  Dashboard preview consumer too. */
function safeTone(t) {
  return (t === 'ok' || t === 'warn' || t === 'danger' || t === 'info') ? t : 'info';
}

/* ── Adapters (each reads asset.* fields already computed elsewhere) ────── */

function createdEvent(asset) {
  const when = asset.acquisitionDate || asset.createdAt;
  if (!when) return null;
  return createActivityEntry({
    id: `vt-created-${asset.id}`,
    type: TIMELINE_EVENT.VEHICLE_CREATED,
    when,
    title: 'Terdaftar',
    description: asset.acquisitionValue ? `Nilai akuisisi Rp ${fmtRupiah(asset.acquisitionValue)}` : '',
    meta: { tone: safeTone('info') },
  });
}

/** Archived — asset.archived is a boolean with no dedicated timestamp
 *  exposed on the normalized asset (vehicles-store.js writes `archivedAt`,
 *  but vehicle-asset-service.js's normalizeVehicleAsset() never surfaces it
 *  and is off-limits to extend this phase). asset.updatedAt is the SAME
 *  "last known transition time" proxy vehicle-asset-service.js's own
 *  buildVehicleTimeline() already relies on for its 'maintenance'/'retired'
 *  synthetic entries — reusing that established pattern, not inventing a
 *  new one. */
function archivedEvent(asset) {
  if (asset.archived !== true || !asset.updatedAt) return null;
  return createActivityEntry({
    id: `vt-archived-${asset.id}`,
    type: TIMELINE_EVENT.VEHICLE_ARCHIVED,
    when: asset.updatedAt,
    title: 'Diarsipkan',
    description: '',
    meta: { tone: safeTone('warn') },
  });
}

/** Status Change — generalizes buildVehicleTimeline()'s existing maintenance/
 *  retired-only synthesis (vehicle-asset-service.js) to every non-active
 *  status, reading only fields already exposed on the normalized asset. */
function statusChangeEvent(asset) {
  if (!asset.status || asset.status === 'active' || !asset.updatedAt) return null;
  const info = asset.statusInfo || {};
  return createActivityEntry({
    id: `vt-status-${asset.id}-${asset.status}`,
    type: TIMELINE_EVENT.STATUS_CHANGE,
    when: asset.updatedAt,
    title: `Status: ${info.labelId || asset.status}`,
    description: '',
    meta: { tone: safeTone(info.tone) },
  });
}

/** Compliance renewals — reads asset.complianceHistory directly (typed by
 *  rec.type) rather than asset.timeline's already-flattened 'compliance' key,
 *  so each renewal keeps a distinguishable TIMELINE_EVENT type plus its
 *  structured amount/officer/notes (the flattened version loses all of that
 *  into one pre-joined description string). */
function complianceRenewalEvents(asset) {
  const rows = Array.isArray(asset.complianceHistory) ? asset.complianceHistory : [];
  return rows
    .filter((rec) => rec && str(rec.renewalDate))
    .map((rec, i) => {
      const info = complianceTypeInfo(rec.type);
      return createActivityEntry({
        id: rec.id || `vt-compliance-${asset.id}-${i}`,
        type: COMPLIANCE_EVENT_TYPE[rec.type] || TIMELINE_EVENT.OTHER_COMPLIANCE,
        when: rec.renewalDate,
        who: str(rec.officer) || null,
        title: info.timelineTitle,
        description: [
          rec.amount != null ? `Rp ${fmtRupiah(rec.amount)}` : '',
          rec.expiryDate ? `Berlaku hingga ${fmtDateID(rec.expiryDate)}` : '',
        ].filter(Boolean).join(' · '),
        meta: { tone: safeTone('info'), amount: rec.amount, expiryDate: rec.expiryDate, notes: str(rec.notes) },
      });
    });
}

/** Legacy taxHistory[] backward compat (Phase 3, v1.29.14, kept the READ
 *  path deliberately — real data for vehicles created before v1.29.2 may
 *  have no complianceHistory equivalent). Reads it via asset.timeline's own
 *  'tax_paid' passthrough rather than asset.taxHistory directly, so the
 *  SAME date-presence guard buildVehicleTimeline() already applies is never
 *  duplicated here. */
function legacyTaxPaidEvents(asset) {
  const rows = Array.isArray(asset.timeline) ? asset.timeline : [];
  return rows
    .filter((e) => e && e.key === 'tax_paid' && str(e.date))
    .map((e, i) => createActivityEntry({
      id: `vt-legacy-tax-${asset.id}-${i}`,
      type: TIMELINE_EVENT.ANNUAL_TAX_RENEWAL,
      when: e.date,
      title: e.label || 'Pajak Dibayar',
      description: e.detail || '',
      meta: { tone: safeTone('info'), legacy: true },
    }));
}

/** Maintenance Performed — completed records only (a planned/in-progress
 *  record has not "happened" yet in a past-tense sense). */
function maintenancePerformedEvents(asset) {
  const rows = Array.isArray(asset.maintenanceTimeline) ? asset.maintenanceTimeline : [];
  return rows
    .filter((r) => r && r.status === 'completed' && str(r.date))
    .map((rec, i) => createActivityEntry({
      id: rec.id ? `vt-maint-${rec.id}` : `vt-maint-${asset.id}-${i}`,
      type: TIMELINE_EVENT.MAINTENANCE_PERFORMED,
      when: rec.date,
      who: str(rec.officer) || null,
      title: rec.categoryLabel || 'Perawatan',
      description: [rec.costDisplay, rec.workshopName].filter(Boolean).join(' · '),
      meta: { tone: safeTone('ok'), cost: rec.cost, workshopName: rec.workshopName },
    }));
}

/** Maintenance Due + Reminder Generated — ONE read of computeVehicleReminders
 *  (reminder-engine.js), split into two TIMELINE_EVENT labels by the
 *  reminder's own `type` field (see file header — avoids a duplicate row for
 *  the same underlying maintenanceProjection fact). 'completed' reminders
 *  (archived/retired vehicles — no further obligation, per reminder-engine's
 *  own doc) and reminders with no real due date (km-only maintenance
 *  projections) are excluded — never invent a timestamp. */
function reminderTimelineEvents(asset) {
  const reminders = computeVehicleReminders(asset);
  return reminders
    .filter((r) => r.status !== 'completed' && str(r.dueDate))
    .map((r, i) => createActivityEntry({
      id: `vt-reminder-${asset.id}-${r.type}-${r.category || 'x'}-${i}`,
      type: r.type === 'maintenance' ? TIMELINE_EVENT.MAINTENANCE_DUE : TIMELINE_EVENT.REMINDER_GENERATED,
      when: r.dueDate,
      title: r.category ? `${r.typeLabel} — ${r.categoryLabel}` : r.typeLabel,
      description: r.reason,
      meta: { tone: safeTone(r.tone), status: r.status, priority: r.priority, recommendedAction: r.recommendedAction },
    }));
}

/** Future-ready custom passthrough — the ONE piece of asset.timeline this
 *  file does not rebuild itself (see SYNTHETIC_TIMELINE_KEYS above). This is
 *  the exact extension point the release brief's "Future Ready" section asks
 *  for (Fuel/Accident/Repair/Inspection/Dispatch/Digitization): the event
 *  model already accommodates them via the raw store's v.timeline[] array
 *  with zero new code required when a future phase starts writing to it. */
function customEvents(asset) {
  const rows = Array.isArray(asset.timeline) ? asset.timeline : [];
  return rows
    .filter((e) => e && str(e.date) && !SYNTHETIC_TIMELINE_KEYS.has(e.key))
    .map((e, i) => createActivityEntry({
      id: `vt-custom-${asset.id}-${i}-${str(e.key) || 'event'}`,
      type: TIMELINE_EVENT.CUSTOM,
      when: e.date,
      title: e.label || 'Peristiwa',
      description: e.detail || '',
      meta: { tone: safeTone('info'), key: e.key },
    }));
}

/* ── Assembly (Performance: happens once per call, never re-derives a fact) ─ */

/**
 * Assemble the full Unified Timeline for ONE normalized vehicle asset,
 * newest first. Every event traces to an existing owner (vehicle-asset-
 * service.js, compliance-config.js, maintenance-service.js, reminder-
 * engine.js) — this function computes no due date, status, or priority of
 * its own.
 * @param {Object} asset  vehicle-asset-service.normalizeVehicleAsset() output
 * @returns {Array<Object>} ActivityEntry-shaped events (activity-engine.js)
 */
export function buildVehicleTimelineEvents(asset) {
  if (!asset || typeof asset !== 'object') return [];
  const events = [
    createdEvent(asset),
    archivedEvent(asset),
    statusChangeEvent(asset),
    ...complianceRenewalEvents(asset),
    ...legacyTaxPaidEvents(asset),
    ...maintenancePerformedEvents(asset),
    ...reminderTimelineEvents(asset),
    ...customEvents(asset),
  ].filter(Boolean);

  // Deterministic tie-break (see file header): pre-sort by id so the
  // stable sortActivitiesDesc's same-`when` ties resolve reproducibly,
  // independent of the arbitrary concatenation order above.
  events.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return sortActivitiesDesc(events);
}

/**
 * Fleet-wide "recent activity" preview (Dashboard, brief: "may display a
 * small Recent Vehicle Activity preview... Dashboard only consumes it").
 * Reuses buildVehicleTimelineEvents() per vehicle — never a second event
 * model — and tags each entry with the vehicle it belongs to.
 * @param {Array<Object>} vehicles  normalized assets (e.g.
 *   computeFleetAssetModel().vehicles — the SAME array the Fleet Dashboard/
 *   Reminder Panel already consume, no second computeFleetAssetModel call)
 * @param {{limit?:number}} [opts]
 * @returns {Array<Object>}
 */
export function recentVehicleActivity(vehicles, { limit = 8 } = {}) {
  const list = Array.isArray(vehicles) ? vehicles : [];
  const entries = [];
  for (const asset of list) {
    for (const e of buildVehicleTimelineEvents(asset)) {
      entries.push({ ...e, meta: { ...e.meta, vehicleId: asset.id, vehicleName: asset.name, plateNumber: asset.plateNumber } });
    }
  }
  return sortActivitiesDesc(entries).slice(0, limit);
}

console.info('Vehicle timeline module loaded');
