/* ============================================================
   CORPUS-OBSERVATION-RECORD.JS — NOR & Memorandum Corpus Acquisition
   Foundation (V2, Phase 5.x.1)

   PURPOSE: the pure, side-effect-free helpers the Memory backend and the
   server store both use to build, merge, and (later) transition a
   CorpusObservation — mirrors src/intelligence/nor-registry/nor-registry-record.js
   (pure record helpers, no persistence).

   RESPONSIBILITY:
     • CORPUS_AUDIT_EVENTS — metadata-only event vocabulary (no framework)
     • observationIdFrom(documentId, category, key) — deterministic id, so
       the SAME evidence re-recorded MERGES rather than duplicating (§12)
     • makeObservationFromExtraction(...) — extraction output → a fresh
       CorpusObservation, always lifecycleState 'observed'
     • mergeObservationOccurrence(existing, incoming) — accumulate repeated
       evidence: occurrenceCount grows, provenance appends, confidence is
       the max — lifecycleState is NEVER touched (§9, §15)
     • advanceObservationLifecycle(record, to, ctx) — the ONE pure
       transition function. Enforces the graph AND the human-approval gate.
       NOT reachable through the corpus store this phase (there is no
       store/callable method that calls it) — it exists so a future corpus
       review workspace has a single, tested authority, and so the "no
       PDF → AI → approved rule" invariant is provable now.

   DEPENDENCIES: contracts/corpus-observation-contract.js,
   contracts/observation-lifecycle-contract.js.

   NON-GOALS: no persistence, no I/O, no scoring model, no grouping of
   observations into candidates (a later step).
   ============================================================ */

'use strict';

import {
  makeCorpusObservation, isCorpusObservation,
} from './contracts/corpus-observation-contract.js';
import {
  OBSERVATION_LIFECYCLE, canObservationTransition, isObservationHumanGated,
} from './contracts/observation-lifecycle-contract.js';

/** Metadata-only audit vocabulary — logged as event NAMES, never with the
 *  observed text, a secret, or provenance detail strings. */
export const CORPUS_AUDIT_EVENTS = Object.freeze({
  DOCUMENT_INGESTED: 'CORPUS_DOCUMENT_INGESTED',
  DOCUMENT_DUPLICATE: 'CORPUS_DOCUMENT_DUPLICATE',
  OBSERVATION_RECORDED: 'CORPUS_OBSERVATION_RECORDED',
  OBSERVATION_MERGED: 'CORPUS_OBSERVATION_MERGED',
  ANALYSIS_ADVANCED: 'CORPUS_ANALYSIS_ADVANCED',
  OBSERVATION_LIFECYCLE_CHANGED: 'CORPUS_OBSERVATION_LIFECYCLE_CHANGED',
});

/** RTDB-safe slug for the id segments. */
function slug(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .replace(/[.$#[\]/\s\x00-\x1f\x7f]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 120);
}

/**
 * Deterministic observation id — the SAME (document, category, key) always
 * yields the SAME id, so recording the same convention twice MERGES the
 * evidence instead of creating a second row (§12).
 * @param {string} documentId
 * @param {string} category
 * @param {string} key
 * @returns {string}
 */
export function observationIdFrom(documentId, category, key) {
  return `obs_${slug(documentId)}__${slug(category)}__${slug(key)}`;
}

/**
 * Build a fresh CorpusObservation from a single extraction hit. Always
 * lifecycleState 'observed', occurrenceCount 1.
 * @param {Object} input
 * @param {string} input.documentId
 * @param {string} input.category   - OBSERVATION_CATEGORY.*
 * @param {string} input.key
 * @param {string|null} [input.observedValue]
 * @param {Object|null} [input.observation]  - structured payload for structure/visual
 * @param {string} [input.modality]
 * @param {object|object[]} [input.provenance]
 * @param {number} [input.confidence]
 * @param {string} [input.at]  - ISO timestamp (createdAt / updatedAt)
 * @returns {import('./contracts/corpus-observation-contract.js').CorpusObservation}
 */
export function makeObservationFromExtraction({
  documentId, category, key, observedValue = null, observation = null,
  modality, provenance = [], confidence = 0, at,
} = {}) {
  const provList = Array.isArray(provenance) ? provenance : [provenance];
  return makeCorpusObservation({
    observationId: observationIdFrom(documentId, category, key),
    documentId, category, key, observedValue, observation, modality,
    provenance: provList,
    confidence,
    occurrenceCount: 1,
    lifecycleState: OBSERVATION_LIFECYCLE.OBSERVED,
    createdAt: at,
    updatedAt: at,
  });
}

function provKey(p) {
  return [
    p && p.sourceDocumentId, p && p.sourceFileId, p && p.pageNumber,
    p && p.region && `${p.region.x},${p.region.y},${p.region.width},${p.region.height},${p.region.coordinateSpace}`,
    p && p.extractionMethod, p && p.extractedAt,
  ].join('|');
}

/**
 * Accumulate a repeated observation of the SAME thing. The lifecycle
 * state is deliberately left ALONE — more evidence never promotes an
 * observation; only a human review can (§9, §15).
 * @param {import('./contracts/corpus-observation-contract.js').CorpusObservation} existing
 * @param {import('./contracts/corpus-observation-contract.js').CorpusObservation} incoming
 * @returns {{ next: object, changed: boolean }}
 */
export function mergeObservationOccurrence(existing, incoming) {
  if (!isCorpusObservation(existing)) {
    return { next: incoming, changed: true };
  }
  const seen = new Set(existing.provenance.map(provKey));
  const addedProv = (incoming && Array.isArray(incoming.provenance) ? incoming.provenance : [])
    .filter((p) => !seen.has(provKey(p)));
  const mergedProv = [...existing.provenance, ...addedProv];
  const nextCount = existing.occurrenceCount + (incoming && incoming.occurrenceCount ? incoming.occurrenceCount : 1);
  const nextConf = Math.max(existing.confidence, (incoming && incoming.confidence) || 0);
  const changed = addedProv.length > 0
    || nextCount !== existing.occurrenceCount
    || nextConf !== existing.confidence;
  if (!changed) return { next: existing, changed: false };

  const next = makeCorpusObservation({
    ...existing,
    provenance: mergedProv,
    occurrenceCount: nextCount,
    confidence: nextConf,
    // lifecycleState + approval fields carried through unchanged by the spread
    updatedAt: (incoming && (incoming.updatedAt || incoming.createdAt)) || new Date().toISOString(),
  });
  return { next, changed: true };
}

/**
 * The ONE pure lifecycle-transition function. Enforces:
 *   1. the transition graph (observation-lifecycle-contract.js)
 *   2. the human-approval gate — a move INTO a human-gated state
 *      (`approved`) requires an explicit human actor AND a non-empty,
 *      human-written preferenceRationale. There is no automatic path.
 *
 * Returns a NEW frozen observation, or an { error } code.
 * @param {import('./contracts/corpus-observation-contract.js').CorpusObservation} record
 * @param {string} to  - target OBSERVATION_LIFECYCLE.*
 * @param {Object} ctx
 * @param {string} [ctx.actorId]
 * @param {string} [ctx.at]
 * @param {string} [ctx.preferenceRationale]  - required when `to` is human-gated
 * @param {boolean} [ctx.humanApproved]       - must be true when `to` is human-gated
 * @returns {{ next?: object, error?: string }}
 */
export function advanceObservationLifecycle(record, to, ctx = {}) {
  if (!isCorpusObservation(record)) return { error: 'INVALID_RECORD' };
  if (!canObservationTransition(record.lifecycleState, to)) return { error: 'ILLEGAL_TRANSITION' };

  const at = ctx.at || new Date().toISOString();

  if (isObservationHumanGated(to)) {
    const rationale = typeof ctx.preferenceRationale === 'string' ? ctx.preferenceRationale.trim() : '';
    if (ctx.humanApproved !== true || !ctx.actorId || !rationale) {
      return { error: 'HUMAN_APPROVAL_REQUIRED' };
    }
    return {
      next: makeCorpusObservation({
        ...record,
        lifecycleState: to,
        approvedBy: ctx.actorId,
        approvedAt: at,
        preferenceRationale: rationale,
        updatedAt: at,
      }),
    };
  }

  // any move OUT of / not-into `approved` clears the approval fields
  return {
    next: makeCorpusObservation({
      ...record,
      lifecycleState: to,
      approvedBy: null,
      approvedAt: null,
      preferenceRationale: null,
      updatedAt: at,
    }),
  };
}
