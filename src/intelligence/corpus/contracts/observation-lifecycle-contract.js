/* ============================================================
   OBSERVATION-LIFECYCLE-CONTRACT.JS — NOR & Memorandum Corpus
   Acquisition Foundation (V2, Phase 5.x.1)

   PURPOSE: fix the lifecycle of ONE extracted corpus observation as
   data — the ONE authority on legal state moves, so an invalid
   transition is impossible by construction. Mirrors the proven shape of
   src/knowledge/contracts/lifecycle-contract.js (states + graph + a pure
   canTransition + a human-gated set), applied to a CorpusObservation
   instead of a KnowledgeItem.

       observed → candidate → approved → deprecated
             ↘         ↘   ↘
              rejected  ← ←

   THE DISTINCTION THIS FILE EXISTS TO ENFORCE (Phase 5.x.1 §9, §10, §15):

     • `observed`  — a historical document literally contains this. It is
       EVIDENCE, nothing more. High extraction confidence does NOT make it
       organizational guidance.
     • `candidate` — repeated `observed` evidence across the corpus has
       been grouped into a proposed convention. Still not authoritative.
     • `approved`  — a human has explicitly reviewed the candidate and
       accepted it. ONLY this state may later be consumed as authoritative
       organizational context.
     • `rejected`  — a human (or a rule) has explicitly declined it. Kept,
       never discarded — the fact that it was seen is itself information.
     • `deprecated`— was approved, no longer current.

   confidence ≠ authority. `observed` ≠ `approved`. A single anomalous
   document must never silently override repeated evidence — that is what
   the human review gate on `approved` protects.

   RESPONSIBILITY: OBSERVATION_LIFECYCLE, OBSERVATION_LIFECYCLE_DEFS,
   OBSERVATION_LIFECYCLE_GRAPH, OBSERVATION_HUMAN_GATED_STATES,
   canObservationTransition(from, to), isObservationHumanGated(to).

   DEPENDENCIES: none.

   NON-GOALS: does not perform a transition, does not persist anything,
   does not decide WHO may approve. A later corpus review workspace
   consumes this graph — see src/intelligence/corpus/corpus-observation-record.js
   #advanceObservationLifecycle for the pure transition helper (which is
   NOT reachable through the corpus store this phase — there is no
   store/callable method that moves an observation into `approved`).
   ============================================================ */

'use strict';

export const OBSERVATION_LIFECYCLE_SCHEMA = 'corpus-observation-lifecycle@1';

export const OBSERVATION_LIFECYCLE = Object.freeze({
  OBSERVED: 'observed',
  CANDIDATE: 'candidate',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  DEPRECATED: 'deprecated',
});

export const OBSERVATION_LIFECYCLE_DEFS = Object.freeze([
  Object.freeze({ id: OBSERVATION_LIFECYCLE.OBSERVED, label: 'Observed (evidence only)' }),
  Object.freeze({ id: OBSERVATION_LIFECYCLE.CANDIDATE, label: 'Candidate convention' }),
  Object.freeze({ id: OBSERVATION_LIFECYCLE.APPROVED, label: 'Approved organizational guidance' }),
  Object.freeze({ id: OBSERVATION_LIFECYCLE.REJECTED, label: 'Rejected' }),
  Object.freeze({ id: OBSERVATION_LIFECYCLE.DEPRECATED, label: 'Deprecated' }),
]);

/**
 * The ONE authority on legal state moves. Every key maps to the set of
 * states reachable from it in a single step.
 *
 * `candidate → observed` and `rejected → observed` re-open a proposal for
 * more evidence. `deprecated → approved` revives a superseded convention.
 * There is NO edge that reaches `approved` without passing through the
 * human review gate (see OBSERVATION_HUMAN_GATED_STATES).
 */
export const OBSERVATION_LIFECYCLE_GRAPH = Object.freeze({
  [OBSERVATION_LIFECYCLE.OBSERVED]: Object.freeze([
    OBSERVATION_LIFECYCLE.CANDIDATE, OBSERVATION_LIFECYCLE.REJECTED,
  ]),
  [OBSERVATION_LIFECYCLE.CANDIDATE]: Object.freeze([
    OBSERVATION_LIFECYCLE.APPROVED, OBSERVATION_LIFECYCLE.REJECTED, OBSERVATION_LIFECYCLE.OBSERVED,
  ]),
  [OBSERVATION_LIFECYCLE.APPROVED]: Object.freeze([
    OBSERVATION_LIFECYCLE.DEPRECATED,
  ]),
  [OBSERVATION_LIFECYCLE.REJECTED]: Object.freeze([
    OBSERVATION_LIFECYCLE.OBSERVED,
  ]),
  [OBSERVATION_LIFECYCLE.DEPRECATED]: Object.freeze([
    OBSERVATION_LIFECYCLE.APPROVED,
  ]),
});

/** States nothing may enter automatically — Phase 5.x.1 §15: there must be
 *  no code path PDF → AI → approved rule without an explicit human action. */
export const OBSERVATION_HUMAN_GATED_STATES = Object.freeze([OBSERVATION_LIFECYCLE.APPROVED]);

/**
 * Pure structural check: is `from → to` a legal single-step transition?
 * Does not check WHO may perform it and does not mutate anything.
 * @param {string} from
 * @param {string} to
 * @returns {boolean}
 */
export function canObservationTransition(from, to) {
  const reachable = OBSERVATION_LIFECYCLE_GRAPH[from];
  return Array.isArray(reachable) && reachable.includes(to);
}

/** Whether `to` requires the structural human-approval gate. */
export function isObservationHumanGated(to) {
  return OBSERVATION_HUMAN_GATED_STATES.includes(to);
}

/** Whether `state` is a valid lifecycle value at all. */
export function isObservationLifecycleState(state) {
  return Object.values(OBSERVATION_LIFECYCLE).includes(state);
}
