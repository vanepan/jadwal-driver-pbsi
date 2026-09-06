/* ============================================================
   MEMORY-VISUAL-TEMPLATE-BACKEND.JS — PBSI Visual Template System
   (V2, Phase 5.x.6)

   An in-process Visual Template backend with the REAL lifecycle
   (proposed → approved → deprecated / proposed → rejected), immutable
   audit trail, optimistic concurrency, deterministic conflict handling,
   and the deterministic effective-template resolver. Used by the pure
   tests and by the client in DISABLED mode. Direct sibling of
   memory-style-guide-backend.js.

   SAFETY mirror of the server (functions/src/intelligence/visualTemplateStore.js):
     • proposeFromEvidence NEVER produces `approved` (§13, §21)
     • approve requires an authenticated actor + a non-empty human
       rationale (§11)
     • approve FAILS CLOSED (CONFLICT_UNRESOLVED) if it would create a
       competing approved layout for the same slot and the caller neither
       supersedes the incumbent nor passes `acknowledgeConflict` (§21)
     • approving a template that carries `supersedesTemplateId`
       auto-deprecates the named predecessor (§12)
     • a decided template (approved / rejected / deprecated) is immutable —
       a new layout is a NEW proposal (§10, §12)

   `proposeFromEvidence` here takes the aggregated pattern directly
   (`input.pattern`). The server backend instead rebuilds the aggregation
   from the caller's own corpus and looks the pattern up by `patternId`
   (zero-trust — §13, §27).
   ============================================================ */

'use strict';

import { VISUAL_TEMPLATE_ERRORS, visualTemplateSuccess, visualTemplateFailure } from '../contracts/visual-template-store-contract.js';
import { VISUAL_TEMPLATE_STATUS, isVisualTemplate } from '../contracts/visual-template-contract.js';
import { makeVisualTemplateProposalFromPattern } from '../visual-template-proposal.js';
import { markApproved, markRejected, markDeprecated } from '../visual-template-authority.js';
import { resolveEffectiveTemplate, getVisualTemplateHistory, queryVisualTemplates } from '../visual-template-query.js';

export const MEMORY_VISUAL_TEMPLATE_BACKEND_ID = 'memory';
export const MEMORY_VISUAL_TEMPLATE_BACKEND_VERSION = 'visual-template-memory-backend@1';

/** @type {Map<string, object>} templateId -> VisualTemplate */
const _store = new Map();

function slotPeers(template) {
  return [..._store.values()].filter((t) =>
    t.templateId !== template.templateId
    && t.scope === template.scope
    && t.documentType === template.documentType);
}
function versionGuard(template, expectedVersion) {
  return typeof expectedVersion === 'number' && expectedVersion !== template.templateVersion;
}

export const memoryVisualTemplateBackend = Object.freeze({
  id: MEMORY_VISUAL_TEMPLATE_BACKEND_ID,
  version: MEMORY_VISUAL_TEMPLATE_BACKEND_VERSION,

  list(filter = {}) {
    return visualTemplateSuccess(Object.freeze(queryVisualTemplates([..._store.values()], filter || {})));
  },

  get(templateId) {
    const t = _store.get(String(templateId || ''));
    return t ? visualTemplateSuccess(t) : visualTemplateFailure(VISUAL_TEMPLATE_ERRORS.NOT_FOUND, `No Visual Template "${templateId}".`);
  },

  /** proposeFromEvidence({ pattern, actorId, now, supersedesTemplateId }). */
  proposeFromEvidence(input = {}) {
    const pattern = input && typeof input === 'object' ? input.pattern : null;
    if (!pattern || typeof pattern !== 'object') {
      return visualTemplateFailure(VISUAL_TEMPLATE_ERRORS.INVALID_RECORD, 'proposeFromEvidence: a `pattern` (aggregated visual pattern) is required.');
    }
    const supersedesTemplateId = input.supersedesTemplateId == null ? null : String(input.supersedesTemplateId);
    let version = 1;
    if (supersedesTemplateId) {
      const old = _store.get(supersedesTemplateId);
      if (!old) return visualTemplateFailure(VISUAL_TEMPLATE_ERRORS.NOT_FOUND, `supersedesTemplateId "${supersedesTemplateId}" not found.`);
      if (old.status !== VISUAL_TEMPLATE_STATUS.APPROVED) {
        return visualTemplateFailure(VISUAL_TEMPLATE_ERRORS.ILLEGAL_TRANSITION, 'A superseding proposal may only replace an APPROVED template.');
      }
      if (pattern.documentType !== old.documentType) {
        return visualTemplateFailure(VISUAL_TEMPLATE_ERRORS.INVALID_RECORD, 'A superseding proposal must target the SAME slot (scope/documentType).');
      }
      version = (old.templateVersion || 1) + 1;
    }

    const proposal = makeVisualTemplateProposalFromPattern(pattern, {
      at: input.now,
      actorId: input.actorId == null ? null : String(input.actorId),
      supersedesTemplateId,
      version,
    });
    if (!proposal || !isVisualTemplate(proposal)) {
      return visualTemplateFailure(VISUAL_TEMPLATE_ERRORS.INVALID_RECORD, 'the visual pattern did not yield a valid Visual Template proposal (needs a variant label + >= 1 source document / observation id).');
    }

    const existing = _store.get(proposal.templateId);
    if (existing) {
      if (existing.status === VISUAL_TEMPLATE_STATUS.PROPOSED) return visualTemplateSuccess(existing); // get-or-create — idempotent
      return visualTemplateFailure(VISUAL_TEMPLATE_ERRORS.TEMPLATE_EXISTS, `A template "${proposal.templateId}" already exists with status "${existing.status}". A changed layout must SUPERSEDE this one.`);
    }
    _store.set(proposal.templateId, proposal);
    return visualTemplateSuccess(proposal);
  },

  /** approve(templateId, { actorId, rationale, at, expectedVersion, acknowledgeConflict }). */
  approve(templateId, ctx = {}) {
    const template = _store.get(String(templateId || ''));
    if (!template) return visualTemplateFailure(VISUAL_TEMPLATE_ERRORS.NOT_FOUND, `No Visual Template "${templateId}".`);
    if (versionGuard(template, ctx.expectedVersion)) {
      return visualTemplateFailure(VISUAL_TEMPLATE_ERRORS.VERSION_CONFLICT, `expected version ${ctx.expectedVersion}, head is ${template.templateVersion}.`);
    }

    // §21 — a competing APPROVED layout in the same slot must be resolved
    // EXPLICITLY: either this proposal supersedes it, or the human passes
    // acknowledgeConflict. Otherwise fail closed and preserve the conflict.
    const competingApproved = slotPeers(template).filter((t) =>
      t.status === VISUAL_TEMPLATE_STATUS.APPROVED
      && !t.supersededByTemplateId
      && t.variant !== template.variant);
    const supersedesOne = template.supersedesTemplateId && competingApproved.some((t) => t.templateId === template.supersedesTemplateId);
    if (competingApproved.length && !supersedesOne && ctx.acknowledgeConflict !== true) {
      return visualTemplateFailure(
        VISUAL_TEMPLATE_ERRORS.CONFLICT_UNRESOLVED,
        `Approving would create a competing approved template for this slot (${competingApproved.map((t) => t.templateId).join(', ')}). Supersede the incumbent, or pass acknowledgeConflict.`,
      );
    }

    const { next, error } = markApproved(template, { actorId: ctx.actorId, rationale: ctx.rationale, at: ctx.at });
    if (error) return visualTemplateFailure(VISUAL_TEMPLATE_ERRORS[error] || VISUAL_TEMPLATE_ERRORS.ILLEGAL_TRANSITION, `approve refused: ${error}.`);
    _store.set(next.templateId, next);

    // §12 — approving a superseding proposal auto-deprecates the predecessor.
    if (next.supersedesTemplateId) {
      const old = _store.get(next.supersedesTemplateId);
      if (old && old.status === VISUAL_TEMPLATE_STATUS.APPROVED) {
        const dep = markDeprecated(old, {
          actorId: ctx.actorId, at: ctx.at,
          reason: `Superseded by ${next.templateId}.`,
          supersededByTemplateId: next.templateId,
        });
        if (dep.next) _store.set(dep.next.templateId, dep.next);
      }
    }
    return visualTemplateSuccess(_store.get(next.templateId));
  },

  reject(templateId, ctx = {}) {
    const template = _store.get(String(templateId || ''));
    if (!template) return visualTemplateFailure(VISUAL_TEMPLATE_ERRORS.NOT_FOUND, `No Visual Template "${templateId}".`);
    if (versionGuard(template, ctx.expectedVersion)) {
      return visualTemplateFailure(VISUAL_TEMPLATE_ERRORS.VERSION_CONFLICT, `expected version ${ctx.expectedVersion}, head is ${template.templateVersion}.`);
    }
    const { next, error } = markRejected(template, { actorId: ctx.actorId, reason: ctx.reason, at: ctx.at });
    if (error) return visualTemplateFailure(VISUAL_TEMPLATE_ERRORS[error] || VISUAL_TEMPLATE_ERRORS.ILLEGAL_TRANSITION, `reject refused: ${error}.`);
    _store.set(next.templateId, next);
    return visualTemplateSuccess(next);
  },

  deprecate(templateId, ctx = {}) {
    const template = _store.get(String(templateId || ''));
    if (!template) return visualTemplateFailure(VISUAL_TEMPLATE_ERRORS.NOT_FOUND, `No Visual Template "${templateId}".`);
    if (versionGuard(template, ctx.expectedVersion)) {
      return visualTemplateFailure(VISUAL_TEMPLATE_ERRORS.VERSION_CONFLICT, `expected version ${ctx.expectedVersion}, head is ${template.templateVersion}.`);
    }
    const { next, error } = markDeprecated(template, {
      actorId: ctx.actorId, reason: ctx.reason, at: ctx.at,
      supersededByTemplateId: ctx.supersededByTemplateId == null ? null : String(ctx.supersededByTemplateId),
    });
    if (error) return visualTemplateFailure(VISUAL_TEMPLATE_ERRORS[error] || VISUAL_TEMPLATE_ERRORS.ILLEGAL_TRANSITION, `deprecate refused: ${error}.`);
    _store.set(next.templateId, next);
    return visualTemplateSuccess(next);
  },

  resolve(target = {}) {
    return visualTemplateSuccess(resolveEffectiveTemplate([..._store.values()], target || {}));
  },

  history(templateId) {
    return visualTemplateSuccess(Object.freeze(getVisualTemplateHistory([..._store.values()], String(templateId || ''))));
  },
});

/** Test/teardown helper — clears all in-memory templates. */
export function resetMemoryVisualTemplateBackend() {
  _store.clear();
}
