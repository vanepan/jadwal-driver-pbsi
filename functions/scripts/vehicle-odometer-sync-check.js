'use strict';

/* vehicle-odometer-sync-check.js — PURE-logic checks for
   functions/src/events/onAssignmentOdometerSync.js.

   shouldSyncOdometer() / resolveVehicleForSync() / nextOdometerValue() never
   touch `db`, so this needs no emulator or credentials — it is what CAN be
   verified without a live deploy. The trigger's ACTUAL Admin-SDK transaction
   against /vehicles is exercised by
   functions/scripts/phase-c-emulator/vehicle-odometer-sync-check.js (emulator).

   Run: node functions/scripts/vehicle-odometer-sync-check.js   (exit 0 = pass)
*/

// Import the PURE logic module directly (not onAssignmentOdometerSync.js,
// which transitively loads config/admin.js → admin.database() and needs a
// real DB URL / emulator). Same pattern the emulator suite uses when it
// wants the real trigger.
const {
  shouldSyncOdometer, resolveVehicleForSync, nextOdometerValue,
} = require('../src/events/odometerSyncLogic');

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); if (detail !== undefined) console.log('     ' + JSON.stringify(detail)); }
};

const A = (o) => ({
  driver: 'Dedi', vehicle: 'Polytron', date: '2026-09-09',
  startTime: '01:10', endTime: '03:10', status: 'completed',
  startOdometer: 3514, endOdometer: 3583, ...o,
});

/* ── shouldSyncOdometer ── */
console.log('\n[shouldSyncOdometer]');
check('completed + numeric end + vehicle → sync', (() => {
  const r = shouldSyncOdometer(A({ status: 'started' }), A());
  return r.sync === true && r.vehicleName === 'Polytron' && r.endOdometer === 3583;
})());
check('not completed → no sync', shouldSyncOdometer(null, A({ status: 'started' })).sync === false);
check('missing endOdometer → no sync', shouldSyncOdometer(A({ status: 'started' }), A({ endOdometer: null })).sync === false);
check('endOdometer 0 → no sync', shouldSyncOdometer(A({ status: 'started' }), A({ endOdometer: 0 })).sync === false);
check('empty vehicle → no sync', shouldSyncOdometer(A({ status: 'started' }), A({ vehicle: '' })).sync === false);
check('end below a present start → no sync (backward reading is itself corrupt)',
  shouldSyncOdometer(A({ status: 'started' }), A({ startOdometer: 4000, endOdometer: 3583 })).sync === false);
check('completed with NO startOdometer still syncs (end alone is enough)',
  shouldSyncOdometer(A({ status: 'started' }), A({ startOdometer: null })).sync === true);
check('churn guard: already-completed resave, same end + vehicle → no sync',
  shouldSyncOdometer(A(), A({ updatedAt: 'x' })).sync === false);
check('already-completed but endOdometer CHANGED → sync (a correction)',
  shouldSyncOdometer(A({ endOdometer: 3583 }), A({ endOdometer: 3650 })).sync === true);
check('already-completed but VEHICLE changed → sync',
  shouldSyncOdometer(A({ vehicle: 'Luxio' }), A({ vehicle: 'Polytron' })).sync === true);
check('string odometers are coerced', (() => {
  const r = shouldSyncOdometer(A({ status: 'started' }), A({ endOdometer: '3583', startOdometer: '3514' }));
  return r.sync === true && r.endOdometer === 3583;
})());

/* ── resolveVehicleForSync (FAIL CLOSED) ── */
console.log('\n[resolveVehicleForSync — fail-closed]');
const VMAP = {
  v_innova: { name: 'Innova' }, v_luxio: { name: 'Luxio' },
  v_poly: { name: 'Polytron' }, v_old: { name: 'Luxio', archived: true },
};
check('exact name → the right key', resolveVehicleForSync('Polytron', VMAP).vehicleId === 'v_poly');
check('archived record is ignored (only the active Luxio matches)', resolveVehicleForSync('Luxio', VMAP).vehicleId === 'v_luxio');
check('harmless whitespace/case → normalized match', (() => {
  const r = resolveVehicleForSync('  luxio ', VMAP);
  return r.ok === true && r.vehicleId === 'v_luxio' && r.normalized === true;
})());
check('unknown vehicle → fail closed (not_found)', resolveVehicleForSync('Fortuner', VMAP).ok === false);
check('empty name → fail closed', resolveVehicleForSync('', VMAP).ok === false);
check('two ACTIVE records with the same exact name → fail closed (ambiguous), never guesses', (() => {
  const dup = { a: { name: 'Xenia' }, b: { name: 'Xenia' } };
  const r = resolveVehicleForSync('Xenia', dup);
  return r.ok === false && r.reason === 'ambiguous_exact' && r.candidates.length === 2;
})());
check('two records differing only by case → fail closed (ambiguous_ci)', (() => {
  const dup = { a: { name: 'xenia' }, b: { name: 'XENIA' } };
  const r = resolveVehicleForSync('Xenia', dup);
  return r.ok === false && r.reason === 'ambiguous_ci';
})());

/* ── nextOdometerValue (MONOTONIC / IDEMPOTENT) ── */
console.log('\n[nextOdometerValue — monotonic]');
check('3514 current, 3583 end → "3583"', nextOdometerValue('3514', 3583) === '3583');
check('3583 current, 3514 end (late old completion) → undefined (no-op, never lowers)', nextOdometerValue('3583', 3514) === undefined);
check('3583 current, 3583 end (idempotent re-run) → undefined (no-op)', nextOdometerValue('3583', 3583) === undefined);
check('no current value (null) → sets the end (first reading)', nextOdometerValue(null, 500) === '500');
check('non-numeric current ("") → sets the end', nextOdometerValue('', 500) === '500');
check('numeric-string current compares numerically', nextOdometerValue('20886', 21947) === '21947');

console.log(`\nvehicle-odometer-sync-check: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
