/* ============================================================
   LEARNING-EMISSION-SERVICE.JS — Continuous Learning Refinement (Phase 12.7.6)

   PURPOSE: activate two ALREADY-REGISTERED, previously-dormant Learning
   Signal categories from Phase 12.6.1 — `document_structure_recurrence`
   ("Recurring Document Structure") and `entity_relationship_recurrence`
   ("Recurring Entity Relationship") — which name, almost verbatim, what
   Sprints 12.7.4 (Structural Clustering) and 12.7.5 (Relationship
   Discovery) produce. This is NOT new integration design: Phase 12.6's
   own signal-type registry bootstrapped these 8 categories as honest,
   dormant vocabulary, waiting for exactly this kind of producer (see
   registry/learning-signal-type-registry.js's header: "vocabulary is
   registered ahead of any real producer, honestly labeled as such").
   This sprint makes Recognition their first real one.

   NO BRIDGE DOMAIN NEEDED, UNLIKE BODY. `body/` required
   `learning-bridge/` (Phase 12.6.6) specifically because `body/README.md`
   forbids `body/` from ever depending on ANY engine or service in
   `learning/` — Body must stay a pure, zero-write read model. Recognition
   carries no such constraint (see js/v2/recognition/README.md §1):
   Recognition is already editorial, exactly like `knowledge/` and
   `organizational-memory/`, both of which already call `learning/`
   directly — this file calls `learning/services/learning-signal-
   service.js#emitLearningSignal()` the SAME legal way they do, as the
   15th real caller of an already-generic entry point, not a 16th bespoke
   mechanism.

   SOURCE TYPE: 'pattern-discovery' (learning-source-weight-registry.js's
   own existing, bootstrapped weight, 0.7) — reused, not a new weight-
   table entry invented for Recognition, because Recognition's findings
   genuinely ARE pattern discovery in the sense that registry already
   names, not a distinct kind of evidence needing its own weight.

   TARGETKEY: scoped to the RecognitionRecord's OWN id
   (`recognition:<recordId>`), not the coarser domain scope
   emitLearningSignal() would otherwise default to — so re-observing the
   SAME cluster/relationship supersedes its own prior Learning Signal
   (never accumulates unboundedly), while two DIFFERENT clusters/
   relationships in the same domainType each get their own, independent
   Learning lineage. Verified, not assumed — see this sprint's own check
   script.

   RESPONSIBILITY: emitRecognitionLearningSignal(record, opts).

   DEPENDENCIES: learning/services/learning-signal-service.js
   (emitLearningSignal — call only, never learning-repository.js
   directly, the same restriction learning-bridge/ observes for a
   different reason).

   NON-GOALS: NOT auto-invoked from clustering-service.js or
   graph-service.js — this function is real, tested, and directly
   callable, but nothing in this phase calls it automatically on every
   recordClusters()/recordDiscoveredRelationships(). Whether Recognition
   should live-wire into Learning automatically, or stay a deliberate,
   human/operator-triggered action, is Open Question 2 in
   docs/PHASE_12_SPRINT_12_7_APPLE_PHOTOS_LEARNING.md — the same
   "structurally complete, zero live callers, wiring deferred" precedent
   body/'s own bridge shipped under (Phase 12.6.6: "No scheduler or cron
   trigger for the Body bridge").
   ============================================================ */

'use strict';

import { emitLearningSignal } from '../../../../src/learning/services/learning-signal-service.js';

export const RECOGNITION_LEARNING_SIGNAL_TYPE = Object.freeze({
  cluster: 'document_structure_recurrence',
  relationship: 'entity_relationship_recurrence',
});

export const LEARNING_EMISSION_ERRORS = Object.freeze({
  NO_SIGNAL_TYPE_FOR_RECORD_TYPE: 'NO_SIGNAL_TYPE_FOR_RECORD_TYPE',
});

/**
 * @param {import('../contracts/recognition-record-contract.js').RecognitionRecord} record
 * @param {{actorId?: string}} [opts]
 * @returns {{ok: boolean, data: object|null, error: object|null, op: string|null}}
 */
export function emitRecognitionLearningSignal(record, { actorId = 'recognition-platform' } = {}) {
  const signalType = RECOGNITION_LEARNING_SIGNAL_TYPE[record.recordType];
  if (!signalType) {
    return {
      ok: false,
      data: null,
      error: Object.freeze({
        code: LEARNING_EMISSION_ERRORS.NO_SIGNAL_TYPE_FOR_RECORD_TYPE,
        message: `Recognition record type "${record.recordType}" has no corresponding Learning Signal category — only 'cluster' and 'relationship' are wired this sprint.`,
      }),
      op: null,
    };
  }

  const result = emitLearningSignal({
    domainType: record.scope.domainType,
    entityType: record.scope.entityType,
    entityId: record.scope.entityId,
    signalType,
    sourceType: 'pattern-discovery',
    actorId,
    after: record.payload,
    sourceDocumentId: null,
    affectedKnowledgeId: null,
    evidence: { recognitionRecordId: record.id, recognitionConfidence: record.confidence },
    // Scoped to THIS record's own id — see this file's header on why.
    targetKey: `recognition:${record.id}`,
  });

  return { ok: result.ok, data: result.data, error: result.error, op: result.op };
}
