/* ============================================================
   VEHICLE-ASSET-SERVICE.JS — Vehicle Asset Intelligence (v1.18.0)

   The interpretation layer over the Vehicle Store (the SINGLE SOURCE OF TRUTH for
   every PBSI vehicle asset). It NORMALIZES each raw vehicle record into a canonical
   asset, derives tax / STNK / insurance validity, document completeness, the
   Overall Asset Health score (Unified Scoring philosophy — higher is ALWAYS
   better), the chronological timeline, and the operational eligibility verdict.

   It RE-EXPRESSES; it never mutates the store and never re-implements a rule that
   already lives elsewhere:
     • Ambulance detection + the eligibility filter REUSE the Dispatch Policy
       Engine (isSpecialVehicle) — this layer adds the asset-type policy (Mobil
       dispatch-only / Motor excluded / Ambulance medical-only) on top, it does
       NOT modify dispatch.
     • Every score is normalized through Unified Scoring (clampScore / scoreBand /
       scoreColor) — no new band, color, or inversion is invented here.
     • Fleet analytics are produced by vehicle-asset-analytics (asset-only).

   PURE: no DOM, no Firebase, no `window`. Node-testable.
   ============================================================ */

'use strict';

import { clampScore, scoreBand, scoreColor, scoreLabel, scoreLabelId } from './unified-scoring.js';
import { isSpecialVehicle } from './dispatch-policy-engine.js';
import { computeFleetAnalytics } from '../analytics/vehicle-asset-analytics.js';
import {
  vehicleTypeInfo, vehicleStatusInfo, vehicleTypeKeys, vehicleStatusKeys,
  TYPE_ELIGIBILITY, DOCUMENT_FIELDS, DUE_SOON_DAYS, HEALTH_WEIGHTS, STATUS_HEALTH,
} from '../config/vehicle-asset-config.js';

const TYPE_KEYS = vehicleTypeKeys();
const STATUS_KEYS = vehicleStatusKeys();

function str(v) { return v == null ? '' : String(v).trim(); }
function nowMs(now) { const t = new Date(now || Date.now()).getTime(); return Number.isFinite(t) ? t : Date.now(); }

/** Resolve the asset TYPE (Feature 1): explicit field wins; otherwise the Dispatch
 *  Policy Engine's ambulance detection; otherwise default Mobil. */
export function resolveVehicleType(vehicle) {
  if (!vehicle || typeof vehicle !== 'object') return 'mobil';
  const t = str(vehicle.type).toLowerCase();
  if (TYPE_KEYS.includes(t)) return t;
  if (isSpecialVehicle(vehicle)) return 'ambulance';
  return 'mobil';
}

/** Resolve the lifecycle STATUS (Feature 2): explicit field wins; otherwise the
 *  legacy `active` flag maps to active/inactive. */
export function resolveVehicleStatus(vehicle) {
  if (!vehicle || typeof vehicle !== 'object') return 'inactive';
  const s = str(vehicle.status).toLowerCase();
  if (STATUS_KEYS.includes(s)) return s;
  return vehicle.active === false ? 'inactive' : 'active';
}

/* ── Document validity (Feature 6 / 7 / 8) ────────────────────────────────── */

/** Whole days from `now` to an ISO/`YYYY-MM-DD` date (positive = future). null when unparseable. */
export function daysUntil(dateStr, now) {
  const s = str(dateStr);
  if (!s) return null;
  const t = new Date(s).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.ceil((t - nowMs(now)) / 86400000);
}

const DOC_STATUS_META = {
  valid:    { label: 'Berlaku',       tone: 'ok',     score: 100 },
  due_soon: { label: 'Jatuh Tempo',   tone: 'warn',   score: 55 },
  expired:  { label: 'Kedaluwarsa',   tone: 'danger', score: 5 },
  unknown:  { label: 'Tdk diketahui', tone: 'muted',  score: null },
};

/** Classify a single expiry date into valid / due_soon / expired / unknown. */
export function deriveDocStatus(expiryDate, now) {
  const days = daysUntil(expiryDate, now);
  let status;
  if (days == null) status = 'unknown';
  else if (days < 0) status = 'expired';
  else if (days <= DUE_SOON_DAYS) status = 'due_soon';
  else status = 'valid';
  const meta = DOC_STATUS_META[status];
  return { status, days, label: meta.label, tone: meta.tone };
}

/** Tax status (Feature 6) — derived from the annual tax due date, falling back to
 *  STNK expiry (in ID the annual tax coincides with STNK validity). */
export function deriveTaxStatus(vehicle, now) {
  const src = str(vehicle.annualTaxDue) || str(vehicle.stnkExpiry);
  return deriveDocStatus(src, now);
}

/* ── Document completeness (Feature 11) ───────────────────────────────────── */

export function computeDocumentCompleteness(vehicle) {
  const v = vehicle || {};
  let got = 0, all = 0;
  const present = [], missing = [];
  for (const f of DOCUMENT_FIELDS) {
    all += f.weight;
    if (str(v[f.key])) { got += f.weight; present.push(f.label); }
    else missing.push(f.label);
  }
  return { completeness: all ? Math.round((got / all) * 100) : 0, present, missing };
}

/* ── Overall Asset Health (Feature 11 — higher is ALWAYS better) ───────────── */

/**
 * Compose the Overall Asset Health from three positive sub-scores:
 *   • Operational — status-derived (active 100 … retired 0).
 *   • Legal       — average of the available STNK / Tax / Insurance validity
 *                   scores (unknown documents are not counted).
 *   • Documents   — completeness percent.
 * Every sub-score is normalized through Unified Scoring; the overall re-weights
 * only the present components (so an asset with no legal data is not unfairly
 * penalized to zero). Returns band / color / label from Unified Scoring.
 */
export function computeVehicleHealth(parts) {
  const { status, stnk, tax, insurance, documents } = parts;
  const operational = clampScore(STATUS_HEALTH[status] != null ? STATUS_HEALTH[status] : 30);

  const legalScores = [stnk, tax, insurance]
    .map((d) => (d && d.status && DOC_STATUS_META[d.status].score != null ? DOC_STATUS_META[d.status].score : null))
    .filter((s) => s != null);
  const legal = legalScores.length ? clampScore(legalScores.reduce((a, b) => a + b, 0) / legalScores.length) : null;

  const docScore = clampScore(documents ? documents.completeness : 0);

  const comps = [
    { v: operational, w: HEALTH_WEIGHTS.operational },
    { v: legal,       w: HEALTH_WEIGHTS.legal },
    { v: docScore,    w: HEALTH_WEIGHTS.documents },
  ].filter((c) => c.v != null);
  const wsum = comps.reduce((a, c) => a + c.w, 0) || 1;
  const overall = clampScore(comps.reduce((a, c) => a + c.v * c.w, 0) / wsum);

  return {
    operational,
    legal,
    documents: docScore,
    overall,
    band: scoreBand(overall),
    color: scoreColor(overall),
    label: scoreLabel(overall),
    labelId: scoreLabelId(overall),
  };
}

/* ── Operational eligibility (Feature 3 — POLICY ONLY) ────────────────────── */

/**
 * The asset-type operational policy that sits ON TOP of the Dispatch Policy
 * Engine — it adds no score and changes no dispatch formula. Returns which
 * operational surfaces (dispatch / recommendation / analytics) the asset may
 * participate in, plus the reasons.
 *   • Mobil      → dispatch + recommendation + analytics.
 *   • Motor      → none (excluded from dispatch, recommendation, analytics).
 *   • Ambulance  → dispatch yes; recommendation ONLY in Medical mode; analytics no.
 *   • Only an ACTIVE status participates (non-active → all false).
 *   • Admin override ALWAYS supersedes (everything allowed).
 * @param {Object} vehicle
 * @param {{medicalMode?:boolean, adminOverride?:boolean}} [context]
 */
export function evaluateOperationalEligibility(vehicle, context = {}) {
  const type = resolveVehicleType(vehicle);
  const status = resolveVehicleStatus(vehicle);
  const base = TYPE_ELIGIBILITY[type] || TYPE_ELIGIBILITY.mobil;
  const reasons = [];

  if (context.adminOverride) {
    return { type, status, dispatch: true, recommendation: true, analytics: true, medicalOnly: base.medicalOnly, adminOverride: true, reasons: ['admin_override'] };
  }

  if (status !== 'active') {
    reasons.push('not_active');
    return { type, status, dispatch: false, recommendation: false, analytics: false, medicalOnly: base.medicalOnly, adminOverride: false, reasons };
  }

  let recommendation = base.recommendation;
  if (base.medicalOnly) {
    recommendation = !!context.medicalMode;
    reasons.push(context.medicalMode ? 'ambulance_medical_mode' : 'ambulance_medical_only');
  } else if (!base.dispatch) {
    reasons.push('type_excluded'); // Motor
  }

  return {
    type, status,
    dispatch: base.dispatch,
    recommendation,
    analytics: base.analytics,
    medicalOnly: base.medicalOnly,
    adminOverride: false,
    reasons,
  };
}

/* ── Timeline (Feature 9 — chronological, future-ready) ───────────────────── */

/**
 * Derive the chronological asset timeline from the record. Events come from the
 * stored fields (acquisition, tax payment history, STNK/insurance validity,
 * status). A stored `timeline` array (future-ready event log) is merged in
 * verbatim. Sorted oldest → newest.
 */
export function buildVehicleTimeline(vehicle, now) {
  const v = vehicle || {};
  const events = [];
  const add = (date, key, label, detail) => { if (str(date)) events.push({ date: str(date), key, label, detail: detail || '' }); };

  add(v.acquisitionDate || v.createdAt, 'registered', 'Terdaftar', v.acquisitionValue ? `Nilai akuisisi ${v.acquisitionValue}` : '');
  if (Array.isArray(v.taxHistory)) {
    for (const tx of v.taxHistory) {
      if (tx && str(tx.date)) add(tx.date, 'tax_paid', 'Pajak Dibayar', [tx.amount && `Rp ${tx.amount}`, tx.officer && `oleh ${tx.officer}`, tx.notes].filter(Boolean).join(' · '));
    }
  }
  add(v.stnkExpiry, 'stnk', 'STNK Berlaku Hingga', '');
  add(v.insuranceExpiry, 'insurance', 'Asuransi Berlaku Hingga', v.insuranceCompany ? str(v.insuranceCompany) : '');

  const status = resolveVehicleStatus(v);
  if (status === 'maintenance') add(v.updatedAt, 'maintenance', 'Masuk Perbaikan', '');
  if (status === 'retired') add(v.updatedAt, 'retired', 'Dipensiunkan', '');

  if (Array.isArray(v.timeline)) {
    for (const e of v.timeline) {
      if (e && typeof e === 'object' && str(e.date)) {
        add(e.date, str(e.key) || 'event', str(e.label) || 'Peristiwa', str(e.detail));
      }
    }
  }

  events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  return events;
}

/* ── Normalize one asset ──────────────────────────────────────────────────── */

/** Turn a raw store record into the canonical asset consumed by the UI + analytics. */
export function normalizeVehicleAsset(vehicle, now) {
  const v = vehicle || {};
  const type = resolveVehicleType(v);
  const status = resolveVehicleStatus(v);
  const stnk = deriveDocStatus(v.stnkExpiry, now);
  const tax = deriveTaxStatus(v, now);
  const insurance = deriveDocStatus(v.insuranceExpiry, now);
  const documents = computeDocumentCompleteness(v);
  const health = computeVehicleHealth({ status, stnk, tax, insurance, documents });
  const eligibility = evaluateOperationalEligibility(v);
  const timeline = buildVehicleTimeline(v, now);

  return {
    id: v.id,
    name: str(v.name),
    plateNumber: str(v.plateNumber),
    capacity: v.capacity,
    color: v.color || '#555555',
    type, typeInfo: vehicleTypeInfo(type),
    status, statusInfo: vehicleStatusInfo(status),
    // Registration (Feature 5)
    brand: str(v.brand), model: str(v.model), year: str(v.year),
    fuel: str(v.fuel), transmission: str(v.transmission),
    engineNumber: str(v.engineNumber), chassisNumber: str(v.chassisNumber),
    owner: str(v.owner), registrationRegion: str(v.registrationRegion),
    odometer: str(v.odometer), acquisitionDate: str(v.acquisitionDate), acquisitionValue: str(v.acquisitionValue),
    // Legal (Feature 6)
    stnkNumber: str(v.stnkNumber), stnkExpiry: str(v.stnkExpiry),
    annualTaxDue: str(v.annualTaxDue), fiveYearTaxDue: str(v.fiveYearTaxDue),
    stnk, tax,
    // Insurance (Feature 8)
    insuranceCompany: str(v.insuranceCompany), policyNumber: str(v.policyNumber),
    coverage: str(v.coverage), insuranceExpiry: str(v.insuranceExpiry),
    insurance,
    // Derived blocks
    documents, health, eligibility,
    taxHistory: Array.isArray(v.taxHistory) ? v.taxHistory.slice() : [],
    timeline,
    createdAt: v.createdAt || null, updatedAt: v.updatedAt || null,
    archived: v.archived === true,
  };
}

/* ── Search & filter (Feature 13) ─────────────────────────────────────────── */

/**
 * Filter NORMALIZED assets by type / status / brand / plate / year / fuel /
 * transmission and a free-text query (matches name, plate, brand, model, owner).
 * Empty/`'all'` filters match everything.
 */
export function searchFilterVehicles(vehicles, filters = {}) {
  const list = Array.isArray(vehicles) ? vehicles : [];
  const q = str(filters.query).toLowerCase();
  const want = (val, f) => !f || f === 'all' || str(f).toLowerCase() === str(val).toLowerCase();
  return list.filter((v) => {
    if (!want(v.type, filters.type)) return false;
    if (!want(v.status, filters.status)) return false;
    if (!want(v.fuel, filters.fuel)) return false;
    if (!want(v.transmission, filters.transmission)) return false;
    if (filters.brand && filters.brand !== 'all' && !str(v.brand).toLowerCase().includes(str(filters.brand).toLowerCase())) return false;
    if (filters.year && filters.year !== 'all' && str(v.year) !== str(filters.year)) return false;
    if (q) {
      const hay = `${v.name} ${v.plateNumber} ${v.brand} ${v.model} ${v.owner} ${v.year}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/* ── Fleet model (Feature 10 dashboard + Feature 12 analytics) ────────────── */

/**
 * The single entry point the Fleet Dashboard + drawer consume. Normalizes every
 * record once, computes the executive dashboard counts (Feature 10), runs the
 * asset-only analytics (Feature 12), and returns the per-asset list.
 *
 * @param {Object} input
 * @param {Array<Object>} input.vehicles  raw store records
 * @param {string|Date|number} [input.now]
 * @param {boolean} [input.includeArchived=false]
 * @returns {{ now:string, dashboard:Object, analytics:Object, vehicles:Array }}
 */
export function computeFleetAssetModel(input = {}) {
  const raw = Array.isArray(input.vehicles) ? input.vehicles.filter((v) => v && typeof v === 'object') : [];
  const now = input.now ? new Date(input.now).toISOString() : new Date().toISOString();
  const source = input.includeArchived ? raw : raw.filter((v) => v.archived !== true);
  const vehicles = source.map((v) => normalizeVehicleAsset(v, now));

  const byStatus = (s) => vehicles.filter((v) => v.status === s).length;
  const byType = (t) => vehicles.filter((v) => v.type === t).length;
  const nonRetired = vehicles.filter((v) => v.status !== 'retired');
  const taxDueSoon = nonRetired.filter((v) => v.tax.status === 'due_soon').length;
  const expiredStnk = nonRetired.filter((v) => v.stnk.status === 'expired').length;
  const healthVals = vehicles.map((v) => v.health.overall);
  const healthAvg = healthVals.length ? clampScore(healthVals.reduce((a, b) => a + b, 0) / healthVals.length) : 0;

  const dashboard = {
    totalAssets: vehicles.length,
    active: byStatus('active'),
    maintenance: byStatus('maintenance'),
    inactive: byStatus('inactive'),
    retired: byStatus('retired'),
    cars: byType('mobil'),
    motorcycles: byType('motor'),
    ambulances: byType('ambulance'),
    taxDueSoon,
    expiredStnk,
    healthAvg,
    healthColor: scoreColor(healthAvg),
    healthLabel: scoreLabel(healthAvg),
  };

  const analytics = computeFleetAnalytics({ vehicles, now });

  return { now, dashboard, analytics, vehicles };
}

/** Locate a normalized asset in a fleet model by id. */
export function findVehicleAsset(model, id) {
  if (!model || !Array.isArray(model.vehicles) || id == null) return null;
  return model.vehicles.find((v) => v.id === id) || null;
}
