/* ============================================================
   DRIVER-SENSOR.JS — Body Intelligence Sensor (V2, Phase 12.5.3)

   PURPOSE: one of the 3 real pilot sensors — projects
   js/drivers-store.js's real RTDB-backed Driver records into Entity
   snapshots. Thin orchestration ONLY — every derivation rule lives in
   driver-mapping.js (PURE, Node-testable; see that file's header). Reuses
   `effectiveStatus()` (js/drivers-store.js) rather than the lower-level
   `deriveStatus()` — effectiveStatus already accounts for a leave period
   whose `end` date has passed, so this sensor never re-implements that
   leave-expiry rule itself.

   DEPENDENCIES: js/drivers-store.js (read-only, getDrivers(),
   effectiveStatus()), sensors/driver-mapping.js, contracts/sensor-contract.js,
   registry/sensor-registry.js (self-registers — see vehicle-sensor.js's
   header for the full dormancy rationale, identical here),
   knowledge/observability/contracts/warning-contract.js (reused).

   NON-GOALS: never writes back to V1. Emits no relationships (Driver is
   the REFERENCED side of Assignment's FK — see
   sensors/assignment-sensor.js's header).
   ============================================================ */

'use strict';

import { getDrivers, effectiveStatus } from '../../../drivers-store.js';
import { senseSuccess, senseFailure, SENSOR_ERRORS } from '../contracts/sensor-contract.js';
import { registerSensor } from '../registry/sensor-registry.js';
import { makeWarning, WARNING_SEVERITY } from '../../../../src/knowledge/observability/contracts/warning-contract.js';
import { DRIVER_SENSOR_ID, DRIVER_SENSOR_VERSION, toDriverEntity, isDriverNewerThan } from './driver-mapping.js';

function sense(since = null) {
  try {
    const drivers = getDrivers().filter((d) => isDriverNewerThan(d, since));
    const now = new Date().toISOString();
    const entities = [];
    const warnings = [];
    for (const d of drivers) {
      try {
        entities.push(toDriverEntity(d, effectiveStatus(d), now));
      } catch (e) {
        warnings.push(makeWarning(
          'RECORD_MAPPING_FAILED',
          e && e.message ? e.message : `Failed to map driver "${d && d.id}".`,
          { connectorId: DRIVER_SENSOR_ID, sourceRef: d && d.id, severity: WARNING_SEVERITY.MEDIUM },
        ));
      }
    }
    return senseSuccess(entities, { sensorId: DRIVER_SENSOR_ID, warnings });
  } catch (e) {
    return senseFailure(
      SENSOR_ERRORS.SENSE_FAILED,
      e && e.message ? e.message : 'Driver sensor sense failed.',
      { sensorId: DRIVER_SENSOR_ID },
    );
  }
}

export const driverSensor = Object.freeze({
  id: DRIVER_SENSOR_ID,
  entityType: 'driver',
  version: DRIVER_SENSOR_VERSION,
  description: 'Projects js/drivers-store.js Driver records into Entity snapshots.',
  sense,
});

registerSensor(driverSensor);

export default driverSensor;
