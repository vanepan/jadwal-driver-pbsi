/* ============================================================
   ASSIGNMENT-SENSOR.JS — Body Intelligence Sensor (V2, Phase 12.5.3)

   PURPOSE: the 3rd real pilot sensor — projects js/assignments.js's
   Assignment records into Entity snapshots, AND emits the
   EntityRelationship edges to Vehicle/Driver (see assignment-mapping.js's
   header for why relationship derivation belongs here, on the
   REFERENCING entity's sensor). Thin orchestration ONLY — every
   derivation rule lives in assignment-mapping.js (PURE, Node-testable).

   NAME RESOLUTION: js/assignments.js's `driver`/`vehicle` fields are
   legacy NAME STRINGS, not ids (v1.27.0-era convention, confirmed by
   research) — resolved here via the SAME existing V1 helpers every other
   caller already uses:
     - Driver: js/drivers-store.js#findDriverByLegacyName (returns the
       real store record with a real `.id` — NOT js/drivers.js#
       getDriverByName, which also falls back to a static DEFAULT_DRIVERS
       entry with no store id to build a stable Entity id from).
     - Vehicle: js/vehicles-store.js#getVehicleByName (returns the real
       store record with a real `.id`).
   No new resolution logic is invented — pure data lookup through
   existing V1 getters, per CLAUDE.md's "never invent business rules."
   An unresolved name (e.g. a Self-Drive Assignment's empty `driver`)
   simply yields no edge for that side — see assignment-mapping.js.

   DEPENDENCIES: js/assignments.js (read-only, getAssignments()),
   js/drivers-store.js (read-only, findDriverByLegacyName()),
   js/vehicles-store.js (read-only, getVehicleByName()),
   sensors/assignment-mapping.js, contracts/{sensor,identity}-contract.js,
   registry/sensor-registry.js (self-registers — see vehicle-sensor.js's
   header for the full dormancy rationale), knowledge/observability/
   contracts/warning-contract.js (reused).

   NON-GOALS: never writes back to V1. Emitted relationships are always
   derived fresh from the SAME resolution this sensor already did to
   build its own attributes — never a second, independent lookup.
   ============================================================ */

'use strict';

import { getAssignments } from '../../../assignments.js';
import { findDriverByLegacyName } from '../../../drivers-store.js';
import { getVehicleByName } from '../../../vehicles-store.js';
import { senseSuccess, senseFailure, SENSOR_ERRORS } from '../contracts/sensor-contract.js';
import { generateEntityId } from '../contracts/identity-contract.js';
import { registerSensor } from '../registry/sensor-registry.js';
import { makeWarning, WARNING_SEVERITY } from '../../../../src/knowledge/observability/contracts/warning-contract.js';
import {
  ASSIGNMENT_SENSOR_ID, ASSIGNMENT_SENSOR_VERSION, toAssignmentEntity,
  deriveAssignmentRelationships, isAssignmentNewerThan,
} from './assignment-mapping.js';

function resolveFkEntityIds(a) {
  const driverRecord = a.driver ? findDriverByLegacyName(a.driver) : null;
  const vehicleRecord = a.vehicle ? getVehicleByName(a.vehicle) : null;
  return {
    driverEntityId: driverRecord ? generateEntityId({ entityType: 'driver', sourceRef: driverRecord.id }) : null,
    vehicleEntityId: vehicleRecord ? generateEntityId({ entityType: 'vehicle', sourceRef: vehicleRecord.id }) : null,
  };
}

function sense(since = null) {
  try {
    const assignments = getAssignments().filter((a) => isAssignmentNewerThan(a, since));
    const now = new Date().toISOString();
    const entities = [];
    const relationships = [];
    const warnings = [];
    for (const a of assignments) {
      try {
        const fk = resolveFkEntityIds(a);
        entities.push(toAssignmentEntity(a, fk, now));
        relationships.push(...deriveAssignmentRelationships(a, fk));
      } catch (e) {
        warnings.push(makeWarning(
          'RECORD_MAPPING_FAILED',
          e && e.message ? e.message : `Failed to map assignment "${a && a.id}".`,
          { connectorId: ASSIGNMENT_SENSOR_ID, sourceRef: a && a.id, severity: WARNING_SEVERITY.MEDIUM },
        ));
      }
    }
    return senseSuccess(entities, { sensorId: ASSIGNMENT_SENSOR_ID, relationships, warnings });
  } catch (e) {
    return senseFailure(
      SENSOR_ERRORS.SENSE_FAILED,
      e && e.message ? e.message : 'Assignment sensor sense failed.',
      { sensorId: ASSIGNMENT_SENSOR_ID },
    );
  }
}

export const assignmentSensor = Object.freeze({
  id: ASSIGNMENT_SENSOR_ID,
  entityType: 'assignment',
  version: ASSIGNMENT_SENSOR_VERSION,
  description: 'Projects js/assignments.js Assignment records into Entity snapshots, plus the EntityRelationship edges to Vehicle/Driver.',
  sense,
});

registerSensor(assignmentSensor);

export default assignmentSensor;
