/* ============================================================
   VEHICLE-MAPPING.JS — Body Intelligence Sensor logic (V2, Phase 12.5.3)

   PURPOSE: the PURE mapping/derivation logic vehicle-sensor.js's `sense()`
   uses — split into its own dependency-free file specifically so it is
   Node-testable, mirroring the split js/services/vehicle-asset-service.js
   already draws for itself ("PURE: no DOM, no Firebase, no window.
   Node-testable" — it takes a `vehicle` object as a parameter rather than
   importing the store). js/vehicles-store.js transitively imports
   js/firebase.js, which imports the Firebase SDK from an `https://` CDN
   URL Node's ESM loader cannot resolve (confirmed: `node -e
   "import('./js/vehicles-store.js')"` throws
   ERR_UNSUPPORTED_ESM_URL_SCHEME) — so ANY file that imports
   vehicles-store.js at module scope cannot be imported by a plain Node
   check script, regardless of whether the Firebase-touching function is
   ever called. Splitting the derivation table out here is what makes
   scripts/body-sensors-check.mjs able to assert every real V1
   VEHICLE_STATUSES value maps to something, per the Phase 12.5 plan's
   explicit sprint 12.5.3 commitment ("a future V1 status addition fails a
   Body test loudly instead of misclassifying silently").

   RESPONSIBILITY: deriveVehicleState, toVehicleEntity, isVehicleNewerThan.

   DEPENDENCIES: contracts/{identity,entity-state,entity-vocabulary}-contract.js only.

   NON-GOALS: does not read js/vehicles-store.js. Does not register
   anything.
   ============================================================ */

'use strict';

import { generateEntityId } from '../contracts/identity-contract.js';
import { ENTITY_STATE } from '../contracts/entity-state-contract.js';
import { CAPABILITY, AI_CONTEXT_TAG, defaultVisibilityFor } from '../contracts/entity-vocabulary-contract.js';

export const VEHICLE_SENSOR_ID = 'vehicle';
export const VEHICLE_SENSOR_VERSION = 'vehicle-sensor@1';

/** Data table, not a switch — the real V1 VEHICLE_STATUSES enum
 *  (js/vehicles-store.js: active/maintenance/inactive/retired) mapped to
 *  the 5-value ENTITY_STATE. `archived` is checked first: a separate V1
 *  field that can be true regardless of `status`, and represents a
 *  stronger, terminal fact. */
export function deriveVehicleState(v) {
  if (v.archived === true) return { state: ENTITY_STATE.ARCHIVED, basis: 'vehicles.archived=true' };
  const status = v.status;
  if (status === 'active') return { state: ENTITY_STATE.ACTIVE, basis: "vehicles.status='active'" };
  if (status === 'maintenance' || status === 'inactive') return { state: ENTITY_STATE.INACTIVE, basis: `vehicles.status='${status}'` };
  if (status === 'retired') return { state: ENTITY_STATE.ARCHIVED, basis: "vehicles.status='retired'" };
  return { state: ENTITY_STATE.UNKNOWN, basis: `vehicles.status='${status}' (unrecognized — see this file's derivation table)` };
}

export function isVehicleNewerThan(v, since) {
  if (!since) return true;
  const updatedIso = new Date(v.updatedAt || v.createdAt || 0).toISOString();
  return updatedIso > since;
}

export function toVehicleEntity(v, now) {
  const id = generateEntityId({ entityType: 'vehicle', sourceRef: v.id });
  const { state, basis } = deriveVehicleState(v);
  const hasCoreFields = !!(v.name && v.plateNumber);
  return Object.freeze({
    id,
    version: 1,
    entityType: 'vehicle',
    sourceRef: v.id,
    attributes: Object.freeze({
      name: v.name || '', plateNumber: v.plateNumber || '', capacity: v.capacity ?? null,
      type: v.type || 'mobil', color: v.color || null,
      sourceCreatedAt: v.createdAt || null, sourceUpdatedAt: v.updatedAt || null,
    }),
    observedState: state,
    observedStateBasis: basis,
    owner: Object.freeze({ type: 'system', ref: 'vehicles-store' }),
    capabilities: Object.freeze(state === ENTITY_STATE.ACTIVE ? [CAPABILITY.ASSIGNABLE] : []),
    relationshipIds: Object.freeze([]),
    eventLogRef: id,
    lastHealthReportId: null,
    versionCount: 1,
    confidence: hasCoreFields ? 1 : 0.5,
    observability: Object.freeze({ sensorId: VEHICLE_SENSOR_ID, sensorVersion: VEHICLE_SENSOR_VERSION, observedAt: now, since: null }),
    visibility: defaultVisibilityFor('vehicle'),
    aiContextTags: Object.freeze([AI_CONTEXT_TAG.OPERATIONAL]),
    createdAt: now,
    updatedAt: now,
  });
}
