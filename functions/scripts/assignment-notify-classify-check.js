'use strict';

/* assignment-notify-classify-check.js — validates the v1.25.x Driver
   Notification V2 classification/threshold logic in
   functions/src/events/onAssignmentWrite.js (Parts 2 + 3), UPDATED for
   Final Hardening Part 1 (no config duplication): classify()/
   isMeaningfulChange() now take `thresholdMinutes` as an explicit
   parameter instead of reading a module-level config constant — the
   caller (the trigger handler) fetches the ONE live value via
   config/runtimeSettings.js#getAssignmentNotifyConfig() and passes it in.
   This script proves the functions are still correct given ANY threshold,
   without needing to mock a live Firebase settings read.
   Run: node functions/scripts/assignment-notify-classify-check.js
   (exit 0 = all pass)

   Pure-logic only: classify()/isMeaningfulChange()/buildPayload() never
   touch `db`, so this requires no Firebase credentials or emulator — it
   is what CAN be verified without a real deploy. The LIVE settings read
   (config/runtimeSettings.js) and the debounce sleep+recheck's actual
   timing require a live deploy to fully exercise (documented as such in
   the task report).
*/

const { classify, isMeaningfulChange, buildPayload } = require('../src/events/onAssignmentWrite');

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

const base = {
  driver: 'Dedi', driverUsername: 'dedi', vehicle: 'Innova', destination: 'Bandara',
  date: '2026-07-01', startTime: '09:00', endTime: '11:00', status: 'assigned',
};
const THRESHOLD = 15; // the current settings-store.js default

console.log('\n[classify — create/delete/status transitions unchanged]');
check('no before, has after → assignment.created', classify(null, { ...base }, THRESHOLD) === 'assignment.created');
check('has before, no after → assignment.deleted', classify({ ...base }, null, THRESHOLD) === 'assignment.deleted');
check('status → cancelled → assignment.cancelled', classify({ ...base }, { ...base, status: 'cancelled' }, THRESHOLD) === 'assignment.cancelled');
check('status → completed → assignment.completed', classify({ ...base }, { ...base, status: 'completed' }, THRESHOLD) === 'assignment.completed');
check('status → started → assignment.started', classify({ ...base }, { ...base, status: 'started' }, THRESHOLD) === 'assignment.started');

console.log('\n[classify — Part 3 Change Threshold: small time nudge is NOT meaningful]');
check('09:00 → 09:05 (5min, below 15min threshold) → no event (null)',
  classify({ ...base }, { ...base, startTime: '09:05' }, THRESHOLD) === null);
check('09:00 → 09:10 (10min, still below threshold) → no event (null)',
  classify({ ...base }, { ...base, startTime: '09:10' }, THRESHOLD) === null);
check('09:00 → 10:00 (60min, past threshold) → assignment.updated',
  classify({ ...base }, { ...base, startTime: '10:00' }, THRESHOLD) === 'assignment.updated');
check('09:00 → 09:15 (exactly 15min, threshold inclusive) → assignment.updated',
  classify({ ...base }, { ...base, startTime: '09:15' }, THRESHOLD) === 'assignment.updated');
check('identical resave (no fields changed) → no event (null) — never spam on a no-op write',
  classify({ ...base }, { ...base }, THRESHOLD) === null);

console.log('\n[classify — threshold is a genuine PARAMETER, not a hidden global (Part 1)]');
check('09:00 → 09:10 (10min) with threshold=5 → assignment.updated (a SMALLER live threshold changes the outcome)',
  classify({ ...base }, { ...base, startTime: '09:10' }, 5) === 'assignment.updated');
check('09:00 → 09:10 (10min) with threshold=15 (unchanged) → still null',
  classify({ ...base }, { ...base, startTime: '09:10' }, 15) === null);
check('threshold=0 → any time change at all is meaningful',
  classify({ ...base }, { ...base, startTime: '09:01' }, 0) === 'assignment.updated');

console.log('\n[classify — driver/date/destination/vehicle ALWAYS meaningful regardless of threshold]');
check('driver changed (even with 0min time delta) → assignment.reassigned',
  classify({ ...base }, { ...base, driver: 'Igo', driverUsername: 'igo' }, THRESHOLD) === 'assignment.reassigned');
check('date changed only → assignment.updated',
  classify({ ...base }, { ...base, date: '2026-07-02' }, THRESHOLD) === 'assignment.updated');
check('destination changed only → assignment.updated',
  classify({ ...base }, { ...base, destination: 'Stasiun' }, THRESHOLD) === 'assignment.updated');
check('vehicle changed only → assignment.updated',
  classify({ ...base }, { ...base, vehicle: 'Avanza' }, THRESHOLD) === 'assignment.updated');

console.log('\n[isMeaningfulChange — direct unit checks]');
check('exact duplicate → not meaningful', isMeaningfulChange({ ...base }, { ...base }, THRESHOLD) === false);
check('5-minute nudge → not meaningful', isMeaningfulChange({ ...base }, { ...base, startTime: '09:05' }, THRESHOLD) === false);
check('15-minute nudge (boundary) → meaningful', isMeaningfulChange({ ...base }, { ...base, startTime: '09:15' }, THRESHOLD) === true);
check('driver change alone → meaningful', isMeaningfulChange({ ...base }, { ...base, driver: 'Igo' }, THRESHOLD) === true);

console.log('\n[buildPayload — carries "previous" fields for reassigned/updated]');
const before = { ...base };
const after = { ...base, driver: 'Igo', driverUsername: 'igo' };
const payloadWithPrev = buildPayload(after, before);
check('payload.driver reflects the NEW driver', payloadWithPrev.driver === 'Igo');
check('payload.previousDriver reflects the OLD driver', payloadWithPrev.previousDriver === 'Dedi');
check('payload.previousDestination carries the pre-change destination', payloadWithPrev.previousDestination === 'Bandara');
const payloadNoPrev = buildPayload(after, null);
check('buildPayload(node, null) omits previous* fields entirely (assignment.created path)',
  payloadNoPrev.previousDriver === undefined && payloadNoPrev.previousDate === undefined);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
