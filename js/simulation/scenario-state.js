/* ============================================================
   SCENARIO-STATE.JS — Scenario Simulation Engine (v1.19.8)

   The temporary-state boundary. Scenario Simulation lets an administrator ask
   "what happens if I change something BEFORE making the decision?" — and the
   iron rule is that a simulation NEVER touches production state. This module owns
   the one primitive that guarantees it: a deep, isolated CLONE of the prediction
   service input that a scenario can safely mutate.

   ── PURE + ISOLATED ──────────────────────────────────────────────────────────
   No DOM, no Firebase, no network, no timers, no randomness. `cloneInput` returns
   a structure that shares NO reference with the production input for anything a
   scenario can touch (the vehicles), so mutating the clone can never write back
   to production. The rest of the input (read-only models the engine only reads)
   is shallow-referenced for efficiency — the engine never mutates it, and neither
   do we. This keeps a clone cheap even for hundreds of vehicles.

   API (all pure):
     cloneInput(input)            → a mutable, isolated copy (production untouched)
     findVehicle(input, id)       → the vehicle object in `input.vehicles` (or null)
     clampPct(n)                  → 0–100 integer helper (shared by scenarios)
     fleetMaxYear(input)          → newest registration year in the fleet (or null)
   ============================================================ */

'use strict';

function isObj(v) { return v && typeof v === 'object'; }

/** Deep-clone a single vehicle so a scenario mutation can never reach production.
    structuredClone is preferred (preserves Dates/nesting); JSON is the fallback. */
function cloneVehicle(v) {
  if (!isObj(v)) return v;
  try {
    if (typeof structuredClone === 'function') return structuredClone(v);
  } catch (_) { /* fall through to JSON */ }
  try { return JSON.parse(JSON.stringify(v)); } catch (_) { return { ...v }; }
}

/**
 * Clone the prediction-service input into a mutable, isolated copy. ONLY the
 * `vehicles` array (the surface scenarios mutate) is deep-cloned; every other
 * model is shallow-referenced because the prediction engine only READS it. The
 * production input object and its vehicles are never mutated.
 * @param {Object} input  the aggregated service input
 * @returns {Object} an isolated clone (always a fresh object)
 */
export function cloneInput(input) {
  const src = isObj(input) ? input : {};
  const vehicles = Array.isArray(src.vehicles) ? src.vehicles.map(cloneVehicle) : [];
  return { ...src, vehicles };
}

/** Find a vehicle in an input by id (string-compared). Returns null when absent. */
export function findVehicle(input, id) {
  const list = isObj(input) && Array.isArray(input.vehicles) ? input.vehicles : [];
  const key = String(id);
  return list.find((v) => isObj(v) && String(v.id != null ? v.id : v.name) === key) || null;
}

/** Clamp any value to a 0–100 integer (scenarios adjust percentage health/util). */
export function clampPct(n) {
  const x = typeof n === 'number' && Number.isFinite(n) ? n : 0;
  return Math.max(0, Math.min(100, Math.round(x)));
}

/** The newest registration year across the fleet — a deterministic "recent" year
    for freshly simulated / replacement vehicles (no wall-clock, so it stays pure). */
export function fleetMaxYear(input) {
  const list = isObj(input) && Array.isArray(input.vehicles) ? input.vehicles : [];
  let max = null;
  for (const v of list) {
    const y = isObj(v) && isObj(v.registration) ? Number(v.registration.year)
      : isObj(v) ? Number(v.year) : NaN;
    if (Number.isFinite(y) && (max == null || y > max)) max = y;
  }
  return max;
}

export default { cloneInput, findVehicle, clampPct, fleetMaxYear };
