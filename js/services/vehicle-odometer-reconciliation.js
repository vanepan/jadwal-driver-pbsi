'use strict';

/* ============================================================
   VEHICLE-ODOMETER-RECONCILIATION.JS — a SAFETY NET, not the primary path.

   The PRIMARY, authoritative vehicle-odometer sync is the server trigger
   functions/src/events/onAssignmentOdometerSync.js — it advances
   vehicles/{id}.odometer on every completed assignment, for every completer,
   monotonically. This module exists ONLY to heal vehicles whose odometer went
   stale BEFORE that trigger was deployed (or during any outage).

   Usage contract (see js/app.js):
     • admin / adminEquivalent session ONLY (the /vehicles write it drives is
       admin-gated by RTDB rules — see database.rules.json);
     • run ONCE per session (a module-level guard in app.js), NEVER on render;
     • MONOTONIC — proposes only upward corrections; never lowers a vehicle
       odometer, even if a completed trip's endOdometer is below the current
       stored value.

   FAIL-CLOSED PLAUSIBILITY GUARD (post-incident, 2026-09-11): a single
   completed record with a grossly implausible endOdometer (e.g. a value
   copied from a DIFFERENT vehicle — see mtkyrihm7a80: a Polytron record
   stamped with Innova's 22029 reading) used to become the proposed
   `trueOdo` outright, because the old algorithm trusted the unfiltered
   max() of every completed endOdometer for that vehicle name. The guard
   below requires the candidate max to sit within `jumpCeilingKm` of an
   INDEPENDENT anchor (the vehicle's own stored odometer and/or its
   second-highest completed reading) before ever proposing it. When it
   doesn't, the vehicle is SKIPPED — never repaired, never given a
   substitute value — and the caller logs why. This is still a bounded
   recovery mechanism, not a source of truth: it never manufactures a
   number, it only ever declines to act on one it can't corroborate.

   This file is PURE: no DOM, no Firebase, no `window`. It only computes WHAT
   should change; the caller performs the writes + the audit entries.
   ============================================================ */

const toNum = (v) => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const lc = (v) => String(v == null ? '' : v).trim().toLowerCase();
const isCompleted = (a) => a && (a.status === 'completed' || a.status === 'selesai');

/**
 * @typedef {Object} OdoReconRow
 * @property {string} vehicleId
 * @property {string} name
 * @property {number|null} current    stored vehicles/{id}.odometer as a number, or null when unset
 * @property {number} trueOdo         max completed endOdometer for that vehicle (the proposed value)
 * @property {number|null} delta      trueOdo − current, or null when current is unset
 */

/**
 * @typedef {Object} OdoReconSkip
 * @property {string} vehicleId
 * @property {string} name
 * @property {number|null} current    stored vehicles/{id}.odometer as a number, or null when unset
 * @property {number} candidateOdo    the max completed endOdometer that was REJECTED
 * @property {number|null} anchorOdo  the independent evidence it was checked against, or null
 * @property {'no_independent_anchor'|'jump_exceeds_ceiling'} reason
 */

/**
 * Compute the set of vehicles whose stored odometer is materially BELOW the
 * highest odometer any of their completed assignments actually reached —
 * FAILING CLOSED (never guessing, never substituting a value) when that
 * highest reading can't be corroborated by independent evidence.
 *
 * `trueOdo(vehicle) = max( current vehicle.odometer , max completed endOdometer for that vehicle )`
 * — but a row is only emitted when (a) that max exceeds `current` by at
 * least `minDeltaKm`, so an already-current vehicle is a no-op, and (b) the
 * max is plausible: within `jumpCeilingKm` of an independent anchor (the
 * stored odometer and/or the vehicle's OWN second-highest completed
 * endOdometer). A vehicle that fails (b) is reported in `skipped`, not
 * `fixes` — no substitute value is ever produced, and one vehicle's
 * implausible reading never blocks any other vehicle's legitimate
 * reconciliation. Never emits a `fixes` row whose proposed value is ≤ the
 * current stored value (never lowers).
 *
 * Vehicle ↔ assignment linkage is by NAME (assignments store `vehicle` as a
 * display name), case-insensitive + whitespace-trimmed. Archived vehicles are
 * skipped entirely (neither fixed nor reported as skipped).
 *
 * @param {Array<{id:string, name?:string, odometer?:string|number, archived?:boolean}>} vehicles
 * @param {Array<{vehicle?:string, status?:string, endOdometer?:string|number}>} assignments
 * @param {{minDeltaKm?:number, jumpCeilingKm?:number}} [opts]
 *   minDeltaKm default 1 — 1 km IS material for an odometer.
 *   jumpCeilingKm default 5000 — how far the candidate max may sit above the
 *   independent anchor before it's treated as an outlier rather than a real
 *   (if large) post-outage catch-up.
 * @returns {{fixes: OdoReconRow[], skipped: OdoReconSkip[]}} fixes most-stale first
 */
export function computeVehicleOdometerReconciliation(
  vehicles,
  assignments,
  { minDeltaKm = 1, jumpCeilingKm = 5000 } = {},
) {
  const endsByName = new Map(); // lc(vehicle name) → number[] of every valid completed endOdometer
  for (const a of Array.isArray(assignments) ? assignments : []) {
    if (!isCompleted(a)) continue;
    const end = toNum(a.endOdometer);
    const key = lc(a.vehicle);
    if (end == null || end <= 0 || !key) continue;
    if (!endsByName.has(key)) endsByName.set(key, []);
    endsByName.get(key).push(end);
  }

  const fixes = [];
  const skipped = [];
  for (const v of Array.isArray(vehicles) ? vehicles : []) {
    if (!v || v.archived === true || !v.id) continue;
    const ends = endsByName.get(lc(v.name));
    if (!ends || !ends.length) continue;

    const sorted = [...ends].sort((a, b) => b - a);
    const maxEnd = sorted[0];
    const secondEnd = sorted.find((x) => x < maxEnd);
    const current = toNum(v.odometer);

    // Independent evidence the candidate max must be corroborated by: the
    // vehicle's own stored reading and/or its own second-highest completed
    // reading — NOT the candidate itself.
    const anchor = Math.max(
      current == null ? Number.NEGATIVE_INFINITY : current,
      secondEnd == null ? Number.NEGATIVE_INFINITY : secondEnd,
    );

    if (anchor === Number.NEGATIVE_INFINITY || maxEnd - anchor > jumpCeilingKm) {
      skipped.push({
        vehicleId: v.id,
        name: v.name,
        current,
        candidateOdo: maxEnd,
        anchorOdo: anchor === Number.NEGATIVE_INFINITY ? null : anchor,
        reason: anchor === Number.NEGATIVE_INFINITY ? 'no_independent_anchor' : 'jump_exceeds_ceiling',
      });
      continue;
    }

    const base = current == null ? Number.NEGATIVE_INFINITY : current;
    if (maxEnd - base >= minDeltaKm) {
      fixes.push({
        vehicleId: v.id,
        name: v.name,
        current,
        trueOdo: maxEnd,
        delta: current == null ? null : maxEnd - current,
      });
    }
  }
  fixes.sort((x, y) => (y.delta ?? Infinity) - (x.delta ?? Infinity));
  return { fixes, skipped };
}
