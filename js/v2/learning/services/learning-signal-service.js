/* ============================================================
   LEARNING-SIGNAL-SERVICE.JS — Universal Learning Engine (Phase 12.6.4)

   PURPOSE: `emitLearningSignal(seed)` — the ONE new, generalized entry
   point every domain (present or future) can call instead of writing its
   own bespoke learning mechanism. Threads the mission's own pipeline
   stages (Observe -> Normalize -> Validate -> Merge -> Detect duplicate ->
   Detect conflict -> Increase/decrease confidence -> Generate
   recommendation -> Persist history -> Explain) together — every stage
   below is NEW composition; the pipeline's ONE AND ONLY WRITE is the
   platform's existing, completely unmodified
   services/learning-service.js#recordLearningEvent(). This file contains
   exactly one repository-touching call, by design and by construction —
   see scripts/learning-signal-ownership-check.mjs, which asserts this by
   direct source inspection.

   STAGE MAPPING (why some mission-named steps aren't separate functions):
     Observe     — the caller's seed IS the observation; nothing to add.
     Normalize   — buildSignal() below: fills scope/defaults into a real
                   LearningSignal.
     Validate    — isLearningSignal() (contracts/learning-signal-contract.js).
     Merge       — REALIZED, not duplicated: learning-service.js#record()'s
                   own existing targetKey-based supersession chain (old
                   event -> HISTORICAL with supersededById, new event gets
                   supersedesId back) IS this pipeline's Merge step. A
                   second, separate merge computation would be exactly the
                   duplicated mechanism "never duplicate learning" warns
                   against — this pipeline reuses the one that already
                   exists rather than re-implementing it.
     Detect duplicate / conflict — learning-signal-similarity-engine.js /
                   learning-conflict-detection-engine.js (Phase 12.6.3),
                   informational, over a same-domainType+kind candidate
                   pool read once via the existing listLearningEvents().
     Confidence  — learning-confidence-engine.js (Phase 12.6.2).
     Persist     — recordLearningEvent() (existing, unmodified).
     Explain     — NOT bundled into every write (a write-time explanation
                   nobody asked for yet is speculative infrastructure).
                   The existing explainLearningEvent(id) already answers
                   this on demand for the persisted event this call
                   returns.
     Generate recommendation — NOT invoked automatically per signal
                   (computing a LearningRecommendation is itself a real
                   query, better run on demand for a scope — see
                   learning-recommendation-engine.js, Phase 12.6.5 —
                   than recomputed speculatively on every single signal).

   REGISTRATION IS OPTIONAL. An unregistered `signalType` still works —
   resolveLearningKind() below defaults to LEARNING_KIND.OBSERVATION and
   learning-confidence-engine.js already defaults an unregistered
   sourceType to DEFAULT_LEARNING_SOURCE_WEIGHT. This is deliberate: Body
   Intelligence's pull adapter (Phase 12.6.6) genuinely CANNOT call this
   function any other way (body/ and learning/ may not import each other's
   engines, so an adapter living in js/v2/learning-bridge/ is structurally
   required) — but most future domains will simply call
   emitLearningSignal(seed) directly with a plain seed, the same way
   conversation/task-executor.js already calls recordCorrection() directly
   today, zero registry involved.

   RESPONSIBILITY: emitLearningSignal(seed).

   DEPENDENCIES: contracts/learning-scope-contract.js,
   contracts/learning-signal-contract.js, contracts/learning-event-contract.js
   (LEARNING_KIND only), registry/learning-signal-type-registry.js,
   ../learning-signal-similarity-engine.js,
   ../learning-conflict-detection-engine.js, ../learning-confidence-engine.js,
   ./learning-service.js (recordLearningEvent, listLearningEvents — the
   existing, unmodified public surface).

   NON-GOALS: no second ledger — see the file-level assertion above. No AI,
   no ML, no probabilistic scoring anywhere in this pipeline.
   ============================================================ */

'use strict';

import { makeLearningScope, isLearningScope, scopeKey } from '../contracts/learning-scope-contract.js';
import { makeLearningSignal, isLearningSignal } from '../contracts/learning-signal-contract.js';
import { LEARNING_KIND, isTerminalLearningState } from '../contracts/learning-event-contract.js';
import { getSignalType } from '../registry/learning-signal-type-registry.js';
import { findSimilarSignals } from '../learning-signal-similarity-engine.js';
import { findSignalConflicts } from '../learning-conflict-detection-engine.js';
import { computeSignalConfidence } from '../learning-confidence-engine.js';
import { recordLearningEvent, listLearningEvents } from './learning-service.js';

export const LEARNING_SIGNAL_SERVICE_ERRORS = Object.freeze({
  INVALID_SIGNAL: 'INVALID_SIGNAL',
});

function failure(code, message) {
  return Object.freeze({ ok: false, data: null, error: Object.freeze({ code, message }) });
}

/** Registration is enriching metadata, never a hard gate — see this
 *  file's header. An unregistered signalType maps honestly to OBSERVATION
 *  ("a domain-agnostic fact not yet validated as any of the five named
 *  kinds"), never a fabricated specific kind. */
function resolveLearningKind(signalType) {
  const registered = getSignalType(signalType);
  return registered ? registered.mapsToKind : LEARNING_KIND.OBSERVATION;
}

function buildSignal(seed) {
  const scope = makeLearningScope({
    domainType: seed.domainType, entityType: seed.entityType ?? null, entityId: seed.entityId ?? null,
    signalType: seed.signalType,
  });
  return makeLearningSignal({
    scope, sourceType: seed.sourceType, actorId: seed.actorId, reason: seed.reason ?? null,
    before: seed.before ?? null, after: seed.after, sourceDocumentId: seed.sourceDocumentId ?? null,
    affectedKnowledgeId: seed.affectedKnowledgeId ?? null, evidence: seed.evidence ?? null,
  });
}

/** The comparison pool for Dedup/Conflict/Corroboration — one bounded,
 *  scoped read (never an unscoped scan), same discipline every other
 *  scoped lookup in this platform follows. Each LearningEvent's own
 *  `evidence.scope` (stamped by THIS pipeline's own prior Persist step —
 *  see below) is what lets a later signal find it again. TERMINAL
 *  (HISTORICAL — already-superseded) events are excluded: a disagreement
 *  the platform already resolved via supersession is history, not a live
 *  conflict — same "current, non-terminal event" scoping
 *  learning-service.js#currentEventFor() already uses for its own
 *  targetKey lookup. */
function sameKindCandidatePool(domainType, kind) {
  const result = listLearningEvents({ domainType, kind });
  if (!result.ok) return [];
  return result.data
    .filter((e) => !isTerminalLearningState(e.state))
    .filter((e) => e.evidence && isLearningScope(e.evidence.scope))
    .map((e) => ({ id: e.id, scope: e.evidence.scope, after: e.after }));
}

/**
 * @param {{domainType: string, entityType?: string|null, entityId?: string|null,
 *   signalType: string, sourceType: string, actorId: string, reason?: string|null,
 *   before?: *, after: *, sourceDocumentId?: string|null, affectedKnowledgeId?: string|null,
 *   evidence?: Object|null, targetKey?: string|null}} seed
 * @returns {{ok: boolean, data: object|null, error: object|null, op: string|null,
 *   confidence: import('../contracts/learning-confidence-contract.js').LearningConfidence|null,
 *   conflicts: Array, dedupCandidates: Array}}
 */
export function emitLearningSignal(seed) {
  // ── Normalize ──
  let signal;
  try {
    signal = buildSignal(seed || {});
  } catch (e) {
    return { ...failure(LEARNING_SIGNAL_SERVICE_ERRORS.INVALID_SIGNAL, `emitLearningSignal: ${e.message}`), op: null, confidence: null, conflicts: [], dedupCandidates: [] };
  }

  // ── Validate ──
  if (!isLearningSignal(signal)) {
    return { ...failure(LEARNING_SIGNAL_SERVICE_ERRORS.INVALID_SIGNAL, 'emitLearningSignal: signal does not satisfy the LearningSignal contract.'), op: null, confidence: null, conflicts: [], dedupCandidates: [] };
  }

  const kind = resolveLearningKind(signal.scope.signalType);
  const pool = sameKindCandidatePool(signal.scope.domainType, kind);

  // ── Detect duplicate (informational only — record()'s own targetKey
  //    no-op path below is the primary defense for identically-scoped
  //    signals) ──
  const dedupCandidates = findSimilarSignals(signal, pool, 0.5);

  // ── Detect conflict ──
  const conflicts = findSignalConflicts(signal, pool);

  // ── Increase/decrease confidence ──
  const sameScopeAgreeing = pool.filter((c) => scopeKey(c.scope) === scopeKey(signal.scope) && JSON.stringify(c.after) === JSON.stringify(signal.after));
  const confidence = computeSignalConfidence(signal, {
    corroborationCount: sameScopeAgreeing.length,
    contradictionCount: conflicts.length,
  });

  // ── Merge + Persist — the existing, unmodified recordLearningEvent().
  //    targetKey defaults to scopeKey(signal.scope) (a genuinely NEW value
  //    at this scope supersedes the prior one — see the header on why
  //    this pipeline never re-implements supersession); a caller may
  //    override it for a coarser/finer granularity than the default.
  //
  //    PERSISTED evidence deliberately carries ONLY the caller's own
  //    evidence + the static `scope` — NEVER `confidence`/`conflicts`/
  //    `dedupCandidates`. Those are recomputed fresh every call (see
  //    learning-confidence-contract.js's header: "never itself versioned")
  //    and confidence.computedAt changes on every call — persisting it
  //    would make `evidence` differ on every re-emission of an otherwise
  //    IDENTICAL fact, silently breaking record()'s own
  //    sameFact(current.evidence, evidence) no-op check. confidence/
  //    conflicts/dedupCandidates are still fully available to the caller —
  //    see this function's return value below. ──
  const targetKey = seed.targetKey ?? scopeKey(signal.scope);
  const result = recordLearningEvent({
    kind, correctionType: null, domainType: signal.scope.domainType, targetKey,
    actorId: signal.actorId, reason: signal.reason, before: signal.before, after: signal.after,
    sourceDocumentId: signal.sourceDocumentId, affectedKnowledgeId: signal.affectedKnowledgeId,
    evidence: { ...(signal.evidence || {}), scope: signal.scope },
  });

  return { ...result, confidence, conflicts, dedupCandidates };
}

export { resolveLearningKind };
