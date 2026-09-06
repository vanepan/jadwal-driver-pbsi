/* ============================================================
   STYLE-GUIDE-STORE-CONTRACT.JS — PBSI NOR Style Guide (V2, Phase 5.x.5)

   PURPOSE: fix the ONE interface every Style Guide backend implements
   (Null now; a Memory backend for tests / DISABLED mode; a server-backed
   callable backend later), plus the StyleGuideResult envelope — mirroring
   src/intelligence/corpus/contracts/corpus-store-contract.js and
   src/intelligence/nor-registry/contracts/registry-contract.js so swapping
   the store is a registry selection, not a caller-code change.

   THE METHOD SET (§18 — only what this phase justifies):

     list               read rules (organization-wide; status / category /
                        documentType filters — §20)
     get                read one rule by id
     proposeFromMemory  create a `proposed` rule FROM a Writing Memory
                        entry (the one allowed upstream integration — §13,
                        §26). NEVER creates an `approved` rule.
     approve            proposed → approved. Requires an authenticated
                        actor + a non-empty human rationale (§9, §10). Fails
                        closed on an unresolved slot conflict (§14, §21).
     reject             proposed → rejected (actor + reason preserved — §10)
     deprecate          approved → deprecated (actor + reason preserved;
                        retained + queryable — §15)
     resolve            deterministic effective-rule resolution for a slot:
                        resolved | conflict | missing (§21)
     history            the supersession chain for a rule id (§15)

   There is deliberately NO method that writes an `approved` rule directly,
   no bulk-approve, no "promote candidate", and no client-authored raw
   proposal — every rule is provably Writing-Memory-derived (§13, §22).

   RESPONSIBILITY: STYLE_GUIDE_STORE_SCHEMA, STYLE_GUIDE_ERRORS,
   styleGuideSuccess / styleGuideFailure, STYLE_GUIDE_STORE_CONTRACT,
   isStyleGuideBackend.

   DEPENDENCIES: none.
   ============================================================ */

'use strict';

export const STYLE_GUIDE_STORE_SCHEMA = 'style-guide-store@1';

export const STYLE_GUIDE_ERRORS = Object.freeze({
  NO_BACKEND_CONFIGURED: 'NO_BACKEND_CONFIGURED',
  NOT_FOUND: 'NOT_FOUND',
  FORBIDDEN: 'FORBIDDEN',                       // authorization failure (not an effective admin)
  INVALID_RECORD: 'INVALID_RECORD',
  ILLEGAL_TRANSITION: 'ILLEGAL_TRANSITION',     // the requested status move is not legal
  VERSION_CONFLICT: 'VERSION_CONFLICT',         // stale expectedVersion — optimistic-concurrency guard
  RATIONALE_REQUIRED: 'RATIONALE_REQUIRED',     // approve without a non-empty human rationale (§10)
  REASON_REQUIRED: 'REASON_REQUIRED',           // reject / deprecate without a reason (§10)
  ACTOR_REQUIRED: 'ACTOR_REQUIRED',             // no authenticated actor (§9)
  CONFLICT_UNRESOLVED: 'CONFLICT_UNRESOLVED',   // approve would create a competing approved rule without an explicit human decision (§14, §21)
  RULE_EXISTS: 'RULE_EXISTS',                   // proposeFromMemory hit an id that is already decided (approved / rejected / deprecated)
  MEMORY_NOT_FOUND: 'MEMORY_NOT_FOUND',         // the requested Writing Memory entry is not in the caller's own corpus view
  WRITING_MEMORY_UNAVAILABLE: 'WRITING_MEMORY_UNAVAILABLE', // the server-side Writing Memory builder is not wired (fail safe)
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
});

/**
 * @typedef {Object} StyleGuideResult
 * @property {boolean} ok
 * @property {*} data
 * @property {{code: string, message: string}|null} error
 */

export function styleGuideSuccess(data) {
  return Object.freeze({ ok: true, data: data ?? null, error: null });
}

export function styleGuideFailure(code, message) {
  return Object.freeze({ ok: false, data: null, error: Object.freeze({ code, message: String(message || '') }) });
}

/**
 * @typedef {Object} StyleGuideBackend
 * @property {string} id
 * @property {string} version
 * @property {(filter?: object) => StyleGuideResult} list
 * @property {(ruleId: string) => StyleGuideResult} get
 * @property {(input: {memory?: object, memoryId?: string, actorId?: string, now?: string, supersedesRuleId?: string}) => StyleGuideResult} proposeFromMemory
 * @property {(ruleId: string, ctx: {actorId?: string, rationale: string, at?: string, expectedVersion?: number, acknowledgeConflict?: boolean}) => StyleGuideResult} approve
 * @property {(ruleId: string, ctx: {actorId?: string, reason: string, at?: string, expectedVersion?: number}) => StyleGuideResult} reject
 * @property {(ruleId: string, ctx: {actorId?: string, reason: string, at?: string, expectedVersion?: number}) => StyleGuideResult} deprecate
 * @property {(target: {scope?: string, category: string, key: string, documentType: string}) => StyleGuideResult} resolve
 * @property {(ruleId: string) => StyleGuideResult} history
 */

export const STYLE_GUIDE_STORE_CONTRACT = Object.freeze({
  schema: STYLE_GUIDE_STORE_SCHEMA,
  methods: Object.freeze([
    'list', 'get', 'proposeFromMemory', 'approve', 'reject', 'deprecate', 'resolve', 'history',
  ]),
  errorCodes: STYLE_GUIDE_ERRORS,
});

/** Structural check that an object satisfies the backend contract. */
export function isStyleGuideBackend(b) {
  if (!b || typeof b !== 'object') return false;
  if (typeof b.id !== 'string' || !b.id) return false;
  if (typeof b.version !== 'string' || !b.version) return false;
  return STYLE_GUIDE_STORE_CONTRACT.methods.every((m) => typeof b[m] === 'function');
}
