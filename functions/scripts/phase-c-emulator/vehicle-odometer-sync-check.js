'use strict';

/* ============================================================
   vehicle-odometer-sync-check.js — onAssignmentOdometerSync against REAL
   (emulated) RTDB.

   Investigation: onAssignmentOdometerSync is an RTDB trigger — not client-
   invokable, fires only on a /assignments write already gated by
   database.rules.json. There is no "caller authorization" boundary. This
   file answers the narrower question: does the trigger's OWN Admin-SDK
   write stay correctly scoped (vehicles/{id}/odometer leaf ONLY), MONOTONIC,
   IDEMPOTENT, and FAIL-CLOSED on an unresolvable vehicle — using the REAL
   handler against REAL emulated data? Pure decision logic
   (shouldSyncOdometer / resolveVehicleForSync / nextOdometerValue) is
   ALREADY unit-tested by functions/scripts/vehicle-odometer-sync-check.js —
   not duplicated here.

   Run via: npm run test:functions-emulator   (needs the Firebase RTDB
   emulator — Java). exit 0 = pass.
   ============================================================ */

const { assertSafeEmulatorOrExit } = require('./_lib/safety-guard');

let pass = 0, fail = 0;
async function checkAsync(name, run) {
  try { await run(); pass++; console.log(`  ✓ ${name}`); }
  catch (err) { fail++; console.log(`  ✗ ${name} — ${err.message}`); }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

async function main() {
  await assertSafeEmulatorOrExit();

  const { makeChangeEvent } = require('./_lib/fixtures');
  const { onAssignmentOdometerSync } = require('../../src/events/onAssignmentOdometerSync');
  const { db } = require('../../src/config/admin');

  // seed a vehicle roster
  await db.ref('vehicles').set({
    v_poly:   { name: 'Polytron', odometer: '3514' },
    v_luxio:  { name: 'Luxio',    odometer: '19422' },
    v_nofield:{ name: 'Xenia' },                    // no odometer yet
    v_dupA:   { name: 'Avanza' },
    v_dupB:   { name: 'Avanza' },                   // ambiguous exact name
  });
  const odo = async (k) => (await db.ref(`vehicles/${k}/odometer`).once('value')).val();
  const full = async (k) => (await db.ref(`vehicles/${k}`).once('value')).val();

  const completed = (o) => ({
    driver: 'Dedi', vehicle: 'Polytron', date: '2026-09-09', startTime: '01:10', endTime: '03:10',
    status: 'completed', startOdometer: 3514, endOdometer: 3583, distanceTravelled: 69, ...o,
  });

  console.log('\n=== onAssignmentOdometerSync — real /vehicles transaction ===');

  await checkAsync('completed trip: vehicle 3514 → 3583 (endOdometer)', async () => {
    await onAssignmentOdometerSync.run(makeChangeEvent({
      params: { assignmentId: 'ea1' },
      before: completed({ status: 'started', endOdometer: null }),
      after: completed(),
    }));
    assert(Number(await odo('v_poly')) === 3583, `expected 3583, got ${await odo('v_poly')}`);
  });

  await checkAsync('ONLY the odometer leaf was written — name/other fields untouched', async () => {
    const v = await full('v_poly');
    assert(v.name === 'Polytron' && Object.keys(v).sort().join(',') === 'name,odometer',
      `unexpected vehicle shape: ${JSON.stringify(v)}`);
  });

  await checkAsync('MONOTONIC: a later OLD completion (end 3400) does NOT lower it', async () => {
    await onAssignmentOdometerSync.run(makeChangeEvent({
      params: { assignmentId: 'ea2' },
      before: null,
      after: completed({ startOdometer: 3200, endOdometer: 3400 }),
    }));
    assert(Number(await odo('v_poly')) === 3583, `expected still 3583, got ${await odo('v_poly')}`);
  });

  await checkAsync('IDEMPOTENT: replaying the same completion event is a no-op', async () => {
    for (let i = 0; i < 3; i++) {
      await onAssignmentOdometerSync.run(makeChangeEvent({
        params: { assignmentId: 'ea1' }, before: completed({ status: 'started', endOdometer: null }), after: completed(),
      }));
    }
    assert(Number(await odo('v_poly')) === 3583, `expected 3583 after replays, got ${await odo('v_poly')}`);
  });

  await checkAsync('a HIGHER end on a re-completion advances it (3583 → 3650)', async () => {
    await onAssignmentOdometerSync.run(makeChangeEvent({
      params: { assignmentId: 'ea1' },
      before: completed({ endOdometer: 3583 }),
      after: completed({ endOdometer: 3650 }),
    }));
    assert(Number(await odo('v_poly')) === 3650, `expected 3650, got ${await odo('v_poly')}`);
  });

  await checkAsync('vehicle with NO odometer field: first completed trip sets it', async () => {
    await onAssignmentOdometerSync.run(makeChangeEvent({
      params: { assignmentId: 'ea3' }, before: null,
      after: completed({ vehicle: 'Xenia', startOdometer: null, endOdometer: 800 }),
    }));
    assert(Number(await odo('v_nofield')) === 800, `expected 800, got ${await odo('v_nofield')}`);
  });

  await checkAsync('NOT completed → no write', async () => {
    const b = Number(await odo('v_luxio'));
    await onAssignmentOdometerSync.run(makeChangeEvent({
      params: { assignmentId: 'ea4' }, before: null,
      after: completed({ vehicle: 'Luxio', status: 'started' }),
    }));
    assert(Number(await odo('v_luxio')) === b, 'Luxio odometer changed on a non-completed write');
  });

  await checkAsync('missing endOdometer → no write', async () => {
    const b = Number(await odo('v_luxio'));
    await onAssignmentOdometerSync.run(makeChangeEvent({
      params: { assignmentId: 'ea5' }, before: null,
      after: completed({ vehicle: 'Luxio', endOdometer: null }),
    }));
    assert(Number(await odo('v_luxio')) === b, 'Luxio odometer changed with no endOdometer');
  });

  await checkAsync('end below start → no write (backward reading rejected)', async () => {
    const b = Number(await odo('v_luxio'));
    await onAssignmentOdometerSync.run(makeChangeEvent({
      params: { assignmentId: 'ea6' }, before: null,
      after: completed({ vehicle: 'Luxio', startOdometer: 25000, endOdometer: 19500 }),
    }));
    assert(Number(await odo('v_luxio')) === b, 'Luxio odometer changed on an end<start reading');
  });

  await checkAsync('FAIL-CLOSED: ambiguous vehicle name (2 "Avanza") → nothing written', async () => {
    const beforeA = await odo('v_dupA'); const beforeB = await odo('v_dupB');
    await onAssignmentOdometerSync.run(makeChangeEvent({
      params: { assignmentId: 'ea7' }, before: null,
      after: completed({ vehicle: 'Avanza', startOdometer: null, endOdometer: 999 }),
    }));
    assert((await odo('v_dupA')) === beforeA && (await odo('v_dupB')) === beforeB,
      'an odometer was written for an ambiguous vehicle name');
  });

  await checkAsync('FAIL-CLOSED: unknown vehicle name → nothing written, no vehicle created', async () => {
    await onAssignmentOdometerSync.run(makeChangeEvent({
      params: { assignmentId: 'ea8' }, before: null,
      after: completed({ vehicle: 'Fortuner', startOdometer: null, endOdometer: 1000 }),
    }));
    const all = (await db.ref('vehicles').once('value')).val();
    assert(!Object.values(all).some(v => v.name === 'Fortuner'), 'a phantom vehicle was created');
  });

  await checkAsync('case/whitespace-only name difference still resolves (" polytron ")', async () => {
    await onAssignmentOdometerSync.run(makeChangeEvent({
      params: { assignmentId: 'ea9' }, before: null,
      after: completed({ vehicle: '  polytron ', endOdometer: 3700 }),
    }));
    assert(Number(await odo('v_poly')) === 3700, `expected 3700, got ${await odo('v_poly')}`);
  });

  await db.ref('vehicles').remove();
}

main().then(() => {
  console.log(`\nvehicle-odometer-sync-check: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}).catch((err) => { console.error(err); process.exit(1); });
