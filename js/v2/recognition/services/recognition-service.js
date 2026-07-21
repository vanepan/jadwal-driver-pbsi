/* ============================================================
   RECOGNITION-SERVICE.JS — Recognition Foundation (Phase 12.7.1)

   PURPOSE: the ONE owner of the Recognition Repository — mirrors
   body/services/entity-service.js's role and shape almost exactly
   (trimmed to what Recognition actually needs: no review/promotion gate
   of its own — a Recognition Recommendation rides Knowledge's EXISTING
   review workflow once promoted, never a new one Recognition invents).
   The single legitimate caller of repository/recognition-repository.js's
   `create`/`appendVersion` — enforced by
   scripts/recognition-ownership-check.mjs (Sprint 12.7.7), the same
   enforcement pattern scripts/body-ownership-check.mjs already
   establishes.

   RESPONSIBILITY: `recordObservation(candidate)` — the create-or-append
   reconciliation every later sprint's engine (signature extraction,
   classification, similarity, clustering, relationship discovery) goes
   through: a brand new record id becomes a version-1 RecognitionRecord;
   an id already known becomes a new appended version, never an
   overwrite/duplicate — this IS "Recognition Memory" and "Recognition
   Version" from the brief, realized as the same append-only discipline
   every other domain in this platform already has, not a new mechanism.
   Plus thin read passthroughs, and `explainRecognition(id)` — "Recognition
   Explanation" — a fixed, small set of questions answered from a record's
   own already-stored fields only (cite-or-abstain: a field with no real
   answer is null, never invented), mirroring knowledge/explainability/
   knowledge-explainability-engine.js's five-fixed-questions idiom, but
   asking Recognition's own three questions instead — see its own header
   for why this is a deliberately separate, disambiguated explainability
   surface, not a fourth call into knowledge-explainability-engine.js
   (that engine is hardcoded to KnowledgeItem's own provenance/approvedBy/
   approvedAt fields, none of which a RecognitionRecord has).

   `makeRecognitionRecordId(recordType, scope)` is a small, OPTIONAL
   convenience for the common single-scope case (Signature, Classification)
   — mirrors identity-contract.js#generateKnowledgeId's deterministic
   template-string idiom exactly, so re-observing the same (recordType,
   scope) pair reconciles via appendVersion instead of silently
   duplicating. Cluster/Relationship engines (Sprints 12.7.4/12.7.5) mint
   their own id from their own membership, the same way each Knowledge
   connector decides its own sourceRef — this service does not mandate a
   single id scheme for every recordType, only for the case where one is
   obviously already spoken for.

   DEPENDENCIES: repository/recognition-repository.js,
   contracts/{recognition-record,recognition-scope}-contract.js.

   NON-GOALS: does not call an extractor, classifier, similarity strategy,
   or clustering/graph engine — that is every later sprint's own
   orchestration job (mirrors body-sensing-service.js's equivalent
   restraint in Phase 12.5.3). Does not decide WHEN to re-observe.
   ============================================================ */

'use strict';

import {
  getById as repoGetById, list as repoList, create as repoCreate,
  appendVersion as repoAppendVersion, getHistory as repoGetHistory, getMetrics as repoGetMetrics,
  setActiveRepository, getActiveRepositoryId,
} from '../repository/recognition-repository.js';
import { REPOSITORY_ERRORS } from '../repository/contracts/repository-contract.js';
import { isRecognitionRecord } from '../contracts/recognition-record-contract.js';
import { scopeKey } from '../contracts/recognition-scope-contract.js';

export const RECOGNITION_SERVICE_ERRORS = Object.freeze({
  INVALID_CANDIDATE: 'INVALID_CANDIDATE',
});

function failure(code, message) { return Object.freeze({ ok: false, data: null, error: Object.freeze({ code, message }) }); }

/** Deterministic id for the common single-scope record types (SIGNATURE,
 *  CLASSIFICATION) — optional; Cluster/Relationship engines mint their
 *  own (see this file's header). */
export function makeRecognitionRecordId(recordType, scope) {
  if (typeof recordType !== 'string' || !recordType) throw new Error('makeRecognitionRecordId: recordType is required.');
  return `${recordType}:${scopeKey(scope)}`;
}

/**
 * Create-or-append reconciliation. `candidate` is a full, version-1-shaped
 * RecognitionRecord exactly as an engine builds it (id/scope/payload/
 * confidence/evidence/provenance already resolved) — this function decides
 * whether that becomes a new row or a new version of an existing one.
 * @param {import('../contracts/recognition-record-contract.js').RecognitionRecord} candidate
 * @returns {{ok: boolean, data: object|null, error: object|null, op: 'create'|'append'|null}}
 */
export function recordObservation(candidate) {
  if (!candidate || typeof candidate.id !== 'string' || !candidate.id) {
    return { ...failure(RECOGNITION_SERVICE_ERRORS.INVALID_CANDIDATE, 'recordObservation: candidate.id is required.'), op: null };
  }
  const existing = repoGetById(candidate.id);
  if (!existing.ok && existing.error && existing.error.code !== REPOSITORY_ERRORS.NOT_FOUND) {
    return { ...existing, op: null };
  }
  if (!existing.ok) {
    const created = repoCreate(candidate);
    return { ...created, op: created.ok ? 'create' : null };
  }
  const patch = {
    payload: candidate.payload,
    confidence: candidate.confidence,
    evidence: candidate.evidence,
    provenance: candidate.provenance,
  };
  const appended = repoAppendVersion(candidate.id, patch);
  return { ...appended, op: appended.ok ? 'append' : null };
}

export function getRecognitionRecord(id) { return repoGetById(id); }
export function listRecognitionRecords(filter) { return repoList(filter); }
export function getRecognitionHistory(id) { return repoGetHistory(id); }
export function getRecognitionMetrics() { return repoGetMetrics(); }

/**
 * "Recognition Explanation" — three fixed questions, answered ONLY from a
 * record's own already-stored fields. Cite-or-abstain: a field with no
 * real answer is null, never invented — the same non-negotiable rule
 * every other explainability surface in this platform already enforces.
 * @param {string} id
 */
export function explainRecognition(id) {
  const result = repoGetById(id);
  if (!result.ok) return failure(RECOGNITION_SERVICE_ERRORS.INVALID_CANDIDATE, `No recognition record with id "${id}".`);
  const r = result.data;
  return Object.freeze({
    ok: true,
    error: null,
    data: Object.freeze({
      // "What made me think these are related?"
      evidence: r.evidence,
      // "How confident, and why?"
      confidence: r.confidence,
      // "Who/what produced this, and when?" (Recognition Ownership)
      producedBy: r.provenance ? r.provenance.producerId : null,
      producedAt: r.provenance ? r.provenance.computedAt : null,
      // "Has a human confirmed or rejected this before?" — Recognition
      // itself has no review gate (see this file's header); a real answer
      // to this question, once one exists, lives on the Recognition
      // Recommendation this record's own findings promoted into Knowledge
      // review — never fabricated here as a guess.
      humanConfirmed: null,
    }),
  });
}

export { isRecognitionRecord };
export function setRecognitionBackend(id) { return setActiveRepository(id); }
export function getRecognitionBackendId() { return getActiveRepositoryId(); }
