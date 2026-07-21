/* ============================================================
   RECOGNITION-CLASSIFICATION-CONTRACT.JS — Recognition Foundation (Phase 12.7.1)

   PURPOSE: fix the payload shape for RECORD_TYPE.CLASSIFICATION — a
   suggestion for a document/entity's `domainType`/`kind`/NOR-Type, drawn
   ONLY from already-registered vocabulary (knowledge/registry/
   domain-type-registry.js, kind-registry.js, nor-type-registry.js — never
   a new, invented category). Populated for real by Sprint 12.7.2
   (Autonomous Classification), the one genuinely new capability this
   phase adds (confirmed absent by direct audit of the existing codebase —
   see docs/PHASE_12_SPRINT_12_7_APPLE_PHOTOS_LEARNING.md §1).

   Mirrors recommendation-evidence-contract.js's own precedent: this
   contract predates any real producer, exactly as that file predated any
   real recommendation engine ("V2.0.12 produces zero RecommendationEvidence
   instances in production code... mirrors how connector-contract.js
   predated any real connector"). Recognition Foundation is schema-first,
   same as every prior domain's Foundation sprint.

   RESPONSIBILITY: define RecognitionClassificationPayload.

   DEPENDENCIES: none.

   NON-GOALS: does not classify anything. Does not validate against the
   registries named above at the CONTRACT layer — that check belongs to
   the classification engine itself (Sprint 12.7.2), the same
   "registry-backed, checked by the engine/repository, never by the bare
   contract" split knowledge-item-contract.js already draws for
   domainType/kind.
   ============================================================ */

'use strict';

export const RECOGNITION_CLASSIFICATION_SCHEMA = 'recognition-classification@1';

/**
 * @typedef {Object} RecognitionClassificationPayload
 * @property {string|null} suggestedDomainType   - must resolve against knowledge/registry/domain-type-registry.js when present
 * @property {string|null} suggestedKind         - must resolve against knowledge/registry/kind-registry.js when present
 * @property {string|null} suggestedNorType      - must resolve against knowledge/registry/nor-type-registry.js when present; only meaningful when suggestedDomainType === 'nor'
 */

export function isRecognitionClassificationPayload(p) {
  return !!p && typeof p === 'object'
    && (p.suggestedDomainType === null || (typeof p.suggestedDomainType === 'string' && p.suggestedDomainType.length > 0))
    && (p.suggestedKind === null || (typeof p.suggestedKind === 'string' && p.suggestedKind.length > 0))
    && (p.suggestedNorType === null || (typeof p.suggestedNorType === 'string' && p.suggestedNorType.length > 0))
    // At least one real suggestion, or this is not a classification at all —
    // an all-null payload is the engine's job to represent as an honest
    // abstention (never persisted), not this contract's job to forbid.
    && (p.suggestedDomainType !== null || p.suggestedKind !== null || p.suggestedNorType !== null);
}
