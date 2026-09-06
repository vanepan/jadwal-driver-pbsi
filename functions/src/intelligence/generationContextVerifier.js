'use strict';

/* ============================================================
   functions/src/intelligence/generationContextVerifier.js — Phase 6A

   THE PHASE 6A DRAFT SERVER CROSS-CHECK (§15).

   `intelligenceNorDraft.create` must not blindly persist a client-supplied
   `record.provenance.generationContext` as if it were authoritative — a
   client (or a caller that bypasses the real console entirely and calls
   the callable directly) could submit ANY JSON claiming certification.

   This module answers exactly one question: is a submitted
   `intelligence-generation-context@1` INTERNALLY LEGITIMATE — does every
   authority claim it makes (a certified Style Guide rule, an approved
   Visual Template) still exist, in the exact form claimed, in the
   canonical stores?

   IT DOES NOT RE-RUN RETRIEVAL (§9, §26). It performs cheap, POINT lookups
   by id (styleGuideStore.getRule / visualTemplateStore.getTemplate) —
   fundamentally different from re-composing the whole certified context —
   and a structural + field-level comparison. It never re-derives a
   different context and never repairs a bad one (§15: "do not silently
   repair a forged context into something else — fail closed").

   STALE vs FORGED (§16 — the Phase 6 contract treats a generation
   context as a GENERATION-TIME SNAPSHOT retained for audit, not a live
   view — see docs/V2_SARPRAS_INTELLIGENCE_PHASE_6_…md §12/§22). The chosen
   policy, made explicit here:
     • a referenced ruleId/templateId that no longer resolves, or resolves
       to a DIFFERENT value/geometry than claimed        → INVALID (forged)
     • a referenced ruleId/templateId that resolves but is no longer
       `approved` (deprecated/rejected/superseded AFTER generation), or
       whose version has moved on                        → STALE
   Both REJECT the create. The snapshot is preserved ONLY when every claim
   in it still verifies — Phase 6A does not implement a "generate now,
   persist whatever was true then" bypass; a stale snapshot must be
   re-generated (a fresh `intelligenceNorGeneration` call) before the draft
   can be created. This is the safer of the two documented options (§16)
   and needs no new storage.

   RESPONSIBILITY: verifyGenerationContext(db, generationContext,
   { documentType }) → { ok:true } | { ok:false, code, message }.

   DEPENDENCIES: ./generationContextContract (isGenerationContext,
   GENERATION_STYLE_SLOT), ./styleGuideStore (getRule, READ-ONLY),
   ./visualTemplateStore (getTemplate, READ-ONLY). Performs NO write.
   ============================================================ */

const { isGenerationContext } = require('./generationContextContract');
const styleGuideStore = require('./styleGuideStore');
const visualTemplateStore = require('./visualTemplateStore');
const { DRAFT_STORE_ERRORS } = require('./norDraftContract');

/** §27 — typed, distinct from every other DRAFT_STORE_ERRORS code. Same
 *  UPPER_SNAKE convention as every existing DRAFT_STORE_ERRORS member
 *  (norDraftContract.js) — these two ARE DRAFT_STORE_ERRORS members,
 *  reused verbatim here so the verifier and the callable never drift. */
const VERIFY_ERRORS = Object.freeze({
  INVALID: DRAFT_STORE_ERRORS.INVALID_GENERATION_CONTEXT,
  STALE: DRAFT_STORE_ERRORS.STALE_GENERATION_CONTEXT,
});

function fail(code, message) { return Object.freeze({ ok: false, code, message }); }
const OK = Object.freeze({ ok: true, code: null, message: null });

function deepEqual(a, b) {
  try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
}

/** A style rule slot's documentType matches, directly or via the SAME
 *  cross_type fallback the context itself recorded (§16 of Phase 6 —
 *  viaCrossType is disclosed, never a reason to reject). */
function docTypeCompatible(recordDocType, slotDocType, viaCrossType) {
  if (recordDocType === slotDocType) return true;
  return viaCrossType === true && recordDocType === 'cross_type';
}

/**
 * Verify ONE certified style slot against the live Style Guide record.
 * A slot that is not `certified_style_rule` needs no lookup (§9 — a
 * non-authoritative slot claims nothing to verify).
 */
async function verifyStyleSlot(db, slot, documentType) {
  if (!slot || slot.source !== 'certified_style_rule') return OK;
  if (typeof slot.ruleId !== 'string' || !slot.ruleId) {
    return fail(VERIFY_ERRORS.INVALID, 'A certified style slot is missing its ruleId.');
  }
  let res;
  try { res = await styleGuideStore.getRule(db, slot.ruleId); } catch { res = null; }
  if (!res || !res.ok || !res.data) {
    return fail(VERIFY_ERRORS.INVALID, `Style Guide rule "${slot.ruleId}" does not exist.`);
  }
  const rule = res.data;
  if (rule.status !== 'approved') {
    return fail(VERIFY_ERRORS.STALE, `Style Guide rule "${slot.ruleId}" is no longer approved.`);
  }
  if (rule.version !== slot.version) {
    return fail(VERIFY_ERRORS.STALE, `Style Guide rule "${slot.ruleId}" has moved to a different version.`);
  }
  if (rule.value !== slot.value || rule.category !== slot.category) {
    return fail(VERIFY_ERRORS.INVALID, `Style Guide rule "${slot.ruleId}" content does not match the approved record.`);
  }
  if (!docTypeCompatible(rule.documentType, slot.documentType, slot.viaCrossType)) {
    return fail(VERIFY_ERRORS.INVALID, `Style Guide rule "${slot.ruleId}" document type does not match.`);
  }
  return OK;
}

/** Verify the visual binding against the live Visual Template record. A
 *  `deterministic_fallback` binding needs no lookup — it claims no
 *  authority. */
async function verifyVisualBinding(db, visual, documentType) {
  if (!visual || visual.source !== 'approved_template') return OK;
  if (typeof visual.templateId !== 'string' || !visual.templateId) {
    return fail(VERIFY_ERRORS.INVALID, 'An approved-template visual binding is missing its templateId.');
  }
  let res;
  try { res = await visualTemplateStore.getTemplate(db, visual.templateId); } catch { res = null; }
  if (!res || !res.ok || !res.data) {
    return fail(VERIFY_ERRORS.INVALID, `Visual Template "${visual.templateId}" does not exist.`);
  }
  const tpl = res.data;
  if (tpl.status !== 'approved') {
    return fail(VERIFY_ERRORS.STALE, `Visual Template "${visual.templateId}" is no longer approved.`);
  }
  if (tpl.templateVersion !== visual.templateVersion) {
    return fail(VERIFY_ERRORS.STALE, `Visual Template "${visual.templateId}" has moved to a different version.`);
  }
  if (tpl.variant !== visual.variant) {
    return fail(VERIFY_ERRORS.INVALID, `Visual Template "${visual.templateId}" variant does not match.`);
  }
  if (!docTypeCompatible(tpl.documentType, documentType, visual.viaCrossType)) {
    return fail(VERIFY_ERRORS.INVALID, `Visual Template "${visual.templateId}" document type does not match.`);
  }
  // geometry / typography / spacing / structural rules must be byte-identical
  // to the approved record — a client cannot smuggle altered geometry behind
  // a real templateId (§14, §29.D).
  if (!deepEqual(tpl.pageModel, visual.pageModel) || !deepEqual(tpl.regions, visual.regions)
    || !deepEqual(tpl.typography, visual.typography) || !deepEqual(tpl.spacing, visual.spacing)
    || !deepEqual(tpl.structuralRules, visual.structuralRules)) {
    return fail(VERIFY_ERRORS.INVALID, `Visual Template "${visual.templateId}" geometry does not match the approved record.`);
  }
  return OK;
}

/**
 * The one entrypoint. `null` (legacy mode — no generation context at all)
 * is always OK. A present-but-structurally-invalid context is rejected
 * before any lookup (§15.2). `documentType` is the SERVER-FIXED document
 * type this draft is for (V2 intake is NOR-only — §8 of Phase 6A); a
 * context claiming a different one is rejected (§8).
 *
 * @param {object} db            Admin SDK database handle
 * @param {object|null} generationContext
 * @param {{ documentType: string }} opts
 * @returns {Promise<{ok:true}|{ok:false, code:string, message:string}>}
 */
async function verifyGenerationContext(db, generationContext, opts) {
  const documentType = (opts && opts.documentType) || 'NOR';
  if (generationContext == null) return OK; // legacy mode — nothing to verify (§4)

  if (!isGenerationContext(generationContext)) {
    return fail(VERIFY_ERRORS.INVALID, 'The generation context is malformed.');
  }
  if (generationContext.retrieval.documentType !== documentType) {
    return fail(VERIFY_ERRORS.INVALID, 'The generation context targets a different document type than this draft.');
  }

  const style = generationContext.style || {};
  const slots = [
    ...Object.values(style.slots || {}),
    ...(Array.isArray(style.terminology) ? style.terminology : []),
  ];
  for (const slot of slots) {
    // eslint-disable-next-line no-await-in-loop
    const r = await verifyStyleSlot(db, slot, documentType);
    if (!r.ok) return r;
  }

  const rv = await verifyVisualBinding(db, generationContext.visual, documentType);
  if (!rv.ok) return rv;

  // §15.4 — a blocked context must carry no authority at all; isGenerationContext
  // already enforces this structurally, but a defence-in-depth restatement
  // here costs nothing and documents the invariant at the call site.
  if (generationContext.blocked === true) {
    const anyCertified = generationContext.style.certifiedRuleIds.length > 0
      || generationContext.visual.source === 'approved_template';
    if (anyCertified) return fail(VERIFY_ERRORS.INVALID, 'A blocked generation context must not bind any certified authority.');
  }

  return OK;
}

module.exports = { VERIFY_ERRORS, verifyGenerationContext };
