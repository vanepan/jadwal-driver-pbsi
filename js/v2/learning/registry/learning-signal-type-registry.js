/* ============================================================
   LEARNING-SIGNAL-TYPE-REGISTRY.JS — Universal Learning Engine (Phase 12.6.1)

   PURPOSE: make `signalType` a registered vocabulary value instead of a
   hardcoded switch — the fix domain-type-registry.js already applies to
   `domainType` and entity-type-registry.js applies to `entityType`,
   applied here to close LEARNING_KIND's own extensibility gap (a closed,
   hardcoded 5-value enum — confirmed by reading
   contracts/learning-event-contract.js — unlike every other closed-vs-open
   vocabulary in this platform). Each entry declares which of the SIX real
   LEARNING_KIND values (five original + Phase 12.6's OBSERVATION) its
   signal structurally IS, forcing every producer to be honest rather than
   fudging e.g. a Body state-change into CORRECTION because CORRECTION was
   the nearest pre-existing bucket.

   RESPONSIBILITY: register/list/check/resolve signalType ids, their
   labels, their owningDomain, and their mapsToKind. Vocabulary only, no
   logic.

   DEPENDENCIES: contracts/learning-event-contract.js (LEARNING_KIND, for
   the registration-time validity check only).

   NON-GOALS: registering a signalType here does NOT gate
   emitLearningSignal() — an UNREGISTERED signalType is still accepted,
   defaulting to kind:OBSERVATION (see learning-signal-service.js's
   header). Registration is optional, enriching metadata, never a hard
   gate — the same "unregistered = unknown, not distrusted" rule
   knowledge/contracts/source-weight-contract.js already establishes,
   applied here to avoid forcing pluggability nobody asked for onto a
   domain that would rather just call emitLearningSignal() directly with a
   plain seed (see the Phase 12.6 plan's §11(e)).

   FUTURE EVOLUTION: a real producer claiming one of the 8 bootstrapped
   dormant entries below re-registers it with a real `owningDomain`
   (idempotent per id — re-registering replaces the entry). A brand new
   signalType a future domain invents is a new registerSignalType() call,
   never a change to this file's shape.
   ============================================================ */

'use strict';

import { LEARNING_KIND } from '../contracts/learning-event-contract.js';

export const SIGNAL_TYPE_REGISTRY_ERRORS = Object.freeze({
  INVALID_MAPS_TO_KIND: 'INVALID_MAPS_TO_KIND',
});

/** @type {Map<string, {id: string, label: string, owningDomain: string|null, mapsToKind: string}>} */
const _signalTypes = new Map();

/**
 * @param {string} id
 * @param {{label: string, owningDomain: string|null, mapsToKind: string}} meta
 */
export function registerSignalType(id, { label, owningDomain = null, mapsToKind }) {
  if (typeof id !== 'string' || !id) throw new Error('registerSignalType: id must be a non-empty string');
  if (typeof label !== 'string' || !label) throw new Error('registerSignalType: label must be a non-empty string');
  if (!Object.values(LEARNING_KIND).includes(mapsToKind)) {
    const err = new Error(`registerSignalType: "${mapsToKind}" is not a real LEARNING_KIND.`);
    err.code = SIGNAL_TYPE_REGISTRY_ERRORS.INVALID_MAPS_TO_KIND;
    throw err;
  }
  _signalTypes.set(id, Object.freeze({ id, label, owningDomain, mapsToKind }));
}

export function hasSignalType(id) {
  return _signalTypes.has(id);
}

export function getSignalType(id) {
  return _signalTypes.get(id) || null;
}

export function listSignalTypes() {
  return Object.freeze([..._signalTypes.values()]);
}

/** Test/teardown helper. Not used by any runtime path. */
export function resetSignalTypeRegistry() {
  _signalTypes.clear();
  bootstrap();
}

/* ── bootstrap: the 8 future-discovery categories the Phase 12.6 mission
   names verbatim, registered as DORMANT vocabulary — documented, listable,
   zero real producers yet (owningDomain: null until something real claims
   one). Mirrors knowledge/'s "1 real connector + 11 placeholders" and
   body/'s "3 real sensors + 16 placeholders" precedent: vocabulary is
   registered ahead of any real producer, honestly labeled as such. ────── */
function bootstrap() {
  registerSignalType('repeated_correction', { label: 'Repeated Correction', mapsToKind: LEARNING_KIND.PATTERN });
  registerSignalType('user_behavior', { label: 'User Behavior', mapsToKind: LEARNING_KIND.OBSERVATION });
  registerSignalType('operational_habit', { label: 'Operational Habit', mapsToKind: LEARNING_KIND.OBSERVATION });
  registerSignalType('workflow_outcome', { label: 'Workflow Outcome', mapsToKind: LEARNING_KIND.OBSERVATION });
  registerSignalType('entity_relationship_recurrence', { label: 'Recurring Entity Relationship', mapsToKind: LEARNING_KIND.PATTERN });
  registerSignalType('document_structure_recurrence', { label: 'Recurring Document Structure', mapsToKind: LEARNING_KIND.PATTERN });
  registerSignalType('implicit_business_rule', { label: 'Implicit Business Rule', mapsToKind: LEARNING_KIND.OBSERVATION });
  registerSignalType('emerging_knowledge', { label: 'Emerging Knowledge', mapsToKind: LEARNING_KIND.OBSERVATION });
}

bootstrap();
