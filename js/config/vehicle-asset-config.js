/* ============================================================
   VEHICLE-ASSET-CONFIG.JS — Vehicle Asset Intelligence (v1.18.0)

   The single source of truth for the ASSET-IDENTITY tunables the Vehicle Asset
   service + UI read: the vehicle TYPE registry (Mobil / Motor / Ambulance), the
   lifecycle STATUS registry (Active / Maintenance / Inactive / Retired), the
   operational ELIGIBILITY matrix per type (policy only — no scoring), the fuel /
   transmission option lists, the document-completeness field weights, and the
   tax / STNK "due soon" threshold.

   These are PBSI business tunables, NOT scoring or analytics math. Centralizing
   them here means the service + drawer never hard-code a type, a status, or a
   threshold. Mirrors the dispatch-policy-config shape (frozen DEFAULT + getters).

   PURE: plain data only. No DOM, no Firebase, no `window`.
   ============================================================ */

'use strict';

/** Vehicle TYPE registry — part of the asset identity (Feature 1). */
export const VEHICLE_TYPE_REGISTRY = Object.freeze([
  Object.freeze({ key: 'mobil',     label: 'Mobil',     icon: '🚗' }),
  Object.freeze({ key: 'motor',     label: 'Motor',     icon: '🏍️' }),
  Object.freeze({ key: 'ambulance', label: 'Ambulance', icon: '🚑' }),
]);

/** Lifecycle STATUS registry — only `active` participates in operations (Feature 2).
 *  `tone` maps onto the platform --ok/--warn/--muted/--danger design tokens. */
export const VEHICLE_STATUS_REGISTRY = Object.freeze([
  Object.freeze({ key: 'active',      label: 'Active',      labelId: 'Aktif',    tone: 'ok',     operational: true  }),
  Object.freeze({ key: 'maintenance', label: 'Maintenance', labelId: 'Perbaikan',tone: 'warn',   operational: false }),
  Object.freeze({ key: 'inactive',    label: 'Inactive',    labelId: 'Nonaktif', tone: 'muted',  operational: false }),
  Object.freeze({ key: 'retired',     label: 'Retired',     labelId: 'Pensiun',  tone: 'danger', operational: false }),
]);

/** Operational eligibility per type (Feature 3 — POLICY ONLY, adds no score).
 *  dispatch / recommendation / analytics are the three operational surfaces.
 *  Ambulance is a SPECIAL policy: recommendation is allowed ONLY in Medical mode
 *  (resolved at evaluation time); admin override always supersedes (handled by the
 *  service, reusing the Dispatch Policy Engine). */
export const TYPE_ELIGIBILITY = Object.freeze({
  mobil:     Object.freeze({ dispatch: true,  recommendation: true,  analytics: true,  medicalOnly: false }),
  motor:     Object.freeze({ dispatch: false, recommendation: false, analytics: false, medicalOnly: false }),
  ambulance: Object.freeze({ dispatch: true,  recommendation: false, analytics: false, medicalOnly: true  }),
});

/** Fuel + transmission option lists (Feature 5 + Feature 12 distributions). */
export const FUEL_TYPES = Object.freeze(['Bensin', 'Solar', 'Pertalite', 'Pertamax', 'Hybrid', 'Listrik']);
export const TRANSMISSION_TYPES = Object.freeze(['Manual', 'Otomatis']);

/** Document-completeness contributors (Feature 11). Each present field adds its
 *  weight; completeness = sum(present weights) / sum(all weights) × 100. */
export const DOCUMENT_FIELDS = Object.freeze([
  Object.freeze({ key: 'stnkNumber',      label: 'No. STNK',        weight: 2 }),
  Object.freeze({ key: 'stnkExpiry',      label: 'Masa Berlaku STNK', weight: 2 }),
  Object.freeze({ key: 'engineNumber',    label: 'No. Mesin',       weight: 1 }),
  Object.freeze({ key: 'chassisNumber',   label: 'No. Rangka',      weight: 1 }),
  Object.freeze({ key: 'owner',           label: 'Pemilik',         weight: 1 }),
  Object.freeze({ key: 'insuranceCompany',label: 'Perusahaan Asuransi', weight: 1 }),
  Object.freeze({ key: 'policyNumber',    label: 'No. Polis',       weight: 1 }),
  Object.freeze({ key: 'insuranceExpiry', label: 'Masa Berlaku Asuransi', weight: 1 }),
]);

/** Legal/insurance "due soon" window, in days. Inside this window before expiry a
 *  document is flagged due-soon (warn); past expiry it is expired (danger). */
export const DUE_SOON_DAYS = 30;

/** Health composition weights (Feature 11 — Overall Asset Health). Higher = better
 *  for every sub-score (Unified Scoring philosophy). Weights sum to 1.
 *
 *  v1.18.1 RE-WEIGHT (fleets < 15 vehicles): the prior model led with operational
 *  STATUS (0.40), but status (active/inactive/retired) is a STATE the admin sets,
 *  not a measure of asset health — it made an idle-but-fully-legal vehicle score
 *  the same as a maintained one, and let an expired-STNK vehicle still read
 *  "healthy" because it was Active. For a small fleet the real risk is LEGAL
 *  lapse (STNK/tax/insurance) and MAINTENANCE neglect, so those now lead. Each
 *  sub-score is still re-normalized over only the PRESENT components, so a
 *  vehicle with no maintenance history is not penalized to zero — its weight is
 *  redistributed to the components that do have data. */
export const HEALTH_WEIGHTS = Object.freeze({
  legal:       0.40, // STNK + tax + insurance validity — the #1 fleet risk
  maintenance: 0.35, // recency + frequency + compliance (v1.18.1)
  operational: 0.15, // status-derived (a state, not a health measure)
  documents:   0.10, // completeness of the asset record
});

/** Operational-status health points (Feature 11 — higher = better). */
export const STATUS_HEALTH = Object.freeze({
  active: 100, maintenance: 55, inactive: 30, retired: 0,
});

const TYPE_KEYS = VEHICLE_TYPE_REGISTRY.map((t) => t.key);
const STATUS_KEYS = VEHICLE_STATUS_REGISTRY.map((s) => s.key);

/** @returns {string[]} valid type keys. */
export function vehicleTypeKeys() { return TYPE_KEYS.slice(); }
/** @returns {string[]} valid status keys. */
export function vehicleStatusKeys() { return STATUS_KEYS.slice(); }

/** Registry entry for a type key (never null — falls back to mobil). */
export function vehicleTypeInfo(key) {
  return VEHICLE_TYPE_REGISTRY.find((t) => t.key === key) || VEHICLE_TYPE_REGISTRY[0];
}
/** Registry entry for a status key (never null — falls back to inactive). */
export function vehicleStatusInfo(key) {
  return VEHICLE_STATUS_REGISTRY.find((s) => s.key === key)
    || VEHICLE_STATUS_REGISTRY[2];
}
