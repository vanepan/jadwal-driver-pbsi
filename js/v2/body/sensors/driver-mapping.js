/* ============================================================
   DRIVER-MAPPING.JS — Body Intelligence Sensor logic (V2, Phase 12.5.3)

   PURPOSE: the PURE mapping/derivation logic driver-sensor.js's `sense()`
   uses — split out for the identical reason vehicle-mapping.js is (see
   that file's header): js/drivers-store.js transitively imports
   js/firebase.js's `https://` CDN Firebase SDK, unresolvable by Node's
   ESM loader, so this must be a separate, dependency-free, Node-testable
   file.

   `deriveDriverState` takes an already-resolved `effectiveStatus` string
   as a parameter (rather than importing js/drivers-store.js's
   `effectiveStatus()` function itself) precisely so this file has ZERO
   V1 dependency — driver-sensor.js is the one place that calls the real
   `effectiveStatus()` and passes its result in.

   RESPONSIBILITY: deriveDriverState, toDriverEntity, isDriverNewerThan.

   DEPENDENCIES: contracts/{identity,entity-state,entity-vocabulary}-contract.js only.
   ============================================================ */

'use strict';

import { generateEntityId } from '../contracts/identity-contract.js';
import { ENTITY_STATE } from '../contracts/entity-state-contract.js';
import { CAPABILITY, AI_CONTEXT_TAG, defaultVisibilityFor } from '../contracts/entity-vocabulary-contract.js';

export const DRIVER_SENSOR_ID = 'driver';
export const DRIVER_SENSOR_VERSION = 'driver-sensor@1';

/** Data table over the real V1 DRIVER_STATUS enum (js/drivers-store.js:
 *  Aktif/Cuti/Sakit/Izin/Nonaktif/Arsip). Cuti/Sakit/Izin (leave) are
 *  folded into INACTIVE for the MVP enum — see
 *  contracts/entity-state-contract.js's header for why a type-specific
 *  "on leave" sub-state is deferred, not promoted to a new top-level
 *  ENTITY_STATE value.
 *  @param {string} effectiveStatus - the already-resolved value of
 *    js/drivers-store.js#effectiveStatus(driver) — reused, not
 *    reimplemented (it already accounts for a leave period whose `end`
 *    has passed). */
export function deriveDriverState(effectiveStatus) {
  if (effectiveStatus === 'Aktif') return { state: ENTITY_STATE.ACTIVE, basis: "drivers.effectiveStatus='Aktif'" };
  if (effectiveStatus === 'Cuti' || effectiveStatus === 'Sakit' || effectiveStatus === 'Izin') {
    return { state: ENTITY_STATE.INACTIVE, basis: `drivers.effectiveStatus='${effectiveStatus}' (leave)` };
  }
  if (effectiveStatus === 'Nonaktif') return { state: ENTITY_STATE.INACTIVE, basis: "drivers.effectiveStatus='Nonaktif'" };
  if (effectiveStatus === 'Arsip') return { state: ENTITY_STATE.ARCHIVED, basis: "drivers.effectiveStatus='Arsip'" };
  return { state: ENTITY_STATE.UNKNOWN, basis: `drivers.effectiveStatus='${effectiveStatus}' (unrecognized — see this file's derivation table)` };
}

export function isDriverNewerThan(driver, since) {
  if (!since) return true;
  const updatedIso = new Date(driver.updatedAt || driver.createdAt || 0).toISOString();
  return updatedIso > since;
}

export function toDriverEntity(driver, effectiveStatusValue, now) {
  const id = generateEntityId({ entityType: 'driver', sourceRef: driver.id });
  const { state, basis } = deriveDriverState(effectiveStatusValue);
  const hasCoreFields = !!driver.name;
  return Object.freeze({
    id,
    version: 1,
    entityType: 'driver',
    sourceRef: driver.id,
    attributes: Object.freeze({
      name: driver.name || '', phone: driver.phone || '',
      onLeave: !!driver.leave, sourceCreatedAt: driver.createdAt || null, sourceUpdatedAt: driver.updatedAt || null,
    }),
    observedState: state,
    observedStateBasis: basis,
    owner: Object.freeze({ type: 'system', ref: 'drivers-store' }),
    capabilities: Object.freeze(state === ENTITY_STATE.ACTIVE ? [CAPABILITY.ASSIGNABLE] : []),
    relationshipIds: Object.freeze([]),
    eventLogRef: id,
    lastHealthReportId: null,
    versionCount: 1,
    confidence: hasCoreFields ? 1 : 0.5,
    observability: Object.freeze({ sensorId: DRIVER_SENSOR_ID, sensorVersion: DRIVER_SENSOR_VERSION, observedAt: now, since: null }),
    visibility: defaultVisibilityFor('driver'),
    aiContextTags: Object.freeze([AI_CONTEXT_TAG.OPERATIONAL]),
    createdAt: now,
    updatedAt: now,
  });
}
