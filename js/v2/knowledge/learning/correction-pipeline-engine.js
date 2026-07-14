/* ============================================================
   CORRECTION-PIPELINE-ENGINE.JS — Teach Once, Learn Forever (V2.0.5, Phase 9.4)

   PURPOSE: turn one explicit human Correction into either an in-place
   content fix (Pattern/Vocabulary/Relationship Update — one mechanism,
   since `payload` is opaque to the core regardless of `kind`) or a brand
   new Candidate (Candidate Generation) — never a direct edit to an
   Approved item, and never an auto-approval either way.

   RESPONSIBILITY: `submitCorrection(session, correction, opts)`:
   - if `correction.itemId` names an item still Draft/Candidate/Pending
     Review, `appendVersion()`s it in place with the corrected payload —
     the item's own state is untouched, this is a content fix mid-flight.
   - otherwise (no itemId, OR itemId names an Approved/Deprecated item —
     Approved content is never mutated in place) generates a brand-new
     Candidate item (skips Draft: a human explicitly authored this, unlike
     a connector's raw extraction). If the correction named an existing
     Approved item, a `kind:'relationship'` item
     (contracts/dependency-graph-contract.js, RELATIONSHIP_TYPE.DERIVED_FROM)
     links the new Candidate back to it — reusing the existing dependency
     graph rather than inventing a new "supersedes" field.
   - Similarity Detection runs first either way, so a near-duplicate
     Candidate is flagged (not blocked — the human still decides).

   DEPENDENCIES: repository/knowledge-repository.js,
   contracts/{lifecycle,identity,dependency-graph}-contract.js,
   contracts/correction-contract.js, contracts/session-contract.js,
   contracts/event-contract.js, similarity-detection-engine.js.

   NON-GOALS: never produces anything but Draft/Candidate-lifecycle output
   (Decision 6) — the generated Candidate still has to go through
   review/review-workflow-engine.js#approve() like anything else. Never
   mutates an Approved item's payload directly.
   ============================================================ */

'use strict';

// Phase 3 — a CLIENT of the Knowledge Service. Its two writes map exactly onto
// the Service's two write verbs, and the Service now enforces the invariant
// this engine used to enforce for itself (MUTABLE_STATES): Approved knowledge
// is never edited in place — a correction to it becomes a new superseding
// Candidate. One rule, stated in one place, applied to every writer.
import { getKnowledge as getById, ingest, updateDraft } from '../services/knowledge-service.js';
import { LIFECYCLE_STATE } from '../contracts/lifecycle-contract.js';
import { generateKnowledgeId } from '../contracts/identity-contract.js';
import { RELATIONSHIP_TYPE } from '../contracts/dependency-graph-contract.js';
import { isCorrection } from './contracts/correction-contract.js';
import {
  startLearningSession, appendLearningItem, completeLearningSession,
} from './contracts/session-contract.js';
import { LEARNING_EVENT_TYPE, makeLearningEvent } from './contracts/event-contract.js';
import { findSimilarItems } from './similarity-detection-engine.js';

const MUTABLE_STATES = Object.freeze([LIFECYCLE_STATE.DRAFT, LIFECYCLE_STATE.CANDIDATE, LIFECYCLE_STATE.PENDING_REVIEW]);

/** @type {{itemId: string, generatedNew: boolean, similarityMatchFound: boolean, at: string}[]} */
const _correctionLog = [];

function emit(onEvent, type, sessionId, detail) {
  if (typeof onEvent === 'function') onEvent(makeLearningEvent(type, { sessionId, detail }));
}

export function startCorrectionSession(correctedBy, opts = {}) {
  const session = startLearningSession(correctedBy);
  emit(opts.onEvent, LEARNING_EVENT_TYPE.SESSION_STARTED, session.sessionId, { correctedBy });
  return session;
}

function buildDerivedFromRelationship(domainType, newItemId, originalItemId) {
  const now = new Date().toISOString();
  const sourceRef = `${newItemId}->${originalItemId}`;
  return Object.freeze({
    id: generateKnowledgeId({ domainType, sourceType: 'correction', sourceRef }),
    version: 1, domainType, sourceType: 'correction', kind: 'relationship',
    payload: Object.freeze({ fromId: newItemId, toId: originalItemId, type: RELATIONSHIP_TYPE.DERIVED_FROM }),
    confidence: 1, lifecycleState: LIFECYCLE_STATE.CANDIDATE,
    provenance: Object.freeze({ connectorId: 'correction', sourceRef, capturedAt: now }),
    approvedBy: null, approvedAt: null, preferenceRationale: null, createdAt: now, updatedAt: now,
  });
}

/**
 * @param {import('./contracts/session-contract.js').LearningSession} session
 * @param {import('./contracts/correction-contract.js').Correction} correction
 * @param {{similarityThreshold?: number, onEvent?: Function}} [opts]
 */
export function submitCorrection(session, correction, opts = {}) {
  if (!isCorrection(correction)) {
    return { session, ok: false, error: { code: 'INVALID_CORRECTION', message: 'submitCorrection: malformed Correction.' } };
  }

  const existing = correction.itemId ? getById(correction.itemId) : null;

  if (existing && existing.ok && MUTABLE_STATES.includes(existing.data.lifecycleState)) {
    const result = updateDraft(correction.itemId, {
      payload: correction.correctedPayload,
      provenance: Object.freeze({ connectorId: 'correction', sourceRef: correction.itemId, capturedAt: new Date().toISOString() }),
    });
    if (result.ok) {
      _correctionLog.push({ itemId: result.data.id, generatedNew: false, similarityMatchFound: false, at: result.data.updatedAt });
      const nextSession = appendLearningItem(session, result.data.id);
      emit(opts.onEvent, LEARNING_EVENT_TYPE.CORRECTION_APPLIED, session.sessionId, { itemId: result.data.id, note: correction.note });
      return { session: nextSession, ok: true, result, generatedItem: null };
    }
    return { session, ok: false, error: result.error, result };
  }

  // Candidate Generation — either no itemId, or the named item is
  // Approved/Deprecated and must never be mutated in place.
  const similar = findSimilarItems(correction.domainType, correction.kind, correction.correctedPayload, opts.similarityThreshold ?? 0.7);
  const now = new Date().toISOString();
  const sourceRef = correction.itemId ? `correction-of:${correction.itemId}:${Date.now()}` : `new:${Date.now()}`;
  const newItem = Object.freeze({
    id: generateKnowledgeId({ domainType: correction.domainType, sourceType: 'correction', sourceRef }),
    version: 1, domainType: correction.domainType, sourceType: 'correction', kind: correction.kind,
    payload: correction.correctedPayload, confidence: 1, lifecycleState: LIFECYCLE_STATE.CANDIDATE,
    provenance: Object.freeze({ connectorId: 'correction', sourceRef, capturedAt: now }),
    approvedBy: null, approvedAt: null, preferenceRationale: null, createdAt: now, updatedAt: now,
  });

  const createResult = ingest(newItem);
  if (!createResult.ok) return { session, ok: false, error: createResult.error, result: createResult };

  let relationshipItem = null;
  if (correction.itemId) {
    relationshipItem = buildDerivedFromRelationship(correction.domainType, newItem.id, correction.itemId);
    ingest(relationshipItem);
  }

  _correctionLog.push({ itemId: newItem.id, generatedNew: true, similarityMatchFound: similar.length > 0, at: now });
  const nextSession = appendLearningItem(session, newItem.id);
  emit(opts.onEvent, LEARNING_EVENT_TYPE.CANDIDATE_GENERATED, session.sessionId, { itemId: newItem.id, similarCount: similar.length, supersedes: correction.itemId ?? null });

  return { session: nextSession, ok: true, result: createResult, generatedItem: newItem, similar, relationshipItem };
}

export function finishCorrectionSession(session, opts = {}) {
  const completed = completeLearningSession(session);
  emit(opts.onEvent, LEARNING_EVENT_TYPE.SESSION_COMPLETED, session.sessionId, { itemsTouched: completed.itemIds.length });
  return completed;
}

/** Learning Metrics support. */
export function listCorrectionLog() {
  return [..._correctionLog];
}

/** Test/teardown helper. Not used by any runtime path. */
export function resetCorrectionLog() {
  _correctionLog.length = 0;
}
