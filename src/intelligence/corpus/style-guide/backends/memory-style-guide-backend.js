/* ============================================================
   MEMORY-STYLE-GUIDE-BACKEND.JS — PBSI NOR Style Guide (V2, Phase 5.x.5)

   An in-process Style Guide backend with the REAL lifecycle
   (proposed → approved → deprecated / proposed → rejected), immutable
   audit trail, optimistic concurrency, deterministic conflict handling,
   and the deterministic effective-rule resolver. Used by the pure tests
   and by the client in DISABLED mode — so a test walks the full
   human-gated authority lifecycle without Firebase or the Admin SDK.

   SAFETY mirror of the server (functions/src/intelligence/styleGuideStore.js):
     • proposeFromMemory NEVER produces `approved` — status is always
       `proposed`; rationale / approvedBy / approvedAt stay null (§13, §22)
     • approve requires an authenticated actor + a non-empty human
       rationale (§9, §10)
     • approve FAILS CLOSED (CONFLICT_UNRESOLVED) if it would create a
       competing approved rule for the same slot and the caller neither
       supersedes the incumbent nor passes `acknowledgeConflict` (§14, §21)
     • approving a rule that carries `supersedesRuleId` auto-deprecates the
       named predecessor, linking it forward via `supersededByRuleId` (§15)
     • a decided rule (approved / rejected / deprecated) is immutable — a
       new value is a NEW proposal, never an in-place edit (§8, §15)

   `proposeFromMemory` here takes the Writing Memory ENTRY directly
   (`input.memory`) — there is no corpus to rebuild in-process. The server
   backend instead rebuilds Writing Memory from the caller's own corpus and
   looks the entry up by `memoryId` (zero-trust — §13, §26).
   ============================================================ */

'use strict';

import { STYLE_GUIDE_ERRORS, styleGuideSuccess, styleGuideFailure } from '../contracts/style-guide-store-contract.js';
import {
  STYLE_RULE_STATUS, isStyleRule, __style_guide_internals,
} from '../contracts/style-guide-contract.js';
import { makeStyleGuideProposalFromMemory } from '../style-guide-proposal.js';
import { markApproved, markRejected, markDeprecated } from '../style-guide-authority.js';
import { resolveEffectiveRule, getSupersessionChain, queryStyleGuide } from '../style-guide-query.js';

const { normValue } = __style_guide_internals;

export const MEMORY_STYLE_GUIDE_BACKEND_ID = 'memory';
export const MEMORY_STYLE_GUIDE_BACKEND_VERSION = 'style-guide-memory-backend@1';

/** @type {Map<string, object>} ruleId -> StyleRule */
const _store = new Map();

function effectiveValue(r) { return r.normalizedValue == null ? normValue(r.value) : r.normalizedValue; }

function slotPeers(rule) {
  return [..._store.values()].filter((r) =>
    r.ruleId !== rule.ruleId
    && r.scope === rule.scope
    && r.category === rule.category
    && r.key === rule.key
    && r.documentType === rule.documentType);
}

function versionGuard(rule, expectedVersion) {
  return typeof expectedVersion === 'number' && expectedVersion !== rule.version;
}

export const memoryStyleGuideBackend = Object.freeze({
  id: MEMORY_STYLE_GUIDE_BACKEND_ID,
  version: MEMORY_STYLE_GUIDE_BACKEND_VERSION,

  list(filter = {}) {
    return styleGuideSuccess(Object.freeze(queryStyleGuide([..._store.values()], filter || {})));
  },

  get(ruleId) {
    const r = _store.get(String(ruleId || ''));
    return r ? styleGuideSuccess(r) : styleGuideFailure(STYLE_GUIDE_ERRORS.NOT_FOUND, `No Style Guide rule "${ruleId}".`);
  },

  /** proposeFromMemory({ memory, actorId, now, supersedesRuleId }) — get-or-create a `proposed` rule. */
  proposeFromMemory(input = {}) {
    const memory = input && typeof input === 'object' ? input.memory : null;
    if (!memory || typeof memory !== 'object') {
      return styleGuideFailure(STYLE_GUIDE_ERRORS.INVALID_RECORD, 'proposeFromMemory: a `memory` (Writing Memory entry) is required.');
    }
    const supersedesRuleId = input.supersedesRuleId == null ? null : String(input.supersedesRuleId);
    let version = 1;
    if (supersedesRuleId) {
      const old = _store.get(supersedesRuleId);
      if (!old) return styleGuideFailure(STYLE_GUIDE_ERRORS.NOT_FOUND, `supersedesRuleId "${supersedesRuleId}" not found.`);
      if (old.status !== STYLE_RULE_STATUS.APPROVED) {
        return styleGuideFailure(STYLE_GUIDE_ERRORS.ILLEGAL_TRANSITION, 'A superseding proposal may only replace an APPROVED rule.');
      }
      if (memory.category !== old.category || String(memory.key || '') !== String(old.key || '') || memory.documentType !== old.documentType) {
        return styleGuideFailure(STYLE_GUIDE_ERRORS.INVALID_RECORD, 'A superseding proposal must target the SAME slot (scope/category/key/documentType).');
      }
      version = (old.version || 1) + 1;
    }

    const proposal = makeStyleGuideProposalFromMemory(memory, {
      at: input.now,
      actorId: input.actorId == null ? null : String(input.actorId),
      supersedesRuleId,
      version,
    });
    if (!proposal || !isStyleRule(proposal)) {
      return styleGuideFailure(STYLE_GUIDE_ERRORS.INVALID_RECORD, 'the Writing Memory entry did not yield a valid Style Guide proposal (needs a language category, verbatim value, and >= 1 evidence id).');
    }
    if (supersedesRuleId && proposal.supersedesRuleId === null) {
      return styleGuideFailure(STYLE_GUIDE_ERRORS.INVALID_RECORD, 'supersede link lost.');
    }

    const existing = _store.get(proposal.ruleId);
    if (existing) {
      if (existing.status === STYLE_RULE_STATUS.PROPOSED) return styleGuideSuccess(existing); // get-or-create — idempotent
      return styleGuideFailure(STYLE_GUIDE_ERRORS.RULE_EXISTS, `A rule "${proposal.ruleId}" already exists with status "${existing.status}". A new value is a new proposal; a changed value must SUPERSEDE this one.`);
    }
    _store.set(proposal.ruleId, proposal);
    return styleGuideSuccess(proposal);
  },

  /** approve(ruleId, { actorId, rationale, at, expectedVersion, acknowledgeConflict }) — proposed → approved. */
  approve(ruleId, ctx = {}) {
    const rule = _store.get(String(ruleId || ''));
    if (!rule) return styleGuideFailure(STYLE_GUIDE_ERRORS.NOT_FOUND, `No Style Guide rule "${ruleId}".`);
    if (versionGuard(rule, ctx.expectedVersion)) {
      return styleGuideFailure(STYLE_GUIDE_ERRORS.VERSION_CONFLICT, `expected version ${ctx.expectedVersion}, head is ${rule.version}.`);
    }

    // §14, §21 — a competing APPROVED value in the same slot must be resolved
    // EXPLICITLY: either this proposal supersedes it, or the human passes
    // acknowledgeConflict. Otherwise fail closed and preserve the conflict.
    const competingApproved = slotPeers(rule).filter((r) =>
      r.status === STYLE_RULE_STATUS.APPROVED
      && !r.supersededByRuleId
      && effectiveValue(r) !== effectiveValue(rule));
    const supersedesOne = rule.supersedesRuleId && competingApproved.some((r) => r.ruleId === rule.supersedesRuleId);
    if (competingApproved.length && !supersedesOne && ctx.acknowledgeConflict !== true) {
      return styleGuideFailure(
        STYLE_GUIDE_ERRORS.CONFLICT_UNRESOLVED,
        `Approving would create a competing approved rule for this slot (${competingApproved.map((r) => r.ruleId).join(', ')}). Supersede the incumbent, or pass acknowledgeConflict to keep both and let the resolver report a conflict.`,
      );
    }

    const { next, error } = markApproved(rule, { actorId: ctx.actorId, rationale: ctx.rationale, at: ctx.at });
    if (error) return styleGuideFailure(STYLE_GUIDE_ERRORS[error] || STYLE_GUIDE_ERRORS.ILLEGAL_TRANSITION, `approve refused: ${error}.`);
    _store.set(next.ruleId, next);

    // §15 — approving a superseding proposal auto-deprecates the predecessor.
    if (next.supersedesRuleId) {
      const old = _store.get(next.supersedesRuleId);
      if (old && old.status === STYLE_RULE_STATUS.APPROVED) {
        const dep = markDeprecated(old, {
          actorId: ctx.actorId, at: ctx.at,
          reason: `Superseded by ${next.ruleId}.`,
          supersededByRuleId: next.ruleId,
        });
        if (dep.next) _store.set(dep.next.ruleId, dep.next);
      }
    }
    return styleGuideSuccess(_store.get(next.ruleId));
  },

  /** reject(ruleId, { actorId, reason, at, expectedVersion }) — proposed → rejected. */
  reject(ruleId, ctx = {}) {
    const rule = _store.get(String(ruleId || ''));
    if (!rule) return styleGuideFailure(STYLE_GUIDE_ERRORS.NOT_FOUND, `No Style Guide rule "${ruleId}".`);
    if (versionGuard(rule, ctx.expectedVersion)) {
      return styleGuideFailure(STYLE_GUIDE_ERRORS.VERSION_CONFLICT, `expected version ${ctx.expectedVersion}, head is ${rule.version}.`);
    }
    const { next, error } = markRejected(rule, { actorId: ctx.actorId, reason: ctx.reason, at: ctx.at });
    if (error) return styleGuideFailure(STYLE_GUIDE_ERRORS[error] || STYLE_GUIDE_ERRORS.ILLEGAL_TRANSITION, `reject refused: ${error}.`);
    _store.set(next.ruleId, next);
    return styleGuideSuccess(next);
  },

  /** deprecate(ruleId, { actorId, reason, at, expectedVersion }) — approved → deprecated (retire without replacement). */
  deprecate(ruleId, ctx = {}) {
    const rule = _store.get(String(ruleId || ''));
    if (!rule) return styleGuideFailure(STYLE_GUIDE_ERRORS.NOT_FOUND, `No Style Guide rule "${ruleId}".`);
    if (versionGuard(rule, ctx.expectedVersion)) {
      return styleGuideFailure(STYLE_GUIDE_ERRORS.VERSION_CONFLICT, `expected version ${ctx.expectedVersion}, head is ${rule.version}.`);
    }
    const { next, error } = markDeprecated(rule, {
      actorId: ctx.actorId, reason: ctx.reason, at: ctx.at,
      supersededByRuleId: ctx.supersededByRuleId == null ? null : String(ctx.supersededByRuleId),
    });
    if (error) return styleGuideFailure(STYLE_GUIDE_ERRORS[error] || STYLE_GUIDE_ERRORS.ILLEGAL_TRANSITION, `deprecate refused: ${error}.`);
    _store.set(next.ruleId, next);
    return styleGuideSuccess(next);
  },

  /** resolve({ scope, category, key, documentType }) — effective-rule resolution. */
  resolve(target = {}) {
    return styleGuideSuccess(resolveEffectiveRule([..._store.values()], target || {}));
  },

  /** history(ruleId) — the supersession chain (oldest → newest). */
  history(ruleId) {
    return styleGuideSuccess(Object.freeze(getSupersessionChain([..._store.values()], String(ruleId || ''))));
  },
});

/** Test/teardown helper — clears all in-memory rules. */
export function resetMemoryStyleGuideBackend() {
  _store.clear();
}
