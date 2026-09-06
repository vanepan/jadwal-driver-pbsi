/* ============================================================
   VISUAL-TEMPLATE-AUTHORITY.JS — PBSI Visual Template System
   (V2, Phase 5.x.6)

   PURPOSE: the pure lifecycle-transition helpers the Memory backend and
   the server store both use to move a VisualTemplate through its state
   machine (contracts/visual-template-contract.js is the ONE authority on
   legal moves). Direct sibling of src/intelligence/corpus/style-guide/
   style-guide-authority.js.

   THE AUTHORITY GATE (§11):
     • only `proposed → approved` reaches authority, and ONLY with:
         - an authenticated actor id (server-derived — the caller passes
           auth.uid, never a client value)
         - a NON-EMPTY, NON-WHITESPACE human-written rationale
     • an AI-generated rationale is not human approval — this module never
       generates one; an empty / whitespace rationale is REJECTED
     • `rejected` / `deprecated` also record the actor and a reason (§10)
     • geometry, evidence, temporal evidence and provenance are PRESERVED
       across every transition (§4, §13)
     • server-owned fields (approvedAt/By, rejectedAt/By, deprecatedAt/By,
       authorityState, version) are set HERE — never copied from client
       input (§11)

   DEPENDENCIES: ./contracts/visual-template-contract.js. PURE.
   ============================================================ */

'use strict';

import {
  VISUAL_TEMPLATE_STATUS, VISUAL_TEMPLATE_AUDIT_EVENTS,
  canVisualTemplateTransition, isVisualTemplate, makeVisualTemplate, makeVisualTemplateAuditEntry,
} from './contracts/visual-template-contract.js';

function nonEmpty(v) {
  return typeof v === 'string' && v.trim() ? v.trim() : '';
}

/** proposed → approved. HUMAN approval (§11). */
export function markApproved(template, ctx = {}) {
  if (!isVisualTemplate(template)) return { error: 'INVALID_RECORD' };
  if (!canVisualTemplateTransition(template.status, VISUAL_TEMPLATE_STATUS.APPROVED)) return { error: 'ILLEGAL_TRANSITION' };
  const actorId = nonEmpty(ctx.actorId);
  if (!actorId) return { error: 'ACTOR_REQUIRED' };
  const rationale = nonEmpty(ctx.rationale);
  if (!rationale) return { error: 'RATIONALE_REQUIRED' };
  const when = ctx.at || new Date().toISOString();

  return {
    next: makeVisualTemplate({
      ...template,
      status: VISUAL_TEMPLATE_STATUS.APPROVED,
      rationale,
      approvedAt: when,
      approvedBy: actorId,
      auditTrail: [
        ...template.auditTrail,
        makeVisualTemplateAuditEntry({
          event: VISUAL_TEMPLATE_AUDIT_EVENTS.APPROVED,
          at: when,
          actorId,
          fromStatus: template.status,
          toStatus: VISUAL_TEMPLATE_STATUS.APPROVED,
          version: template.templateVersion,
          detail: { rationale, supersedesTemplateId: template.supersedesTemplateId || null },
        }),
      ],
    }),
  };
}

/** proposed → rejected. HUMAN decision (§10). Retained. */
export function markRejected(template, ctx = {}) {
  if (!isVisualTemplate(template)) return { error: 'INVALID_RECORD' };
  if (!canVisualTemplateTransition(template.status, VISUAL_TEMPLATE_STATUS.REJECTED)) return { error: 'ILLEGAL_TRANSITION' };
  const actorId = nonEmpty(ctx.actorId);
  if (!actorId) return { error: 'ACTOR_REQUIRED' };
  const reason = nonEmpty(ctx.reason);
  if (!reason) return { error: 'REASON_REQUIRED' };
  const when = ctx.at || new Date().toISOString();

  return {
    next: makeVisualTemplate({
      ...template,
      status: VISUAL_TEMPLATE_STATUS.REJECTED,
      rejectedAt: when,
      rejectedBy: actorId,
      auditTrail: [
        ...template.auditTrail,
        makeVisualTemplateAuditEntry({
          event: VISUAL_TEMPLATE_AUDIT_EVENTS.REJECTED,
          at: when,
          actorId,
          fromStatus: template.status,
          toStatus: VISUAL_TEMPLATE_STATUS.REJECTED,
          version: template.templateVersion,
          detail: { reason },
        }),
      ],
    }),
  };
}

/** approved → deprecated. HUMAN decision (§10, §12). Retained + queryable. */
export function markDeprecated(template, ctx = {}) {
  if (!isVisualTemplate(template)) return { error: 'INVALID_RECORD' };
  if (!canVisualTemplateTransition(template.status, VISUAL_TEMPLATE_STATUS.DEPRECATED)) return { error: 'ILLEGAL_TRANSITION' };
  const actorId = nonEmpty(ctx.actorId);
  if (!actorId) return { error: 'ACTOR_REQUIRED' };
  const reason = nonEmpty(ctx.reason);
  if (!reason) return { error: 'REASON_REQUIRED' };
  const when = ctx.at || new Date().toISOString();
  const supersededByTemplateId = ctx.supersededByTemplateId == null ? null : String(ctx.supersededByTemplateId);

  const auditTrail = [
    ...template.auditTrail,
    makeVisualTemplateAuditEntry({
      event: VISUAL_TEMPLATE_AUDIT_EVENTS.DEPRECATED,
      at: when,
      actorId,
      fromStatus: template.status,
      toStatus: VISUAL_TEMPLATE_STATUS.DEPRECATED,
      version: template.templateVersion,
      detail: { reason, supersededByTemplateId },
    }),
  ];
  if (supersededByTemplateId) {
    auditTrail.push(makeVisualTemplateAuditEntry({
      event: VISUAL_TEMPLATE_AUDIT_EVENTS.SUPERSEDED,
      at: when,
      actorId,
      fromStatus: VISUAL_TEMPLATE_STATUS.DEPRECATED,
      toStatus: VISUAL_TEMPLATE_STATUS.DEPRECATED,
      version: template.templateVersion,
      detail: { supersededByTemplateId, supersedesTemplateId: template.templateId },
    }));
  }

  return {
    next: makeVisualTemplate({
      ...template,
      status: VISUAL_TEMPLATE_STATUS.DEPRECATED,
      deprecatedAt: when,
      deprecatedBy: actorId,
      supersededByTemplateId,
      auditTrail,
    }),
  };
}
