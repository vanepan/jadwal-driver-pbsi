/* vehicle-odometer-reconciliation-check.mjs — the admin-boot SAFETY NET
   (js/services/vehicle-odometer-reconciliation.js). Pure Node.

   The PRIMARY vehicle-odometer sync is the server trigger
   functions/src/events/onAssignmentOdometerSync.js. This module only heals
   vehicles that went stale BEFORE that trigger was deployed. It must be
   MONOTONIC (never propose a lower value) and a no-op when already current.

   Run: node scripts/vehicle-odometer-reconciliation-check.mjs   (exit 0 = pass)
*/

import { computeVehicleOdometerReconciliation } from '../js/services/vehicle-odometer-reconciliation.js';

let pass = 0, fail = 0;
const check = (n, c, detail) => {
  if (c) { pass++; console.log(`  ✓ ${n}`); }
  else { fail++; console.log(`  ✗ ${n}`); if (detail !== undefined) console.log('     ' + JSON.stringify(detail)); }
};

const V = (id, name, odometer, extra = {}) => ({ id, name, odometer, ...extra });
const C = (vehicle, endOdometer, extra = {}) => ({ vehicle, status: 'completed', endOdometer, ...extra });

/* ── 1 — the reported production incident ── */
console.log('\n[1 — four stale vehicles, from the incident report]');
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
const fixes = computeVehicleOdometerReconciliation(vehicles, assignments);
const byId = Object.fromEntries(fixes.map(f => [f.vehicleId, f]));
check('all 4 vehicles are proposed for reconciliation', fixes.length === 4, fixes.map(f => f.vehicleId));
check('Luxio  19422 → 20943 (Δ 1521)', byId.v_luxio?.trueOdo === 20943 && byId.v_luxio.delta === 1521, byId.v_luxio);
check('Innova 22629 → 22674 (Δ 45)',   byId.v_innova?.trueOdo === 22674 && byId.v_innova.delta === 45, byId.v_innova);
check('Hiace  18437 → 19506 (Δ 1069)', byId.v_hiace?.trueOdo === 19506 && byId.v_hiace.delta === 1069, byId.v_hiace);
check('Polytron 3514 → 3583 (Δ 69)',   byId.v_poly?.trueOdo === 3583 && byId.v_poly.delta === 69, byId.v_poly);
check('rows are most-stale-first (Luxio, then Hiace, then Polytron, then Innova)',
  fixes.map(f => f.vehicleId).join() === 'v_luxio,v_hiace,v_poly,v_innova', fixes.map(f => f.vehicleId));

/* ── 2 — MONOTONIC: never proposes a lower value ── */
console.log('\n[2 — never lowers]');
check('vehicle already ABOVE every completed end → NOT proposed',
  computeVehicleOdometerReconciliation([V('v', 'Luxio', '25000')], [C('Luxio', 20943)]).length === 0);
check('a completed trip BELOW the current value never pulls it down',
  computeVehicleOdometerReconciliation([V('v', 'Luxio', '21000')], [C('Luxio', 20943), C('Luxio', 19000)]).length === 0);
check('exactly current (Δ 0) → no-op', computeVehicleOdometerReconciliation([V('v', 'Luxio', '20943')], [C('Luxio', 20943)]).length === 0);
check('Δ below minDeltaKm → no-op', computeVehicleOdometerReconciliation([V('v', 'Luxio', '20943')], [C('Luxio', 20943.5)], { minDeltaKm: 1 }).length === 0);

/* ── 3 — matching, filtering, edge cases ── */
console.log('\n[3 — matching + filters]');
check('vehicle↔assignment link is case/whitespace-insensitive',
  computeVehicleOdometerReconciliation([V('v', 'Luxio', '100')], [C('  luxio ', 500)]).length === 1);
check('archived vehicle is skipped',
  computeVehicleOdometerReconciliation([V('v', 'Luxio', '100', { archived: true })], [C('Luxio', 500)]).length === 0);
check('non-completed assignments are ignored',
  computeVehicleOdometerReconciliation([V('v', 'Luxio', '100')], [{ vehicle: 'Luxio', status: 'started', endOdometer: 9999 }]).length === 0);
check('assignment with no/zero endOdometer is ignored',
  computeVehicleOdometerReconciliation([V('v', 'Luxio', '100')], [C('Luxio', null), C('Luxio', 0)]).length === 0);
check('vehicle with NO recorded assignments → not proposed (nothing to reconcile against)',
  computeVehicleOdometerReconciliation([V('v', 'NewCar', '0')], [C('Luxio', 500)]).length === 0);
check('vehicle whose odometer is UNSET but has completed trips → proposed, current=null delta=null',
  (() => { const r = computeVehicleOdometerReconciliation([V('v', 'Luxio', '')], [C('Luxio', 500)]); return r.length === 1 && r[0].current === null && r[0].trueOdo === 500 && r[0].delta === null; })());
check('input arrays are not mutated / undefined-safe',
  computeVehicleOdometerReconciliation(undefined, undefined).length === 0
  && computeVehicleOdometerReconciliation([], []).length === 0);

/* ── 4 — static contract: primary path + guards ── */
console.log('\n[4 — static contract]');
import fs from 'node:fs';
const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf-8');
check('reconciliation is admin-only + one-shot (guarded by isAdmin() and a done flag)',
  /_vehOdoReconcileDone\b/.test(app) && /if \(_vehOdoReconcileDone \|\| !isAdmin\(\)\) return;/.test(app));
check('it is NOT run on render — called from the realtime data-change listener only',
  /reconcileStaleVehicleOdometersOnce\(\);/.test(app) && (app.match(/reconcileStaleVehicleOdometersOnce\(\)/g) || []).length === 2);
check('each reconciliation write is audit-logged (vehicle_odometer_reconciled)',
  /action: 'vehicle_odometer_reconciled'/.test(app));
check('server trigger is the documented primary path',
  /onAssignmentOdometerSync/.test(app) && /SAFETY NET/.test(fs.readFileSync(new URL('../js/services/vehicle-odometer-reconciliation.js', import.meta.url), 'utf-8')));

console.log(`\nvehicle-odometer-reconciliation-check: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
