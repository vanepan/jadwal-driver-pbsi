/* ============================================================
   CALLABLE-STYLE-GUIDE-BACKEND.JS — PBSI NOR Style Guide (V2, Phase 5.x.5)

   A StyleGuideBackend that persists rules SERVER-SIDE by delegating every
   operation to the `intelligenceStyleGuide` Cloud Function (Admin SDK →
   RTDB /intelligence_style_guide). The browser never writes that node
   directly (RTDB rule ".write": false); authorization (effective admin),
   the actor id, the authority metadata and the state machine are all
   enforced by the function from the verified Firebase context.

   Direct sibling of callable-corpus-backend.js / callable-nor-registry-
   backend.js — same idiom: map the function's { ok, data, error } into the
   StyleGuideResult envelope; a transport that throws (offline,
   function-not-found, permission-denied) becomes a typed failure and is
   NEVER re-thrown.

   STAGED: `intelligenceStyleGuide` is authored but NOT wired into
   functions/index.js and NOT deployed (Phase 5.x.5 §28). This adapter is
   therefore unreachable in production today — it exists so the client seam
   is complete and testable against the CJS callable's .run().
   ============================================================ */

'use strict';

import { STYLE_GUIDE_ERRORS, styleGuideSuccess, styleGuideFailure } from '../contracts/style-guide-store-contract.js';

export const CALLABLE_STYLE_GUIDE_BACKEND_ID = 'callable';
export const CALLABLE_STYLE_GUIDE_BACKEND_VERSION = 'style-guide-callable-backend@1';

function toEnvelope(raw) {
  if (raw && raw.ok === true) return styleGuideSuccess(raw.data === undefined ? null : raw.data);
  if (raw && raw.ok === false && raw.error && typeof raw.error.code === 'string') {
    return styleGuideFailure(raw.error.code, raw.error.message || '');
  }
  return styleGuideFailure(STYLE_GUIDE_ERRORS.INVALID_RECORD, 'style guide function returned an unrecognised result.');
}

/**
 * @param {{ callStyleGuide: (payload: {op:string} & Record<string,*>) => Promise<{ok:boolean,data:*,error:*}> }} opts
 */
export function createCallableStyleGuideBackend({ callStyleGuide } = {}) {
  if (typeof callStyleGuide !== 'function') {
    throw new Error('createCallableStyleGuideBackend: callStyleGuide port is required.');
  }

  function fromThrow(err) {
    const code = err && typeof err.code === 'string' ? err.code : '';
    const msg = err && err.message ? err.message : 'unknown';
    if (/permission-denied/.test(code)) return styleGuideFailure(STYLE_GUIDE_ERRORS.FORBIDDEN, msg);
    if (/invalid-argument/.test(code)) return styleGuideFailure(STYLE_GUIDE_ERRORS.INVALID_RECORD, msg);
    if (/not-found/.test(code)) return styleGuideFailure(STYLE_GUIDE_ERRORS.NOT_FOUND, msg);
    if (/failed-precondition|aborted/.test(code)) return styleGuideFailure(STYLE_GUIDE_ERRORS.ILLEGAL_TRANSITION, msg);
    return styleGuideFailure(STYLE_GUIDE_ERRORS.NO_BACKEND_CONFIGURED, `style guide function unavailable (${code || msg}).`);
  }

  async function call(payload) {
    let raw;
    try {
      raw = await callStyleGuide(payload);
    } catch (err) {
      return fromThrow(err);
    }
    return toEnvelope(raw);
  }

  return Object.freeze({
    id: CALLABLE_STYLE_GUIDE_BACKEND_ID,
    version: CALLABLE_STYLE_GUIDE_BACKEND_VERSION,

    list(filter = {}) {
      const payload = { op: 'list' };
      if (filter && typeof filter === 'object') {
        if (filter.status != null) payload.status = filter.status;
        if (filter.category != null) payload.category = filter.category;
        if (filter.documentType != null) payload.documentType = filter.documentType;
      }
      return call(payload);
    },

    get(ruleId) {
      return call({ op: 'get', ruleId: String(ruleId || '') });
    },

    /** proposeFromMemory({ memoryId, supersedesRuleId?, config?, approvedRules? })
     *  — the server rebuilds Writing Memory from the caller's OWN corpus and
     *  looks the entry up by id; the client cannot inject the evidence. */
    proposeFromMemory(input = {}) {
      const memoryId = input && typeof input === 'object' ? String(input.memoryId || '') : '';
      if (!memoryId) {
        return Promise.resolve(styleGuideFailure(STYLE_GUIDE_ERRORS.INVALID_RECORD, 'proposeFromMemory: a `memoryId` is required.'));
      }
      const payload = { op: 'proposeFromMemory', memoryId };
      if (input.supersedesRuleId != null) payload.supersedesRuleId = String(input.supersedesRuleId);
      if (input.config && typeof input.config === 'object') payload.config = input.config;
      if (Array.isArray(input.approvedRules)) payload.approvedRules = input.approvedRules;
      return call(payload);
    },

    approve(ruleId, ctx = {}) {
      const payload = { op: 'approve', ruleId: String(ruleId || '') };
      if (ctx && typeof ctx.rationale === 'string') payload.rationale = ctx.rationale;
      if (ctx && typeof ctx.expectedVersion === 'number') payload.expectedVersion = ctx.expectedVersion;
      if (ctx && ctx.acknowledgeConflict === true) payload.acknowledgeConflict = true;
      return call(payload);
    },

    reject(ruleId, ctx = {}) {
      const payload = { op: 'reject', ruleId: String(ruleId || '') };
      if (ctx && typeof ctx.reason === 'string') payload.reason = ctx.reason;
      if (ctx && typeof ctx.expectedVersion === 'number') payload.expectedVersion = ctx.expectedVersion;
      return call(payload);
    },

    deprecate(ruleId, ctx = {}) {
      const payload = { op: 'deprecate', ruleId: String(ruleId || '') };
      if (ctx && typeof ctx.reason === 'string') payload.reason = ctx.reason;
      if (ctx && typeof ctx.expectedVersion === 'number') payload.expectedVersion = ctx.expectedVersion;
      return call(payload);
    },

    resolve(target = {}) {
      const t = target && typeof target === 'object' ? target : {};
      return call({
        op: 'resolve',
        scope: t.scope != null ? String(t.scope) : undefined,
        category: String(t.category || ''),
        key: String(t.key || ''),
        documentType: String(t.documentType || ''),
      });
    },

    history(ruleId) {
      return call({ op: 'history', ruleId: String(ruleId || '') });
    },
  });
}
