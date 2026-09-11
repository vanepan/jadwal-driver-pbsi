/* vehicle-odometer-reconciliation-check.mjs — the admin-boot SAFETY NET
   (js/services/vehicle-odometer-reconciliation.js). Pure Node.

   The PRIMARY vehicle-odometer sync is the server trigger
   functions/src/events/onAssignmentOdometerSync.js. This module only heals
   vehicles that went stale BEFORE that trigger was deployed. It must be
   MONOTONIC (never propose a lower value), a no-op when already current,
   and — post-incident (2026-09-11, Polytron poisoned to 22029 by the
   corrupt completed record mtkyrihm7a80) — FAIL CLOSED when the candidate
   max completed endOdometer can't be corroborated by an independent anchor
   (the vehicle's own stored odometer and/or its own second-highest
   completed reading). The function now returns { fixes, skipped } instead
   of a bare array; a skip NEVER substitutes a value, it only withholds one.

   Run: node scripts/vehicle-odometer-reconciliation-check.mjs   (exit 0 = pass)
*/

import fs from 'node:fs';
import { computeVehicleOdometerReconciliation } from '../js/services/vehicle-odometer-reconciliation.js';

let pass = 0, fail = 0;
const check = (n, c, detail) => {
  if (c) { pass++; console.log(`  ✓ ${n}`); }
  else { fail++; console.log(`  ✗ ${n}`); if (detail !== undefined) console.log('     ' + JSON.stringify(detail)); }
};

const V = (id, name, odometer, extra = {}) => ({ id, name, odometer, ...extra });
const C = (vehicle, endOdometer, extra = {}) => ({ vehicle, status: 'completed', endOdometer, ...extra });

/* ── A — the reported production incident (clean 4-vehicle fixture) ── */
console.log('\n[A — four stale vehicles, from the incident report]');
const vehicles = [
  V('v_luxio', 'Luxio', '19422'),
  V('v_innova', 'Innova', '22629'),
  V('v_hiace', 'Hiace', '18437'),
  V('v_poly', 'Polytron', '3514'),
];
const assignments = [
  C('Luxio', 20552), C('Luxio', 20837), C('Luxio', 20943),      // max 20943
  C('Innova', 22261), C('Innova', 22674),                        // max 22674
  C('Hiace', 19100), C('Hiace', 19506),                          // max 19506
  C('Polytron', 3475), C('Polytron', 3583),                      // max 3583
];
{
  const { fixes, skipped } = computeVehicleOdometerReconciliation(vehicles, assignments);
  const byId = Object.fromEntries(fixes.map(f => [f.vehicleId, f]));
  check('all 4 vehicles are proposed for reconciliation', fixes.length === 4, fixes.map(f => f.vehicleId));
  check('nothing is skipped — every candidate here is chain-consistent', skipped.length === 0, skipped);
  check('Luxio  19422 → 20943 (Δ 1521)', byId.v_luxio?.trueOdo === 20943 && byId.v_luxio.delta === 1521, byId.v_luxio);
  check('Innova 22629 → 22674 (Δ 45)',   byId.v_innova?.trueOdo === 22674 && byId.v_innova.delta === 45, byId.v_innova);
  check('Hiace  18437 → 19506 (Δ 1069)', byId.v_hiace?.trueOdo === 19506 && byId.v_hiace.delta === 1069, byId.v_hiace);
  check('Polytron 3514 → 3583 (Δ 69)',   byId.v_poly?.trueOdo === 3583 && byId.v_poly.delta === 69, byId.v_poly);
  check('rows are most-stale-first (Luxio, then Hiace, then Polytron, then Innova)',
    fixes.map(f => f.vehicleId).join() === 'v_luxio,v_hiace,v_poly,v_innova', fixes.map(f => f.vehicleId));
}

/* ── B — MONOTONIC: never proposes a lower value ── */
console.log('\n[B — never lowers]');
check('vehicle already ABOVE every completed end → NOT proposed',
  computeVehicleOdometerReconciliation([V('v', 'Luxio', '25000')], [C('Luxio', 20943)]).fixes.length === 0);
check('a completed trip BELOW the current value never pulls it down',
  computeVehicleOdometerReconciliation([V('v', 'Luxio', '21000')], [C('Luxio', 20943), C('Luxio', 19000)]).fixes.length === 0);
check('exactly current (Δ 0) → no-op', computeVehicleOdometerReconciliation([V('v', 'Luxio', '20943')], [C('Luxio', 20943)]).fixes.length === 0);
check('Δ below minDeltaKm → no-op', computeVehicleOdometerReconciliation([V('v', 'Luxio', '20943')], [C('Luxio', 20943.5)], { minDeltaKm: 1 }).fixes.length === 0);

/* ── C — matching, filtering, edge cases ── */
console.log('\n[C — matching + filters]');
check('vehicle↔assignment link is case/whitespace-insensitive',
  computeVehicleOdometerReconciliation([V('v', 'Luxio', '100')], [C('  luxio ', 500)]).fixes.length === 1);
check('archived vehicle is skipped entirely (neither fixed nor reported as skipped)', (() => {
  const r = computeVehicleOdometerReconciliation([V('v', 'Luxio', '100', { archived: true })], [C('Luxio', 500)]);
  return r.fixes.length === 0 && r.skipped.length === 0;
})());
check('non-completed assignments are ignored', (() => {
  const r = computeVehicleOdometerReconciliation([V('v', 'Luxio', '100')], [{ vehicle: 'Luxio', status: 'started', endOdometer: 9999 }]);
  return r.fixes.length === 0 && r.skipped.length === 0;
})());
check('assignment with no/zero endOdometer is ignored', (() => {
  const r = computeVehicleOdometerReconciliation([V('v', 'Luxio', '100')], [C('Luxio', null), C('Luxio', 0)]);
  return r.fixes.length === 0 && r.skipped.length === 0;
})());
check('vehicle with NO recorded assignments → not proposed, not skipped (nothing to reconcile against)', (() => {
  const r = computeVehicleOdometerReconciliation([V('v', 'NewCar', '0')], [C('Luxio', 500)]);
  return r.fixes.length === 0 && r.skipped.length === 0;
})());
check('input arrays are not mutated / undefined-safe',
  computeVehicleOdometerReconciliation(undefined, undefined).fixes.length === 0
  && computeVehicleOdometerReconciliation([], []).fixes.length === 0);

/* ── D — exact incident regression: mtkyrihm7a80-shaped outlier ── */
console.log('\n[D — exact incident regression]');
{
  const polyAssignments = [
    C('Polytron', 844), C('Polytron', 1084), C('Polytron', 1900), C('Polytron', 2698),
    C('Polytron', 3271), C('Polytron', 3475), C('Polytron', 3514), C('Polytron', 3583),
    C('Polytron', 3637),
    // the corrupt record itself — mtkyrihm7a80-shaped: start === end === 22029,
    // distanceTravelled 0, exactly Innova's reading copied onto a Polytron row.
    C('Polytron', 22029, { startOdometer: 22029, distanceTravelled: 0 }),
  ];
  const { fixes, skipped } = computeVehicleOdometerReconciliation(
    [V('v_poly', 'Polytron', '3514')], polyAssignments,
  );
  check('Polytron is ABSENT from fixes', !fixes.some(f => f.vehicleId === 'v_poly'), fixes);
  const skip = skipped.find(s => s.vehicleId === 'v_poly');
  check('Polytron IS present in skipped', !!skip, skipped);
  check("reason === 'jump_exceeds_ceiling'", skip?.reason === 'jump_exceeds_ceiling', skip);
  check('candidateOdo === 22029', skip?.candidateOdo === 22029, skip);
  check('anchorOdo reflects the real chain (3637), not the outlier', skip?.anchorOdo === 3637, skip);
  check('no substitute value was manufactured — vehicleId/name only, no invented "corrected" field',
    skip && Object.keys(skip).sort().join(',') === ['anchorOdo', 'candidateOdo', 'current', 'name', 'reason', 'vehicleId'].sort().join(','), skip);
}

/* ── E — one contaminated vehicle must not abort the whole pass ── */
console.log('\n[E — no whole-pass abort]');
{
  const twoVehicles = [
    V('v_poly', 'Polytron', '3514'),
    V('v_hiace', 'Hiace', '18437'), // genuinely stale, chain-consistent
  ];
  const mixedAssignments = [
    C('Polytron', 3475), C('Polytron', 3583), C('Polytron', 3637),
    C('Polytron', 22029, { startOdometer: 22029, distanceTravelled: 0 }), // contaminated
    C('Hiace', 19100), C('Hiace', 19506), // clean
  ];
  const { fixes, skipped } = computeVehicleOdometerReconciliation(twoVehicles, mixedAssignments);
  check('Polytron is skipped', skipped.some(s => s.vehicleId === 'v_poly' && s.reason === 'jump_exceeds_ceiling'), skipped);
  check('Hiace is STILL included in fixes (not blocked by Polytron\'s corruption)',
    fixes.some(f => f.vehicleId === 'v_hiace' && f.trueOdo === 19506), fixes);
}

/* ── F — no independent anchor: a lone unverifiable reading is never adopted ── */
console.log('\n[F — no independent anchor]');
{
  const { fixes, skipped } = computeVehicleOdometerReconciliation([V('v', 'Luxio', '')], [C('Luxio', 4200)]);
  const skip = skipped[0];
  check('the lone reading is NOT proposed', fixes.length === 0, fixes);
  check("it IS skipped with reason === 'no_independent_anchor'", skip?.reason === 'no_independent_anchor', skip);
  check('candidateOdo === 4200, anchorOdo === null (no corroborating evidence exists)',
    skip?.candidateOdo === 4200 && skip?.anchorOdo === null, skip);
}

/* ── G — legitimate large recovery must still be allowed ── */
console.log('\n[G — legitimate large post-outage recovery]');
{
  const { fixes, skipped } = computeVehicleOdometerReconciliation(
    [V('v', 'Polytron', '3514')], [C('Polytron', 3600), C('Polytron', 3900), C('Polytron', 4200)],
  );
  check('not skipped — the chain itself corroborates the jump (secondEnd=3900, Δ from anchor=300)',
    skipped.length === 0, skipped);
  check('fixes includes trueOdo === 4200', fixes.some(f => f.trueOdo === 4200), fixes);
}

/* ── H — exact jumpCeilingKm boundary ── */
console.log('\n[H — boundary: delta === 5000 allowed, 5001 skipped]');
{
  const atCeiling = computeVehicleOdometerReconciliation([V('v', 'Luxio', '10000')], [C('Luxio', 15000)]);
  check('maxEnd - anchor === 5000 → ALLOWED (proposed, not skipped)',
    atCeiling.skipped.length === 0 && atCeiling.fixes.some(f => f.trueOdo === 15000), atCeiling);

  const overCeiling = computeVehicleOdometerReconciliation([V('v', 'Luxio', '10000')], [C('Luxio', 15001)]);
  check('maxEnd - anchor === 5001 → SKIPPED',
    overCeiling.fixes.length === 0
    && overCeiling.skipped.some(s => s.reason === 'jump_exceeds_ceiling' && s.candidateOdo === 15001 && s.anchorOdo === 10000),
    overCeiling);

  check('jumpCeilingKm is configurable via opts (same knob as minDeltaKm)',
    computeVehicleOdometerReconciliation([V('v', 'Luxio', '10000')], [C('Luxio', 15001)], { jumpCeilingKm: 6000 }).fixes.some(f => f.trueOdo === 15001));
}

/* ── I — exact incident pin: mtkyrihm7a80's 22029 must remain rejected ── */
console.log('\n[I — exact incident pin]');
{
  const MTKYRIHM7A80 = C('Polytron', 22029, { startOdometer: 22029, distanceTravelled: 0 });
  const chain = [C('Polytron', 3271), C('Polytron', 3475), C('Polytron', 3583), C('Polytron', 3637), MTKYRIHM7A80];
  const { fixes, skipped } = computeVehicleOdometerReconciliation([V('v_poly', 'Polytron', '3514')], chain);
  check('mtkyrihm7a80\'s 22029 is REJECTED against the real ~3637 chain anchor',
    !fixes.some(f => f.trueOdo === 22029)
    && skipped.some(s => s.candidateOdo === 22029 && s.anchorOdo === 3637 && s.reason === 'jump_exceeds_ceiling'),
    { fixes, skipped });
}

/* ── J — static contract: caller consumes { fixes, skipped } and audits skips ── */
console.log('\n[J — static contract]');
const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf-8');
check('reconciliation is admin-only + one-shot (guarded by isAdmin() and a done flag)',
  /_vehOdoReconcileDone\b/.test(app) && /if \(_vehOdoReconcileDone \|\| !isAdmin\(\)\) return;/.test(app));
check('it is NOT run on render — called from the realtime data-change listener only',
  /reconcileStaleVehicleOdometersOnce\(\);/.test(app) && (app.match(/reconcileStaleVehicleOdometersOnce\(\)/g) || []).length === 2);
check('the caller destructures { fixes, skipped } from computeVehicleOdometerReconciliation(...)',
  /const \{ fixes, skipped \} = computeVehicleOdometerReconciliation\(vehicles, assignments\);/.test(app));
check('getCurrentUser() is read before the skipped candidates are logged',
  /const \{ fixes, skipped \} = computeVehicleOdometerReconciliation\(vehicles, assignments\);\s*const u = getCurrentUser\(\);/.test(app));
check('every skipped candidate is audit-logged as vehicle_odometer_reconcile_skipped',
  /action: 'vehicle_odometer_reconcile_skipped'/.test(app));
check('a successful reconciliation write is still audit-logged as vehicle_odometer_reconciled (unchanged)',
  /action: 'vehicle_odometer_reconciled'/.test(app));
check('the existing "if (!fixes.length) return" short-circuit is preserved, positioned AFTER the skip-logging loop',
  (() => {
    const loopStart = app.indexOf('for (const s of skipped)');
    const guardPos = app.indexOf('if (!fixes.length) return;');
    return loopStart !== -1 && guardPos !== -1 && guardPos > loopStart && guardPos - loopStart < 800;
  })());
check('server trigger is still the documented primary path (untouched)',
  /onAssignmentOdometerSync/.test(app) && /SAFETY NET/.test(fs.readFileSync(new URL('../js/services/vehicle-odometer-reconciliation.js', import.meta.url), 'utf-8')));
check('the server trigger files were not modified by this fix (still no mention of the new guard there)',
  !/jumpCeilingKm|no_independent_anchor|jump_exceeds_ceiling/.test(
    fs.readFileSync(new URL('../functions/src/events/onAssignmentOdometerSync.js', import.meta.url), 'utf-8')
  ));

console.log(`\nvehicle-odometer-reconciliation-check: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
