/* ============================================================
   ENTITY-STATE-CONTRACT.JS — Body Intelligence (V2, Phase 12.5.1)

   PURPOSE: fix the closed set of values an Entity's `observedState` may
   hold. Deliberately NOT named "lifecycle" and deliberately carries no
   transition graph / canTransition() — see js/v2/body/README.md and the
   Phase 12.5 plan's §1 for the full argument. Knowledge's
   `lifecycleState` (lifecycle-contract.js) exists because THIS platform
   is the sole authority over when a KnowledgeItem becomes real — a human
   ReviewDecision, gated by canTransition(), is what makes that so. None of
   that is true for an Entity: a Vehicle's status changes in V1 with zero
   awareness of this platform, at any time, for reasons this platform does
   not decide and must never gate. Reusing "lifecycle" vocabulary here
   would silently imply this platform can move a Vehicle from one state to
   another, which is false and would violate CLAUDE.md's "AI is never the
   source of truth or final decision-maker."

   The only "transition" that exists for an Entity is: a sensor re-reads
   V1 and derives a (possibly different) `observedState` on the NEXT
   version — an ordinary repository append, never a gated request. There
   is no equivalent of HUMAN_GATED_STATES, no equivalent of a
   ReviewDecision, and body/ has no lifecycle/ directory.

   RESPONSIBILITY: define ENTITY_STATE and a structural validator. Per-
   entityType DERIVATION (which raw V1 field/value maps to which
   ENTITY_STATE) is deliberately NOT here — it lives as a small data table
   inside each real sensor file (e.g. sensors/vehicle-sensor.js), the same
   way domainType-specific behavior never lives in a *-registry.js file.

   WHY ONLY FIVE VALUES, NOT THE FULL BRIEF'S ELEVEN. Walked one by one
   against CLAUDE.md Principle 7 ("never invent business rules") in the
   Phase 12.5 plan:
     - active / inactive / archived / unknown — ship now: directly
       observable from a real V1 field on every pilot entity type.
     - pending — ship now: the honest rename of the brief's "temporary"
       intent, matching V1's own already-observed pending states
       (driver_requests.status==='pending', etc.) rather than inventing a
       new concept.
     - deprecated — REJECTED as a Body concept: it is Knowledge's word for
       "a human superseded this," and no V1 entity has an editorial
       supersession concept to observe.
     - current / past — NOT state values: "current" is just "the latest
       version" (already true by construction of an append-only
       repository); "past" is already covered by getHistory()/
       getVersion(). Adding either would duplicate History (see
       entity-contract.js's field table).
     - future / predicted — DEFERRED: no V1 source produces a forecast
       today; adding them would mean Body inventing forecasting logic.
     - desired — DEFERRED: inherently "what a human/AI wants this entity
       to become" — either unbuilt V1 product surface, or literally the AI
       asserting a goal, which is exactly what CLAUDE.md prohibits.
     - emergency — DEFERRED: no V1 concept exists to derive it from today;
       trivial to add as a 6th value once one does.
     - maintenance (a real V1 vehicle status, not in the brief's list
       verbatim) — folded into INACTIVE for the MVP rather than promoted
       to a type-specific top-level enum value; revisit only once >=2
       pilot types need a type-specific sub-state.

   DEPENDENCIES: none.

   NON-GOALS: no transition graph, no gate, no per-record write authority.

   FUTURE EVOLUTION: a 6th value (e.g. EMERGENCY) can be added the moment
   a real V1 source exists to derive it from — this file does not need to
   change shape to accommodate it, only the enum and the registry-backed
   per-sensor derivation tables that reference it.
   ============================================================ */

'use strict';

export const ENTITY_STATE_SCHEMA = 'entity-state@1';

export const ENTITY_STATE = Object.freeze({
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  PENDING: 'pending',
  ARCHIVED: 'archived',
  UNKNOWN: 'unknown',
});

/** Deliberately excluded, and why — see this file's header. Not consumed
 *  by any code; exists so a future reader finds the reasoning next to the
 *  enum it explains, instead of only in a plan document. */
export const DEFERRED_ENTITY_STATES = Object.freeze([
  'deprecated', 'current', 'past', 'future', 'predicted', 'desired', 'emergency',
]);

export function isEntityState(v) {
  return typeof v === 'string' && Object.values(ENTITY_STATE).includes(v);
}
