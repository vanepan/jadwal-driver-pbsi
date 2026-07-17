/* self-drive-assignment-check.mjs — Self-Drive Assignment + Unified Odometer
   Autofill (v1.27.0).
   Run: node scripts/self-drive-assignment-check.mjs   (exit 0 = all pass)

   Two kinds of checks, clearly separated:

   A) REAL runtime tests against the actual engine — js/analytics/analytics-engine.js
      is PURE (no Firebase import), so computeAnalyticsModel() runs for real here,
      proving the totalKm fix (Requirement 8) actually behaves as intended.

   B) STATIC source-pattern checks for every OTHER file this sprint touched.
      js/vehicles-store.js, js/validation.js, js/modal.js, js/auth.js, js/drivers.js,
      js/assignments.js and js/app.js all import (directly or transitively) from
      js/firebase.js, which imports Firebase SDK modules via `https://` URL
      specifiers — Node's ESM loader cannot resolve those (confirmed: importing
      any of them throws "Only URLs with a scheme in: file and data are
      supported"), and js/firebase.js's config is the real production project,
      so no headless script should ever try to exercise it live (see this repo's
      established convention — e.g. scripts/maintenance-intelligence-check.mjs's
      own "Store Integration" section, which does the exact same fs.readFileSync
      + string-pattern approach for the same reason). These checks confirm the
      exact code this sprint shipped is present and correctly shaped; they do
      NOT execute it. */

import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imp = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
const src = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

/* ════════════════════════════════════════════════════════════════════════
   A) REAL runtime tests — analytics-engine.js totalKm fix (Requirement 8)
   ════════════════════════════════════════════════════════════════════════ */
console.log('\n[analytics-engine: totalKm sourced from vehicleOdoList]');

const { computeAnalyticsModel } = await imp('js/analytics/analytics-engine.js');

const d = (o) => { const x = new Date(); x.setDate(x.getDate() + o); return x.toISOString().slice(0, 10); };

function baseCtx(assignments) {
  return {
    assignments,
    requests: [],
    drivers:  [{ name: 'Andi', id: 'd1', active: true, archived: false }],
    vehicles: [{ name: 'Innova', id: 'v1', active: true, archived: false }],
    office: { workStartMins: 540, workEndMins: 1020 },
    filters: { dateRange: 'all', driver: '', vehicle: '', bidang: '' },
    aliases:   { destinations: {}, bidang: {}, drivers: {}, vehicles: {} },
    dismissed: { destinations: {}, bidang: {}, drivers: {}, vehicles: {} },
    normalizeAssignmentStatus: (a) => a,
  };
}

const driverTrip = {
  id: 'a1', driver: 'Andi', vehicle: 'Innova', date: d(-2), startTime: '08:00', endTime: '10:00',
  status: 'completed', destination: 'Bandara', purpose: 'jemput', pic: 'Andi', pax: 2,
  createdAt: d(-3) + 'T01:00:00Z', distanceTravelled: 40,
};
const selfDriveTrip = {
  id: 'a2', driver: '', vehicle: 'Innova', date: d(-1), startTime: '08:00', endTime: '10:00',
  status: 'completed', destination: 'Kantor', purpose: 'self drive', pic: 'Bidang A', pax: 1,
  createdAt: d(-2) + 'T01:00:00Z', distanceTravelled: 25,
};

const modelBoth = computeAnalyticsModel(baseCtx([driverTrip, selfDriveTrip]));
check('kpis.totalKm includes BOTH driver and self-drive trips (40 + 25 = 65)', modelBoth.kpis.totalKm === 65);
check('render.vehicleOdoList attributes the self-drive km to its vehicle', modelBoth.render.vehicleOdoList.find(v => v.name === 'Innova')?.km === 65);

const modelSelfDriveOnly = computeAnalyticsModel(baseCtx([selfDriveTrip]));
check('a SELF-DRIVE-ONLY period still reports its km in totalKm (would be 0 if sourced from driverOdoList)', modelSelfDriveOnly.kpis.totalKm === 25);
check('driverOdoList correctly has NO entry for the empty-driver key (Requirement 8: Driver Analytics excludes self-drive)', modelSelfDriveOnly.render.driverOdoList.length === 0);
check('...while vehicleOdoList DOES carry it (Requirement 8: Vehicle Analytics still counts it)', modelSelfDriveOnly.render.vehicleOdoList.some(v => v.km === 25));

/* ════════════════════════════════════════════════════════════════════════
   B) STATIC source-pattern checks (Firebase-coupled files — not importable
      in plain Node; see file header)
   ════════════════════════════════════════════════════════════════════════ */

console.log('\n[vehicles-store.js: odometer accessors (SS2 hotfix — renamed from lastOdometer)]');
const vehiclesStoreSrc = src('js/vehicles-store.js');
check('exports getVehicleByName', vehiclesStoreSrc.includes('export function getVehicleByName'));
check('exports updateVehicleOdometer (renamed from updateVehicleLastOdometer)', vehiclesStoreSrc.includes('export async function updateVehicleOdometer'));
check('the old updateVehicleLastOdometer export is gone', !vehiclesStoreSrc.includes('export async function updateVehicleLastOdometer'));
check('updateVehicleOdometer writes the EXISTING odometer field, not a new lastOdometer field', /const updates = \{ odometer: String\(Number\(value\)\), updatedAt:/.test(vehiclesStoreSrc));
check('updateVehicleOdometer writes via updateFirebaseData (partial update, not a full overwrite)', /updateFirebaseData\(VEHICLES_PATH \+ '\/' \+ vehicleId, updates\)/.test(vehiclesStoreSrc));
check('local-cache branch (non-Firebase) updates the in-memory vehicle without touching Firebase', /if \(!isFirebaseConfigured\(\)\) \{\s*refreshVehiclesCache/.test(vehiclesStoreSrc));
check('odometer is still declared exactly once in ASSET_STRING_FIELDS (no schema duplication)', (vehiclesStoreSrc.match(/'odometer'/g) || []).length === 1);

console.log('\n[validation.js: referenceOdometer warn-only param]');
const validationSrc = src('js/validation.js');
check('validateOdometer accepts referenceOdometer', validationSrc.includes('d.referenceOdometer'));
check('reference-gap check ONLY pushes a warning, never an error', (() => {
  const block = validationSrc.slice(validationSrc.indexOf('Reference odometer'), validationSrc.indexOf('return createResult(errors, warnings);\n}\n\n/* ── Lifecycle'));
  return block.includes('warnings.push') && !block.includes('errors.push');
})());
check('existing previousOdometer hard-block (backward movement) is untouched', validationSrc.includes('Odometer mundur terdeteksi'));

console.log('\n[modal.js: odometer autofill + Bidang self-drive ownership]');
const modalSrc = src('js/modal.js');
check('imports getVehicleByName from vehicles-store.js', modalSrc.includes("import { getVehicleByName } from './vehicles-store.js';"));
check('no leftover functional reads of the removed vehicle.lastOdometer field', !/_odoVehicle\?\.lastOdometer/.test(modalSrc));
check('_vehicleOdometerValue helper reads vehicle.odometer (SS2: existing field, not lastOdometer)', /function _vehicleOdometerValue\(vehicle\)/.test(modalSrc) && /const raw = vehicle\?\.odometer;/.test(modalSrc));
check("_vehicleOdometerValue treats '' (never set) as no value, not 0", /if \(raw == null \|\| raw === ''\) return null;/.test(modalSrc));
check('Start Assignment prefills #odoInput via _vehicleOdometerValue', /const _odoAutofill = isStart \? _vehicleOdometerValue\(_odoVehicle\) : null;/.test(modalSrc));
check('field stays a plain input — never marked readonly/disabled for the autofill (Requirement 5)', !/odoInput['"]\)?\.(readOnly|disabled)\s*=\s*true/.test(modalSrc));
check('_handleOdometerConfirm passes referenceOdometer only on Start', /referenceOdometer: refOdoVal/.test(modalSrc));
check('_isOwnBidangAssignment helper extracted and shared', (modalSrc.match(/_isOwnBidangAssignment\(/g) || []).length >= 3);
check('canActOnAssignment gates Bidang to their OWN self-drive (no-driver) assignment only', /user\.role === 'bidang' && assignment\) \{\s*return !assignment\.driver && _isOwnBidangAssignment/.test(modalSrc));

console.log('\n[auth.js: PERMISSIONS]');
const authSrc = src('js/auth.js');
check("start permission includes 'bidang'", /start:\s*\['admin', 'driver', 'bidang'\]/.test(authSrc));
check("complete permission includes 'bidang'", /complete:\s*\['admin', 'driver', 'bidang'\]/.test(authSrc));

console.log('\n[drivers.js: Tanpa Driver sentinel]');
const driversSrc = src('js/drivers.js');
check('driver select gains a "Tanpa Driver" (__none__) option', driversSrc.includes('<option value="__none__">Tanpa Driver</option>'));

console.log('\n[assignments.js: self-drive support]');
const assignmentsSrc = src('js/assignments.js');
check('NO_DRIVER_SENTINEL constant defined', assignmentsSrc.includes("const NO_DRIVER_SENTINEL = '__none__';"));
check('handleFormSubmit normalizes the sentinel to driver: \'\'', /const driver\s*=\s*driverRaw === NO_DRIVER_SENTINEL \? '' : driverRaw;/.test(assignmentsSrc));
check('mandatory-field check uses driverRaw (untouched dropdown), not the normalized driver', assignmentsSrc.includes('if (driverRaw === \'\' || vehicleRaw === \'\''));
check('driver conflict check is skipped when driver === \'\' (Self-Drive)', /driver !== '' && checkConflict\(driver,/.test(assignmentsSrc));
check('edit-mode populate selects the sentinel for a stored empty driver', /a\.driver === '' \? NO_DRIVER_SENTINEL : a\.driver/.test(assignmentsSrc) || /a\.driver == null \|\| a\.driver === ''\) \? NO_DRIVER_SENTINEL/.test(assignmentsSrc));

console.log('\n[app.js: approval-flow self-drive + odometer write-back]');
const appSrc = src('js/app.js');
check('imports getVehicleByName + updateVehicleOdometer from vehicles-store.js (SS2: renamed from updateVehicleLastOdometer)', /getVehicleByName,\s*updateVehicleOdometer,/.test(appSrc));
check('no leftover reference to the removed updateVehicleLastOdometer', !appSrc.includes('updateVehicleLastOdometer'));
check('commitApproval no longer hard-blocks an intentional self-drive decision', /if \(!effDriver && !request\.noDriver && !\('driver' in decision\)\)/.test(appSrc));
check('driver-conflict filter is skipped when effDriver is empty (Self-Drive)', /const conflictingDates = effDriver \? dates\.filter/.test(appSrc));
check('#approveDriverSelect gains a "Tanpa Driver" (__none__) option', appSrc.includes("'<option value=\"__none__\">Tanpa Driver</option>'"));
check('confirmApproveRequest only blocks on the untouched placeholder, not the explicit self-drive sentinel', appSrc.includes("if (selDriverRaw === '') { showToast('Pilih driver dulu.'); return; }"));
check('_approveNormalizedDriver collapses the sentinel everywhere it is read', (appSrc.match(/_approveNormalizedDriver\(/g) || []).length >= 4);
check('registerCompleteCallback writes vehicle.odometer back on every completed trip with a vehicle', /if \(assignments\[idx\]\.vehicle && endOdometer != null\) \{\s*const veh = getVehicleByName/.test(appSrc));
check('odometer write-back is fire-and-forget (never blocks the completion already committed)', /updateVehicleOdometer\(veh\.id, endOdometer\)\.catch/.test(appSrc));

console.log('\n[analytics-engine.js: source pattern confirms the runtime result above]');
const analyticsSrc = src('js/analytics/analytics-engine.js');
check('totalKm is now summed from vehicleOdoList, not driverOdoList', /const totalKm\s*=\s*vehicleOdoList\.reduce/.test(analyticsSrc));

/* ── Summary ─────────────────────────────────────────────────────────── */
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
