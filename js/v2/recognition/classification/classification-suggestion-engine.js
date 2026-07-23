/* ============================================================
   CLASSIFICATION-SUGGESTION-ENGINE.JS — Autonomous Classification (Phase 12.7.2)

   PURPOSE: suggest a `domainType`/`kind`/NOR-Type for a document/entity
   from ALREADY-REGISTERED vocabulary only — never invents a new category.
   This is the one genuinely new capability Phase 12.7 adds: a direct
   audit of the existing codebase (see
   docs/PHASE_12_SPRINT_12_7_APPLE_PHOTOS_LEARNING.md §1) confirmed no
   engine anywhere classifies a document/entity's CONTENT automatically —
   `knowledge/datasets/contracts/dataset-classification-contract.js`'s
   OFFICIAL/HISTORICAL/SYNTHETIC/TRAINING/CORRECTION taxonomy answers a
   different, collection-level "how much should this whole batch be
   trusted" question, not this one.

   CITE-OR-ABSTAIN, same discipline reasoning/reasoning-engine.js#reason()
   already enforces: every candidate this engine returns cites the real
   signals that support it; if nothing clears the confidence bar, the
   answer is an honest `NO_CONFIDENT_CLASSIFICATION`, never a guess
   dressed as a fact.

   PURE. Takes a plain array of already-observed ClassificationSignals —
   this engine does not read a filename, parse a document, or call
   knowledge/datasets/import-session/metadata-inference-engine.js or
   content-fact-extraction-engine.js itself (those are Knowledge-domain
   ENGINE files, not a services facade — importing either directly would
   cross this platform's own "services-only" dependency rule for
   recognition/'s edge to knowledge/, see js/v2/recognition/README.md).
   Assembling real ClassificationSignals from those engines' real output
   is a real, concrete future wiring point (see this sprint's own report),
   deliberately NOT done in this sprint — the same "structurally
   complete, zero live callers, wiring deferred" precedent body/ and
   learning-bridge/ both shipped under.

   REGISTRIES ARE A PRECEDENTED THIRD EXCEPTION to "services-only",
   alongside pure contract leaves (identity-contract.js#nextVersion,
   evidence-contract.js) — a registry is Map-based vocabulary
   (has/get/list, never a write from this side), the exact same tier as a
   contract, and this codebase ALREADY imports domain-type-registry.js/
   kind-registry.js/nor-type-registry.js directly, cross-domain, all over
   itself today (e.g. conversation/intent/intent-engine.js and
   problem-intelligence/problem-parser.js both import
   nor-type-registry.js#NOR_TYPE directly) — this is not a new exception,
   only its first use from inside recognition/.

   RESPONSIBILITY: suggestClassification(signals).

   DEPENDENCIES: knowledge/registry/{domain-type,kind,nor-type}-registry.js
   (has* checks only — never register*), ../contracts/recognition-
   classification-contract.js, knowledge/contracts/evidence-contract.js.

   NON-GOALS: does not persist anything (services/classification-
   service.js, this same sprint, does). Does not decide WHEN to run.
   ============================================================ */

'use strict';

import { hasDomainType } from '../../../../src/knowledge/registry/domain-type-registry.js';
import { hasKind } from '../../../../src/knowledge/registry/kind-registry.js';
import { hasNorType } from '../../../../src/knowledge/registry/nor-type-registry.js';
import { isRecognitionClassificationPayload } from '../contracts/recognition-classification-contract.js';
import { EVIDENCE_KIND } from '../../../../src/knowledge/contracts/evidence-contract.js';

/** Deliberately the SAME value as metadata-inference-engine.js's
 *  AUTO_POPULATE_CONFIDENCE_THRESHOLD — not imported (that file is a
 *  knowledge/-domain ENGINE, not a contracts leaf or registry, so
 *  importing it directly would cross recognition/'s own services-only
 *  dependency rule; see this file's header) but deliberately matching in
 *  VALUE, the same "reimplement the arithmetic, cite the precedent"
 *  discipline learning-confidence-engine.js already established for
 *  reusing a formula across an ownership boundary without importing code. */
export const CLASSIFICATION_CONFIDENCE_THRESHOLD = 0.6;

export const CLASSIFICATION_OUTCOME = Object.freeze({
  SUGGESTED: 'suggested',
  NO_CONFIDENT_CLASSIFICATION: 'no_confident_classification',
});

/**
 * @typedef {Object} ClassificationSignal
 * @property {string|null} domainType   - must already be registered to count
 * @property {string|null} kind         - must already be registered to count
 * @property {string|null} norType      - must already be registered to count
 * @property {number} strength          - 0-1
 * @property {string} source            - e.g. 'filename-vocabulary-match', 'structural-signature-match', 'prior-classified-corpus' (opaque to this engine, carried into Evidence.rationale)
 */

function isRegisteredSignal(s) {
  if (s.domainType !== null && !hasDomainType(s.domainType)) return false;
  if (s.kind !== null && !hasKind(s.kind)) return false;
  if (s.norType !== null && !hasNorType(s.norType)) return false;
  return s.domainType !== null || s.kind !== null || s.norType !== null;
}

/** Groups signals by the exact (domainType, kind, norType) triple they
 *  jointly name, so agreeing signals reinforce one candidate instead of
 *  each spawning its own — the SAME "corroboration, not just count"
 *  intent import-confidence-engine.js's weighted-mean signals already
 *  express, only grouped by candidate here instead of by field. */
function candidateKey(s) {
  return `${s.domainType || ''}::${s.kind || ''}::${s.norType || ''}`;
}

/**
 * Pure, deterministic, cite-or-abstain. Never invents a domainType/kind/
 * norType outside the registered vocabulary — an unregistered signal is
 * silently excluded from consideration (not an error; a caller may
 * legitimately observe vocabulary this platform hasn't registered yet).
 * @param {ClassificationSignal[]} signals
 * @returns {{ok: boolean, outcome: string, suggestion: object|null, confidence: number, evidence: object[]}}
 */
export function suggestClassification(signals = []) {
  const real = (Array.isArray(signals) ? signals : []).filter(isRegisteredSignal);
  if (real.length === 0) {
    return Object.freeze({
      ok: true, outcome: CLASSIFICATION_OUTCOME.NO_CONFIDENT_CLASSIFICATION, suggestion: null, confidence: 0, evidence: [],
    });
  }

  const byCandidate = new Map();
  for (const s of real) {
    const key = candidateKey(s);
    if (!byCandidate.has(key)) byCandidate.set(key, []);
    byCandidate.get(key).push(s);
  }

  let best = null;
  for (const [, group] of byCandidate) {
    // Corroboration-aware aggregate: the mean strength, boosted slightly by
    // how many independent signals agree — mirrors pattern-mining-engine.js's
    // "no corroboration for a singleton" intent without literally importing
    // its formula (that file is also a knowledge/-domain ENGINE).
    const meanStrength = group.reduce((sum, s) => sum + s.strength, 0) / group.length;
    const corroborationBoost = Math.min(1, group.length / 3) * 0.1;
    const score = Math.min(1, meanStrength + corroborationBoost);
    if (!best || score > best.score) best = { group, score };
  }

  if (!best || best.score < CLASSIFICATION_CONFIDENCE_THRESHOLD) {
    return Object.freeze({
      ok: true,
      outcome: CLASSIFICATION_OUTCOME.NO_CONFIDENT_CLASSIFICATION,
      suggestion: null,
      confidence: best ? Math.round(best.score * 100) / 100 : 0,
      evidence: [],
    });
  }

  const [first] = best.group;
  const suggestion = Object.freeze({
    suggestedDomainType: first.domainType,
    suggestedKind: first.kind,
    suggestedNorType: first.norType,
  });
  if (!isRecognitionClassificationPayload(suggestion)) {
    // Structurally impossible given isRegisteredSignal()'s own guard above,
    // but never silently trust a shape this engine itself constructed —
    // same defensive discipline repository/implementations/*-repository.js
    // apply to their own appendVersion() output.
    return Object.freeze({
      ok: true, outcome: CLASSIFICATION_OUTCOME.NO_CONFIDENT_CLASSIFICATION, suggestion: null, confidence: 0, evidence: [],
    });
  }

  const evidence = best.group.map((s) => Object.freeze({
    itemId: candidateKey(s),
    kind: EVIDENCE_KIND.CORROBORATION,
    weight: Math.round(s.strength * 100) / 100,
    rationale: `${s.source}: strength ${s.strength.toFixed(2)}`,
  }));

  return Object.freeze({
    ok: true,
    outcome: CLASSIFICATION_OUTCOME.SUGGESTED,
    suggestion,
    confidence: Math.round(best.score * 100) / 100,
    evidence,
  });
}
