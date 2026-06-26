/* ============================================================
   DISPATCH-POLICY-ENGINE.JS — Dispatch Intelligence Policy Engine
   (v1.17.2)

   The single source of truth for PBSI eligibility BUSINESS RULES. It sits
   BEFORE every Recommendation Engine:

       Request → Dispatch Policy Engine → Driver Rec → Vehicle Rec → Scoring

   Every Recommendation Engine consumes the ALREADY-FILTERED entities this layer
   returns and never learns WHY an entity was filtered — the reasons live only in
   the diagnostics block. Business rules exist in ONE place: here.

   This is NOT a scoring layer, NOT an analytics layer, NOT an AI layer. It adds
   no score and changes no formula. It only decides which drivers / vehicles /
   requests are ELIGIBLE for a given context, and records why.

   The nine policies:
     1. Special Vehicle  — ambulance is never in the normal vehicle pool.
     2. Medical Mode     — Medical Pelatnas "Gunakan Ambulance" → ambulance-only pool.
     3. Driver Optional  — "Tanpa Driver" → driver engines skipped, vehicle-only.
     4. Admin Override   — an admin override is never blocked.
     5. Vehicle Analytics— ambulance never participates in vehicle analytics.
     6. Akuntes Exclusion— Akuntes never participates in any analytics.
     7. Petty Cash Unit  — Akuntes never appears in recommendation/autofill/suggestion.
     8. Policy Pipeline  — engines receive already-filtered entities.
     9. Diagnostics      — read-only eligible/filtered/reason counts.

   PURE: no DOM, no Firebase, no `window`. Every input is passed in, so the whole
   layer is node-testable (scripts/policy-engine-check.mjs).
   ============================================================ */

'use strict';

import { getPolicyConfig } from '../config/dispatch-policy-config.js';

/** Reason codes recorded against a filtered entity (read-only diagnostics). */
export const POLICY_REASON = Object.freeze({
  AMBULANCE_NOT_REQUESTED: 'ambulance_not_requested', // F1 — special vehicle kept out of normal pool
  MEDICAL_NON_AMBULANCE:   'medical_non_ambulance',   // F2 — non-ambulance dropped in medical mode
  DRIVER_OPTIONAL:         'driver_optional',         // F3 — "Tanpa Driver" → driver engines skipped
  DRIVER_ON_LEAVE:         'driver_on_leave',         // F3/F9 — driver on Cuti/Sakit/Izin
  DRIVER_DISABLED:         'driver_disabled',         // F3/F9 — driver inactive/archived (manual disabled)
});

/** Human-readable labels for the reason codes (id-ID) — for diagnostics UIs. */
export const POLICY_REASON_LABEL = Object.freeze({
  [POLICY_REASON.AMBULANCE_NOT_REQUESTED]: 'Kendaraan Khusus (Ambulance)',
  [POLICY_REASON.MEDICAL_NON_AMBULANCE]:   'Mode Medis — Ambulance Saja',
  [POLICY_REASON.DRIVER_OPTIONAL]:         'Tanpa Driver',
  [POLICY_REASON.DRIVER_ON_LEAVE]:         'Sedang Cuti/Sakit/Izin',
  [POLICY_REASON.DRIVER_DISABLED]:         'Nonaktif',
});

/** The special-case verdict surfaced in vehicle diagnostics. */
export const SPECIAL_CASE = Object.freeze({
  NONE:               'none',
  MEDICAL_MODE:       'medical_mode',       // ambulance-only pool (F2)
  AMBULANCE_OVERRIDE: 'ambulance_override', // ambulance explicitly requested (F1 exception)
  ADMIN_OVERRIDE:     'admin_override',     // admin override — nothing blocked (F4)
});

function normName(v) { return String(v == null ? '' : v).trim().toLowerCase(); }

/* ── Detection (config-driven — no hard-coded names) ──────────────────── */

/**
 * Is this a "special" vehicle (ambulance)? Matched by name containing any
 * configured special-vehicle token (case-insensitive). Also honours an explicit
 * `special: true` / `type: 'ambulance'` flag if a record carries one.
 * @param {Object} vehicle  a vehicle record ({ name, type?, special? })
 * @param {Object} [cfg]
 */
export function isSpecialVehicle(vehicle, cfg = getPolicyConfig()) {
  if (!vehicle || typeof vehicle !== 'object') return false;
  if (vehicle.special === true) return true;
  const hay = `${normName(vehicle.name)} ${normName(vehicle.type)} ${normName(vehicle.category)}`;
  return cfg.specialVehicleTokens.some((tok) => hay.includes(normName(tok)));
}

/** Is this requester Akuntes (analytics + suggestion excluded)? Name-matched. */
export function isAkuntesRequester(requesterName, cfg = getPolicyConfig()) {
  const n = normName(requesterName);
  if (!n) return false;
  return cfg.akuntesRequesterTokens.some((tok) => n.includes(normName(tok)));
}

/**
 * Is this a Medical Pelatnas requester (offered the "Gunakan Ambulance" option)?
 * Accepts a string or a record ({ name, unit, role, category }).
 * @param {string|Object} requester
 * @param {Object} [cfg]
 */
export function isMedicalRequester(requester, cfg = getPolicyConfig()) {
  const hay = typeof requester === 'string'
    ? normName(requester)
    : requester && typeof requester === 'object'
      ? `${normName(requester.name)} ${normName(requester.unit)} ${normName(requester.role)} ${normName(requester.category)}`
      : '';
  if (!hay) return false;
  return cfg.medicalRequesterTokens.some((tok) => hay.includes(normName(tok)));
}

/* ── Driver eligibility (pure — no drivers-store import) ───────────────── */

/**
 * Per-driver eligibility verdict from the record's own flags. A driver is
 * INELIGIBLE when archived / inactive (DRIVER_DISABLED) or on a leave status
 * (DRIVER_ON_LEAVE). Mirrors drivers-store deriveStatus/isLeaveStatus but stays
 * pure so the engine is node-testable.
 * @returns {{eligible:boolean, reason?:string}}
 */
export function driverEligibility(driver, cfg = getPolicyConfig()) {
  if (!driver || typeof driver !== 'object') return { eligible: false, reason: POLICY_REASON.DRIVER_DISABLED };
  if (driver.archived === true) return { eligible: false, reason: POLICY_REASON.DRIVER_DISABLED };
  const status = driver.status;
  if (status && cfg.leaveStatuses.some((s) => normName(s) === normName(status))) {
    return { eligible: false, reason: POLICY_REASON.DRIVER_ON_LEAVE };
  }
  if (status === 'Nonaktif' || driver.active === false) return { eligible: false, reason: POLICY_REASON.DRIVER_DISABLED };
  return { eligible: true };
}

/* ── Feature 3 — Driver pool ──────────────────────────────────────────── */

/**
 * Filter the driver pool for a dispatch context.
 *   - Admin override (F4)      → every driver eligible, nothing blocked.
 *   - Driver optional (F3)     → pool empty, every driver filtered DRIVER_OPTIONAL, skipped:true.
 *   - otherwise                → drop on-leave / disabled drivers.
 * @param {Array<Object>} drivers
 * @param {{driverOptional?:boolean, adminOverride?:boolean}} [context]
 * @param {Object} [cfg]
 * @returns {{eligible:Array,filtered:Array<{driver:Object,reason:string}>,skipped:boolean}}
 */
export function filterDriverPool(drivers, context = {}, cfg = getPolicyConfig()) {
  const list = Array.isArray(drivers) ? drivers.filter((d) => d && typeof d === 'object') : [];

  // Admin override (F4) is never blocked — it supersedes every other rule.
  if (context.adminOverride) {
    return { eligible: list.slice(), filtered: [], skipped: false };
  }
  if (context.driverOptional) {
    return { eligible: [], filtered: list.map((d) => ({ driver: d, reason: POLICY_REASON.DRIVER_OPTIONAL })), skipped: true };
  }

  const eligible = [];
  const filtered = [];
  for (const d of list) {
    const v = driverEligibility(d, cfg);
    if (v.eligible) eligible.push(d);
    else filtered.push({ driver: d, reason: v.reason });
  }
  return { eligible, filtered, skipped: false };
}

/* ── Feature 1 / 2 — Vehicle pool ─────────────────────────────────────── */

/**
 * Filter the vehicle pool for a dispatch context.
 *   - Admin override (F4)      → every vehicle eligible, nothing blocked.
 *   - Medical mode (F2)        → ambulance-only; every non-ambulance filtered.
 *   - Ambulance requested (F1) → ambulance allowed alongside the normal fleet.
 *   - otherwise (F1)           → ambulance filtered out of the normal pool.
 * @param {Array<Object>} vehicles
 * @param {{medicalMode?:boolean, ambulanceRequested?:boolean, adminOverride?:boolean}} [context]
 * @param {Object} [cfg]
 * @returns {{eligible:Array,filtered:Array<{vehicle:Object,reason:string}>,specialCase:string}}
 */
export function filterVehiclePool(vehicles, context = {}, cfg = getPolicyConfig()) {
  const list = Array.isArray(vehicles) ? vehicles.filter((v) => v && typeof v === 'object') : [];

  if (context.adminOverride) {
    return { eligible: list.slice(), filtered: [], specialCase: SPECIAL_CASE.ADMIN_OVERRIDE };
  }

  const eligible = [];
  const filtered = [];

  if (context.medicalMode) {
    for (const v of list) {
      if (isSpecialVehicle(v, cfg)) eligible.push(v);
      else filtered.push({ vehicle: v, reason: POLICY_REASON.MEDICAL_NON_AMBULANCE });
    }
    return { eligible, filtered, specialCase: SPECIAL_CASE.MEDICAL_MODE };
  }

  const ambulanceRequested = !!context.ambulanceRequested;
  for (const v of list) {
    if (isSpecialVehicle(v, cfg) && !ambulanceRequested) {
      filtered.push({ vehicle: v, reason: POLICY_REASON.AMBULANCE_NOT_REQUESTED });
    } else {
      eligible.push(v);
    }
  }
  return {
    eligible,
    filtered,
    specialCase: ambulanceRequested ? SPECIAL_CASE.AMBULANCE_OVERRIDE : SPECIAL_CASE.NONE,
  };
}

/* ── Feature 9 — Diagnostics ──────────────────────────────────────────── */

function tallyReasons(filtered) {
  const counts = {};
  for (const f of filtered) {
    const reason = f.reason;
    counts[reason] = (counts[reason] || 0) + 1;
  }
  return counts;
}

/**
 * Build the read-only policy diagnostics for a driver+vehicle filtering pass.
 * Useful for analytics + debugging; never blocks anything.
 */
export function buildPolicyDiagnostics(driverResult, vehicleResult, context = {}) {
  return {
    drivers: {
      eligible: driverResult.eligible.length,
      filtered: driverResult.filtered.length,
      skipped: !!driverResult.skipped,
      reasons: tallyReasons(driverResult.filtered),
    },
    vehicles: {
      eligible: vehicleResult.eligible.length,
      filtered: vehicleResult.filtered.length,
      specialCase: vehicleResult.specialCase,
      reasons: tallyReasons(vehicleResult.filtered),
    },
    context: {
      medicalMode: !!context.medicalMode,
      ambulanceRequested: !!context.ambulanceRequested,
      driverOptional: !!context.driverOptional,
      adminOverride: !!context.adminOverride,
    },
  };
}

/* ── Feature 8 — Policy pipeline (single entry) ───────────────────────── */

/**
 * The pipeline gate every Recommendation Engine sits behind. Filters the driver
 * and vehicle pools for one request context and returns the eligible entities +
 * read-only diagnostics. The caller feeds `drivers` / `vehicles` straight into
 * the recommendation engines — which never see the filtered-out entities.
 *
 * @param {Object} input
 * @param {Array<Object>} input.drivers
 * @param {Array<Object>} input.vehicles
 * @param {Object} [input.context]  { medicalMode?, ambulanceRequested?, driverOptional?, adminOverride? }
 * @param {Object} [cfg]
 * @returns {{drivers:Array, vehicles:Array, driverSkipped:boolean, diagnostics:Object}}
 */
export function applyDispatchPolicy(input = {}, cfg = getPolicyConfig()) {
  const { drivers = [], vehicles = [], context = {} } = input;
  const driverResult = filterDriverPool(drivers, context, cfg);
  const vehicleResult = filterVehiclePool(vehicles, context, cfg);
  return {
    drivers: driverResult.eligible,
    vehicles: vehicleResult.eligible,
    driverSkipped: driverResult.skipped,
    diagnostics: buildPolicyDiagnostics(driverResult, vehicleResult, context),
  };
}

/* ── Feature 5 / 6 — Analytics exclusion (input boundary) ─────────────── */

/**
 * Filter the analytics INPUTS so ambulance vehicles (F5) and Akuntes requesters
 * (F6) never participate in any analytics, WITHOUT touching a single analytics
 * formula. The full operational arrays still flow to history/audit/export — only
 * the copies handed to the analytics engines are filtered here.
 *
 * Excluded:
 *   - vehicles    : every special (ambulance) vehicle (F5).
 *   - requests    : every Akuntes-requested request (F6).
 *   - assignments : ambulance-vehicle assignments + Akuntes assignments.
 *   - overrideLogs: logs recommending an ambulance + logs whose request is Akuntes.
 *
 * @param {Object} input { vehicles?, requests?, assignments?, overrideLogs? }
 * @param {Object} [cfg]
 * @returns {{vehicles:Array, requests:Array, assignments:Array, overrideLogs:Array, diagnostics:Object}}
 */
export function applyAnalyticsPolicy(input = {}, cfg = getPolicyConfig()) {
  const vehicles = Array.isArray(input.vehicles) ? input.vehicles : [];
  const requests = Array.isArray(input.requests) ? input.requests : [];
  const assignments = Array.isArray(input.assignments) ? input.assignments : [];
  const overrideLogs = Array.isArray(input.overrideLogs) ? input.overrideLogs : [];

  // Identify the ambulance fleet (by id + name) from the FULL registry.
  const ambulanceIds = new Set();
  const ambulanceNames = new Set();
  for (const v of vehicles) {
    if (isSpecialVehicle(v, cfg)) {
      if (v && v.id != null) ambulanceIds.add(String(v.id));
      if (v && v.vehicleId != null) ambulanceIds.add(String(v.vehicleId));
      if (v && v.name) ambulanceNames.add(normName(v.name));
    }
  }
  const requestById = new Map(
    requests.filter((r) => r && r.id != null).map((r) => [String(r.id), r]),
  );
  const akuntes = (name) => isAkuntesRequester(name, cfg);

  const fVehicles = vehicles.filter((v) => !isSpecialVehicle(v, cfg));
  const fRequests = requests.filter((r) => !akuntes(r && r.requesterName));
  const fAssignments = assignments.filter((a) => {
    if (!a || typeof a !== 'object') return false;
    if (ambulanceNames.has(normName(a.vehicle))) return false;
    if (akuntes(a.pic) || akuntes(a.createdBy)) return false;
    return true;
  });
  const fOverrideLogs = overrideLogs.filter((l) => {
    if (!l || typeof l !== 'object') return false;
    if (ambulanceIds.has(String(l.recommendedVehicleId))) return false;
    const req = requestById.get(String(l.recommendationId));
    if (req && akuntes(req.requesterName)) return false;
    return true;
  });

  return {
    vehicles: fVehicles,
    requests: fRequests,
    assignments: fAssignments,
    overrideLogs: fOverrideLogs,
    diagnostics: {
      ambulanceVehiclesExcluded: vehicles.length - fVehicles.length,
      akuntesRequestsExcluded: requests.length - fRequests.length,
      assignmentsExcluded: assignments.length - fAssignments.length,
      overrideLogsExcluded: overrideLogs.length - fOverrideLogs.length,
    },
  };
}

/* ── Feature 7 — Petty Cash suggestion exclusion ──────────────────────── */

/**
 * Drop Akuntes from a list of requester names/objects used by petty-cash
 * recommendation / autofill / intelligent suggestion (Feature 7). The full list
 * still exists everywhere else (history/audit/export); only the suggestion source
 * is filtered. Accepts strings or records ({ name } / { requesterName }).
 * @param {Array<string|Object>} candidates
 * @param {Object} [cfg]
 * @returns {Array} the candidates with Akuntes removed
 */
export function excludeAkuntesFromSuggestions(candidates, cfg = getPolicyConfig()) {
  const list = Array.isArray(candidates) ? candidates : [];
  return list.filter((c) => {
    const name = typeof c === 'string' ? c : (c && (c.requesterName || c.name || c.unit));
    return !isAkuntesRequester(name, cfg);
  });
}
