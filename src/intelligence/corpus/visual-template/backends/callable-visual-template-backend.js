/* ============================================================
   CALLABLE-VISUAL-TEMPLATE-BACKEND.JS — PBSI Visual Template System
   (V2, Phase 5.x.6)

   A VisualTemplateBackend that persists templates SERVER-SIDE by
   delegating every operation to the `intelligenceVisualTemplate` Cloud
   Function (Admin SDK → RTDB /intelligence_visual_templates). The browser
   never writes that node directly (RTDB rule ".write": false);
   authorization (effective admin), the actor id, the authority metadata
   and the state machine are all enforced by the function from the
   verified Firebase context. Direct sibling of
   callable-style-guide-backend.js.

   STAGED: `intelligenceVisualTemplate` is authored but NOT wired into
   functions/index.js and NOT deployed (Phase 5.x.6 §33). This adapter is
   therefore unreachable in production today — it exists so the client seam
   is complete and testable against the CJS callable's .run().
   ============================================================ */

'use strict';

import { VISUAL_TEMPLATE_ERRORS, visualTemplateSuccess, visualTemplateFailure } from '../contracts/visual-template-store-contract.js';

export const CALLABLE_VISUAL_TEMPLATE_BACKEND_ID = 'callable';
export const CALLABLE_VISUAL_TEMPLATE_BACKEND_VERSION = 'visual-template-callable-backend@1';

function toEnvelope(raw) {
  if (raw && raw.ok === true) return visualTemplateSuccess(raw.data === undefined ? null : raw.data);
  if (raw && raw.ok === false && raw.error && typeof raw.error.code === 'string') {
    return visualTemplateFailure(raw.error.code, raw.error.message || '');
  }
  return visualTemplateFailure(VISUAL_TEMPLATE_ERRORS.INVALID_RECORD, 'visual template function returned an unrecognised result.');
}

/**
 * @param {{ callVisualTemplate: (payload: {op:string} & Record<string,*>) => Promise<{ok:boolean,data:*,error:*}> }} opts
 */
export function createCallableVisualTemplateBackend({ callVisualTemplate } = {}) {
  if (typeof callVisualTemplate !== 'function') {
    throw new Error('createCallableVisualTemplateBackend: callVisualTemplate port is required.');
  }

  function fromThrow(err) {
    const code = err && typeof err.code === 'string' ? err.code : '';
    const msg = err && err.message ? err.message : 'unknown';
    if (/permission-denied/.test(code)) return visualTemplateFailure(VISUAL_TEMPLATE_ERRORS.FORBIDDEN, msg);
    if (/invalid-argument/.test(code)) return visualTemplateFailure(VISUAL_TEMPLATE_ERRORS.INVALID_RECORD, msg);
    if (/not-found/.test(code)) return visualTemplateFailure(VISUAL_TEMPLATE_ERRORS.NOT_FOUND, msg);
    if (/failed-precondition|aborted/.test(code)) return visualTemplateFailure(VISUAL_TEMPLATE_ERRORS.ILLEGAL_TRANSITION, msg);
    return visualTemplateFailure(VISUAL_TEMPLATE_ERRORS.NO_BACKEND_CONFIGURED, `visual template function unavailable (${code || msg}).`);
  }

  async function call(payload) {
    let raw;
    try {
      raw = await callVisualTemplate(payload);
    } catch (err) {
      return fromThrow(err);
    }
    return toEnvelope(raw);
  }

  return Object.freeze({
    id: CALLABLE_VISUAL_TEMPLATE_BACKEND_ID,
    version: CALLABLE_VISUAL_TEMPLATE_BACKEND_VERSION,

    list(filter = {}) {
      const payload = { op: 'list' };
      if (filter && typeof filter === 'object') {
        if (filter.status != null) payload.status = filter.status;
        if (filter.documentType != null) payload.documentType = filter.documentType;
      }
      return call(payload);
    },

    get(templateId) {
      return call({ op: 'get', templateId: String(templateId || '') });
    },

    /** proposeFromEvidence({ patternId, supersedesTemplateId?, config? }) —
     *  the server rebuilds the visual aggregation from the caller's OWN
     *  corpus and looks the pattern up by id; the client cannot inject the
     *  geometry. */
    proposeFromEvidence(input = {}) {
      const patternId = input && typeof input === 'object' ? String(input.patternId || '') : '';
      if (!patternId) {
        return Promise.resolve(visualTemplateFailure(VISUAL_TEMPLATE_ERRORS.INVALID_RECORD, 'proposeFromEvidence: a `patternId` is required.'));
      }
      const payload = { op: 'proposeFromEvidence', patternId };
      if (input.supersedesTemplateId != null) payload.supersedesTemplateId = String(input.supersedesTemplateId);
      if (input.config && typeof input.config === 'object') payload.config = input.config;
      return call(payload);
    },

    approve(templateId, ctx = {}) {
      const payload = { op: 'approve', templateId: String(templateId || '') };
      if (ctx && typeof ctx.rationale === 'string') payload.rationale = ctx.rationale;
      if (ctx && typeof ctx.expectedVersion === 'number') payload.expectedVersion = ctx.expectedVersion;
      if (ctx && ctx.acknowledgeConflict === true) payload.acknowledgeConflict = true;
      return call(payload);
    },

    reject(templateId, ctx = {}) {
      const payload = { op: 'reject', templateId: String(templateId || '') };
      if (ctx && typeof ctx.reason === 'string') payload.reason = ctx.reason;
      if (ctx && typeof ctx.expectedVersion === 'number') payload.expectedVersion = ctx.expectedVersion;
      return call(payload);
    },

    deprecate(templateId, ctx = {}) {
      const payload = { op: 'deprecate', templateId: String(templateId || '') };
      if (ctx && typeof ctx.reason === 'string') payload.reason = ctx.reason;
      if (ctx && typeof ctx.expectedVersion === 'number') payload.expectedVersion = ctx.expectedVersion;
      return call(payload);
    },

    resolve(target = {}) {
      const t = target && typeof target === 'object' ? target : {};
      return call({
        op: 'resolve',
        scope: t.scope != null ? String(t.scope) : undefined,
        documentType: String(t.documentType || ''),
      });
    },

    history(templateId) {
      return call({ op: 'history', templateId: String(templateId || '') });
    },
  });
}
