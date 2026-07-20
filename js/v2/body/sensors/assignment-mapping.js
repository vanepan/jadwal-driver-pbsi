/* ============================================================
   ASSIGNMENT-MAPPING.JS — Body Intelligence Sensor logic (V2, Phase 12.5.3)

   PURPOSE: the PURE mapping/derivation logic assignment-sensor.js's
   `sense()` uses — split out for the identical reason vehicle-mapping.js
   is (see that file's header). `toAssignmentEntity`/
   `deriveAssignmentRelationships` take already-resolved
   `driverEntityId`/`vehicleEntityId` as parameters rather than resolving
   js/assignments.js's legacy NAME-STRING `driver`/`vehicle` fields
   themselves — that resolution (via js/drivers-store.js#
   findDriverByLegacyName / js/vehicles-store.js#getVehicleByName) needs
   the real, Firebase-coupled stores; assignment-sensor.js does it and
   passes the results in, keeping this file dependency-free.

   RELATIONSHIP DERIVATION LIVES HERE, ON THE REFERENCING ENTITY'S SENSOR
   (Assignment), NOT A SEPARATE CROSS-CUTTING ENGINE — Assignment already
   has both ids resolved while building its own attributes, and already
   knows the FK field name (`driver`/`vehicle`) needed for
   EntityRelationship's `derivedFrom` traceability. Vehicle/Driver, the
   REFERENCED side, emit no relationships of their own.

   RESPONSIBILITY: deriveAssignmentState, toAssignmentEntity,
   deriveAssignmentRelationships, isAssignmentNewerThan.

   DEPENDENCIES: contracts/{identity,entity-state,entity-vocabulary,
   entity-relationship}-contract.js only.
   ============================================================ */

'use strict';

import { generateEntityId } from '../contracts/identity-contract.js';
import { ENTITY_STATE } from '../contracts/entity-state-contract.js';
import { AI_CONTEXT_TAG, defaultVisibilityFor } from '../contracts/entity-vocabulary-contract.js';
import { ENTITY_RELATIONSHIP_TYPE, makeEntityRelationship } from '../contracts/entity-relationship-contract.js';

export const ASSIGNMENT_SENSOR_ID = 'assignment';
export const ASSIGNMENT_SENSOR_VERSION = 'assignment-sensor@1';

/** Data table over the real V1 assignment status values (js/app.js's own
 *  statusMap: assigned/started/completed/pending/approved/cancelled —
 *  confirmed by grep, there is no dedicated ASSIGNMENT_STATUS export to
 *  import instead). `cancelled` is treated as terminal/ARCHIVED, matching
 *  js/app.js's own "Cancelled assignments are terminal" comment. */
export function deriveAssignmentState(status) {
  if (status === 'assigned' || status === 'started') return { state: ENTITY_STATE.ACTIVE, basis: `assignments.status='${status}'` };
  if (status === 'pending' || status === 'approved') return { state: ENTITY_STATE.PENDING, basis: `assignments.status='${status}'` };
  if (status === 'completed' || status === 'cancelled') return { state: ENTITY_STATE.ARCHIVED, basis: `assignments.status='${status}'` };
  return { state: ENTITY_STATE.UNKNOWN, basis: `assignments.status='${status}' (unrecognized — see this file's derivation table)` };
}

export function isAssignmentNewerThan(a, since) {
  if (!since) return true;
  const updatedIso = new Date(a.updatedAt || a.createdAt || 0).toISOString();
  return updatedIso > since;
}

export function toAssignmentEntity(a, { driverEntityId = null, vehicleEntityId = null } = {}, now) {
  const id = generateEntityId({ entityType: 'assignment', sourceRef: a.id });
  const { state, basis } = deriveAssignmentState(a.status || 'assigned');
  const hasCoreFields = !!(a.date && (a.driver || a.vehicle));
  return Object.freeze({
    id,
    version: 1,
    entityType: 'assignment',
    sourceRef: a.id,
    attributes: Object.freeze({
      date: a.date || null, startTime: a.startTime || null, endTime: a.endTime || null,
      destination: a.destination || '', driverName: a.driver || '', vehicleName: a.vehicle || '',
      driverEntityId, vehicleEntityId,
      sourceCreatedAt: a.createdAt || null, sourceUpdatedAt: a.updatedAt || null,
    }),
    observedState: state,
    observedStateBasis: basis,
    owner: Object.freeze({ type: 'system', ref: 'assignments' }),
    capabilities: Object.freeze([]),
    relationshipIds: Object.freeze([]),
    eventLogRef: id,
    lastHealthReportId: null,
    versionCount: 1,
    confidence: hasCoreFields ? 1 : 0.5,
    observability: Object.freeze({ sensorId: ASSIGNMENT_SENSOR_ID, sensorVersion: ASSIGNMENT_SENSOR_VERSION, observedAt: now, since: null }),
    visibility: defaultVisibilityFor('assignment'),
    aiContextTags: Object.freeze([AI_CONTEXT_TAG.OPERATIONAL]),
    createdAt: now,
    updatedAt: now,
  });
}

/** Emits at most 2 edges — one per resolved FK. An unresolved name (no
 *  matching V1 record, e.g. a Self-Drive Assignment's empty `driver`)
 *  emits no edge for that side rather than a dangling/fabricated one. */
export function deriveAssignmentRelationships(a, { driverEntityId = null, vehicleEntityId = null } = {}) {
  const assignmentEntityId = generateEntityId({ entityType: 'assignment', sourceRef: a.id });
  const relationships = [];
  if (vehicleEntityId) {
    relationships.push(makeEntityRelationship({
      id: `${assignmentEntityId}:${ENTITY_RELATIONSHIP_TYPE.ASSIGNED_TO_VEHICLE}`,
      fromEntityId: assignmentEntityId, toEntityId: vehicleEntityId,
      type: ENTITY_RELATIONSHIP_TYPE.ASSIGNED_TO_VEHICLE,
      derivedFrom: { sensorId: ASSIGNMENT_SENSOR_ID, field: 'vehicle' },
    }));
  }
  if (driverEntityId) {
    relationships.push(makeEntityRelationship({
      id: `${assignmentEntityId}:${ENTITY_RELATIONSHIP_TYPE.ASSIGNED_TO_DRIVER}`,
      fromEntityId: assignmentEntityId, toEntityId: driverEntityId,
      type: ENTITY_RELATIONSHIP_TYPE.ASSIGNED_TO_DRIVER,
      derivedFrom: { sensorId: ASSIGNMENT_SENSOR_ID, field: 'driver' },
    }));
  }
  return relationships;
}
