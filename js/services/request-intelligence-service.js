/* ============================================================
   REQUEST-INTELLIGENCE-SERVICE.JS — Request Auto-Fill Intelligence
   (v1.16.4.11-beta.2)

   The bridge between a transport request being drafted and the Dispatch
   Intelligence engines. As soon as a request carries enough information it
   produces a dispatch recommendation PACKAGE the UI can show alongside the form
   — recommended driver + vehicle, the dispatch score, alternatives, and an
   informational acceptance-risk read from the override analytics.

   READ-ONLY / RECOMMENDATION-ONLY. This layer creates no assignment, approves
   nothing, and writes nothing back to the request. Human approval stays
   mandatory; this only surfaces a suggestion.

   NO LOGIC DUPLICATION. It composes the existing engines through the Dispatch
   Scoring Engine (which itself reuses the Driver + Vehicle Recommendation
   Engines) and the override analytics from the Override Workflow service. This
   module only adds: request-readiness detection, package assembly, the
   acceptance-risk banding, and the panel-state derivation.

   PURE: no DOM, no Firebase, no `window`. The caller passes the request +
   eligible drivers/vehicles + the operational assignment set + the override log;
   the service computes and returns. (The impure adapter that reads the live
   form / stores lives in the panel component.)
   ============================================================ */

'use strict';

import { recommendDispatch } from './dispatch-scoring-engine.js';
import {
  computeDriverAccuracy,
  createOverrideRecord,
  classifyOutcome,
  OVERRIDE_OUTCOME,
} from './override-workflow-service.js';

/** The fields a request needs before a recommendation can be generated. */
export const REQUEST_REQUIRED_FIELDS = Object.freeze(['date', 'startTime', 'endTime', 'passengers']);

/** The three panel states (drives what the UI shows). */
export const PANEL_STATE = Object.freeze({
  NOT_READY: 'NOT_READY',           // request incomplete → list missing fields
  READY: 'READY',                   // a valid dispatch recommendation exists
  NO_RECOMMENDATION: 'NO_RECOMMENDATION', // ready, but no valid dispatch found
});

/** Acceptance-risk levels (informational, derived from driver accuracy). */
export const ACCEPTANCE_RISK = Object.freeze({
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  UNKNOWN: 'UNKNOWN',   // no override history yet for this driver
});

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

/**
 * Is a request complete enough to recommend against?
 * date / startTime / endTime must be non-empty; passengers must be > 0.
 * @param {Object} request
 * @returns {{ ready:boolean, missingFields:string[] }}
 */
export function evaluateReadiness(request = {}) {
  const missingFields = [];
  if (!String(request.date == null ? '' : request.date).trim()) missingFields.push('date');
  if (!String(request.startTime == null ? '' : request.startTime).trim()) missingFields.push('startTime');
  if (!String(request.endTime == null ? '' : request.endTime).trim()) missingFields.push('endTime');
  if (!(num(request.passengers) > 0)) missingFields.push('passengers');
  return { ready: missingFields.length === 0, missingFields };
}

/**
 * Band a driver's historical accuracy into an acceptance-risk level.
 *   < 70 → HIGH · 70–84 → MEDIUM · ≥ 85 → LOW · (no history → UNKNOWN)
 * Informational only — never blocks anything.
 * @param {number} accuracy 0–100
 * @param {boolean} [hasData=true] false when the driver has no override history
 * @returns {'LOW'|'MEDIUM'|'HIGH'|'UNKNOWN'}
 */
export function acceptanceRiskFromAccuracy(accuracy, hasData = true) {
  if (!hasData) return ACCEPTANCE_RISK.UNKNOWN;
  const a = Number(accuracy);
  if (!Number.isFinite(a)) return ACCEPTANCE_RISK.UNKNOWN;
  if (a >= 85) return ACCEPTANCE_RISK.LOW;
  if (a >= 70) return ACCEPTANCE_RISK.MEDIUM;
  return ACCEPTANCE_RISK.HIGH;
}

/**
 * Thin wrapper over the Dispatch Scoring Engine — no scoring logic here. Maps
 * store-shaped vehicles ({ id }) to engine-shaped ({ vehicleId }) so callers can
 * pass getActiveVehicles() directly.
 * @returns {Object} recommendDispatch() result
 */
export function generateDispatchRecommendation(request, drivers, vehicles, assignments, options = {}) {
  const mappedVehicles = (Array.isArray(vehicles) ? vehicles : [])
    .map((v) => (v && v.vehicleId == null && v.id != null ? { ...v, vehicleId: v.id } : v));
  return recommendDispatch({ request, drivers, vehicles: mappedVehicles, assignments }, options);
}

/** Derive the panel state from an assembled package. */
export function derivePanelState(pkg) {
  if (!pkg || !pkg.ready) return PANEL_STATE.NOT_READY;
  if (!pkg.recommendedDispatch) return PANEL_STATE.NO_RECOMMENDATION;
  return PANEL_STATE.READY;
}

/** Look up the display names for a recommended dispatch from its diagnostics. */
function namesFor(dispatch, rec) {
  if (!dispatch || !rec) return { driverName: '', vehicleName: '' };
  const diag = (dispatch.diagnostics || []).find((d) => d.driverId === rec.driverId && d.vehicleId === rec.vehicleId);
  return { driverName: diag ? diag.driverName : rec.driverId, vehicleName: diag ? diag.vehicleName : rec.vehicleId };
}

/**
 * Assemble the full recommendation package the UI consumes.
 *
 * @param {Object} input
 * @param {Object} input.request       { date, startTime, endTime, passengers, destination? }
 * @param {Array<Object>} input.drivers    eligible drivers ({ id, name, … })
 * @param {Array<Object>} input.vehicles   eligible vehicles ({ id|vehicleId, name, capacity, healthScore? })
 * @param {Array<Object>} input.assignments the operational assignment set
 * @param {Array<Object>} [input.overrideLogs]  override history (for acceptance risk)
 * @param {Object} [options]            forwarded to the dispatch engine (now, weights, …)
 * @returns {{
 *   ready:boolean, missingFields:string[], state:string,
 *   request:Object, generatedAt:string,
 *   dispatchRecommendation:(Object|null),
 *   driverRecommendation:(Object|null),
 *   vehicleRecommendation:(Object|null),
 *   recommendedDispatch:(Object|null),
 *   acceptanceRisk:({level:string,driverAccuracy:number,sampleSize:number}|null),
 *   summary:string
 * }}
 */
/* ── Approval decision (beta.3.1 — Approval Override UX) ─────────────────
   Pure helpers shared by the admin Approve/Override flow and its tests. They
   resolve the effective driver/vehicle, classify the outcome, and build the
   override-log record — all without touching the engines or the override
   service (which is reused as-is). */

/**
 * Resolve the BASELINE (recommended) and SELECTED driver/vehicle for an
 * approval. The baseline is the background recommendation, falling back to any
 * legacy requester-chosen value — so approving a legacy request as-is is
 * correctly ACCEPTED (not flagged as an override). An explicit decision
 * overrides the selection.
 * @param {Object} request   { recommendedDriver?, recommendedVehicle?, driver?, vehicle? }
 * @param {{driver?:string, vehicle?:string}} [decision]
 * @returns {{recommendedDriver:string, recommendedVehicle:string, selectedDriver:string, selectedVehicle:string}}
 */
export function resolveEffectiveDispatch(request = {}, decision = {}) {
  const baselineDriver = String(request.recommendedDriver || request.driver || '');
  const baselineVehicle = String(request.recommendedVehicle || request.vehicle || '');
  const selectedDriver = ('driver' in decision) ? String(decision.driver || '') : baselineDriver;
  const selectedVehicle = ('vehicle' in decision) ? String(decision.vehicle || '') : baselineVehicle;
  return { recommendedDriver: baselineDriver, recommendedVehicle: baselineVehicle, selectedDriver, selectedVehicle };
}

/**
 * Classify an approval decision into the existing outcome vocabulary
 * (ACCEPTED / DRIVER_OVERRIDE / VEHICLE_OVERRIDE / FULL_OVERRIDE).
 * @returns {string}
 */
export function classifyApproval(request = {}, decision = {}) {
  const e = resolveEffectiveDispatch(request, decision);
  return classifyOutcome(e.recommendedDriver, e.recommendedVehicle, e.selectedDriver, e.selectedVehicle);
}

/** Does this decision change the recommendation (→ reason required)? */
export function isApprovalOverride(request = {}, decision = {}) {
  return classifyApproval(request, decision) !== OVERRIDE_OUTCOME.ACCEPTED;
}

/**
 * Build the override-log record for an approval, reusing createOverrideRecord
 * (no changes to the override service). Captures recommended vs selected
 * driver/vehicle, outcome, reason, approvedBy, and timestamp (Part 7 audit).
 * @param {Object} request
 * @param {{driver?:string, vehicle?:string, reason?:string}} [decision]
 * @param {string} [approvedBy]
 * @returns {Object} the override record
 */
export function buildApprovalOverrideRecord(request = {}, decision = {}, approvedBy = '') {
  const e = resolveEffectiveDispatch(request, decision);
  return createOverrideRecord({
    recommendationId:     request.id || '',
    recommendedDriverId:  e.recommendedDriver,
    recommendedVehicleId: e.recommendedVehicle,
    selectedDriverId:     e.selectedDriver,
    selectedVehicleId:    e.selectedVehicle,
    dispatchScore:        Number(request.dispatchScore) || 0,
    reason:               decision.reason || '',
    approvedBy,
  });
}

/**
 * Map a stored REQUEST record (startDate / pax / purpose) onto the engine's
 * request shape (date / passengers / destination). The request workflow stores
 * `startDate` + `pax`; the engines expect `date` + `passengers`.
 * @param {Object} request  a request record
 * @returns {{date:string,startTime:string,endTime:string,passengers:number,destination:string}}
 */
export function requestToEngineRequest(request = {}) {
  return {
    date: String(request.date || request.startDate || '').slice(0, 10),
    startTime: request.fullDay ? '00:00' : String(request.startTime || ''),
    endTime: request.fullDay ? '23:59' : String(request.endTime || ''),
    passengers: num(request.passengers != null ? request.passengers : request.pax),
    destination: String(request.destination || request.purpose || ''),
  };
}

/**
 * Build the COMPACT, STORABLE background recommendation for a request — the
 * values persisted WITH the request at submit time so the admin (and only the
 * admin) sees them at approval. Reuses buildRecommendationPackage (no scoring
 * dup). All fields are defined + Firebase-safe (empty string / 0, never
 * undefined/null), so the object can be written straight onto the request.
 *
 * @param {Object} input  { request, drivers, vehicles, assignments, overrideLogs? }
 *                         (request is the STORED shape: startDate / pax / purpose)
 * @param {Object} [options]  forwarded to the dispatch engine (now, weights…)
 * @returns {{
 *   hasRecommendation:boolean,
 *   recommendedDriver:string, recommendedDriverId:string,
 *   recommendedVehicle:string, recommendedVehicleId:string,
 *   dispatchScore:number,
 *   reasonSummary:string, availabilitySummary:string,
 *   alternatives:Array<{driver:string,vehicle:string,score:number}>,
 *   generatedAt:string
 * }}
 */
export function buildRequestRecommendation(input = {}, options = {}) {
  const engineRequest = requestToEngineRequest(input.request || {});
  const pkg = buildRecommendationPackage({
    request: engineRequest,
    drivers: input.drivers || [],
    vehicles: input.vehicles || [],
    assignments: input.assignments || [],
    overrideLogs: input.overrideLogs || [],
  }, options);

  const empty = {
    hasRecommendation: false,
    recommendedDriver: '', recommendedDriverId: '',
    recommendedVehicle: '', recommendedVehicleId: '',
    dispatchScore: 0,
    reasonSummary: pkg.state === PANEL_STATE.NOT_READY
      ? 'Data permintaan belum lengkap.'
      : 'Tidak ada kombinasi driver & kendaraan yang valid.',
    availabilitySummary: pkg.state === PANEL_STATE.NOT_READY
      ? 'Lengkapi tanggal, jam, dan jumlah penumpang.'
      : 'Semua driver atau kendaraan bentrok / kapasitas tidak cukup.',
    alternatives: [],
    generatedAt: pkg.generatedAt,
  };

  const rec = pkg.recommendedDispatch;
  if (!rec) return empty;

  const dispatch = pkg.dispatchRecommendation;
  const diagOf = (driverId, vehicleId) =>
    (dispatch.diagnostics || []).find((d) => d.driverId === driverId && d.vehicleId === vehicleId) || null;
  const top = diagOf(rec.driverId, rec.vehicleId);
  const driverName = top ? top.driverName : rec.driverId;
  const vehicleName = top ? top.vehicleName : rec.vehicleId;

  const alternatives = (dispatch.alternatives || [])
    .filter((a) => { const d = diagOf(a.driverId, a.vehicleId); return d && d.valid; })
    .slice(0, 2)
    .map((a) => { const d = diagOf(a.driverId, a.vehicleId); return { driver: d.driverName, vehicle: d.vehicleName, score: a.dispatchScore }; });

  return {
    hasRecommendation: true,
    recommendedDriver: driverName,
    recommendedDriverId: rec.driverId,
    recommendedVehicle: vehicleName,
    recommendedVehicleId: rec.vehicleId,
    dispatchScore: rec.dispatchScore,
    reasonSummary: `Skor dispatch ${rec.dispatchScore} — driver ${top ? top.driverScore : '?'} · kendaraan ${top ? top.vehicleScore : '?'}.`,
    availabilitySummary: `${driverName} & ${vehicleName} tersedia pada slot ${engineRequest.startTime}–${engineRequest.endTime}.`,
    alternatives,
    generatedAt: pkg.generatedAt,
  };
}

export function buildRecommendationPackage(input = {}, options = {}) {
  const { request = {}, drivers = [], vehicles = [], assignments = [], overrideLogs = [] } = input;
  const generatedAt = new Date(options.now || Date.now()).toISOString();
  const { ready, missingFields } = evaluateReadiness(request);

  const base = {
    ready,
    missingFields,
    request,
    generatedAt,
    dispatchRecommendation: null,
    driverRecommendation: null,
    vehicleRecommendation: null,
    recommendedDispatch: null,
    acceptanceRisk: null,
    summary: '',
  };

  if (!ready) {
    return { ...base, state: PANEL_STATE.NOT_READY };
  }

  const dispatch = generateDispatchRecommendation(request, drivers, vehicles, assignments, options);
  const rec = dispatch.recommendedDispatch;

  if (!rec) {
    return {
      ...base,
      state: PANEL_STATE.NO_RECOMMENDATION,
      dispatchRecommendation: dispatch,
      driverRecommendation: dispatch.driverRecommendation,
      vehicleRecommendation: dispatch.vehicleRecommendation,
      generatedAt: dispatch.generatedAt,
      summary: 'Tidak ada kombinasi driver & kendaraan yang valid untuk permintaan ini.',
    };
  }

  const acc = computeDriverAccuracy(overrideLogs, rec.driverId);
  const acceptanceRisk = {
    level: acceptanceRiskFromAccuracy(acc.accuracy, acc.recommended > 0),
    driverAccuracy: acc.accuracy,
    sampleSize: acc.recommended,
  };
  const { driverName, vehicleName } = namesFor(dispatch, rec);

  return {
    ...base,
    state: PANEL_STATE.READY,
    dispatchRecommendation: dispatch,
    driverRecommendation: dispatch.driverRecommendation,
    vehicleRecommendation: dispatch.vehicleRecommendation,
    recommendedDispatch: rec,
    generatedAt: dispatch.generatedAt,
    acceptanceRisk,
    summary: `${driverName} + ${vehicleName} · skor dispatch ${rec.dispatchScore}`,
  };
}
