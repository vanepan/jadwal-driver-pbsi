/* ============================================================
   SENSOR-CONTRACT.JS — Body Intelligence (V2, Phase 12.5.1)

   PURPOSE: fix the one shape every Sensor conforms to. Structurally a
   Sensor is a CONNECTOR (knowledge/contracts/connector-contract.js), not
   an ai-foundation Adapter — every real Sensor runs simultaneously (one
   per entityType), unlike ai-foundation's one-active-adapter-at-a-time
   model, so this mirrors connector-contract.js's shape, not
   adapter-contract.js's.

   RESPONSIBILITY: define the Sensor shape and its result contract.

   DEPENDENCIES: none. A REAL sensor (Phase 12.5.3) reads V1 read-only
   through *-store.js getters, but this contract file itself has zero V1
   dependency — same discipline connector-contract.js documents for
   itself.

   NON-GOALS: no sensor is implemented here. `sense()` is never called by
   this file. Every sensor is read-only over V1 — a sensor that writes
   back into V1 violates this contract by construction (mirrors
   connector-contract.js's own "Core Operations never depends on
   Intelligence" boundary).

   FUTURE EVOLUTION: registry/sensor-registry.js is where real sensors
   register once implemented; this contract is what `isSensor()` checks
   against.
   ============================================================ */

'use strict';

export const SENSOR_SCHEMA = 'body-sensor@1';

export const SENSOR_ERRORS = Object.freeze({
  SENSE_FAILED: 'SENSE_FAILED',
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
});

/**
 * @typedef {Object} Sensor
 * @property {string} id            - unique sensor id, usually === entityType
 * @property {string} entityType    - registry-backed
 * @property {string} version
 * @property {string} description
 * @property {(since: string|null) => SensorResult} sense
 *   - `since` is an ISO 8601 watermark or null for a full read.
 */

/**
 * @typedef {Object} SensorResult
 * @property {boolean} ok
 * @property {import('./entity-contract.js').Entity[]|null} entities
 * @property {import('./entity-relationship-contract.js').EntityRelationship[]} relationships - derived edges emitted alongside the entities, [] default
 * @property {{code: string, message: string}|null} error
 * @property {string} sensorId
 * @property {import('../../knowledge/observability/contracts/warning-contract.js').KnowledgeWarning[]} warnings
 *   - reused, not reimplemented — same precedented pure-leaf-utility reuse
 *     as contracts/identity-contract.js#nextVersion (see that file's
 *     header). Non-fatal, per-record problems that did not fail the sense
 *     as a whole.
 */

export const SENSOR_CONTRACT = Object.freeze({
  schema: SENSOR_SCHEMA,
  sensor: Object.freeze(['id', 'entityType', 'version', 'description', 'sense']),
  result: Object.freeze(['ok', 'entities', 'relationships', 'error', 'sensorId', 'warnings']),
  errorCodes: SENSOR_ERRORS,
});

/** A successful sense. Every emitted Entity MUST already satisfy isEntity(). */
export function senseSuccess(entities, { sensorId, relationships = [], warnings = [] } = {}) {
  return Object.freeze({
    ok: true,
    entities: Object.freeze(entities ?? []),
    relationships: Object.freeze(relationships ?? []),
    error: null,
    sensorId: sensorId ?? null,
    warnings: Object.freeze(warnings ?? []),
  });
}

/** A predictable sense failure. Sensors return this instead of throwing. */
export function senseFailure(code, message, { sensorId } = {}) {
  return Object.freeze({
    ok: false,
    entities: null,
    relationships: Object.freeze([]),
    error: Object.freeze({ code, message }),
    sensorId: sensorId ?? null,
    warnings: Object.freeze([]),
  });
}

/** Structural check that an object satisfies the Sensor contract. */
export function isSensor(s) {
  return !!s && typeof s === 'object'
    && typeof s.id === 'string' && s.id.length > 0
    && typeof s.entityType === 'string' && s.entityType.length > 0
    && typeof s.version === 'string' && s.version.length > 0
    && typeof s.sense === 'function';
}
