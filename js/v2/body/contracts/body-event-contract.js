/* ============================================================
   BODY-EVENT-CONTRACT.JS — Body Intelligence (V2, Phase 12.5.1)

   PURPOSE: fix the shape of ONE BodyEvent — derived organizational
   telemetry, NOT the durable record of anything (the real record of "an
   assignment was created" is the assignment row in V1's
   `assignments/{id}`; a BodyEvent is a secondary, reconstructible-from-
   source observation trail). Same relationship learning/'s
   LearningEvent has to the facts it references — see
   repository/body-event-repository.js's header for why that means a
   simpler, non-swappable repository is the right choice here, not
   knowledge/'s full Memory+Null+registry machinery.

   RESPONSIBILITY: define BODY_EVENT_TYPE and BodyEvent.

   DEPENDENCIES: none.

   NON-GOALS: a BodyEvent is never revised — no appendVersion, no version
   field. Immutable facts, append-only by construction (a new event, never
   an edit to an old one).
   ============================================================ */

'use strict';

export const BODY_EVENT_SCHEMA = 'body-event@1';

export const BODY_EVENT_TYPE = Object.freeze({
  ENTITY_OBSERVED: 'entity_observed',         // a sensor read produced a new/changed Entity version
  STATE_CHANGED: 'state_changed',             // observedState differs from the prior version
  RELATIONSHIP_OBSERVED: 'relationship_observed',
  SENSE_FAILED: 'sense_failed',               // an honest, visible record of a sensor error — never a silent skip
});

/**
 * @typedef {Object} BodyEvent
 * @property {string} id
 * @property {string} type          - one of BODY_EVENT_TYPE
 * @property {string|null} entityId - null only for SENSE_FAILED (no entity was produced)
 * @property {string} entityType
 * @property {Object} detail        - small, structural (e.g. {fromState, toState}) — never prose
 * @property {string} sensorId
 * @property {string} observedAt    - ISO 8601. Body always standardizes on ISO here, regardless of the source V1 store's own timestamp format.
 */

let _counter = 0;
function nextDiscriminator() {
  _counter += 1;
  return `${Date.now()}:${_counter}`;
}

export function makeBodyEvent({ id = null, type, entityId = null, entityType, detail = {}, sensorId }) {
  return Object.freeze({
    id: id || `body-event:${type}:${entityType}:${nextDiscriminator()}`,
    type,
    entityId,
    entityType,
    detail: Object.freeze({ ...detail }),
    sensorId,
    observedAt: new Date().toISOString(),
  });
}

export function isBodyEvent(e) {
  return !!e && typeof e === 'object'
    && typeof e.id === 'string' && e.id.length > 0
    && typeof e.type === 'string' && Object.values(BODY_EVENT_TYPE).includes(e.type)
    && (e.entityId === null || typeof e.entityId === 'string')
    && typeof e.entityType === 'string' && e.entityType.length > 0
    && !!e.detail && typeof e.detail === 'object'
    && typeof e.sensorId === 'string' && e.sensorId.length > 0
    && typeof e.observedAt === 'string' && e.observedAt.length > 0;
}
