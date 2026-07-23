/* ============================================================
   RECOGNITION-RECORD-CONTRACT.JS — Recognition Foundation (Phase 12.7.1)

   PURPOSE: the ONE envelope every Recognition finding is stored as —
   mirrors knowledge/contracts/knowledge-item-contract.js's role exactly
   (a domain-agnostic envelope whose `payload` shape depends on a
   discriminant field). Recognition deliberately does NOT get one
   repository per finding type (Signature/Cluster/Relationship/
   Classification/Recommendation) — that would be the registry/repository
   proliferation this platform's own "never duplicate" discipline forbids.
   One record shape, one repository (./repository/recognition-repository.js),
   `recordType` decides what `payload` means, exactly the way `kind`
   decides what a KnowledgeItem's `payload` means.

   RESPONSIBILITY: define RECORD_TYPE and the RecognitionRecord shape.

   DEPENDENCIES: ./recognition-scope-contract.js,
   knowledge/contracts/evidence-contract.js (a precedented pure-leaf
   reuse — Evidence is already domain-agnostic and already has two
   registered-but-unproduced kinds, STATISTIC and RELATIONSHIP, this
   platform's own contract header names as waiting for a real producer;
   see recognition-cluster-contract.js and recognition-relationship-
   contract.js for where Recognition becomes exactly that).

   NON-GOALS: this file does not decide HOW a record is produced (that is
   every later sprint's engine) or HOW it is approved (Recognition
   Recommendations ride Knowledge's existing review workflow — see
   recognition-classification-contract.js's header — Recognition itself
   has no lifecycle/ directory of its own, the same "never invent a second
   human-gate" restraint body/ already established for Entities).
   ============================================================ */

'use strict';

import { isEvidenceList } from '../../../../src/knowledge/contracts/evidence-contract.js';
import { isRecognitionScope } from './recognition-scope-contract.js';

export const RECOGNITION_RECORD_SCHEMA = 'recognition-record@1';

/** What KIND of Recognition finding a record represents — registry-backed
 *  in spirit (each value also has its own dedicated registry file for any
 *  finer sub-vocabulary, e.g. signatureType/relationshipType), but the
 *  five top-level record types themselves are a small, closed, structural
 *  set — the same "closed enum for the outer shape, open registry for the
 *  inner vocabulary" split knowledge-item-contract.js draws between its
 *  fixed field list and its registry-backed `domainType`/`kind` values. */
export const RECORD_TYPE = Object.freeze({
  SIGNATURE: 'signature',
  CLUSTER: 'cluster',
  RELATIONSHIP: 'relationship',
  CLASSIFICATION: 'classification',
  RECOMMENDATION: 'recommendation',
});

/**
 * @typedef {Object} RecognitionRecord
 * @property {string} id
 * @property {number} version
 * @property {string} recordType        - one of RECORD_TYPE
 * @property {import('./recognition-scope-contract.js').RecognitionScope} scope
 * @property {object} payload           - shape depends on recordType, see the sibling *-contract.js files
 * @property {number} confidence        - 0–1
 * @property {import('../../../../src/knowledge/contracts/evidence-contract.js').Evidence[]} evidence - may be empty (an honest "not enough evidence yet" is a real state, not an error)
 * @property {{producerId: string, computedAt: string}} provenance - WHICH engine/extractor produced this, and when — Recognition Ownership, see recognition-service.js's header
 * @property {string} createdAt         - ISO 8601
 * @property {string} updatedAt         - ISO 8601
 */

export function isRecognitionRecord(r) {
  return !!r && typeof r === 'object'
    && typeof r.id === 'string' && r.id.length > 0
    && typeof r.version === 'number' && r.version >= 1
    && Object.values(RECORD_TYPE).includes(r.recordType)
    && isRecognitionScope(r.scope)
    && !!r.payload && typeof r.payload === 'object'
    && typeof r.confidence === 'number' && r.confidence >= 0 && r.confidence <= 1
    && isEvidenceList(r.evidence)
    && !!r.provenance && typeof r.provenance.producerId === 'string' && r.provenance.producerId.length > 0
    && typeof r.provenance.computedAt === 'string' && r.provenance.computedAt.length > 0
    && typeof r.createdAt === 'string' && r.createdAt.length > 0
    && typeof r.updatedAt === 'string' && r.updatedAt.length > 0;
}
