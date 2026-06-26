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
 *  for every sub-score (Unified Scoring philosophy). Weights sum to 1. */
export const HEALTH_WEIGHTS = Object.freeze({
  operational: 0.40, // status-derived
  legal:       0.35, // STNK + tax + insurance validity
  documents:   0.25, // completeness
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
