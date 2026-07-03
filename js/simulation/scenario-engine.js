/* ============================================================
   SCENARIO-ENGINE.JS — Scenario Simulation Engine (v1.19.8)

   The orchestrator that answers "what happens if I change something BEFORE making
   the decision?". It runs the safe pipeline:

     Production input → temporary CLONE → apply scenario → Prediction Service →
     (Explainability + Recommendation via the comparison layer) → Simulation
     Result → discard.

   ── CONSUMES THE SERVICE — NEVER THE ENGINE ──────────────────────────────────
   It forecasts ONLY through the Prediction Service (getPrediction), exactly like
   every dashboard — it NEVER imports the Prediction Engine, Validator or Provider.
   It reads the certified current model (already cached from the dashboard's own
   getPrediction call, so re-forecasting the unchanged fleet is free) and forecasts
   the mutated clone through the SAME service. Production state is never written:
   the clone is isolated (scenario-state) and mutated only in memory; the caller
   discards it when the simulation closes.

   API (all pure w.r.t. production — only READS the service):
     runSimulation(baseInput, scenarioKey, params?) → SimulationRun
     mostAtRiskVehicleId(model)                      → string | null
   ============================================================ */

'use strict';

import { getPrediction } from '../services/prediction-service.js';
import { dominantRisk } from '../prediction/explainability.js';
import { cloneInput } from './scenario-state.js';
import { getScenario } from './scenario-types.js';

function arr(v) { return Array.isArray(v) ? v : []; }

/** The vehicle whose dominant risk is highest — the natural default target for a
    per-vehicle quick-start scenario. Selection over certified data; no new score. */
export function mostAtRiskVehicleId(model) {
  const vehicles = arr(model && model.vehicles).filter(Boolean);
  if (!vehicles.length) return null;
  let top = null; let best = -1;
  for (const v of vehicles) {
    const s = Number(dominantRisk(v).pred.score) || 0;
    if (s > best) { best = s; top = v; }
  }
  return top ? String(top.id != null ? top.id : top.name) : null;
}

function vehicleName(model, id) {
  const v = arr(model && model.vehicles).find((x) => String(x.id != null ? x.id : x.name) === String(id));
  return v ? String(v.name || id) : String(id);
}

function safeModel(result, meta) {
  return result && result.model
    ? result.model
    : { generatedAt: meta && meta.generatedAt, vehicles: [], executive: {}, recommendations: [] };
}

/**
 * Run a scenario simulation against a base input. Never mutates `baseInput`.
 * @param {Object} baseInput     the aggregated prediction-service input
 * @param {string} scenarioKey   a scenario-types key
 * @param {Object} [params]      scenario parameters (merged over the defaults);
 *                               `vehicleId` is resolved to the most-at-risk vehicle
 *                               when omitted for a per-vehicle scenario.
 * @returns {Object} SimulationRun {
 *   ok, error, scenarioKey, scenario, params, targetId, targetName,
 *   currentModel, simModel, currentMeta, simMeta }
 */
export function runSimulation(baseInput, scenarioKey, params = {}) {
  const scenario = getScenario(scenarioKey);
  if (!scenario) {
    return { ok: false, error: { code: 'UNKNOWN_SCENARIO', message: `Skenario tidak dikenal: ${scenarioKey}` },
      scenarioKey, scenario: null, params, targetId: null, targetName: null,
      currentModel: null, simModel: null, currentMeta: null, simMeta: null };
  }

  // 1) The certified CURRENT model (cached from the dashboard's own call).
  const currentResult = getPrediction(baseInput || {});
  const currentMeta = currentResult.metadata || {};
  const currentModel = safeModel(currentResult, currentMeta);

  // 2) Resolve parameters + the target vehicle.
  const merged = { ...scenario.defaults(), ...(params || {}) };
  if (scenario.scope === 'vehicle' && merged.vehicleId == null) {
    merged.vehicleId = mostAtRiskVehicleId(currentModel);
  }
  const targetId = merged.vehicleId != null ? String(merged.vehicleId) : null;
  const targetName = scenario.scope === 'fleet'
    ? 'Armada'
    : (targetId === 'all' ? 'Seluruh Armada' : vehicleName(currentModel, targetId));

  if (scenario.scope === 'vehicle' && (targetId == null || targetId === 'null')) {
    return { ok: false, error: { code: 'NO_TARGET', message: 'Tidak ada kendaraan untuk disimulasikan.' },
      scenarioKey, scenario, params: merged, targetId: null, targetName: null,
      currentModel, simModel: null, currentMeta, simMeta: null };
  }

  // 3) Clone → apply → re-forecast through the SAME service. Production untouched.
  const clone = cloneInput(baseInput);
  try { scenario.apply(clone, merged); }
  catch (err) {
    return { ok: false, error: { code: 'APPLY_FAILED', message: String(err && err.message || err) },
      scenarioKey, scenario, params: merged, targetId, targetName,
      currentModel, simModel: null, currentMeta, simMeta: null };
  }
  const simResult = getPrediction(clone);
  const simMeta = simResult.metadata || {};
  const simModel = safeModel(simResult, simMeta);

  return {
    ok: !!(simResult && simResult.ok && simResult.model),
    error: simResult && simResult.error ? simResult.error : null,
    scenarioKey, scenario, params: merged, targetId, targetName,
    currentModel, simModel, currentMeta, simMeta,
  };
}

export default { runSimulation, mostAtRiskVehicleId };
