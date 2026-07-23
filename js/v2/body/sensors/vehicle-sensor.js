/* ============================================================
   VEHICLE-SENSOR.JS — Body Intelligence Sensor (V2, Phase 12.5.3)

   PURPOSE: one of the 3 real pilot sensors — projects
   js/vehicles-store.js's real RTDB-backed Vehicle records into Entity
   snapshots. Thin orchestration ONLY — every derivation rule lives in
   vehicle-mapping.js (PURE, Node-testable; see that file's header for
   why the split exists: js/vehicles-store.js transitively imports
   js/firebase.js's `https://` CDN Firebase SDK, which Node's ESM loader
   cannot resolve, so THIS file cannot be imported by a plain Node check
   script — verified behaviorally only through vehicle-mapping.js).

   DEPENDENCIES: js/vehicles-store.js (read-only, getVehicles()),
   sensors/vehicle-mapping.js, contracts/sensor-contract.js,
   registry/sensor-registry.js (self-registers at the bottom of this file
   — NOT bootstrapped by the registry itself, see sensor-registry.js's own
   NON-GOALS: this module transitively loads the real Firebase SDK, so it
   must only load when something deliberately imports it, never as a side
   effect of loading the platform core — mirrors
   knowledge/connectors/nor-connector.js's identical precedent),
   knowledge/observability/contracts/warning-contract.js (reused).

   NON-GOALS: never writes back to V1. Never emits a fabricated Vehicle —
   one malformed record is skipped with a Warning, never invented. Emits
   no relationships (Vehicle is the REFERENCED side of Assignment's FK —
   see sensors/assignment-sensor.js's header for why relationship
   derivation belongs on the referencing entity's sensor).
   ============================================================ */

'use strict';

import { getVehicles } from '../../../vehicles-store.js';
import { senseSuccess, senseFailure, SENSOR_ERRORS } from '../contracts/sensor-contract.js';
import { registerSensor } from '../registry/sensor-registry.js';
import { makeWarning, WARNING_SEVERITY } from '../../../../src/knowledge/observability/contracts/warning-contract.js';
import { VEHICLE_SENSOR_ID, VEHICLE_SENSOR_VERSION, toVehicleEntity, isVehicleNewerThan } from './vehicle-mapping.js';

/** One malformed vehicle record must never sink the whole sense — every
 *  record is mapped independently; a record that throws is skipped with
 *  a Warning instead of failing the entire sensor run (mirrors
 *  nor-connector.js's identical per-record isolation). */
function sense(since = null) {
  try {
    const vehicles = getVehicles().filter((v) => isVehicleNewerThan(v, since));
    const now = new Date().toISOString();
    const entities = [];
    const warnings = [];
    for (const v of vehicles) {
      try {
        entities.push(toVehicleEntity(v, now));
      } catch (e) {
        warnings.push(makeWarning(
          'RECORD_MAPPING_FAILED',
          e && e.message ? e.message : `Failed to map vehicle "${v && v.id}".`,
          { connectorId: VEHICLE_SENSOR_ID, sourceRef: v && v.id, severity: WARNING_SEVERITY.MEDIUM },
        ));
      }
    }
    return senseSuccess(entities, { sensorId: VEHICLE_SENSOR_ID, warnings });
  } catch (e) {
    return senseFailure(
      SENSOR_ERRORS.SENSE_FAILED,
      e && e.message ? e.message : 'Vehicle sensor sense failed.',
      { sensorId: VEHICLE_SENSOR_ID },
    );
  }
}

export const vehicleSensor = Object.freeze({
  id: VEHICLE_SENSOR_ID,
  entityType: 'vehicle',
  version: VEHICLE_SENSOR_VERSION,
  description: 'Projects js/vehicles-store.js Vehicle records into Entity snapshots.',
  sense,
});

registerSensor(vehicleSensor);

export default vehicleSensor;
