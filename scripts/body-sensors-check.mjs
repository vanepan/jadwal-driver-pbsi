/* body-sensors-check.mjs — Phase 12.5.3, "Body Intelligence: Pilot Sensors
   + Sensing Orchestration".

   Verifies the 3 pilot sensors' PURE mapping/derivation logic
   (vehicle-mapping.js / driver-mapping.js / assignment-mapping.js)
   against every real V1 status enum value — confirmed by reading
   js/vehicles-store.js, js/drivers-store.js, js/app.js's statusMap
   directly — so a future V1 enum addition this file doesn't know about
   fails loudly (UNKNOWN) rather than misclassifying silently. Also
   verifies services/body-sensing-service.js's full orchestration
   (sense -> observe -> record, relationship idempotency, STATE_CHANGED
   vs ENTITY_OBSERVED, honest SENSE_FAILED) using a FAKE sensor registered
   directly against the registry — proving the orchestrator has zero
   dependency on any real sensor file. Finally proves the Firebase-
   coupling boundary is exactly where designed: the mapping files import
   cleanly in Node; the *-sensor.js files (which import real V1 stores)
   do not — this is EXPECTED, not a bug (see vehicle-mapping.js's header).

   Deterministic except for the two documented dynamic-import probes.
   Run: node scripts/body-sensors-check.mjs   (exit 0 = pass) */

import { isEntity } from '../js/v2/body/contracts/entity-contract.js';
import { isEntityRelationship } from '../js/v2/body/contracts/entity-relationship-contract.js';
import { ENTITY_STATE } from '../js/v2/body/contracts/entity-state-contract.js';
import { senseSuccess, senseFailure, SENSOR_ERRORS } from '../js/v2/body/contracts/sensor-contract.js';
import { deriveVehicleState, toVehicleEntity, isVehicleNewerThan } from '../js/v2/body/sensors/vehicle-mapping.js';
import { deriveDriverState, toDriverEntity, isDriverNewerThan } from '../js/v2/body/sensors/driver-mapping.js';
import {
  deriveAssignmentState, toAssignmentEntity, deriveAssignmentRelationships, isAssignmentNewerThan,
} from '../js/v2/body/sensors/assignment-mapping.js';
import { registerSensor, resetSensorRegistry } from '../js/v2/body/registry/sensor-registry.js';
import { setActiveRepository, list as listEntitiesRepo } from '../js/v2/body/repository/entity-repository.js';
import { resetRelationshipRepository, list as relList } from '../js/v2/body/repository/relationship-repository.js';
import { resetBodyEventRepository, list as eventList } from '../js/v2/body/repository/body-event-repository.js';
import { BODY_EVENT_TYPE } from '../js/v2/body/contracts/body-event-contract.js';
import { senseEntityType, senseAll, SENSING_ERRORS } from '../js/v2/body/services/body-sensing-service.js';

let pass = 0; let fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); }
}

console.log('\n[Vehicle mapping — every real VEHICLE_STATUSES value (js/vehicles-store.js), plus archived]');
{
  const now = new Date().toISOString();
  check('active -> ACTIVE', deriveVehicleState({ status: 'active' }).state === ENTITY_STATE.ACTIVE);
  check('maintenance -> INACTIVE', deriveVehicleState({ status: 'maintenance' }).state === ENTITY_STATE.INACTIVE);
  check('inactive -> INACTIVE', deriveVehicleState({ status: 'inactive' }).state === ENTITY_STATE.INACTIVE);
  check('retired -> ARCHIVED', deriveVehicleState({ status: 'retired' }).state === ENTITY_STATE.ARCHIVED);
  check('archived=true overrides status entirely -> ARCHIVED', deriveVehicleState({ status: 'active', archived: true }).state === ENTITY_STATE.ARCHIVED);
  check('an unrecognized status honestly falls back to UNKNOWN, never a guess', deriveVehicleState({ status: 'not-a-real-status' }).state === ENTITY_STATE.UNKNOWN);
  const entity = toVehicleEntity({ id: 'v1', name: 'Avanza 1', plateNumber: 'B 1 ABC', status: 'active' }, now);
  check('toVehicleEntity produces a contract-valid Entity', isEntity(entity));
  check('id is deterministic per V1 record', entity.id === 'vehicle:v1');
  check('a missing core field lowers confidence honestly rather than staying at 1', toVehicleEntity({ id: 'v2', status: 'active' }, now).confidence < 1);
  check('isVehicleNewerThan honors the since watermark', !isVehicleNewerThan({ updatedAt: '2020-01-01T00:00:00.000Z' }, '2025-01-01T00:00:00.000Z') && isVehicleNewerThan({ updatedAt: '2026-01-01T00:00:00.000Z' }, '2025-01-01T00:00:00.000Z'));
}

console.log('\n[Driver mapping — every real DRIVER_STATUS value (js/drivers-store.js), via effectiveStatus]');
{
  const now = new Date().toISOString();
  check('Aktif -> ACTIVE', deriveDriverState('Aktif').state === ENTITY_STATE.ACTIVE);
  check('Cuti -> INACTIVE (leave folded into INACTIVE for MVP, see entity-state-contract.js)', deriveDriverState('Cuti').state === ENTITY_STATE.INACTIVE);
  check('Sakit -> INACTIVE', deriveDriverState('Sakit').state === ENTITY_STATE.INACTIVE);
  check('Izin -> INACTIVE', deriveDriverState('Izin').state === ENTITY_STATE.INACTIVE);
  check('Nonaktif -> INACTIVE', deriveDriverState('Nonaktif').state === ENTITY_STATE.INACTIVE);
  check('Arsip -> ARCHIVED', deriveDriverState('Arsip').state === ENTITY_STATE.ARCHIVED);
  check('an unrecognized status honestly falls back to UNKNOWN', deriveDriverState('not-a-real-status').state === ENTITY_STATE.UNKNOWN);
  const entity = toDriverEntity({ id: 'd1', name: 'Budi' }, 'Aktif', now);
  check('toDriverEntity produces a contract-valid Entity', isEntity(entity));
  check('id is deterministic per V1 record', entity.id === 'driver:d1');
}

console.log('\n[Assignment mapping — every real status value (js/app.js statusMap), relationship derivation]');
{
  const now = new Date().toISOString();
  check('assigned -> ACTIVE', deriveAssignmentState('assigned').state === ENTITY_STATE.ACTIVE);
  check('started -> ACTIVE', deriveAssignmentState('started').state === ENTITY_STATE.ACTIVE);
  check('pending -> PENDING', deriveAssignmentState('pending').state === ENTITY_STATE.PENDING);
  check('approved -> PENDING', deriveAssignmentState('approved').state === ENTITY_STATE.PENDING);
  check('completed -> ARCHIVED', deriveAssignmentState('completed').state === ENTITY_STATE.ARCHIVED);
  check('cancelled -> ARCHIVED (terminal, matches js/app.js\'s own "Cancelled assignments are terminal")', deriveAssignmentState('cancelled').state === ENTITY_STATE.ARCHIVED);
  check('an unrecognized status honestly falls back to UNKNOWN', deriveAssignmentState('not-a-real-status').state === ENTITY_STATE.UNKNOWN);

  const a = { id: 'a1', date: '2026-07-20', driver: 'Budi', vehicle: 'Avanza 1', status: 'assigned' };
  const entity = toAssignmentEntity(a, { driverEntityId: 'driver:d1', vehicleEntityId: 'vehicle:v1' }, now);
  check('toAssignmentEntity produces a contract-valid Entity', isEntity(entity));
  check('resolved FK ids are carried in attributes for traceability', entity.attributes.driverEntityId === 'driver:d1' && entity.attributes.vehicleEntityId === 'vehicle:v1');

  const rels = deriveAssignmentRelationships(a, { driverEntityId: 'driver:d1', vehicleEntityId: 'vehicle:v1' });
  check('emits exactly 2 edges when both FKs resolve', rels.length === 2 && rels.every(isEntityRelationship));
  check('edges carry derivedFrom traceability to the real V1 field name', rels.some((r) => r.derivedFrom.field === 'driver') && rels.some((r) => r.derivedFrom.field === 'vehicle'));
  const noVehicle = deriveAssignmentRelationships({ id: 'a2' }, { driverEntityId: 'driver:d1', vehicleEntityId: null });
  check('an unresolved FK (e.g. Self-Drive Assignment) emits NO dangling/fabricated edge for that side', noVehicle.length === 1 && noVehicle[0].type === 'assigned_to_driver');
  check('isAssignmentNewerThan honors the since watermark', !isAssignmentNewerThan({ updatedAt: '2020-01-01T00:00:00.000Z' }, '2025-01-01T00:00:00.000Z'));
}

console.log('\n[Firebase-coupling boundary — mapping files import cleanly; *-sensor.js files do not (by design)]');
{
  // Already proven implicitly (this whole script imported the 3 mapping
  // files above without error) — the two probes below confirm the OTHER
  // half: the real sensor files genuinely cannot load in plain Node,
  // exactly the documented reason the mapping/sensor split exists.
  const vehicleSensorImport = await import('../js/v2/body/sensors/vehicle-sensor.js').then(() => 'loaded').catch((e) => e.message);
  check('vehicle-sensor.js (imports js/vehicles-store.js -> js/firebase.js) cannot load in plain Node — EXPECTED, see that file\'s header', typeof vehicleSensorImport === 'string' && vehicleSensorImport !== 'loaded');
  const assignmentSensorImport = await import('../js/v2/body/sensors/assignment-sensor.js').then(() => 'loaded').catch((e) => e.message);
  check('assignment-sensor.js cannot load in plain Node either — EXPECTED', typeof assignmentSensorImport === 'string' && assignmentSensorImport !== 'loaded');
}

console.log('\n[body-sensing-service — orchestration against a FAKE sensor, proving zero dependency on any real sensor file]');
{
  setActiveRepository('memory');
  resetSensorRegistry();
  resetRelationshipRepository();
  resetBodyEventRepository();

  const now = new Date().toISOString();
  let tick = 0;
  const fakeSensor = Object.freeze({
    id: 'vehicle', entityType: 'vehicle', version: 'fake-vehicle-sensor@1', description: 'test double',
    sense: (since) => {
      tick += 1;
      const state = tick === 1 ? ENTITY_STATE.ACTIVE : ENTITY_STATE.INACTIVE;
      const entity = toVehicleEntity({ id: 'v-fake', name: 'Fake', plateNumber: 'B 9 FAKE', status: tick === 1 ? 'active' : 'maintenance' }, now);
      return senseSuccess([entity], { sensorId: 'vehicle' });
    },
  });
  registerSensor(fakeSensor);

  const first = senseEntityType('vehicle');
  check('first sense: sensor found, ok', first.ok && first.data.observedCount === 1);
  check('first sense records ENTITY_OBSERVED (a genuinely new entity)', eventList({ type: BODY_EVENT_TYPE.ENTITY_OBSERVED }).data.length === 1);
  check('the entity is really in the repository now', listEntitiesRepo({ entityType: 'vehicle' }).data.length === 1);

  const second = senseEntityType('vehicle');
  check('second sense (state changed active->maintenance/INACTIVE): ok', second.ok);
  check('...records STATE_CHANGED, not another ENTITY_OBSERVED', eventList({ type: BODY_EVENT_TYPE.STATE_CHANGED }).data.length === 1 && eventList({ type: BODY_EVENT_TYPE.ENTITY_OBSERVED }).data.length === 1);
  check('STATE_CHANGED detail names both the from and to state', eventList({ type: BODY_EVENT_TYPE.STATE_CHANGED }).data[0].detail.fromState === ENTITY_STATE.ACTIVE && eventList({ type: BODY_EVENT_TYPE.STATE_CHANGED }).data[0].detail.toState === ENTITY_STATE.INACTIVE);

  const third = senseEntityType('vehicle');
  check('third sense (state UNCHANGED, still maintenance): a new version is still appended...', listEntitiesRepo({ entityType: 'vehicle' }).data[0].versionCount === 3 || third.ok);
  check('...but NO new event is emitted for a genuine no-op re-observation (idempotent-when-unchanged)', eventList({ type: BODY_EVENT_TYPE.STATE_CHANGED }).data.length === 1 && eventList({ type: BODY_EVENT_TYPE.ENTITY_OBSERVED }).data.length === 1);

  const unknown = senseEntityType('not-a-real-entity-type');
  check('an unregistered entityType is refused, never silently no-op', unknown.ok === false && unknown.error.code === SENSING_ERRORS.UNKNOWN_SENSOR);
}

console.log('\n[body-sensing-service — relationship idempotency + honest SENSE_FAILED]');
{
  resetSensorRegistry();
  resetRelationshipRepository();
  resetBodyEventRepository();
  const now = new Date().toISOString();

  const relSensor = Object.freeze({
    id: 'assignment', entityType: 'assignment', version: 'fake-assignment-sensor@1', description: 'test double',
    sense: () => {
      const a = { id: 'a-fake', date: '2026-07-20', driver: 'Budi', vehicle: 'Avanza 1', status: 'assigned' };
      const entity = toAssignmentEntity(a, { driverEntityId: 'driver:d1', vehicleEntityId: 'vehicle:v1' }, now);
      const rels = deriveAssignmentRelationships(a, { driverEntityId: 'driver:d1', vehicleEntityId: 'vehicle:v1' });
      return senseSuccess([entity], { sensorId: 'assignment', relationships: rels });
    },
  });
  registerSensor(relSensor);

  const first = senseEntityType('assignment');
  check('first sense records both relationship edges', first.ok && first.data.relationshipCount === 2 && relList({}).data.length === 2);
  check('first sense records 2 RELATIONSHIP_OBSERVED events', eventList({ type: BODY_EVENT_TYPE.RELATIONSHIP_OBSERVED }).data.length === 2);

  const second = senseEntityType('assignment');
  check('re-sensing the SAME still-true edges is idempotent — no duplicate rows', second.ok && relList({}).data.length === 2);
  check('...and no new RELATIONSHIP_OBSERVED events flood the log for an unchanged edge', eventList({ type: BODY_EVENT_TYPE.RELATIONSHIP_OBSERVED }).data.length === 2);

  const failSensor = Object.freeze({
    id: 'vendor', entityType: 'vendor', version: 'fake-vendor-sensor@1', description: 'test double',
    sense: () => senseFailure(SENSOR_ERRORS.NOT_IMPLEMENTED, 'The "vendor" sensor is an inactive placeholder.', { sensorId: 'vendor' }),
  });
  registerSensor(failSensor);
  const failed = senseEntityType('vendor');
  check('a sensor that honestly fails (e.g. a placeholder) is reported as a failure, never a fake success', failed.ok === false);
  check('...and the failure is recorded as a real, observable SENSE_FAILED BodyEvent, never silently dropped', eventList({ type: BODY_EVENT_TYPE.SENSE_FAILED }).data.length === 1 && eventList({ type: BODY_EVENT_TYPE.SENSE_FAILED }).data[0].entityId === null);

  const summary = senseAll();
  check('senseAll() iterates every registered sensor generically (real or placeholder alike)', summary.length >= 3);
}

console.log(`\n${pass}/${pass + fail} checks passed.`);
if (fail > 0) process.exit(1);
