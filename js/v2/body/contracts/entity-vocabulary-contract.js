/* ============================================================
   ENTITY-VOCABULARY-CONTRACT.JS — Body Intelligence (V2, Phase 12.5.1)

   PURPOSE: fix the small closed vocabularies an Entity's structural fields
   (capabilities, visibility, AI context tags) are drawn from — kept out of
   entity-contract.js itself so that file stays about SHAPE/identity, the
   same split knowledge/ already uses (identity-contract.js is its own file,
   separate from knowledge-item-contract.js).

   RESPONSIBILITY: define CAPABILITY, VISIBILITY, AI_CONTEXT_TAG, and the
   per-entityType structural defaults a sensor reads at observation time.
   These are NEVER business rules (e.g. no "eligible for long distance") —
   only structural labels a sensor derives from the same raw fields it
   already reads to build `attributes`/`observedState`. See
   entity-state-contract.js's header for the same "never invent" discipline
   applied to state.

   DEPENDENCIES: none.

   NON-GOALS: no per-record ACL, no dispatch/business eligibility. Real
   permission/eligibility systems, if any exist in V1, are the source of
   truth and would only ever be mirrored here, never re-derived.
   ============================================================ */

'use strict';

export const CAPABILITY = Object.freeze({
  ASSIGNABLE: 'assignable',
});

export const VISIBILITY = Object.freeze({
  INTERNAL: 'internal',
  RESTRICTED: 'restricted',
});

export const AI_CONTEXT_TAG = Object.freeze({
  OPERATIONAL: 'operational',
  FINANCIAL: 'financial',
});

/** Structural default visibility per entityType — a placeholder entityType
 *  not listed here defaults to 'internal' (the least presumptive choice;
 *  nothing about an unimplemented sensor is known well enough to restrict
 *  it, and nothing about it is exposed anywhere yet either). */
export const DEFAULT_VISIBILITY_BY_ENTITY_TYPE = Object.freeze({
  budget: VISIBILITY.RESTRICTED,
  petty_cash: VISIBILITY.RESTRICTED,
  employee: VISIBILITY.RESTRICTED,
});

export function defaultVisibilityFor(entityType) {
  return DEFAULT_VISIBILITY_BY_ENTITY_TYPE[entityType] || VISIBILITY.INTERNAL;
}

export function isCapability(v) { return Object.values(CAPABILITY).includes(v); }
export function isVisibility(v) { return Object.values(VISIBILITY).includes(v); }
export function isAiContextTag(v) { return Object.values(AI_CONTEXT_TAG).includes(v); }
