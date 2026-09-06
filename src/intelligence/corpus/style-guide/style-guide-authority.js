/* ============================================================
   STYLE-GUIDE-AUTHORITY.JS — PBSI NOR Style Guide (V2, Phase 5.x.5)

   PURPOSE: the pure, side-effect-free lifecycle-transition helpers the
   Memory backend and the server store both use to move a StyleRule
   through its state machine (contracts/style-guide-contract.js is the ONE
   authority on legal moves). Mirrors
   src/intelligence/corpus/corpus-observation-record.js#advanceObservationLifecycle
   and src/intelligence/nor-registry/nor-registry-record.js's markApproved
   / markPublished — a pure `{ next }` | `{ error }`.

   THE AUTHORITY GATE (§9, §10, §14):
     • only `proposed → approved` reaches authority, and ONLY with:
         - an authenticated actor id (server-derived — the caller passes
           auth.uid, never a client value)
         - a NON-EMPTY, NON-WHITESPACE human-written rationale
     • an AI-generated rationale is not human approval — this module never
       generates one; an empty / whitespace rationale is REJECTED (§10)
     • `rejected` / `deprecated` also record the actor and a reason (§10)
     • evidence, temporal evidence and provenance are PRESERVED across
       every transition (§11, §14)
     • server-owned fields (approvedAt/By, rejectedAt/By, deprecatedAt/By,
       authorityState, version) are set HERE from the ctx / the record —
       never copied from client input (§9)

   NON-GOALS: does not persist, does not check WHO may approve (the callable
   does, via canUseIntelligence), does not reserve anything, does not touch
   a sibling rule (the store composes supersede = approve-new +
   deprecate-old).

   DEPENDENCIES: ./contracts/style-guide-contract.js. PURE.
   ============================================================ */

'use strict';

import {
  STYLE_RULE_STATUS, STYLE_GUIDE_AUDIT_EVENTS,
  canStyleRuleTransition, isStyleRule, makeStyleRule, makeStyleRuleAuditEntry,
} from './contracts/style-guide-contract.js';

function nonEmpty(v) {
  return typeof v === 'string' && v.trim() ? v.trim() : '';
}

/**
 * proposed → approved. HUMAN approval (§9, §10, §14).
 *
 * @param {object} rule                the current StyleRule (loaded by the caller)
 * @param {object} ctx
 * @param {string} ctx.actorId         auth.uid — REQUIRED, server-derived
 * @param {string} ctx.rationale       human-written — REQUIRED, non-empty/non-whitespace
 * @param {string} [ctx.at]            ISO timestamp — server-derived
 * @returns {{ next: object }|{ error: string }}
 */
export function markApproved(rule, ctx = {}) {
  if (!isStyleRule(rule)) return { error: 'INVALID_RECORD' };
  if (!canStyleRuleTransition(rule.status, STYLE_RULE_STATUS.APPROVED)) return { error: 'ILLEGAL_TRANSITION' };
  const actorId = nonEmpty(ctx.actorId);
  if (!actorId) return { error: 'ACTOR_REQUIRED' };
  const rationale = nonEmpty(ctx.rationale);
  if (!rationale) return { error: 'RATIONALE_REQUIRED' }; // §10 — empty / whitespace-only rejected
  const when = ctx.at || new Date().toISOString();

  return {
    next: makeStyleRule({
      ...rule,
      status: STYLE_RULE_STATUS.APPROVED,
      // authorityState is re-derived by makeStyleRule — NEVER trusted from input (§9)
      rationale,
      approvedAt: when,
      approvedBy: actorId,
      auditTrail: [
        ...rule.auditTrail,
        makeStyleRuleAuditEntry({
          event: STYLE_GUIDE_AUDIT_EVENTS.APPROVED,
          at: when,
          actorId,
          fromStatus: rule.status,
          toStatus: STYLE_RULE_STATUS.APPROVED,
          version: rule.version,
          detail: { rationale, supersedesRuleId: rule.supersedesRuleId || null },
        }),
      ],
    }),
  };
}

/**
 * proposed → rejected. HUMAN decision (§8, §10). The proposal is kept —
 * "the fact that it was seen is itself information".
 *
 * @param {object} rule
 * @param {object} ctx  { actorId (REQUIRED), reason (REQUIRED, non-empty), at? }
 * @returns {{ next: object }|{ error: string }}
 */
export function markRejected(rule, ctx = {}) {
  if (!isStyleRule(rule)) return { error: 'INVALID_RECORD' };
  if (!canStyleRuleTransition(rule.status, STYLE_RULE_STATUS.REJECTED)) return { error: 'ILLEGAL_TRANSITION' };
  const actorId = nonEmpty(ctx.actorId);
  if (!actorId) return { error: 'ACTOR_REQUIRED' };
  const reason = nonEmpty(ctx.reason);
  if (!reason) return { error: 'REASON_REQUIRED' }; // §10 — preserve the reason
  const when = ctx.at || new Date().toISOString();

  return {
    next: makeStyleRule({
      ...rule,
      status: STYLE_RULE_STATUS.REJECTED,
      rejectedAt: when,
      rejectedBy: actorId,
      auditTrail: [
        ...rule.auditTrail,
        makeStyleRuleAuditEntry({
          event: STYLE_GUIDE_AUDIT_EVENTS.REJECTED,
          at: when,
          actorId,
          fromStatus: rule.status,
          toStatus: STYLE_RULE_STATUS.REJECTED,
          version: rule.version,
          detail: { reason },
        }),
      ],
    }),
  };
}

/**
 * approved → deprecated. HUMAN decision (§8, §10, §15). A previously
 * approved rule is no longer authoritative; it is RETAINED and queryable.
 * `supersededByRuleId` links it forward to the rule that replaced it
 * (§15) — set when a superseding proposal is approved.
 *
 * @param {object} rule
 * @param {object} ctx  { actorId (REQUIRED), reason (REQUIRED), at?, supersededByRuleId? }
 * @returns {{ next: object }|{ error: string }}
 */
export function markDeprecated(rule, ctx = {}) {
  if (!isStyleRule(rule)) return { error: 'INVALID_RECORD' };
  if (!canStyleRuleTransition(rule.status, STYLE_RULE_STATUS.DEPRECATED)) return { error: 'ILLEGAL_TRANSITION' };
  const actorId = nonEmpty(ctx.actorId);
  if (!actorId) return { error: 'ACTOR_REQUIRED' };
  const reason = nonEmpty(ctx.reason);
  if (!reason) return { error: 'REASON_REQUIRED' };
  const when = ctx.at || new Date().toISOString();
  const supersededByRuleId = ctx.supersededByRuleId == null ? null : String(ctx.supersededByRuleId);

  const auditTrail = [
    ...rule.auditTrail,
    makeStyleRuleAuditEntry({
      event: STYLE_GUIDE_AUDIT_EVENTS.DEPRECATED,
      at: when,
      actorId,
      fromStatus: rule.status,
      toStatus: STYLE_RULE_STATUS.DEPRECATED,
      version: rule.version,
      detail: { reason, supersededByRuleId },
    }),
  ];
  if (supersededByRuleId) {
    auditTrail.push(makeStyleRuleAuditEntry({
      event: STYLE_GUIDE_AUDIT_EVENTS.SUPERSEDED,
      at: when,
      actorId,
      fromStatus: STYLE_RULE_STATUS.DEPRECATED,
      toStatus: STYLE_RULE_STATUS.DEPRECATED,
      version: rule.version,
      detail: { supersededByRuleId, supersedesRuleId: rule.ruleId },
    }));
  }

  return {
    next: makeStyleRule({
      ...rule,
      status: STYLE_RULE_STATUS.DEPRECATED,
      deprecatedAt: when,
      deprecatedBy: actorId,
      supersededByRuleId,
      auditTrail,
    }),
  };
}
