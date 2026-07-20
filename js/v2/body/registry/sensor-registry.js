/* ============================================================
   SENSOR-REGISTRY.JS — Body Intelligence (V2, Phase 12.5.1)

   PURPOSE: the single process-wide directory of Body sensors, mirroring
   knowledge/registry/connector-registry.js's pattern AND its dormancy
   split.

   DEPENDENCIES: contracts/sensor-contract.js, sensors/placeholder-sensor.js
   (the 16 pure, dependency-free placeholders bootstrapped here).

   NON-GOALS: does NOT import or register the 3 real pilot sensors
   (vehicle/driver/assignment) here. Unlike the 16 placeholders (pure,
   zero dependencies), each real sensor transitively imports a V1
   *-store.js (e.g. js/vehicles-store.js), which loads real Firebase
   machinery at module top-level — importing one eagerly from this
   registry would mean every future caller of body/index.js silently
   loads live Firebase just by touching a contract. Each real sensor
   self-registers at ITS OWN module load time instead (see
   sensors/vehicle-sensor.js's bottom) — reachable only through
   sensors/index.js, the deliberate opt-in barrel (Phase 12.5.3). This
   keeps the platform dormant (js/v2/README.md's dormancy rule) for every
   caller that does not explicitly opt into real sensing.

   FUTURE EVOLUTION: activating a placeholder sensor means replacing its
   `sense` body (sensors/<entityType>-sensor.js) — this registry does not
   change. A future sensor with real V1 dependencies should follow
   sensors/vehicle-sensor.js's self-registration pattern, not this file's
   bootstrap.
   ============================================================ */

'use strict';

import { isSensor } from '../contracts/sensor-contract.js';
import { makePlaceholderSensor } from '../sensors/placeholder-sensor.js';

export const SENSOR_REGISTRY_ERRORS = Object.freeze({
  INVALID_SENSOR: 'INVALID_SENSOR',
  UNKNOWN_SENSOR: 'UNKNOWN_SENSOR',
});

/** @type {Map<string, object>} */
const _sensors = new Map();

/** Idempotent per id (re-registering the same id replaces it). */
export function registerSensor(sensor) {
  if (!isSensor(sensor)) {
    const err = new Error('registerSensor: sensor must satisfy { id, entityType, version, description, sense() }.');
    err.code = SENSOR_REGISTRY_ERRORS.INVALID_SENSOR;
    throw err;
  }
  _sensors.set(sensor.id, sensor);
  return sensor;
}

export function getSensor(id) {
  return _sensors.get(id) || null;
}

export function hasSensor(id) {
  return _sensors.has(id);
}

/** A frozen summary of every registered sensor (no `sense` fn). */
export function listSensors() {
  return Object.freeze([..._sensors.values()].map((s) => Object.freeze({
    id: s.id, entityType: s.entityType, version: s.version, description: s.description || null,
  })));
}

/** Test/teardown helper. Re-bootstraps the 16 pure placeholders (NOT the
 *  3 pilot sensors — callers that need those registered must import
 *  sensors/index.js, or the individual sensor file, themselves). */
export function resetSensorRegistry() {
  _sensors.clear();
  bootstrap();
}

/* ── bootstrap: the 16 inactive, dependency-free placeholders named in
   the Phase 12.5 brief. The 3 pilot entityTypes are deliberately
   excluded (see NON-GOALS above). ─────────────────────────────────── */
const PLACEHOLDER_ENTITY_TYPES = Object.freeze([
  ['building', 'Static seeded taxonomy today (js/engineering/master-data) — not yet Firebase-backed; sensing it would misrepresent liveness.'],
  ['room', 'Static seeded taxonomy today (js/engineering/master-data) — not yet Firebase-backed.'],
  ['equipment', 'Static seeded taxonomy today (js/engineering/master-data) — not yet Firebase-backed.'],
  ['budget', 'No general Budget store exists in V1 today (only a single overtimeBudget/default settings object).'],
  ['nor', 'No RTDB-native NOR entity sensor yet — Petty Cash NOR records exist but are not represented as Body entities in Phase 12.5.'],
  ['petty_cash', 'No RTDB-native Petty Cash entity sensor yet.'],
  ['employee', 'No RTDB-native Employee entity sensor yet (users/{username} exists but is not yet mapped).'],
  ['vendor', 'No V1 Vendor store exists today.'],
  ['inventory', 'No V1 Inventory store exists today.'],
  ['maintenance', 'Maintenance exists only embedded in vehicles.maintenanceRecords[] today — no standalone entity sensor yet.'],
  ['knowledge', 'Deliberately excluded — sensing knowledge/\'s own KnowledgeItems would break the peer/no-engine-dependency boundary body/ has to knowledge/ (see js/v2/body/README.md).'],
  ['policy', 'Same reasoning as knowledge — deliberately excluded pending a dedicated future decision.'],
  ['workflow', 'No V1 standalone Workflow store exists today.'],
  ['approval', 'No V1 standalone Approval store exists today.'],
  ['meeting', 'No V1 Meeting store exists today.'],
  ['organization_unit', 'No dedicated V1 Organization Unit store exists today (only denormalized bidangId/bidangName fields on Petty Cash records).'],
]);

function bootstrap() {
  for (const [entityType, description] of PLACEHOLDER_ENTITY_TYPES) {
    registerSensor(makePlaceholderSensor(entityType, description));
  }
}

bootstrap();
